// The Gauntlet — building the deck, and dealing a run.
//
// Server half. The rules and the wire shapes live in ./gauntlet, which is
// import-free so the board can read them in the browser.
//
// A "deck" is every decided matchup in one league's completed seasons, each
// one carrying both teams' records as they stood going in. A "deal" is the
// forty this seed draws out of it, in order.

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { pageAll } from './pool'
import { DEMO_POOL_ID } from './demoPool'
import { makeRng, newSeed, normalizeSeed } from './roulette'
import { loadManagerNames } from './managerNames'
import {
  roundsFor,
  MIN_DECK,
  type GauntletMode,
  type GauntletSide,
  type GauntletQuestion,
  type GauntletDeal,
  type GauntletError,
} from './gauntlet'

type Deck = {
  label: string
  questions: GauntletQuestion[]
}

type MatchupRow = {
  id: string
  season_id: string
  week: number
  manager_a_id: string | null
  manager_b_id: string | null
  score_a: number | null
  score_b: number | null
  is_playoff: boolean | null
  is_championship: boolean | null
}

async function buildLeagueDeck(slug: string): Promise<Deck | null> {
  const db = createAdminClient()

  const { data: leagueRows } = await db
    .from('leagues')
    .select('id, name')
    .eq('slug', slug)
    .eq('manager_view', false)
    .limit(1)
  const league = (leagueRows ?? [])[0] as { id: string; name: string } | undefined
  if (!league) return null

  // Completed seasons only, by the house rule: a champion is on the books.
  // Never is_live. No rank-file year clamp — this game never scores a player,
  // so it can use every season the league has, which is the whole reason it
  // works on leagues the other games turn away.
  const seasons = await pageAll<{ id: string; year: number }>(() =>
    db
      .from('seasons')
      .select('id, year')
      .eq('league_id', league.id)
      .not('champion_manager_id', 'is', null)
      .order('year')
  )
  if (seasons.length === 0) return null

  const yearBySeason = new Map(seasons.map((s) => [s.id, s.year]))
  const seasonIds = seasons.map((s) => s.id)

  const [nameById, msRows, matchRows] = await Promise.all([
    // The league's own name for each manager (renames and merges applied),
    // not the platform's. See ./managerNames.
    loadManagerNames(db, [league.id]),
    pageAll<{
      season_id: string
      manager_id: string
      team_name: string | null
      avatar_url: string | null
    }>(() =>
      db
        .from('manager_seasons')
        .select('season_id, manager_id, team_name, avatar_url')
        .in('season_id', seasonIds)
        .order('season_id')
    ),
    pageAll<MatchupRow>(() =>
      db
        .from('matchups')
        .select('id, season_id, week, manager_a_id, manager_b_id, score_a, score_b, is_playoff, is_championship')
        .in('season_id', seasonIds)
        .order('id')
    ),
  ])

  // Team names are per SEASON, not per manager — the same person is "Milk
  // Money" one year and something unrepeatable the next, and showing the
  // current name on a 2019 question would quietly hand over the answer to
  // anyone who knows when he changed it.
  const teamBySeasonManager = new Map(
    msRows.map((r) => [`${r.season_id}|${r.manager_id}`, r.team_name])
  )
  // Per-season too, and for the same reason as the team name: a manager's
  // current avatar on a 2019 fixture is the wrong face for the year.
  const avatarBySeasonManager = new Map(
    msRows.map((r) => [`${r.season_id}|${r.manager_id}`, r.avatar_url])
  )

  // Only matchups that are actually questions: two known managers, two
  // scores, and a winner. Ties are dropped rather than treated as a third
  // answer — "who won?" has no answer on a tie, and adding a Tie button to
  // every question to cover the handful that are would make every other
  // question fractionally harder for no gain.
  const decided = matchRows.filter(
    (m) =>
      m.manager_a_id &&
      m.manager_b_id &&
      m.score_a != null &&
      m.score_b != null &&
      m.score_a !== m.score_b &&
      // A 0-0 row is an unplayed week that came across as a fixture rather
      // than a result. Whichever side "won" it, nobody remembers it.
      (m.score_a > 0 || m.score_b > 0)
  )

  // ── Records as they stood going in ────────────────────────────
  //
  // Accumulated from the REGULAR SEASON only, and only from weeks strictly
  // earlier than the question's. Two decisions worth keeping:
  //
  //  · Playoff results never enter a record, because no manager describes
  //    their record that way. Going into the title game you are 10-4, not
  //    12-4. A record that counted playoff wins would read as wrong to
  //    exactly the people this game is for.
  //  · Ties count in the record even though a tied GAME is never asked. The
  //    game not being a question doesn't mean it didn't happen.
  const bySeason = new Map<string, MatchupRow[]>()
  for (const m of matchRows) {
    const list = bySeason.get(m.season_id)
    if (list) list.push(m)
    else bySeason.set(m.season_id, [m])
  }

  type Rec = { wins: number; losses: number; ties: number }
  const blank = (): Rec => ({ wins: 0, losses: 0, ties: 0 })
  /** season|manager|week -> record going into that week */
  const recordBefore = new Map<string, Rec>()

  for (const [seasonId, rows] of bySeason) {
    const weeks = [...new Set(rows.map((r) => r.week))].sort((a, b) => a - b)
    const running = new Map<string, Rec>()

    for (const week of weeks) {
      // Snapshot BEFORE playing this week, which is what the question shows.
      for (const [managerId, rec] of running) {
        recordBefore.set(`${seasonId}|${managerId}|${week}`, { ...rec })
      }
      for (const m of rows) {
        if (m.week !== week) continue
        if (m.is_playoff) continue
        if (!m.manager_a_id || !m.manager_b_id) continue
        if (m.score_a == null || m.score_b == null) continue
        if (m.score_a === 0 && m.score_b === 0) continue
        const a = running.get(m.manager_a_id) ?? blank()
        const b = running.get(m.manager_b_id) ?? blank()
        if (m.score_a > m.score_b) {
          a.wins++
          b.losses++
        } else if (m.score_b > m.score_a) {
          b.wins++
          a.losses++
        } else {
          a.ties++
          b.ties++
        }
        running.set(m.manager_a_id, a)
        running.set(m.manager_b_id, b)
      }
    }
  }

  const side = (seasonId: string, managerId: string, week: number): GauntletSide | null => {
    const name = nameById.get(managerId)
    if (!name) return null
    const rec = recordBefore.get(`${seasonId}|${managerId}|${week}`) ?? blank()
    return {
      managerId,
      managerName: name,
      teamName: teamBySeasonManager.get(`${seasonId}|${managerId}`) ?? null,
      wins: rec.wins,
      losses: rec.losses,
      ties: rec.ties,
      avatarUrl: avatarBySeasonManager.get(`${seasonId}|${managerId}`) ?? null,
    }
  }

  const questions: GauntletQuestion[] = []
  for (const m of decided) {
    const year = yearBySeason.get(m.season_id)
    if (year == null) continue
    const a = side(m.season_id, m.manager_a_id!, m.week)
    const b = side(m.season_id, m.manager_b_id!, m.week)
    if (!a || !b) continue
    // A manager row duplicated by a platform migration can put someone
    // against himself. Real, and unanswerable.
    if (a.managerId === b.managerId) continue
    questions.push({
      key: m.id.slice(0, 12),
      year,
      week: m.week,
      isPlayoff: !!m.is_playoff,
      isChampionship: !!m.is_championship,
      a,
      b,
      answer: m.score_a! > m.score_b! ? 'a' : 'b',
      scoreA: Math.round(m.score_a! * 100) / 100,
      scoreB: Math.round(m.score_b! * 100) / 100,
    })
  }

  return { label: league.name, questions }
}

// Cached for the same half day as the other decks: a league's matchup history
// changes only when it re-syncs. Bump the version whenever the deck's filters
// or the record rule change, or a stale cache keeps dealing by rules the code
// no longer follows.
function loadDeck(poolId: string): Promise<Deck | null> {
  return unstable_cache(
    async () => buildLeagueDeck(poolId),
    ['minigame-gauntlet-deck', 'v2', poolId],
    { tags: ['minigame-pool'], revalidate: 60 * 60 * 12 }
  )()
}

/**
 * Draws this seed's run.
 *
 * A plain seeded shuffle, with one rule on top: no two consecutive questions
 * come from the same week of the same season. Without it a shuffle happily
 * deals both halves of one week's slate back to back, and the second one is
 * easier than it should be — you have just been told what one of those teams
 * did that week, and in a small league that is most of the information.
 */
function drawQuestions(deck: Deck, seed: string, count: number): GauntletQuestion[] {
  const rng = makeRng(seed)
  const pool = deck.questions.slice()

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }

  const out: GauntletQuestion[] = []
  const held: GauntletQuestion[] = []
  let lastSlate = ''

  for (const q of pool) {
    if (out.length >= count) break
    const slate = `${q.year}|${q.week}`
    if (slate === lastSlate) {
      held.push(q)
      continue
    }
    out.push(q)
    lastSlate = slate
  }

  // Anything set aside goes back on the end in seeded order, so a league with
  // a thin deck still fills a run and the deal stays reproducible.
  for (const q of held) {
    if (out.length >= count) break
    out.push(q)
  }
  return out
}

export async function dealGauntlet(
  poolParam: string,
  modeParam: GauntletMode,
  seedParam: string | null
): Promise<GauntletDeal | GauntletError> {
  const poolId = (poolParam ?? '').trim().toLowerCase()
  const seed = normalizeSeed(seedParam) ?? newSeed()

  if (!poolId) {
    return { ok: false, status: 400, error: 'Pick a league to play.' }
  }
  // One league at a time, for the same reason Guess the Draft is: calling a
  // game between two strangers is a coin flip, and a combined deck would add
  // "which league is this?" as a question the board never asks.
  if (poolId === 'site' || poolId.includes(',')) {
    return {
      ok: false,
      status: 400,
      error: 'The Gauntlet is played one league at a time. You can only call games you were around for.',
    }
  }
  // The demo tree carries standings but no schedule, so there is nothing to
  // ask about there yet. Said plainly rather than silently falling back.
  if (poolId === DEMO_POOL_ID) {
    return {
      ok: false,
      status: 409,
      error: "The demo league's week-by-week results aren't published yet, so The Gauntlet needs a league of your own for now.",
    }
  }
  // Shape-checked before the query so a hand-typed pool can't smuggle filter
  // syntax into PostgREST.
  if (!/^[a-z0-9-]{1,80}$/.test(poolId)) {
    return { ok: false, status: 404, error: 'No league on this site goes by that name.' }
  }

  const deck = await loadDeck(poolId)
  if (!deck) {
    return { ok: false, status: 404, error: 'No league on this site goes by that name.' }
  }

  if (deck.questions.length < MIN_DECK) {
    return {
      ok: false,
      status: 409,
      error:
        deck.questions.length === 0
          ? "This league's week-by-week results haven't come across from its old platform, so there are no games to call yet."
          : 'This league needs a full season on the books before there are enough games to call.',
    }
  }

  return {
    ok: true,
    seed,
    mode: modeParam,
    pool: {
      id: poolId,
      label: deck.label,
      sublabel: 'League history',
      leagueSlug: poolId,
    },
    deckSize: deck.questions.length,
    questions: drawQuestions(deck, seed, roundsFor(modeParam)),
  }
}
