// The NFL clock — "is this fantasy week actually over?"
//
// Every platform happily hands back partial scores while a week is still
// being played. On a Thursday you get a 15.2 against an opponent's 0.0
// because one manager started the Thursday-night tight end and the other
// didn't. Store that and we've invented a result: the 15.2 becomes a win,
// the 0.0-vs-0.0 pairs become ties, and standings, power rankings, the
// form sheet and the Monte Carlo projections all treat the phantom week as
// real. (September 2026, week 1: six pams teams carried a record before a
// single Sunday game kicked off.)
//
// So scores only get written once the week's last NFL game is done.
// Sleeper's /state/nfl is public, unauthenticated and league-agnostic, so
// all three platform ingests read it rather than trusting each platform's
// own "latest scoring period", which advances the moment a week *opens*.

import { sleeper } from '@/lib/platforms/sleeper'

export type NflClock = {
  season: number
  week: number
  /** 'pre' | 'regular' | 'post' | 'off' */
  seasonType: string
}

const TTL_MS = 5 * 60 * 1000
let cache: { at: number; clock: NflClock | null } | null = null

// One fetch per ingest run (and per warm lambda, for five minutes). A miss
// resolves to null rather than throwing — see weekIsFinal for why that's
// deliberately the permissive answer.
export async function getNflClock(): Promise<NflClock | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.clock
  let clock: NflClock | null = null
  try {
    const st = await sleeper.state()
    const season = parseInt(st?.season ?? '', 10)
    if (st && Number.isFinite(season) && typeof st.week === 'number') {
      clock = { season, week: st.week, seasonType: st.season_type }
    }
  } catch {
    clock = null
  }
  cache = { at: Date.now(), clock }
  return clock
}

// Has every NFL game counting toward `week` of `year` been played?
//
// Fails OPEN (true) when the clock is unavailable. A failed state fetch
// must never blank out a decade of historical scores; the worst case of
// guessing "final" is one stale in-progress week, which the next sync
// corrects. Guessing "not final" would null real results.
export function weekIsFinal(year: number, week: number, clock: NflClock | null): boolean {
  if (!clock) return true
  if (year < clock.season) return true
  if (year > clock.season) return false

  // Current season.
  switch (clock.seasonType) {
    case 'pre':
      // Preseason: no regular-season week has been played yet.
      return false
    case 'post':
    case 'off':
      // The regular season is over, so every fantasy week is settled.
      return true
    default:
      // In-season: `week` is the week currently being played. Sleeper rolls
      // it over on the Tuesday after Monday night, which is exactly when the
      // previous week's scores stop moving.
      return week < clock.week
  }
}
