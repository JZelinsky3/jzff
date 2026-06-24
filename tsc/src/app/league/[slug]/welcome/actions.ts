'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pickRivalryName } from '../rivalries/_lib/nameBank'

type Result = { ok: true } | { ok: false; error: string }

async function assertOwner(leagueId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in.' }
  const { data: league } = await supabase
    .from('leagues')
    .select('id, slug, owner_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (!league) return { ok: false as const, error: 'League not found.' }
  if (league.owner_id !== user.id) return { ok: false as const, error: 'Only the owner can do this.' }
  return { ok: true as const, slug: league.slug }
}

// Wizard-only: flip is_live on the most recent season. Live-season page has a
// fuller setLiveSeason that also writes current_week / start date; this is the
// minimal toggle the welcome flow needs ("is the league mid-season right now?").
const ToggleSchema = z.object({
  leagueId: z.string().uuid(),
  live: z.boolean(),
})

export async function setLatestSeasonLive(input: z.infer<typeof ToggleSchema>): Promise<Result> {
  const parsed = ToggleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid input.' }
  const access = await assertOwner(parsed.data.leagueId)
  if (!access.ok) return access

  const db = createAdminClient()

  // Always clear first — the live flag is meant to be unique per league. If we
  // only flipped one row we could leave a stale prior-season live=true behind.
  const { error: clearErr } = await db
    .from('seasons')
    .update({ is_live: false })
    .eq('league_id', parsed.data.leagueId)
  if (clearErr) return { ok: false, error: clearErr.message }

  if (parsed.data.live) {
    const { data: latest } = await db
      .from('seasons')
      .select('id')
      .eq('league_id', parsed.data.leagueId)
      .order('year', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!latest) return { ok: false, error: 'No seasons yet — sync a source first.' }
    const { error: setErr } = await db
      .from('seasons')
      .update({ is_live: true })
      .eq('id', latest.id)
    if (setErr) return { ok: false, error: setErr.message }
  }

  revalidateTag(`league-${parsed.data.leagueId}`, 'max')
  revalidatePath(`/league/${access.slug}`)
  revalidatePath(`/league/${access.slug}/live`)
  return { ok: true }
}

// Wizard-only: insert a rivalry and return ok/error without redirecting.
// The public createRivalry in /rivalries/actions.ts redirects to the
// rivalries page on success — fine for that flow, breaks the wizard since
// the user is mid-step. Mirrors the same name-bank logic.
const CreateRivalrySchema = z.object({
  leagueId: z.string().uuid(),
  managerA: z.string().uuid(),
  managerB: z.string().uuid(),
  name: z.string().trim().optional(),
  autoName: z.boolean().optional(),
})

export async function createRivalryInWizard(
  input: z.infer<typeof CreateRivalrySchema>,
): Promise<Result & { rivalryName?: string }> {
  const parsed = CreateRivalrySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const { leagueId, managerA, managerB, autoName } = parsed.data
  let { name } = parsed.data
  if (managerA === managerB) return { ok: false, error: 'Pick two different managers.' }

  const access = await assertOwner(leagueId)
  if (!access.ok) return access

  const supabase = await createClient()

  if (autoName || !name || !name.trim()) {
    const [{ data: mgrs }, { data: existing }] = await Promise.all([
      supabase
        .from('managers')
        .select('id, display_name, profile:manager_profiles(canonical_name)')
        .in('id', [managerA, managerB]),
      supabase.from('rivalries').select('name').eq('league_id', leagueId),
    ])
    type Row = {
      id: string
      display_name: string | null
      profile: { canonical_name: string } | { canonical_name: string }[] | null
    }
    const nameOf = (mid: string): string => {
      const row = (mgrs as Row[] | null | undefined)?.find((m) => m.id === mid)
      if (!row) return 'Unknown'
      const prof = Array.isArray(row.profile) ? row.profile[0] : row.profile
      return prof?.canonical_name?.trim() || row.display_name?.trim() || 'Unknown'
    }
    const aName = nameOf(managerA)
    const bName = nameOf(managerB)
    const taken = new Set(
      (existing ?? []).map((r) => (r.name ?? '').trim().toLowerCase()),
    )
    name = pickRivalryName(managerA, managerB, aName, bName, taken)
  }

  const { error } = await supabase.from('rivalries').insert({
    league_id: leagueId,
    manager_a_id: managerA,
    manager_b_id: managerB,
    name,
    auto_named: !!autoName,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/league/${access.slug}/welcome`)
  revalidatePath(`/league/${access.slug}/rivalries`)
  return { ok: true, rivalryName: name ?? undefined }
}

// Wizard-friendly delete that does its own owner check and refreshes the
// welcome route. The public deleteRivalry in /rivalries/actions.ts only
// revalidates the rivalries page and skips auth — fine for that surface,
// not enough here.
const DeleteRivalrySchema = z.object({
  leagueId: z.string().uuid(),
  rivalryId: z.string().uuid(),
})

export async function deleteRivalryInWizard(
  input: z.infer<typeof DeleteRivalrySchema>,
): Promise<Result> {
  const parsed = DeleteRivalrySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid input.' }
  const access = await assertOwner(parsed.data.leagueId)
  if (!access.ok) return access

  const supabase = await createClient()
  const { error } = await supabase
    .from('rivalries')
    .delete()
    .eq('id', parsed.data.rivalryId)
    .eq('league_id', parsed.data.leagueId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/league/${access.slug}/welcome`)
  revalidatePath(`/league/${access.slug}/rivalries`)
  return { ok: true }
}

// Dismiss the "Setup wizard" callout on the league hub. One-way per league —
// the wizard route itself stays reachable (typed URL, manager-page button on
// mobile, etc.), but the prominent hub card goes away forever once the owner
// marks it complete. Stored as a timestamp in leagues.settings JSONB to avoid
// a schema migration.
export async function dismissWelcomeCallout(leagueId: string): Promise<Result> {
  const access = await assertOwner(leagueId)
  if (!access.ok) return access

  const db = createAdminClient()
  const { data: row } = await db
    .from('leagues')
    .select('settings')
    .eq('id', leagueId)
    .maybeSingle()
  const settings = (row?.settings ?? {}) as Record<string, unknown>
  if (!settings.wizard_dismissed_at) {
    settings.wizard_dismissed_at = new Date().toISOString()
    const { error } = await db.from('leagues').update({ settings }).eq('id', leagueId)
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath(`/league/${access.slug}`)
  return { ok: true }
}
