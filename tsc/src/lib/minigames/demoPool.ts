// The demo wheel.
//
// Lets someone play a full league pool without owning a league or signing
// in, which the site-wide pool can't quite do on its own: that one deals a
// different league every spin, so it never shows what playing YOUR league
// feels like, where the wheel keeps landing on people you know.
//
// Built entirely from the static demo tree under public/demo/data, the same
// files the demo almanac and the share-hub OG cards read. Nothing here
// touches the database. The demo is a rename of a real league, so the
// squads, players, drafts and finishes are all genuine, just under The
// Lakeside League's names.

import { promises as fs } from 'fs'
import path from 'path'
import { getRankLookup, normPlayerName, type ScoringProfile } from './ranks'
import {
  POOL_POSITIONS,
  isPlayableSquad,
  type Squad,
  type SquadPlayer,
  type PoolPosition,
} from './pool'

export const DEMO_POOL_ID = 'demo'
export const DEMO_POOL_LABEL = 'The Lakeside League'

// The demo tree is a rename of a Half/6pt-passing league, so it has to be
// scored on that profile or every number on the board would be wrong.
const DEMO_PROFILE: ScoringProfile = 'ppr_6pt'

const DEMO_DIR = path.join(process.cwd(), 'public', 'demo', 'data')
const POOL_POSITION_SET = new Set<string>(POOL_POSITIONS)

type PoolFile = {
  managers: Array<{
    user_id: number
    name: string
    seasons: Array<{
      year: number
      final_rank: number | null
      players: Array<{
        name: string
        pos: string
        source: 'draft' | 'pickup'
        round?: number | null
        weeks_started?: number
      }>
    }>
  }>
}

type SeasonFile = {
  year: number
  standings: Array<{
    final_rank: number | null
    team_name: string | null
    owner_name: string | null
    owner_user_id: number
    wins: number | null
    losses: number | null
    ties: number | null
  }>
}

type DraftFile = {
  year: number
  picks: Array<{ player_name: string | null; nfl_team: string | null }>
}

async function readJson<T>(rel: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DEMO_DIR, rel), 'utf8')) as T
  } catch {
    return null
  }
}

// Built once per lambda instance. The demo files only change when the demo
// is resynced, which is a deploy.
let cached: Promise<Squad[]> | null = null

async function build(): Promise<Squad[]> {
  const pool = await readJson<PoolFile>('all_time_pool.json')
  if (!pool?.managers?.length) return []

  const years = [...new Set(pool.managers.flatMap((m) => m.seasons.map((s) => s.year)))]

  // Standings give each squad its team name, record and finish; the draft
  // files are the only place the demo records which NFL team a player was
  // on that year (the rank files carry a present-day team, which is wrong
  // for any past season).
  const [seasonFiles, draftFiles] = await Promise.all([
    Promise.all(years.map((y) => readJson<SeasonFile>(`seasons/${y}.json`))),
    Promise.all(years.map((y) => readJson<DraftFile>(`drafts/${y}.json`))),
  ])

  const standingsByYear = new Map<number, SeasonFile['standings']>()
  years.forEach((y, i) => standingsByYear.set(y, seasonFiles[i]?.standings ?? []))

  // year -> normalized player name -> nfl team
  const teamsByYear = new Map<number, Map<string, string>>()
  years.forEach((y, i) => {
    const m = new Map<string, string>()
    for (const p of draftFiles[i]?.picks ?? []) {
      const key = normPlayerName(p.player_name)
      if (key && p.nfl_team && !m.has(key)) m.set(key, p.nfl_team.toUpperCase())
    }
    teamsByYear.set(y, m)
  })

  // Champion per year is whoever finished first.
  const championByYear = new Map<number, number | null>()
  for (const y of years) {
    const top = (standingsByYear.get(y) ?? []).find((r) => r.final_rank === 1)
    championByYear.set(y, top?.owner_user_id ?? null)
  }

  const out: Squad[] = []
  for (const manager of pool.managers) {
    for (const season of manager.seasons) {
      const ranks = await getRankLookup(DEMO_PROFILE, season.year)
      const standing = (standingsByYear.get(season.year) ?? []).find(
        (r) => r.owner_user_id === manager.user_id
      )
      const teams = teamsByYear.get(season.year)

      const players: SquadPlayer[] = []
      const seen = new Set<string>()
      for (const p of season.players) {
        const pos = (p.pos ?? '').toUpperCase()
        if (!POOL_POSITION_SET.has(pos)) continue
        const key = normPlayerName(p.name)
        if (!key || seen.has(key)) continue
        const rank = ranks.get(key)
        if (!rank || rank.fpts <= 0) continue
        seen.add(key)
        players.push({
          name: p.name,
          pos: (POOL_POSITION_SET.has(rank.position) ? rank.position : pos) as PoolPosition,
          fpts: rank.fpts,
          ppg: rank.ppg,
          posRank: rank.posRank,
          gp: rank.gp,
          nflTeam: teams?.get(key) ?? null,
          playerId: rank.playerId,
          source: p.source === 'draft' ? 'draft' : 'pickup',
          draftRound: p.round ?? null,
          weeksStarted: p.weeks_started ?? 0,
        })
      }
      if (players.length === 0) continue
      players.sort((a, b) => b.ppg - a.ppg)

      const squad: Squad = {
        key: `demo-${manager.user_id}-${season.year}`,
        seasonId: `demo-${season.year}`,
        managerId: `demo-${manager.user_id}`,
        leagueSlug: DEMO_POOL_ID,
        leagueName: DEMO_POOL_LABEL,
        leagueAbbr: 'LSL',
        profile: DEMO_PROFILE,
        year: season.year,
        managerName: standing?.owner_name ?? manager.name,
        teamName: standing?.team_name ?? null,
        wins: standing?.wins ?? 0,
        losses: standing?.losses ?? 0,
        ties: standing?.ties ?? 0,
        finalRank: standing?.final_rank ?? season.final_rank ?? null,
        isChampion: championByYear.get(season.year) === manager.user_id,
        players,
        lineupsKnown: players.some((p) => p.weeksStarted > 0),
        draftsKnown: players.some((p) => p.source === 'draft'),
      }
      if (isPlayableSquad(squad)) out.push(squad)
    }
  }
  return out
}

export function loadDemoSquads(): Promise<Squad[]> {
  if (!cached) {
    const fresh = build()
    cached = fresh
    // Don't remember a failed read for the life of the instance.
    void fresh.catch(() => {
      if (cached === fresh) cached = null
    })
  }
  return cached
}
