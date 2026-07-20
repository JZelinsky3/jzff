// FantasyCalc ValueSource — Phase 4.
//
// FantasyCalc publishes a free JSON values endpoint at api.fantasycalc.com
// and — critically — returns Sleeper player IDs in every row, so matching
// against league rosters is a direct key lookup with no name normalization.
//
// Endpoint:
//   GET https://api.fantasycalc.com/values/current
//     ?isDynasty=<bool>&numQbs=<1|2>&numTeams=<8..16>&ppr=1
//
// Two variants of this source are exported because dynasty and redraft are
// produced by different query parameters, not different scoring of the same
// payload. The orchestrator picks one based on league mode.

import { unstable_cache } from 'next/cache'
import type { LeagueValuationContext, PlayerValue, ValueSource } from './types'

const BASE = 'https://api.fantasycalc.com/values/current'

type FCEntry = {
  player: {
    id: number
    name: string
    mflId?: string
    sleeperId?: string
    fleaflickerId?: string
    position?: string
    maybeAge?: number | null
    maybeYoe?: number | null
    maybeTeam?: string | null
  }
  value: number
  overallRank?: number
  positionRank?: number
  redraftValue?: number
  redraftOverallRank?: number
  combinedValue?: number
}

async function fetchValues(isDynasty: boolean, numQbs: number, numTeams: number, ppr: number): Promise<FCEntry[]> {
  const url = `${BASE}?isDynasty=${isDynasty}&numQbs=${numQbs}&numTeams=${numTeams}&ppr=${ppr}`
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'TSC-ManagerHub/1.0 (+https://thesunday.chronicle)' },
  })
  if (!res.ok) throw new Error(`FantasyCalc ${url} → ${res.status}`)
  const json = (await res.json()) as FCEntry[]
  if (!Array.isArray(json)) throw new Error('FantasyCalc returned non-array')
  return json
}

// Cache 12h. FC updates daily; 12h is the freshness/cost sweet spot.
function cachedFetch(isDynasty: boolean, numQbs: number, numTeams: number, ppr: number): Promise<FCEntry[]> {
  return unstable_cache(
    () => fetchValues(isDynasty, numQbs, numTeams, ppr),
    ['fantasycalc-values', 'v2', String(isDynasty), String(numQbs), String(numTeams), String(ppr)],
    { revalidate: 12 * 60 * 60 },
  )()
}

// FC's API accepts ppr=0 / 0.5 / 1 (verified live 2026-07-19). Leagues that
// never set a scoring profile keep the historical PPR default.
function pprParam(profile: LeagueValuationContext['scoringProfile']): number {
  if (profile === 'STANDARD') return 0
  if (profile === 'HALF') return 0.5
  return 1
}

function clampNumTeams(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 12
  if (n < 8) return 8
  if (n > 16) return 16
  return Math.round(n)
}

function normalizeQbs(qbStarters: number): 1 | 2 {
  return qbStarters >= 2 ? 2 : 1
}

// FC values are already on a roughly 0..10000 scale; we keep them as-is so
// the trade-builder sees the canonical FC numbers (matches what people see
// on the FantasyCalc site, which builds user trust).
function entryToValue(e: FCEntry, scoreField: 'dynasty' | 'redraft', dynastyAware: boolean): PlayerValue | null {
  const sid = e.player.sleeperId
  if (!sid) return null
  const rawValue = scoreField === 'dynasty' ? e.value : (e.redraftValue ?? e.value)
  if (!Number.isFinite(rawValue) || rawValue <= 0) return null
  const position = e.player.position ?? '—'
  const tier = e.positionRank != null ? `${position}${tierBucket(e.positionRank)}` : null
  return {
    playerId: sid,
    name: e.player.name,
    position,
    team: e.player.maybeTeam ?? null,
    value: Math.round(rawValue),
    tier,
    age: e.player.maybeAge ?? null,
    yearsExp: e.player.maybeYoe ?? null,
    source: dynastyAware ? 'fantasycalc-dynasty' : 'fantasycalc-redraft',
  }
}

function tierBucket(rank: number): number {
  if (rank <= 12) return 1
  if (rank <= 24) return 2
  if (rank <= 36) return 3
  return 4
}

export const fantasyCalcDynastySource: ValueSource = {
  id: 'fantasycalc-dynasty',
  async valueAll(ctx: LeagueValuationContext): Promise<Map<string, PlayerValue>> {
    const entries = await cachedFetch(true, normalizeQbs(ctx.qbStarters), clampNumTeams(ctx.teamCount), pprParam(ctx.scoringProfile))
    const out = new Map<string, PlayerValue>()
    for (const e of entries) {
      const v = entryToValue(e, 'dynasty', true)
      if (v) out.set(v.playerId, v)
    }
    return out
  },
}

export const fantasyCalcRedraftSource: ValueSource = {
  id: 'fantasycalc-redraft',
  async valueAll(ctx: LeagueValuationContext): Promise<Map<string, PlayerValue>> {
    const entries = await cachedFetch(false, normalizeQbs(ctx.qbStarters), clampNumTeams(ctx.teamCount), pprParam(ctx.scoringProfile))
    const out = new Map<string, PlayerValue>()
    for (const e of entries) {
      const v = entryToValue(e, 'redraft', false)
      if (v) out.set(v.playerId, v)
    }
    return out
  },
}
