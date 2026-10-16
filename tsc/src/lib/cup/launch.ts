// The League Cup's launch for every league: one place for the dates the
// banner, the countdown page and the recap all print.
//
// Until a league has its own Cup row (league_cups), a league with a live
// season this year gets the launch instead: the almanac banner says when it
// starts, and /leagues/<slug>/cup/ is a preview with a countdown to the draw
// and the bracket as it would be drawn from today's standings.

export const CUP_LAUNCH = {
  year: 2026,
  name: 'The League Cup',
  // The draw: Wednesday, October 28, 9 AM Eastern (still daylight time, so
  // 13:00 UTC). Seeds are the Cup Rating after week 7.
  drawAt: '2026-10-28T13:00:00.000Z',
  seededThrough: 7,
  startWeek: 8,
} as const

// "Wednesday, October 28th". A spelled-out month takes the ordinal (Joey);
// the short form below doesn't.
export function drawDayText(): string {
  const at = new Date(CUP_LAUNCH.drawAt)
  const base = at.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' })
  const day = Number(at.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'America/New_York' }))
  const v = day % 100
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th'
  return `${base}${suffix}`
}

// "Wed, Oct 28"
export function drawDayShort(): string {
  return new Date(CUP_LAUNCH.drawAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
}

// The calendar day of the draw in Eastern time, to tell "today" apart.
function easternDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

// Where the launch stands at `now`: before the draw day, on it, or after it.
// Once a league's Cup exists, its own banner and page take over; the launch
// banner only ever promises the draw, so it comes down after the draw day.
export function launchPhase(now: number = Date.now()): 'before' | 'today' | 'after' {
  const at = Date.parse(CUP_LAUNCH.drawAt)
  if (easternDay(now) === easternDay(at)) return 'today'
  return now < at ? 'before' : 'after'
}
