// Typed Sleeper API client. No auth required — Sleeper exposes everything publicly
// once you have the league_id. Walks `previous_league_id` to traverse history.

const BASE = 'https://api.sleeper.app/v1'

export type SleeperLeague = {
  league_id: string
  name: string
  season: string
  previous_league_id: string | null
  status: string
  total_rosters: number
  settings: {
    leg?: number
    playoff_week_start?: number
    divisions?: number
    [k: string]: unknown
  }
  metadata?: {
    [k: string]: string | undefined
    // division_1, division_2, ... contain the division names when set
  }
  scoring_settings?: Record<string, number>
}

// Pull division info out of a league payload.
// Sleeper stores division count under settings.divisions and per-division
// display names under metadata.division_1, division_2, etc.
export function parseDivisionInfo(league: SleeperLeague): { count: number; names: string[] } {
  const count = Math.min(4, Math.max(0, Number(league.settings?.divisions ?? 0)))
  const names: string[] = []
  for (let i = 1; i <= count; i++) {
    const key = `division_${i}`
    const n = league.metadata?.[key]
    names.push(n && n.trim() ? n.trim() : `Division ${i}`)
  }
  return { count, names }
}

export type SleeperUser = {
  user_id: string
  display_name: string
  avatar: string | null
  metadata?: {
    team_name?: string
    avatar?: string // sometimes a full URL
  }
}

export type SleeperRoster = {
  roster_id: number
  owner_id: string | null
  settings: {
    wins?: number
    losses?: number
    ties?: number
    fpts?: number
    fpts_decimal?: number
    fpts_against?: number
    fpts_against_decimal?: number
    division?: number
  }
}

export type SleeperMatchup = {
  matchup_id: number | null
  roster_id: number
  points: number | null
  starters?: string[]
  players?: string[]
}

export type SleeperDraft = {
  draft_id: string
  status: string
  type: string // 'snake' | 'auction' | 'linear'
  season: string
  settings?: { rounds?: number; teams?: number }
}

export type SleeperPick = {
  pick_no: number
  round: number
  draft_slot: number
  picked_by: string // user_id
  roster_id: number | null
  player_id: string
  metadata?: {
    first_name?: string
    last_name?: string
    position?: string
    team?: string
  }
}

// Sleeper transactions cover trades, waivers, FAAB, commissioner moves.
// For the trade grader we filter type === 'trade' && status === 'complete'.
// adds/drops map player_id -> roster_id (receiver/dropper).
export type SleeperTransaction = {
  type: 'trade' | 'waiver' | 'free_agent' | 'commissioner'
  transaction_id: string
  status: string
  status_updated: number
  week: number
  roster_ids: number[]
  adds: Record<string, number> | null
  drops: Record<string, number> | null
  draft_picks: Array<{
    season: string
    round: number
    roster_id: number          // current owner (after the trade) — same as owner_id for normal trades
    previous_owner_id: number  // who held the pick before this trade
    owner_id: number           // who holds it after
  }>
  waiver_budget: Array<{ sender: number; receiver: number; amount: number }>
  consenter_ids: number[] | null
  created: number
  leg: number
}

// Sleeper's full NFL player dictionary (~5MB). Keyed by player_id.
// We fetch this once per ingest run for trade enrichment.
export type SleeperPlayer = {
  player_id: string
  full_name?: string
  first_name?: string
  last_name?: string
  position?: string
  team?: string | null
}

export type SleeperBracketMatch = {
  r: number // round
  m: number // match number
  t1?: number | { w?: number; l?: number }
  t2?: number | { w?: number; l?: number }
  w?: number // winner roster_id
  l?: number // loser roster_id
  p?: number // place (e.g. 1 = championship)
}

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' })
  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error(`Sleeper ${path} -> ${res.status}`)
  }
  return (await res.json()) as T
}

export const sleeper = {
  league: (id: string) => getJson<SleeperLeague>(`/league/${id}`),
  users: (id: string) => getJson<SleeperUser[]>(`/league/${id}/users`),
  rosters: (id: string) => getJson<SleeperRoster[]>(`/league/${id}/rosters`),
  matchups: (id: string, week: number) =>
    getJson<SleeperMatchup[]>(`/league/${id}/matchups/${week}`),
  drafts: (id: string) => getJson<SleeperDraft[]>(`/league/${id}/drafts`),
  draftPicks: (draftId: string) => getJson<SleeperPick[]>(`/draft/${draftId}/picks`),
  winnersBracket: (id: string) =>
    getJson<SleeperBracketMatch[]>(`/league/${id}/winners_bracket`),
  transactions: (id: string, week: number) =>
    getJson<SleeperTransaction[]>(`/league/${id}/transactions/${week}`),
  // Big payload (~5MB). Cache the result; do not call per-trade.
  playersNfl: () => getJson<Record<string, SleeperPlayer>>('/players/nfl'),
}

// Walks `previous_league_id` back from the user's submitted league to build
// the full chronological list of seasons (oldest -> newest).
export async function fetchLeagueHistory(startLeagueId: string): Promise<SleeperLeague[]> {
  const chain: SleeperLeague[] = []
  let cursor: string | null = startLeagueId
  let guard = 0
  while (cursor && guard < 30) {
    const lg = await sleeper.league(cursor)
    if (!lg) break
    chain.push(lg)
    cursor = lg.previous_league_id && lg.previous_league_id !== '0' ? lg.previous_league_id : null
    guard++
  }
  return chain.reverse() // oldest first
}

// Sleeper avatar field is either a CDN slug or a full URL (in metadata.avatar).
export function avatarUrl(user: SleeperUser): string | null {
  if (user.metadata?.avatar?.startsWith('http')) return user.metadata.avatar
  if (user.avatar) return `https://sleepercdn.com/avatars/${user.avatar}`
  return null
}

// Sum fpts + fpts_decimal into a single number (Sleeper splits points).
export function rosterPoints(r: SleeperRoster, kind: 'for' | 'against'): number {
  const whole = (kind === 'for' ? r.settings.fpts : r.settings.fpts_against) ?? 0
  const dec = (kind === 'for' ? r.settings.fpts_decimal : r.settings.fpts_against_decimal) ?? 0
  return whole + dec / 100
}

// From the winners_bracket, return { championRoster, runnerUpRoster } if discoverable.
export function deriveChampions(bracket: SleeperBracketMatch[] | null): {
  championRosterId: number | null
  runnerUpRosterId: number | null
} {
  if (!bracket || bracket.length === 0) return { championRosterId: null, runnerUpRosterId: null }
  // The match with p === 1 is the championship game. Fall back to highest round if p is missing.
  const championship =
    bracket.find((m) => m.p === 1) ??
    bracket.reduce((best, m) => (m.r > best.r ? m : best), bracket[0])
  return {
    championRosterId: championship.w ?? null,
    runnerUpRosterId: championship.l ?? null,
  }
}

// Build rosterId -> final_rank from a Sleeper winners_bracket. Each placement
// match has `p` (the higher of the two ranks being decided): p=1 is the
// championship (winner→1, loser→2), p=3 is the 3rd-place game (winner→3,
// loser→4), etc. Returns a Map only for rosters with a derived placement.
export function deriveBracketPlacements(
  bracket: SleeperBracketMatch[] | null
): Map<number, number> {
  const out = new Map<number, number>()
  if (!bracket || bracket.length === 0) return out
  for (const m of bracket) {
    if (m.p == null) continue
    if (m.w != null) out.set(m.w, m.p)
    if (m.l != null) out.set(m.l, m.p + 1)
  }
  return out
}

// Limit concurrent fetches so we don't hammer Sleeper.
export async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = []
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}
