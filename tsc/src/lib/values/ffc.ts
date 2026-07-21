// FantasyFootballCalculator ADP ValueSource — redraft.
//
// FFC publishes a free, no-key JSON ADP API aggregated from real mock/live
// drafts (thousands per week in season-prep months):
//   https://fantasyfootballcalculator.com/api/v1/adp/<format>?teams=<n>&year=<y>
// Formats: standard | ppr | half-ppr | 2qb. We pick the one matching the
// league's scoring / superflex, and the team count nearest an FFC-supported
// bracket.
//
// ADP is a preseason DRAFT signal: it updates constantly through the summer
// and then freezes once the season starts and drafts stop. That's fine here.
// It rides in the redraft consensus next to FantasyCalc-Redraft, FantasyPros
// ROS, and ESPN season projections, all of which DO update weekly in season,
// so ADP acts as a strong draft-market anchor while the ROS sources carry the
// in-season freshness. Its consensus weight is set below FantasyCalc to
// reflect that.
//
// ADP → value: lower ADP (earlier pick) = better, so we run ADP through the
// same exponential decay FantasyPros uses for ECR rank. The absolute scale
// does not need to be exact because the consensus orchestrator per-position
// quantile-rescales every non-anchor source onto FantasyCalc's frame; this
// only needs to preserve ordering and rough shape.
//
// Player IDs: FFC doesn't publish Sleeper IDs, so we match by normalized
// name + position against the cached Sleeper /players/nfl dictionary, exactly
// like the KTC and FantasyPros sources.

import { unstable_cache } from 'next/cache'
import { type SleeperPlayer } from '@/lib/platforms/sleeper'
import { getPlayersNflDict } from '@/lib/sleeperPlayers'
import { applyNameAliases } from './nameAliases'
import type { LeagueValuationContext, PlayerValue, ValueSource } from './types'

const FFC_BASE = 'https://fantasyfootballcalculator.com/api/v1/adp'

type FfcPlayer = {
  player_id?: number
  name: string
  position?: string
  team?: string | null
  adp?: number
  bye?: number | null
}
type FfcResponse = { status?: string; players?: FfcPlayer[]; meta?: { total_drafts?: number } }

// FFC is a free public API, always available.
export function isFfcConfigured(): boolean {
  return true
}

function ffcFormat(ctx: LeagueValuationContext): string {
  if (ctx.qbStarters >= 2) return '2qb'
  switch (ctx.scoringProfile) {
    case 'STANDARD':
      return 'standard'
    case 'HALF':
      return 'half-ppr'
    default:
      return 'ppr'
  }
}

// FFC serves ADP for 8/10/12/14-team drafts. Snap the league's team count to
// the nearest supported bracket.
function ffcTeams(teamCount: number): number {
  const brackets = [8, 10, 12, 14]
  let best = 12
  let bestGap = Infinity
  for (const b of brackets) {
    const gap = Math.abs(b - teamCount)
    if (gap < bestGap) {
      bestGap = gap
      best = b
    }
  }
  return best
}

function nameKey(name: string, position?: string | null): string {
  const stripped = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .replace(/[.'`’]/g, '') // punctuation
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

// ADP → value. Same exponential decay FantasyPros uses for ECR rank so the
// pre-rescale shape roughly mirrors the market. ADP ~1 → 10000, ~50 → 4061,
// ~100 → 1647, ~200 → 272.
function adpToValue(adp: number): number {
  if (!Number.isFinite(adp) || adp < 1) return 0
  return Math.max(0, Math.round(10000 * Math.exp(-(adp - 1) / 55)))
}

async function fetchFfc(format: string, teams: number, year: number): Promise<FfcPlayer[]> {
  const url = `${FFC_BASE}/${format}?teams=${teams}&year=${year}`
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
    headers: { 'User-Agent': 'TSC-ManagerHub/1.0 (+https://thesunday.chronicle)' },
  })
  if (!res.ok) throw new Error(`FFC ${url} → ${res.status}`)
  const json = (await res.json()) as FfcResponse
  if (json.status && json.status !== 'Success') return []
  return json.players ?? []
}

// Try the current calendar year first; before a new season's drafts ramp up
// (roughly Jan-May) that year can be empty, so fall back to last year's ADP.
async function fetchFfcWithFallback(format: string, teams: number): Promise<FfcPlayer[]> {
  const year = new Date().getFullYear()
  const current = await fetchFfc(format, teams, year)
  if (current.length > 0) return current
  return fetchFfc(format, teams, year - 1)
}

function cachedFfc(format: string, teams: number): Promise<FfcPlayer[]> {
  return unstable_cache(
    () => fetchFfcWithFallback(format, teams),
    ['ffc-adp', 'v1', format, String(teams)],
    { revalidate: 12 * 60 * 60 },
  )()
}

export const ffcAdpSource: ValueSource = {
  id: 'ffc-adp',
  async valueAll(ctx: LeagueValuationContext): Promise<Map<string, PlayerValue>> {
    const format = ffcFormat(ctx)
    const teams = ffcTeams(ctx.teamCount)

    let entries: FfcPlayer[]
    try {
      entries = await cachedFfc(format, teams)
    } catch {
      // Network / parse failure → empty so consensus falls back to the other
      // redraft sources. The orchestrator surfaces the error in `attempts`.
      return new Map()
    }

    const players = await getPlayersNflDict()
    const lookup = buildSleeperLookup(players)

    const out = new Map<string, PlayerValue>()
    for (const raw of entries) {
      const position = String(raw.position ?? '').toUpperCase()
      if (!['QB', 'RB', 'WR', 'TE'].includes(position)) continue
      if (typeof raw.adp !== 'number' || raw.adp < 1) continue
      const sid = lookup.get(nameKey(raw.name, position))
      if (!sid) continue
      const sleeperRow = players[sid]
      out.set(sid, {
        playerId: sid,
        name: raw.name,
        position,
        team: raw.team ?? sleeperRow?.team ?? null,
        value: adpToValue(raw.adp),
        tier: null,
        age: sleeperRow?.age ?? null,
        yearsExp: sleeperRow?.years_exp ?? null,
        source: 'ffc-adp',
      })
    }
    return out
  },
}
