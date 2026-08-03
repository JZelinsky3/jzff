// The Multiverse Draft — building the card pool, and dealing a season.
//
// Server half. The rules and the wire shapes live in ./multiverse, which is
// import-free so the board can read them in the browser.
//
// A "card pool" is every player this league rostered in at least three
// completed seasons, each of those seasons joined to what he actually did per
// game in the league's own scoring. A "deal" is the seven rounds one seed
// picks out of it, the dice, and the fourteen opponents.

import { promises as fs } from 'fs'
import path from 'path'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalDraftIds } from '@/lib/canonicalDraft'
import { pageAll } from './pool'
import { DEMO_POOL_ID, DEMO_POOL_LABEL } from './demoPool'
import { makeRng, newSeed, normalizeSeed } from './roulette'
import { loadManagerNames } from './managerNames'
import {
  getRankLookup,
  latestRankYear,
  normPlayerName,
  isScoringProfile,
  FIRST_RANK_YEAR,
  SITE_PROFILE,
  type ScoringProfile,
  type RankLookup,
} from './ranks'
import {
  SLOTS,
  ROUNDS,
  CARDS_PER_ROUND,
  WEEKS,
  TIMELINES,
  TIMELINES_SHORT,
  FULL_HISTORY_SEASONS,
  MIN_MEAN_PPG,
  PLAYOFF_ROUNDS,
  playoffKeep,
  bestTimelines,
  type MvPosition,
  type MvCard,
  type MvRound,
  type MvTimeline,
  type MvOpponent,
  type MultiverseDeal,
  type MultiverseError,
} from './multiverse'

const POSITIONS: MvPosition[] = ['QB', 'RB', 'WR', 'TE']
const SCORABLE = new Set<string>(POSITIONS)

/**
 * Cards needed at each position before a league can be dealt.
 *
 * Every round shows one of each position plus a wildcard (see dealRounds), so
 * a seven-round board draws seven of each at minimum and needs headroom on
 * top or the last rounds repeat themselves. Ten is that with room to spare.
 */
const MIN_PER_POSITION = 10

/**
 * Where each round aims on its position's own scale, 1 being the top of the
 * pool and 0 the bottom.
 *
 * Aimed at a TARGET RATE rather than at a slice of the list, because the two
 * are not the same thing and only the first is what a player sees. Cutting
 * the list into seven even slices put the late rounds on the literal bottom
 * of the pool — round seven was dealing 8.6 PPG running backs, which is a
 * round you click through rather than draft. The curve stops at 0.34, so the
 * worst card on the board is a low-end starter and not a body.
 *
 * On pams this deals running backs at 19.4 / 17.2 / 16.3 / 14.7 / 13.3 /
 * 11.9 / 11.1 and receivers within a few tenths of that; quarterbacks run
 * 24.8 down to 17.9, tight ends 13.7 down to 8.9. Those are window averages,
 * so an individual round-one back lands anywhere from about 16 to 23.
 */
const TIER_CURVE = [1.0, 0.88, 0.76, 0.63, 0.52, 0.42, 0.34]

/**
 * How many players each round draws from.
 *
 * Narrow at the top and wide at the bottom, because that is the shape of the
 * talent: there are four or five genuinely elite backs in a seven-season
 * league and thirty interchangeable ones. A constant width had to be wide
 * enough for the late rounds, which made round one a lottery among fifteen
 * players and stopped it feeling like a first round.
 */
const TIER_SIZES = [6, 7, 9, 11, 13, 15, 17]

/** What each round is drawing from, said plainly in the header. */
const TIER_NOTES = [
  'The top of the board',
  'Second-round talent',
  'Third-round talent',
  'The middle rounds',
  'Starters, with a flaw each',
  'Depth and dice rolls',
  'Late-round fliers',
]

/** One player, with every scorable season he was rostered for in this league. */
type PoolPlayer = {
  name: string
  pos: MvPosition
  playerId: string | null
  seasons: MvTimeline[]
  /**
   * Average across every season this league had him, which is what the board
   * is ranked and tiered on. Deliberately not the average of the three he
   * happens to be dealt: that is the luck of one board, and the draft should
   * descend by talent rather than by that.
   */
  mean: number
}

/**
 * A player as the source rows know him: which seasons he was rostered, and
 * the league's own spelling of his name.
 *
 * The name is carried from draft_picks / weekly_lineups rather than read back
 * off the rank files, which key on a normalised form and never store a
 * display name. Using the league's spelling is the better answer regardless —
 * it is what the almanac shows everywhere else on the site.
 */
type Rostered = { years: Set<number>; display: string }

type Pool = {
  label: string
  sublabel: string
  leagueSlug: string | null
  profile: ScoringProfile
  years: number[]
  players: PoolPlayer[]
  /** Real names off the league, used for the fourteen opponents. */
  managerNames: string[]
}

// ============================================================
// The league pool
// ============================================================

/**
 * Which seasons each player was on somebody's roster for.
 *
 * Reads BOTH the drafts and the weekly lineups, deliberately. Drafts alone
 * would drop every waiver add and every deadline trade, which on pams is
 * roughly ten skill players per team per year and is exactly where the odd
 * cards live. Lineups alone would drop whole leagues whose week-by-week
 * history never came across from their old platform.
 */
async function buildLeaguePool(slug: string): Promise<Pool | null> {
  const db = createAdminClient()

  const { data: leagueRows } = await db
    .from('leagues')
    .select('id, name, draft_scoring_profile')
    .eq('slug', slug)
    .eq('manager_view', false)
    .limit(1)
  const league = (leagueRows ?? [])[0] as
    | { id: string; name: string; draft_scoring_profile: string | null }
    | undefined
  if (!league) return null

  const profile: ScoringProfile = isScoringProfile(league.draft_scoring_profile)
    ? league.draft_scoring_profile
    : SITE_PROFILE

  const newest = await latestRankYear()
  const seasons = await pageAll<{ id: string; year: number }>(() =>
    db
      .from('seasons')
      .select('id, year')
      .eq('league_id', league.id)
      .not('champion_manager_id', 'is', null)
      .gte('year', FIRST_RANK_YEAR)
      .lte('year', newest)
      .order('year')
  )
  // A league that exists but has not played enough yet returns an EMPTY pool
  // rather than null, so the caller can say what is actually missing. Null is
  // reserved for "no league on this site goes by that name", and answering a
  // one-season league with that would be a lie about its own slug.
  const emptyPool: Pool = {
    label: league.name,
    sublabel: 'League history',
    leagueSlug: slug,
    profile,
    years: seasons.map((s) => s.year),
    players: [],
    managerNames: [],
  }
  if (seasons.length < 2) return emptyPool

  const seasonIds = seasons.map((s) => s.id)
  const yearBySeason = new Map(seasons.map((s) => [s.id, s.year]))

  const [nameById, draftRows] = await Promise.all([
    loadManagerNames(db, [league.id]),
    pageAll<{ id: string; season_id: string; external_id: string | null }>(() =>
      db.from('drafts').select('id, season_id, external_id').in('season_id', seasonIds).order('id')
    ),
  ])

  const pickRows =
    draftRows.length > 0
      ? await pageAll<{ draft_id: string; player_name: string | null; position: string | null }>(() =>
          db
            .from('draft_picks')
            .select('draft_id, player_name, position')
            .in('draft_id', draftRows.map((d) => d.id))
            .order('id')
        )
      : []

  const lineupRows = await pageAll<{ season_id: string; player_name: string | null; position: string | null }>(
    () =>
      db
        .from('weekly_lineups')
        .select('season_id, player_name, position')
        .in('season_id', seasonIds)
        .order('id')
  )

  // One draft per season, by the shared rule. pams 2019 carries both a
  // curated upload and an NFL.com scrape, and counting both would say a
  // player was rostered in a season twice — harmless here, but the same
  // canonical rule everywhere is cheaper than reasoning about where it
  // stops mattering.
  const pickCount = new Map<string, number>()
  for (const row of pickRows) pickCount.set(row.draft_id, (pickCount.get(row.draft_id) ?? 0) + 1)
  const canonical = canonicalDraftIds(draftRows, pickCount)
  const seasonByDraft = new Map(draftRows.map((d) => [d.id, d.season_id]))

  // normalised player name -> the seasons he was rostered, and his name
  const rostered = new Map<string, Rostered>()
  const note = (year: number | undefined, name: string | null) => {
    if (!year || !name) return
    const key = normPlayerName(name)
    if (!key) return
    const hit = rostered.get(key)
    if (hit) hit.years.add(year)
    else rostered.set(key, { years: new Set([year]), display: name.trim() })
  }
  for (const row of pickRows) {
    if (!canonical.has(row.draft_id)) continue
    note(yearBySeason.get(seasonByDraft.get(row.draft_id) ?? ''), row.player_name)
  }
  for (const row of lineupRows) note(yearBySeason.get(row.season_id), row.player_name)
  // Seasons on the books but neither a draft nor a lineup behind them. Same
  // reasoning as above: the league is real, it just has nothing to deal.
  if (rostered.size === 0) return emptyPool

  const ranksByYear = new Map<number, RankLookup>()
  for (const season of seasons) {
    ranksByYear.set(season.year, await getRankLookup(profile, season.year))
  }

  const players = collectPlayers(rostered, ranksByYear, seasons.map((s) => s.year))

  return {
    label: league.name,
    sublabel: 'League history',
    leagueSlug: slug,
    profile,
    years: seasons.map((s) => s.year),
    players,
    managerNames: [...nameById.values()].filter(Boolean),
  }
}

/** Joins the rostered-years map to the rank files. Shared by both pools. */
function collectPlayers(
  rostered: Map<string, Rostered>,
  ranksByYear: Map<number, RankLookup>,
  years: number[]
): PoolPlayer[] {
  const out: PoolPlayer[] = []
  for (const [key, { years: yearSet, display }] of rostered) {
    const seasons: MvTimeline[] = []
    let pos: MvPosition | null = null
    let playerId: string | null = null
    for (const year of years) {
      if (!yearSet.has(year)) continue
      const entry = ranksByYear.get(year)?.get(key)
      if (!entry) continue
      const p = (entry.position ?? '').toUpperCase()
      if (!SCORABLE.has(p)) continue
      // A player's position is whatever the rank files last called him. Taken
      // from the most recent scorable season rather than the first, so anyone
      // who changed designation is filed where a reader would look for him.
      pos = p as MvPosition
      playerId = entry.playerId
      seasons.push({
        year,
        ppg: Math.round(entry.ppg * 10) / 10,
        gp: entry.gp,
        posRank: entry.posRank,
      })
    }
    // Partial seasons stay in. A four-game year at 16 PPG is a real per-game
    // rate, and in a game whose premise is that this season went differently,
    // "he didn't get hurt in this one" is the premise rather than a bug. They
    // are 3% of pams player-seasons, so they read as flavour, not noise.
    if (!pos || seasons.length < TIMELINES_SHORT || !display) continue
    out.push({ name: display, pos, playerId, seasons, mean: meanOf(seasons) })
  }
  return out
}

// ============================================================
// The demo pool
// ============================================================
//
// Off the static demo tree rather than the database, so the game is playable
// by someone who has never signed in. The demo carries drafts for seven
// seasons, which is all this game needs — unlike The Gauntlet and the
// Over/Under it never asks about a week-by-week schedule, because its
// opponents are drafted rather than remembered.

const DEMO_DIR = path.join(process.cwd(), 'public', 'demo', 'data')
const DEMO_PROFILE: ScoringProfile = 'ppr_6pt'

type DemoDraftFile = {
  year: number
  picks: Array<{ player_name: string | null; position: string | null; manager_name: string | null }>
}

async function buildDemoPool(): Promise<Pool | null> {
  let files: string[]
  try {
    files = (await fs.readdir(path.join(DEMO_DIR, 'drafts'))).filter((f) => f.endsWith('.json'))
  } catch {
    return null
  }
  if (files.length < 2) return null

  const rostered = new Map<string, Rostered>()
  const managerNames = new Set<string>()
  const years: number[] = []
  for (const file of files) {
    let parsed: DemoDraftFile
    try {
      parsed = JSON.parse(await fs.readFile(path.join(DEMO_DIR, 'drafts', file), 'utf8'))
    } catch {
      continue
    }
    if (!parsed?.year || !Array.isArray(parsed.picks)) continue
    years.push(parsed.year)
    for (const pick of parsed.picks) {
      if (pick.manager_name) managerNames.add(pick.manager_name)
      const key = normPlayerName(pick.player_name)
      if (!key || !pick.player_name) continue
      const hit = rostered.get(key)
      if (hit) hit.years.add(parsed.year)
      else rostered.set(key, { years: new Set([parsed.year]), display: pick.player_name.trim() })
    }
  }
  if (years.length < 2) return null
  years.sort((a, b) => a - b)

  const ranksByYear = new Map<number, RankLookup>()
  for (const year of years) ranksByYear.set(year, await getRankLookup(DEMO_PROFILE, year))

  return {
    label: DEMO_POOL_LABEL,
    sublabel: 'The demo league',
    leagueSlug: null,
    profile: DEMO_PROFILE,
    years,
    players: collectPlayers(rostered, ranksByYear, years),
    managerNames: [...managerNames],
  }
}

async function loadPool(poolId: string): Promise<Pool | null> {
  const newest = await latestRankYear()
  return unstable_cache(
    async () => (poolId === DEMO_POOL_ID ? buildDemoPool() : buildLeaguePool(poolId)),
    // v3: PoolPlayer gained `mean`, which the tier windows read. A cached v2
    // pool would come back without it and sort the whole board on NaN.
    ['minigame-multiverse-pool', 'v3', String(newest), poolId],
    { tags: ['minigame-pool'], revalidate: 60 * 60 * 12 }
  )()
}

// ============================================================
// Dealing
// ============================================================

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

/**
 * Turns a pool player into a dealt card: `count` of his seasons, in an order
 * that is itself random.
 *
 * The shuffle is not decoration. The array position is the universe index, so
 * leaving the seasons in calendar order would mean a card's best year sat in
 * a predictable slot, and after two games anybody would notice.
 */
const meanOf = (t: MvTimeline[]) => t.reduce((a, s) => a + s.ppg, 0) / t.length

/** A player's best `count` seasons — the most any dealt card of him can be
    worth, and therefore the test of whether he can clear his minimum at all. */
function bestCombination(player: PoolPlayer, count: number): MvTimeline[] {
  return player.seasons
    .slice()
    .sort((a, b) => b.ppg - a.ppg)
    .slice(0, count)
}

function makeCard(player: PoolPlayer, count: number, rng: () => number, key: string): MvCard {
  // Resample until the dealt seasons clear the position's minimum. Roughly
  // one triple in ten comes up short on pams, and the alternative to
  // resampling is either dropping the player (which would quietly cut the
  // volatile cards this game is built around — they are the ones most likely
  // to draw a bad set) or shipping the dud. The pool is pre-filtered so that
  // a qualifying combination exists for everyone in it, and the fallback is
  // that combination, so this always terminates.
  let timelines: MvTimeline[] | null = null
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = shuffle(player.seasons, rng).slice(0, count)
    if (meanOf(candidate) >= MIN_MEAN_PPG[player.pos]) {
      timelines = candidate
      break
    }
  }
  // Shuffled even in the fallback: the array position is the universe index,
  // and handing back a set ordered by points would put every fallback card's
  // best year in universe one.
  if (!timelines) timelines = shuffle(bestCombination(player, count), rng)

  const ppgs = timelines.map((t) => t.ppg)
  return {
    key,
    name: player.name,
    pos: player.pos,
    playerId: player.playerId,
    timelines,
    mean: Math.round(meanOf(timelines) * 10) / 10,
    spread: Math.round((Math.max(...ppgs) - Math.min(...ppgs)) * 10) / 10,
  }
}

/**
 * Seven rounds of five, each round carrying one of every position plus a
 * wildcard.
 *
 * The wildcard is the only card whose position is free, and the other four
 * exist to make the board impossible to get stuck on. Slots are filled by the
 * player rather than by the round, so a board that dealt positions at random
 * could run seven rounds without a single tight end and leave a slot that
 * cannot legally be filled. Guaranteeing one of each also happens to be the
 * best version of the decision: every round is a genuine cross-position
 * choice rather than a list of four running backs.
 *
 * Nobody appears twice on one board. Two cards of the same man would carry
 * different timelines, which reads as a bug even though it is the premise.
 */
function dealRounds(
  byPosition: Map<MvPosition, PoolPlayer[]>,
  everyone: PoolPlayer[],
  count: number,
  rng: () => number
): MvRound[] {
  const used = new Set<string>()
  const rounds: MvRound[] = []

  /**
   * The slice of a ranked list this round draws from.
   *
   * Without this the board was flat: round one dealt the same quality as
   * round seven, and the first pick of the game was a choice between four
   * replacement-level players. A draft descends, so this descends — but it
   * descends towards a TARGET RATE off TIER_CURVE rather than by cutting the
   * list into equal parts, which is what kept the late rounds playable.
   *
   * The window is centred on the first player at or below the round's target
   * and clamped to the ends, so the top of the pool is always reachable in
   * round one and the bottom is never the whole of round seven. Windows
   * overlap, which is where the "how is he still here" pick comes from.
   */
  const window = (list: PoolPlayer[], round: number): PoolPlayer[] => {
    const size = TIER_SIZES[round] ?? TIER_SIZES[TIER_SIZES.length - 1]
    if (size >= list.length) return list
    // A near-top rather than the single best card, so one outlier season
    // cannot drag the whole curve up behind it.
    const hi = list[Math.floor(0.04 * list.length)].mean
    const lo = list[list.length - 1].mean
    const target = lo + (hi - lo) * (TIER_CURVE[round] ?? 0.34)
    let idx = list.findIndex((p) => p.mean <= target)
    if (idx < 0) idx = list.length - 1
    const start = Math.max(0, Math.min(list.length - size, idx - Math.floor(size / 2)))
    return list.slice(start, start + size)
  }

  const takeFrom = (list: PoolPlayer[]): PoolPlayer | null => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const cand = list[Math.floor(rng() * list.length)]
      if (cand && !used.has(cand.name)) {
        used.add(cand.name)
        return cand
      }
    }
    return list.find((p) => !used.has(p.name)) ?? null
  }

  for (let round = 0; round < ROUNDS; round++) {
    const picked: PoolPlayer[] = []
    for (const pos of POSITIONS) {
      const p = takeFrom(window(byPosition.get(pos) ?? [], round))
      if (p) picked.push(p)
    }
    // The wildcard: a second card at ONE position, drawn from that
    // position's own tier. It used to come off a single all-positions list,
    // which sounds neutral and is not — quarterbacks outscore everyone, so
    // the top of that list is nothing but quarterbacks and round one dealt
    // two of them almost every time.
    while (picked.length < CARDS_PER_ROUND) {
      const pos = POSITIONS[Math.floor(rng() * POSITIONS.length)]
      const p = takeFrom(window(byPosition.get(pos) ?? everyone, round))
      if (!p) break
      picked.push(p)
    }
    rounds.push({
      round: round + 1,
      tier: TIER_NOTES[round] ?? `Round ${round + 1}`,
      cards: shuffle(picked, rng).map((p, i) => makeCard(p, count, rng, `r${round + 1}-${i}`)),
    })
  }
  return rounds
}

/** Average PPG at each position across the pool, for the bots' valuation. */
function baselines(players: PoolPlayer[]): Record<MvPosition, number> {
  const sums = {} as Record<MvPosition, number>
  const counts = {} as Record<MvPosition, number>
  for (const p of players) {
    sums[p.pos] = (sums[p.pos] ?? 0) + p.mean
    counts[p.pos] = (counts[p.pos] ?? 0) + 1
  }
  const out = {} as Record<MvPosition, number>
  for (const pos of POSITIONS) out[pos] = counts[pos] ? sums[pos] / counts[pos] : 0
  return out
}

/**
 * One opponent's seven, drafted off the same pool from the same shape of
 * board the player gets.
 *
 * `noise` is how much this one wanders off the best available card, and it is
 * what spreads the slate: a fourteen-week schedule of identically-optimal
 * bots would be fourteen identical weeks. Drafting them through real rounds
 * rather than by skimming the pool's best players is what keeps them at a
 * human scale — a bot allowed to take the top card at every position would
 * put up numbers no dealt board can reach.
 */
function draftOpponent(
  byPosition: Map<MvPosition, PoolPlayer[]>,
  everyone: PoolPlayer[],
  count: number,
  base: Record<MvPosition, number>,
  noise: number,
  rng: () => number
): MvCard[] {
  const rounds = dealRounds(byPosition, everyone, count, rng)
  const filled: (MvCard | null)[] = new Array(SLOTS.length).fill(null)

  for (const round of rounds) {
    const open = SLOTS.map((_, i) => i).filter((i) => filled[i] === null)
    const legal = round.cards.filter((c) => open.some((i) => SLOTS[i].accepts.includes(c.pos)))
    if (legal.length === 0) continue
    let best = legal[0]
    let bestVal = -Infinity
    for (const card of legal) {
      const val = card.mean - base[card.pos] + (rng() - 0.5) * noise
      if (val > bestVal) {
        bestVal = val
        best = card
      }
    }
    // Most restrictive legal slot first, so the flex stays open for as long
    // as it can. A bot that spends FLEX on its first running back ends up
    // unable to use a better one later, which makes the slate softer than it
    // should be for reasons that have nothing to do with the draft.
    const slot = open
      .filter((i) => SLOTS[i].accepts.includes(best.pos))
      .sort((a, b) => SLOTS[a].accepts.length - SLOTS[b].accepts.length)[0]
    filled[slot] = best
  }
  return filled.filter((c): c is MvCard => c !== null)
}

/**
 * How far a bot wanders, by week.
 *
 * Ordered deliberately rather than drawn at random: the slate climbs from
 * soft to hard across the fourteen weeks, so a draft that only beats bad
 * teams shows up as a collapse in November rather than as a shrug.
 *
 * Calibrated on pams over 3,000 seasons per ladder, against the tiered board
 * dealRounds actually deals — an earlier ladder tuned against a flat board
 * left a competent drafter at 57.6%, because tiering lifts everyone's floor
 * and the bots have to climb with it.
 *
 * Re-verified after the position minimums and the tighter tiers went in:
 * both lift every team's floor (the slate moved from 91.5 to 98.4 paper PPG)
 * but they lift the bots by the same amount, so the ladder held.
 *
 * At this setting a competent drafter (take the best card measured against
 * its position's average) goes 7.5-6.5 and reaches the postseason 50.1% of
 * the time, a sloppy one 6.6-7.4 and 36.6%, a careless one 5.5-8.5 and
 * 23.8%, and somebody clicking at random 2.9-11.1 and 3.5%. Eight wins is
 * meant to be a real bar, and it lands as almost exactly a coin flip for
 * somebody playing properly.
 */
const OPPONENT_NOISE = [7, 6, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5, 0.25, 0]

/**
 * How many teams each postseason round is the best of.
 *
 * The shape matters as much as the total. A postseason where every round is
 * equally hard is three coin flips in a row, and three coin flips is a wall
 * rather than a run — nobody feels themselves getting deeper into anything.
 * So the rounds are meant to get progressively harder: the quarter-final is a
 * side you should usually beat, and the final is the hardest team the dealer
 * can build out of this league.
 *
 * Best-of is the whole mechanism. One draft is the best team on ONE board and
 * a board is a random deal; the best of eighty is near the top of what the
 * pool can produce. Nothing the player sees changes, and no number is faked —
 * these are all teams that could have been drafted.
 *
 * Measured on the demo pool over 800 dealt seasons, for a drafter taking the
 * best card against its position's average:
 *
 *      make the postseason   40.8%
 *      win the quarter-final 55.2%   →  22.5% of all runs
 *      win the semi-final    28.9%   →   6.5%
 *      win the final         23.1%   →   1.5%,  a title every 67 runs
 *
 * The final resists going much below that: best-of climbs with the log of the
 * field, so eighty to two hundred is worth about a point of paper. It is also
 * fighting a selection effect — a side that has won two knockouts is a good
 * side — which is why the last round reads easier than the arithmetic
 * suggests it should.
 */
const PLAYOFF_FIELD = [1, 12, 80]

export async function dealMultiverse(
  poolParam: string,
  seedParam: string | null
): Promise<MultiverseDeal | MultiverseError> {
  const poolId = (poolParam ?? '').trim().toLowerCase()
  const seed = normalizeSeed(seedParam) ?? newSeed()

  if (!poolId) {
    return { ok: false, status: 400, error: 'Pick a league to play.' }
  }
  // One league at a time. A card is "this man, in the seasons YOUR league
  // rostered him", which is not a thing that spans two leagues.
  if (poolId === 'site' || poolId.includes(',')) {
    return {
      ok: false,
      status: 400,
      error:
        'The Multiverse Draft is played one league at a time. A card is a player across the seasons your league rostered him.',
    }
  }
  if (poolId !== DEMO_POOL_ID && !/^[a-z0-9-]{1,80}$/.test(poolId)) {
    return { ok: false, status: 404, error: 'No league on this site goes by that name.' }
  }

  const pool = await loadPool(poolId)
  if (!pool) {
    return { ok: false, status: 404, error: 'No league on this site goes by that name.' }
  }
  if (pool.years.length < 2) {
    return {
      ok: false,
      status: 409,
      error:
        'This game needs at least two completed seasons, because a card is one player across several of them.',
    }
  }

  const count = pool.years.length >= FULL_HISTORY_SEASONS ? TIMELINES : TIMELINES_SHORT

  // Ranked best-first, which is what makes the round windows in dealRounds
  // mean anything. The ranking is a player's average across ALL the seasons
  // this league had him, not across the three he happens to get dealt — a
  // card's dealt seasons are the luck of one board, and the board should
  // descend by talent rather than by that.
  const eligible = pool.players
    .filter((p) => p.seasons.length >= count)
    // A player is only in the pool if SOME set of `count` of his seasons
    // clears his position's minimum. Tested on his best combination, so a
    // volatile card stays in on the strength of his good years and simply
    // gets resampled when the deal hands him a bad set — see makeCard.
    .filter((p) => meanOf(bestCombination(p, count)) >= MIN_MEAN_PPG[p.pos])
    .sort((a, b) => b.mean - a.mean)

  const byPosition = new Map<MvPosition, PoolPlayer[]>()
  for (const pos of POSITIONS) {
    byPosition.set(
      pos,
      eligible.filter((p) => p.pos === pos)
    )
  }
  const thin = POSITIONS.filter((pos) => (byPosition.get(pos) ?? []).length < MIN_PER_POSITION)
  if (thin.length > 0) {
    return {
      ok: false,
      status: 409,
      error:
        `Not enough of this league's history repeats itself yet. Too few ${thin.join('/')} ` +
        `have played ${count} of its seasons and scored enough to be worth a card. ` +
        `Come back when there is another year on the books.`,
    }
  }

  const rng = makeRng(seed)
  const rounds = dealRounds(byPosition, eligible, count, rng)

  // The dice, one row per slot. Dealt before anybody drafts, which is what
  // makes the season reproducible from the seed for whoever opens the link.
  const rolls: number[][] = []
  for (let slot = 0; slot < SLOTS.length; slot++) {
    const row: number[] = []
    for (let week = 0; week < WEEKS; week++) row.push(Math.floor(rng() * count))
    rolls.push(row)
  }

  const base = baselines(eligible)
  const names = pool.managerNames.length > 0 ? shuffle(pool.managerNames, rng) : []
  const schedule: MvOpponent[] = []
  for (let week = 0; week < WEEKS; week++) {
    const roster = draftOpponent(byPosition, eligible, count, base, OPPONENT_NOISE[week], rng)
    let score = 0
    const fired: number[] = []
    for (const card of roster) {
      const idx = Math.floor(rng() * card.timelines.length)
      fired.push(idx)
      score += card.timelines[idx]?.ppg ?? 0
    }
    const ppg = roster.reduce((a, c) => a + c.mean, 0)
    schedule.push({
      week: week + 1,
      // Real names off the league, cycled when there are fewer managers than
      // weeks — which is every league, and reads correctly: you play the
      // room roughly twice, the way a season actually goes.
      name: names.length > 0 ? names[week % names.length] : `Team ${week + 1}`,
      teamName: null,
      ppg: Math.round(ppg * 10) / 10,
      score: Math.round(score * 10) / 10,
      roster,
      fired,
    })
  }

  // ── The postseason ────────────────────────────────────────
  //
  // Dealt whether or not it is reached, so that reaching it costs no second
  // request and a shared seed carries the same January as the season it
  // belongs to.
  const keep = playoffKeep(count)
  const playoffRolls: number[][] = []
  for (let slot = 0; slot < SLOTS.length; slot++) {
    const row: number[] = []
    for (let r = 0; r < PLAYOFF_ROUNDS; r++) row.push(Math.floor(rng() * keep))
    playoffRolls.push(row)
  }

  const playoffOpponents: MvOpponent[] = []
  for (let r = 0; r < PLAYOFF_ROUNDS; r++) {
    // The strongest team the league can put out, which is what the banner has
    // always told the player it is.
    //
    // A single noise-0 bot is only the best team on ONE board, and a board is
    // a random deal. Drafting several and keeping the best paper team is what
    // "the field left" actually means: these are the sides that survived a
    // fourteen-week season, so they should be the top of a distribution
    // rather than one draw from it. The number climbs each round, so the
    // final is the hardest team the dealer can build.
    //
    // This is also the balance lever for the title. A run that reaches
    // January is already a strong team by selection, and against one draw it
    // won every round about 61% of the time — three of those is a ring every
    // twelve runs, which makes the one thing the game is played for routine.
    // See PLAYOFF_FIELD.
    const tries = PLAYOFF_FIELD[r] ?? 1
    let roster = draftOpponent(byPosition, eligible, count, base, r === 0 ? 1.5 : 0, rng)
    let bestPaper = roster.reduce((a, c) => a + meanOf(bestTimelines(c, keep)), 0)
    for (let t = 1; t < tries; t++) {
      const cand = draftOpponent(byPosition, eligible, count, base, 0, rng)
      // Measured on the seasons they will actually play, not on all three.
      const paper = cand.reduce((a, c) => a + meanOf(bestTimelines(c, keep)), 0)
      if (paper > bestPaper) {
        bestPaper = paper
        roster = cand
      }
    }
    let score = 0
    const fired: number[] = []
    for (const card of roster) {
      const kept = bestTimelines(card, keep)
      const idx = Math.floor(rng() * kept.length)
      fired.push(idx)
      score += kept[idx]?.ppg ?? 0
    }
    playoffOpponents.push({
      week: WEEKS + r + 1,
      name: names.length > 0 ? names[(WEEKS + r) % names.length] : `Seed ${r + 1}`,
      teamName: null,
      // Their paper number is also off their kept seasons, so the slate a
      // player reads in January is on the same footing as their own team.
      ppg:
        Math.round(
          roster.reduce((a, c) => a + meanOf(bestTimelines(c, keep)), 0) * 10
        ) / 10,
      score: Math.round(score * 10) / 10,
      roster,
      fired,
    })
  }

  // Weakest first, so the bracket climbs.
  //
  // Best-of-6, best-of-14 and best-of-30 are three INDEPENDENT draws, and a
  // best-of-14 lands under a best-of-6 often enough to be noticed — which put
  // the softest team of the three in the final about a fifth of the time and
  // made the bracket read as three arbitrary sides rather than a field
  // narrowing. Sorting fixes the order without touching the teams; the round
  // number and the manager's name are assigned after the sort, so the
  // quarter-final is always the one you have the best chance against.
  playoffOpponents.sort((a, b) => a.ppg - b.ppg)
  playoffOpponents.forEach((opp, r) => {
    opp.week = WEEKS + r + 1
    opp.name = names.length > 0 ? names[(WEEKS + r) % names.length] : `Seed ${r + 1}`
  })

  return {
    ok: true,
    seed,
    pool: { id: poolId, label: pool.label, sublabel: pool.sublabel, leagueSlug: pool.leagueSlug },
    profile: pool.profile,
    years: pool.years,
    timelines: count,
    rounds,
    rolls,
    schedule,
    playoffs: { keep, rolls: playoffRolls, opponents: playoffOpponents },
  }
}
