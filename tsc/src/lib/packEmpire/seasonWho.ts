// Who's asking, for a Season. SERVER ONLY.
//
// An account if they're signed in, otherwise this browser, by the same cookie
// the Daily hands out (dailyWho.ts), so a browser is one guest across both. A
// signed-in viewer still carrying the cookie just signed in: their solo seasons
// move onto the account here, the first time we see both.

import { cookies } from 'next/headers'
import { DAILY_COOKIE } from './dailyWho'
import { hashKey } from './people'
import { claimSeasons, type SeasonWho } from './season'

export async function seasonViewer(userId: string | null): Promise<SeasonWho | null> {
  const guestKey = hashKey((await cookies()).get(DAILY_COOKIE)?.value)
  if (userId) {
    if (guestKey) await claimSeasons(userId, guestKey)
    return { userId }
  }
  return guestKey ? { guestKey } : null
}
