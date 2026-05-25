'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/slugify'
import { sleeper, parseDivisionInfo } from '@/lib/platforms/sleeper'
import { probeLeague as probeEspn } from '@/lib/platforms/espn'
import { canCreateLeague } from '@/lib/stripe'

const Schema = z.object({
  platform: z.enum(['sleeper', 'espn', 'yahoo', 'nfl']),
  externalId: z.string().trim().min(1, 'League ID is required'),
  customName: z.string().trim().max(80).optional(),
  abbreviation: z.string().trim().max(16).optional(),
  divisionCount: z.coerce.number().int().min(0).max(4).default(0),
  divisionTerm: z.enum(['conference', 'division']).default('division'),
  divisionNames: z.array(z.string().trim().max(40)).default([]),
  // Year range — shared between NFL and ESPN (both ingest a year range).
  seasonStart: z.coerce.number().int().min(2000).max(2100).optional(),
  seasonEnd: z.coerce.number().int().min(2000).max(2100).optional(),
  // NFL-only playoff config (ESPN derives this from its API).
  playoffWeekStart: z.coerce.number().int().min(13).max(17).optional(),
  playoffTeamCount: z.coerce.number().int().refine((v) => [4, 6, 8].includes(v), 'Must be 4, 6, or 8').optional(),
  // ESPN-only private-league cookies. Both must be present together or both blank.
  swid: z.string().trim().optional(),
  espnS2: z.string().trim().optional(),
})

type ActionResult = { ok: false; error: string } | { ok: true }

export async function addLeague(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  // Division names come in as multiple form fields divisionName-0, divisionName-1, ...
  const divisionNames: string[] = []
  for (let i = 0; i < 4; i++) {
    const v = formData.get(`divisionName-${i}`)
    if (typeof v === 'string' && v.trim()) divisionNames.push(v.trim())
  }

  const parsed = Schema.safeParse({
    platform: formData.get('platform'),
    externalId: formData.get('externalId'),
    customName: formData.get('customName') || undefined,
    abbreviation: formData.get('abbreviation') || undefined,
    divisionCount: formData.get('divisionCount') || 0,
    divisionTerm: formData.get('divisionTerm') || 'division',
    divisionNames,
    seasonStart: formData.get('seasonStart') || undefined,
    seasonEnd: formData.get('seasonEnd') || undefined,
    playoffWeekStart: formData.get('playoffWeekStart') || undefined,
    playoffTeamCount: formData.get('playoffTeamCount') || undefined,
    swid: formData.get('swid') || undefined,
    espnS2: formData.get('espnS2') || undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const { platform, externalId, customName, abbreviation, divisionCount, divisionTerm } = parsed.data
  const finalDivisionNames = parsed.data.divisionNames.slice(0, divisionCount)
  while (finalDivisionNames.length < divisionCount) {
    finalDivisionNames.push(`${divisionTerm === 'conference' ? 'Conference' : 'Division'} ${finalDivisionNames.length + 1}`)
  }

  let leagueName: string
  if (platform === 'sleeper') {
    // Validate the league exists on Sleeper before we save anything.
    try {
      const res = await fetch(`https://api.sleeper.app/v1/league/${encodeURIComponent(externalId)}`, {
        cache: 'no-store',
      })
      if (!res.ok) return { ok: false, error: `Sleeper returned ${res.status}. Double-check the league ID.` }
      const data = (await res.json()) as { name?: string } | null
      if (!data || !data.name) return { ok: false, error: 'No league found with that ID on Sleeper.' }
      leagueName = data.name
    } catch {
      return { ok: false, error: 'Could not reach Sleeper. Try again in a moment.' }
    }
  } else if (platform === 'nfl') {
    // Validate season range + playoff config and confirm the league exists.
    const { seasonStart, seasonEnd, playoffWeekStart, playoffTeamCount } = parsed.data
    if (!seasonStart || !seasonEnd || seasonStart > seasonEnd) {
      return { ok: false, error: 'Pick a valid season range (start year ≤ end year).' }
    }
    if (!playoffWeekStart) {
      return { ok: false, error: 'Pick the playoff start week (14, 15, or 16).' }
    }
    if (!playoffTeamCount) {
      return { ok: false, error: 'Pick the number of playoff teams (4, 6, or 8).' }
    }
    try {
      const probe = await fetch(`https://fantasy.nfl.com/league/${encodeURIComponent(externalId)}/history/${seasonEnd}/owners`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store',
      })
      if (probe.status === 404) return { ok: false, error: 'NFL.com returned 404 for that league + most-recent year.' }
      if (!probe.ok) return { ok: false, error: `NFL.com returned ${probe.status}. Double-check the league ID + season range.` }
      leagueName = customName?.trim() || `NFL League ${externalId}`
    } catch {
      return { ok: false, error: 'Could not reach NFL.com. Try again in a moment.' }
    }
  } else if (platform === 'espn') {
    const { seasonStart, seasonEnd, swid, espnS2 } = parsed.data
    if (!seasonStart || !seasonEnd || seasonStart > seasonEnd) {
      return { ok: false, error: 'Pick a valid season range (start year ≤ end year).' }
    }
    if ((swid && !espnS2) || (!swid && espnS2)) {
      return { ok: false, error: 'SWID and espn_s2 must both be provided (or both left blank for a public league).' }
    }
    const probe = await probeEspn(
      externalId,
      seasonEnd,
      swid && espnS2 ? { swid, espnS2 } : undefined
    )
    if (!probe.ok) {
      // ESPN's hosted error messages already tell the user when their league
      // is private (401) vs missing (404) vs unreachable. Forward as-is.
      return { ok: false, error: `ESPN: ${probe.error}` }
    }
    leagueName = customName?.trim() || probe.name || `ESPN League ${externalId}`
  } else {
    return { ok: false, error: `${platform.toUpperCase()} support is coming soon. Use Sleeper, ESPN, or NFL.com for now.` }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }

  // Server-side gate: even if the UI would have blocked them, never trust the
  // client. Re-check the user's subscription + tier limit here.
  const gate = await canCreateLeague(user.id)
  if (!gate.ok) return { ok: false, error: gate.message }

  const finalName = customName && customName.length > 0 ? customName : leagueName
  const baseSlug = slugify(finalName)
  let slug = baseSlug
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabase.from('leagues').select('id').eq('slug', slug).maybeSingle()
    if (!existing) break
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
  }

  // NFL settings live in the JSONB; Sleeper auto-detects everything we need.
  const settings: Record<string, unknown> = {}
  if (platform === 'nfl') {
    const { seasonStart, seasonEnd, playoffWeekStart, playoffTeamCount } = parsed.data
    settings.season_start = seasonStart
    settings.season_end = seasonEnd
    settings.playoff_week_start = playoffWeekStart
    settings.playoff_team_count = playoffTeamCount
  }

  const { data: inserted, error: insertError } = await supabase
    .from('leagues')
    .insert({
      owner_id: user.id,
      platform,
      external_id: externalId,
      name: finalName,
      slug,
      abbreviation: abbreviation || null,
      division_count: divisionCount,
      division_term: divisionTerm,
      division_names: finalDivisionNames,
      settings,
    })
    .select('id, slug')
    .single()

  if (insertError || !inserted) {
    if (insertError?.code === '23505') return { ok: false, error: 'You already added this league.' }
    return { ok: false, error: insertError?.message ?? 'Failed to save league.' }
  }

  // Per-source settings. ESPN reads its season range + cookies off the source
  // row exclusively (so cookies never bleed into the leagues table that the
  // public almanac reads from). NFL also stores its range/playoff config here
  // for parity with the multi-source flow.
  const sourceSettings: Record<string, unknown> = {}
  if (platform === 'espn') {
    const { seasonStart, seasonEnd, swid, espnS2 } = parsed.data
    sourceSettings.season_start = seasonStart
    sourceSettings.season_end = seasonEnd
    if (swid && espnS2) {
      sourceSettings.swid = swid
      sourceSettings.espn_s2 = espnS2
    }
  } else if (platform === 'nfl') {
    const { seasonStart, seasonEnd, playoffWeekStart, playoffTeamCount } = parsed.data
    sourceSettings.season_start = seasonStart
    sourceSettings.season_end = seasonEnd
    sourceSettings.playoff_week_start = playoffWeekStart
    sourceSettings.playoff_team_count = playoffTeamCount
  }

  await supabase.from('league_sources').insert({
    league_id: inserted.id,
    platform,
    external_id: externalId,
    walk_history: true,
    settings: sourceSettings,
  })

  // Stamp the user as having created at least one league. The dashboard
  // uses this to hide the demo card once the user is past the onboarding
  // stage — even if they later delete every league, the demo card stays
  // hidden (no need to re-pitch the product to an active user).
  await supabase.auth.updateUser({
    data: { has_created_league: true },
  })

  revalidatePath('/dashboard')
  redirect(`/league/${inserted.slug}`)
}

// Used by the form's "Detect from platform" button to auto-fill the
// league name + division setup before submitting.
export async function previewSleeperLeague(externalId: string): Promise<
  | { ok: true; name: string; divisionCount: number; divisionNames: string[] }
  | { ok: false; error: string }
> {
  const id = externalId.trim()
  if (!id) return { ok: false, error: 'Enter a league ID first.' }
  try {
    const league = await sleeper.league(id)
    if (!league) return { ok: false, error: 'No league found with that ID on Sleeper.' }
    const { count, names } = parseDivisionInfo(league)
    return { ok: true, name: league.name, divisionCount: count, divisionNames: names }
  } catch {
    return { ok: false, error: 'Could not reach Sleeper.' }
  }
}
