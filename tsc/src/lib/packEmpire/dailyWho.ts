// Who's asking, for the Daily. SERVER ONLY.
//
// An account if they're signed in, otherwise this browser: a cookie handed out
// when they start their first Daily. It's a cookie and not localStorage so the
// page can know them on first render, and httpOnly because it's the only thing
// that makes the run theirs.

import { cookies } from 'next/headers'
import { claimDaily, type DailyWho } from './daily'
import { hashKey } from './people'

export const DAILY_COOKIE = 'tsc_daily_guest'

/** As long as a browser lets a cookie live. */
export const DAILY_COOKIE_AGE = 60 * 60 * 24 * 400

/** A signed-in viewer with a guest cookie just signed up, or signed back in:
    their guest runs move to the account here, the first time we see both. */
export async function dailyViewer(userId: string | null): Promise<DailyWho | null> {
  const guestKey = hashKey((await cookies()).get(DAILY_COOKIE)?.value)
  if (userId) {
    if (guestKey) await claimDaily(userId, guestKey)
    return { userId }
  }
  return guestKey ? { guestKey } : null
}
