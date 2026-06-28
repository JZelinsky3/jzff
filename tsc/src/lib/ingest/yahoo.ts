// Yahoo ingestion. Mirrors the structure of sleeper.ts:
//   ingestYahooLeague(archiveLeagueId) — loop over every source attached
//   ingestYahooSource(archiveLeagueId, startLeagueKey, walkHistory) — core
//
// Yahoo specifics worth knowing:
//   * Each season is its own league_key ("461.l.123456"). The `renew` field
//     on a league points back to the prior season as "{prev_game}_{prev_id}".
//     We walk that chain to assemble the chronological history.
//   * A `manager.guid` is the human; `team_key` is the per-season franchise.
//   * Standings give us records + final rank in one call. Once the season
//     is over, team_standings.rank IS the final rank (1 = champion). During
//     the playoffs it's still the regular-season rank.
//   * Scoreboard per week tells us is_playoffs / is_consolation directly.
//   * Yahoo requires per-user OAuth, so the sync route must look up the
//     league owner's token (admin client bypasses yahoo_tokens RLS).

import { createAdminClient } from '@/lib/supabase/admin'
import {
  getValidAccessToken,
  walkLeagueChain,
  getLeagueDetail,
  getLeagueTeamsStandings,
  getLeagueScoreboard,
  getLeagueDraft,
  getPlayersBatch,
  getTeamRosterWeek,
  getLeagueTransactions,
  yahooIsStarterSlot,
  type YahooTeam,
  type YahooLeagueMeta,
} from '@/lib/platforms/yahoo'
import { parallelLimit } from '@/lib/platforms/sleeper'
import { computePositionRanks, stampRanks } from '@/lib/positionRanks'
import { DEFAULT_PPR_SCORING } from '@/lib/scoring'
import { resolveStages, type IngestStages } from './stages'

export type IngestResult = {
  ok: boolean
  seasonsIngested: number
  managersIngested: number
  matchupsIngested: number
  draftsIngested: number
  tradesIngested: number
  warnings: string[]
}

export async function ingestYahooLeague(
  leagueRowId: string,
  stages?: IngestStages,
): Promise<IngestResult> {
  const db = createAdminClient()
  const { data: leagueRow, error: leagueErr } = await db
    .from('leagues')
    .select('id, owner_id, external_id, name')
    .eq('id', leagueRowId)
    .maybeSingle()
  if (leagueErr || !leagueRow) throw new Error('League not found')
  if (!leagueRow.owner_id) throw new Error('League has no owner; cannot fetch Yahoo tokens.')

  const accessToken = await getValidAccessToken(leagueRow.owner_id, db)

  const { data: sources } = await db
    .from('league_sources')
    .select('id, external_id, walk_history, settings')
    .eq('league_id', leagueRow.id)
    .eq('platform', 'yahoo')

  const sourceList =
    sources && sources.length > 0
      ? sources
      : [{ id: null, external_id: leagueRow.external_id, walk_history: true, settings: null }]

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
    const settings = (src.settings ?? null) as Record<string, unknown> | null
    const seasonStart = typeof settings?.season_start === 'number' ? settings.season_start : undefined
    const seasonEnd = typeof settings?.season_end === 'number' ? settings.season_end : undefined
    const result = await ingestYahooSource(
      leagueRowId,
      src.external_id,
      src.walk_history,
      accessToken,
      { seasonStart, seasonEnd },
      stages,
    )
    aggregate.seasonsIngested += result.seasonsIngested
    aggregate.managersIngested += result.managersIngested
    aggregate.matchupsIngested += result.matchupsIngested
    aggregate.draftsIngested += result.draftsIngested
    aggregate.tradesIngested += result.tradesIngested
    aggregate.warnings.push(...result.warnings)
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

export async function ingestYahooSource(
  archiveLeagueId: string,
  startLeagueKey: string,
  walkHistory: boolean,
  accessToken: string,
  range?: { seasonStart?: number; seasonEnd?: number },
  stagesIn?: IngestStages,
): Promise<IngestResult> {
  const db = createAdminClient()
  const warnings: string[] = []
  const stages = resolveStages(stagesIn)

  // Build the chronological list of seasons (oldest first).
  const fullHistory: YahooLeagueMeta[] = walkHistory
    ? await walkLeagueChain(accessToken, startLeagueKey)
    : await (async () => {
        const { getLeagueMeta } = await import('@/lib/platforms/yahoo')
        const one = await getLeagueMeta(accessToken, startLeagueKey)
        return one ? [one] : []
      })()
  if (fullHistory.length === 0) throw new Error('Yahoo returned no league data')

  // Filter to the requested year window if one was set on the source — lets
  // a user split coverage between Yahoo + another platform without doubling up
  // on shared seasons.
  const minYear = range?.seasonStart
  const maxYear = range?.seasonEnd
  const history = fullHistory.filter((lg) => {
    const y = parseInt(lg.season, 10)
    if (Number.isNaN(y)) return true
    if (minYear != null && y < minYear) return false
    if (maxYear != null && y > maxYear) return false
    return true
  })
  if (history.length === 0) {
    warnings.push(
      `Yahoo: no seasons in range ${minYear ?? '*'}–${maxYear ?? '*'} (chain had ${fullHistory.length}).`
    )
    return { ok: true, seasonsIngested: 0, managersIngested: 0, matchupsIngested: 0, draftsIngested: 0, tradesIngested: 0, warnings }
  }

  // Pass 1 — collect every manager (guid) across every season so the managers
  // table is complete before we start per-season writes.
  const managerByGuid = new Map<string, { nickname: string; image_url?: string }>()
  // We also need a per-season (team_key → guid) map for the matchups + draft passes.
  const teamsBySeason = new Map<string, YahooTeam[]>()  // leagueKey -> teams[]
  for (const lg of history) {
    const teams = await getLeagueTeamsStandings(accessToken, lg.league_key, warnings)
    teamsBySeason.set(lg.league_key, teams)
    for (const t of teams) {
      // Take the first non-co-manager — Yahoo lists co-owners as additional
      // entries with the same team_key; the primary owner is usually first.
      const primary = t.managers[0]
      if (!primary) continue
      if (!managerByGuid.has(primary.guid)) {
        managerByGuid.set(primary.guid, {
          nickname: primary.nickname,
          image_url: primary.image_url,
        })
      }
    }
  }

  // Upsert managers
  for (const [guid, m] of managerByGuid) {
    await db.from('managers').upsert(
      {
        league_id: archiveLeagueId,
        external_id: guid,
        display_name: m.nickname,
        team_name: m.nickname,  // refined per-season below in manager_seasons
        avatar_url: m.image_url ?? null,
      },
      { onConflict: 'league_id,external_id' }
    )
  }

  // Lookup table: yahoo guid -> our manager UUID
  const { data: managerRows } = await db
    .from('managers')
    .select('id, external_id')
    .eq('league_id', archiveLeagueId)
  const managerIdByGuid = new Map<string, string>()
  for (const m of managerRows ?? []) {
    if (m.external_id) managerIdByGuid.set(m.external_id, m.id)
  }

  let matchupsIngested = 0
  let draftsIngested = 0
  let tradesIngested = 0

  // Pass 2 — per-season ingest.
  for (const lg of history) {
    const year = parseInt(lg.season, 10)
    if (Number.isNaN(year)) {
      warnings.push(`Season "${lg.season}" on ${lg.league_key} is non-numeric, skipping`)
      continue
    }

    // Pull league settings for playoff config (start week, # of teams, divisions).
    const detail = await getLeagueDetail(accessToken, lg.league_key)
    const playoffStart = detail?.playoff_start_week ?? lg.end_week - 2
    const playoffWeeks: number[] = []
    for (let w = playoffStart; w <= lg.end_week; w++) playoffWeeks.push(w)

    // Upsert season row (champion/runner-up filled in below).
    const { data: seasonRow, error: seasonErr } = await db
      .from('seasons')
      .upsert(
        {
          league_id: archiveLeagueId,
          year,
          external_id: lg.league_key,
          playoff_weeks: playoffWeeks,
          settings: {
            num_teams: lg.num_teams,
            start_week: lg.start_week,
            end_week: lg.end_week,
            num_playoff_teams: detail?.num_playoff_teams ?? null,
          },
        },
        { onConflict: 'league_id,year' }
      )
      .select('id')
      .single()
    if (seasonErr || !seasonRow) {
      warnings.push(`Failed to upsert season ${year}: ${seasonErr?.message}`)
      continue
    }
    const seasonId = seasonRow.id

    // Wipe rebuildable per-season aggregates. Matchups are NOT wiped — they
    // upsert by (season_id, week, manager_a_id, manager_b_id) so re-syncs
    // update in place and matchup ids stay stable (FK from pickems_picks).
    await db.from('manager_seasons').delete().eq('season_id', seasonId)
    if (stages.drafts) await db.from('drafts').delete().eq('season_id', seasonId)
    if (stages.lineups) await db.from('weekly_lineups').delete().eq('season_id', seasonId)

    const teams = teamsBySeason.get(lg.league_key) ?? []
    if (teams.length === 0) {
      warnings.push(`Season ${year}: Yahoo returned no teams for ${lg.league_key}. Matchups will be skipped.`)
    }

    // team_key -> manager UUID (primary manager only)
    const teamKeyToManagerId = new Map<string, string>()
    for (const t of teams) {
      const primary = t.managers[0]
      const mgrId = primary ? managerIdByGuid.get(primary.guid) : undefined
      if (mgrId) teamKeyToManagerId.set(t.team_key, mgrId)
    }

    // Determine if we should treat team_standings.rank as FINAL rank or just
    // regular-season rank. Yahoo updates `rank` to reflect final placement
    // once the season ends.
    //
    // Three signals, any of which is sufficient:
    //   1. The season year is in the past (most reliable — once we're in a
    //      later calendar year, the league is definitively done).
    //   2. current_week is unset (older Yahoo responses for finished leagues).
    //   3. current_week >= end_week (Yahoo caps current_week at end_week for
    //      finished seasons rather than letting it exceed). The previous `>`
    //      check missed every finished league because Yahoo always returned
    //      current_week === end_week.
    const seasonHasGames = teams.some((t) => t.wins > 0 || t.losses > 0 || t.points_for > 0)
    const seasonInPast = year < new Date().getFullYear()
    const seasonOver =
      seasonInPast ||
      lg.current_week == null ||
      lg.current_week >= lg.end_week
    const treatRankAsFinal = seasonHasGames && seasonOver

    // Compute regular-season rank from wins (tiebreaker: points-for) so we
    // have something to write even when Yahoo's `rank` is mid-season.
    const regRank = new Map<string, number>()
    if (seasonHasGames) {
      const ranked = [...teams].sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins
        return b.points_for - a.points_for
      })
      ranked.forEach((t, idx) => regRank.set(t.team_key, idx + 1))
    }

    // Insert manager_seasons. Co-managers share a team — we attribute the
    // season to the primary manager only.
    for (const t of teams) {
      const primary = t.managers[0]
      if (!primary) continue
      const mgrId = managerIdByGuid.get(primary.guid)
      if (!mgrId) continue
      const finalRank = treatRankAsFinal
        ? t.rank ?? regRank.get(t.team_key) ?? null
        : null
      await db.from('manager_seasons').upsert(
        {
          season_id: seasonId,
          manager_id: mgrId,
          team_name: t.name || primary.nickname,
          avatar_url: t.logo_url ?? primary.image_url ?? null,
          wins: t.wins,
          losses: t.losses,
          ties: t.ties,
          points_for: t.points_for,
          points_against: t.points_against,
          regular_rank: regRank.get(t.team_key) ?? null,
          final_rank: finalRank,
          division_index: t.division_id != null ? Math.max(0, parseInt(t.division_id, 10) - 1) : null,
        },
        { onConflict: 'season_id,manager_id' }
      )
    }

    // Champion / runner-up / regular-season winner — only meaningful once the
    // season is over.
    let championId: string | null = null
    let runnerUpId: string | null = null
    let regWinnerId: string | null = null
    if (treatRankAsFinal) {
      const sorted = [...teams].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
      const champTeam = sorted[0]
      const ruTeam = sorted[1]
      if (champTeam) championId = teamKeyToManagerId.get(champTeam.team_key) ?? null
      if (ruTeam) runnerUpId = teamKeyToManagerId.get(ruTeam.team_key) ?? null
    }
    if (seasonHasGames) {
      const regSorted = [...teams].sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins
        return b.points_for - a.points_for
      })
      const top = regSorted[0]
      if (top) regWinnerId = teamKeyToManagerId.get(top.team_key) ?? null
    }
    await db
      .from('seasons')
      .update({
        champion_manager_id: championId,
        runner_up_manager_id: runnerUpId,
        regular_season_winner_id: regWinnerId,
      })
      .eq('id', seasonId)

    // Final-rank lookup for bracket attribution. Only populated once the
    // season is over — Yahoo's `rank` is mid-season otherwise. When unset, we
    // fall back to trusting Yahoo's is_playoffs/is_consolation flags alone.
    //
    // Championship-bracket rule (per league convention):
    //   - is_consolation games are NEVER playoff games
    //   - 5th-place-and-below placement games are NEVER playoff games
    //   - 1st, 3rd-place, and the bracket games that determine top-4 ARE playoff
    // Operationalized: a matchup counts as playoff iff at least one participant
    // finished in the top 4. (8-team R1 games count because the winner stays
    // in the top-4 hunt; a 5th-place game between two teams that both finished
    // ≥5 does not.)
    const teamKeyToFinalRank = new Map<string, number>()
    if (treatRankAsFinal) {
      for (const t of teams) {
        if (t.rank != null) teamKeyToFinalRank.set(t.team_key, t.rank)
      }
    }

    // Matchups — fetch every week up to end_week (Yahoo's full season span).
    // No parallel limit helper for Yahoo; we run sequentially to be polite
    // (Yahoo rate-limits unauthenticated bursts; per-user is more generous
    // but still better not to fan out).
    let seasonInserted = 0
    let seasonByeOrSingleSide = 0
    let seasonUnresolvedManager = 0
    let seasonSameManager = 0
    let seasonConsolationFiltered = 0
    let seasonPlacementFiltered = 0
    const championshipWeek = lg.end_week
    if (stages.matchups) {
    for (let week = 1; week <= lg.end_week; week++) {
      const scoreboard = await getLeagueScoreboard(accessToken, lg.league_key, week, warnings)
      for (const m of scoreboard) {
        if (!m.team_a_key || !m.team_b_key) { seasonByeOrSingleSide++; continue }
        const aMgr = teamKeyToManagerId.get(m.team_a_key)
        const bMgr = teamKeyToManagerId.get(m.team_b_key)
        if (!aMgr || !bMgr) { seasonUnresolvedManager++; continue }
        if (aMgr === bMgr) { seasonSameManager++; continue }

        const isPlayed = m.status === 'postevent' || m.status === 'midevent'

        // Bracket attribution. Start from Yahoo's flags, then prune anything
        // we can prove is a 5th-place-or-below game using final ranks.
        let isPlayoff = m.is_playoffs && !m.is_consolation
        if (m.is_playoffs && m.is_consolation) seasonConsolationFiltered++
        if (isPlayoff && teamKeyToFinalRank.size > 0) {
          const rA = teamKeyToFinalRank.get(m.team_a_key)
          const rB = teamKeyToFinalRank.get(m.team_b_key)
          // If both finished ≥5 it's a placement game (5th, 7th, etc), not
          // championship bracket — regardless of how Yahoo flagged it.
          if (rA != null && rB != null && rA >= 5 && rB >= 5) {
            isPlayoff = false
            seasonPlacementFiltered++
          }
        }

        // Championship = the actual title game (rank 1 vs rank 2) in the final
        // playoff week. The 3rd-place game also happens that week and is
        // playoff=true but NOT championship.
        let isChampionship = false
        if (isPlayoff && week === championshipWeek) {
          const rA = teamKeyToFinalRank.get(m.team_a_key)
          const rB = teamKeyToFinalRank.get(m.team_b_key)
          if (rA != null && rB != null) {
            const lo = Math.min(rA, rB), hi = Math.max(rA, rB)
            isChampionship = lo === 1 && hi === 2
          } else if (!treatRankAsFinal) {
            // Season still in progress — preserve the old "final-week non-
            // consolation game" heuristic so pickems still has something to
            // call the championship before final ranks land.
            isChampionship = true
          }
        }

        // Deterministic a/b ordering — smaller manager UUID is always a — so
        // the upsert key is stable across re-syncs.
        let mA = aMgr, mB = bMgr
        let sA = isPlayed ? m.team_a_points : null
        let sB = isPlayed ? m.team_b_points : null
        if (mA > mB) { [mA, mB] = [mB, mA]; [sA, sB] = [sB, sA] }

        await db.from('matchups').upsert(
          {
            season_id: seasonId,
            week,
            manager_a_id: mA,
            manager_b_id: mB,
            score_a: sA,
            score_b: sB,
            is_playoff: isPlayoff,
            is_championship: isChampionship,
          },
          { onConflict: 'season_id,week,manager_a_id,manager_b_id' }
        )
        matchupsIngested++
        seasonInserted++
      }
    }
    const ranksKnown = [...teamKeyToFinalRank.values()].filter((r) => r > 0).length
    warnings.push(
      `Season ${year} matchups: ${seasonInserted} inserted ` +
      `(bye/single-side=${seasonByeOrSingleSide}, unresolved manager=${seasonUnresolvedManager}, same manager=${seasonSameManager}, ` +
      `consolation-excluded=${seasonConsolationFiltered}, 5th+placement-excluded=${seasonPlacementFiltered}) ` +
      `· playoffStart=week ${playoffStart}, endWeek=${lg.end_week} ` +
      `· treatRankAsFinal=${treatRankAsFinal} (currentWeek=${lg.current_week ?? 'unset'}, ranksKnown=${ranksKnown}/${teams.length})`
    )
    } // end stages.matchups

    // Weekly lineups — fan out per (team, played-week). Yahoo's current_week
    // (when set) is the canonical "most recent week with scoring data." Falls
    // back to end_week for completed historical seasons. Skip if no week has
    // been played yet (preseason).
    const lastPlayedWeek = lg.current_week != null
      ? Math.max(0, Number(lg.current_week) - (treatRankAsFinal ? 0 : 1))
      : lg.end_week
    if (stages.lineups && lastPlayedWeek > 0 && teamKeyToManagerId.size > 0) {
      const teamWeekPairs: Array<{ teamKey: string; week: number; managerId: string }> = []
      for (const [teamKey, managerId] of teamKeyToManagerId.entries()) {
        for (let w = 1; w <= lastPlayedWeek; w++) {
          teamWeekPairs.push({ teamKey, week: w, managerId })
        }
      }
      // Collect across all (team, week) fetches then bulk-upsert at the end
      // so the season doesn't pay N round-trips to Supabase.
      const seasonLineupRows: Array<Record<string, unknown>> = []
      let lineupPairsEmpty = 0
      await parallelLimit(teamWeekPairs, 3, async ({ teamKey, week, managerId }) => {
        let roster
        try {
          roster = await getTeamRosterWeek(accessToken, teamKey, week, warnings)
        } catch (err) {
          warnings.push(`Season ${year} ${teamKey} w${week} roster: ${(err as Error).message}`)
          return
        }
        if (roster.length === 0) { lineupPairsEmpty++; return }
        for (const p of roster) {
          seasonLineupRows.push({
            season_id: seasonId,
            week,
            manager_id: managerId,
            player_external_id: p.player_key,
            player_name: p.full_name,
            position: p.position ?? null,
            nfl_team: p.nfl_team ?? null,
            slot: p.slot,
            is_starter: yahooIsStarterSlot(p.slot),
            points: p.points,
            proj_points: p.proj_points,
          })
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
            warnings.push(`Season ${year} weekly_lineups chunk ${i}-${i + slice.length}: ${error.message}`)
          } else {
            lineupUpserted += slice.length
          }
        }
      }
      warnings.push(
        `Season ${year} weekly_lineups: ${lineupUpserted} rows upserted across ${teamWeekPairs.length - lineupPairsEmpty}/${teamWeekPairs.length} (team, week) pairs` +
        (lineupErrors > 0 ? `, ${lineupErrors} chunk errors` : '')
      )
    }

    // Drafts
    if (stages.drafts) {
    const picks = await getLeagueDraft(accessToken, lg.league_key)
    if (picks.length > 0) {
      // Yahoo doesn't tell us snake vs auction directly in draftresults — infer
      // from presence of `cost` on picks.
      const isAuction = picks.some((p) => p.cost != null && p.cost > 0)
      const draftType: 'snake' | 'auction' | 'unknown' = isAuction ? 'auction' : 'snake'
      const roundsSeen = picks.reduce((max, p) => Math.max(max, p.round), 0)

      const { data: draftRow } = await db
        .from('drafts')
        .upsert(
          {
            season_id: seasonId,
            external_id: `${lg.league_key}.draft`,
            draft_type: draftType,
            rounds: roundsSeen || null,
          },
          { onConflict: 'season_id,external_id' }
        )
        .select('id')
        .single()

      if (draftRow) {
        // Player metadata is a separate call. Batch all picks' player_keys.
        const playerKeys = picks.map((p) => p.player_key).filter(Boolean)
        const playerInfo = await getPlayersBatch(accessToken, lg.league_key, playerKeys)

        for (const p of picks) {
          const mgrId = teamKeyToManagerId.get(p.team_key) ?? null
          const info = playerInfo.get(p.player_key)
          await db.from('draft_picks').upsert(
            {
              draft_id: draftRow.id,
              round: p.round,
              pick: p.pick,
              manager_id: mgrId,
              player_name: info?.full_name ?? null,
              position: info?.position ?? null,
              nfl_team: info?.editorial_team_abbr ?? null,
              player_external_id: p.player_key,
            },
            { onConflict: 'draft_id,pick' }
          )
        }
        draftsIngested++
      }
    }
    } // end stages.drafts

    // ─── trades ──────────────────────────────────────────────────────────
    // Yahoo's transactions endpoint returns the per-league ledger. We pull
    // only successful trades; the parser collapses each into a per-team
    // asset list via destination_team_key.
    if (stages.trades) {
    // Per-(year, week) rank cache. Yahoo doesn't surface the league-week
    // for trades so we derive it from executed_at — rough but accurate to
    // a few days. NFL regular-season weeks start around Labor Day; week 1
    // is roughly the first 7 days after Sept 1.
    const ranksByWeek = new Map<number, Awaited<ReturnType<typeof computePositionRanks>>>()
    async function ranksForWeek(week: number) {
      let r = ranksByWeek.get(week)
      if (r) return r
      try {
        r = await computePositionRanks({ season: year, throughWeek: week, scoring: DEFAULT_PPR_SCORING })
      } catch (e) {
        warnings.push(`Season ${year} W${week} ranks: ${e instanceof Error ? e.message : String(e)}`)
        r = new Map()
      }
      ranksByWeek.set(week, r)
      return r
    }
    function deriveWeek(executedAtIso: string | null): number | null {
      if (!executedAtIso) return null
      const ts = Date.parse(executedAtIso)
      if (!Number.isFinite(ts)) return null
      const seasonStart = Date.parse(`${year}-09-01T00:00:00Z`)
      const daysSince = (ts - seasonStart) / 86400000
      if (daysSince < 0) return null
      return Math.min(17, Math.max(1, Math.floor(daysSince / 7) + 1))
    }

    // rank_now is owned by the verdict revisit pass (tradeGrader.ts),
    // not ingest. Old trades show one rank (rank_at_trade); the verdict
    // adds the second rank when it runs.

    let yahooTxs: Awaited<ReturnType<typeof getLeagueTransactions>> = []
    try {
      yahooTxs = await getLeagueTransactions(accessToken, lg.league_key)
    } catch (err) {
      warnings.push(`Season ${year} transactions: ${(err as Error).message} — skipping trade ingest for this year`)
    }
    for (const t of yahooTxs) {
      // Both sides must resolve to managers we know about.
      const traderMgr = teamKeyToManagerId.get(t.trader_team_key) ?? null
      const tradeeMgr = teamKeyToManagerId.get(t.tradee_team_key) ?? null
      if (!traderMgr || !tradeeMgr) {
        warnings.push(`Season ${year} trade ${t.transaction_id}: unmapped team(s); side skipped`)
        continue
      }

      // Convert Yahoo's team-key-keyed asset map into the asset shape the
      // trades schema expects (kind: 'player' | 'pick' | 'faab'). Picks
      // need original_owner_manager_id, so resolve original_owner_team_key
      // → manager_id at write time.
      const assetsByTeamKey = new Map<string, Array<Record<string, unknown>>>()
      for (const [teamKey, assets] of t.assetsByTeam) {
        const out: Array<Record<string, unknown>> = []
        for (const a of assets) {
          if (a.kind === 'player') {
            out.push({
              kind: 'player',
              player_id: a.player_key,
              name: a.full_name,
              position: a.position,
              team: a.nfl_team,
            })
          } else if (a.kind === 'pick') {
            out.push({
              kind: 'pick',
              season_year: a.season_year,
              round: a.round,
              original_owner_manager_id: a.original_owner_team_key
                ? teamKeyToManagerId.get(a.original_owner_team_key) ?? null
                : null,
            })
          } else if (a.kind === 'faab') {
            out.push({ kind: 'faab', amount: a.amount })
          }
        }
        assetsByTeamKey.set(teamKey, out)
      }

      const executedAt = t.ts ? new Date(t.ts * 1000).toISOString() : new Date().toISOString()

      const { data: tradeRow, error: tradeErr } = await db
        .from('trades')
        .upsert(
          {
            league_id: archiveLeagueId,
            season_id: seasonId,
            platform: 'yahoo',
            external_id: t.transaction_key || t.transaction_id,
            week: null,        // Yahoo doesn't surface the league-week on trades
            executed_at: executedAt,
            status: 'completed',
            raw_payload: t.raw,
          },
          { onConflict: 'league_id,platform,external_id' }
        )
        .select('id')
        .single()
      if (tradeErr || !tradeRow) {
        warnings.push(`Season ${year} trade ${t.transaction_id}: upsert failed: ${tradeErr?.message ?? 'no row'}`)
        continue
      }

      await db.from('trade_sides').delete().eq('trade_id', tradeRow.id)
      // Yahoo's `ts` is epoch seconds; deriveWeek wants an ISO string.
      const executedIso = t.ts ? new Date(t.ts * 1000).toISOString() : null
      const week = deriveWeek(executedIso)
      const ranks = week ? await ranksForWeek(week) : null

      let sidesInserted = 0
      for (const [teamKey, assets] of assetsByTeamKey) {
        const managerId = teamKeyToManagerId.get(teamKey)
        if (!managerId) continue
        const stampedAssets = ranks
          ? await stampRanks(assets, { ranks, platform: 'yahoo' })
          : assets
        const { error: sideErr } = await db.from('trade_sides').insert({
          trade_id: tradeRow.id,
          manager_id: managerId,
          assets: stampedAssets,
        })
        if (sideErr) {
          warnings.push(`Season ${year} trade ${t.transaction_id} side ${teamKey}: ${sideErr.message}`)
          continue
        }
        sidesInserted++
      }
      if (sidesInserted >= 2) tradesIngested++
    }
    } // end stages.trades
  }

  return {
    ok: true,
    seasonsIngested: history.length,
    managersIngested: managerByGuid.size,
    matchupsIngested,
    draftsIngested,
    tradesIngested,
    warnings,
  }
}
