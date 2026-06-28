// Sleeper ingestion: walks the league history and upserts every row.
// Idempotent — re-running refreshes data without creating duplicates.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  sleeper,
  fetchLeagueHistory,
  avatarUrl,
  rosterPoints,
  deriveChampions,
  deriveBracketPlacements,
  parallelLimit,
  type SleeperUser,
  type SleeperMatchup,
  type SleeperPlayer,
  type SleeperTransaction,
} from '@/lib/platforms/sleeper'
import { resolveStages, type IngestStages } from './stages'
import { computePositionRanks, stampRanks } from '@/lib/positionRanks'

export type IngestResult = {
  ok: boolean
  seasonsIngested: number
  managersIngested: number
  matchupsIngested: number
  draftsIngested: number
  tradesIngested: number
  warnings: string[]
}

const PLAYOFF_DEFAULT_START = 15

// Ingest from every source attached to this archive.
export async function ingestSleeperLeague(
  leagueRowId: string,
  stages?: IngestStages,
): Promise<IngestResult> {
  const db = createAdminClient()
  const { data: leagueRow, error: leagueErr } = await db
    .from('leagues')
    .select('id, external_id, name')
    .eq('id', leagueRowId)
    .maybeSingle()
  if (leagueErr || !leagueRow) throw new Error('League not found')

  // Load all sources. If none exist (older row predating this feature), fall back
  // to the legacy single external_id on the leagues row.
  const { data: sources } = await db
    .from('league_sources')
    .select('id, external_id, walk_history, settings')
    .eq('league_id', leagueRow.id)
    .eq('platform', 'sleeper')

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
    const result = await ingestSleeperSource(leagueRowId, src.external_id, src.walk_history, { seasonStart, seasonEnd }, stages)
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

// Ingest from a single source Sleeper league_id.
// If walkHistory is true, follow previous_league_id back. Otherwise just ingest this one.
// `range` optionally restricts the years that get ingested — used when two
// sources cover overlapping seasons and the user wants to scope this one to a
// specific window (e.g. Sleeper handles 2021+, Yahoo handles ≤2020).
export async function ingestSleeperSource(
  archiveLeagueId: string,
  startLeagueId: string,
  walkHistory: boolean,
  range?: { seasonStart?: number; seasonEnd?: number },
  stagesIn?: IngestStages,
): Promise<IngestResult> {
  const db = createAdminClient()
  const warnings: string[] = []
  const stages = resolveStages(stagesIn)

  const fullHistory = walkHistory
    ? await fetchLeagueHistory(startLeagueId)
    : await (async () => {
        const one = await sleeper.league(startLeagueId)
        return one ? [one] : []
      })()
  if (fullHistory.length === 0) throw new Error('Sleeper returned no league data')

  // Filter to the requested year window if one was set on the source.
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
      `Sleeper: no seasons in range ${minYear ?? '*'}–${maxYear ?? '*'} (chain had ${fullHistory.length}).`
    )
    return { ok: true, seasonsIngested: 0, managersIngested: 0, matchupsIngested: 0, draftsIngested: 0, tradesIngested: 0, warnings }
  }

  // Use a local alias so the rest of the legacy code below references `leagueRow`.
  const leagueRow = { id: archiveLeagueId }

  // 3. Build/refresh manager roster: managers are stable across seasons by user_id.
  // We need *all* users across all seasons because rosters change over time.
  const userMap = new Map<string, SleeperUser>() // user_id -> latest user record
  for (const lg of history) {
    const users = await sleeper.users(lg.league_id)
    for (const u of users ?? []) userMap.set(u.user_id, u)
  }

  // Upsert managers
  for (const [, u] of userMap) {
    await db
      .from('managers')
      .upsert(
        {
          league_id: leagueRow.id,
          external_id: u.user_id,
          display_name: u.display_name,
          team_name: u.metadata?.team_name ?? u.display_name,
          avatar_url: avatarUrl(u),
        },
        { onConflict: 'league_id,external_id' }
      )
  }

  // Lookup table: sleeper user_id -> our manager UUID
  const { data: managerRows } = await db
    .from('managers')
    .select('id, external_id')
    .eq('league_id', leagueRow.id)
  const managerIdByUserId = new Map<string, string>()
  for (const m of managerRows ?? []) {
    if (m.external_id) managerIdByUserId.set(m.external_id, m.id)
  }

  let matchupsIngested = 0
  let draftsIngested = 0
  let tradesIngested = 0

  // Sleeper's full NFL player dictionary. ~5MB; fetched once per ingest run
  // and reused across every season's trade enrichment. Failure is non-fatal —
  // trades still ingest, just without resolved player names.
  let playersByPid: Map<string, SleeperPlayer> | null = null
  try {
    const players = await sleeper.playersNfl()
    if (players) {
      playersByPid = new Map()
      for (const [pid, p] of Object.entries(players)) {
        playersByPid.set(pid, p)
      }
    }
  } catch (e) {
    warnings.push(`Sleeper /players/nfl failed: ${e instanceof Error ? e.message : String(e)}. Trades will store player_id without names.`)
  }

  // 4. For each season in history, ingest the per-season data
  for (const lg of history) {
    const year = parseInt(lg.season, 10)
    if (Number.isNaN(year)) {
      warnings.push(`Season ${lg.league_id} had non-numeric year "${lg.season}", skipping`)
      continue
    }

    const playoffStart = lg.settings.playoff_week_start ?? PLAYOFF_DEFAULT_START
    const playoffWeeks: number[] = []
    for (let w = playoffStart; w <= playoffStart + 3; w++) playoffWeeks.push(w)

    // 4a. Upsert season row (champion/runner-up filled in later)
    const { data: seasonRow, error: seasonErr } = await db
      .from('seasons')
      .upsert(
        {
          league_id: leagueRow.id,
          year,
          external_id: lg.league_id,
          playoff_weeks: playoffWeeks,
          settings: { status: lg.status, total_rosters: lg.total_rosters },
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

    // Rebuild per-season aggregates. Matchups are NOT wiped — they're upserted
    // with a deterministic a/b key so re-syncs update rows in place, keeping
    // matchup ids stable (pickems_picks references them via a cascading FK).
    // Stage-gated: only wipe what we're about to re-ingest. A trades-only
    // sync leaves drafts/lineups/manager_seasons alone.
    // Drafts: skip rows whose external_id starts with 'curated-' so the
    // hand-authored 2019 Lubbs import (and any future curated imports)
    // survive re-syncs. The platform-side delete only targets drafts that
    // the ingest would have produced itself.
    await db.from('manager_seasons').delete().eq('season_id', seasonId)
    if (stages.drafts) await db.from('drafts').delete().eq('season_id', seasonId).not('external_id', 'like', 'curated-%')
    if (stages.lineups) await db.from('weekly_lineups').delete().eq('season_id', seasonId)

    // 4b. Fetch users + rosters for THIS season
    const [usersThis, rostersThis] = await Promise.all([
      sleeper.users(lg.league_id),
      sleeper.rosters(lg.league_id),
    ])
    if (!usersThis || usersThis.length === 0) {
      warnings.push(`Season ${year}: Sleeper returned no users for league ${lg.league_id}. Matchups will be skipped.`)
    }
    if (!rostersThis || rostersThis.length === 0) {
      warnings.push(`Season ${year}: Sleeper returned no rosters for league ${lg.league_id}. Without rosters we can't map matchups to managers — matchups will be skipped.`)
    }
    const rosterToUserId = new Map<number, string>()
    let rostersWithoutOwner = 0
    for (const r of rostersThis ?? []) {
      if (r.owner_id) {
        rosterToUserId.set(r.roster_id, r.owner_id)
      } else {
        rostersWithoutOwner++
      }
    }
    if (rostersWithoutOwner > 0) {
      warnings.push(`Season ${year}: ${rostersWithoutOwner} roster${rostersWithoutOwner === 1 ? '' : 's'} had no owner_id (unclaimed team). Their matchups will be skipped.`)
    }
    const userIdToManagerId = (uid: string | null) =>
      uid ? managerIdByUserId.get(uid) ?? null : null

    // 4c. Insert manager_seasons. We do this in two passes so a pre-draft
    // Sleeper league (rosters exist but are unclaimed) still produces a roster
    // for the live season — important for preseason power rankings.
    //
    // Pass 1: ensure every USER who's joined the league has a manager_seasons
    // row (defaults — wins/losses/PF all 0, no division yet).
    // Pass 2: the existing roster loop refines rows for claimed rosters with
    // real wins/losses/PF/division. The upsert key (season_id, manager_id)
    // makes pass 2 override pass 1's defaults.
    for (const u of usersThis ?? []) {
      const managerId = userIdToManagerId(u.user_id)
      if (!managerId) continue
      await db.from('manager_seasons').upsert(
        {
          season_id: seasonId,
          manager_id: managerId,
          team_name: u.metadata?.team_name ?? u.display_name ?? null,
          avatar_url: avatarUrl(u),
          wins: 0, losses: 0, ties: 0,
          points_for: 0, points_against: 0,
          regular_rank: null,
          division_index: null,
        },
        { onConflict: 'season_id,manager_id' },
      )
    }

    // Regular-season rank by wins, then points-for. Hoisted above the roster
    // loop so the post-bracket final_rank pass below can read it.
    // Skip ranking entirely for an in-progress season where no games have been
    // played yet — otherwise everyone tied at 0-0 / 0pts gets an arbitrary
    // 1..N order based on roster_id stability, which is misleading. Detected
    // by: zero total wins AND zero total points-for across all rosters.
    const regRank = new Map<number, number>()
    const seasonHasGames =
      !!rostersThis &&
      rostersThis.some(
        (r) => (r.settings.wins ?? 0) > 0 || rosterPoints(r, 'for') > 0
      )
    if (rostersThis && seasonHasGames) {
      const ranked = [...rostersThis].sort((a, b) => {
        const aW = a.settings.wins ?? 0
        const bW = b.settings.wins ?? 0
        if (bW !== aW) return bW - aW
        return rosterPoints(b, 'for') - rosterPoints(a, 'for')
      })
      ranked.forEach((r, idx) => regRank.set(r.roster_id, idx + 1))
    }
    if (rostersThis) {

      for (const r of rostersThis) {
        const userId = r.owner_id
        const managerId = userIdToManagerId(userId)
        if (!managerId) continue
        const u = usersThis?.find((x) => x.user_id === userId)
        await db.from('manager_seasons').upsert(
          {
            season_id: seasonId,
            manager_id: managerId,
            team_name: u?.metadata?.team_name ?? u?.display_name ?? null,
            avatar_url: u ? avatarUrl(u) : null,
            wins: r.settings.wins ?? 0,
            losses: r.settings.losses ?? 0,
            ties: r.settings.ties ?? 0,
            points_for: rosterPoints(r, 'for'),
            points_against: rosterPoints(r, 'against'),
            regular_rank: regRank.get(r.roster_id) ?? null,
            // Sleeper rosters store division as a 1-indexed number; we store 0-indexed (null if no divisions)
            division_index: r.settings.division != null ? Math.max(0, r.settings.division - 1) : null,
          },
          { onConflict: 'season_id,manager_id' }
        )
      }
    }

    // 4d. Determine champion / runner-up from winners_bracket, and back-fill
    // final_rank on manager_seasons. Bracket placements (p=1 → 1/2, p=3 → 3/4,
    // etc) take priority; teams not in the bracket fall back to their
    // regular-season rank so the "finish" column has a value for every roster.
    const bracket = await sleeper.winnersBracket(lg.league_id)
    const { championRosterId, runnerUpRosterId } = deriveChampions(bracket)
    const bracketPlacements = deriveBracketPlacements(bracket)
    if (rostersThis) {
      for (const r of rostersThis) {
        const managerId = userIdToManagerId(r.owner_id)
        if (!managerId) continue
        const placement = bracketPlacements.get(r.roster_id)
        const finalRank = placement ?? regRank.get(r.roster_id) ?? null
        if (finalRank == null) continue
        await db
          .from('manager_seasons')
          .update({ final_rank: finalRank })
          .eq('season_id', seasonId)
          .eq('manager_id', managerId)
      }
    }
    const champManager = championRosterId
      ? userIdToManagerId(rosterToUserId.get(championRosterId) ?? null)
      : null
    const runnerUpManager = runnerUpRosterId
      ? userIdToManagerId(rosterToUserId.get(runnerUpRosterId) ?? null)
      : null

    // Regular season winner = manager with most wins (top of regRank)
    let regularSeasonWinner: string | null = null
    if (rostersThis && rostersThis.length > 0) {
      const top = [...rostersThis].sort((a, b) => {
        const aW = a.settings.wins ?? 0
        const bW = b.settings.wins ?? 0
        if (bW !== aW) return bW - aW
        return rosterPoints(b, 'for') - rosterPoints(a, 'for')
      })[0]
      regularSeasonWinner = userIdToManagerId(rosterToUserId.get(top.roster_id) ?? null)
    }

    await db
      .from('seasons')
      .update({
        champion_manager_id: champManager,
        runner_up_manager_id: runnerUpManager,
        regular_season_winner_id: regularSeasonWinner,
      })
      .eq('id', seasonId)

    // 4e. Matchups — fetch all weeks in parallel (limit 5 concurrent).
    // Weeks are needed for both matchups + lineups; trades reuses the same
    // `weeks` array further down too. Skip the actual fetch only if none
    // of those three stages are requested.
    const maxWeek = playoffStart + 3
    const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1)
    const needWeeklyMatchups = stages.matchups || stages.lineups
    const weeklyMatchups: Array<{ week: number; rows: SleeperMatchup[] }> = needWeeklyMatchups
      ? await parallelLimit(weeks, 5, async (w) => {
          const m = await sleeper.matchups(lg.league_id, w)
          return { week: w, rows: m ?? [] }
        })
      : []

    // Per-season diagnostic counters so we can see exactly where matchups go.
    let seasonInserted = 0
    let seasonEmptyWeeks = 0
    let seasonByeOrSingleSide = 0
    let seasonUnresolvedManager = 0
    let seasonSameManager = 0
    let seasonFlatPairs = 0
    // Accumulator for per-season lineup rows — bulk-upserted once at the end
    // of the season loop instead of per-matchup-pair, cutting ~7×weeks DB
    // round-trips down to one chunked upsert per season.
    const seasonLineupRows: Array<Record<string, unknown>> = []

    for (const { week, rows } of weeklyMatchups) {
      if (rows.length === 0) {
        seasonEmptyWeeks++
        continue
      }
      // A week with no points anywhere is unplayed/future. We still write its
      // matchups (so pick'ems can show upcoming weeks) but with null scores.
      const weekPlayed = rows.some((r) => (r.points ?? 0) > 0)

      // Group by matchup_id to pair the two teams
      const byMatchup = new Map<number, SleeperMatchup[]>()
      for (const row of rows) {
        if (row.matchup_id == null) continue
        const arr = byMatchup.get(row.matchup_id) ?? []
        arr.push(row)
        byMatchup.set(row.matchup_id, arr)
      }

      for (const [, pair] of byMatchup) {
        if (pair.length !== 2) { seasonByeOrSingleSide++; continue } // bye week or weird state
        seasonFlatPairs++
        const [a, b] = pair
        const aMgr = userIdToManagerId(rosterToUserId.get(a.roster_id) ?? null)
        const bMgr = userIdToManagerId(rosterToUserId.get(b.roster_id) ?? null)
        if (!aMgr || !bMgr) { seasonUnresolvedManager++; continue }
        if (aMgr === bMgr) { seasonSameManager++; continue }

        const isPlayoff = week >= playoffStart
        const isChampionship =
          week === playoffStart + 3 &&
          championRosterId != null &&
          (a.roster_id === championRosterId || b.roster_id === championRosterId) &&
          runnerUpRosterId != null &&
          (a.roster_id === runnerUpRosterId || b.roster_id === runnerUpRosterId)

        const aScore = weekPlayed ? (a.points ?? null) : null
        const bScore = weekPlayed ? (b.points ?? null) : null

        // Deterministic a/b ordering — smaller manager UUID is always a — so
        // the upsert key is stable across re-syncs and matchup ids persist.
        let mA = aMgr, mB = bMgr, sA = aScore, sB = bScore
        if (mA > mB) { [mA, mB] = [mB, mA]; [sA, sB] = [sB, sA] }

        if (stages.matchups) {
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

        // Weekly lineups — one row per rostered player per side per week.
        // Powers the Best Coach Tracker (starter vs optimal lineup).
        // starters[] is positional to lg.roster_positions filtered to non-bench
        // slots; players[] is every rostered player. Sleeper uses "0" for an
        // empty starting slot — skip those rather than writing a phantom row.
        const startingSlots = (lg.roster_positions ?? []).filter(
          (s) => s !== 'BN' && s !== 'TAXI' && s !== 'IR'
        )
        const lineupRows = (
          [
            { side: a, managerId: aMgr },
            { side: b, managerId: bMgr },
          ] as const
        ).flatMap(({ side, managerId }) => {
          const starters = side.starters ?? []
          const starterPts = side.starters_points ?? []
          const allPlayers = side.players ?? []
          const playerPts = side.players_points ?? {}
          const starterSet = new Set(starters.filter((pid) => pid && pid !== '0'))
          const rows: Array<Record<string, unknown>> = []
          starters.forEach((pid, idx) => {
            if (!pid || pid === '0') return
            const meta = playersByPid?.get(pid)
            rows.push({
              season_id: seasonId,
              week,
              manager_id: managerId,
              player_external_id: pid,
              player_name: meta?.full_name ?? ([meta?.first_name, meta?.last_name].filter(Boolean).join(' ') || null),
              position: meta?.position ?? null,
              nfl_team: meta?.team ?? null,
              slot: startingSlots[idx] ?? 'FLEX',
              is_starter: true,
              points: weekPlayed ? (starterPts[idx] ?? playerPts[pid] ?? null) : null,
            })
          })
          for (const pid of allPlayers) {
            if (!pid || pid === '0' || starterSet.has(pid)) continue
            const meta = playersByPid?.get(pid)
            rows.push({
              season_id: seasonId,
              week,
              manager_id: managerId,
              player_external_id: pid,
              player_name: meta?.full_name ?? ([meta?.first_name, meta?.last_name].filter(Boolean).join(' ') || null),
              position: meta?.position ?? null,
              nfl_team: meta?.team ?? null,
              slot: 'BN',
              is_starter: false,
              points: weekPlayed ? (playerPts[pid] ?? null) : null,
            })
          }
          return rows
        })
        if (stages.lineups && lineupRows.length > 0) seasonLineupRows.push(...lineupRows)
      }
    }
    // Bulk-upsert all lineup rows for the season in 1000-row chunks (Supabase's
    // soft cap per request). One round-trip per ~1000 rows instead of one per
    // matchup pair. Powers the Best Coach Tracker.
    if (stages.lineups) {
      let lineupUpserted = 0
      let lineupErrors = 0
      if (seasonLineupRows.length > 0) {
        const CHUNK = 1000
        for (let i = 0; i < seasonLineupRows.length; i += CHUNK) {
          const slice = seasonLineupRows.slice(i, i + CHUNK)
          const { error: lineupErr } = await db.from('weekly_lineups').upsert(slice, {
            onConflict: 'season_id,week,manager_id,player_external_id',
          })
          if (lineupErr) {
            lineupErrors++
            warnings.push(`Season ${year} weekly_lineups chunk ${i}-${i + slice.length}: ${lineupErr.message}`)
          } else {
            lineupUpserted += slice.length
          }
        }
      }
      warnings.push(
        `Season ${year} weekly_lineups: ${lineupUpserted} rows upserted ` +
        `(${seasonLineupRows.length} built from matchups, ${lineupErrors} chunk errors). Powers Best Coach Tracker.`
      )
    }

    // Per-season matchup breakdown — mirrors the ESPN diagnostic format so
    // we can spot exactly where games are going when a sync looks short.
    if (stages.matchups) {
      warnings.push(
        `Season ${year} matchups breakdown: ${seasonFlatPairs} pairs from Sleeper → ${seasonInserted} inserted ` +
        `(empty weeks=${seasonEmptyWeeks}, bye/single-side=${seasonByeOrSingleSide}, ` +
        `unresolved manager=${seasonUnresolvedManager}, same manager=${seasonSameManager}) · playoffStart=week ${playoffStart}`
      )
    }

    // 4f. Drafts
    if (stages.drafts) {
    const draftsList = await sleeper.drafts(lg.league_id)
    if (draftsList && draftsList.length > 0) {
      const primary = draftsList[0] // Sleeper returns most recent first
      const draftType =
        primary.type === 'snake' || primary.type === 'auction' || primary.type === 'linear'
          ? primary.type
          : 'unknown'

      const { data: draftRow } = await db
        .from('drafts')
        .upsert(
          {
            season_id: seasonId,
            external_id: primary.draft_id,
            draft_type: draftType,
            rounds: primary.settings?.rounds ?? null,
          },
          { onConflict: 'season_id,external_id' }
        )
        .select('id')
        .single()

      if (draftRow && primary.status === 'complete') {
        const picks = await sleeper.draftPicks(primary.draft_id)
        if (picks) {
          for (const p of picks) {
            const mgrId = userIdToManagerId(p.picked_by ?? null)
            const playerName = p.metadata
              ? [p.metadata.first_name, p.metadata.last_name].filter(Boolean).join(' ')
              : null
            await db.from('draft_picks').upsert(
              {
                draft_id: draftRow.id,
                round: p.round,
                pick: p.pick_no,
                manager_id: mgrId,
                player_name: playerName || null,
                position: p.metadata?.position ?? null,
                nfl_team: p.metadata?.team ?? null,
                player_external_id: p.player_id,
              },
              { onConflict: 'draft_id,pick' }
            )
          }
          draftsIngested++
        }
      }
    }
    } // end stages.drafts

    // 4g. Trades — walk every regular-season week, filter type='trade' &&
    // status='complete'. Sleeper's transactions endpoint returns an empty
    // array for weeks with no activity, so a few extra fetches is cheap.
    // Trades after the trade deadline are rare but still legal in some
    // leagues, so we go all the way through maxWeek rather than stopping
    // at a hardcoded deadline.
    if (stages.trades) {
    const tradeWeekly = await parallelLimit(weeks, 5, async (w) => {
      const tx = await sleeper.transactions(lg.league_id, w)
      return tx ?? []
    })
    const seasonTrades: SleeperTransaction[] = []
    for (const wk of tradeWeekly) {
      for (const t of wk) {
        if (t.type === 'trade' && t.status === 'complete') seasonTrades.push(t)
      }
    }

    // Per-(season, week) position-rank cache. Multiple trades land in the
    // same week — refetching stats per trade would be wasteful. Computed
    // lazily on first hit.
    const ranksByWeek = new Map<number, Awaited<ReturnType<typeof computePositionRanks>>>()
    const scoringSettings = lg.scoring_settings ?? {}
    async function ranksForWeek(week: number) {
      let r = ranksByWeek.get(week)
      if (r) return r
      try {
        r = await computePositionRanks({ season: year, throughWeek: week, scoring: scoringSettings })
      } catch (e) {
        warnings.push(`Season ${year} W${week} ranks: ${e instanceof Error ? e.message : String(e)}`)
        r = new Map()
      }
      ranksByWeek.set(week, r)
      return r
    }

    for (const t of seasonTrades) {
      // Build assets per roster_id participating in this trade.
      const assetsByRoster = new Map<number, Array<Record<string, unknown>>>()
      for (const rid of t.roster_ids) assetsByRoster.set(rid, [])

      // Players: `adds` is keyed by player_id -> roster_id (the receiver).
      // `drops` is symmetric; we use `adds` as the source of truth.
      if (t.adds) {
        for (const [pid, rid] of Object.entries(t.adds)) {
          const player = playersByPid?.get(pid) ?? null
          const fullName = player
            ? player.full_name
              ?? [player.first_name, player.last_name].filter(Boolean).join(' ')
            : null
          const arr = assetsByRoster.get(rid) ?? []
          arr.push({
            kind: 'player',
            player_id: pid,
            name: fullName || null,
            position: player?.position ?? null,
            team: player?.team ?? null,
          })
          assetsByRoster.set(rid, arr)
        }
      }

      // Draft picks: owner_id received the pick from previous_owner_id.
      // Store the original owner as a manager_id so the UI can render
      // "Joe's 2026 2nd" cleanly.
      for (const p of t.draft_picks ?? []) {
        const originalUid = rosterToUserId.get(p.previous_owner_id) ?? null
        const arr = assetsByRoster.get(p.owner_id) ?? []
        arr.push({
          kind: 'pick',
          season_year: parseInt(p.season, 10),
          round: p.round,
          original_owner_manager_id: userIdToManagerId(originalUid),
        })
        assetsByRoster.set(p.owner_id, arr)
      }

      // FAAB: receiver gets `amount` from sender.
      for (const w of t.waiver_budget ?? []) {
        const arr = assetsByRoster.get(w.receiver) ?? []
        arr.push({ kind: 'faab', amount: w.amount })
        assetsByRoster.set(w.receiver, arr)
      }

      // Upsert the trade. status_updated is in milliseconds since epoch.
      const { data: tradeRow, error: tradeErr } = await db
        .from('trades')
        .upsert(
          {
            league_id: leagueRow.id,
            season_id: seasonId,
            platform: 'sleeper',
            external_id: t.transaction_id,
            week: t.week ?? null,
            executed_at: new Date(t.status_updated).toISOString(),
            status: 'completed',
            raw_payload: t,
          },
          { onConflict: 'league_id,platform,external_id' }
        )
        .select('id')
        .single()
      if (tradeErr || !tradeRow) {
        warnings.push(`Trade ${t.transaction_id}: upsert failed: ${tradeErr?.message ?? 'no row'}`)
        continue
      }

      // Replace sides on every sync — assets are derived, never authored.
      // Cascading FK on trade_grades means an existing grade survives the
      // delete only if it's bound to a side we re-insert with the same id,
      // which we don't — but that's fine because grades aren't generated in
      // Phase 1, so there's nothing to lose yet. When grading lands in
      // Phase 2 we'll switch this to per-side upsert keyed by (trade_id,
      // manager_id) to preserve grade history across re-syncs.
      await db.from('trade_sides').delete().eq('trade_id', tradeRow.id)

      // Stamp season-to-date position rank on each player asset, scoped
      // to the trade's week. Trades with no week (rare — pre-season pick
      // swaps) skip rank stamping; pick/FAAB-only sides still pass through.
      const weekForRanks = t.week ?? null
      const ranks = weekForRanks ? await ranksForWeek(weekForRanks) : null

      let sidesInserted = 0
      for (const [rid, assets] of assetsByRoster) {
        const managerId = userIdToManagerId(rosterToUserId.get(rid) ?? null)
        if (!managerId) {
          warnings.push(`Trade ${t.transaction_id}: roster ${rid} has no manager mapping; side skipped`)
          continue
        }
        const stamped = ranks
          ? await stampRanks(assets, { ranks, platform: 'sleeper' })
          : assets
        const { error: sideErr } = await db.from('trade_sides').insert({
          trade_id: tradeRow.id,
          manager_id: managerId,
          assets: stamped,
        })
        if (sideErr) {
          warnings.push(`Trade ${t.transaction_id} side r${rid}: ${sideErr.message}`)
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
    managersIngested: userMap.size,
    matchupsIngested,
    draftsIngested,
    tradesIngested,
    warnings,
  }
}
