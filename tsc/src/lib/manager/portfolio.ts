// Dynasty portfolio snapshot — Phase 12.
//
// Returns current KTC-valued portfolio per linked Sleeper league: total team
// value, top assets, and league-relative percentile. This is a snapshot, not
// a time series — historical KTC values would need a per-season ingest job
// (deferred to a follow-up). The Dynasty template renders these as ranked
// bars + a top-anchors sidebar.

import { loadTradeFloor } from './tradeFloor'
import { valuateLeague, formatValuationLabel } from '@/lib/values'

export type PortfolioPlayer = {
  playerId: string
  name: string
  position: string | null
  team: string | null
  value: number
  tier: string | null
  age: number | null
}

export type PortfolioLeague = {
  archiveLeagueId: string
  liveLeagueId: string
  leagueName: string
  leagueSlug: string
  season: string
  mode: string
  modeLabel: string
  valueProviderLabel: string
  myTotalValue: number
  // League-relative: 1 = highest in the league, leagueTeamCount = lowest.
  myRank: number
  leagueTeamCount: number
  leagueAvgValue: number
  leagueTopValue: number
  // Top 10 holdings by KTC value.
  topAssets: PortfolioPlayer[]
}

export type PortfolioUnsupported = {
  leagueName: string
  leagueSlug: string
  platform: string
}

export type PortfolioSnapshot = {
  chronicle: { id: string; slug: string; displayName: string }
  leagues: PortfolioLeague[]
  unsupported: PortfolioUnsupported[]
  errors: string[]
  fetchedAt: string
}

export async function loadPortfolio(slug: string, ownerId: string): Promise<PortfolioSnapshot | null> {
  const floor = await loadTradeFloor(slug, ownerId)
  if (!floor) return null

  const leagues: PortfolioLeague[] = []

  await Promise.all(
    floor.leagues.map(async (lg) => {
      let valuation: Awaited<ReturnType<typeof valuateLeague>>
      try {
        valuation = await valuateLeague({
          mode: lg.mode,
          qbStarters: lg.qbStarters,
          teamCount: lg.teamCount,
        })
      } catch {
        return
      }

      // Per-roster total value (sum of KTC values for resolved players).
      const totalsByOwner = new Map<string, number>()
      const myAssets: PortfolioPlayer[] = []

      for (const r of lg.rosters) {
        let total = 0
        for (const pid of r.playerIds) {
          const v = valuation.values.get(pid)
          if (!v) continue
          total += v.value
          if (r.isMe) {
            myAssets.push({
              playerId: pid,
              name: v.name,
              position: v.position,
              team: v.team,
              value: v.value,
              tier: v.tier,
              age: v.age,
            })
          }
        }
        totalsByOwner.set(r.ownerId, total)
      }

      const sortedTotals = [...totalsByOwner.values()].sort((a, b) => b - a)
      const myTotal = totalsByOwner.get(lg.myOwnerId) ?? 0
      const myRank = sortedTotals.findIndex((v) => v === myTotal) + 1 || lg.rosters.length
      const leagueAvg = sortedTotals.length > 0 ? sortedTotals.reduce((s, n) => s + n, 0) / sortedTotals.length : 0
      const leagueTop = sortedTotals[0] ?? 0

      myAssets.sort((a, b) => b.value - a.value)

      leagues.push({
        archiveLeagueId: lg.archiveLeagueId,
        liveLeagueId: lg.liveLeagueId,
        leagueName: lg.leagueName,
        leagueSlug: lg.leagueSlug,
        season: lg.season,
        mode: lg.mode,
        modeLabel: lg.mode === 'dynasty' ? 'Dynasty' : lg.mode === 'keeper' ? 'Keeper' : 'Redraft',
        valueProviderLabel: formatValuationLabel(valuation),
        myTotalValue: myTotal,
        myRank,
        leagueTeamCount: sortedTotals.length,
        leagueAvgValue: leagueAvg,
        leagueTopValue: leagueTop,
        topAssets: myAssets.slice(0, 10),
      })
    }),
  )

  leagues.sort((a, b) => b.myTotalValue - a.myTotalValue)

  return {
    chronicle: floor.chronicle,
    leagues,
    unsupported: floor.unsupported,
    errors: floor.errors,
    fetchedAt: new Date().toISOString(),
  }
}
