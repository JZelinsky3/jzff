// Who can reach the Locker. It's being built in the open on master, so until this
// flips it's site admins only (and anyone on a dev server). Everyone else gets a
// 404, the same as /admin. To launch: set LOCKER_LIVE. The way in is the strip on the
// Pack Empire front page, which asks this function, so it opens with it.

import { isSiteAdmin } from '@/lib/siteAdmin'

export const LOCKER_LIVE = false

export async function lockerOpenTo(userId: string | null | undefined): Promise<boolean> {
  if (LOCKER_LIVE || process.env.NODE_ENV !== 'production') return true
  return isSiteAdmin(userId)
}
