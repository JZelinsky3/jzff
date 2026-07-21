// Sleeper/RotoWire projections ValueSource — the in-season workhorse.
//
// Sleeper's projections feed (see projections.ts) is RotoWire-backed,
// season-long, and — critically for a trade analyzer used week to week — it
// REPRICES IN SEASON as roles, injuries, and form change. Unlike ADP or draft
// rankings (which freeze once drafts stop), this keeps moving through the
// trade-deadline stretch, which is when almost all trades actually happen.
//
// Rows are keyed by native Sleeper player_id, so there's zero name-matching
// fragility. We turn projected SEASON TOTAL points (durability included, not
// just rate) into a value; the consensus orchestrator then per-position
// quantile-rescales it onto FantasyCalc's frame, so the raw points scale is
// normalized before blending.
//
// Redraft/keeper-shaped: this prices current-season production, so it feeds
// the redraft consensus pool. It scores by the league's reception setting
// (PPR / half / standard) via the shared projections cache.

import { getPlayersNflDict } from '@/lib/sleeperPlayers'
import { getProjectionsForYear, totalPointsFor } from './projections'
import type { LeagueValuationContext, PlayerValue, ValueSource } from './types'

// Always available — same free Sleeper feed the lineup projections already use.
export function isSleeperProjectionsConfigured(): boolean {
  return true
}

const scoringName = (p: LeagueValuationContext['scoringProfile']): string =>
  p === 'STANDARD' ? 'STANDARD' : p === 'HALF' ? 'HALF' : 'PPR'

export const sleeperProjectionsSource: ValueSource = {
  id: 'sleeper-projections',
  async valueAll(ctx: LeagueValuationContext): Promise<Map<string, PlayerValue>> {
    const year = new Date().getFullYear()
    const [map, players] = await Promise.all([getProjectionsForYear(year), getPlayersNflDict()])
    if (map.rowCount === 0) return new Map()

    const scoring = scoringName(ctx.scoringProfile)
    const out = new Map<string, PlayerValue>()
    for (const pid of Object.keys(map.totalByPid)) {
      const total = totalPointsFor(pid, scoring, map)
      if (total <= 0) continue
      const p = players[pid]
      const position = (p?.position ?? '').toUpperCase()
      if (!['QB', 'RB', 'WR', 'TE'].includes(position)) continue
      out.set(pid, {
        playerId: pid,
        name: p?.full_name ?? (`${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || pid),
        position,
        team: p?.team ?? null,
        // Raw projected season points; rescaled onto the anchor's frame later.
        value: Math.round(total),
        tier: null,
        age: p?.age ?? null,
        yearsExp: p?.years_exp ?? null,
        source: 'sleeper-projections',
      })
    }
    return out
  },
}
