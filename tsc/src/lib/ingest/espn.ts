// ESPN ingestion: walks a configured season range, calls the ESPN JSON API,
// and upserts every row. Idempotent.
//
// Expected per-source settings shape (set on /league/<slug>/sources):
//   {
//     "season_start": 2019,
//     "season_end":   2025,
//     "swid":    "{ABC123-...}",   // optional — required for private leagues
//     "espn_s2": "AEB..."           // optional — required for private leagues
//   }
//
// Unlike NFL.com, we don't need the commish to declare playoff_week_start /
// playoff_team_count — ESPN's settings + schedule payload tells us per season.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchSeason,
  fetchPlayers,
  fetchWeekRoster,
  fetchTransactions,
  filterExecutedTrades,
  flattenSchedule,
  teamDisplayName,
  memberDisplayName,
  deriveChampions,
  positionFromId,
  nflTeamFromId,
  espnSlotName,
  isStarterSlot,
  parallelLimit,
  type EspnAuth,
  type EspnLeague,
  type EspnTeam,
  type EspnMember,
  type EspnTransaction,
} from '@/lib/platforms/espn'

export type IngestResult = {
  ok: boolean
  seasonsIngested: number
  managersIngested: number
  matchupsIngested: number
  draftsIngested: number
  tradesIngested: number
  warnings: string[]
}

export type EspnSourceSettings = {
  season_start?: number
  season_end?: number
  swid?: string | null
  espn_s2?: string | null
}

// Top-level: walk every ESPN source attached to this archive.
export async function ingestEspnLeague(leagueRowId: string): Promise<IngestResult> {
  const db = createAdminClient()
  const { data: leagueRow, error: leagueErr } = await db
    .from('leagues')
    .select('id, external_id, settings')
    .eq('id', leagueRowId)
    .maybeSingle()
  if (leagueErr || !leagueRow) throw new Error('League not found')

  const { data: sources } = await db
    .from('league_sources')
    .select('id, external_id, settings')
    .eq('league_id', leagueRow.id)
    .eq('platform', 'espn')

  const sourceList =
    sources && sources.length > 0
      ? sources.map((s) => ({
          id: s.id as string | null,
          external_id: s.external_id as string,
          settings: (s.settings ?? {}) as EspnSourceSettings,
        }))
      : []

  const aggregate: IngestResult = {
    ok: true,
    seasonsIngested: 0,
    managersIngested: 0,
    matchupsIngested: 0,
    draftsIngested: 0,
    tradesIngested: 0,
    warnings: [],
  }

  for (const src of sourceList) {
    const result = await ingestEspnSource(leagueRowId, src.external_id, src.settings)
    aggregate.seasonsIngested += result.seasonsIngested
    aggregate.matchupsIngested += result.matchupsIngested
    aggregate.draftsIngested += result.draftsIngested
    aggregate.tradesIngested += result.tradesIngested
    aggregate.warnings.push(...result.warnings)
    if (result.managersIngested > aggregate.managersIngested) {
      aggregate.managersIngested = result.managersIngested
    }
    if (src.id) {
      await db
        .from('league_sources')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', src.id)
    }
  }

  await db.from('leagues').update({ last_synced_at: new Date().toISOString() }).eq('id', leagueRowId)
  return aggregate
}

// Single-source ingest: one external_id, one settings bundle.
export async function ingestEspnSource(
  archiveLeagueId: string,
  externalId: string,
  settings: EspnSourceSettings = {}
): Promise<IngestResult> {
  const db = createAdminClient()

  const startYear = settings.season_start
  const endYear = settings.season_end
  if (!startYear || !endYear || startYear > endYear) {
    throw new Error('ESPN source settings missing season_start/season_end range')
  }
  const auth: EspnAuth | undefined =
    settings.swid && settings.espn_s2
      ? { swid: settings.swid, espnS2: settings.espn_s2 }
      : undefined

  const result: IngestResult = {
    ok: true,
    seasonsIngested: 0,
    managersIngested: 0,
    matchupsIngested: 0,
    draftsIngested: 0,
    tradesIngested: 0,
    warnings: [],
  }

  // Fetch every season once. ESPN returns members + teams + schedule + settings
  // + draft in a single call per season, so no extra parallelism needed beyond
  // sequencing seasons.
  const seasonPayloads = new Map<number, EspnLeague>()
  for (let y = startYear; y <= endYear; y++) {
    try {
      const lg = await fetchSeason(externalId, y, auth)
      seasonPayloads.set(y, lg)
    } catch (err) {
      result.warnings.push(`Season ${y}: ${(err as Error).message}`)
    }
  }

  // Manager identity is the ESPN member SWID — stable across seasons. Build the
  // union across the range. Team-level fields (team_name, avatar) come from the
  // most recent season the member appeared in (loop is ascending).
  //
  // Critical detail: seed EVERY owner SWID we see, not just owners[0]. Old
  // seasons with mid-year owner changes can have a team where the per-season
  // primary owner differs from later years. If we only seed owners[0], the
  // per-season team→manager lookup later fails for those reassigned teams and
  // silently drops every one of their matchups. Also seed from the league's
  // members array so anyone who joined but never owned a team still exists.
  type MemberSeed = { swid: string; display: string; team_name: string; avatar: string | null }
  const memberSeed = new Map<string, MemberSeed>()
  for (const [, lg] of seasonPayloads) {
    const memberById = new Map<string, EspnMember>()
    for (const m of lg.members ?? []) memberById.set(m.id, m)
    // First pass: every member in the league (some leagues list members who
    // co-owned but weren't primary; we still want managers rows for them).
    for (const m of lg.members ?? []) {
      if (memberSeed.has(m.id)) continue
      memberSeed.set(m.id, {
        swid: m.id,
        display: memberDisplayName(m),
        team_name: memberDisplayName(m),
        avatar: null,
      })
    }
    // Second pass: every team's full owners array. This refines display
    // names + team metadata for those who actually owned a team.
    for (const t of lg.teams ?? []) {
      for (const ownerSwid of t.owners ?? []) {
        if (!ownerSwid) continue
        const m = memberById.get(ownerSwid)
        memberSeed.set(ownerSwid, {
          swid: ownerSwid,
          display: m ? memberDisplayName(m) : teamDisplayName(t),
          team_name: teamDisplayName(t),
          avatar: t.logo ?? null,
        })
      }
    }
  }

  for (const seed of memberSeed.values()) {
    const { error } = await db.from('managers').upsert(
      {
        league_id: archiveLeagueId,
        external_id: seed.swid,
        display_name: seed.display,
        team_name: seed.team_name,
        avatar_url: seed.avatar,
      },
      { onConflict: 'league_id,external_id' }
    )
    if (error) result.warnings.push(`Upsert manager ${seed.swid}: ${error.message}`)
  }

  // Lookup: SWID -> our manager UUID
  const { data: managerRows } = await db
    .from('managers')
    .select('id, external_id')
    .eq('league_id', archiveLeagueId)
  const managerIdBySwid = new Map<string, string>()
  for (const m of managerRows ?? []) {
    if (m.external_id) managerIdBySwid.set(m.external_id, m.id)
  }
  result.managersIngested = managerIdBySwid.size

  // Walk each season
  for (const [year, lg] of [...seasonPayloads.entries()].sort(([a], [b]) => a - b)) {
    try {
      await ingestSeason({
        db,
        archiveLeagueId,
        year,
        lg,
        managerIdBySwid,
        auth,
        result,
      })
      result.seasonsIngested++
    } catch (err) {
      result.warnings.push(`Season ${year}: ${(err as Error).message}`)
    }
  }

  return result
}

// ─── Per-season ingest ────────────────────────────────────────────────────

async function ingestSeason(args: {
  db: ReturnType<typeof createAdminClient>
  archiveLeagueId: string
  year: number
  lg: EspnLeague
  managerIdBySwid: Map<string, string>
  auth?: EspnAuth
  result: IngestResult
}): Promise<void> {
  const { db, archiveLeagueId, year, lg, managerIdBySwid, auth, result } = args

  // team_id → SWID (this season only — ESPN recycles team_ids across years).
  // Some old seasons return teams whose owners[0] points at a SWID that was
  // never seeded into our managers table (e.g. the primary owner left and the
  // team was reassigned mid-season, leaving stale references). Walk the full
  // owners array and use the first SWID we actually have a manager row for.
  const teamToSwid = new Map<number, string>()
  const teamToName = new Map<number, string>()
  const teamToAvatar = new Map<number, string | null>()
  const teamMap = new Map<number, EspnTeam>()
  for (const t of lg.teams ?? []) {
    teamMap.set(t.id, t)
    teamToName.set(t.id, teamDisplayName(t))
    teamToAvatar.set(t.id, t.logo ?? null)
    const resolved = (t.owners ?? []).find((swid) => swid && managerIdBySwid.has(swid))
      ?? t.owners?.[0]
    if (resolved) teamToSwid.set(t.id, resolved)
  }
  const teamToManagerId = (tid: number): string | null => {
    const swid = teamToSwid.get(tid)
    return swid ? managerIdBySwid.get(swid) ?? null : null
  }

  // Determine playoff start week from the schedule's actual structure rather
  // than scheduleSettings.matchupPeriodCount, which is unreliable on old
  // ESPN leagues (sometimes reflects only regular season, sometimes total,
  // sometimes off-by-one). Priority of signals:
  //   1. Earliest week explicitly tagged WINNERS_BRACKET (modern data)
  //   2. Latest week explicitly tagged NONE + 1 (modern data, alt path)
  //   3. Schedule max week minus playoff rounds (works on old/untagged data)
  //   4. Hardcoded fallback of week 15
  // Floor at week 11 so a stray mis-tag or weirdly-short schedule can't
  // pull the playoff start so far forward that most of the regular season
  // gets mis-classified.
  const flat = flattenSchedule(lg)
  const ss = lg.settings?.scheduleSettings
  const firstWinnersBracket = flat
    .filter((m) => m.playoff_tier === 'WINNERS_BRACKET')
    .reduce((min, m) => Math.min(min, m.week), Infinity)
  const lastNoneTier = flat
    .filter((m) => m.playoff_tier === 'NONE')
    .reduce((max, m) => Math.max(max, m.week), 0)
  const distinctWeeks = [...new Set(flat.map((m) => m.week))]
  const maxScheduleWeek = distinctWeeks.length > 0 ? Math.max(...distinctWeeks) : 0
  const playoffTeamsCount = ss?.playoffTeamCount ?? 6
  const playoffRoundLen = ss?.playoffMatchupPeriodLength ?? 1
  // rounds = ceil(log2(teams)). 2→1, 3-4→2, 5-8→3, 9-16→4.
  const playoffRounds = playoffTeamsCount <= 2 ? 1
    : playoffTeamsCount <= 4 ? 2
      : playoffTeamsCount <= 8 ? 3
        : 4

  let playoffStart: number
  let playoffStartSource: string
  if (Number.isFinite(firstWinnersBracket)) {
    playoffStart = Math.max(11, firstWinnersBracket)
    playoffStartSource = 'WB-tag'
  } else if (lastNoneTier > 0) {
    playoffStart = Math.max(11, lastNoneTier + 1)
    playoffStartSource = 'NONE-tag'
  } else if (maxScheduleWeek > 0) {
    // No tier info — derive from the schedule's actual length, not from the
    // settings field. ESPN's history endpoint frequently returns a tiny
    // matchupPeriodCount that doesn't match the real season structure.
    playoffStart = Math.max(11, maxScheduleWeek - playoffRounds * playoffRoundLen + 1)
    playoffStartSource = `schedule-len(${maxScheduleWeek},rounds=${playoffRounds})`
  } else {
    playoffStart = 15
    playoffStartSource = 'fallback-15'
  }
  const allWeeks = flat.length > 0
    ? Math.max(...flat.map((m) => m.week))
    : (ss?.matchupPeriodCount ?? 17)
  const playoffWeeks = Array.from({ length: allWeeks - playoffStart + 1 }, (_, i) => playoffStart + i)

  // Belt-and-suspenders consolation filter. The tier-based filter in
  // flattenSchedule catches consolation games when ESPN has tagged them
  // correctly; this seed-based check catches the cases where it didn't —
  // typically old seasons returned through the leagueHistory endpoint where
  // playoffTierType is sparse or missing entirely.
  //
  // Rule: for any postseason matchup (week >= playoffStart), at least one
  // participant must have a playoffSeed in 1..playoffTeamCount. If neither
  // does, it's exhibition/consolation that snuck through the first filter.
  //
  // Skip the rule entirely if seed data isn't available — better to keep
  // the game than to false-negative-drop it.
  const playoffTeamCount = ss?.playoffTeamCount ?? 0
  const playoffQualifiedTeams = new Set<number>()
  if (playoffTeamCount > 0) {
    for (const t of lg.teams ?? []) {
      if (typeof t.playoffSeed === 'number' && t.playoffSeed >= 1 && t.playoffSeed <= playoffTeamCount) {
        playoffQualifiedTeams.add(t.id)
      }
    }
  }
  const useSeedFilter = playoffQualifiedTeams.size >= 2

  // Division metadata from scheduleSettings. ESPN gives division id + name;
  // map id → 0-indexed position so manager_seasons.division_index lines up
  // with the divisions array we store on the season settings.
  const divisions = lg.settings?.scheduleSettings?.divisions ?? []
  const divisionIdxById = new Map<number, number>()
  divisions.forEach((d, i) => divisionIdxById.set(d.id, i))
  const divisionNames = divisions.map((d) => d.name)

  // Champion / runner-up from rankCalculatedFinal (1 / 2). Mid-season seasons
  // won't have these set yet — that's fine, the season row simply omits them.
  const { championTeamId, runnerUpTeamId } = deriveChampions(lg)
  const champManager = championTeamId != null ? teamToManagerId(championTeamId) : null
  const runnerUpManager = runnerUpTeamId != null ? teamToManagerId(runnerUpTeamId) : null

  // Upsert season row
  const { data: seasonRow, error: seasonErr } = await db
    .from('seasons')
    .upsert(
      {
        league_id: archiveLeagueId,
        year,
        external_id: String(lg.id),
        playoff_weeks: playoffWeeks,
        settings: {
          playoff_week_start: playoffStart,
          playoff_team_count: lg.settings?.scheduleSettings?.playoffTeamCount ?? null,
          division_names: divisionNames,
          latest_scoring_period: lg.status?.latestScoringPeriod ?? null,
        },
      },
      { onConflict: 'league_id,year' }
    )
    .select('id')
    .single()
  if (seasonErr || !seasonRow) throw new Error(`upsert season: ${seasonErr?.message}`)
  const seasonId = seasonRow.id

  // Rebuild per-season aggregates. Matchups are NOT wiped — they're upserted
  // with a deterministic a/b key so re-syncs update rows in place, keeping
  // matchup ids stable (pickems_picks references them via a cascading FK).
  await db.from('manager_seasons').delete().eq('season_id', seasonId)
  await db.from('drafts').delete().eq('season_id', seasonId)
  await db.from('weekly_lineups').delete().eq('season_id', seasonId)

  // ─── manager_seasons ────────────────────────────────────────────────────
  // ESPN's team.record.overall has the authoritative regular-season totals.
  // Regular-season rank: by win% desc, then PF desc (mirrors ESPN's own ordering).
  const teamsSorted = [...(lg.teams ?? [])].sort((a, b) => {
    const ar = a.record?.overall
    const br = b.record?.overall
    const aPct = ar?.percentage ?? winPctFromRecord(ar)
    const bPct = br?.percentage ?? winPctFromRecord(br)
    if (bPct !== aPct) return bPct - aPct
    return (br?.pointsFor ?? 0) - (ar?.pointsFor ?? 0)
  })
  // Skip ranking entirely for a season where no games have been played yet
  // (preseason 2026, for example) — otherwise everyone tied at 0-0/0pts gets
  // an arbitrary rank based on team.id ordering, which is misleading.
  const seasonHasGames = (lg.teams ?? []).some((t) => {
    const r = t.record?.overall
    return ((r?.wins ?? 0) + (r?.losses ?? 0) + (r?.ties ?? 0)) > 0
      || (r?.pointsFor ?? 0) > 0
  })
  const regRank = new Map<number, number>()
  if (seasonHasGames) {
    teamsSorted.forEach((t, idx) => regRank.set(t.id, idx + 1))
  }

  for (const team of lg.teams ?? []) {
    const managerId = teamToManagerId(team.id)
    if (!managerId) continue
    const ov = team.record?.overall ?? {}
    const divIdx = team.divisionId != null ? divisionIdxById.get(team.divisionId) ?? null : null
    // Final rank priority: rankCalculatedFinal (most authoritative) → rankFinal
    // → playoffSeed (regular-season seeding, a rough proxy for old leagues
    // where the rank fields aren't populated). Without SOME rank value here,
    // the exporter's "playoff games where someone finished top 4" filter
    // excludes all postseason matchups, undercounting total_matchups badly.
    const finalRank = team.rankCalculatedFinal ?? team.rankFinal ?? team.playoffSeed ?? null
    const { error } = await db.from('manager_seasons').upsert(
      {
        season_id: seasonId,
        manager_id: managerId,
        team_name: teamToName.get(team.id) ?? null,
        avatar_url: teamToAvatar.get(team.id) ?? null,
        wins: ov.wins ?? 0,
        losses: ov.losses ?? 0,
        ties: ov.ties ?? 0,
        points_for: round2(ov.pointsFor ?? 0),
        points_against: round2(ov.pointsAgainst ?? 0),
        final_rank: finalRank,
        regular_rank: regRank.get(team.id) ?? null,
        division_index: divIdx,
      },
      { onConflict: 'season_id,manager_id' }
    )
    if (error) result.warnings.push(`Season ${year} manager_seasons team ${team.id}: ${error.message}`)
  }

  // Regular-season winner = top of regRank. Null until at least one game.
  const regularSeasonWinner = seasonHasGames && teamsSorted[0]
    ? teamToManagerId(teamsSorted[0].id)
    : null

  await db
    .from('seasons')
    .update({
      champion_manager_id: champManager,
      runner_up_manager_id: runnerUpManager,
      regular_season_winner_id: regularSeasonWinner,
    })
    .eq('id', seasonId)

  // ─── matchups ───────────────────────────────────────────────────────────
  // ESPN's status.latestScoringPeriod is the most recent week that has been
  // (or is being) scored. Anything beyond it is a future week — write the
  // matchup with null scores so pickems can show it, but don't count it.
  const latestScored = lg.status?.latestScoringPeriod ?? 0
  let matchupsCount = 0
  // Track every (week,mA,mB) tuple we write so we can wipe stale rows that
  // existed from a previous sync but no longer come through (e.g. consolation
  // games before we added the platform-level filter).
  const validKeys = new Set<string>()

  let skippedBySeed = 0
  let skippedUnresolvedTeam = 0
  let skippedSameManager = 0
  const unresolvedTeamIds = new Set<number>()

  for (const m of flat) {
    const aMgr = teamToManagerId(m.a_team_id)
    const bMgr = teamToManagerId(m.b_team_id)
    if (!aMgr || !bMgr) {
      skippedUnresolvedTeam++
      if (!aMgr) unresolvedTeamIds.add(m.a_team_id)
      if (!bMgr) unresolvedTeamIds.add(m.b_team_id)
      continue
    }
    if (aMgr === bMgr) {
      skippedSameManager++
      continue
    }

    // Trust ESPN's explicit tier when present; fall back to week math when
    // it's missing (typical for old leagueHistory-endpoint seasons).
    //   - 'NONE' → always regular, no matter the week
    //   - 'WINNERS_BRACKET' → always playoff
    //   - undefined → use computed playoffStart
    const isPlayoff = m.playoff_tier === 'NONE'
      ? false
      : m.playoff_tier === 'WINNERS_BRACKET'
        ? true
        : m.week >= playoffStart

    // Seed-based second pass: postseason games must involve at least one
    // playoff-qualified team. Skips consolation games that ESPN didn't tier.
    if (isPlayoff && useSeedFilter) {
      if (!playoffQualifiedTeams.has(m.a_team_id) && !playoffQualifiedTeams.has(m.b_team_id)) {
        skippedBySeed++
        continue
      }
    }

    matchupsCount++

    const played = m.week <= latestScored
    const aScore = played ? m.a_score : null
    const bScore = played ? m.b_score : null

    // Championship: a playoff matchup in the final playoff week between the
    // derived champion and runner-up. Works for both modern (rankCalculatedFinal)
    // and old (winners-bracket-fallback) detection paths.
    const isChampGame =
      isPlayoff &&
      championTeamId != null &&
      runnerUpTeamId != null &&
      ((m.a_team_id === championTeamId && m.b_team_id === runnerUpTeamId) ||
       (m.a_team_id === runnerUpTeamId && m.b_team_id === championTeamId))

    // Deterministic a/b ordering — smaller manager UUID is always a — so the
    // upsert key is stable across re-syncs and matchup ids persist.
    let mA = aMgr, mB = bMgr, sA: number | null = aScore, sB: number | null = bScore
    if (mA > mB) { [mA, mB] = [mB, mA]; [sA, sB] = [sB, sA] }
    validKeys.add(`${m.week}|${mA}|${mB}`)

    const { error } = await db.from('matchups').upsert(
      {
        season_id: seasonId,
        week: m.week,
        manager_a_id: mA,
        manager_b_id: mB,
        score_a: sA,
        score_b: sB,
        is_playoff: isPlayoff,
        is_championship: isChampGame,
      },
      { onConflict: 'season_id,week,manager_a_id,manager_b_id' }
    )
    if (error) result.warnings.push(`Season ${year} week ${m.week} matchup: ${error.message}`)
  }
  result.matchupsIngested += matchupsCount
  if (skippedBySeed > 0) {
    result.warnings.push(`Season ${year}: skipped ${skippedBySeed} consolation matchup${skippedBySeed === 1 ? '' : 's'} via seed-based filter (neither participant qualified for the real playoffs)`)
  }
  if (skippedSameManager > 0) {
    result.warnings.push(`Season ${year}: skipped ${skippedSameManager} matchup${skippedSameManager === 1 ? '' : 's'} where both sides resolved to the same manager (likely a co-owner that already plays for the other team)`)
  }
  if (skippedUnresolvedTeam > 0) {
    const ids = Array.from(unresolvedTeamIds).slice(0, 8).join(', ')
    const more = unresolvedTeamIds.size > 8 ? ` + ${unresolvedTeamIds.size - 8} more` : ''
    result.warnings.push(
      `Season ${year}: dropped ${skippedUnresolvedTeam} matchup${skippedUnresolvedTeam === 1 ? '' : 's'} because team(s) had no resolvable owner. ` +
      `Affected team_ids: ${ids}${more}. ` +
      `(ESPN sometimes returns teams with empty owners[] arrays; if this is a public league check if these team slots were vacated mid-season on ESPN.)`
    )
  }
  // Always surface the season's net inserted count so you can sanity-check the
  // ingest math: flat - dropped - filtered should equal what's in the DB.
  // Includes playoffStart + how it was decided so we can diagnose when many
  // regular-season games get mis-flagged as playoff.
  result.warnings.push(`Season ${year} matchups breakdown: ${flat.length} from ESPN → ${matchupsCount} inserted (dropped ${skippedUnresolvedTeam} unresolved + ${skippedSameManager} same-manager + ${skippedBySeed} consolation-by-seed) · playoffStart=week ${playoffStart} (${playoffStartSource})`)

  // Cleanup: delete matchups in this season that weren't in the new flat list.
  // Previously ingested ESPN seasons may carry consolation games we no longer
  // import. This is safe — pickems_picks cascades, and consolation games
  // never had pickems on them anyway. Use a paged read so the IN clause
  // doesn't blow past Supabase's 1000-row limit.
  let deletedStale = 0
  let from = 0
  const PAGE = 1000
  for (;;) {
    const { data: existing } = await db
      .from('matchups')
      .select('id, week, manager_a_id, manager_b_id')
      .eq('season_id', seasonId)
      .range(from, from + PAGE - 1)
    if (!existing || existing.length === 0) break
    const staleIds = existing
      .filter((r) => !validKeys.has(`${r.week}|${r.manager_a_id}|${r.manager_b_id}`))
      .map((r) => r.id)
    if (staleIds.length > 0) {
      const { error: delErr } = await db.from('matchups').delete().in('id', staleIds)
      if (delErr) {
        result.warnings.push(`Season ${year} stale-matchup cleanup: ${delErr.message}`)
      } else {
        deletedStale += staleIds.length
      }
    }
    if (existing.length < PAGE) break
    from += PAGE
  }
  if (deletedStale > 0) {
    result.warnings.push(`Season ${year}: removed ${deletedStale} stale matchup${deletedStale === 1 ? '' : 's'} (e.g. consolation games no longer imported)`)
  }

  // ─── weekly lineups ─────────────────────────────────────────────────────
  // Per-week per-player roster snapshot for the Best Coach Tracker. One row
  // per rostered player per side per week, with slot + points denormalized.
  // ESPN's leagueHistory endpoint may not honor scoringPeriodId for ancient
  // seasons — we tolerate empty teams[] arrays by skipping that week silently.
  if (latestScored > 0) {
    const lineupWeeks = Array.from({ length: latestScored }, (_, i) => i + 1)
    // Accumulator across all weeks — single chunked upsert at the end avoids
    // ~N round-trips and keeps the season under the Vercel function timeout.
    const seasonLineupRows: Array<Record<string, unknown>> = []
    let lineupWeeksEmpty = 0
    await parallelLimit(lineupWeeks, 4, async (week) => {
      let payload
      try {
        payload = await fetchWeekRoster(String(lg.id), year, week, auth)
      } catch (err) {
        result.warnings.push(`Season ${year} week ${week} roster fetch: ${(err as Error).message}`)
        return
      }
      const teams = payload.teams ?? []
      if (teams.length === 0) { lineupWeeksEmpty++; return }
      for (const team of teams) {
        const managerId = teamToManagerId(team.id)
        if (!managerId) continue
        for (const entry of team.roster?.entries ?? []) {
          const player = entry.playerPoolEntry?.player
          if (!player) continue
          const slot = espnSlotName(entry.lineupSlotId)
          // Pick the week's actual fantasy points: scoringPeriodId match,
          // statSourceId=0 (actual), statSplitTypeId=1 (single period).
          const weekStat = (player.stats ?? []).find(
            (s) => s.scoringPeriodId === week && s.statSourceId === 0 && s.statSplitTypeId === 1
          )
          const projStat = (player.stats ?? []).find(
            (s) => s.scoringPeriodId === week && s.statSourceId === 1 && s.statSplitTypeId === 1
          )
          const fullName =
            player.fullName?.trim()
            || [player.firstName, player.lastName].filter(Boolean).join(' ').trim()
            || null
          seasonLineupRows.push({
            season_id: seasonId,
            week,
            manager_id: managerId,
            player_external_id: String(player.id),
            player_name: fullName,
            position: positionFromId(player.defaultPositionId),
            nfl_team: nflTeamFromId(player.proTeamId),
            slot,
            is_starter: isStarterSlot(slot),
            points: weekStat?.appliedTotal ?? null,
            proj_points: projStat?.appliedTotal ?? null,
          })
        }
      }
    })
    let lineupUpserted = 0
    let lineupErrors = 0
    if (seasonLineupRows.length > 0) {
      const CHUNK = 1000
      for (let i = 0; i < seasonLineupRows.length; i += CHUNK) {
        const slice = seasonLineupRows.slice(i, i + CHUNK)
        const { error } = await db.from('weekly_lineups').upsert(slice, {
          onConflict: 'season_id,week,manager_id,player_external_id',
        })
        if (error) {
          lineupErrors++
          result.warnings.push(`Season ${year} weekly_lineups chunk ${i}-${i + slice.length}: ${error.message}`)
        } else {
          lineupUpserted += slice.length
        }
      }
    }
    result.warnings.push(
      `Season ${year} weekly_lineups: ${lineupUpserted} rows upserted across ${latestScored - lineupWeeksEmpty}/${latestScored} weeks` +
      (lineupErrors > 0 ? `, ${lineupErrors} chunk errors` : '') +
      (lineupWeeksEmpty > 0 ? ` (${lineupWeeksEmpty} weeks returned no roster data — likely a historical season ESPN can't slice by scoring period)` : '')
    )
  }

  // ─── draft picks ────────────────────────────────────────────────────────
  // mDraftDetail returns playerId but not the player's name. We batch-resolve
  // names via the kona_player_info endpoint (one call per season, regardless
  // of pick count). If the lookup fails the picks still write with null name +
  // position — the player_external_id is preserved so we can backfill later.
  const picks = lg.draftDetail?.picks ?? []
  if (picks.length > 0 && lg.draftDetail?.completed !== false) {
    const isAuction = picks.some((p) => typeof p.bidAmount === 'number')
    const { data: draftRow, error: draftErr } = await db
      .from('drafts')
      .upsert(
        {
          season_id: seasonId,
          external_id: String(lg.id),
          draft_type: isAuction ? 'auction' : 'snake',
          rounds: picks.length > 0 ? picks[picks.length - 1].roundId : null,
        },
        { onConflict: 'season_id,external_id' }
      )
      .select('id')
      .single()
    if (draftErr || !draftRow) {
      result.warnings.push(`Season ${year} draft upsert: ${draftErr?.message}`)
    } else {
      let playerLookup = new Map<number, { fullName?: string; firstName?: string; lastName?: string; defaultPositionId?: number; proTeamId?: number }>()
      try {
        const ids = picks.map((p) => p.playerId).filter((id): id is number => typeof id === 'number')
        playerLookup = await fetchPlayers(year, ids, auth)
      } catch (err) {
        result.warnings.push(`Season ${year} player lookup: ${(err as Error).message} — draft picks will have null names`)
      }

      for (const p of picks) {
        const mgrId = teamToManagerId(p.teamId)
        const info = playerLookup.get(p.playerId)
        const fullName =
          info?.fullName?.trim()
          || [info?.firstName, info?.lastName].filter(Boolean).join(' ').trim()
          || null
        const { error } = await db.from('draft_picks').upsert(
          {
            draft_id: draftRow.id,
            round: p.roundId,
            pick: p.overallPickNumber,
            manager_id: mgrId,
            player_name: fullName,
            position: positionFromId(info?.defaultPositionId),
            nfl_team: nflTeamFromId(info?.proTeamId),
            player_external_id: String(p.playerId),
          },
          { onConflict: 'draft_id,pick' }
        )
        if (error) result.warnings.push(`Season ${year} draft pick ${p.overallPickNumber}: ${error.message}`)
      }
      result.draftsIngested++
    }
  }

  // ─── trades ─────────────────────────────────────────────────────────────
  // mTransactions2 ledger → only EXECUTED TRADE_ACCEPT rows. Each ESPN trade
  // is one transaction with N items spanning ≥2 distinct teams; we group items
  // by team-as-receiver to build the per-side asset list.
  let txs: EspnTransaction[] = []
  try {
    txs = await fetchTransactions(String(lg.id), year, auth)
  } catch (err) {
    // Some old seasons 404 on mTransactions2 — non-fatal.
    result.warnings.push(`Season ${year} transactions: ${(err as Error).message} — skipping trade ingest for this year`)
  }
  const trades = filterExecutedTrades(txs)
  if (trades.length > 0) {
    // Batch-resolve player names across every player referenced in trades for
    // this season. One call instead of one per trade.
    const tradePlayerIds = new Set<number>()
    for (const t of trades) {
      for (const item of t.items ?? []) {
        if (typeof item.playerId === 'number' && item.type !== 'DRAFT_PICK') {
          tradePlayerIds.add(item.playerId)
        }
      }
    }
    let tradePlayers = new Map<number, { fullName?: string; firstName?: string; lastName?: string; defaultPositionId?: number; proTeamId?: number }>()
    if (tradePlayerIds.size > 0) {
      try {
        tradePlayers = await fetchPlayers(year, [...tradePlayerIds], auth)
      } catch (err) {
        result.warnings.push(`Season ${year} trade player lookup: ${(err as Error).message} — names will be null`)
      }
    }

    for (const t of trades) {
      // assetsByTeam: each side's asset list is the items where toTeamId ===
      // that team (i.e. they're the receiver of the asset).
      const assetsByTeam = new Map<number, Array<Record<string, unknown>>>()
      const ensureTeam = (tid: number) => {
        if (!assetsByTeam.has(tid)) assetsByTeam.set(tid, [])
        return assetsByTeam.get(tid)!
      }
      for (const item of t.items ?? []) {
        const to = item.toTeamId
        if (typeof to !== 'number') continue
        ensureTeam(to)
        if (typeof item.fromTeamId === 'number') ensureTeam(item.fromTeamId)
        if (item.type === 'DRAFT_PICK') {
          const arr = ensureTeam(to)
          // ESPN's pick metadata is inconsistent across seasons. We capture
          // whatever shape we get and let the UI degrade gracefully when a
          // field is missing.
          const originalTid = typeof item.originalTeamId === 'number' ? item.originalTeamId : item.fromTeamId
          arr.push({
            kind: 'pick',
            season_year: year,
            round: typeof item.roundNumber === 'number' ? item.roundNumber : null,
            pick: typeof item.pickNumber === 'number' ? item.pickNumber : null,
            original_owner_manager_id: typeof originalTid === 'number' ? teamToManagerId(originalTid) : null,
          })
        } else if (typeof item.playerId === 'number') {
          const info = tradePlayers.get(item.playerId)
          const fullName =
            info?.fullName?.trim()
            || [info?.firstName, info?.lastName].filter(Boolean).join(' ').trim()
            || null
          const arr = ensureTeam(to)
          arr.push({
            kind: 'player',
            player_id: String(item.playerId),
            name: fullName,
            position: positionFromId(info?.defaultPositionId),
            team: nflTeamFromId(info?.proTeamId),
          })
        }
      }

      // Skip degenerate "trades" with fewer than 2 sides after grouping —
      // can happen when ESPN returns a half-applied trade row.
      if (assetsByTeam.size < 2) continue

      const externalTradeId = String(t.id ?? `${seasonId}|${t.processDate ?? t.proposedDate ?? Date.now()}|${[...assetsByTeam.keys()].sort().join(',')}`)
      const executedAtMs = t.processDate ?? t.proposedDate ?? Date.now()

      const { data: tradeRow, error: tradeErr } = await db
        .from('trades')
        .upsert(
          {
            league_id: archiveLeagueId,
            season_id: seasonId,
            platform: 'espn',
            external_id: externalTradeId,
            week: typeof t.scoringPeriodId === 'number' ? t.scoringPeriodId : null,
            executed_at: new Date(executedAtMs).toISOString(),
            status: 'completed',
            raw_payload: t,
          },
          { onConflict: 'league_id,platform,external_id' }
        )
        .select('id')
        .single()
      if (tradeErr || !tradeRow) {
        result.warnings.push(`Season ${year} trade ${externalTradeId}: upsert failed: ${tradeErr?.message ?? 'no row'}`)
        continue
      }

      await db.from('trade_sides').delete().eq('trade_id', tradeRow.id)
      let sidesInserted = 0
      for (const [tid, assets] of assetsByTeam) {
        const managerId = teamToManagerId(tid)
        if (!managerId) {
          result.warnings.push(`Season ${year} trade ${externalTradeId}: team ${tid} has no manager mapping; side skipped`)
          continue
        }
        const { error: sideErr } = await db.from('trade_sides').insert({
          trade_id: tradeRow.id,
          manager_id: managerId,
          assets,
        })
        if (sideErr) {
          result.warnings.push(`Season ${year} trade ${externalTradeId} side team ${tid}: ${sideErr.message}`)
          continue
        }
        sidesInserted++
      }
      if (sidesInserted >= 2) result.tradesIngested++
    }
  }
}

function winPctFromRecord(r?: { wins?: number; losses?: number; ties?: number }): number {
  if (!r) return 0
  const w = r.wins ?? 0, l = r.losses ?? 0, t = r.ties ?? 0
  const total = w + l + t
  if (total === 0) return 0
  return (w + t * 0.5) / total
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
