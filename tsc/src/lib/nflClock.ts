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
  /** ISO date week 1 opened ("2026-09-09"), when Sleeper reports one. */
  seasonStartDate?: string
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
      clock = {
        season,
        week: st.week,
        seasonType: st.season_type,
        seasonStartDate: typeof st.season_start_date === 'string' ? st.season_start_date : undefined,
      }
    }
  } catch {
    clock = null
  }
  cache = { at: Date.now(), clock }
  return clock
}

// ── The calendar ─────────────────────────────────────────────────────────
//
// Week 1 opens on the Tuesday after Labor Day (the first Monday of
// September), every year since the league went to Thursday openers: 2019
// Sep 3, 2021 Sep 7, 2024 Sep 3, 2026 Sep 8. Every later week opens seven
// days after the one before. So the whole calendar for any season follows
// from the year alone and nobody has to type one in.
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

export function week1TuesdayUtc(year: number): number {
  const sept1 = new Date(Date.UTC(year, 8, 1)).getUTCDay() // 0 = Sunday
  const laborDay = 1 + ((1 - sept1 + 7) % 7)
  return Date.UTC(year, 8, laborDay + 1)
}

// Which fantasy week a moment belongs to: 0 before week 1 opens (the
// preseason), then 1 through 18. A week rolls over once Monday night is
// finished; 07:00 UTC Tuesday is 3 AM Eastern, past even a late Monday
// doubleheader. A trade at 1 AM after the last game was made with that
// week in the books, so it belongs to the next one.
// `seasonStartDate` (the stored Tuesday that opens week 1) wins over the
// computed one when a season has it.
export function nflWeekAt(year: number, at: string | number | Date, seasonStartDate?: string | null): number {
  const parsedStart = seasonStartDate ? Date.parse(seasonStartDate) : NaN
  const start = Number.isFinite(parsedStart) ? parsedStart : week1TuesdayUtc(year)
  const t = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at)
  if (!Number.isFinite(t)) return 0
  const rollover = start + 7 * 60 * 60 * 1000
  if (t < rollover) return 0
  return Math.min(18, Math.floor((t - rollover) / WEEK_MS) + 1)
}

// Can `year` have a champion yet? Only once its last fantasy week is over.
// Fails CLOSED, unlike weekIsFinal: with no clock, only a season from an
// earlier calendar year counts, because naming a champion early is exactly
// the bug this guards (an ESPN league crowned its 2-0 team in week 3).
export function seasonIsDecided(year: number, lastWeek: number | null | undefined, clock: NflClock | null): boolean {
  if (!clock) return year < new Date().getUTCFullYear()
  return weekIsFinal(year, Math.min(18, lastWeek ?? 17), clock)
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
