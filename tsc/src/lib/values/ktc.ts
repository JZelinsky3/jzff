// KeepTradeCut ValueSource — Phase 4 (live).
//
// KTC publishes no documented API. The dynasty-rankings page at
//   https://keeptradecut.com/dynasty-rankings
// embeds the full ranking dataset as a JS variable on the page:
//   var playersArray = [ { playerName, position, team, oneQBValues:{...},
//                          superflexValues:{...}, age, ... }, ... ];
// One page contains BOTH 1QB and Superflex values per player; we pick the
// matching one at row-extract time based on the league's qbStarters.
//
// Cached 12h so we hit KTC at most twice a day per ISR region. Result is
// blended into Consensus and exposed as a single-source toggle on every
// dynasty/keeper league.
//
// Escape hatch: set KTC_VALUES_URL to override the scrape with a custom JSON
// feed (your own snapshot or a community proxy). Useful if KTC ever blocks
// Vercel egress or changes their page structure faster than we patch.
//
// Player IDs: KTC doesn't publish Sleeper IDs, so we match by normalizing
// names against the cached Sleeper /players/nfl dictionary and disambiguating
// by position. Rookie picks (position "PICK") are skipped — they have no
// Sleeper roster entry and the analyzer only trades on rostered players.

import { unstable_cache } from 'next/cache'
import { type SleeperPlayer } from '@/lib/platforms/sleeper'
import { getPlayersNflDict } from '@/lib/sleeperPlayers'
import { applyNameAliases } from './nameAliases'
import type { LeagueValuationContext, PlayerValue, ValueSource } from './types'

const KTC_DYNASTY_URL = 'https://keeptradecut.com/dynasty-rankings'

// Two shapes accepted: KTC's native playersArray shape (scrape path) and a
// flat { name, value } shape (override path, e.g. a hand-curated snapshot).
type RawKTC =
  | { name: string; position?: string; team?: string; value: number; age?: number | null; tier?: string | null }
  | { playerName: string; position?: string; team?: string; oneQBValues?: { value?: number }; superflexValues?: { value?: number }; age?: number | null; tier?: string | null }

// Always available — we scrape the public page by default. The env var only
// switches to a custom feed.
export function isKtcConfigured(): boolean {
  return true
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
    // First write wins — the active player tends to come earlier in the dict
    // than long-retired homonyms. If values for the wrong player surface, the
    // fix is to disambiguate further by team.
    if (!out.has(key)) out.set(key, pid)
  }
  applyNameAliases(out, nameKey)
  return out
}

function extractValue(raw: RawKTC, superflex: boolean): { name: string; position: string; team: string | null; value: number; age: number | null; tier: string | null } | null {
  const r = raw as Record<string, unknown>
  const name = (r['name'] ?? r['playerName']) as string | undefined
  if (!name) return null
  const position = String(r['position'] ?? '').toUpperCase() || '—'
  const team = (r['team'] as string | undefined) ?? null
  const age = (r['age'] as number | null | undefined) ?? null
  const tier = (r['tier'] as string | null | undefined) ?? null

  let value: number | undefined
  if (typeof r['value'] === 'number') value = r['value']
  if (value == null) {
    const sf = (r['superflexValues'] as { value?: number } | undefined)?.value
    const single = (r['oneQBValues'] as { value?: number } | undefined)?.value
    value = superflex ? (sf ?? single) : (single ?? sf)
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return { name, position, team, value: Math.round(value), age, tier }
}

// Extract `var playersArray = [ ... ];` from KTC page HTML. Uses bracket
// matching with quote/escape awareness rather than a regex because the
// embedded array is many KB and contains nested objects, quoted strings,
// and stringified URLs.
function extractPlayersArrayJson(html: string): unknown[] {
  const marker = 'var playersArray'
  const start = html.indexOf(marker)
  if (start === -1) throw new Error('KTC page missing playersArray marker')
  const arrayStart = html.indexOf('[', start)
  if (arrayStart === -1) throw new Error('KTC playersArray opening bracket not found')

  let depth = 0
  let inString: '"' | "'" | null = null
  let escape = false
  let i = arrayStart
  for (; i < html.length; i++) {
    const ch = html[i]
    if (escape) { escape = false; continue }
    if (inString) {
      if (ch === '\\') { escape = true; continue }
      if (ch === inString) inString = null
      continue
    }
    if (ch === '"' || ch === "'") { inString = ch; continue }
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) { i += 1; break }
    }
  }
  if (depth !== 0) throw new Error('KTC playersArray unbalanced brackets')
  const raw = html.slice(arrayStart, i)
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error('KTC playersArray did not parse to an array')
  return parsed
}

async function fetchKtcScrape(): Promise<RawKTC[]> {
  const res = await fetch(KTC_DYNASTY_URL, {
    cache: 'no-store',
    headers: {
      // KTC serves the playersArray to ordinary browsers; a realistic UA is
      // enough. They've historically blocked obvious bot UAs.
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`KTC ${KTC_DYNASTY_URL} → ${res.status}`)
  const html = await res.text()
  return extractPlayersArrayJson(html) as RawKTC[]
}

async function fetchKtcOverride(): Promise<RawKTC[]> {
  const url = process.env.KTC_VALUES_URL!.trim()
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'TSC-ManagerHub/1.0 (+https://thesunday.chronicle)' },
  })
  if (!res.ok) throw new Error(`KTC override ${url} → ${res.status}`)
  const json = await res.json()
  if (!Array.isArray(json)) throw new Error('KTC override returned non-array')
  return json as RawKTC[]
}

function cachedKtc(): Promise<RawKTC[]> {
  const useOverride = Boolean(process.env.KTC_VALUES_URL?.trim())
  return unstable_cache(
    () => (useOverride ? fetchKtcOverride() : fetchKtcScrape()),
    ['ktc-values', 'v2', useOverride ? 'override' : 'scrape'],
    { revalidate: 12 * 60 * 60 },
  )()
}

export const ktcDynastySource: ValueSource = {
  id: 'ktc-dynasty',
  async valueAll(ctx: LeagueValuationContext): Promise<Map<string, PlayerValue>> {
    let entries: RawKTC[]
    try {
      entries = await cachedKtc()
    } catch {
      // Network / parse failure → return empty so consensus falls back to
      // whatever else has values. The orchestrator surfaces the error in
      // `attempts` for the diagnostic UI.
      return new Map()
    }
    const players = await loadPlayersDict()
    const lookup = buildSleeperLookup(players)
    const superflex = ctx.qbStarters >= 2

    const out = new Map<string, PlayerValue>()
    for (const raw of entries) {
      const parsed = extractValue(raw, superflex)
      if (!parsed) continue
      // Picks have position "PICK" / "RDP" — they're not in the Sleeper
      // players dict and won't match. Skip silently.
      if (parsed.position === 'PICK' || parsed.position === 'RDP') continue
      const key = nameKey(parsed.name, parsed.position)
      const sid = lookup.get(key)
      if (!sid) continue
      const sleeperRow = players[sid]
      out.set(sid, {
        playerId: sid,
        name: parsed.name,
        position: parsed.position,
        team: parsed.team ?? sleeperRow?.team ?? null,
        value: parsed.value,
        tier: parsed.tier,
        age: parsed.age ?? sleeperRow?.age ?? null,
        yearsExp: sleeperRow?.years_exp ?? null,
        source: 'ktc-dynasty',
      })
    }
    return out
  },
}
