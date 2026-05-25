'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Schema = z.object({
  leagueId: z.string().uuid(),
  seasonId: z.string().uuid().nullable(),
  currentWeek: z.number().int().min(1).max(25).nullable(),
  seasonStartDate: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date')
    .nullable(),
})

type Result = { ok: true } | { ok: false; error: string }

export async function setLiveSeason(
  leagueId: string,
  seasonId: string | null,
  currentWeek: number | null,
  seasonStartDate: string | null,
): Promise<Result> {
  const parsed = Schema.safeParse({ leagueId, seasonId, currentWeek, seasonStartDate })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { data: league } = await supabase
    .from('leagues')
    .select('id, slug, owner_id')
    .eq('id', parsed.data.leagueId)
    .maybeSingle()
  if (!league) return { ok: false, error: 'League not found.' }
  if (league.owner_id !== user.id) return { ok: false, error: 'Only the owner can change the live season.' }

  // Clear is_live across all seasons in this league, then set the chosen one (if any).
  const { error: clearErr } = await supabase
    .from('seasons')
    .update({ is_live: false })
    .eq('league_id', league.id)
  if (clearErr) return { ok: false, error: clearErr.message }

  if (parsed.data.seasonId) {
    // Merge into existing settings. A null value clears the key — so the
    // commissioner can blank the week to fall back to calendar auto-advance.
    const { data: seasonRow } = await supabase
      .from('seasons')
      .select('settings')
      .eq('league_id', league.id)
      .eq('id', parsed.data.seasonId)
      .maybeSingle()
    const settings = { ...(seasonRow?.settings ?? {}) } as Record<string, unknown>
    if (parsed.data.currentWeek != null) settings.current_week = parsed.data.currentWeek
    else delete settings.current_week
    if (parsed.data.seasonStartDate) settings.season_start_date = parsed.data.seasonStartDate
    else delete settings.season_start_date

    const { error: setErr } = await supabase
      .from('seasons')
      .update({ is_live: true, settings })
      .eq('league_id', league.id)
      .eq('id', parsed.data.seasonId)
    if (setErr) return { ok: false, error: setErr.message }
  }

  revalidateTag(`league-${league.id}`, 'max')
  revalidatePath(`/league/${league.slug}/live`)
  return { ok: true }
}

const SourceSchema = z.object({
  leagueId: z.string().uuid(),
  sourceId: z.string().uuid().nullable(),
})

// Mark which league_source the weekly cron re-syncs. Only one is live at a time.
export async function setLiveSource(leagueId: string, sourceId: string | null): Promise<Result> {
  const parsed = SourceSchema.safeParse({ leagueId, sourceId })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { data: league } = await supabase
    .from('leagues')
    .select('id, slug, owner_id')
    .eq('id', parsed.data.leagueId)
    .maybeSingle()
  if (!league) return { ok: false, error: 'League not found.' }
  if (league.owner_id !== user.id) return { ok: false, error: 'Only the owner can change the live source.' }

  const { error: clearErr } = await supabase
    .from('league_sources')
    .update({ is_live: false })
    .eq('league_id', league.id)
  if (clearErr) return { ok: false, error: clearErr.message }

  if (parsed.data.sourceId) {
    const { error: setErr } = await supabase
      .from('league_sources')
      .update({ is_live: true })
      .eq('league_id', league.id)
      .eq('id', parsed.data.sourceId)
    if (setErr) return { ok: false, error: setErr.message }
  }

  revalidatePath(`/league/${league.slug}/live`)
  return { ok: true }
}

const GotwSchema = z.object({
  leagueId: z.string().uuid(),
  seasonId: z.string().uuid(),
  week: z.number().int().min(1).max(25),
  matchupId: z.string().uuid().nullable(),
})

// Set (or clear) the Game of the Week for a given week. Stored in
// seasons.settings.gotw as a { [week]: matchupId } map.
export async function setGotw(
  leagueId: string,
  seasonId: string,
  week: number,
  matchupId: string | null,
): Promise<Result> {
  const parsed = GotwSchema.safeParse({ leagueId, seasonId, week, matchupId })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { data: league } = await supabase
    .from('leagues')
    .select('id, slug, owner_id')
    .eq('id', parsed.data.leagueId)
    .maybeSingle()
  if (!league) return { ok: false, error: 'League not found.' }
  if (league.owner_id !== user.id) return { ok: false, error: 'Only the owner can set the Game of the Week.' }

  const { data: seasonRow } = await supabase
    .from('seasons')
    .select('settings')
    .eq('league_id', league.id)
    .eq('id', parsed.data.seasonId)
    .maybeSingle()
  if (!seasonRow) return { ok: false, error: 'Season not found.' }

  const settings = { ...(seasonRow.settings ?? {}) } as Record<string, unknown>
  const gotw = { ...((settings.gotw as Record<string, string>) ?? {}) }
  if (parsed.data.matchupId) gotw[String(parsed.data.week)] = parsed.data.matchupId
  else delete gotw[String(parsed.data.week)]
  settings.gotw = gotw

  const { error } = await supabase
    .from('seasons')
    .update({ settings })
    .eq('league_id', league.id)
    .eq('id', parsed.data.seasonId)
  if (error) return { ok: false, error: error.message }

  revalidateTag(`league-${league.id}`, 'max')
  revalidatePath(`/league/${league.slug}/live`)
  return { ok: true }
}
