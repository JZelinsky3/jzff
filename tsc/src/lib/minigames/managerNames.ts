// What a league calls its managers.
//
// Every game used to read `managers.display_name` straight off the platform
// row, which is the name Sleeper or NFL.com happened to hold. It is not
// necessarily the name the league uses: a commissioner who merges two
// platform accounts into one person, or renames one, writes that on the
// MANAGER PROFILE as `canonical_name`, and every other page on the site
// (rivalries, the almanac, the pickers) reads it from there. The games did
// not, so a league that renamed Sean to Costigan saw Sean on the wheel and
// Costigan everywhere else.
//
// One helper, used by all five dealers, so the next game does not have to
// remember this.

import type { SupabaseClient } from '@supabase/supabase-js'
import { pageAll } from './pool'

type ManagerRow = { id: string; display_name: string | null; profile_id: string | null }

export type ManagerIdentity = {
  /** The league's name for this manager. */
  name: string
  /** One key per PERSON: the profile id where the manager rows have been
      merged, the manager's own id where they haven't. Two rows that are one
      person share it, which is what stops a merged manager appearing as two
      identical answers in a game that asks you to name him. */
  groupId: string
}

/**
 * manager id -> the league's name for that manager.
 *
 * `canonical_name` on the manager's profile wins where there is one, the
 * platform display name otherwise. Managers merged into one profile all map
 * to the same name, which is the point: they are one person.
 */
export async function loadManagerNames(
  db: SupabaseClient,
  leagueIds: string[]
): Promise<Map<string, string>> {
  const ids = await loadManagerIdentities(db, leagueIds)
  return new Map([...ids].map(([id, v]) => [id, v.name]))
}

/** As above, plus which manager rows are the same person. */
export async function loadManagerIdentities(
  db: SupabaseClient,
  leagueIds: string[]
): Promise<Map<string, ManagerIdentity>> {
  const out = new Map<string, ManagerIdentity>()
  if (leagueIds.length === 0) return out

  const [managerRows, profileRows] = await Promise.all([
    pageAll<ManagerRow>(() =>
      db
        .from('managers')
        .select('id, display_name, profile_id')
        .in('league_id', leagueIds)
        .order('id')
    ),
    pageAll<{ id: string; canonical_name: string | null }>(() =>
      db
        .from('manager_profiles')
        .select('id, canonical_name')
        .in('league_id', leagueIds)
        .order('id')
    ),
  ])

  const canonical = new Map<string, string>()
  for (const p of profileRows) {
    const name = p.canonical_name?.trim()
    if (name) canonical.set(p.id, name)
  }

  for (const m of managerRows) {
    const name =
      (m.profile_id ? canonical.get(m.profile_id) : null) || m.display_name?.trim() || null
    if (name) out.set(m.id, { name, groupId: m.profile_id ?? m.id })
  }
  return out
}
