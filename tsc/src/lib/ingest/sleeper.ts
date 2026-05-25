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
} from '@/lib/platforms/sleeper'

export type IngestResult = {
  ok: boolean
  seasonsIngested: number
  managersIngested: number
  matchupsIngested: number
  draftsIngested: number
  warnings: string[]
}

const PLAYOFF_DEFAULT_START = 15

// Ingest from every source attached to this archive.
export async function ingestSleeperLeague(leagueRowId: string): Promise<IngestResult> {
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
    .select('id, external_id, walk_history')
    .eq('league_id', leagueRow.id)
    .eq('platform', 'sleeper')

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
    const result = await ingestSleeperSource(leagueRowId, src.external_id, src.walk_history)
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

// Ingest from a single source Sleeper league_id.
// If walkHistory is true, follow previous_league_id back. Otherwise just ingest this one.
export async function ingestSleeperSource(
  archiveLeagueId: string,
  startLeagueId: string,
  walkHistory: boolean
): Promise<IngestResult> {
  const db = createAdminClient()
  const warnings: string[] = []

  const history = walkHistory
    ? await fetchLeagueHistory(startLeagueId)
    : await (async () => {
        const one = await sleeper.league(startLeagueId)
        return one ? [one] : []
      })()
  if (history.length === 0) throw new Error('Sleeper returned no league data')

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
    await db.from('manager_seasons').delete().eq('season_id', seasonId)
    await db.from('drafts').delete().eq('season_id', seasonId)

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

    // 4e. Matchups — fetch all weeks in parallel (limit 5 concurrent)
    const maxWeek = playoffStart + 3
    const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1)
    const weeklyMatchups = await parallelLimit(weeks, 5, async (w) => {
      const m = await sleeper.matchups(lg.league_id, w)
      return { week: w, rows: m ?? [] }
    })

    // Per-season diagnostic counters so we can see exactly where matchups go.
    let seasonInserted = 0
    let seasonEmptyWeeks = 0
    let seasonByeOrSingleSide = 0
    let seasonUnresolvedManager = 0
    let seasonSameManager = 0
    let seasonFlatPairs = 0

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

    // Per-season matchup breakdown — mirrors the ESPN diagnostic format so
    // we can spot exactly where games are going when a sync looks short.
    warnings.push(
      `Season ${year} matchups breakdown: ${seasonFlatPairs} pairs from Sleeper → ${seasonInserted} inserted ` +
      `(empty weeks=${seasonEmptyWeeks}, bye/single-side=${seasonByeOrSingleSide}, ` +
      `unresolved manager=${seasonUnresolvedManager}, same manager=${seasonSameManager}) · playoffStart=week ${playoffStart}`
    )

    // 4f. Drafts
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
  }

  return {
    ok: true,
    seasonsIngested: history.length,
    managersIngested: userMap.size,
    matchupsIngested,
    draftsIngested,
    warnings,
  }
}
