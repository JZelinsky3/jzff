// Live Wire data loader — Phase 11.
//
// Fetches the manager's current-week matchups + season-to-date form from every
// linked Sleeper league. No caching: this is meant to be fresh each render
// since matchups move live during games. ESPN / Yahoo / NFL.com leagues are
// reported as `unsupported` until those live feeds land.

import { sleeper, type SleeperLeague, type SleeperMatchup, type SleeperRoster, type SleeperUser, avatarUrl } from '@/lib/platforms/sleeper'
import { createClient } from '@/lib/supabase/server'
import { resolveCurrentWeek } from '@/lib/liveSeason'

export type WireMatchup = {
  isMine: boolean
  matchupId: number
  // Two participants (Sleeper matchups always pair off).
  a: { ownerName: string; teamName: string; avatarUrl: string | null; points: number; rosterId: number; ownerId: string }
  b: { ownerName: string; teamName: string; avatarUrl: string | null; points: number; rosterId: number; ownerId: string } | null
}

export type WireForm = {
  // Season-to-date record from the live rosters' settings (Sleeper stores
  // these on the roster object — wins/losses/ties/fpts/fpts_against).
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  // PPG averaged across decided games.
  ppg: number | null
}

export type WireLeague = {
  archiveLeagueId: string
  liveLeagueId: string
  leagueName: string
  leagueSlug: string
  season: string
  currentWeek: number | null
  myOwnerId: string  // template uses this to highlight "my" side of a matchup
  myForm: WireForm
  myStreak: { kind: 'W' | 'L' | 'T'; length: number } | null
  // The matchup containing the manager goes first; the rest follow.
  matchups: WireMatchup[]
}

export type WireUnsupported = {
  leagueName: string
  leagueSlug: string
  platform: string
}

export type WireLive = {
  chronicle: { id: string; slug: string; displayName: string }
  leagues: WireLeague[]
  unsupported: WireUnsupported[]
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

export async function loadWireLive(slug: string, ownerId: string): Promise<WireLive | null> {
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
  const unsupported: WireUnsupported[] = linkRows
    .filter((l) => l.league.platform !== 'sleeper')
    .map((l) => ({ leagueName: l.league_alias?.trim() || l.league.name, leagueSlug: l.league.slug, platform: l.league.platform }))

  // Most recent season's external_id is the current live Sleeper league.
  const liveByArchive = new Map<string, string>()
  const yearByArchive = new Map<string, number>()
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
        yearByArchive.set(archiveId, row.year as number)
      }
    }
  }

  const errors: string[] = []
  const leagues: WireLeague[] = []

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

      const rostersById = new Map<number, SleeperRoster>()
      for (const r of rosters) rostersById.set(r.roster_id, r)

      const myRoster = rosters.find((r) => r.owner_id === link.manager_external_id) ?? null
      if (!myRoster) {
        errors.push(`${leagueName}: couldn't locate your roster (owner ${link.manager_external_id})`)
        return
      }

      // Sleeper exposes win/loss/ties/fpts on roster.settings; deal with both
      // integer points (legacy) and { fpts, fpts_decimal } pairs.
      const rs = myRoster.settings as Record<string, unknown> | undefined
      const wins = num(rs?.wins) ?? 0
      const losses = num(rs?.losses) ?? 0
      const ties = num(rs?.ties) ?? 0
      const pf = (num(rs?.fpts) ?? 0) + ((num(rs?.fpts_decimal) ?? 0) / 100)
      const pa = (num(rs?.fpts_against) ?? 0) + ((num(rs?.fpts_against_decimal) ?? 0) / 100)
      const decided = wins + losses
      const myForm: WireForm = {
        wins, losses, ties,
        pointsFor: pf,
        pointsAgainst: pa,
        ppg: decided + ties > 0 ? pf / (decided + ties) : null,
      }

      const currentWeek = resolveCurrentWeek(league.settings as Record<string, unknown>)
      const wireMatchups: WireMatchup[] = []
      let myStreak: WireLeague['myStreak'] = null

      // Pull this week's matchups when we have a current week.
      if (currentWeek != null && currentWeek >= 1) {
        try {
          const mu = await sleeper.matchups(liveLeagueId, currentWeek)
          if (mu && mu.length > 0) wireMatchups.push(...buildMatchups(mu, rostersById, usersByOwnerId, myRoster.roster_id))
        } catch {
          // Matchups failing isn't fatal — we can still show form. Surface as warning.
          errors.push(`${leagueName}: couldn't load Week ${currentWeek} matchups`)
        }

        // Walk back week-by-week to compute the current streak. Cheap fetches.
        myStreak = await computeStreak(liveLeagueId, currentWeek, myRoster.roster_id)
      }

      leagues.push({
        archiveLeagueId: link.league_id,
        liveLeagueId,
        leagueName: leagueName,
        leagueSlug: link.league.slug,
        season: league.season,
        currentWeek,
        myOwnerId: link.manager_external_id,
        myForm,
        myStreak,
        matchups: wireMatchups,
      })
    }),
  )

  leagues.sort((a, b) => a.leagueName.localeCompare(b.leagueName))

  return {
    chronicle: { id: chronicle.id, slug: chronicle.slug, displayName: chronicle.display_name },
    leagues,
    unsupported,
    errors,
    fetchedAt: new Date().toISOString(),
  }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function buildMatchups(
  mu: SleeperMatchup[],
  rostersById: Map<number, SleeperRoster>,
  usersByOwnerId: Map<string, SleeperUser>,
  myRosterId: number,
): WireMatchup[] {
  // Sleeper matchups pair by matchup_id. Group, then assemble two-sided cards.
  const byId = new Map<number, SleeperMatchup[]>()
  const orphans: SleeperMatchup[] = []
  for (const m of mu) {
    if (m.matchup_id == null) { orphans.push(m); continue }
    const arr = byId.get(m.matchup_id) ?? []
    arr.push(m)
    byId.set(m.matchup_id, arr)
  }

  const pairs: WireMatchup[] = []
  for (const [id, arr] of byId) {
    const a = arr[0]
    const b = arr[1] ?? null
    if (!a) continue
    const side = (m: SleeperMatchup) => {
      const r = rostersById.get(m.roster_id)
      const u = r?.owner_id ? usersByOwnerId.get(r.owner_id) : undefined
      const ownerName = u?.display_name ?? 'Unknown'
      const teamName = u?.metadata?.team_name?.trim() || ownerName
      return {
        ownerName,
        teamName,
        avatarUrl: u ? avatarUrl(u) : null,
        points: m.points ?? 0,
        rosterId: m.roster_id,
        ownerId: r?.owner_id ?? '',
      }
    }
    pairs.push({
      matchupId: id,
      isMine: a.roster_id === myRosterId || b?.roster_id === myRosterId,
      a: side(a),
      b: b ? side(b) : null,
    })
  }
  pairs.sort((x, y) => (x.isMine === y.isMine ? x.matchupId - y.matchupId : x.isMine ? -1 : 1))
  // Drop any orphan single-side matchups (rare; happens during week setup).
  void orphans
  return pairs
}

// Walk backwards from `throughWeek - 1` until the result direction flips,
// counting matched outcomes. Returns null when we can't determine.
async function computeStreak(
  liveLeagueId: string,
  throughWeek: number,
  myRosterId: number,
): Promise<{ kind: 'W' | 'L' | 'T'; length: number } | null> {
  // Going back at most 12 weeks keeps it cheap; longer streaks rare anyway.
  const start = Math.max(1, throughWeek - 1)
  const lookback = Math.min(12, start)
  let result: 'W' | 'L' | 'T' | null = null
  let length = 0
  for (let week = start; week >= start - lookback + 1; week--) {
    let mu: SleeperMatchup[] | null = null
    try {
      mu = await sleeper.matchups(liveLeagueId, week)
    } catch {
      break
    }
    if (!mu || mu.length === 0) break
    const mine = mu.find((m) => m.roster_id === myRosterId)
    if (!mine || mine.matchup_id == null) break
    const opp = mu.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== myRosterId)
    if (!opp) break
    const mineScore = mine.points ?? 0
    const oppScore = opp.points ?? 0
    // Skip unscored weeks (haven't been played yet).
    if (mineScore === 0 && oppScore === 0) continue
    const out: 'W' | 'L' | 'T' = mineScore > oppScore ? 'W' : mineScore < oppScore ? 'L' : 'T'
    if (result == null) {
      result = out
      length = 1
      continue
    }
    if (out === result) length += 1
    else break
  }
  return result ? { kind: result, length } : null
}
