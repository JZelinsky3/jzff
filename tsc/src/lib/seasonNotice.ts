// "The season started without you" notice for the league hub.
//
// Every live feature (Pick'ems, Power Rankings, Matchup Preview, Sunday
// Live, the Form Sheet, the weekly re-sync) hangs off two settings a
// commissioner has to set by hand: a season row flagged is_live, and a week
// that resolveCurrentWeek can actually resolve. Miss either and the pages
// render but say nothing, with no hint about which switch is off.
//
// Nobody notices in July. They notice in September, which is exactly when
// it costs them a week of the season. So once the NFL is actually playing,
// the hub says so and points at the switch.

import { getNflClock } from '@/lib/nflClock'
import { resolveCurrentWeek } from '@/lib/liveSeason'

export type SeasonNoticeKind =
  // No season row for the current year at all — they haven't synced since
  // the platform rolled over to the new season.
  | 'no-season'
  // The year is in the archive but no season is flagged live.
  | 'not-live'
  // A season is live but neither a start date nor a week pin is set, so
  // resolveCurrentWeek returns null and every live page reads "no week".
  | 'no-week'

export type SeasonNotice = { kind: SeasonNoticeKind; year: number; week: number }

type SeasonLike = {
  year: number
  is_live?: boolean | null
  settings?: unknown
}

// Returns null when there's nothing to say: the offseason, a league that's
// already running, or one whose commissioner has dismissed this year's
// notice. `dismissedYear` comes from leagues.settings.season_notice_year.
export async function getSeasonNotice(
  seasons: SeasonLike[],
  dismissedYear?: number | null,
): Promise<SeasonNotice | null> {
  const clock = await getNflClock()
  // Only nag while games are being played. 'pre' and 'off' mean there is
  // genuinely nothing to switch on yet.
  if (!clock || clock.seasonType !== 'regular' || clock.week < 1) return null
  const year = clock.season
  if (dismissedYear === year) return null

  const live = seasons.find((s) => s.is_live)
  if (live) {
    const week = resolveCurrentWeek((live.settings ?? {}) as Record<string, unknown>)
    if (week != null) return null // running fine, say nothing
    return { kind: 'no-week', year: live.year, week: clock.week }
  }

  const hasYear = seasons.some((s) => s.year === year)
  return { kind: hasYear ? 'not-live' : 'no-season', year, week: clock.week }
}

// Copy for each state. Kept here rather than in the two callout components
// so the desktop card and the mobile pill can't drift apart.
export function seasonNoticeCopy(n: SeasonNotice): {
  title: string
  titleEm: string
  desc: string
  cta: string
  href: (slug: string) => string
} {
  switch (n.kind) {
    case 'no-season':
      return {
        title: 'Week ' + n.week + ' has',
        titleEm: 'kicked off.',
        desc:
          `Your archive doesn't have a ${n.year} season yet. Sync your source to pull ` +
          'this year\'s rosters and schedule, then set it as the current season.',
        cta: 'Sync',
        href: (slug) => `/league/${slug}/sources`,
      }
    case 'not-live':
      return {
        title: 'Week ' + n.week + ' has',
        titleEm: 'kicked off.',
        desc:
          `${n.year} is in your archive but isn't marked as the current season, so ` +
          'Pick\'ems, Power Rankings and the weekly refresh are all still asleep.',
        cta: 'Set it',
        href: (slug) => `/league/${slug}/live`,
      }
    case 'no-week':
      return {
        title: n.year + ' is live, but',
        titleEm: 'has no week.',
        desc:
          'Set the season start date so the week advances on its own. Until then every ' +
          'live page has a season to read and no week to show for it.',
        cta: 'Set it',
        href: (slug) => `/league/${slug}/live`,
      }
  }
}
