'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/slugify'
import { canAddCareerLink } from '@/lib/stripe'
import { sleeper, avatarUrl, type SleeperUser } from '@/lib/platforms/sleeper'

export type HubMember = {
  userId: string
  displayName: string
  teamName: string | null
  avatarUrl: string | null
}

// Step 1 of the add-to-hub flow: paste a Sleeper league ID, get back the league
// name + the roster of members so the user can point at themselves. No DB writes
// here — this is a read-only lookup against Sleeper's public API.
//
// Sleeper only for now; ESPN/Yahoo/NFL get wired in once this flow is proven.
export async function fetchSleeperMembers(leagueId: string): Promise<
  | { ok: true; leagueName: string; members: HubMember[] }
  | { ok: false; error: string }
> {
  const id = leagueId.trim()
  if (!id) return { ok: false, error: 'Enter a league ID first.' }
  try {
    const league = await sleeper.league(id)
    if (!league || !league.name) {
      return { ok: false, error: 'No league found with that ID on Sleeper.' }
    }
    const users = await sleeper.users(id)
    const members: HubMember[] = (users ?? [])
      .map((u: SleeperUser) => ({
        userId: u.user_id,
        displayName: u.display_name,
        teamName: u.metadata?.team_name ?? null,
        avatarUrl: avatarUrl(u),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
    if (members.length === 0) {
      return { ok: false, error: 'That league has no members we can read. Double-check the ID.' }
    }
    return { ok: true, leagueName: league.name, members }
  } catch {
    return { ok: false, error: 'Could not reach Sleeper. Try again in a moment.' }
  }
}

const AddSchema = z.object({
  leagueId: z.string().trim().min(1, 'League ID is required'),
  leagueName: z.string().trim().min(1).max(120),
  managerExternalId: z.string().trim().min(1, 'Pick which member is you'),
  managerName: z.string().trim().max(120).optional(),
})

type AddResult = { ok: false; error: string } | { ok: true }

// Step 2: commit the chosen league + "me" identity into the user's chronicle.
// Creates the chronicle on first use, reuses an existing league archive if the
// user already has one for this Sleeper ID, otherwise ingests a hidden
// manager-view league so the sync pipeline can fill it.
export async function addLeagueToHub(_prev: AddResult | null, formData: FormData): Promise<AddResult> {
  const parsed = AddSchema.safeParse({
    leagueId: formData.get('leagueId'),
    leagueName: formData.get('leagueName'),
    managerExternalId: formData.get('managerExternalId'),
    managerName: formData.get('managerName') || undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const { leagueId, leagueName, managerExternalId, managerName } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }

  // Tier gate — fails closed if no active subscription / over the cap.
  const gate = await canAddCareerLink(user.id)
  if (!gate.ok) return { ok: false, error: gate.message }

  // Ensure the user's chronicle exists (one per user).
  let chronicleSlug: string
  const { data: existingChron } = await supabase
    .from('career_chronicles')
    .select('id, slug')
    .eq('owner_id', user.id)
    .maybeSingle()
  let chronicleId: string
  if (existingChron) {
    chronicleId = existingChron.id as string
    chronicleSlug = existingChron.slug as string
  } else {
    const displayName =
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      user.email?.split('@')[0] ||
      'My'
    const base = slugify(`${displayName}-career`) || 'career'
    let slug = base
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: clash } = await supabase
        .from('career_chronicles')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()
      if (!clash) break
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
    }
    const { data: created, error: chronErr } = await supabase
      .from('career_chronicles')
      .insert({ owner_id: user.id, slug, display_name: `${displayName}'s Career` })
      .select('id, slug')
      .single()
    if (chronErr || !created) {
      return { ok: false, error: chronErr?.message ?? 'Could not start your chronicle.' }
    }
    chronicleId = created.id as string
    chronicleSlug = created.slug as string
  }

  // Reuse an existing league archive for this Sleeper ID if the user already has
  // one (public archive or a prior hub link). Otherwise create a hidden
  // manager-view league + a source row so the normal sync pipeline can walk it.
  let leagueRowId: string
  const { data: existingLeague } = await supabase
    .from('leagues')
    .select('id')
    .eq('owner_id', user.id)
    .eq('platform', 'sleeper')
    .eq('external_id', leagueId)
    .maybeSingle()
  if (existingLeague) {
    leagueRowId = existingLeague.id as string
  } else {
    const base = slugify(leagueName) || 'league'
    let lslug = `${base}-hub`
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: clash } = await supabase.from('leagues').select('id').eq('slug', lslug).maybeSingle()
      if (!clash) break
      lslug = `${base}-hub-${Math.random().toString(36).slice(2, 6)}`
    }
    const { data: insertedLeague, error: leagueErr } = await supabase
      .from('leagues')
      .insert({
        owner_id: user.id,
        platform: 'sleeper',
        external_id: leagueId,
        name: leagueName,
        slug: lslug,
        abbreviation: null,
        division_count: 0,
        division_term: 'division',
        division_names: [],
        draft_scoring_profile: 'ppr_6pt',
        settings: {},
        created_during_testing: false,
        manager_view: true,
      })
      .select('id')
      .single()
    if (leagueErr || !insertedLeague) {
      if (leagueErr?.code === '23505') {
        return { ok: false, error: 'You already have this league. Open your hub to view it.' }
      }
      return { ok: false, error: leagueErr?.message ?? 'Could not save the league.' }
    }
    leagueRowId = insertedLeague.id as string
    await supabase.from('league_sources').insert({
      league_id: leagueRowId,
      platform: 'sleeper',
      external_id: leagueId,
      walk_history: true,
      settings: {},
    })
  }

  // Link it into the chronicle. Unique (chronicle_id, league_id) guards dupes.
  const { error: linkErr } = await supabase.from('career_links').insert({
    chronicle_id: chronicleId,
    league_id: leagueRowId,
    source: 'sleeper',
    manager_external_id: managerExternalId,
    display_name_in_league: managerName ?? null,
  })
  if (linkErr) {
    if (linkErr.code === '23505') {
      return { ok: false, error: 'That league is already in your hub.' }
    }
    return { ok: false, error: linkErr.message }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/manager/${chronicleSlug}`)
  redirect(`/manager/${chronicleSlug}?added=1`)
}
