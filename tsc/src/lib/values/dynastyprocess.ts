// DynastyProcess ValueSource — Phase 4 (live).
//
// DynastyProcess publishes a free, frequently-updated CSV of dynasty values
// in their public GitHub repo:
//   https://github.com/dynastyprocess/data/raw/master/files/values-players.csv
//
// Columns:
//   player, pos, team, age, draft_year, ecr_1qb, ecr_2qb, ecr_pos,
//   value_1qb, value_2qb, scrape_date, fp_id
//
// We pick value_1qb or value_2qb based on the league's qbStarters. DP doesn't
// publish Sleeper IDs (they use FantasyPros IDs), so matching goes through
// the same name normalization pass the KTC source uses.
//
// Cached 12h. Failure → empty map, orchestrator falls through to whatever
// other sources have data.

import { unstable_cache } from 'next/cache'
import { type SleeperPlayer } from '@/lib/platforms/sleeper'
import { getPlayersNflDict } from '@/lib/sleeperPlayers'
import { applyNameAliases } from './nameAliases'
import type { LeagueValuationContext, PlayerValue, ValueSource } from './types'

const DP_URL = 'https://github.com/dynastyprocess/data/raw/master/files/values-players.csv'

type DPRow = {
  player: string
  pos: string
  team: string
  age: number | null
  value_1qb: number | null
  value_2qb: number | null
}

async function loadPlayersDict(): Promise<Record<string, SleeperPlayer>> {
  // Full dict is ~16MB JSON — over unstable_cache's 2MB entry limit, which
  // hard-errors the response on current Next. Shared in-memory cache
  // instead (see sleeperPlayers.ts).
  return getPlayersNflDict()
}

function nameKey(name: string, position?: string | null): string {
  const stripped = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // diacritics
    .replace(/[.'`’]/g, '')             // punctuation
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return `${stripped}|${(position ?? '').toUpperCase()}`
}

function buildSleeperLookup(players: Record<string, SleeperPlayer>): Map<string, string> {
  const out = new Map<string, string>()
  for (const [pid, p] of Object.entries(players)) {
    const full = p.full_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
    if (!full) continue
    const key = nameKey(full, p.position ?? '')
    if (!out.has(key)) out.set(key, pid)
  }
  applyNameAliases(out, nameKey)
  return out
}

// Tiny CSV row parser — handles quoted fields with embedded commas. DP's CSV
// is well-formed (no newlines inside quoted fields) so a row-at-a-time split
// is safe.
function parseCsvRow(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } // escaped quote
        else { inQuotes = false }
      } else {
        cur += c
      }
    } else {
      if (c === ',') { out.push(cur); cur = '' }
      else if (c === '"' && cur === '') { inQuotes = true }
      else { cur += c }
    }
  }
  out.push(cur)
  return out
}

function parseCsv(text: string): DPRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length < 2) return []
  const header = parseCsvRow(lines[0]).map((h) => h.trim())
  const col = (name: string) => header.indexOf(name)
  const iPlayer = col('player')
  const iPos = col('pos')
  const iTeam = col('team')
  const iAge = col('age')
  const iV1 = col('value_1qb')
  const iV2 = col('value_2qb')
  if (iPlayer < 0 || iPos < 0 || iV1 < 0 || iV2 < 0) {
    throw new Error(`DynastyProcess CSV missing expected columns (got: ${header.join(',')})`)
  }
  const num = (s: string | undefined): number | null => {
    if (s == null || s === '' || s === 'NA') return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  const rows: DPRow[] = []
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvRow(lines[r])
    if (cells.length < header.length - 2) continue // tolerate slight ragged tail
    rows.push({
      player: cells[iPlayer],
      pos: cells[iPos],
      team: cells[iTeam] ?? '',
      age: num(cells[iAge]),
      value_1qb: num(cells[iV1]),
      value_2qb: num(cells[iV2]),
    })
  }
  return rows
}

async function fetchDpCsv(): Promise<DPRow[]> {
  const res = await fetch(DP_URL, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'TSC-ManagerHub/1.0 (+https://thesunday.chronicle)',
      'Accept': 'text/csv,text/plain,*/*',
    },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`DynastyProcess ${DP_URL} → ${res.status}`)
  const text = await res.text()
  return parseCsv(text)
}

function cachedDp(): Promise<DPRow[]> {
  return unstable_cache(
    fetchDpCsv,
    ['dynastyprocess-values', 'v1'],
    { revalidate: 12 * 60 * 60 },
  )()
}

// Always available — public CSV, no env needed.
export function isDynastyProcessConfigured(): boolean {
  return true
}

export const dynastyProcessSource: ValueSource = {
  id: 'dynastyprocess',
  async valueAll(ctx: LeagueValuationContext): Promise<Map<string, PlayerValue>> {
    let rows: DPRow[]
    try {
      rows = await cachedDp()
    } catch {
      return new Map()
    }
    const players = await loadPlayersDict()
    const lookup = buildSleeperLookup(players)
    const superflex = ctx.qbStarters >= 2

    const out = new Map<string, PlayerValue>()
    for (const row of rows) {
      const value = superflex ? row.value_2qb : row.value_1qb
      if (value == null || value <= 0) continue
      const position = (row.pos ?? '').toUpperCase()
      // Skip picks if DP ever adds them (the players CSV is typically players-
      // only, but defense in depth).
      if (position === 'PICK' || position === 'RDP') continue
      const key = nameKey(row.player, position)
      const sid = lookup.get(key)
      if (!sid) continue
      const sleeperRow = players[sid]
      out.set(sid, {
        playerId: sid,
        name: row.player,
        position,
        team: row.team || sleeperRow?.team || null,
        value: Math.round(value),
        tier: null,
        age: row.age ?? sleeperRow?.age ?? null,
        yearsExp: sleeperRow?.years_exp ?? null,
        source: 'dynastyprocess',
      })
    }
    return out
  },
}
