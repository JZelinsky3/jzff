// Server-side reader for the historical fantasy rank files that back the
// Games Page.
//
// The almanac already ships one JSON per (scoring profile, year) at
// public/data/fantasy_ranks/<profile>/<year>.json — the same files the
// All-Time Team page and the Draft Grader join against in the browser.
// Roster Roulette needs the same numbers, but server-side: the deal API
// hands the client finished player cards (points + positional finish
// already attached) so the browser never has to pull a 550-player file
// per spin, and so a future leaderboard can re-score a run from its seed
// without trusting anything the client says.
//
// Files are read once per (profile, year) and kept in module scope. On
// Vercel that means one disk read per lambda instance per year touched;
// the whole 2014-2025 span for one profile is well under a megabyte.

import { promises as fs } from 'fs'
import path from 'path'

export const SCORING_PROFILES = [
  'ppr_6pt',
  'ppr_4pt',
  'half_6pt',
  'half_4pt',
  'std_6pt',
  'std_4pt',
] as const

export type ScoringProfile = (typeof SCORING_PROFILES)[number]

// What the site-wide pool scores on. League pools use the league's own
// draft_scoring_profile so a squad's numbers match what that league's
// almanac prints; the site pool has no single league to inherit from, so
// it pins one profile and every cross-league run stays comparable.
export const SITE_PROFILE: ScoringProfile = 'half_4pt'

export function isScoringProfile(v: string | null | undefined): v is ScoringProfile {
  return !!v && (SCORING_PROFILES as readonly string[]).includes(v)
}

// Rank files exist for these years only. Published leagues currently reach
// back to 2014, and the current season has no finished stat line, so the
// pool clamps to this window rather than silently dealing empty squads.
export const FIRST_RANK_YEAR = 2009
export const LAST_RANK_YEAR = 2025

export type RankEntry = {
  fpts: number
  /** Per-game average — what the game actually scores on. */
  ppg: number
  posRank: number
  overall: number
  gp: number
  position: string
  /**
   * Sleeper player id, which doubles as the headshot key:
   * https://sleepercdn.com/content/nfl/players/thumb/<id>.jpg — served for
   * retired players too, so 2012 rosters get faces.
   *
   * Note there is deliberately no `nflTeam` here. The rank files carry a
   * `team` field, but it is a present-day snapshot rather than the team the
   * player was on that season — it lists Aaron Rodgers on PIT in 2012, and
   * is null for anyone since retired. The per-season truth lives on
   * draft_picks.nfl_team / weekly_lineups.nfl_team instead.
   */
  playerId: string | null
}

export type RankLookup = Map<string, RankEntry>

type RankFilePlayer = {
  player_name?: string
  player_id?: string
  position?: string
  fpts?: number
  rank?: number
  gp?: number
}

// Matches normName in public/pams-template/assets/js/all-time-team.js and
// draft-grade.js. Keep the three in step: a name that joins on the almanac
// must join here, or the same player-season would score differently on two
// surfaces of the same site. Curly apostrophes are escaped rather than
// literal so the class survives a re-encoding of this file.
export function normPlayerName(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[.‘’']/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const RANKS_ROOT = path.join(process.cwd(), 'public', 'data', 'fantasy_ranks')

const cache = new Map<string, Promise<RankLookup>>()

async function readLookup(profile: ScoringProfile, year: number): Promise<RankLookup> {
  const file = path.join(RANKS_ROOT, profile, `${year}.json`)
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf-8')
  } catch {
    return new Map()
  }
  let players: RankFilePlayer[]
  try {
    players = (JSON.parse(raw)?.players ?? []) as RankFilePlayer[]
  } catch {
    return new Map()
  }

  // Positional rank is recomputed from points rather than trusted from the
  // file, exactly as the client-side lookup does — that way the finish we
  // print always agrees with the profile the squad is being scored on,
  // whatever order the file happened to arrive in.
  const byPos = new Map<string, RankFilePlayer[]>()
  for (const p of players) {
    const pos = (p.position ?? '?').toUpperCase()
    const bucket = byPos.get(pos)
    if (bucket) bucket.push(p)
    else byPos.set(pos, [p])
  }

  const lookup: RankLookup = new Map()
  for (const [pos, bucket] of byPos) {
    bucket.sort((a, b) => (b.fpts ?? 0) - (a.fpts ?? 0))
    bucket.forEach((p, i) => {
      const key = normPlayerName(p.player_name)
      if (!key) return
      // First writer wins: the list is already sorted by points within the
      // position, so a duplicate name resolves to the better season.
      if (lookup.has(key)) return
      const fpts = Math.round((p.fpts ?? 0) * 10) / 10
      const gp = p.gp ?? 0
      // No games logged means no per-game rate exists, and this game is
      // scored on PPG. A handful of players per year land here (the rank
      // files leave gp null for a few — Ronald Jones II in 2019 and 2021,
      // plus assorted scrubs). Treating their season total as a PPG made
      // them the best "per-game" player on any board by a factor of ten,
      // so they are simply not scorable.
      if (gp <= 0) return
      lookup.set(key, {
        fpts,
        ppg: Math.round((fpts / gp) * 100) / 100,
        posRank: i + 1,
        overall: p.rank ?? 0,
        gp,
        position: pos,
        playerId: p.player_id ?? null,
      })
    })
  }
  return lookup
}

export function getRankLookup(profile: ScoringProfile, year: number): Promise<RankLookup> {
  const key = `${profile}|${year}`
  const hit = cache.get(key)
  if (hit) return hit
  const fresh = readLookup(profile, year)
  cache.set(key, fresh)
  // A read that blew up shouldn't poison the slot for the life of the
  // instance — drop it so the next caller retries.
  fresh.catch(() => cache.delete(key))
  return fresh
}
