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
  type YahooTeam,
  type YahooLeagueMeta,
} from '@/lib/platforms/yahoo'

export type IngestResult = {
  ok: boolean
  seasonsIngested: number
  managersIngested: number
  matchupsIngested: number
  draftsIngested: number
  warnings: string[]
}

export async function ingestYahooLeague(leagueRowId: string): Promise<IngestResult> {
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
    .select('id, external_id, walk_history')
    .eq('league_id', leagueRow.id)
    .eq('platform', 'yahoo')

  const sourceList =
    sources && sources.length > 0
      ? sources
      : [{ id: null, external_id: leagueRow.external_id, walk_history: true }]

  const aggregate: IngestResult = {
    ok: true,
    seasonsIngested: 0,
    managersIngested: 0,
    matchupsIngested: 0,
    draftsIngested: 0,
    warnings: [],
  }

  for (const src of sourceList) {
    const result = await ingestYahooSource(
      leagueRowId,
      src.external_id,
      src.walk_history,
      accessToken
    )
    aggregate.seasonsIngested += result.seasonsIngested
    aggregate.managersIngested += result.managersIngested
    aggregate.matchupsIngested += result.matchupsIngested
    aggregate.draftsIngested += result.draftsIngested
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
  accessToken: string
): Promise<IngestResult> {
  const db = createAdminClient()
  const warnings: string[] = []

  // Build the chronological list of seasons (oldest first).
  const history: YahooLeagueMeta[] = walkHistory
    ? await walkLeagueChain(accessToken, startLeagueKey)
    : await (async () => {
        const { getLeagueMeta } = await import('@/lib/platforms/yahoo')
        const one = await getLeagueMeta(accessToken, startLeagueKey)
        return one ? [one] : []
      })()
  if (history.length === 0) throw new Error('Yahoo returned no league data')

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
    await db.from('drafts').delete().eq('season_id', seasonId)

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
    // once the season ends. Heuristic: if any team has wins+losses+ties > 0
    // AND we're past the last playoff week (current_week > end_week OR
    // current_week is unset for past seasons), treat rank as final.
    const seasonHasGames = teams.some((t) => t.wins > 0 || t.losses > 0 || t.points_for > 0)
    const seasonOver = lg.current_week == null || lg.current_week > lg.end_week
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

    // Matchups — fetch every week up to end_week (Yahoo's full season span).
    // No parallel limit helper for Yahoo; we run sequentially to be polite
    // (Yahoo rate-limits unauthenticated bursts; per-user is more generous
    // but still better not to fan out).
    let seasonInserted = 0
    let seasonByeOrSingleSide = 0
    let seasonUnresolvedManager = 0
    let seasonSameManager = 0
    const championshipWeek = lg.end_week
    for (let week = 1; week <= lg.end_week; week++) {
      const scoreboard = await getLeagueScoreboard(accessToken, lg.league_key, week)
      for (const m of scoreboard) {
        if (!m.team_a_key || !m.team_b_key) { seasonByeOrSingleSide++; continue }
        const aMgr = teamKeyToManagerId.get(m.team_a_key)
        const bMgr = teamKeyToManagerId.get(m.team_b_key)
        if (!aMgr || !bMgr) { seasonUnresolvedManager++; continue }
        if (aMgr === bMgr) { seasonSameManager++; continue }

        const isPlayed = m.status === 'postevent' || m.status === 'midevent'
        const isPlayoff = m.is_playoffs
        // Championship = final playoff week, non-consolation playoff matchup.
        const isChampionship =
          isPlayoff && !m.is_consolation && week === championshipWeek

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
    warnings.push(
      `Season ${year} matchups: ${seasonInserted} inserted ` +
      `(bye/single-side=${seasonByeOrSingleSide}, unresolved manager=${seasonUnresolvedManager}, same manager=${seasonSameManager}) ` +
      `· playoffStart=week ${playoffStart}, endWeek=${lg.end_week}`
    )

    // Drafts
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
  }

  return {
    ok: true,
    seasonsIngested: history.length,
    managersIngested: managerByGuid.size,
    matchupsIngested,
    draftsIngested,
    warnings,
  }
}
