// Resolving the current pick'ems / power-rankings week for a live season.
//
// Two modes, stored in seasons.settings:
//  - `season_start_date` (ISO date) — the week the season opens. When set, the
//    current week auto-advances from the calendar: one week per 7 days.
//  - `current_week` (number) — a manual pin. When set, it always wins, so the
//    commissioner can override a delayed/odd week (and it's how mock testing
//    against an old season works).
//
// Resolution order: manual pin → calendar-derived → null (not configured).

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const MAX_WEEK = 18 // NFL regular season

export function resolveCurrentWeek(settings: Record<string, unknown> | null | undefined): number | null {
  const s = settings ?? {}

  // Manual pin / mock-testing value — always wins.
  if (typeof s.current_week === 'number') return s.current_week

  // Calendar-derived.
  if (typeof s.season_start_date === 'string') {
    const startMs = Date.parse(s.season_start_date)
    if (!Number.isNaN(startMs)) {
      const weeks = Math.floor((Date.now() - startMs) / WEEK_MS) + 1
      return Math.min(MAX_WEEK, Math.max(1, weeks))
    }
  }

  return null
}

// When does `week` stop being the current week?
//
// Pick'ems locks a week the moment the season rolls past it, so that
// instant is the picking deadline. Readers had no way to see it: the board
// said "Open for picks" right up until it silently said "Locked".
//
// Only derivable from the calendar. A manual `current_week` pin overrides
// the date maths entirely, so the boundary would be fiction; so would a
// week at MAX_WEEK, which the clamp in resolveCurrentWeek never advances
// past. Both return null and the UI shows no deadline rather than a wrong
// one.
export function resolveWeekLockAt(
  settings: Record<string, unknown> | null | undefined,
  week: number,
): string | null {
  const s = settings ?? {}
  if (typeof s.current_week === 'number') return null
  if (typeof s.season_start_date !== 'string') return null
  if (!Number.isFinite(week) || week < 1 || week >= MAX_WEEK) return null
  const startMs = Date.parse(s.season_start_date)
  if (Number.isNaN(startMs)) return null
  return new Date(startMs + week * WEEK_MS).toISOString()
}
