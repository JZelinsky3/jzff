'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ingestSleeperSource } from '@/lib/ingest/sleeper'
import { ingestNflSource } from '@/lib/ingest/nfl'
import { ingestEspnSource, type EspnSourceSettings } from '@/lib/ingest/espn'
import { sleeper } from '@/lib/platforms/sleeper'
import { probeLeague as probeEspn } from '@/lib/platforms/espn'
import { devCacheBust } from '@/lib/devCache'

const AddSchema = z.object({
  leagueId: z.string().uuid(),
  platform: z.enum(['sleeper', 'espn', 'yahoo', 'nfl']),
  externalId: z.string().trim().min(1),
  label: z.string().trim().optional(),
  walkHistory: z.coerce.boolean().optional(),
  // Range fields are shared between NFL and ESPN (both ingest a year range).
  seasonStart: z.coerce.number().int().min(2000).max(2100).optional(),
  seasonEnd: z.coerce.number().int().min(2000).max(2100).optional(),
  // NFL-only playoff config (ESPN derives this from its API).
  playoffWeekStart: z.coerce.number().int().min(13).max(17).optional(),
  playoffTeamCount: z.coerce.number().int().refine((v) => [4, 6, 8].includes(v), 'Must be 4, 6, or 8').optional(),
  // ESPN-only private-league cookies. Both must be present together.
  swid: z.string().trim().optional(),
  espnS2: z.string().trim().optional(),
})

type ActionResult = { ok: false; error: string } | { ok: true } | null

async function assertWriteAccess(leagueId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in.' }
  const { data: league } = await supabase
    .from('leagues')
    .select('id, owner_id, slug')
    .eq('id', leagueId)
    .maybeSingle()
  if (!league) return { ok: false as const, error: 'League not found.' }
  if (league.owner_id !== user.id) {
    const { data: member } = await supabase
      .from('league_members')
      .select('role')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member || !['owner', 'editor'].includes(member.role)) {
      return { ok: false as const, error: 'No write access.' }
    }
  }
  return { ok: true as const, slug: league.slug }
}

export async function addSource(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = AddSchema.safeParse({
    leagueId: formData.get('leagueId'),
    platform: formData.get('platform'),
    externalId: formData.get('externalId'),
    label: formData.get('label'),
    walkHistory: formData.get('walkHistory'),
    seasonStart: formData.get('seasonStart') || undefined,
    seasonEnd: formData.get('seasonEnd') || undefined,
    playoffWeekStart: formData.get('playoffWeekStart') || undefined,
    playoffTeamCount: formData.get('playoffTeamCount') || undefined,
    swid: formData.get('swid') || undefined,
    espnS2: formData.get('espnS2') || undefined,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  const { leagueId, platform, externalId, label, walkHistory } = parsed.data

  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  if (platform === 'yahoo') {
    return { ok: false, error: `${platform.toUpperCase()} support is coming soon.` }
  }

  let resolvedLabel: string | null = label || null
  // `settings` JSONB is heterogeneous across platforms — numbers (year ranges,
  // playoff config) plus strings (ESPN cookies). Type as `unknown` so we don't
  // pretend it's number-only.
  const sourceSettings: Record<string, unknown> = {}

  if (platform === 'sleeper') {
    const lg = await sleeper.league(externalId)
    if (!lg) return { ok: false, error: 'No league found on Sleeper with that ID.' }
    if (!resolvedLabel) resolvedLabel = lg.name || null
  } else if (platform === 'espn') {
    const { seasonStart, seasonEnd, swid, espnS2 } = parsed.data
    if (!seasonStart || !seasonEnd || seasonStart > seasonEnd) {
      return { ok: false, error: 'Pick a valid season range (start year ≤ end year).' }
    }
    if ((swid && !espnS2) || (!swid && espnS2)) {
      return { ok: false, error: 'SWID and espn_s2 must both be provided (or both left blank for a public league).' }
    }
    sourceSettings.season_start = seasonStart
    sourceSettings.season_end = seasonEnd
    if (swid && espnS2) {
      sourceSettings.swid = swid
      sourceSettings.espn_s2 = espnS2
    }

    // Probe the most recent year of the requested range to confirm the league
    // exists + (for private leagues) the cookies are valid.
    const probe = await probeEspn(
      externalId,
      seasonEnd,
      swid && espnS2 ? { swid, espnS2 } : undefined
    )
    if (!probe.ok) {
      return { ok: false, error: `ESPN probe failed: ${probe.error}` }
    }
    if (!resolvedLabel) resolvedLabel = `${probe.name} (${seasonStart}–${seasonEnd})`
  } else {
    // NFL: require per-source season range + playoff config (used at sync time).
    const { seasonStart, seasonEnd, playoffWeekStart, playoffTeamCount } = parsed.data
    if (!seasonStart || !seasonEnd || seasonStart > seasonEnd) {
      return { ok: false, error: 'Pick a valid season range (start year ≤ end year).' }
    }
    if (!playoffWeekStart) {
      return { ok: false, error: 'Pick the playoff start week.' }
    }
    if (!playoffTeamCount) {
      return { ok: false, error: 'Pick the number of playoff teams.' }
    }
    sourceSettings.season_start = seasonStart
    sourceSettings.season_end = seasonEnd
    sourceSettings.playoff_week_start = playoffWeekStart
    sourceSettings.playoff_team_count = playoffTeamCount

    // Probe the most recent year of the requested range to confirm the league exists + is public.
    try {
      const probe = await fetch(
        `https://fantasy.nfl.com/league/${encodeURIComponent(externalId)}/history/${seasonEnd}/owners`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' }
      )
      if (probe.status === 404) return { ok: false, error: 'NFL.com returned 404 for that league + season.' }
      if (!probe.ok) return { ok: false, error: `NFL.com returned ${probe.status}. Check the league ID + that it is public.` }
    } catch {
      return { ok: false, error: 'Could not reach NFL.com. Try again in a moment.' }
    }

    if (!resolvedLabel) resolvedLabel = `${seasonStart}–${seasonEnd}`
  }

  const db = createAdminClient()
  const { error } = await db.from('league_sources').insert({
    league_id: leagueId,
    platform,
    external_id: externalId,
    label: resolvedLabel,
    walk_history: !!walkHistory,
    settings: sourceSettings,
  })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'That source is already attached.' }
    return { ok: false, error: error.message }
  }

  revalidatePath(`/league/${access.slug}/sources`)
  return { ok: true }
}

export async function syncSource(sourceId: string, leagueId: string) {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const db = createAdminClient()
  const { data: src } = await db
    .from('league_sources')
    .select('platform, external_id, walk_history, settings')
    .eq('id', sourceId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!src) return { ok: false as const, error: 'Source not found.' }

  try {
    if (src.platform === 'sleeper') {
      await ingestSleeperSource(leagueId, src.external_id, src.walk_history)
    } else if (src.platform === 'nfl') {
      await ingestNflSource(leagueId, src.external_id, (src.settings ?? {}) as Record<string, number>)
    } else if (src.platform === 'espn') {
      await ingestEspnSource(leagueId, src.external_id, (src.settings ?? {}) as EspnSourceSettings)
    } else {
      return { ok: false as const, error: `${src.platform} sync not implemented yet.` }
    }
    await db
      .from('league_sources')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', sourceId)
    await db.from('leagues').update({ last_synced_at: new Date().toISOString() }).eq('id', leagueId)
    revalidateTag(`league-${leagueId}`, 'max')
    devCacheBust(leagueId)
    revalidatePath(`/league/${access.slug}/sources`)
    revalidatePath(`/league/${access.slug}`)
    return { ok: true as const }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sync failed'
    return { ok: false as const, error: msg }
  }
}

const UpdateNflSettingsSchema = z.object({
  sourceId: z.string().uuid(),
  leagueId: z.string().uuid(),
  seasonStart: z.coerce.number().int().min(2000).max(2100),
  seasonEnd: z.coerce.number().int().min(2000).max(2100),
  playoffWeekStart: z.coerce.number().int().min(13).max(17),
  playoffTeamCount: z.coerce.number().int().refine((v) => [4, 6, 8].includes(v), 'Must be 4, 6, or 8'),
  label: z.string().trim().max(120).optional(),
})

export async function updateNflSourceSettings(input: z.infer<typeof UpdateNflSettingsSchema>): Promise<{ ok: false; error: string } | { ok: true }> {
  const parsed = UpdateNflSettingsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  const { sourceId, leagueId, seasonStart, seasonEnd, playoffWeekStart, playoffTeamCount, label } = parsed.data
  if (seasonStart > seasonEnd) return { ok: false, error: 'Start year must be ≤ end year.' }

  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const db = createAdminClient()
  const update: Record<string, unknown> = {
    settings: {
      season_start: seasonStart,
      season_end: seasonEnd,
      playoff_week_start: playoffWeekStart,
      playoff_team_count: playoffTeamCount,
    },
  }
  if (label !== undefined) update.label = label || null

  const { error } = await db
    .from('league_sources')
    .update(update)
    .eq('id', sourceId)
    .eq('league_id', leagueId)
    .eq('platform', 'nfl')
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/league/${access.slug}/sources`)
  return { ok: true }
}

const UpdateEspnSettingsSchema = z.object({
  sourceId: z.string().uuid(),
  leagueId: z.string().uuid(),
  seasonStart: z.coerce.number().int().min(2000).max(2100),
  seasonEnd: z.coerce.number().int().min(2000).max(2100),
  swid: z.string().trim().optional(),
  espnS2: z.string().trim().optional(),
  clearCookies: z.boolean().optional(),
  label: z.string().trim().max(120).optional(),
})

export async function updateEspnSourceSettings(input: z.infer<typeof UpdateEspnSettingsSchema>): Promise<{ ok: false; error: string } | { ok: true }> {
  const parsed = UpdateEspnSettingsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  const { sourceId, leagueId, seasonStart, seasonEnd, swid, espnS2, clearCookies, label } = parsed.data
  if (seasonStart > seasonEnd) return { ok: false, error: 'Start year must be ≤ end year.' }
  if ((swid && !espnS2) || (!swid && espnS2)) {
    return { ok: false, error: 'SWID and espn_s2 must both be provided together.' }
  }

  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const db = createAdminClient()
  // Preserve existing cookies if the user didn't touch them (the form sends
  // empty strings when the inputs were left blank). Pass clearCookies=true to
  // explicitly wipe them (e.g. league switched from private to public).
  const { data: existing } = await db
    .from('league_sources')
    .select('settings')
    .eq('id', sourceId)
    .eq('league_id', leagueId)
    .eq('platform', 'espn')
    .maybeSingle()
  const existingSettings = (existing?.settings ?? {}) as EspnSourceSettings

  const nextSettings: Record<string, unknown> = {
    season_start: seasonStart,
    season_end: seasonEnd,
  }
  if (clearCookies) {
    // omit swid / espn_s2 entirely
  } else if (swid && espnS2) {
    nextSettings.swid = swid
    nextSettings.espn_s2 = espnS2
  } else if (existingSettings.swid && existingSettings.espn_s2) {
    nextSettings.swid = existingSettings.swid
    nextSettings.espn_s2 = existingSettings.espn_s2
  }

  const update: Record<string, unknown> = { settings: nextSettings }
  if (label !== undefined) update.label = label || null

  const { error } = await db
    .from('league_sources')
    .update(update)
    .eq('id', sourceId)
    .eq('league_id', leagueId)
    .eq('platform', 'espn')
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/league/${access.slug}/sources`)
  return { ok: true }
}

export async function deleteSource(sourceId: string, leagueId: string) {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const db = createAdminClient()
  await db.from('league_sources').delete().eq('id', sourceId).eq('league_id', leagueId)
  revalidatePath(`/league/${access.slug}/sources`)
  return { ok: true as const }
}
