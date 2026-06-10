// Lean, side-effect-free league roster loader.
//
// The Games + My-Players pages need each rostered player's NFL team, position,
// live points, owner, and starter flag — but NOT the win-probability sims,
// storylines, snapshot writes, or swing-moment derivation that loadSundayLive
// performs (calling that here would double-write sunday_live_snapshots and
// pollute the moment history). So this mirrors only the live Sleeper fetch and
// resolves players through the cached lean dictionary.

import {
  sleeper,
  avatarUrl,
  type SleeperUser,
  type SleeperRoster,
  type SleeperMatchup,
} from '@/lib/platforms/sleeper'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentWeek } from '@/lib/liveSeason'
import { getPlayersMap } from '@/lib/sleeperPlayers'
import { normTeam } from '@/lib/nflLive'

export type RosterPlayer = {
  playerId: string
  name: string
  team: string | null // canonical NFL abbreviation
  position: string | null
  slot: string | null
  points: number
  isStarter: boolean
  injuryStatus: string | null
}

export type RosterTeam = {
  rosterId: number
  ownerId: string | null
  ownerName: string
  teamName: string
  avatarUrl: string | null
  points: number
  players: RosterPlayer[]
}

export type LeagueRosters =
  | { ok: true; supported: boolean; week: number | null; leagueName: string; teams: RosterTeam[]; fetchedAt: string }
  | { ok: false; reason: string }

const SKIP_SLOTS = new Set(['BN', 'IR', 'TAXI'])

export async function loadLeagueRosters(slug: string): Promise<LeagueRosters> {
  const db = createAdminClient()
  const { data: leagueRow } = await db
    .from('leagues')
    .select('id, name, platform')
    .eq('slug', slug)
    .maybeSingle()
  if (!leagueRow) return { ok: false, reason: 'League not found' }

  const leagueName = leagueRow.name as string
  const empty = (week: number | null, supported: boolean): LeagueRosters => ({
    ok: true,
    supported,
    week,
    leagueName,
    teams: [],
    fetchedAt: new Date().toISOString(),
  })

  if (leagueRow.platform !== 'sleeper') return empty(null, false)

  const { data: seasonRow } = await db
    .from('seasons')
    .select('external_id')
    .eq('league_id', leagueRow.id)
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle()
  const liveLeagueId = seasonRow?.external_id as string | undefined
  if (!liveLeagueId) return empty(null, true)

  const [league, users, rosters, players] = await Promise.all([
    sleeper.league(liveLeagueId),
    sleeper.users(liveLeagueId),
    sleeper.rosters(liveLeagueId),
    getPlayersMap(),
  ])
  if (!league || !users || !rosters) return { ok: false, reason: 'Sleeper returned partial data' }

  const week = resolveCurrentWeek(league.settings as Record<string, unknown>)
  if (week == null || week < 1) return empty(null, true)

  const mu = await sleeper.matchups(liveLeagueId, week)
  const usersById = new Map<string, SleeperUser>()
  for (const u of users) usersById.set(u.user_id, u)
  const matchupByRoster = new Map<number, SleeperMatchup>()
  for (const m of mu ?? []) matchupByRoster.set(m.roster_id, m)

  // Starting-slot labels: roster_positions minus the bench/IR/taxi slots,
  // positional to the matchup's `starters` array.
  const rosterPositions = ((league as unknown as { roster_positions?: string[] }).roster_positions ?? []).filter(
    (p) => !SKIP_SLOTS.has(p),
  )

  const teams: RosterTeam[] = []
  for (const r of rosters as SleeperRoster[]) {
    const user = r.owner_id ? usersById.get(r.owner_id) : undefined
    const ownerName = user?.display_name ?? 'Unknown'
    const teamName = user?.metadata?.team_name?.trim() || ownerName
    const m = matchupByRoster.get(r.roster_id)
    const starters = m?.starters ?? r.starters ?? []
    const allIds = m?.players ?? r.players ?? starters
    const pts = m?.players_points ?? {}
    const starterIdx = new Map<string, number>()
    starters.forEach((id, i) => {
      if (id && id !== '0') starterIdx.set(id, i)
    })

    const built: RosterPlayer[] = []
    for (const id of allIds) {
      if (!id || id === '0') continue
      const lean = players[id]
      const isStarter = starterIdx.has(id)
      const slotIdx = starterIdx.get(id)
      built.push({
        playerId: id,
        name: lean?.name ?? id,
        team: normTeam(lean?.team),
        position: lean?.position ?? null,
        slot: isStarter && slotIdx != null ? rosterPositions[slotIdx] ?? null : null,
        points: pts[id] ?? 0,
        isStarter,
        injuryStatus: lean?.injuryStatus ?? null,
      })
    }
    // Starters first (lineup order), then bench by points desc.
    built.sort((x, y) => {
      if (x.isStarter !== y.isStarter) return x.isStarter ? -1 : 1
      if (x.isStarter && y.isStarter) return (starterIdx.get(x.playerId)! - starterIdx.get(y.playerId)!)
      return y.points - x.points
    })

    teams.push({
      rosterId: r.roster_id,
      ownerId: r.owner_id ?? null,
      ownerName,
      teamName,
      avatarUrl: user ? avatarUrl(user) : null,
      points: m?.points ?? 0,
      players: built,
    })
  }

  teams.sort((a, b) => b.points - a.points)
  return { ok: true, supported: true, week, leagueName, teams, fetchedAt: new Date().toISOString() }
}
