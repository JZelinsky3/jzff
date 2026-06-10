// Sleeper implementation of LivePlatform.
//
// Sleeper's public API gives us everything live: league info, users, rosters,
// and per-week matchups (with players_points). We resolve player names/teams/
// positions via the cached lean players map, and cross-reference NFL game state
// via the ESPN scoreboard to set on-field / red-zone / quarter-clock for each
// starter.
//
// Projections: Phase 0 uses a positional baseline (avg fantasy points per
// position per week, rough). Phase 3 swaps this for a real projection source.

import { sleeper, avatarUrl, type SleeperUser, type SleeperRoster, type SleeperMatchup } from '@/lib/platforms/sleeper'
import { getPlayersMap, type LeanPlayer } from '@/lib/sleeperPlayers'
import { fetchScoreboard, normTeam, type NflGame } from '@/lib/nflLive'
import type { LivePlatform, PlatformFrame, PlatformLeagueRef } from '../platforms'
import type { SlPlayer, SlSide, GameState } from '../types'

const SKIP_SLOTS = new Set(['BN', 'IR', 'TAXI'])

// Rough position baselines — typical Sunday output for a starter.
// Used as a "you'll probably end up at least here" floor.
const POSITION_BASELINE: Record<string, number> = {
  QB: 18,
  RB: 11,
  WR: 11,
  TE: 8,
  K: 8,
  DEF: 8,
  FLEX: 10,
}

function gameStateFor(team: string | null, scoreboard: NflGame[]): SlPlayer['game'] {
  if (!team) return null
  const g = scoreboard.find((gm) => gm.home.abbr === team || gm.away.abbr === team)
  if (!g) return null
  const state: GameState = g.state === 'in' ? 'live' : g.state === 'post' ? 'final' : 'pre'
  return {
    state,
    quarterClock: g.state === 'in' ? `Q${g.period} ${g.clock}` : null,
    onField: g.possessionAbbr === team,
    inRedZone: !!g.isRedZone && g.possessionAbbr === team,
  }
}

function gameStateForRosters(team: string | null, scoreboard: NflGame[]): GameState {
  if (!team) return 'pre'
  const g = scoreboard.find((gm) => gm.home.abbr === team || gm.away.abbr === team)
  if (!g) return 'pre'
  return g.state === 'in' ? 'live' : g.state === 'post' ? 'final' : 'pre'
}

function projectFor(pos: string | null, scored: number, state: GameState): number {
  if (state === 'final') return scored
  const baseline = pos ? POSITION_BASELINE[pos] ?? POSITION_BASELINE.FLEX : POSITION_BASELINE.FLEX
  // If we're behind baseline, project upward toward it (game still has time).
  // If we're already past baseline, extrapolate at a reduced rate.
  if (state === 'pre') return baseline
  return Math.max(scored, baseline)
}

export const sleeperPlatform: LivePlatform = {
  async fetchFrame(ref: PlatformLeagueRef): Promise<PlatformFrame> {
    const [users, rosters, matchups, playersMap, scoreboard] = await Promise.all([
      sleeper.users(ref.externalLeagueId),
      sleeper.rosters(ref.externalLeagueId),
      sleeper.matchups(ref.externalLeagueId, ref.week),
      getPlayersMap(),
      fetchScoreboard().catch(() => ({ games: [] as NflGame[] })),
    ])
    if (!users || !rosters) {
      return { supported: false, reason: 'Sleeper returned partial data' }
    }
    const usersById = new Map<string, SleeperUser>()
    for (const u of users) usersById.set(u.user_id, u)

    const muByRoster = new Map<number, SleeperMatchup>()
    for (const m of matchups ?? []) muByRoster.set(m.roster_id, m)

    const rosterPositions = ref.rosterPositions.filter((p) => !SKIP_SLOTS.has(p))

    // Pair rosters into matchups via Sleeper's `matchup_id`. Side A is the
    // lower roster_id so ordering is stable across polls.
    const sidesByMatchup = new Map<number, SleeperRoster[]>()
    for (const r of rosters) {
      const m = muByRoster.get(r.roster_id)
      const mid = m?.matchup_id ?? null
      if (mid == null) continue
      const list = sidesByMatchup.get(mid) ?? []
      list.push(r)
      sidesByMatchup.set(mid, list)
    }

    const sides: SlSide[] = []
    const rosterIdToMatchup: Record<number, number> = {}

    for (const [matchupId, rs] of sidesByMatchup.entries()) {
      rs.sort((x, y) => x.roster_id - y.roster_id)
      for (const r of rs) {
        rosterIdToMatchup[r.roster_id] = matchupId
        const side = buildSide(r, usersById, muByRoster, playersMap, rosterPositions, scoreboard.games)
        sides.push(side)
      }
    }

    return {
      supported: true,
      liveQuality: 'live',
      sides,
      rosterIdToMatchup,
    }
  },
}

function buildSide(
  r: SleeperRoster,
  usersById: Map<string, SleeperUser>,
  muByRoster: Map<number, SleeperMatchup>,
  playersMap: Record<string, LeanPlayer>,
  rosterPositions: string[],
  scoreboard: NflGame[],
): SlSide {
  const user = r.owner_id ? usersById.get(r.owner_id) : undefined
  const ownerName = user?.display_name ?? 'Unknown'
  const teamName = user?.metadata?.team_name?.trim() || ownerName
  const m = muByRoster.get(r.roster_id)
  const starters = (m?.starters ?? r.starters ?? []).filter((id): id is string => !!id && id !== '0')
  const allIds = (m?.players ?? r.players ?? starters).filter((id): id is string => !!id && id !== '0')
  const pts = m?.players_points ?? {}
  const starterIdx = new Map<string, number>()
  starters.forEach((id, i) => starterIdx.set(id, i))

  const players: SlPlayer[] = []
  let totalProj = 0
  let playersRemaining = 0

  for (const id of allIds) {
    const lean = playersMap[id]
    const isStarter = starterIdx.has(id)
    const slotIdx = starterIdx.get(id)
    const team = normTeam(lean?.team)
    const points = pts[id] ?? 0
    const gameForPlayer = gameStateFor(team, scoreboard)
    const playerGameState = gameForPlayer?.state ?? gameStateForRosters(team, scoreboard)
    const projected = projectFor(lean?.position ?? null, points, playerGameState)
    if (isStarter) {
      totalProj += projected
      if (playerGameState !== 'final') playersRemaining++
    }
    players.push({
      playerId: id,
      name: lean?.name ?? id,
      team,
      position: lean?.position ?? null,
      slot: isStarter && slotIdx != null ? rosterPositions[slotIdx] ?? null : null,
      points,
      projected,
      isStarter,
      injuryStatus: lean?.injuryStatus ?? null,
      game: gameForPlayer,
    })
  }

  players.sort((a, b) => {
    if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1
    if (a.isStarter) return (starterIdx.get(a.playerId)! - starterIdx.get(b.playerId)!)
    return b.points - a.points
  })

  return {
    rosterId: r.roster_id,
    ownerId: r.owner_id ?? null,
    ownerName,
    teamName,
    avatarUrl: user ? avatarUrl(user) : null,
    score: m?.points ?? 0,
    projected: Math.max(m?.points ?? 0, totalProj),
    wp: 0.5,                // placeholder — load.ts overwrites
    playersRemaining,
    players,
  }
}
