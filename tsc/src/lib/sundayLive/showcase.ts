// Showcase week — a synthetic Sunday for leagues with no replayable platform.
//
// Demo replay normally refetches a past week's lineups from the platform API.
// Leagues whose history lives on NFL.com (dead API), ESPN/Yahoo (adapters not
// live yet), or whose Sleeper era hasn't kicked off, can't do that, so their
// Sunday Live is a permanent OFF AIR panel. This module fabricates the one
// thing the platform would have supplied (rosters with final points) and lets
// the rest of the real pipeline run untouched:
//
//   - teams = the league's ACTUAL managers from the season being replayed
//     (real display names, team names, avatars, owner ids, so the storyline
//     engine's history rules fire against real h2h/streak/power data)
//   - player scores = REAL Sleeper stat lines for that NFL week, so the
//     ticker, dud boards, and monster games are things that actually happened
//   - rosters = a seeded snake-ish deal from the top of each position pool;
//     stable for a given (league, year, week) so polls never reshuffle
//
// demoSim then rewinds it to the requested progress like any other demo.

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchWeekStats } from '@/lib/playerStats'
import { getPlayersMap } from '@/lib/sleeperPlayers'
import type { PlatformFrame } from './platforms'
import type { SlPlayer, SlSide } from './types'

// FNV-1a → [0, 1), same seeding family as demoSim.
function hash01(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 0xffffffff
}

const round1 = (n: number) => Math.round(n * 10) / 10

type PoolPlayer = { id: string; name: string; team: string; position: string; points: number }

const STARTER_SLOTS: Array<{ slot: string; position: string; count: number }> = [
  { slot: 'QB', position: 'QB', count: 1 },
  { slot: 'RB', position: 'RB', count: 2 },
  { slot: 'WR', position: 'WR', count: 2 },
  { slot: 'TE', position: 'TE', count: 1 },
  { slot: 'K', position: 'K', count: 1 },
  { slot: 'DEF', position: 'DEF', count: 1 },
]
const POOL_DEPTH: Record<string, number> = { QB: 20, RB: 60, WR: 60, TE: 30, K: 14, DEF: 14 }
const BENCH_SIZE = 4

export async function buildShowcaseFrame(
  leagueId: string,
  year: number,
  week: number,
): Promise<PlatformFrame | null> {
  const seed = `${leagueId}:${year}:${week}`
  const db = createAdminClient()

  // The managers who actually played that season, joined for identity so the
  // storyline engine's h2h/streak/power rules resolve against real history.
  const { data: rows } = await db
    .from('matchups')
    .select('manager_a_id, manager_b_id, seasons!inner(league_id, year)')
    .eq('seasons.league_id', leagueId)
    .eq('seasons.year', year)
  const managerIds = [...new Set((rows ?? []).flatMap((r) => [r.manager_a_id, r.manager_b_id]))]
    .filter((id): id is string => id != null)
  if (managerIds.length < 4) return null

  const { data: managerRows } = await db
    .from('managers')
    .select('id, display_name, team_name, avatar_url, external_id')
    .in('id', managerIds)
  const managers = (managerRows ?? [])
    .sort((a, b) => hash01(`${seed}:m:${a.id}`) - hash01(`${seed}:m:${b.id}`))
  // Even team count; a straggler sits this one out.
  if (managers.length % 2 === 1) managers.pop()
  if (managers.length < 4) return null

  // Real stat lines for that NFL week + the player dictionary.
  const [stats, playersMap] = await Promise.all([
    fetchWeekStats(year, week).catch(() => ({})),
    getPlayersMap().catch(() => ({})),
  ])

  const pools = new Map<string, PoolPlayer[]>()
  for (const [pid, line] of Object.entries(stats)) {
    const points = line.pts_ppr ?? line.pts_half_ppr ?? line.pts_std
    if (points == null) continue
    const p = (playersMap as Record<string, { name: string; team: string | null; position: string | null }>)[pid]
    if (!p?.name || !p.team || !p.position || !(p.position in POOL_DEPTH)) continue
    const list = pools.get(p.position) ?? []
    list.push({ id: pid, name: p.name, team: p.team, position: p.position, points: round1(points) })
    pools.set(p.position, list)
  }
  // Top of each position by that week's real points, then a seeded shuffle so
  // studs and duds spread across the league instead of stacking one roster.
  for (const [pos, list] of pools) {
    list.sort((a, b) => b.points - a.points)
    const top = list.slice(0, POOL_DEPTH[pos])
    top.sort((a, b) => hash01(`${seed}:p:${a.id}`) - hash01(`${seed}:p:${b.id}`))
    pools.set(pos, top)
  }
  if ((pools.get('QB')?.length ?? 0) < managers.length || (pools.get('RB')?.length ?? 0) < managers.length * 2) {
    return null // stats not published for that week (future season, offweek)
  }

  const take = (pos: string): PoolPlayer | null => pools.get(pos)?.shift() ?? null

  const sides: SlSide[] = managers.map((m, i) => {
    const rosterId = i + 1
    const players: SlPlayer[] = []

    for (const { slot, position, count } of STARTER_SLOTS) {
      for (let c = 0; c < count; c++) {
        const p = take(position)
        if (p) players.push(mkPlayer(p, slot, true))
      }
    }
    // FLEX from whichever skill pool the seed favors.
    const flexPos = ['RB', 'WR', 'TE'][Math.floor(hash01(`${seed}:fx:${rosterId}`) * 3)]
    const flex = take(flexPos) ?? take('WR') ?? take('RB')
    if (flex) players.push(mkPlayer(flex, 'FLEX', true))

    for (let b = 0; b < BENCH_SIZE; b++) {
      const benchPos = ['RB', 'WR', 'WR', 'TE', 'QB'][Math.floor(hash01(`${seed}:bn:${rosterId}:${b}`) * 5)]
      const p = take(benchPos) ?? take('RB') ?? take('WR') ?? take('TE')
      if (p) players.push(mkPlayer(p, null, false))
    }

    return {
      rosterId,
      ownerId: (m.external_id as string | null) ?? null,
      ownerName: (m.display_name as string) ?? 'Unknown',
      teamName: (m.team_name as string | null) || (m.display_name as string) || 'Unknown',
      avatarUrl: (m.avatar_url as string | null) ?? null,
      score: 0,          // demoSim recomputes from starters at the given progress
      projected: 0,
      wp: 0.5,
      playersRemaining: 0,
      players,
    }
  })

  function mkPlayer(p: PoolPlayer, slot: string | null, isStarter: boolean): SlPlayer {
    // A light sprinkle of injury designations so the inactives radar and the
    // man-down rule have something to show pre-kickoff. Out players get their
    // day clamped so the designation and the box score agree.
    const roll = hash01(`${seed}:inj:${p.id}`)
    const injuryStatus = isStarter && roll < 0.015 ? 'Out' : roll < 0.05 ? 'Questionable' : null
    const points = injuryStatus === 'Out' ? Math.min(p.points, 1.2) : p.points
    return {
      playerId: p.id,
      name: p.name,
      team: p.team,
      position: p.position,
      slot,
      points,
      projected: 0,      // demoSim synthesizes a plausible projection
      isStarter,
      injuryStatus,
      game: null,
    }
  }

  // Seeded pairings; every pair has real history behind it anyway.
  const rosterIdToMatchup: Record<number, number> = {}
  for (let i = 0; i < sides.length; i += 2) {
    const matchupId = i / 2 + 1
    rosterIdToMatchup[sides[i].rosterId] = matchupId
    rosterIdToMatchup[sides[i + 1].rosterId] = matchupId
  }

  return { supported: true, liveQuality: 'live', sides, rosterIdToMatchup }
}
