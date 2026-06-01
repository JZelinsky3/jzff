// Scout orchestrator — Phase 3.5.
//
// Combines TradeFloor + value engine + position-needs + recommendations into
// a single server-side report the Scout chapter renders without further DB
// or API calls. Same data feeds that drive the Trade Desk (Sleeper-only for
// now); ESPN / NFL.com / Yahoo surface as unsupported.

import { valuateLeague } from '@/lib/values'
import { computeNeeds, buildRecommendations, TRACKED_POSITIONS, type RosterNeeds, type TradeRecommendation, type TrackedPosition } from '@/lib/values/needs'
import type { BuilderLeague, BuilderPlayer, BuilderRoster } from './builder-types'
import { loadTradeFloor } from './tradeFloor'
import type { DeskUnsupported } from './desk'

import type { LeagueMode } from '@/lib/values'

const MODE_LABEL: Record<LeagueMode, string> = {
  dynasty: 'Dynasty',
  redraft: 'Redraft',
  keeper: 'Keeper',
}

export type ScoutLeague = {
  builderLeague: BuilderLeague
  needs: RosterNeeds                       // MY needs in this league
  recommendations: TradeRecommendation[]
}

export type ScoutReport = {
  chronicle: { id: string; slug: string; displayName: string }
  leagues: ScoutLeague[]
  unsupported: DeskUnsupported[]
  errors: string[]
  // Cross-league rollups.
  totals: {
    leagues: number
    weakSpots: number          // count of THIN/CRITICAL ratings across all leagues
    strongSpots: number        // count of STRONG/ELITE ratings
    recommendations: number
  }
}

export async function loadScoutReport(slug: string, ownerId: string): Promise<ScoutReport | null> {
  const floor = await loadTradeFloor(slug, ownerId)
  if (!floor) return null

  const leagues: ScoutLeague[] = await Promise.all(
    floor.leagues.map(async (lg) => {
      const valuation = await valuateLeague({ mode: lg.mode, qbStarters: lg.qbStarters, teamCount: lg.teamCount })
      const rosters: BuilderRoster[] = lg.rosters.map((r) => {
        const players: BuilderPlayer[] = r.playerIds
          .map((pid) => {
            const v = valuation.values.get(pid)
            if (!v) return null
            return {
              playerId: pid,
              name: v.name,
              position: v.position,
              team: v.team,
              value: v.value,
              tier: v.tier,
              age: v.age,
            }
          })
          .filter((p): p is BuilderPlayer => p !== null)
          .sort((a, b) => b.value - a.value)
        return {
          ownerId: r.ownerId,
          teamName: r.teamName ?? r.ownerName,
          ownerName: r.ownerName,
          isMe: r.isMe,
          players,
          totalValue: players.reduce((s, p) => s + p.value, 0),
        }
      })
      const builderLeague: BuilderLeague = {
        archiveLeagueId: lg.archiveLeagueId,
        leagueName: lg.leagueName,
        leagueSlug: lg.leagueSlug,
        season: lg.season,
        mode: lg.mode,
        modeLabel: MODE_LABEL[lg.mode],
        valueProviderLabel: valuation.providerLabel,
        myOwnerId: lg.myOwnerId,
        qbStarters: lg.qbStarters,
        teamCount: lg.teamCount,
        rosters,
      }
      const needsMap = computeNeeds(builderLeague)
      const myNeeds = needsMap.get(lg.myOwnerId)
      const recommendations = buildRecommendations(builderLeague, needsMap, lg.archiveLeagueId)
      return {
        builderLeague,
        needs: myNeeds ?? { ownerId: lg.myOwnerId, ratings: emptyRatings() },
        recommendations,
      }
    }),
  )

  leagues.sort((a, b) => a.builderLeague.leagueName.localeCompare(b.builderLeague.leagueName))

  let weakSpots = 0
  let strongSpots = 0
  let totalRecs = 0
  for (const lg of leagues) {
    for (const pos of TRACKED_POSITIONS) {
      const r = lg.needs.ratings[pos]
      if (r.tier === 'thin' || r.tier === 'critical') weakSpots += 1
      if (r.tier === 'strong' || r.tier === 'elite') strongSpots += 1
    }
    totalRecs += lg.recommendations.length
  }

  return {
    chronicle: floor.chronicle,
    leagues,
    unsupported: floor.unsupported,
    errors: floor.errors,
    totals: { leagues: leagues.length, weakSpots, strongSpots, recommendations: totalRecs },
  }
}

function emptyRatings(): RosterNeeds['ratings'] {
  const r = {} as RosterNeeds['ratings']
  for (const pos of TRACKED_POSITIONS) {
    r[pos] = {
      position: pos as TrackedPosition,
      starterValue: 0, leagueMedian: 0, diff: 0, diffPct: 0,
      tier: 'average', topPlayers: [], effectiveStarters: 0, avgStarterValue: 0,
    }
  }
  return r
}
