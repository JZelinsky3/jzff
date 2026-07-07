// Pickems → matchup badge derivation.
//
// Joins each Sunday Live matchup with its pickems counterpart by team name,
// counts votes from every submitted profile for the current week, and decides
// which badge variant to render:
//   · split          — generic, "47/53"
//   · coin-flip      — 45-55% (no clear favorite)
//   · upset-alert    — < 40% pick rate AND that side is currently leading
//   · consensus-cold — ≥ 80% pick rate AND consensus side is currently losing
// Failures (no pickems, week mismatch, name match miss) silently no-op.

import { getPickemsState } from '@/lib/pickems'
import type { PickemsBadge, SlMatchup } from './types'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export async function attachPickems(slug: string, matchups: SlMatchup[]): Promise<void> {
  const state = await getPickemsState(slug).catch(() => null)
  if (!state || state.status !== 'ok') return

  const wk = state.weeks.find((w) => String(w.week) === state.currentWeekId || w.is_current)
  if (!wk) return

  // Vote tally per pickems matchup_id, keeping who voted which way.
  type Tally = {
    aVotes: number
    bVotes: number
    managerAId: string
    managerBId: string
    aNames: string[]
    bNames: string[]
  }
  const tallies = new Map<string, Tally>()
  for (const m of wk.matchups) {
    tallies.set(m.id, { aVotes: 0, bVotes: 0, managerAId: m.home, managerBId: m.away, aNames: [], bNames: [] })
  }
  const nameByProfile = new Map(state.profiles.map((p) => [p.profileId, p.name]))
  for (const [profileId, byWeek] of Object.entries(state.submissions)) {
    const sub = byWeek[wk.id]
    if (!sub) continue
    const voter = nameByProfile.get(profileId) ?? null
    for (const [mid, picked] of Object.entries(sub.picks)) {
      const t = tallies.get(mid)
      if (!t) continue
      if (picked === t.managerAId) {
        t.aVotes++
        if (voter) t.aNames.push(voter)
      } else if (picked === t.managerBId) {
        t.bVotes++
        if (voter) t.bNames.push(voter)
      }
    }
  }

  // Build a name → pickems matchup lookup. Each pickems matchup is keyed by an
  // unordered team-name pair so we can match Sunday Live's (a, b) ordering in
  // either direction.
  type LookupEntry = { pickMatchupId: string; tally: Tally; teamA: string; teamB: string }
  const byNamePair = new Map<string, LookupEntry>()
  for (const m of wk.matchups) {
    const teamA = state.teams[m.home]?.name ?? ''
    const teamB = state.teams[m.away]?.name ?? ''
    const key = [norm(teamA), norm(teamB)].sort().join('|')
    const tally = tallies.get(m.id)
    if (!tally) continue
    byNamePair.set(key, { pickMatchupId: m.id, tally, teamA, teamB })
  }

  for (const sm of matchups) {
    const key = [norm(sm.a.teamName), norm(sm.b.teamName)].sort().join('|')
    const found = byNamePair.get(key)
    if (!found) continue
    const total = found.tally.aVotes + found.tally.bVotes
    if (total === 0) continue
    // Which side of the pickems matchup is the SUNDAY-LIVE side a?
    const aMatchesPickemsHome = norm(sm.a.teamName) === norm(found.teamA)
    const pctA = aMatchesPickemsHome
      ? (found.tally.aVotes / total) * 100
      : (found.tally.bVotes / total) * 100
    sm.pickems = decideVariant(pctA, total, sm)
    sm.pickems.votersA = aMatchesPickemsHome ? found.tally.aNames : found.tally.bNames
    sm.pickems.votersB = aMatchesPickemsHome ? found.tally.bNames : found.tally.aNames
  }
}

// Exported for the demo synthesizer, which fabricates ballots but wants the
// exact same variant rules.
export function decideVariant(pctA: number, totalVotes: number, m: SlMatchup): PickemsBadge {
  const winningSide: 'a' | 'b' | null =
    m.a.score > m.b.score ? 'a' : m.b.score > m.a.score ? 'b' : null
  const consensusSide = pctA >= 50 ? 'a' : 'b'
  const underdogSide = consensusSide === 'a' ? 'b' : 'a'

  // CONSENSUS COLD — strong pick, but losing
  if (Math.max(pctA, 100 - pctA) >= 80 && winningSide && winningSide !== consensusSide) {
    return { pctA, totalVotes, variant: 'consensus-cold' }
  }
  // UPSET ALERT — underdog (< 40% picked) is currently leading
  if (Math.min(pctA, 100 - pctA) < 40 && winningSide === underdogSide) {
    return { pctA, totalVotes, variant: 'upset-alert', underdogLeading: true }
  }
  // COIN FLIP — 45/55 split
  if (Math.abs(pctA - 50) < 5) {
    return { pctA, totalVotes, variant: 'coin-flip' }
  }
  return { pctA, totalVotes, variant: 'split' }
}
