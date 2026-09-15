// Turning the new season on by itself.
//
// Every live feature hangs off two hand-set switches: a `seasons` row flagged
// is_live, and a week `resolveCurrentWeek` can resolve. Nobody sets them in
// July, because there is nothing to look at. They notice in September, and by
// then they have lost a week of Pick'ems, Power Rankings and the Form Sheet.
// lib/seasonNotice.ts was the first answer to that, but a notice still needs
// somebody to read it and click.
//
// So once the NFL is actually playing, an ingest that produces a season row
// for the current year promotes it. The archive already knows the league has a
// source covering this season — that is precisely what it just wrote — so
// there is nothing left to ask a person.
//
// ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────
// This runs on every sync, unattended, so it is deliberately timid. It only
// acts when the answer is not in doubt:
//
//   * Only during `seasonType === 'regular'`, week >= 1. Preseason has no
//     week to point at, and the offseason has nothing to switch on.
//   * Only for the year the NFL clock says is current. An ingest walking
//     2019 never touches the live flag.
//   * Never over a commissioner. A season already flagged live for this year
//     or later is left exactly as it is; only a stale prior-year flag (or no
//     flag at all) gets rolled forward.
//   * Never over an existing week. `current_week` and `season_start_date` are
//     filled only when BOTH are missing, so a manual pin survives.
//   * Not if they said no. Dismissing the hub notice writes
//     leagues.settings.season_notice_year, and the whole point of that flag
//     is "this league is sitting this year out" — so it opts out of the
//     promotion too, for that year only.
//   * Not if the league opted out for good, via
//     leagues.settings.auto_live_season === false. Settings-only, no UI, same
//     escape-hatch idiom as allow_identity_replace.
//
// The source flag is a separate switch (`league_sources.is_live` picks which
// source the weekly cron re-scrapes) and gets the same treatment: set only
// when the league has no live source at all, because a league with two
// sources has a real choice to make and this is not the code to make it.
//
// Anything it changes comes back as a note for the ingest's `warnings` array,
// which is how ingest behavior is debugged here.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getNflClock } from '@/lib/nflClock'
import { resolveCurrentWeek } from '@/lib/liveSeason'

type Opts = {
  leagueId: string
  /** The year of the season row just upserted. */
  year: number
  seasonId: string
  platform: string
  /** external_id of the league_source being ingested. */
  sourceExternalId: string
}

export async function autoStartLiveSeason(
  db: SupabaseClient,
  { leagueId, year, seasonId, platform, sourceExternalId }: Opts,
): Promise<string[]> {
  const notes: string[] = []

  const clock = await getNflClock()
  // No clock means no idea what season it is, and guessing would flip a
  // league into a year that has not started. Cached 5 minutes, so calling
  // this once per season row in a history walk costs one fetch per run.
  if (!clock) return notes
  if (clock.seasonType !== 'regular' || clock.week < 1) return notes
  if (year !== clock.season) return notes

  const { data: league } = await db
    .from('leagues')
    .select('settings')
    .eq('id', leagueId)
    .maybeSingle()
  const leagueSettings = (league?.settings ?? {}) as {
    auto_live_season?: boolean
    season_notice_year?: number
  }
  if (leagueSettings.auto_live_season === false) return notes
  if (leagueSettings.season_notice_year === year) return notes

  // ── The season flag ────────────────────────────────────────────────────
  const { data: seasons } = await db
    .from('seasons')
    .select('id, year, is_live, settings')
    .eq('league_id', leagueId)

  const rows = (seasons ?? []) as Array<{
    id: string
    year: number
    is_live: boolean | null
    settings: unknown
  }>
  const live = rows.find((s) => s.is_live)
  const thisSeason = rows.find((s) => s.id === seasonId)

  // Someone has already pointed the league at this season or a later one.
  // Leave the flag alone; the only thing still worth doing is filling in a
  // week if it has none, which is the state a wiped settings column leaves
  // behind and the state the 'no-week' notice complains about.
  if (live && live.year >= year) {
    if (live.id === seasonId) {
      const filled = await fillWeek(db, seasonId, thisSeason?.settings, clock, year)
      if (filled) notes.push(filled)
    }
    return notes
  }

  const from = live ? `${live.year}` : 'nothing'
  const { error: clearErr } = await db
    .from('seasons')
    .update({ is_live: false })
    .eq('league_id', leagueId)
  if (clearErr) {
    notes.push(`Auto-start: could not clear the old live season (${clearErr.message}); left as-is.`)
    return notes
  }
  const { error: setErr } = await db
    .from('seasons')
    .update({ is_live: true })
    .eq('id', seasonId)
  if (setErr) {
    notes.push(`Auto-start: could not mark ${year} live (${setErr.message}).`)
    return notes
  }
  notes.push(`Auto-start: ${year} is now the current season (was ${from}), NFL week ${clock.week}.`)

  const filled = await fillWeek(db, seasonId, thisSeason?.settings, clock, year)
  if (filled) notes.push(filled)

  // ── The source flag ────────────────────────────────────────────────────
  // Only when nothing is live. The source that just wrote a current-year
  // season demonstrably covers this season, so it is the safe default, but
  // an existing choice is always somebody's deliberate answer to a
  // multi-source league and is never second-guessed.
  const { data: srcs } = await db
    .from('league_sources')
    .select('id, is_live, platform, external_id')
    .eq('league_id', leagueId)
  const sources = (srcs ?? []) as Array<{
    id: string
    is_live: boolean | null
    platform: string
    external_id: string
  }>
  if (!sources.some((s) => s.is_live)) {
    const mine = sources.find((s) => s.platform === platform && s.external_id === sourceExternalId)
    if (mine) {
      const { error } = await db
        .from('league_sources')
        .update({ is_live: true })
        .eq('id', mine.id)
      if (!error) {
        notes.push(`Auto-start: ${platform} source ${sourceExternalId} is now the live source.`)
      }
    }
  }

  return notes
}

// Give the season a week to resolve, but only if it has neither key set.
//
// Writes `season_start_date` rather than a `current_week` pin, so the week
// advances on its own from here and nobody has to come back in October.
//
// The anchor is Sleeper's own `season_start_date`, snapped back to the
// Tuesday on or before it. The Tuesday matters: lib/liveSeason.ts defines
// this field as "the Tuesday that opens week 1" and both readers depend on
// it. resolveCurrentWeek rolls the week exactly 7n days after the anchor, so
// a Tuesday keeps the site's week in step with the NFL clock, and Sleeper's
// raw value is a Wednesday (2026-09-09), which would leave the site a full
// day behind Sleeper every week. resolveWeekLockAt then searches forward to
// that week's Thursday for the 8pm ET pick'ems deadline, which lands
// correctly from a Tuesday.
//
// If Sleeper omits the field, walk back from the clock instead: week N means
// week 1 opened N-1 weeks ago. Same Tuesday snap either way.
const TUESDAY = 2 // Date.getUTCDay()

async function fillWeek(
  db: SupabaseClient,
  seasonId: string,
  settingsIn: unknown,
  clock: { week: number; seasonStartDate?: string },
  year: number,
): Promise<string | null> {
  const settings = { ...((settingsIn ?? {}) as Record<string, unknown>) }
  if (resolveCurrentWeek(settings) != null) return null

  let anchorMs = clock.seasonStartDate ? Date.parse(clock.seasonStartDate) : NaN
  if (Number.isNaN(anchorMs)) {
    anchorMs = Date.now() - (clock.week - 1) * 7 * 24 * 60 * 60 * 1000
  }
  const d = new Date(anchorMs)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - TUESDAY + 7) % 7))
  const start = d.toISOString().slice(0, 10)
  settings.season_start_date = start

  const { error } = await db.from('seasons').update({ settings }).eq('id', seasonId)
  if (error) return `Auto-start: could not set the ${year} season start date (${error.message}).`
  return `Auto-start: ${year} season start date set to ${start}; the week now advances on its own.`
}
