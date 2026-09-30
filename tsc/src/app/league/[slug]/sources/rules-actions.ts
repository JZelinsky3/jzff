'use server'

// Season rules + eras for the Sources page.
//
// The commissioner enters a league once, the page finds every season it
// covers, and each season shows what its platform says about scoring and
// the playoff format. Anything the commissioner changes is saved as an
// override in leagues.settings.season_rules[year], which no sync ever writes,
// and eras (named sets of years) go to leagues.settings.eras. See
// lib/seasonRules.ts for how the rest of the site reads them.

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { devCacheBust } from '@/lib/devCache'
import { sleeper, parallelLimit } from '@/lib/platforms/sleeper'
import { fetchSettingsOnly, periodWeeksOf, scoringFromEspn } from '@/lib/platforms/espn'
import {
  commishRulesFor,
  readEras,
  readRules,
  scoringFromSleeper,
  PLAYOFF_FORMATS,
  type Era,
  type PlayoffFormat,
  type SeasonRules,
} from '@/lib/seasonRules'

export type RuleSeason = {
  year: number
  /** Synced into the almanac yet, or only seen on the platform. */
  synced: boolean
  /** Where the detected values came from, for the row's small print. */
  source: string | null
  teams: number | null
  /** Division (conference) count the platform reports, when it was read. */
  divisions: number | null
  detected: SeasonRules
  commish: SeasonRules
}

type Loaded =
  | { ok: true; seasons: RuleSeason[]; eras: Era[] }
  | { ok: false; error: string }

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
      if (!(await isSiteAdmin(user.id))) return { ok: false as const, error: 'No write access.' }
    }
  }
  return { ok: true as const, slug: league.slug as string }
}

// Fill any key the first bag leaves empty from the second.
function fillGaps(a: SeasonRules, b: SeasonRules): SeasonRules {
  const scoring = a.scoring || b.scoring
    ? {
        ppr: a.scoring?.ppr ?? b.scoring?.ppr ?? null,
        pass_td: a.scoring?.pass_td ?? b.scoring?.pass_td ?? null,
        te_premium: a.scoring?.te_premium ?? b.scoring?.te_premium ?? null,
      }
    : null
  return {
    playoff_week_start: a.playoff_week_start ?? b.playoff_week_start ?? null,
    playoff_team_count: a.playoff_team_count ?? b.playoff_team_count ?? null,
    playoff_format: a.playoff_format ?? b.playoff_format ?? null,
    playoff_round_weeks: a.playoff_round_weeks ?? b.playoff_round_weeks ?? null,
    championship_weeks: a.championship_weeks ?? b.championship_weeks ?? null,
    scoring,
  }
}

function inWindow(year: number, settings: Record<string, unknown> | null): boolean {
  const start = typeof settings?.season_start === 'number' ? settings.season_start : null
  const end = typeof settings?.season_end === 'number' ? settings.season_end : null
  return (start == null || year >= start) && (end == null || year <= end)
}

export async function loadSeasonRules(leagueId: string): Promise<Loaded> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const db = createAdminClient()
  const [{ data: league }, { data: seasons }, { data: sources }] = await Promise.all([
    db.from('leagues').select('settings').eq('id', leagueId).maybeSingle(),
    db.from('seasons').select('id, year, settings').eq('league_id', leagueId),
    db.from('league_sources').select('platform, external_id, walk_history, settings').eq('league_id', leagueId),
  ])
  const leagueSettings = league?.settings ?? null

  type Found = { detected: SeasonRules; source: string; teams: number | null; divisions: number | null }
  const found = new Map<number, Found>()
  const note = (year: number, f: Found) => {
    const prev = found.get(year)
    found.set(year, prev ? { ...prev, detected: fillGaps(prev.detected, f.detected) } : f)
  }

  // What each platform says right now. This is what lets a league that was
  // just attached show all of its seasons before anything has been synced,
  // and it fills in keys older syncs never stored (Sleeper's playoff shape).
  const warnings: string[] = []
  for (const src of sources ?? []) {
    const settings = (src.settings ?? null) as Record<string, unknown> | null
    try {
      if (src.platform === 'sleeper') {
        let id: string | null = src.external_id
        const seen = new Set<string>()
        while (id && id !== '0' && !seen.has(id) && seen.size < 25) {
          seen.add(id)
          const lg = await sleeper.league(id)
          if (!lg) break
          const year = parseInt(lg.season, 10)
          if (Number.isFinite(year) && inWindow(year, settings)) {
            const rt = Number(lg.settings.playoff_round_type ?? 0)
            const pws = Number(lg.settings.playoff_week_start ?? 0)
            const divisions = Number(lg.settings.divisions ?? 0)
            note(year, {
              source: 'Sleeper',
              teams: lg.total_rosters ?? null,
              divisions,
              detected: {
                playoff_week_start: pws >= 1 ? pws : null,
                playoff_team_count: typeof lg.settings.playoff_teams === 'number' ? lg.settings.playoff_teams : null,
                // Sleeper's own rule: division winners are in and seeded first.
                playoff_format: divisions >= 2 ? 'division_winners' : 'record',
                playoff_round_weeks: rt === 2 ? 2 : 1,
                championship_weeks: rt === 1 || rt === 2 ? 2 : 1,
                scoring: scoringFromSleeper(lg.scoring_settings),
              },
            })
          }
          if (!src.walk_history) break
          id = lg.previous_league_id
        }
      } else if (src.platform === 'espn') {
        const start = typeof settings?.season_start === 'number' ? settings.season_start : null
        const end = typeof settings?.season_end === 'number' ? settings.season_end : null
        if (start == null || end == null) continue
        const auth = typeof settings?.swid === 'string' && typeof settings?.espn_s2 === 'string'
          ? { swid: settings.swid, espnS2: settings.espn_s2 }
          : undefined
        const years = Array.from({ length: Math.min(30, end - start + 1) }, (_, i) => start + i)
        await parallelLimit(years, 4, async (year) => {
          try {
            const lg = await fetchSettingsOnly(src.external_id, year, auth)
            const ss = lg.settings?.scheduleSettings
            const weeksOf = periodWeeksOf(lg)
            const regPeriods = ss?.matchupPeriodCount ?? 0
            const lastPeriod = Math.max(0, ...Object.keys(ss?.matchupPeriods ?? {}).map(Number))
            const rounds: number[][] = []
            for (let p = regPeriods + 1; regPeriods > 0 && p <= lastPeriod; p++) rounds.push(weeksOf(p))
            const divisions = ss?.divisions?.length ?? 0
            note(year, {
              source: 'ESPN',
              teams: lg.teams?.length ?? null,
              divisions,
              detected: {
                playoff_week_start: regPeriods > 0 ? weeksOf(regPeriods + 1)[0] : null,
                playoff_team_count: ss?.playoffTeamCount ?? null,
                playoff_format: divisions >= 2 ? 'division_winners' : 'record',
                playoff_round_weeks: rounds.length && rounds.every((r) => r.length === 2) ? 2 : 1,
                championship_weeks: rounds.length ? rounds[rounds.length - 1].length : 1,
                scoring: scoringFromEspn(lg),
              },
            })
          } catch {
            // A year the league didn't exist in, or cookies that don't
            // reach that far back. The synced rows still cover it if any.
          }
        })
      }
    } catch (e) {
      warnings.push(e instanceof Error ? e.message : String(e))
    }
  }

  // What the almanac already holds. Synced settings win over the live read
  // (they describe the rows actually stored); the live read fills gaps.
  const out = new Map<number, RuleSeason>()
  for (const sn of seasons ?? []) {
    const stored = readRules(sn.settings)
    const live = found.get(sn.year)
    out.set(sn.year, {
      year: sn.year,
      synced: true,
      source: live?.source ?? null,
      divisions: live?.divisions ?? null,
      teams: live?.teams ?? (typeof (sn.settings as Record<string, unknown> | null)?.total_rosters === 'number'
        ? ((sn.settings as Record<string, unknown>).total_rosters as number)
        : null),
      detected: live ? fillGaps(stored, live.detected) : stored,
      commish: commishRulesFor(leagueSettings, sn.year),
    })
  }
  for (const [year, f] of found) {
    if (out.has(year)) continue
    out.set(year, {
      year,
      synced: false,
      source: f.source,
      teams: f.teams,
      divisions: f.divisions,
      detected: f.detected,
      commish: commishRulesFor(leagueSettings, year),
    })
  }

  return {
    ok: true,
    seasons: [...out.values()].sort((a, b) => a.year - b.year),
    eras: readEras(leagueSettings),
  }
}

// ── Saving ─────────────────────────────────────────────────────────────────

function clampInt(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  if (!Number.isFinite(n)) return null
  const r = Math.round(n)
  return r >= lo && r <= hi ? r : null
}
function clampHalf(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  if (!Number.isFinite(n)) return null
  const r = Math.round(n * 4) / 4
  return r >= lo && r <= hi ? r : null
}

function cleanRules(raw: unknown): SeasonRules | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const sc = (o.scoring && typeof o.scoring === 'object' ? o.scoring : {}) as Record<string, unknown>
  const scoring = {
    ppr: clampHalf(sc.ppr, 0, 2),
    pass_td: clampInt(sc.pass_td, 1, 10),
    te_premium: clampHalf(sc.te_premium, 0, 2),
  }
  const rules: SeasonRules = {
    playoff_week_start: clampInt(o.playoff_week_start, 8, 18),
    playoff_team_count: clampInt(o.playoff_team_count, 2, 16),
    playoff_format: typeof o.playoff_format === 'string' && (PLAYOFF_FORMATS as string[]).includes(o.playoff_format)
      ? (o.playoff_format as PlayoffFormat)
      : null,
    playoff_round_weeks: clampInt(o.playoff_round_weeks, 1, 2),
    championship_weeks: clampInt(o.championship_weeks, 1, 2),
    scoring: scoring.ppr == null && scoring.pass_td == null && scoring.te_premium == null ? null : scoring,
  }
  // Only what was actually set is stored; everything else keeps following
  // the platform.
  const compact: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rules)) {
    if (v == null) continue
    if (k === 'scoring') {
      const s = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x != null))
      if (Object.keys(s).length) compact.scoring = s
    } else {
      compact[k] = v
    }
  }
  return Object.keys(compact).length ? (compact as SeasonRules) : null
}

function cleanEras(raw: unknown): Era[] {
  if (!Array.isArray(raw)) return []
  const out: Era[] = []
  const ids = new Set<string>()
  for (const e of raw.slice(0, 20)) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 40) : ''
    const years = Array.isArray(o.years)
      ? [...new Set(o.years.map((y) => clampInt(y, 1990, 2100)).filter((y): y is number => y != null))].sort((a, b) => a - b)
      : []
    if (!name || years.length === 0) continue
    let id = typeof o.id === 'string' && /^[a-z0-9-]{1,40}$/.test(o.id) ? o.id : ''
    if (!id) {
      id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'era'
    }
    let unique = id, n = 2
    while (ids.has(unique)) unique = `${id}-${n++}`
    ids.add(unique)
    out.push({ id: unique, name, years })
  }
  return out
}

export async function saveSeasonRules(input: {
  leagueId: string
  rules: Record<string, unknown>
  eras: unknown
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await assertWriteAccess(input.leagueId)
  if (!access.ok) return access

  const seasonRules: Record<string, SeasonRules> = {}
  for (const [year, raw] of Object.entries(input.rules ?? {})) {
    if (!/^\d{4}$/.test(year)) continue
    const cleaned = cleanRules(raw)
    if (cleaned) seasonRules[year] = cleaned
  }
  const eras = cleanEras(input.eras)

  const db = createAdminClient()
  const { data: row } = await db.from('leagues').select('settings').eq('id', input.leagueId).maybeSingle()
  const settings = { ...((row?.settings ?? {}) as Record<string, unknown>) }
  if (Object.keys(seasonRules).length) settings.season_rules = seasonRules
  else delete settings.season_rules
  if (eras.length) settings.eras = eras
  else delete settings.eras
  const { error } = await db.from('leagues').update({ settings }).eq('id', input.leagueId)
  if (error) return { ok: false, error: error.message }

  // The almanac reads both at export time, so the bundle has to rebuild.
  revalidateTag(`league-${input.leagueId}`, 'max')
  devCacheBust(input.leagueId)
  revalidatePath(`/league/${access.slug}/sources`)
  return { ok: true }
}
