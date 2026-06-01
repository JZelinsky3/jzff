// Trade Floor — Phase 3 v1.
//
// Sister of Player Desk: instead of just my roster, returns EVERY roster in
// each linked Sleeper league so the Trade Builder can pick a counterparty.
// Each league carries the detected mode (dynasty / redraft / keeper) and
// roster-position template so the value engine can apply scarcity correctly.

import { sleeper, type SleeperLeague, type SleeperRoster, type SleeperUser } from '@/lib/platforms/sleeper'
import { createClient } from '@/lib/supabase/server'
import { detectMode, type LeagueMode } from '@/lib/values'
import type { DeskUnsupported } from './desk'

export type TradeFloorRoster = {
  ownerId: string
  rosterId: number
  ownerName: string
  teamName: string | null
  avatarUrl: string | null
  isMe: boolean
  playerIds: string[]   // active roster (players + starters + reserve + taxi), deduped
}

export type TradeFloorLeague = {
  archiveLeagueId: string
  liveLeagueId: string
  leagueName: string
  leagueSlug: string
  season: string
  mode: LeagueMode
  qbStarters: number
  teamCount: number
  myOwnerId: string
  rosters: TradeFloorRoster[]
}

export type TradeFloor = {
  chronicle: { id: string; slug: string; displayName: string }
  leagues: TradeFloorLeague[]
  unsupported: DeskUnsupported[]
  errors: string[]
}

type ChronicleRow = { id: string; slug: string; display_name: string }
type LinkRow = {
  league_id: string
  manager_external_id: string
  league: { id: string; name: string; slug: string; platform: string }
}

function countQbStarters(league: SleeperLeague): number {
  const slots = league.roster_positions ?? []
  let qb = 0
  for (const s of slots) {
    if (s === 'QB') qb += 1
    if (s === 'SUPER_FLEX') qb += 1   // counts as a potential QB starter
  }
  return qb || 1
}

function avatarUrl(u: SleeperUser): string | null {
  if (u.metadata?.avatar?.startsWith('http')) return u.metadata.avatar
  if (u.avatar) return `https://sleepercdn.com/avatars/${u.avatar}`
  return null
}

function rosterPlayerIds(r: SleeperRoster): string[] {
  const set = new Set<string>()
  for (const arr of [r.players, r.starters, r.reserve, r.taxi]) {
    for (const id of arr ?? []) {
      if (id && id !== '0') set.add(id)
    }
  }
  return [...set]
}

export async function loadTradeFloor(slug: string, ownerId: string): Promise<TradeFloor | null> {
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
    .select('league_id, manager_external_id, league:leagues!inner(id, name, slug, platform)')
    .eq('chronicle_id', chronicle.id)
  const linkRows = (links ?? []) as unknown as LinkRow[]

  const sleeperLinks = linkRows.filter((l) => l.league.platform === 'sleeper')
  const otherLinks = linkRows.filter((l) => l.league.platform !== 'sleeper')

  // Map archive league_id → most recent season's external_id (current Sleeper id).
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

  const errors: string[] = []
  const leagues: TradeFloorLeague[] = []

  await Promise.all(
    sleeperLinks.map(async (link) => {
      const liveLeagueId = liveByArchive.get(link.league_id)
      if (!liveLeagueId) {
        errors.push(`${link.league.name}: no current Sleeper league id`)
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
        errors.push(`${link.league.name}: ${e instanceof Error ? e.message : String(e)}`)
        return
      }
      if (!league || !users || !rosters) {
        errors.push(`${link.league.name}: Sleeper returned partial data`)
        return
      }

      const usersByOwnerId = new Map<string, SleeperUser>()
      for (const u of users) usersByOwnerId.set(u.user_id, u)

      const floorRosters: TradeFloorRoster[] = rosters
        .filter((r) => r.owner_id != null)
        .map((r) => {
          const u = usersByOwnerId.get(r.owner_id!)
          const ownerName = u?.display_name ?? 'Unknown'
          const teamName = u?.metadata?.team_name?.trim() || ownerName
          return {
            ownerId: r.owner_id!,
            rosterId: r.roster_id,
            ownerName,
            teamName,
            avatarUrl: u ? avatarUrl(u) : null,
            isMe: r.owner_id === link.manager_external_id,
            playerIds: rosterPlayerIds(r),
          }
        })
        .sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : a.teamName?.localeCompare(b.teamName ?? '') ?? 0))

      const mine = floorRosters.find((r) => r.isMe)
      if (!mine) {
        errors.push(`${link.league.name}: couldn't locate your roster (owner ${link.manager_external_id})`)
        return
      }

      const mode = detectMode({
        type: typeof league.settings.type === 'number' ? league.settings.type : null,
        taxiSlots: typeof league.settings.taxi_slots === 'number' ? league.settings.taxi_slots : null,
      })

      leagues.push({
        archiveLeagueId: link.league_id,
        liveLeagueId,
        leagueName: link.league.name,
        leagueSlug: link.league.slug,
        season: league.season,
        mode,
        qbStarters: countQbStarters(league),
        teamCount: league.total_rosters,
        myOwnerId: link.manager_external_id,
        rosters: floorRosters,
      })
    }),
  )

  leagues.sort((a, b) => a.leagueName.localeCompare(b.leagueName))

  const unsupported: DeskUnsupported[] = otherLinks.map((l) => ({
    leagueName: l.league.name,
    leagueSlug: l.league.slug,
    platform: l.league.platform,
    reason: 'Trade Desk is Sleeper-only for now.',
  }))

  return {
    chronicle: { id: chronicle.id, slug: chronicle.slug, displayName: chronicle.display_name },
    leagues,
    unsupported,
    errors,
  }
}
