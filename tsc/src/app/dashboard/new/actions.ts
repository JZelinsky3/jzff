'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/slugify'
import {
  getUserSubscription,
  isCompUser,
  isSubscriptionActive,
  isTestingModeActive,
} from '@/lib/stripe'
import { sleeper, parseDivisionInfo } from '@/lib/platforms/sleeper'
import { probeLeague as probeEspn } from '@/lib/platforms/espn'
import {
  getValidAccessToken as getYahooAccessToken,
  listUserNflLeaguesDeduped,
  getLeagueDetail as getYahooLeagueDetail,
  type YahooLeaguePickerEntry,
} from '@/lib/platforms/yahoo'
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
  // Scoring profile used to evaluate draft picks on the draft history page.
  // Maps to public/data/fantasy_ranks/<profile>/<year>.json.
  draftScoringProfile: z.enum(['ppr_6pt', 'half_4pt', 'ppr_4pt', 'half_6pt']).default('ppr_6pt'),
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
    draftScoringProfile: formData.get('draftScoringProfile') || undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const { platform, externalId, customName, abbreviation, divisionCount, divisionTerm } = parsed.data
  const finalDivisionNames = parsed.data.divisionNames.slice(0, divisionCount)
  while (finalDivisionNames.length < divisionCount) {
    finalDivisionNames.push(`${divisionTerm === 'conference' ? 'Conference' : 'Division'} ${finalDivisionNames.length + 1}`)
  }

  let leagueName: string = ''
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
  } else if (platform === 'yahoo') {
    // externalId is the Yahoo league_key (e.g. "461.l.123456"), picked by the
    // user from the connected-account league picker. Validate it via the
    // Fantasy API using their stored tokens.
    const yahooSupabase = await createClient()
    const { data: { user: yahooUser } } = await yahooSupabase.auth.getUser()
    if (!yahooUser) return { ok: false, error: 'You are not signed in.' }
    try {
      const token = await getYahooAccessToken(yahooUser.id, yahooSupabase)
      const detail = await getYahooLeagueDetail(token, externalId)
      if (!detail) return { ok: false, error: 'Yahoo returned no league for that key. Reconnect Yahoo and try again.' }
      leagueName = customName?.trim() || detail.name
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not reach Yahoo.'
      return { ok: false, error: msg }
    }
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

  // Stamp the league as testing-mode-created if (a) the testing window is
  // currently open AND (b) the user has no Stripe subscription. Paid users
  // creating leagues during the testing window still get full features.
  const testingNow = isTestingModeActive()
  const existingSub = testingNow ? await getUserSubscription(user.id) : null
  const subActive = isSubscriptionActive(existingSub)
  const createdDuringTesting = testingNow && !subActive && !(await isCompUser(user.id))

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
      draft_scoring_profile: parsed.data.draftScoringProfile,
      settings,
      created_during_testing: createdDuringTesting,
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

// Returns every NFL league the signed-in user has on their connected Yahoo
// account, across the last 15 seasons. Used by the new-archive form's league
// picker when the user selects Yahoo as their platform.
export async function listYahooLeagues(): Promise<
  | { ok: true; leagues: YahooLeaguePickerEntry[] }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sign in first.' }
    const token = await getYahooAccessToken(user.id, supabase)
    const leagues = await listUserNflLeaguesDeduped(token)
    return { ok: true, leagues }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach Yahoo.' }
  }
}

// "Detect" equivalent for a chosen Yahoo league_key — fetches name + division
// setup so the form can auto-populate them after the user picks.
export async function previewYahooLeague(leagueKey: string): Promise<
  | { ok: true; name: string; season: string; divisionCount: number; divisionNames: string[] }
  | { ok: false; error: string }
> {
  const key = leagueKey.trim()
  if (!key) return { ok: false, error: 'Pick a league first.' }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sign in first.' }
    const token = await getYahooAccessToken(user.id, supabase)
    const detail = await getYahooLeagueDetail(token, key)
    if (!detail) return { ok: false, error: 'No league found for that Yahoo key.' }
    return {
      ok: true,
      name: detail.name,
      season: detail.season,
      divisionCount: detail.num_divisions ?? 0,
      divisionNames: detail.division_names ?? [],
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach Yahoo.' }
  }
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
