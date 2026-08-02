// The Over/Under — building the deck, and setting the lines.
//
// Server half. The rules and the wire shapes live in ./overUnder, which is
// import-free so the board can read them in the browser.
//
// A "deck" is every scored team-week in one league's completed seasons — each
// matchup contributes two, one per side. A "deal" is the ten this seed draws,
// each with a line hung on it.

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { pageAll } from './pool'
import { DEMO_POOL_ID } from './demoPool'
import { makeRng, newSeed, normalizeSeed } from './roulette'
import {
  ROUNDS,
  MIN_DECK,
  type OverUnderQuestion,
  type OverUnderDeal,
  type OverUnderError,
} from './overUnder'

/** One side of one matchup, before a line is hung on it. */
type DeckEntry = {
  key: string
  year: number
  week: number
  isPlayoff: boolean
  isChampionship: boolean
  managerId: string
  managerName: string
  teamName: string | null
  avatarUrl: string | null
  score: number
  weekAverage: number
  oppTeamName: string | null
  oppManagerName: string
  oppScore: number
  won: boolean
}

type Deck = {
  label: string
  entries: DeckEntry[]
  /**
   * How much this league's weekly scores move about, as a standard
   * deviation over the whole deck.
   *
   * The lines are scaled to this rather than to a flat number of points.
   * Scoring formats differ enormously between leagues — a six-point-passing
   * PPR league with deep benches spreads its weekly scores across a far wider
   * band than a standard-scoring one — and a flat ±10 line would be a genuine
   * read in the first and a giveaway in the second. Nobody playing the board
   * chose that setting, so the board shouldn't punish them for it.
   */
  sigma: number
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

  // Completed seasons only, by the house rule. Like The Gauntlet and unlike
  // Roulette there is no rank-file clamp: no player is ever scored here, so
  // every season the league has is fair game.
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

  const [managerRows, msRows, matchRows] = await Promise.all([
    pageAll<{ id: string; display_name: string }>(() =>
      db.from('managers').select('id, display_name').eq('league_id', league.id).order('id')
    ),
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

  const nameById = new Map(managerRows.map((m) => [m.id, m.display_name]))
  // Per-season team names, for the same reason The Gauntlet uses them: a
  // manager's current team name on a 2019 question is an anachronism, and
  // anyone who remembers when he renamed it gets a free read on the year.
  const teamBySeasonManager = new Map(
    msRows.map((r) => [`${r.season_id}|${r.manager_id}`, r.team_name])
  )
  const avatarBySeasonManager = new Map(
    msRows.map((r) => [`${r.season_id}|${r.manager_id}`, r.avatar_url])
  )

  // What the room averaged in each week, which the board shows before the
  // call. Computed over every scored side of every matchup that week, so it
  // is the league's own weather rather than anything about the team asked
  // about. Both sides of every game count once.
  const weekTotals = new Map<string, { sum: number; n: number }>()
  for (const m of matchRows) {
    if (m.score_a == null || m.score_b == null) continue
    if (m.score_a <= 0 || m.score_b <= 0) continue
    const key = `${m.season_id}|${m.week}`
    const cur = weekTotals.get(key) ?? { sum: 0, n: 0 }
    cur.sum += m.score_a + m.score_b
    cur.n += 2
    weekTotals.set(key, cur)
  }
  const weekAverage = (seasonId: string, week: number): number => {
    const t = weekTotals.get(`${seasonId}|${week}`)
    return t && t.n > 0 ? Math.round((t.sum / t.n) * 10) / 10 : 0
  }

  const entries: DeckEntry[] = []

  for (const m of matchRows) {
    const year = yearBySeason.get(m.season_id)
    if (year == null) continue
    if (!m.manager_a_id || !m.manager_b_id) continue
    if (m.score_a == null || m.score_b == null) continue
    // A 0-0 row is a fixture that came across without a result. Asking
    // whether a team beat a line in a week they never played is not a
    // question, it's a bug with a button under it.
    if (m.score_a <= 0 || m.score_b <= 0) continue
    if (m.manager_a_id === m.manager_b_id) continue

    const nameA = nameById.get(m.manager_a_id)
    const nameB = nameById.get(m.manager_b_id)
    if (!nameA || !nameB) continue

    const teamA = teamBySeasonManager.get(`${m.season_id}|${m.manager_a_id}`) ?? null
    const teamB = teamBySeasonManager.get(`${m.season_id}|${m.manager_b_id}`) ?? null
    const base = {
      year,
      week: m.week,
      isPlayoff: !!m.is_playoff,
      isChampionship: !!m.is_championship,
      weekAverage: weekAverage(m.season_id, m.week),
    }

    // Both sides of a matchup enter the deck. They're separate questions —
    // knowing one team's score tells you nothing about the other's line —
    // and dropping one would halve a small league's deck for nothing.
    entries.push({
      ...base,
      key: `${m.id.slice(0, 12)}a`,
      managerId: m.manager_a_id,
      managerName: nameA,
      teamName: teamA,
      avatarUrl: avatarBySeasonManager.get(`${m.season_id}|${m.manager_a_id}`) ?? null,
      score: m.score_a,
      oppTeamName: teamB,
      oppManagerName: nameB,
      oppScore: m.score_b,
      won: m.score_a > m.score_b,
    })
    entries.push({
      ...base,
      key: `${m.id.slice(0, 12)}b`,
      managerId: m.manager_b_id,
      managerName: nameB,
      teamName: teamB,
      avatarUrl: avatarBySeasonManager.get(`${m.season_id}|${m.manager_b_id}`) ?? null,
      score: m.score_b,
      oppTeamName: teamA,
      oppManagerName: nameA,
      oppScore: m.score_a,
      won: m.score_b > m.score_a,
    })
  }

  if (entries.length === 0) return null

  const mean = entries.reduce((sum, e) => sum + e.score, 0) / entries.length
  const variance =
    entries.reduce((sum, e) => sum + (e.score - mean) * (e.score - mean), 0) / entries.length
  // Floored so a league with freakishly flat scoring can't produce lines
  // sitting a tenth of a point off the answer, which reads as a trick.
  const sigma = Math.max(6, Math.sqrt(variance))

  return { label: league.name, entries, sigma }
}

// Cached for the same half day as the other decks. Bump the version whenever
// the deck's filters or the line rule change, or a stale cache keeps dealing
// by rules the code no longer follows.
function loadDeck(poolId: string): Promise<Deck | null> {
  return unstable_cache(
    async () => buildLeagueDeck(poolId),
    ['minigame-over-under-deck', 'v2', poolId],
    { tags: ['minigame-pool'], revalidate: 60 * 60 * 12 }
  )()
}

/**
 * Snaps a number to a line that ALWAYS ends in .5.
 *
 * This is what removes pushes. Counting in half-points and forcing that count
 * odd is the whole trick: an odd number of halves is by definition
 * something-point-five, where rounding to the nearest half would leave whole
 * numbers behind about half the time and hand those rounds a third outcome to
 * explain.
 */
function snapToHalf(raw: number): number {
  const halves = Math.round(raw * 2)
  return Math.max(0.5, (halves % 2 === 0 ? halves + 1 : halves) / 2)
}

/** Turns a deck entry and a settled line into a question on the wire. */
function toQuestion(e: DeckEntry, line: number): OverUnderQuestion {
  return {
    key: e.key,
    year: e.year,
    week: e.week,
    isPlayoff: e.isPlayoff,
    isChampionship: e.isChampionship,
    managerName: e.managerName,
    teamName: e.teamName,
    avatarUrl: e.avatarUrl,
    line,
    score: Math.round(e.score * 100) / 100,
    weekAverage: e.weekAverage,
    // Read off the ROUNDED line rather than carried from the draw. The snap
    // moves the line by up to a quarter point, and an answer that disagrees
    // with the number printed on screen is the one bug a betting game would
    // never be forgiven for.
    answer: e.score > line ? 'over' : 'under',
    oppTeamName: e.oppTeamName,
    oppManagerName: e.oppManagerName,
    oppScore: Math.round(e.oppScore * 100) / 100,
    won: e.won,
  }
}

/**
 * Draws this seed's ten questions, each with a line hung on it.
 *
 * ── Why the line is a MIDPOINT of two real weeks ──────────────
 *
 * The obvious construction is to take the real score and push it away by a
 * random distance, letting the direction of the push decide the answer. It is
 * also wrong, and measurably so. The direction is a fair coin, so the answers
 * split 50/50 overall — but the LINE is not independent of that coin. A line
 * pushed upward tends to land above the league average and a line pushed down
 * tends to land below it, because the scores being pushed from cluster around
 * that average. So "this line looks high for this league, call under" beats
 * the board without knowing a thing about the team or the week. Measured on
 * pams, that one rule won 64.8% of calls. Somebody following it isn't reading
 * their league, they're reading the generator.
 *
 * The fix is to make the coin the LAST thing that happens rather than the
 * first. Two real team-weeks are drawn, the line is set at the midpoint
 * between their scores, and only THEN is a coin flipped to decide which of the
 * two the player is asked about. Whatever the line is, the team behind it is
 * equally likely to be the higher or the lower of the pair, so the line can
 * carry no information at all: the naive strategy falls to 50%, where it
 * belongs, and the only way left to beat the board is to know what that team
 * did that week.
 *
 * It also makes the difficulty organic. The distance from the line is half the
 * gap between two real scores, so some calls are agonising and some are
 * gettable, in the proportion the league's own scoring actually produces. The
 * band below only keeps that gap inside a readable range, and because the
 * condition is symmetric in the two scores it cannot reintroduce the bias.
 */
function drawQuestions(deck: Deck, seed: string, count: number): OverUnderQuestion[] {
  const rng = makeRng(seed)
  const pool = deck.entries.slice()

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }

  // How far apart the two scores in a pair may sit. Scaled to the league's own
  // spread, for the reason given on Deck.sigma. Half of this is the distance
  // from the line, so on a typical league the call is three to sixteen points
  // out.
  const minGap = deck.sigma * 0.25
  const maxGap = deck.sigma * 1.3

  const out: OverUnderQuestion[] = []
  const used = new Set<number>()
  // No manager twice in one card. Ten questions against a twelve-manager
  // league would otherwise show the same team three times, and by the third
  // the player is pricing a team they were just told the score of. Applied
  // to the QUESTION only and only after the coin: it turns on identity, never
  // on scores, so it can't skew which side of the line the answer falls.
  const seenManager = new Set<string>()

  for (let i = 0; i < pool.length && out.length < count; i++) {
    if (used.has(i)) continue

    let partner = -1
    for (let j = i + 1; j < pool.length; j++) {
      if (used.has(j)) continue
      const gap = Math.abs(pool[i].score - pool[j].score)
      if (gap >= minGap && gap <= maxGap) {
        partner = j
        break
      }
    }
    if (partner === -1) continue

    const pair = [pool[i], pool[partner]]
    const asked = pair[rng() < 0.5 ? 0 : 1] // the coin, and the whole fairness argument
    if (seenManager.has(asked.managerId)) continue

    const line = snapToHalf((pair[0].score + pair[1].score) / 2)
    used.add(i)
    used.add(partner)
    seenManager.add(asked.managerId)
    out.push(toQuestion(asked, line))
  }

  // A thin or unusually flat deck can run the pairing dry: a league where
  // every score sits within a few points of every other has no pair inside
  // the band. Rather than deal a short card, pair off whatever is left with
  // no gap requirement. Still fair — the coin is unchanged — and it can only
  // ever produce an easier board, never a broken one.
  if (out.length < count) {
    const spare = pool.map((e, idx) => [e, idx] as const).filter(([, idx]) => !used.has(idx))
    for (let i = 0; i + 1 < spare.length && out.length < count; i += 2) {
      const pair = [spare[i][0], spare[i + 1][0]]
      const asked = pair[rng() < 0.5 ? 0 : 1]
      const line = snapToHalf((pair[0].score + pair[1].score) / 2)
      if (line === asked.score) continue
      out.push(toQuestion(asked, line))
    }
  }

  return out
}

export async function dealOverUnder(
  poolParam: string,
  seedParam: string | null
): Promise<OverUnderDeal | OverUnderError> {
  const poolId = (poolParam ?? '').trim().toLowerCase()
  const seed = normalizeSeed(seedParam) ?? newSeed()

  if (!poolId) {
    return { ok: false, status: 400, error: 'Pick a league to play.' }
  }
  // One league at a time. Lines are scaled to a single league's scoring
  // spread, so a mixed deck would price a standard-scoring team off a
  // PPR league's sigma and call the result a fair bet.
  if (poolId === 'site' || poolId.includes(',')) {
    return {
      ok: false,
      status: 400,
      error: 'The Over/Under is played one league at a time. A line only means something against scoring you know.',
    }
  }
  if (poolId === DEMO_POOL_ID) {
    return {
      ok: false,
      status: 409,
      error: "The demo league's week-by-week scores aren't published yet, so the Over/Under needs a league of your own for now.",
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

  if (deck.entries.length < MIN_DECK) {
    return {
      ok: false,
      status: 409,
      error:
        deck.entries.length === 0
          ? "This league's week-by-week scores haven't come across from its old platform, so there is nothing to price yet."
          : 'This league needs a full season on the books before there are enough scores to price.',
    }
  }

  return {
    ok: true,
    seed,
    pool: {
      id: poolId,
      label: deck.label,
      sublabel: 'League history',
      leagueSlug: poolId,
    },
    deckSize: deck.entries.length,
    questions: drawQuestions(deck, seed, ROUNDS),
  }
}
