'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/slugify'
import { canAddCareerLink } from '@/lib/stripe'
import { sleeper, avatarUrl, type SleeperUser } from '@/lib/platforms/sleeper'
import {
  probeLeague as probeEspn,
  fetchTeams as fetchEspnTeams,
  memberDisplayName as espnMemberName,
  teamDisplayName as espnTeamName,
  type EspnMember,
  type EspnAuth,
} from '@/lib/platforms/espn'
import { probeLeague as probeNfl, fetchOwners as fetchNflOwners } from '@/lib/platforms/nfl'
import {
  getValidAccessToken as getYahooAccessToken,
  listUserNflLeaguesDeduped,
  getLeagueDetail as getYahooLeagueDetail,
  getLeagueTeamsStandings as getYahooTeams,
  type YahooLeaguePickerEntry,
} from '@/lib/platforms/yahoo'

export type HubMember = {
  externalId: string
  displayName: string
  teamName: string | null
  avatarUrl: string | null
}

type MembersResult =
  | { ok: true; leagueName: string; members: HubMember[] }
  | { ok: false; error: string }

// ── Step 1: per-platform member lookups (read-only, no DB writes) ────────────
// Each returns the league name + a normalized member list whose externalId
// EXACTLY matches what that platform's ingest writes to managers.external_id,
// so the chosen "me" resolves after a sync (sleeper=user_id, espn=swid,
// nfl=user_id, yahoo=guid).

export async function fetchSleeperMembers(leagueId: string): Promise<MembersResult> {
  const id = leagueId.trim()
  if (!id) return { ok: false, error: 'Enter a league ID first.' }
  try {
    const league = await sleeper.league(id)
    if (!league || !league.name) return { ok: false, error: 'No league found with that ID on Sleeper.' }
    const users = await sleeper.users(id)
    const members: HubMember[] = (users ?? [])
      .map((u: SleeperUser) => ({
        externalId: u.user_id,
        displayName: u.display_name,
        teamName: u.metadata?.team_name ?? null,
        avatarUrl: avatarUrl(u),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
    if (members.length === 0) return { ok: false, error: 'That league has no members we can read.' }
    return { ok: true, leagueName: league.name, members }
  } catch {
    return { ok: false, error: 'Could not reach Sleeper. Try again in a moment.' }
  }
}

export async function fetchEspnMembers(
  leagueId: string,
  season: number,
  swid?: string,
  espnS2?: string,
): Promise<MembersResult> {
  const id = leagueId.trim()
  if (!id) return { ok: false, error: 'Enter a league ID first.' }
  if (!season) return { ok: false, error: 'Enter the season to read members from.' }
  const auth: EspnAuth | undefined = swid && espnS2 ? { swid, espnS2 } : undefined
  try {
    const probe = await probeEspn(id, season, auth)
    if (!probe.ok) return { ok: false, error: `ESPN: ${probe.error}` }
    const lg = await fetchEspnTeams(id, season, auth)
    // Combine the league members list with team owners — same dual pass the
    // ingest uses — so co-owners and team-less members both show up, keyed by
    // SWID (the external_id the ingest stores).
    const byId = new Map<string, HubMember>()
    const memberById = new Map<string, EspnMember>()
    for (const m of lg.members ?? []) memberById.set(m.id, m)
    for (const m of lg.members ?? []) {
      byId.set(m.id, { externalId: m.id, displayName: espnMemberName(m), teamName: espnMemberName(m), avatarUrl: null })
    }
    for (const t of lg.teams ?? []) {
      for (const ownerSwid of t.owners ?? []) {
        if (!ownerSwid) continue
        const m = memberById.get(ownerSwid)
        byId.set(ownerSwid, {
          externalId: ownerSwid,
          displayName: m ? espnMemberName(m) : espnTeamName(t),
          teamName: espnTeamName(t),
          avatarUrl: t.logo ?? null,
        })
      }
    }
    const members = [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
    if (members.length === 0) return { ok: false, error: 'No members found for that ESPN league + season.' }
    return { ok: true, leagueName: probe.name, members }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach ESPN.' }
  }
}

export async function fetchNflMembers(leagueId: string, season: number): Promise<MembersResult> {
  const id = leagueId.trim()
  if (!id) return { ok: false, error: 'Enter a league ID first.' }
  if (!season) return { ok: false, error: 'Enter the season to read members from.' }
  try {
    const probe = await probeNfl(id, season)
    if (!probe.ok) return { ok: false, error: 'NFL.com: league not found for that ID + season (must be public).' }
    const owners = await fetchNflOwners(id, season)
    const members: HubMember[] = owners
      .filter((o) => o.user_id)
      .map((o) => ({
        externalId: o.user_id,
        displayName: o.owner_name || o.team_name,
        teamName: o.team_name,
        avatarUrl: o.team_image_url,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
    if (members.length === 0) return { ok: false, error: 'No owners found on that NFL.com season page.' }
    return { ok: true, leagueName: probe.name || `NFL League ${id}`, members }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach NFL.com.' }
  }
}

// Yahoo is two-step: list the user's connected leagues, then read one league's
// teams to pick "me". Both need the user's stored OAuth token.
export async function listYahooHubLeagues(): Promise<
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

export async function fetchYahooMembers(leagueKey: string): Promise<MembersResult> {
  const key = leagueKey.trim()
  if (!key) return { ok: false, error: 'Pick a Yahoo league first.' }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sign in first.' }
    const token = await getYahooAccessToken(user.id, supabase)
    const detail = await getYahooLeagueDetail(token, key)
    const teams = await getYahooTeams(token, key)
    const byGuid = new Map<string, HubMember>()
    for (const t of teams) {
      for (const m of t.managers ?? []) {
        if (!m.guid) continue
        // Prefer the team name for context; nickname is the manager identity.
        if (!byGuid.has(m.guid)) {
          byGuid.set(m.guid, {
            externalId: m.guid,
            displayName: m.nickname || t.name,
            teamName: t.name,
            avatarUrl: m.image_url ?? t.logo_url ?? null,
          })
        }
      }
    }
    const members = [...byGuid.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
    if (members.length === 0) return { ok: false, error: 'No managers found in that Yahoo league.' }
    return { ok: true, leagueName: detail?.name || `Yahoo League`, members }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach Yahoo.' }
  }
}

// ── Step 2: commit the chosen league + "me" into the chronicle ───────────────

const AddSchema = z.object({
  platform: z.enum(['sleeper', 'espn', 'yahoo', 'nfl']),
  leagueId: z.string().trim().min(1, 'League ID is required'), // yahoo: league_key
  leagueName: z.string().trim().min(1).max(120),
  managerExternalId: z.string().trim().min(1, 'Pick which member is you'),
  managerName: z.string().trim().max(120).optional(),
  seasonStart: z.coerce.number().int().min(2000).max(2100).optional(),
  seasonEnd: z.coerce.number().int().min(2000).max(2100).optional(),
  playoffWeekStart: z.coerce.number().int().min(13).max(17).optional(),
  playoffTeamCount: z.coerce.number().int().optional(),
  swid: z.string().trim().optional(),
  espnS2: z.string().trim().optional(),
})

type AddResult = { ok: false; error: string } | { ok: true }

export async function addLeagueToHub(_prev: AddResult | null, formData: FormData): Promise<AddResult> {
  const parsed = AddSchema.safeParse({
    platform: formData.get('platform'),
    leagueId: formData.get('leagueId'),
    leagueName: formData.get('leagueName'),
    managerExternalId: formData.get('managerExternalId'),
    managerName: formData.get('managerName') || undefined,
    seasonStart: formData.get('seasonStart') || undefined,
    seasonEnd: formData.get('seasonEnd') || undefined,
    playoffWeekStart: formData.get('playoffWeekStart') || undefined,
    playoffTeamCount: formData.get('playoffTeamCount') || undefined,
    swid: formData.get('swid') || undefined,
    espnS2: formData.get('espnS2') || undefined,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  // Platform-specific required-field checks for the ingest pipeline.
  if (d.platform === 'espn' || d.platform === 'nfl') {
    if (!d.seasonStart || !d.seasonEnd || d.seasonStart > d.seasonEnd) {
      return { ok: false, error: 'Pick a valid season range (start year ≤ end year).' }
    }
  }
  if (d.platform === 'nfl') {
    if (!d.playoffWeekStart) return { ok: false, error: 'Pick the playoff start week.' }
    if (!d.playoffTeamCount || ![4, 6, 8].includes(d.playoffTeamCount)) {
      return { ok: false, error: 'Pick the number of playoff teams (4, 6, or 8).' }
    }
  }
  if (d.platform === 'espn' && ((d.swid && !d.espnS2) || (!d.swid && d.espnS2))) {
    return { ok: false, error: 'SWID and espn_s2 must both be provided (or both blank for a public league).' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }

  const gate = await canAddCareerLink(user.id)
  if (!gate.ok) return { ok: false, error: gate.message }

  // Ensure the chronicle exists (one per user).
  const { chronicleId, chronicleSlug, error: chronErr } = await ensureChronicle(supabase, user)
  if (chronErr) return { ok: false, error: chronErr }

  // Reuse an existing league for this (platform, external_id) the user owns, or
  // create a hidden manager-view league + a source row for the sync pipeline.
  const { data: existingLeague } = await supabase
    .from('leagues')
    .select('id')
    .eq('owner_id', user.id)
    .eq('platform', d.platform)
    .eq('external_id', d.leagueId)
    .maybeSingle()

  let leagueRowId: string
  if (existingLeague) {
    leagueRowId = existingLeague.id as string
  } else {
    // leagues.settings (NFL stores range + playoff here, like the archive flow).
    const leagueSettings: Record<string, unknown> = {}
    if (d.platform === 'nfl') {
      leagueSettings.season_start = d.seasonStart
      leagueSettings.season_end = d.seasonEnd
      leagueSettings.playoff_week_start = d.playoffWeekStart
      leagueSettings.playoff_team_count = d.playoffTeamCount
    }
    const base = slugify(d.leagueName) || 'league'
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
        platform: d.platform,
        external_id: d.leagueId,
        name: d.leagueName,
        slug: lslug,
        abbreviation: null,
        division_count: 0,
        division_term: 'division',
        division_names: [],
        draft_scoring_profile: 'ppr_6pt',
        settings: leagueSettings,
        created_during_testing: false,
        manager_view: true,
      })
      .select('id')
      .single()
    if (leagueErr || !insertedLeague) {
      if (leagueErr?.code === '23505') return { ok: false, error: 'You already have this league. Open your hub to view it.' }
      return { ok: false, error: leagueErr?.message ?? 'Could not save the league.' }
    }
    leagueRowId = insertedLeague.id as string

    // Per-source settings (ESPN: range + cookies; NFL: range + playoff). Mirrors
    // the archive flow so the existing ingest reads them unchanged.
    const sourceSettings: Record<string, unknown> = {}
    if (d.platform === 'espn') {
      sourceSettings.season_start = d.seasonStart
      sourceSettings.season_end = d.seasonEnd
      if (d.swid && d.espnS2) {
        sourceSettings.swid = d.swid
        sourceSettings.espn_s2 = d.espnS2
      }
    } else if (d.platform === 'nfl') {
      sourceSettings.season_start = d.seasonStart
      sourceSettings.season_end = d.seasonEnd
      sourceSettings.playoff_week_start = d.playoffWeekStart
      sourceSettings.playoff_team_count = d.playoffTeamCount
    }
    await supabase.from('league_sources').insert({
      league_id: leagueRowId,
      platform: d.platform,
      external_id: d.leagueId,
      walk_history: true,
      settings: sourceSettings,
    })
  }

  const { error: linkErr } = await supabase.from('career_links').insert({
    chronicle_id: chronicleId,
    league_id: leagueRowId,
    source: d.platform,
    manager_external_id: d.managerExternalId,
    display_name_in_league: d.managerName ?? null,
  })
  if (linkErr) {
    if (linkErr.code === '23505') return { ok: false, error: 'That league is already in your hub.' }
    return { ok: false, error: linkErr.message }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/manager/${chronicleSlug}`)
  redirect(`/manager/${chronicleSlug}?added=1`)
}

// Creates the user's chronicle if absent. Returns its id + slug.
async function ensureChronicle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> },
): Promise<{ chronicleId: string; chronicleSlug: string; error?: string }> {
  const { data: existing } = await supabase
    .from('career_chronicles')
    .select('id, slug')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (existing) return { chronicleId: existing.id as string, chronicleSlug: existing.slug as string }

  const displayName =
    ((user.user_metadata?.full_name as string | undefined)?.trim()) ||
    user.email?.split('@')[0] ||
    'My'
  const base = slugify(`${displayName}-career`) || 'career'
  let slug = base
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: clash } = await supabase.from('career_chronicles').select('id').eq('slug', slug).maybeSingle()
    if (!clash) break
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
  }
  const { data: created, error } = await supabase
    .from('career_chronicles')
    .insert({ owner_id: user.id, slug, display_name: `${displayName}'s Career` })
    .select('id, slug')
    .single()
  if (error || !created) return { chronicleId: '', chronicleSlug: '', error: error?.message ?? 'Could not start your chronicle.' }
  return { chronicleId: created.id as string, chronicleSlug: created.slug as string }
}
