// Manager picker helpers for selector UIs (rivalries, etc).
//
// The leagues page exposes per-platform manager rows, but for human-facing
// pickers we want one entry per real person: merged profiles collapse into a
// single option, profile renames are respected, hidden profiles are dropped.
//
// Each option submits the profile's PRIMARY manager id — the id stored on
// the rivalries row — so we don't have to change the rivalries FK schema.

import type { SupabaseClient } from '@supabase/supabase-js'

export type ManagerOption = {
  id: string                  // primary manager id for this profile group
  name: string                // canonical_name when merged, else display_name
  profileId: string | null
}

type ManagerRow = {
  id: string
  profile_id: string | null
  display_name: string | null
  created_at: string | null
}

type ProfileRow = {
  id: string
  canonical_name: string
  is_hidden: boolean | null
}

// Returns one option per profile group (merged), or per orphan manager when
// no profile_id exists. Hidden profiles are excluded entirely. The id field
// is the chosen primary manager.id — safe to use as the FK on rivalries.
export async function loadManagerOptions(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<ManagerOption[]> {
  const [{ data: managers }, { data: profiles }] = await Promise.all([
    supabase
      .from('managers')
      .select('id, profile_id, display_name, created_at')
      .eq('league_id', leagueId),
    supabase
      .from('manager_profiles')
      .select('id, canonical_name, is_hidden')
      .eq('league_id', leagueId),
  ])

  const profById = new Map<string, ProfileRow>()
  for (const p of (profiles ?? []) as ProfileRow[]) profById.set(p.id, p)

  // Group managers by profile_id; orphans get their own single-entry group.
  const groups = new Map<string, ManagerRow[]>()  // key = profile_id OR `m:<manager_id>`
  for (const m of (managers ?? []) as ManagerRow[]) {
    const key = m.profile_id ?? `m:${m.id}`
    const arr = groups.get(key) ?? []
    arr.push(m)
    groups.set(key, arr)
  }

  const options: ManagerOption[] = []
  for (const [key, mgrs] of groups) {
    const profileId = key.startsWith('m:') ? null : key
    if (profileId) {
      const prof = profById.get(profileId)
      if (prof?.is_hidden) continue
    }

    // Primary: most-recently-created manager, then alphabetical id as a
    // stable tiebreak so the same row is picked across page loads.
    const primary = [...mgrs].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0
      const tb = b.created_at ? Date.parse(b.created_at) : 0
      if (tb !== ta) return tb - ta
      return a.id.localeCompare(b.id)
    })[0]

    const canonical = profileId ? profById.get(profileId)?.canonical_name?.trim() : null
    const name = canonical || primary.display_name?.trim() || 'Unknown'
    options.push({ id: primary.id, name, profileId })
  }

  options.sort((a, b) => a.name.localeCompare(b.name))
  return options
}

// Lookup table for resolving an EXISTING manager.id (e.g. from a rivalries
// row) to its display name — canonical when merged. Use this on listing
// pages so renames + merges land immediately without re-saving rows.
export async function loadManagerNameMap(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<Map<string, string>> {
  const [{ data: managers }, { data: profiles }] = await Promise.all([
    supabase
      .from('managers')
      .select('id, profile_id, display_name')
      .eq('league_id', leagueId),
    supabase
      .from('manager_profiles')
      .select('id, canonical_name')
      .eq('league_id', leagueId),
  ])

  const profName = new Map<string, string>()
  for (const p of (profiles ?? []) as { id: string; canonical_name: string }[]) {
    profName.set(p.id, p.canonical_name)
  }

  const out = new Map<string, string>()
  for (const m of (managers ?? []) as { id: string; profile_id: string | null; display_name: string | null }[]) {
    const canonical = m.profile_id ? profName.get(m.profile_id) : null
    out.set(m.id, (canonical?.trim() || m.display_name?.trim() || 'Unknown'))
  }
  return out
}
