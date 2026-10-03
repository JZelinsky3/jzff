'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { createAdminClient } from '@/lib/supabase/admin'
import { latestRecapWeek } from '@/lib/recap/load'
import { sendRecapNow } from '@/lib/recap/run'
import { currentNflYear, syncableSourceIds } from '@/lib/liveChoices'
import { inviteToList, removeMember, OWNER_INVITES_PER_CALL, type InviteOutcome } from '@/lib/recap/subscribers'

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
  const admin = await isSiteAdmin(user.id)
  if (league.owner_id !== user.id && !admin) {
    return { ok: false, error: 'Only the owner can change the live season.' }
  }

  // Only this NFL year can go live (or whichever season already is, so its
  // dates can still be fixed). Site admins can pick any year for testing.
  // See lib/liveChoices.ts.
  if (parsed.data.seasonId && !admin) {
    const [{ data: chosen }, year] = await Promise.all([
      supabase
        .from('seasons')
        .select('year, is_live')
        .eq('league_id', league.id)
        .eq('id', parsed.data.seasonId)
        .maybeSingle(),
      currentNflYear(),
    ])
    if (!chosen) return { ok: false, error: 'Season not found.' }
    if (chosen.year !== year && !chosen.is_live) {
      return { ok: false, error: `Only the ${year} season can be marked live.` }
    }
  }

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
    // The override is stamped with when it was set: on a dated season that
    // moment turns it into an offset that keeps advancing (see liveSeason.ts).
    // Re-saving the same week keeps the old stamp so the offset doesn't move.
    if (parsed.data.currentWeek != null) {
      if (settings.current_week !== parsed.data.currentWeek || typeof settings.current_week_set_at !== 'string') {
        settings.current_week_set_at = new Date().toISOString()
      }
      settings.current_week = parsed.data.currentWeek
    } else {
      delete settings.current_week
      delete settings.current_week_set_at
    }
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
  const admin = await isSiteAdmin(user.id)
  if (league.owner_id !== user.id && !admin) {
    return { ok: false, error: 'Only the owner can change the live source.' }
  }

  // Same rule as the page: only a source that can sync this NFL year, or
  // the one already live. Site admins can pick any.
  if (parsed.data.sourceId && !admin) {
    const [{ data: sources }, { data: seasons }, year] = await Promise.all([
      supabase.from('league_sources').select('id, platform, external_id, is_live, settings').eq('league_id', league.id),
      supabase.from('seasons').select('id, year, is_live, external_id').eq('league_id', league.id),
      currentNflYear(),
    ])
    const chosen = (sources ?? []).find((s) => s.id === parsed.data.sourceId)
    if (!chosen) return { ok: false, error: 'Source not found.' }
    if (!chosen.is_live && !syncableSourceIds(sources ?? [], seasons ?? [], year).has(chosen.id)) {
      return { ok: false, error: `That source can't sync the ${year} season.` }
    }
  }

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
  if (league.owner_id !== user.id && !(await isSiteAdmin(user.id))) {
    return { ok: false, error: 'Only the owner can set the Game of the Week.' }
  }

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

const CommishPowerSchema = z.object({
  leagueId: z.string().uuid(),
  seasonId: z.string().uuid(),
  week: z.number().int().min(0).max(25),
  order: z.array(z.string().uuid()).max(40),
  note: z.string().trim().max(400).nullable(),
})

// The commissioner's own power ranking for one week, stored beside the
// model's in seasons.settings.commish_power as { [week]: { order, note } }.
// Week 0 is the preseason, matching the power rankings page. An empty order
// removes the week's ranking. Syncs merge settings, so this survives them.
export async function saveCommishPower(
  leagueId: string,
  seasonId: string,
  week: number,
  order: string[],
  note: string | null,
): Promise<Result> {
  const parsed = CommishPowerSchema.safeParse({ leagueId, seasonId, week, order, note })
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
  if (league.owner_id !== user.id && !(await isSiteAdmin(user.id))) {
    return { ok: false, error: 'Only the commissioner can publish power rankings.' }
  }

  const { data: seasonRow } = await supabase
    .from('seasons')
    .select('settings')
    .eq('league_id', league.id)
    .eq('id', parsed.data.seasonId)
    .maybeSingle()
  if (!seasonRow) return { ok: false, error: 'Season not found.' }

  const settings = { ...(seasonRow.settings ?? {}) } as Record<string, unknown>
  const all = { ...((settings.commish_power as Record<string, unknown>) ?? {}) }
  const key = String(parsed.data.week)
  const ids = [...new Set(parsed.data.order)]
  if (ids.length === 0) delete all[key]
  else all[key] = { order: ids, note: parsed.data.note || null, updated_at: new Date().toISOString() }
  settings.commish_power = all

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

// ── Weekly recap, on request ────────────────────────────────────────────

// "Email me a copy" on the Current Season page. The week is worked out here,
// never taken from the client, and one league can ask once every five
// minutes: the button sends real email from our domain, so it must not be a
// way to fire off a hundred of them.
const RECAP_REQUEST_GAP_MS = 5 * 60 * 1000

export async function emailMeTheRecap(leagueId: string): Promise<{ ok: true; to: string; week: number } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(leagueId).success) return { ok: false, error: 'Invalid league.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const db = createAdminClient()
  const { data: league } = await db.from('leagues').select('id, owner_id, settings').eq('id', leagueId).maybeSingle()
  if (!league) return { ok: false, error: 'League not found.' }
  if (league.owner_id !== user.id && !(await isSiteAdmin(user.id))) {
    return { ok: false, error: 'Only the owner can send the recap.' }
  }

  const settings = (league.settings ?? {}) as Record<string, unknown>
  const last = typeof settings.recap_requested_at === 'string' ? Date.parse(settings.recap_requested_at) : NaN
  if (Number.isFinite(last) && Date.now() - last < RECAP_REQUEST_GAP_MS) {
    return { ok: false, error: 'One just went out. Give it a few minutes, and check your spam folder.' }
  }

  const latest = await latestRecapWeek(league.id)
  if (!latest) return { ok: false, error: 'No finished week is synced yet. Once one is, its recap is ready.' }

  // Stamp before sending, so two quick taps can't both get through.
  await db
    .from('leagues')
    .update({ settings: { ...settings, recap_requested_at: new Date().toISOString() } })
    .eq('id', league.id)

  const sent = await sendRecapNow({ leagueId: league.id, userId: user.id, year: latest.year, week: latest.week })
  return sent.ok ? { ok: true, to: sent.to, week: latest.week } : sent
}

// ── The league's mailing list, from the commissioner's side ─────────────

// Addresses come in as one box of text: commas, spaces, semicolons or one
// per line, however they were pasted from the group chat.
export async function inviteRecapReaders(
  leagueId: string,
  raw: string,
): Promise<{ ok: true; outcomes: InviteOutcome[] } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(leagueId).success) return { ok: false, error: 'Invalid league.' }
  if (typeof raw !== 'string' || raw.length > 6000) return { ok: false, error: 'That’s too much text. Paste the addresses only.' }
  const emails = raw.split(/[\s,;]+/).map((s) => s.replace(/^<|>$/g, '')).filter(Boolean)
  if (emails.length === 0) return { ok: false, error: 'Add at least one email address.' }
  if (emails.length > OWNER_INVITES_PER_CALL) {
    return { ok: false, error: `${OWNER_INVITES_PER_CALL} at a time, please. Send these, then the rest.` }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const { data: league } = await supabase.from('leagues').select('id, slug, owner_id').eq('id', leagueId).maybeSingle()
  if (!league) return { ok: false, error: 'League not found.' }
  const isOwner = league.owner_id === user.id
  if (!isOwner && !(await isSiteAdmin(user.id))) return { ok: false, error: 'Only the commissioner can add to the list.' }

  const r = await inviteToList({ leagueId: league.id, emails, ownerEmail: isOwner ? user.email ?? null : null })
  if (r.ok) revalidatePath(`/league/${league.slug}/live`)
  return r
}

export async function removeRecapReader(leagueId: string, subscriberId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(leagueId).success || !z.string().uuid().safeParse(subscriberId).success) {
    return { ok: false, error: 'Invalid input.' }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const { data: league } = await supabase.from('leagues').select('id, slug, owner_id').eq('id', leagueId).maybeSingle()
  if (!league) return { ok: false, error: 'League not found.' }
  if (league.owner_id !== user.id && !(await isSiteAdmin(user.id))) {
    return { ok: false, error: 'Only the commissioner can change the list.' }
  }
  await removeMember(league.id, subscriberId)
  revalidatePath(`/league/${league.slug}/live`)
  return { ok: true }
}
