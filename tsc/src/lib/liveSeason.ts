// Resolving the current pick'ems / power-rankings week for a live season.
//
// Stored in seasons.settings:
//  - `season_start_date` (ISO date) — the Tuesday that opens week 1. When
//    set, the calendar drives: the week advances one per 7 days, and every
//    week gets a Thursday pick'ems deadline.
//  - `current_week` (number) + `current_week_set_at` (ISO instant) — the
//    commissioner's override. With a start date it is an OFFSET, not a
//    freeze: "it's week 3 right now" shifts the calendar by however far it
//    was off, and the week keeps advancing from there.
//  - `current_week` with no start date — a true freeze. That's how mock
//    testing against an old, fully scored season works.
//
// The pin used to win outright even when a start date was set. pams pinned
// week 2 once and the season stopped: the week never rolled to 3, pick'ems
// and power rankings sat on week 2, and because a pin also switched the
// deadline off, pick'ems stayed open all week. A pin saved before
// `current_week_set_at` existed has no moment to measure from, so with a
// start date it is ignored rather than allowed to freeze the season again.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const MAX_WEEK = 18 // NFL regular season

function startMsOf(s: Record<string, unknown>): number | null {
  if (typeof s.season_start_date !== 'string') return null
  const ms = Date.parse(s.season_start_date)
  return Number.isNaN(ms) ? null : ms
}

// Unclamped calendar week at an instant, counted from the start date.
function calendarWeekAt(startMs: number, at: number): number {
  return Math.floor((at - startMs) / WEEK_MS) + 1
}

// How many weeks the commissioner's override shifts the calendar. 0 when
// there is no override, or it's a legacy pin with no timestamp.
function pinOffset(s: Record<string, unknown>, startMs: number): number {
  if (typeof s.current_week !== 'number') return 0
  if (typeof s.current_week_set_at !== 'string') return 0
  const setAt = Date.parse(s.current_week_set_at)
  if (Number.isNaN(setAt)) return 0
  return s.current_week - calendarWeekAt(startMs, setAt)
}

export function resolveCurrentWeek(settings: Record<string, unknown> | null | undefined): number | null {
  const s = settings ?? {}

  const startMs = startMsOf(s)
  if (startMs != null) {
    const week = calendarWeekAt(startMs, Date.now()) + pinOffset(s, startMs)
    return Math.min(MAX_WEEK, Math.max(1, week))
  }

  // No calendar: a pin is a freeze (mock testing against an old season).
  if (typeof s.current_week === 'number') return s.current_week

  return null
}

// ── The pick'ems deadline ────────────────────────────────────────────────
//
// Picks close at kickoff of Thursday Night Football: 8:00 PM Eastern on the
// Thursday of that week. This used to be the moment the season rolled past
// the week (Tuesday), which meant Thursday and Sunday games could be picked
// after they had already been played.
//
// Eastern, not the server's zone: Vercel runs UTC, so building this from a
// local-time constructor would put the deadline four or five hours off, and
// the error would change halfway through the season when DST ends. The
// deadline is a fixed wall-clock time in one zone and gets converted to a
// real instant here. Readers see it in their own zone: `locks_at` goes out
// as an ISO instant and the board formats it with toLocaleTimeString.
const LOCK_TZ = 'America/New_York'
const LOCK_HOUR = 20 // 8:00 PM
const THURSDAY = 4 // Date.getUTCDay()

// How far is `timeZone` from UTC at this instant, in ms? Positive east of
// Greenwich. Derived by asking Intl what wall clock the instant shows there
// and diffing against the UTC wall clock, which is the only way to get a
// zone's offset (including DST) without shipping a timezone library.
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant))

  const at: Record<string, number> = {}
  for (const p of parts) if (p.type !== 'literal') at[p.type] = Number(p.value)
  // Intl can emit hour 24 for midnight under hour12:false.
  const asIfUTC = Date.UTC(at.year, at.month - 1, at.day, at.hour % 24, at.minute, at.second)
  return asIfUTC - instant
}

// The instant at which the given wall clock occurs in `timeZone`.
//
// Solved by iteration because the offset depends on the answer: guess that
// the wall clock is UTC, correct by the offset at that guess, then correct
// once more. The second pass only matters when the first guess lands on the
// far side of a DST transition, which an 8 PM deadline never does, but it
// costs one Intl call and removes the class of bug entirely.
function wallClockToInstant(
  y: number, m: number, d: number, hour: number, timeZone: string,
): number {
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0)
  let ts = guess - zoneOffsetMs(guess, timeZone)
  ts = guess - zoneOffsetMs(ts, timeZone)
  return ts
}

// Only derivable from the calendar. With no start date there is nothing to
// hang a deadline on (a frozen mock-testing pin), so it returns null, the UI
// shows no deadline, and nothing enforces one. That is what keeps
// mock-testing against an old season submittable. A commissioner override
// on a dated season shifts the deadlines along with the week.
export function resolveWeekLockAt(
  settings: Record<string, unknown> | null | undefined,
  week: number,
): string | null {
  const s = settings ?? {}
  if (!Number.isFinite(week) || week < 1 || week > MAX_WEEK) return null
  const startMs = startMsOf(s)
  if (startMs == null) return null
  const calWeek = week - pinOffset(s, startMs)

  // season_start_date is the Tuesday that opens week 1 (fantasy weeks roll
  // over after Monday Night Football), so this lands on the Tuesday that
  // opens the requested week. Bare YYYY-MM-DD parses as UTC midnight, and
  // the getUTC* reads below keep it there.
  const weekStart = new Date(startMs + (calWeek - 1) * WEEK_MS)

  // Walk forward to that week's Thursday. Written as a search rather than
  // "+2 days" so a start date saved on some other weekday still resolves to
  // a Thursday instead of silently sliding the deadline off kickoff.
  const toThursday = (THURSDAY - weekStart.getUTCDay() + 7) % 7
  const thu = new Date(weekStart.getTime() + toThursday * 24 * 60 * 60 * 1000)

  return new Date(
    wallClockToInstant(
      thu.getUTCFullYear(), thu.getUTCMonth() + 1, thu.getUTCDate(), LOCK_HOUR, LOCK_TZ,
    ),
  ).toISOString()
}

// Has the pick'ems deadline for `week` already passed?
//
// False when no deadline is derivable (manual week pin, no start date) —
// absent a deadline nothing is enforced, matching what the board displays.
export function isWeekLocked(
  settings: Record<string, unknown> | null | undefined,
  week: number,
  now: number = Date.now(),
): boolean {
  const at = resolveWeekLockAt(settings, week)
  if (at === null) return false
  return now >= Date.parse(at)
}
