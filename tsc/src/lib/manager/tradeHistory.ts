// Cross-league trade history loader — Phase 13.
//
// Walks current-season transactions across every linked Sleeper league,
// filters to trades involving the manager, resolves player names + manager
// names, and returns a unified history list sorted newest-first.

import { sleeper, type SleeperLeague, type SleeperRoster, type SleeperTransaction, type SleeperUser } from '@/lib/platforms/sleeper'
import { createClient } from '@/lib/supabase/server'

// Trade deadline is typically Week 12-13 in fantasy. Walking 1-13 covers
// every realistic trade. Bumping past 13 just burns Sleeper API calls.
const WEEK_RANGE = Array.from({ length: 13 }, (_, i) => i + 1)

export type TradeSidePlayer = {
  playerId: string
  name: string
  position: string | null
  team: string | null
}

export type TradeSide = {
  ownerId: string
  ownerName: string
  teamName: string
  // Acquired in the trade (received).
  in: TradeSidePlayer[]
  // Sent away (dropped).
  out: TradeSidePlayer[]
  // Net pick movement.
  picksIn: Array<{ season: string; round: number; fromOwner: string | null }>
  picksOut: Array<{ season: string; round: number; toOwner: string | null }>
}

export type TradeEntry = {
  transactionId: string
  leagueName: string
  leagueSlug: string
  season: string
  week: number
  createdAt: string
  status: string
  isMine: boolean
  // The user's side comes first in `sides` when isMine.
  sides: TradeSide[]
}

export type TradeHistoryUnsupported = {
  leagueName: string
  leagueSlug: string
  platform: string
}

export type TradeHistory = {
  chronicle: { id: string; slug: string; displayName: string }
  trades: TradeEntry[]
  totals: {
    trades: number
    playersIn: number
    playersOut: number
    picksIn: number
    picksOut: number
  }
  unsupported: TradeHistoryUnsupported[]
  errors: string[]
  fetchedAt: string
}

type ChronicleRow = { id: string; slug: string; display_name: string }
type LinkRow = {
  league_id: string
  manager_external_id: string
  league_alias: string | null
  league: { id: string; name: string; slug: string; platform: string }
}

export async function loadTradeHistory(slug: string, ownerId: string): Promise<TradeHistory | null> {
  const supabase = await createClient()
  const { data: chronicle } = await supabase
    .from('career_chronicles')
    .select('id, slug, display_name')
    .eq('slug', slug)
    .eq('owner_id', ownerId)
    .maybeSingle<ChronicleRow>()
  if (!chronicle) return null

  const { data: links } = await supabase
    .from('career_links')
    .select('league_id, manager_external_id, league_alias, league:leagues!inner(id, name, slug, platform)')
    .eq('chronicle_id', chronicle.id)
  const linkRows = (links ?? []) as unknown as LinkRow[]
  const sleeperLinks = linkRows.filter((l) => l.league.platform === 'sleeper')
  const unsupported: TradeHistoryUnsupported[] = linkRows
    .filter((l) => l.league.platform !== 'sleeper')
    .map((l) => ({ leagueName: l.league_alias?.trim() || l.league.name, leagueSlug: l.league.slug, platform: l.league.platform }))

  // Most recent season's external_id is the live Sleeper league.
  const liveByArchive = new Map<string, string>()
  if (sleeperLinks.length > 0) {
    const archiveIds = sleeperLinks.map((l) => l.league_id)
    const { data: seasonRows } = await supabase
      .from('seasons')
      .select('league_id, year, external_id')
      .in('league_id', archiveIds)
      .order('year', { ascending: false })
    for (const row of seasonRows ?? []) {
      const archiveId = row.league_id as string
      if (!liveByArchive.has(archiveId) && row.external_id) {
        liveByArchive.set(archiveId, row.external_id as string)
      }
    }
  }

  // Player names: fetch the NFL player dictionary once and share across leagues.
  // It's a ~5MB payload so we only do it if there's at least one Sleeper league.
  let playersDict: Record<string, { full_name?: string; first_name?: string; last_name?: string; position?: string; team?: string | null }> | null = null
  if (sleeperLinks.length > 0) {
    try {
      playersDict = await sleeper.playersNfl()
    } catch {
      // If the dictionary fails, trades still render with raw player IDs as names.
    }
  }

  const errors: string[] = []
  const trades: TradeEntry[] = []

  await Promise.all(
    sleeperLinks.map(async (link) => {
      const leagueName = link.league_alias?.trim() || link.league.name
      const liveLeagueId = liveByArchive.get(link.league_id)
      if (!liveLeagueId) {
        errors.push(`${leagueName}: no current Sleeper league id`)
        return
      }
      let league: SleeperLeague | null = null
      let users: SleeperUser[] | null = null
      let rosters: SleeperRoster[] | null = null
      try {
        league = await sleeper.league(liveLeagueId)
        users = await sleeper.users(liveLeagueId)
        rosters = await sleeper.rosters(liveLeagueId)
      } catch (e) {
        errors.push(`${leagueName}: ${e instanceof Error ? e.message : String(e)}`)
        return
      }
      if (!league || !users || !rosters) {
        errors.push(`${leagueName}: Sleeper returned partial data`)
        return
      }

      const usersByOwnerId = new Map<string, SleeperUser>()
      for (const u of users) usersByOwnerId.set(u.user_id, u)
      const rosterToOwner = new Map<number, string>()
      for (const r of rosters) {
        if (r.owner_id) rosterToOwner.set(r.roster_id, r.owner_id)
      }

      const myRoster = rosters.find((r) => r.owner_id === link.manager_external_id)
      if (!myRoster) {
        errors.push(`${leagueName}: couldn't locate your roster`)
        return
      }
      const myRosterId = myRoster.roster_id

      // Walk all candidate weeks in parallel.
      const allTransactions = await Promise.all(
        WEEK_RANGE.map(async (week) => {
          try {
            const tx = await sleeper.transactions(liveLeagueId, week)
            return tx ?? []
          } catch {
            return []
          }
        }),
      )
      const flat = allTransactions.flat()

      for (const tx of flat) {
        if (tx.type !== 'trade') continue
        if (tx.status !== 'complete') continue

        const involvesMe = tx.roster_ids.includes(myRosterId)
        const isMine = involvesMe

        // Build per-roster sides from the adds/drops + draft picks. adds maps
        // playerId -> receiver_roster_id; drops maps playerId -> dropper.
        const sidesByRoster = new Map<number, TradeSide>()
        const ensure = (rid: number): TradeSide => {
          let s = sidesByRoster.get(rid)
          if (s) return s
          const ownerIdLocal = rosterToOwner.get(rid) ?? `roster-${rid}`
          const u = usersByOwnerId.get(ownerIdLocal)
          const ownerName = u?.display_name ?? `Roster ${rid}`
          const teamName = u?.metadata?.team_name?.trim() || ownerName
          s = { ownerId: ownerIdLocal, ownerName, teamName, in: [], out: [], picksIn: [], picksOut: [] }
          sidesByRoster.set(rid, s)
          return s
        }
        // Make sure every involved roster has a side.
        for (const rid of tx.roster_ids) ensure(rid)

        for (const [pid, receiver] of Object.entries(tx.adds ?? {})) {
          const p = resolvePlayer(pid, playersDict)
          ensure(receiver).in.push(p)
        }
        for (const [pid, dropper] of Object.entries(tx.drops ?? {})) {
          const p = resolvePlayer(pid, playersDict)
          ensure(dropper).out.push(p)
        }
        for (const pick of tx.draft_picks ?? []) {
          const fromOwner = pick.previous_owner_id != null ? rosterToOwner.get(pick.previous_owner_id) ?? null : null
          const toOwner = pick.owner_id != null ? rosterToOwner.get(pick.owner_id) ?? null : null
          if (pick.owner_id != null) {
            ensure(pick.owner_id).picksIn.push({ season: pick.season, round: pick.round, fromOwner })
          }
          if (pick.previous_owner_id != null) {
            ensure(pick.previous_owner_id).picksOut.push({ season: pick.season, round: pick.round, toOwner })
          }
        }

        const sides = [...sidesByRoster.values()]
        sides.sort((a, b) => (a.ownerId === link.manager_external_id ? -1 : b.ownerId === link.manager_external_id ? 1 : 0))

        trades.push({
          transactionId: tx.transaction_id,
          leagueName: leagueName,
          leagueSlug: link.league.slug,
          season: league.season,
          week: tx.week,
          createdAt: new Date(tx.created).toISOString(),
          status: tx.status,
          isMine,
          sides,
        })
      }
    }),
  )

  trades.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  // Totals tracked from the manager's perspective.
  let playersIn = 0, playersOut = 0, picksIn = 0, picksOut = 0
  for (const t of trades) {
    if (!t.isMine) continue
    const me = t.sides[0]
    if (!me) continue
    playersIn += me.in.length
    playersOut += me.out.length
    picksIn += me.picksIn.length
    picksOut += me.picksOut.length
  }

  return {
    chronicle: { id: chronicle.id, slug: chronicle.slug, displayName: chronicle.display_name },
    trades,
    totals: {
      trades: trades.filter((t) => t.isMine).length,
      playersIn,
      playersOut,
      picksIn,
      picksOut,
    },
    unsupported,
    errors,
    fetchedAt: new Date().toISOString(),
  }
}

function resolvePlayer(
  pid: string,
  dict: Record<string, { full_name?: string; first_name?: string; last_name?: string; position?: string; team?: string | null }> | null,
): TradeSidePlayer {
  const meta = dict?.[pid]
  const name = meta?.full_name
    ?? (meta?.first_name && meta?.last_name ? `${meta.first_name} ${meta.last_name}` : null)
    ?? `Player ${pid}`
  return {
    playerId: pid,
    name,
    position: meta?.position ?? null,
    team: meta?.team ?? null,
  }
}
