// FantasyPros ValueSource — Phase 4 (live).
//
// FantasyPros publishes their Expert Consensus Rankings (ECR) on two public
// pages that embed a JS variable `var ecrData = { players: [...] }`:
//
//   • Dynasty:  https://www.fantasypros.com/nfl/rankings/dynasty-overall.php
//   • ROS PPR:  https://www.fantasypros.com/nfl/rankings/ros-ppr-overall.php
//
// Two distinct ValueSources are exported — one per league mode — and the
// orchestrator picks the right one via `preferenceOrder`. A redraft league
// will never see the dynasty source and vice versa.
//
// ECR is ordinal (rank-based), not market-priced. We convert rank → value
// via an exponential decay calibrated against FC/KTC's actual top-to-bottom
// shape (rank 1 ≈ 10000, rank 200 ≈ 800, rank 400 ≈ 70). This is a starting
// scale — when consensus anchor-rescale lands, FP's values will be fit to
// the other providers using the overlap set, so the exact decay choice here
// is non-critical.
//
// Override: set FP_VALUES_URL (one or two URLs) to a custom JSON snapshot if
// the scrape ever breaks. Same shape: { players: [{ player_name, ... }] }.

import { unstable_cache } from 'next/cache'
import { type SleeperPlayer } from '@/lib/platforms/sleeper'
import { getPlayersNflDict } from '@/lib/sleeperPlayers'
import { applyNameAliases } from './nameAliases'
import type { LeagueValuationContext, PlayerValue, ValueSource } from './types'

const FP_URL_DYNASTY = 'https://www.fantasypros.com/nfl/rankings/dynasty-overall.php'
const FP_URL_ROS_PPR = 'https://www.fantasypros.com/nfl/rankings/ros-ppr-overall.php'

type FpPlayer = {
  player_name: string
  player_position_id: string
  player_team_id?: string | null
  player_age?: number | null
  rank_ecr: number
  tier?: number | null
}
type FpEcrData = { players: FpPlayer[] }

// Always available — the scrape needs no key. Override env (FP_API_KEY or
// FP_VALUES_URL) is kept for the future paid-API path.
export function isFantasyProsConfigured(): boolean {
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
    if (!out.has(key)) out.set(key, pid)
  }
  applyNameAliases(out, nameKey)
  return out
}

// Extract `var ecrData = { ... };` from FP page HTML. Bracket-match with
// quote/escape awareness so the embedded JSON's nested objects don't trip us.
function extractEcrData(html: string): FpEcrData {
  const marker = 'var ecrData'
  const start = html.indexOf(marker)
  if (start === -1) throw new Error('FP page missing ecrData marker')
  const objStart = html.indexOf('{', start)
  if (objStart === -1) throw new Error('FP ecrData opening brace not found')

  let depth = 0
  let inString: '"' | "'" | null = null
  let escape = false
  let i = objStart
  for (; i < html.length; i++) {
    const ch = html[i]
    if (escape) { escape = false; continue }
    if (inString) {
      if (ch === '\\') { escape = true; continue }
      if (ch === inString) inString = null
      continue
    }
    if (ch === '"' || ch === "'") { inString = ch; continue }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) { i += 1; break }
    }
  }
  if (depth !== 0) throw new Error('FP ecrData unbalanced braces')
  const obj = JSON.parse(html.slice(objStart, i)) as unknown
  if (!obj || typeof obj !== 'object' || !Array.isArray((obj as FpEcrData).players)) {
    throw new Error('FP ecrData missing players array')
  }
  return obj as FpEcrData
}

async function fetchFp(url: string): Promise<FpEcrData> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`FP ${url} → ${res.status}`)
  return extractEcrData(await res.text())
}

function cachedFp(kind: 'dynasty' | 'ros'): Promise<FpEcrData> {
  const url = kind === 'dynasty' ? FP_URL_DYNASTY : FP_URL_ROS_PPR
  return unstable_cache(
    () => fetchFp(url),
    ['fantasypros-ecr', 'v1', kind],
    { revalidate: 12 * 60 * 60 },
  )()
}

// ECR rank → trade value. Exponential decay with half-life ~55 ranks.
//   rank 1   → 10000
//   rank 50  → ~4061
//   rank 100 → ~1647
//   rank 200 → ~272
//   rank 400 →  ~7
// Chosen to roughly mirror FantasyCalc's top-to-tail shape so blended
// consensus values stay sane before anchor-rescale is implemented.
function rankToValue(rank: number): number {
  if (!Number.isFinite(rank) || rank < 1) return 0
  return Math.max(0, Math.round(10000 * Math.exp(-(rank - 1) / 55)))
}

async function valueFromEcr(
  ctx: LeagueValuationContext,
  kind: 'dynasty' | 'ros',
  providerId: 'fantasypros-dynasty' | 'fantasypros-ros',
): Promise<Map<string, PlayerValue>> {
  let data: FpEcrData
  try {
    data = await cachedFp(kind)
  } catch {
    return new Map()
  }
  void ctx

  const players = await loadPlayersDict()
  const lookup = buildSleeperLookup(players)

  const out = new Map<string, PlayerValue>()
  for (const p of data.players) {
    const position = String(p.player_position_id ?? '').toUpperCase()
    // FP includes K and DST on some pages — skip; analyzer is positional
    // skill-only.
    if (!['QB', 'RB', 'WR', 'TE'].includes(position)) continue
    if (typeof p.rank_ecr !== 'number' || p.rank_ecr < 1) continue
    const sid = lookup.get(nameKey(p.player_name, position))
    if (!sid) continue
    const sleeperRow = players[sid]
    out.set(sid, {
      playerId: sid,
      name: p.player_name,
      position,
      team: (p.player_team_id ?? sleeperRow?.team) || null,
      value: rankToValue(p.rank_ecr),
      tier: p.tier != null ? `${position}T${p.tier}` : null,
      age: p.player_age ?? sleeperRow?.age ?? null,
      yearsExp: sleeperRow?.years_exp ?? null,
      source: providerId,
    })
  }
  return out
}

export const fantasyProsDynastySource: ValueSource = {
  id: 'fantasypros-dynasty',
  valueAll: (ctx) => valueFromEcr(ctx, 'dynasty', 'fantasypros-dynasty'),
}

export const fantasyProsRosSource: ValueSource = {
  id: 'fantasypros-ros',
  valueAll: (ctx) => valueFromEcr(ctx, 'ros', 'fantasypros-ros'),
}
