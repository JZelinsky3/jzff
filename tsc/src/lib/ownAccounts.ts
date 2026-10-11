// Joey's own accounts. None of them ever counts as a user in a report: every
// time he opens a page to check on the site he would be "active today" and
// bump the very number he's checking.
//
// That's every site admin (jzffgames@ is the main one) plus the zelinsky
// logins he made to test copies of pams, which aren't admins.

import { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>
type AuthUser = { id: string; email?: string | null }

const OWN_EMAIL = /zelinsky|jzffgames/i

export function isOwnEmail(email: string | null | undefined): boolean {
  return !!email && OWN_EMAIL.test(email)
}

/** Ids to leave out of user counts. Pass `users` when the page already listed them. */
export async function ownAccountIds(db: Db, users?: AuthUser[]): Promise<Set<string>> {
  const [{ data: admins }, list] = await Promise.all([
    db.from('site_admins').select('user_id'),
    users ? Promise.resolve(users) : db.auth.admin.listUsers({ perPage: 1000 }).then((r) => r.data?.users ?? []),
  ])
  const ids = new Set((admins ?? []).map((r) => r.user_id as string))
  for (const u of list) if (isOwnEmail(u.email)) ids.add(u.id)
  return ids
}
