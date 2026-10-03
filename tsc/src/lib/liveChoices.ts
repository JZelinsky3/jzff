// What the Current Season page lets a commissioner pick: this NFL year's
// season, and the sources that can actually sync it.
//
// Every year and every source used to be on offer. Marking 2021 live was
// only ever useful for testing against a finished season, and pointing the
// weekly sync at an NFL.com source or an old Sleeper league can't produce
// this year's games, so for a commissioner it was a list of ways to break
// the live pages. Site admins can still reach the rest from a fold-out
// (mock testing against an old season is how pick'ems and power rankings
// get checked).
//
// Whatever is live right now always stays in the list, even when it's a
// past year, so the page shows the truth and there's a way off it. Those
// come back marked `stale`.

import { getNflClock } from '@/lib/nflClock'

// The NFL year in play: Sleeper's clock when it answers, otherwise the
// calendar, where January and February still belong to last season.
export async function currentNflYear(): Promise<number> {
  const clock = await getNflClock()
  if (clock) return clock.season
  const d = new Date()
  return d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1
}

type SeasonLike = { id: string; year: number; is_live: boolean; external_id?: string | null }
type SourceLike = { id: string; platform: string; external_id: string; is_live: boolean; settings?: unknown }

export function splitSeasons<T extends SeasonLike>(seasons: T[], year: number) {
  const picks: (T & { stale: boolean })[] = []
  const rest: T[] = []
  for (const s of seasons) {
    if (s.year === year || s.is_live) picks.push({ ...s, stale: s.year !== year })
    else rest.push(s)
  }
  return { picks, rest }
}

// A source can sync this year when its platform still exists, its year
// range (if it has one) reaches this year, and, once this year's season row
// exists, it's the source that wrote it: the season's external_id is the
// league id that produced it on Sleeper, ESPN and Yahoo alike. Before
// anything has synced this year there's no proof either way, so every
// source that could is offered.
export function syncableSourceIds(sources: SourceLike[], seasons: SeasonLike[], year: number): Set<string> {
  const inRange = (s: SourceLike) => {
    const set = (s.settings ?? {}) as { season_start?: unknown; season_end?: unknown }
    return (
      (typeof set.season_start !== 'number' || set.season_start <= year) &&
      (typeof set.season_end !== 'number' || set.season_end >= year)
    )
  }
  // NFL.com fantasy is gone; a source on it can never sync a new season.
  const usable = sources.filter((s) => s.platform !== 'nfl' && inRange(s))
  const thisYear = seasons.find((s) => s.year === year)?.external_id
  const proven = thisYear ? usable.filter((s) => s.external_id === thisYear) : []
  return new Set((proven.length > 0 ? proven : usable).map((s) => s.id))
}

export function splitSources<T extends SourceLike>(sources: T[], seasons: SeasonLike[], year: number) {
  const keep = syncableSourceIds(sources, seasons, year)
  const picks: (T & { stale: boolean })[] = []
  const rest: T[] = []
  for (const s of sources) {
    if (keep.has(s.id) || s.is_live) picks.push({ ...s, stale: !keep.has(s.id) })
    else rest.push(s)
  }
  return { picks, rest }
}
