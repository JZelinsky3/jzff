// Whose name goes on a board row.
//
// Three layers, because there are two different boards and one bad default:
//
//   A single LEAGUE board, where the player has claimed a manager, shows the
//   manager's name and face. That is the name everyone reading the board
//   already uses, and a site account name in its place reads as a stranger.
//
//   Every OTHER board — the site pool, a combined wheel, the demo — has no
//   manager identity of its own, since there is no such thing as one person
//   across two leagues here. But somebody who has said who they are in their
//   own league has told us the name they go by, and it beats what the site
//   would otherwise print: display names are seeded from the email address,
//   so the SQL falls back to the member code and the board fills up with
//   `jz-8f3q`. Their most recent claim stands in.
//
//   Anything still unresolved keeps whatever the board's SQL worked out.
//
// The claim itself lives in `league_claims`, and is asked for at the first
// post to a league board and again on the board. See 0049_league_claims.sql.

import { createAdminClient } from '@/lib/supabase/admin'
import { DEMO_POOL_ID } from './demoPool'

export type BoardIdentity = { name: string; avatar: string | null }

/** The one league a pool is, or null if it isn't exactly one. */
export function soleLeagueSlug(poolId: string): string | null {
  if (!poolId || poolId === 'site' || poolId === DEMO_POOL_ID) return null
  const slugs = poolId.split(',').filter(Boolean)
  if (slugs.length !== 1) return null
  return /^[a-z0-9-]{1,80}$/.test(slugs[0]) ? slugs[0] : null
}

type ManagerRow = {
  id: string
  profile_id: string | null
  display_name: string | null
  avatar_url: string | null
}

/**
 * League names for the accounts on one board.
 *
 * Returns an empty map for any pool that isn't exactly one league, and for
 * any account with no claim in it, so callers can overlay it unconditionally
 * and get the fallback for free.
 */
export async function resolveLeagueIdentities(
  poolId: string,
  userIds: string[]
): Promise<Map<string, BoardIdentity>> {
  const out = new Map<string, BoardIdentity>()
  const slug = soleLeagueSlug(poolId)
  if (!slug || userIds.length === 0) return out

  const db = createAdminClient()
  const { data: league } = await db.from('leagues').select('id').eq('slug', slug).maybeSingle()
  if (!league) return out

  const { data: claims } = await db
    .from('league_claims')
    .select('profile_id, manager_id')
    .eq('league_id', league.id)
    .in('profile_id', [...new Set(userIds)])
  if (!claims || claims.length === 0) return out

  // Canonical name when the person's manager rows have been merged, the
  // manager's own name otherwise — the same rule every other picker on the
  // site uses, so one person doesn't read two ways on two pages.
  const [{ data: managers }, { data: profiles }] = await Promise.all([
    db
      .from('managers')
      .select('id, profile_id, display_name, avatar_url')
      .eq('league_id', league.id),
    db.from('manager_profiles').select('id, canonical_name').eq('league_id', league.id),
  ])

  const canonical = new Map<string, string>()
  for (const p of (profiles ?? []) as { id: string; canonical_name: string }[]) {
    canonical.set(p.id, p.canonical_name)
  }
  const byId = new Map<string, ManagerRow>()
  for (const m of (managers ?? []) as ManagerRow[]) byId.set(m.id, m)

  for (const c of claims as { profile_id: string; manager_id: string }[]) {
    const m = byId.get(c.manager_id)
    if (!m) continue
    const name =
      (m.profile_id ? canonical.get(m.profile_id)?.trim() : null) ||
      m.display_name?.trim() ||
      null
    if (!name) continue
    out.set(c.profile_id, { name, avatar: m.avatar_url ?? null })
  }
  return out
}

/**
 * Names for a board that isn't one league: the site pool, a combined wheel,
 * the demo.
 *
 * Each account's most recent claim, wherever it was made, on the reasoning
 * that a person only has one name and the one they picked in their own
 * league is it. Not a cross-league identity — nothing here decides that two
 * managers in two leagues are the same person, only that this ACCOUNT said
 * it was that manager.
 *
 * The face is deliberately not carried over. A league avatar is that
 * league's picture of you; on a site-wide board it would be the only photo
 * in a column of monograms.
 */
async function resolveClaimedNames(userIds: string[]): Promise<Map<string, BoardIdentity>> {
  const out = new Map<string, BoardIdentity>()
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return out

  const db = createAdminClient()
  const { data: claims } = await db
    .from('league_claims')
    .select('profile_id, manager_id, updated_at')
    .in('profile_id', ids)
    .order('updated_at', { ascending: false })
  if (!claims || claims.length === 0) return out

  // Newest first, so the first claim seen for an account is the one it keeps.
  const pick = new Map<string, string>()
  for (const c of claims as { profile_id: string; manager_id: string }[]) {
    if (!pick.has(c.profile_id)) pick.set(c.profile_id, c.manager_id)
  }

  const { data: managers } = await db
    .from('managers')
    .select('id, profile_id, display_name, avatar_url')
    .in('id', [...pick.values()])
  const byId = new Map<string, ManagerRow>()
  for (const m of (managers ?? []) as ManagerRow[]) byId.set(m.id, m)

  const groupIds = [...byId.values()].map((m) => m.profile_id).filter(Boolean) as string[]
  const canonical = new Map<string, string>()
  if (groupIds.length > 0) {
    const { data: profiles } = await db
      .from('manager_profiles')
      .select('id, canonical_name')
      .in('id', groupIds)
    for (const p of (profiles ?? []) as { id: string; canonical_name: string }[]) {
      canonical.set(p.id, p.canonical_name)
    }
  }

  for (const [profileId, managerId] of pick) {
    const m = byId.get(managerId)
    if (!m) continue
    const name =
      (m.profile_id ? canonical.get(m.profile_id)?.trim() : null) ||
      m.display_name?.trim() ||
      null
    if (name) out.set(profileId, { name, avatar: null })
  }
  return out
}

/**
 * The name and face for every account on one board, whichever board it is.
 *
 * One call for both cases so the leaderboard never has to ask which kind of
 * pool it is holding.
 */
export function resolveBoardIdentities(
  poolId: string,
  userIds: string[]
): Promise<Map<string, BoardIdentity>> {
  return soleLeagueSlug(poolId)
    ? resolveLeagueIdentities(poolId, userIds)
    : resolveClaimedNames(userIds)
}
