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

// Only derivable from the calendar. A manual `current_week` pin overrides
// the date maths entirely, so any deadline would be fiction — it returns
// null, the UI shows no deadline, and nothing enforces one. That is what
// keeps mock-testing against an old season submittable.
export function resolveWeekLockAt(
  settings: Record<string, unknown> | null | undefined,
  week: number,
): string | null {
  const s = settings ?? {}
  if (typeof s.current_week === 'number') return null
  if (typeof s.season_start_date !== 'string') return null
  if (!Number.isFinite(week) || week < 1 || week > MAX_WEEK) return null
  const startMs = Date.parse(s.season_start_date)
  if (Number.isNaN(startMs)) return null

  // season_start_date is the Tuesday that opens week 1 (fantasy weeks roll
  // over after Monday Night Football), so this lands on the Tuesday that
  // opens the requested week. Bare YYYY-MM-DD parses as UTC midnight, and
  // the getUTC* reads below keep it there.
  const weekStart = new Date(startMs + (week - 1) * WEEK_MS)

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
