// NFL Fantasy ingestion: walks a configured season range, scrapes the
// public history pages, and upserts every row. Idempotent.
//
// Expected league.settings shape (set on /dashboard/new):
//   {
//     "playoff_week_start": 14 | 15 | 16,
//     "playoff_team_count": 4 | 6 | 8,
//     "season_start": 2019,
//     "season_end":   2025
//   }

import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchOwners, fetchWeekSchedule, fetchStandings, fetchDraft,
  fetchTrades, fetchTeamWeekRoster, nflIsStarterSlot,
  parallelLimit,
  type NflOwner, type NflMatchup, type NflStandingsRow,
} from '@/lib/platforms/nfl'
import { resolveStages, type IngestStages } from './stages'
import { computePositionRanks, stampRanks } from '@/lib/positionRanks'
import { DEFAULT_PPR_SCORING } from '@/lib/scoring'

export type IngestResult = {
  ok: boolean
  seasonsIngested: number
  managersIngested: number
  matchupsIngested: number
  draftsIngested: number
  tradesIngested: number
  warnings: string[]
}

type LeagueSettings = {
  playoff_week_start?: number
  playoff_team_count?: number
  season_start?: number
  season_end?: number
}

// Top-level: walk every NFL source attached to this archive, ingesting each
// with its own season range and playoff config.
export async function ingestNflLeague(
  leagueRowId: string,
  stages?: IngestStages,
): Promise<IngestResult> {
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
    .eq('platform', 'nfl')

  const sourceList =
    sources && sources.length > 0
      ? sources.map((s) => ({
          id: s.id as string | null,
          external_id: s.external_id as string,
          settings: (s.settings ?? {}) as LeagueSettings,
        }))
      : [{
          // Pre-multi-source row: fall back to leagues.external_id + leagues.settings.
          id: null,
          external_id: leagueRow.external_id,
          settings: (leagueRow.settings ?? {}) as LeagueSettings,
        }]

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
    const result = await ingestNflSource(leagueRowId, src.external_id, src.settings, stages)
    aggregate.seasonsIngested += result.seasonsIngested
    aggregate.matchupsIngested += result.matchupsIngested
    aggregate.draftsIngested += result.draftsIngested
    aggregate.tradesIngested += result.tradesIngested
    aggregate.warnings.push(...result.warnings)
    // managersIngested is the count of managers seen by THIS source; the
    // archive-wide tally would over-count if we summed across sources, so
    // we take the max (each source individually upserts into the same set).
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

// Single-source ingest: one external_id, one settings bundle (range + playoff).
export async function ingestNflSource(
  leagueRowId: string,
  externalId: string,
  settingsOverride: LeagueSettings = {},
  stagesIn?: IngestStages,
): Promise<IngestResult> {
  const stages = resolveStages(stagesIn)
  const db = createAdminClient()
  const { data: leagueRow, error: leagueErr } = await db
    .from('leagues')
    .select('id, external_id, settings')
    .eq('id', leagueRowId)
    .maybeSingle()
  if (leagueErr || !leagueRow) throw new Error('League not found')

  // Per-source settings (if provided) override league-level settings field by field.
  // Lets users split an NFL league at the 2021 playoff-format boundary into two sources.
  const leagueSettings: LeagueSettings = (leagueRow.settings ?? {}) as LeagueSettings
  const settings: LeagueSettings = { ...leagueSettings, ...settingsOverride }
  const playoffStart = settings.playoff_week_start ?? 15
  const playoffTeams = settings.playoff_team_count ?? 6
  const startYear = settings.season_start
  const endYear = settings.season_end
  if (!startYear || !endYear || startYear > endYear) {
    throw new Error('League settings missing season_start/season_end range')
  }

  const result: IngestResult = {
    ok: true,
    seasonsIngested: 0,
    managersIngested: 0,
    matchupsIngested: 0,
    draftsIngested: 0,
    tradesIngested: 0,
    warnings: [],
  }

  // Manager identity is stable across seasons; build the union of all
  // (user_id → owner_name) pairs we see across the range, then upsert once.
  const ownerByUserId = new Map<string, NflOwner>()
  const ownersByYear = new Map<number, NflOwner[]>()
  for (let y = startYear; y <= endYear; y++) {
    try {
      const owners = await fetchOwners(externalId, y)
      ownersByYear.set(y, owners)
      for (const o of owners) {
        // Keep the most recent appearance (latest team_name); the loop direction is ascending,
        // so by the end we'll have the latest year's display data.
        ownerByUserId.set(o.user_id, o)
      }
    } catch (err) {
      result.warnings.push(`Season ${y}: owners fetch failed (${(err as Error).message})`)
    }
  }

  // Upsert managers
  for (const owner of ownerByUserId.values()) {
    await db.from('managers').upsert(
      {
        league_id: leagueRow.id,
        external_id: owner.user_id,
        display_name: owner.owner_name,
        team_name: owner.team_name,
        avatar_url: owner.team_image_url,
      },
      { onConflict: 'league_id,external_id' }
    )
  }

  // Lookup: NFL user_id → our manager UUID
  const { data: managerRows } = await db
    .from('managers')
    .select('id, external_id')
    .eq('league_id', leagueRow.id)
  const managerIdByUserId = new Map<string, string>()
  for (const m of managerRows ?? []) {
    if (m.external_id) managerIdByUserId.set(m.external_id, m.id)
  }
  result.managersIngested = managerIdByUserId.size

  // Walk each season
  for (let year = startYear; year <= endYear; year++) {
    try {
      await ingestSeason({
        db,
        leagueId: leagueRow.id,
        externalLeagueId: externalId,
        year,
        playoffStart,
        playoffTeams,
        ownersThisYear: ownersByYear.get(year) ?? [],
        managerIdByUserId,
        result,
        stages,
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
  leagueId: string
  externalLeagueId: string
  year: number
  playoffStart: number
  playoffTeams: number
  ownersThisYear: NflOwner[]
  managerIdByUserId: Map<string, string>
  result: IngestResult
  stages: Required<IngestStages>
}): Promise<void> {
  const { db, leagueId, externalLeagueId, year, playoffStart, playoffTeams, ownersThisYear, managerIdByUserId, result, stages } = args

  // team_id → user_id for this season (NFL recycles team_ids across years
  // but the owner mapping can shift, so we recompute per season).
  const teamToUser = new Map<number, string>()
  const teamToName = new Map<number, string>()
  const teamToAvatar = new Map<number, string | null>()
  for (const o of ownersThisYear) {
    teamToUser.set(o.team_id, o.user_id)
    teamToName.set(o.team_id, o.team_name)
    teamToAvatar.set(o.team_id, o.team_image_url)
  }
  const teamToManagerId = (tid: number): string | null => {
    const uid = teamToUser.get(tid)
    return uid ? managerIdByUserId.get(uid) ?? null : null
  }

  // Last playoff week:  4-team → +1 (2 rounds);  6/8-team → +2 (3 rounds).
  const playoffRounds = playoffTeams === 4 ? 2 : 3
  const lastPlayoffWeek = playoffStart + playoffRounds - 1

  // Insert/upsert the season row first.
  const { data: seasonRow, error: seasonErr } = await db
    .from('seasons')
    .upsert(
      {
        league_id: leagueId,
        year,
        external_id: String(year),
        playoff_weeks: Array.from({ length: playoffRounds }, (_, i) => playoffStart + i),
        settings: { playoff_week_start: playoffStart, playoff_team_count: playoffTeams },
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
  if (stages.matchups) await db.from('manager_seasons').delete().eq('season_id', seasonId)
  // Drafts cascade to draft_picks via FK; delete drafts for the season too.
  // Preserve curated drafts (hand-authored imports, external_id 'curated-*')
  // — same guard sleeper/espn ingests carry.
  if (stages.drafts) await db.from('drafts').delete().eq('season_id', seasonId).not('external_id', 'like', 'curated-%')
  if (stages.lineups) await db.from('weekly_lineups').delete().eq('season_id', seasonId)

  // Fetch all weekly matchups (1..lastPlayoffWeek). NFL serves a page per
  // week; parallel-fetch with a small concurrency cap to be polite. Skip
  // entirely when the matchups stage isn't requested (e.g. trades-only sync).
  const weeks = Array.from({ length: lastPlayoffWeek }, (_, i) => i + 1)
  const weekly = stages.matchups
    ? await parallelLimit(weeks, 4, async (w) => {
        try {
          const rows = await fetchWeekSchedule(externalLeagueId, year, w)
          return { week: w, rows }
        } catch (err) {
          result.warnings.push(`Season ${year} week ${w}: ${(err as Error).message}`)
          return { week: w, rows: [] as NflMatchup[] }
        }
      })
    : ([] as Array<{ week: number; rows: NflMatchup[] }>)

  // Fetch standings (final rankings + champion/runner-up). Only needed
  // when we're upserting matchups + manager_seasons; trades-only sync skips.
  let standings: NflStandingsRow[] = []
  if (stages.matchups) {
    try {
      standings = await fetchStandings(externalLeagueId, year)
      if (standings.length === 0) {
        result.warnings.push(`Season ${year} standings: parser returned 0 rows — playoff records and final finishes will be blank for this year. Likely a markup change on NFL.com's standings page.`)
      }
    } catch (err) {
      result.warnings.push(`Season ${year} standings: ${(err as Error).message}`)
    }
  }
  const finalRankByTeam = new Map<number, number>()
  for (const s of standings) finalRankByTeam.set(s.team_id, s.final_rank)

  // Champion / runner-up team ids → manager ids.
  const champTeam = standings.find((s) => s.final_rank === 1)?.team_id ?? null
  const runnerUpTeam = standings.find((s) => s.final_rank === 2)?.team_id ?? null
  const champManager = champTeam != null ? teamToManagerId(champTeam) : null
  const runnerUpManager = runnerUpTeam != null ? teamToManagerId(runnerUpTeam) : null

  // Per-team regular-season aggregates from the matchups.
  type Agg = { wins: number; losses: number; ties: number; pf: number; pa: number }
  const agg = new Map<number, Agg>()
  const ensure = (tid: number): Agg => {
    let a = agg.get(tid)
    if (!a) { a = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }; agg.set(tid, a) }
    return a
  }
  let matchupsCount = 0
  for (const { week, rows } of weekly) {
    if (!rows.length) continue
    const isPlayoff = week >= playoffStart
    for (const m of rows) {
      matchupsCount++
      const aMgr = teamToManagerId(m.a_team_id)
      const bMgr = teamToManagerId(m.b_team_id)
      if (!aMgr || !bMgr) continue

      // Regular-season aggregates only — playoff record is computed in the
      // exporter. Skip unplayed games (null scores) so an in-progress season's
      // records reflect only games that have actually happened.
      if (!isPlayoff && m.a_score != null && m.b_score != null) {
        const ax = ensure(m.a_team_id); const bx = ensure(m.b_team_id)
        ax.pf += m.a_score; ax.pa += m.b_score
        bx.pf += m.b_score; bx.pa += m.a_score
        if (m.a_score > m.b_score) { ax.wins++; bx.losses++ }
        else if (m.a_score < m.b_score) { ax.losses++; bx.wins++ }
        else { ax.ties++; bx.ties++ }
      }

      // Championship final: last playoff week, matchup between champion + runner-up.
      const isChampGame =
        isPlayoff &&
        week === lastPlayoffWeek &&
        champTeam != null && runnerUpTeam != null &&
        ((m.a_team_id === champTeam && m.b_team_id === runnerUpTeam) ||
         (m.a_team_id === runnerUpTeam && m.b_team_id === champTeam))

      // Deterministic a/b ordering — smaller manager UUID is always a — so the
      // upsert key is stable across re-syncs and matchup ids persist.
      let mA = aMgr, mB = bMgr, sA = m.a_score, sB = m.b_score
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
          is_championship: isChampGame,
        },
        { onConflict: 'season_id,week,manager_a_id,manager_b_id' }
      )
    }
  }

  // Regular-season rank: by wins desc, then PF desc.
  const ranked = [...agg.entries()].sort(([, a], [, b]) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    return b.pf - a.pf
  })
  const regRank = new Map<number, number>()
  ranked.forEach(([tid], idx) => regRank.set(tid, idx + 1))

  // Upsert manager_seasons rows. Gated alongside matchups since the wins/PF
  // aggregates come from the matchup loop.
  if (stages.matchups) {
  for (const owner of ownersThisYear) {
    const managerId = teamToManagerId(owner.team_id)
    if (!managerId) continue
    const a = agg.get(owner.team_id) ?? { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }
    await db.from('manager_seasons').upsert(
      {
        season_id: seasonId,
        manager_id: managerId,
        team_name: owner.team_name,
        avatar_url: owner.team_image_url,
        wins: a.wins,
        losses: a.losses,
        ties: a.ties,
        points_for: round2(a.pf),
        points_against: round2(a.pa),
        final_rank: finalRankByTeam.get(owner.team_id) ?? null,
        regular_rank: regRank.get(owner.team_id) ?? null,
      },
      { onConflict: 'season_id,manager_id' }
    )
  }

  // Regular-season winner = top of regRank.
  const regularSeasonWinner = ranked[0] ? teamToManagerId(ranked[0][0]) : null
  await db
    .from('seasons')
    .update({
      champion_manager_id: champManager,
      runner_up_manager_id: runnerUpManager,
      regular_season_winner_id: regularSeasonWinner,
    })
    .eq('id', seasonId)

  result.matchupsIngested += matchupsCount
  } // end stages.matchups

  // Weekly lineups — scrape each (team, played-week) gamecenter page and
  // map players to weekly_lineups rows. We pass `&week=N` in the URL, which
  // (unlike `statWeek=N`) scopes the roster snapshot to that specific week,
  // so bench/starter assignments and points are real per-week values.
  // Only fetch weeks that actually had played games — unplayed/future weeks
  // would just be the current roster echoed back.
  if (stages.lineups) {
    const playedWeeks = weekly
      .filter(({ rows }) => rows.some((m) => m.a_score != null && m.b_score != null))
      .map(({ week }) => week)
    const teamWeekPairs: Array<{ teamId: number; managerId: string; week: number }> = []
    for (const week of playedWeeks) {
      for (const owner of ownersThisYear) {
        const managerId = teamToManagerId(owner.team_id)
        if (!managerId) continue
        teamWeekPairs.push({ teamId: owner.team_id, managerId, week })
      }
    }
    const seasonLineupRows: Array<Record<string, unknown>> = []
    let pairsEmpty = 0
    if (teamWeekPairs.length > 0) {
      const rosters = await parallelLimit(teamWeekPairs, 4, async (p) => {
        try {
          const players = await fetchTeamWeekRoster(externalLeagueId, year, p.teamId, p.week)
          return { ...p, players }
        } catch (err) {
          result.warnings.push(`Season ${year} W${p.week} team ${p.teamId} lineup: ${(err as Error).message}`)
          return { ...p, players: [] }
        }
      })
      for (const r of rosters) {
        if (r.players.length === 0) { pairsEmpty++; continue }
        for (const pl of r.players) {
          seasonLineupRows.push({
            season_id: seasonId,
            week: r.week,
            manager_id: r.managerId,
            player_external_id: pl.player_external_id,
            player_name: pl.full_name,
            position: pl.position,
            nfl_team: pl.nfl_team,
            slot: pl.slot,
            is_starter: nflIsStarterSlot(pl.slot),
            points: pl.points,
          })
        }
      }
    }
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
      `Season ${year} weekly_lineups: ${lineupUpserted} rows upserted across ${teamWeekPairs.length - pairsEmpty}/${teamWeekPairs.length} (team, week) pairs` +
      (lineupErrors ? ` (${lineupErrors} chunk errors)` : '') +
      `. Powers Best Coach Tracker.`
    )
  }

  // Draft picks (optional — failures non-fatal).
  if (stages.drafts) {
  try {
    const picks = await fetchDraft(externalLeagueId, year)
    if (picks.length === 0) {
      result.warnings.push(`Season ${year} draft: parser returned 0 picks. NFL.com may not have draft data for this year, or markup changed.`)
    }
    if (picks.length > 0) {
      const { data: draftRow } = await db
        .from('drafts')
        .upsert(
          {
            season_id: seasonId,
            external_id: String(year),
            draft_type: 'snake', // NFL Fantasy default; we don't currently parse auctions.
            rounds: picks.length > 0 ? picks[picks.length - 1].round : null,
          },
          { onConflict: 'season_id,external_id' }
        )
        .select('id')
        .single()
      if (draftRow) {
        for (const p of picks) {
          const mgrId = teamToManagerId(p.team_id)
          await db.from('draft_picks').upsert(
            {
              draft_id: draftRow.id,
              round: p.round,
              pick: p.overall_pick,
              manager_id: mgrId,
              player_name: p.player_name,
              position: p.player_position,
              nfl_team: p.player_nfl_team,
              player_external_id: null,
            },
            { onConflict: 'draft_id,pick' }
          )
        }
        result.draftsIngested++
      }
    }
  } catch (err) {
    result.warnings.push(`Season ${year} draft: ${(err as Error).message}`)
  }
  } // end stages.drafts

  // ─── trades ──────────────────────────────────────────────────────────────
  // NFL.com renders trades on the transactions history page. The scraper is
  // best-effort; if the markup shifted, we get [] and warn.
  if (stages.trades) {
  // Per-(season, week) rank cache so trades in the same week reuse one
  // fetch. NFL.com doesn't surface a Sleeper-style scoring_settings map,
  // so we fall back to the default PPR profile — a follow-up could pull
  // the league's actual scoring rules from the NFL.com league page.
  const ranksByWeek = new Map<number, Awaited<ReturnType<typeof computePositionRanks>>>()
  async function ranksForWeek(week: number) {
    let r = ranksByWeek.get(week)
    if (r) return r
    try {
      r = await computePositionRanks({ season: year, throughWeek: week, scoring: DEFAULT_PPR_SCORING })
    } catch (e) {
      result.warnings.push(`Season ${year} W${week} ranks: ${e instanceof Error ? e.message : String(e)}`)
      r = new Map()
    }
    ranksByWeek.set(week, r)
    return r
  }

  try {
    const trades = await fetchTrades(externalLeagueId, year)
    if (trades.length === 0) {
      result.warnings.push(`Season ${year} trades: scraper returned 0 trades. Either the league had no trades, or NFL.com markup has shifted for this season.`)
    }
    for (const t of trades) {
      // Group player assets by receiver team.
      const assetsByTeam = new Map<number, Array<Record<string, unknown>>>()
      for (const tid of t.team_ids) assetsByTeam.set(tid, [])
      for (const p of t.players) {
        const arr = assetsByTeam.get(p.to_team_id) ?? []
        arr.push({
          kind: 'player',
          player_id: p.player_external_id,
          name: p.full_name,
          position: p.position,
          team: p.nfl_team,
        })
        assetsByTeam.set(p.to_team_id, arr)
      }
      // Need ≥2 sides AND both teams resolve to managers we know.
      const sidesWithMgrs: Array<{ teamId: number; managerId: string; assets: Array<Record<string, unknown>> }> = []
      for (const [tid, assets] of assetsByTeam) {
        const mgrId = teamToManagerId(tid)
        if (!mgrId) {
          result.warnings.push(`Season ${year} trade ${t.trade_id}: team ${tid} has no manager mapping; side skipped`)
          continue
        }
        sidesWithMgrs.push({ teamId: tid, managerId: mgrId, assets })
      }
      if (sidesWithMgrs.length < 2) continue

      const { data: tradeRow, error: tradeErr } = await db
        .from('trades')
        .upsert(
          {
            league_id: leagueId,
            season_id: seasonId,
            platform: 'nfl',
            external_id: t.trade_id,
            week: t.week,
            executed_at: t.executed_at,
            status: 'completed',
            raw_payload: { team_ids: t.team_ids, players: t.players },
          },
          { onConflict: 'league_id,platform,external_id' }
        )
        .select('id')
        .single()
      if (tradeErr || !tradeRow) {
        result.warnings.push(`Season ${year} trade ${t.trade_id}: upsert failed: ${tradeErr?.message ?? 'no row'}`)
        continue
      }
      await db.from('trade_sides').delete().eq('trade_id', tradeRow.id)

      // Stamp season-to-date position rank on each player asset.
      const ranks = t.week ? await ranksForWeek(t.week) : null

      let sidesInserted = 0
      for (const side of sidesWithMgrs) {
        const stampedAssets = ranks
          ? await stampRanks(side.assets, { ranks, platform: 'nfl' })
          : side.assets
        const { error: sideErr } = await db.from('trade_sides').insert({
          trade_id: tradeRow.id,
          manager_id: side.managerId,
          assets: stampedAssets,
        })
        if (sideErr) {
          result.warnings.push(`Season ${year} trade ${t.trade_id} side team ${side.teamId}: ${sideErr.message}`)
          continue
        }
        sidesInserted++
      }
      if (sidesInserted >= 2) result.tradesIngested++
    }
  } catch (err) {
    result.warnings.push(`Season ${year} trades: ${(err as Error).message}`)
  }
  } // end stages.trades
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
