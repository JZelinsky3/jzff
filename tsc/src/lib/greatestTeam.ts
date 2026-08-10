// The greatest team in PA Milk Society history, settled by bracket.
//
// Eighty-six team-seasons exist across 2019-2025. The sixteen best resumes get
// in, and nothing else does: no automatic bids, no seat held for a title. All
// seven champions clear the bar on their own. First team out is 2024 Cat.
//
// The field is FROZEN here rather than computed at read time, and that is the
// point. A bracket whose seeds could move after somebody has already voted in
// round one is not a bracket. The numbers below were drawn from the matchup
// table (see resume() for the formula) on 2026-08-07 and are final for this
// edition.

export const EDITION = 2026
/** How many managers the room expects, so a round can report "9 of 12 in". */
export const ROOM_SIZE = 12
/**
 * Starts a player needs to claim one of the six fixed lineup slots. Enough that
 * the slot describes the season rather than a hot month.
 *
 * Hard floor: a fixed slot with nobody above it renders EMPTY rather than
 * reaching down for a three-game rental, because "never settled on a
 * quarterback" is the true and more interesting statement. Two slots in the
 * field come out empty that way. The flex is exempt, since a flex genuinely is
 * a rotating spot.
 */
export const MIN_STARTS = 6

/**
 * What an average STARTED player at each position puts up in a week in this
 * league, across 2019-2025. Used to decide whether a bench player was worth
 * mentioning: a flat points-per-game bar would fill every card with backup
 * quarterbacks, who out-score skill positions by construction.
 */
export const POSITION_PAR: Readonly<Record<string, number>> = {
  QB: 22, WR: 13.1, RB: 13, TE: 10, K: 8, DEF: 8,
}

export type Finish = 'champion' | 'runner-up' | 'rank'

export type GoatTeam = {
  seed: number
  year: number
  /** managers.id, so identity survives a display-name change. */
  managerId: string
  /** The name the league uses, which is not always the platform's. */
  manager: string
  team: string
  wins: number
  losses: number
  ties: number
  /** Points per game across the regular season and the real bracket games. */
  ppg: number
  /**
   * That PPG over the league average of the same season. 2019 and 2020 were
   * thirteen-game years in a lower-scoring league, so raw points cannot
   * compare across eras and this is what the seeding actually uses.
   *
   * Both ppg and the average behind it count the regular season PLUS the real
   * bracket games. Consolation and placement games are excluded outright: they
   * decide nothing, and counting them would let a team pad its average in games
   * it had already been eliminated from. The bracket is traced backwards from
   * the flagged championship game, so only rounds with the title still live are
   * in.
   */
  index: number
  /** The 0-100 seeding number. See resume(). */
  resume: number
  finish: Finish
  finalRank: number
  regularRank: number
  /** Best and worst single regular-season week. */
  high: number
  low: number
  /** Longest regular-season win streak. */
  streak: number
  /** Where this team finished that season in points, and out of how many. */
  ppgRank: number
  seasonTeams: number
  /** Where its scoring index ranks among all 86 team-seasons since 2019. */
  indexRank: number
  /** Where each part of the seed score ranks inside this sixteen. */
  recRank: number
  scoRank: number
  postRank: number
  /**
   * The argument, in one line. Deliberately about what the lineup below CANNOT
   * show: bench pieces, and the kickers and defences that never appear in the
   * seven skill slots.
   *
   * A bench player earns a mention by rate, not by the points this team happened
   * to bank from him: twelve a game over at least four games, or a hundred points
   * across the season. Counting only the weeks he was started undervalued exactly
   * the players worth mentioning (2019 Mason's Terry McLaurin scored 113 across
   * ten weeks but only 44 of them in a starting slot).
   *
   * Where a team HAS no depth, the line says so and may name the best cameo with
   * its sample attached — 2019 Joey's two-week Davante Adams is more honest than
   * promoting a four-week defence just because it cleared the floor.
   *
   * The line also has to match the seed. A thin bench in 2019 is a fact about a
   * fourteen-team league, not a fault of the team that had it, and writing the
   * top seed's card as a list of what it lacked argues the opposite of what the
   * seeding says.
   */
  case: string
  /**
   * The team, as a starting lineup rather than a list. Seven skill slots in
   * the shape the league actually starts (QB, RB, RB, WR, WR, TE, R/W/T),
   * filled by whoever this team banked the most regular-season points from at
   * that position. Kicker and defence are left off: nobody has ever argued
   * about a kicker.
   *
   *   s   slot the player fills
   *   ppg average when THIS team started them, so a mid-season pickup reads
   *       at its real rate instead of being punished for arriving in week 8
   *   g   how many weeks they were actually started
   *
   * A slot needs MIN_STARTS weeks to be claimed. Without that floor a team
   * that rented two different backs for four games each could show whichever
   * one happened to spike, which describes a waiver run rather than the season
   * the team actually played. Where nobody at a position clears the floor the
   * best available is kept anyway and the low start count says so itself.
   *   rk  where that player finished the season at their position, ranked
   *       among every player rostered anywhere in the league that year under
   *       the league's own scoring. Null if they were never ranked.
   */
  lineup: { s: string; n: string | null; p: string; ppg: number; g: number; rk: string | null }[]
}

/**
 * What a finish is worth. Six teams make the playoffs, so the first six places
 * are graded and everybody who missed gets nothing.
 *
 * Graded rather than flat because a flat "made the playoffs" bonus had third
 * place and seventh place worth the same, which is not a thing anybody in the
 * league believes. A title is still worth nearly double the next best finish.
 */
const PLACEMENT: readonly number[] = [0, 20, 12, 9, 7, 5, 4]

export function placementPoints(finalRank: number): number {
  return PLACEMENT[finalRank] ?? 0
}

/**
 * The seeding number: forty-three parts record, thirty-seven parts scoring,
 * twenty parts where the season finished.
 *
 * The scoring term is clamped to the 0.85-1.25 index band, which is where
 * every team-season in league history actually lands.
 */
export function resume(t: { wins: number; losses: number; ties: number; index: number; finalRank: number }): number {
  const games = t.wins + t.losses + t.ties
  const winRate = games ? (t.wins + 0.5 * t.ties) / games : 0
  const scoring = Math.max(0, Math.min(1, (t.index - 0.85) / 0.4))
  return 43 * winRate + 37 * scoring + placementPoints(t.finalRank)
}

export const FIELD: readonly GoatTeam[] = [
  { seed: 1, year: 2019, managerId: '196e3501-8cec-49b4-a09b-17771bc997f1', manager: 'Joey', team: 'On Jah', wins: 9, losses: 4, ties: 0, ppg: 137.3, index: 1.184, resume: 80.7, finish: 'champion', finalRank: 1, regularRank: 2, high: 191.8, low: 78.6, streak: 5, ppgRank: 2, seasonTeams: 14, indexRank: 2, recRank: 11, scoRank: 2, postRank: 1,
    case: 'Picked up Davante Adams for the stretch and got 22.4 a game out of four starts, then added Terry McLaurin for the playoff run and started him in the final. Started 2-2, went 7-2 the rest of the way, then won both playoff games to take the first title there has ever been.',
    lineup: [
      { s: 'QB', n: 'Lamar Jackson', p: 'QB', ppg: 33, g: 14, rk: 'QB1' },
      { s: 'RB', n: 'Derrick Henry', p: 'RB', ppg: 17.8, g: 13, rk: 'RB7' },
      { s: 'RB', n: 'Austin Ekeler', p: 'RB', ppg: 16.4, g: 12, rk: 'RB4' },
      { s: 'WR', n: 'Sammy Watkins', p: 'WR', ppg: 12.9, g: 8, rk: 'WR39' },
      { s: 'WR', n: 'JuJu Smith-Schuster', p: 'WR', ppg: 12.2, g: 8, rk: 'WR49' },
      { s: 'TE', n: 'Darren Waller', p: 'TE', ppg: 12.7, g: 11, rk: 'TE5' },
      { s: 'FLEX', n: 'D.J. Chark', p: 'WR', ppg: 13.2, g: 7, rk: 'WR22' },
    ] },
  { seed: 2, year: 2019, managerId: 'eaeedefa-2711-4d93-b0ce-a795c5f4d55a', manager: 'Mason', team: 'Mdog346', wins: 11, losses: 2, ties: 0, ppg: 138.1, index: 1.19, resume: 79.8, finish: 'runner-up', finalRank: 2, regularRank: 1, high: 183.9, low: 111.4, streak: 5, ppgRank: 1, seasonTeams: 14, indexRank: 1, recRank: 2, scoRank: 1, postRank: 8,
    case: 'Ryan Tannehill averaged 27 a game as the backup quarterback and Aaron Jones 22.6 as a spare back, neither of them ever needed. Won eight of nine from week three and was never held under 111 all season.',
    lineup: [
      { s: 'QB', n: 'Dak Prescott', p: 'QB', ppg: 24.9, g: 8, rk: 'QB4' },
      { s: 'RB', n: 'Saquon Barkley', p: 'RB', ppg: 19.4, g: 11, rk: 'RB12' },
      { s: 'RB', n: 'Nick Chubb', p: 'RB', ppg: 17.2, g: 11, rk: 'RB8' },
      { s: 'WR', n: 'Amari Cooper', p: 'WR', ppg: 15.2, g: 14, rk: 'WR10' },
      { s: 'WR', n: 'D.J. Moore', p: 'WR', ppg: 16.3, g: 11, rk: 'WR12' },
      { s: 'TE', n: 'Zach Ertz', p: 'TE', ppg: 13.3, g: 14, rk: 'TE2' },
      { s: 'FLEX', n: 'Julio Jones', p: 'WR', ppg: 20.4, g: 7, rk: 'WR4' },
    ] },
  { seed: 3, year: 2021, managerId: 'dca75bbf-9c3e-4576-b6c4-845e6dc20030', manager: 'Chris', team: 'Stafford University', wins: 10, losses: 4, ties: 0, ppg: 140.4, index: 1.153, resume: 78.7, finish: 'champion', finalRank: 1, regularRank: 1, high: 200.6, low: 81.2, streak: 5, ppgRank: 2, seasonTeams: 12, indexRank: 5, recRank: 4, scoRank: 5, postRank: 1,
    case: 'Damien Harris gave 13.8 a game across fourteen weeks as the fourth back. Lost its first two, then won seven of the next nine.',
    lineup: [
      { s: 'QB', n: 'Matthew Stafford', p: 'QB', ppg: 24.6, g: 15, rk: 'QB6' },
      { s: 'RB', n: 'Ezekiel Elliott', p: 'RB', ppg: 15.1, g: 15, rk: 'RB6' },
      { s: 'RB', n: 'D\'Andre Swift', p: 'RB', ppg: 16.2, g: 12, rk: 'RB17' },
      { s: 'WR', n: 'Davante Adams', p: 'WR', ppg: 22.6, g: 14, rk: 'WR2' },
      { s: 'WR', n: 'Diontae Johnson', p: 'WR', ppg: 18, g: 14, rk: 'WR8' },
      { s: 'TE', n: 'Mark Andrews', p: 'TE', ppg: 16.6, g: 15, rk: 'TE1' },
      { s: 'FLEX', n: 'James Conner', p: 'RB', ppg: 20.3, g: 5, rk: 'RB7' },
    ] },
  { seed: 4, year: 2025, managerId: 'eaeedefa-2711-4d93-b0ce-a795c5f4d55a', manager: 'Mason', team: 'Rizzlers', wins: 10, losses: 4, ties: 0, ppg: 130.3, index: 1.081, resume: 72.1, finish: 'champion', finalRank: 1, regularRank: 2, high: 164.8, low: 95.4, streak: 7, ppgRank: 3, seasonTeams: 12, indexRank: 17, recRank: 4, scoRank: 9, postRank: 1,
    case: 'Kenny Gainwell averaged 16.8 a game and started three times, with Brandon Aubrey kicking every single week behind him. Won seven straight from week four and eight of nine overall.',
    lineup: [
      { s: 'QB', n: 'Jalen Hurts', p: 'QB', ppg: 21.3, g: 15, rk: 'QB5' },
      { s: 'RB', n: 'Ashton Jeanty', p: 'RB', ppg: 15.2, g: 15, rk: 'RB13' },
      { s: 'RB', n: 'D\'Andre Swift', p: 'RB', ppg: 13.9, g: 12, rk: 'RB15' },
      { s: 'WR', n: 'Puka Nacua', p: 'WR', ppg: 23, g: 14, rk: 'WR1' },
      { s: 'WR', n: 'Stefon Diggs', p: 'WR', ppg: 14.3, g: 11, rk: 'WR14' },
      { s: 'TE', n: 'George Kittle', p: 'TE', ppg: 14.5, g: 9, rk: 'TE10' },
      { s: 'FLEX', n: 'Dallas Goedert', p: 'TE', ppg: 14.4, g: 8, rk: 'TE6' },
    ] },
  { seed: 5, year: 2021, managerId: '196e3501-8cec-49b4-a09b-17771bc997f1', manager: 'Joey', team: 'Oreos', wins: 9, losses: 5, ties: 0, ppg: 142.2, index: 1.168, resume: 69.1, finish: 'runner-up', finalRank: 2, regularRank: 3, high: 189.6, low: 109.4, streak: 6, ppgRank: 1, seasonTeams: 12, indexRank: 3, recRank: 12, scoRank: 3, postRank: 8,
    case: 'Jaylen Waddle at 15.5 a game across fifteen weeks and Terry McLaurin at 15.6, with Elijah Mitchell on 17.8 behind them. Lost five in a row through the middle of the season and still won its last six.',
    lineup: [
      { s: 'QB', n: 'Kirk Cousins', p: 'QB', ppg: 20, g: 10, rk: 'QB13' },
      { s: 'RB', n: 'Austin Ekeler', p: 'RB', ppg: 21, g: 15, rk: 'RB2' },
      { s: 'RB', n: 'Cordarrelle Patterson', p: 'RB', ppg: 13.5, g: 11, rk: 'RB9' },
      { s: 'WR', n: 'Cooper Kupp', p: 'WR', ppg: 25.8, g: 16, rk: 'WR1' },
      { s: 'WR', n: 'Justin Jefferson', p: 'WR', ppg: 19.7, g: 10, rk: 'WR4' },
      { s: 'TE', n: 'Travis Kelce', p: 'TE', ppg: 16.6, g: 15, rk: 'TE2' },
      { s: 'FLEX', n: 'Tyler Lockett', p: 'WR', ppg: 13.8, g: 10, rk: 'WR22' },
    ] },
  { seed: 6, year: 2023, managerId: 'f28186ad-c398-4bf5-a425-e387fa1e03a3', manager: 'Connie', team: 'Milk Man', wins: 8, losses: 6, ties: 0, ppg: 131.8, index: 1.086, resume: 66.4, finish: 'champion', finalRank: 1, regularRank: 3, high: 186, low: 80.1, streak: 4, ppgRank: 2, seasonTeams: 12, indexRank: 15, recRank: 13, scoRank: 8, postRank: 1,
    case: 'Never settled on a quarterback: Dak Prescott and Sam Howell split the year at 23.7 and 23.1 a game and neither of them started six times. Lost five straight mid-season, then won four in a row to climb back in.',
    lineup: [
      { s: 'QB', n: null, p: 'QB', ppg: 0, g: 0, rk: null },
      { s: 'RB', n: 'Travis Etienne', p: 'RB', ppg: 17.4, g: 15, rk: 'RB2' },
      { s: 'RB', n: 'Derrick Henry', p: 'RB', ppg: 15, g: 15, rk: 'RB10' },
      { s: 'WR', n: 'CeeDee Lamb', p: 'WR', ppg: 23.4, g: 15, rk: 'WR1' },
      { s: 'WR', n: 'Deebo Samuel Sr.', p: 'WR', ppg: 16.7, g: 13, rk: 'WR14' },
      { s: 'TE', n: 'George Kittle', p: 'TE', ppg: 12.7, g: 14, rk: 'TE5' },
      { s: 'FLEX', n: 'Calvin Ridley', p: 'WR', ppg: 22.1, g: 3, rk: 'WR25' },
    ] },
  { seed: 7, year: 2022, managerId: '196e3501-8cec-49b4-a09b-17771bc997f1', manager: 'Joey', team: 'Space Mav', wins: 12, losses: 2, ties: 0, ppg: 125.9, index: 1.064, resume: 65.7, finish: 'rank', finalRank: 3, regularRank: 1, high: 170.3, low: 49.5, streak: 6, ppgRank: 3, seasonTeams: 12, indexRank: 21, recRank: 1, scoRank: 12, postRank: 12,
    case: 'Jared Goff averaged 27.8 a game across four appearances as the backup. Opened 8-1 and ripped off six straight from week five.',
    lineup: [
      { s: 'QB', n: 'Lamar Jackson', p: 'QB', ppg: 24.4, g: 11, rk: 'QB9' },
      { s: 'RB', n: 'Saquon Barkley', p: 'RB', ppg: 18.1, g: 14, rk: 'RB5' },
      { s: 'RB', n: 'Kenneth Walker III', p: 'RB', ppg: 16.8, g: 8, rk: 'RB19' },
      { s: 'WR', n: 'Justin Jefferson', p: 'WR', ppg: 22.9, g: 13, rk: 'WR1' },
      { s: 'WR', n: 'Christian Kirk', p: 'WR', ppg: 14.7, g: 12, rk: 'WR13' },
      { s: 'TE', n: 'Zach Ertz', p: 'TE', ppg: 10.4, g: 7, rk: 'TE11' },
      { s: 'FLEX', n: 'CeeDee Lamb', p: 'WR', ppg: 21.3, g: 6, rk: 'WR6' },
    ] },
  { seed: 8, year: 2025, managerId: '6f92aba6-b4b6-4321-bd61-e8af54e54cef', manager: 'Isaac', team: 'CHILD OF GOD', wins: 10, losses: 4, ties: 0, ppg: 139.9, index: 1.161, resume: 64.5, finish: 'rank', finalRank: 5, regularRank: 1, high: 171.3, low: 112.7, streak: 7, ppgRank: 1, seasonTeams: 12, indexRank: 4, recRank: 4, scoRank: 4, postRank: 16,
    case: 'Never settled a second back: De\'Von Achane and Jahmyr Gibbs both passed through at around 20 a game and neither started six times, with Matthew Stafford on 29.7 behind the starter. Opened 7-2, then won seven in a row.',
    lineup: [
      { s: 'QB', n: 'Lamar Jackson', p: 'QB', ppg: 20.5, g: 11, rk: 'QB15' },
      { s: 'RB', n: 'Jonathan Taylor', p: 'RB', ppg: 23.2, g: 14, rk: 'RB3' },
      { s: 'RB', n: null, p: 'RB', ppg: 0, g: 0, rk: null },
      { s: 'WR', n: 'Jaxon Smith-Njigba', p: 'WR', ppg: 22, g: 14, rk: 'WR2' },
      { s: 'WR', n: 'Rashee Rice', p: 'WR', ppg: 18.8, g: 8, rk: 'WR35' },
      { s: 'TE', n: 'Harold Fannin Jr.', p: 'TE', ppg: 9.5, g: 6, rk: 'TE5' },
      { s: 'FLEX', n: 'Christian McCaffrey', p: 'RB', ppg: 22.6, g: 5, rk: 'RB1' },
    ] },
  { seed: 9, year: 2024, managerId: 'ca70f1bc-3bc8-4ab3-af35-3b3ee25c157f', manager: 'Ricci', team: 'OG CARHARTT', wins: 10, losses: 4, ties: 0, ppg: 132.4, index: 1.075, resume: 63.5, finish: 'runner-up', finalRank: 2, regularRank: 2, high: 163.7, low: 93.5, streak: 7, ppgRank: 4, seasonTeams: 12, indexRank: 18, recRank: 4, scoRank: 10, postRank: 8,
    case: 'Tua Tagovailoa averaged 27.4 a game and was never once started. Jauan Jennings gave 15.1 across twelve weeks behind him. Won seven straight from week five and eight of nine from week two.',
    lineup: [
      { s: 'QB', n: 'Jalen Hurts', p: 'QB', ppg: 22.8, g: 14, rk: 'QB7' },
      { s: 'RB', n: 'Bijan Robinson', p: 'RB', ppg: 19.7, g: 15, rk: 'RB3' },
      { s: 'RB', n: 'Chuba Hubbard', p: 'RB', ppg: 17.1, g: 8, rk: 'RB12' },
      { s: 'WR', n: 'Drake London', p: 'WR', ppg: 15.1, g: 15, rk: 'WR10' },
      { s: 'WR', n: 'Jaxon Smith-Njigba', p: 'WR', ppg: 15.7, g: 12, rk: 'WR8' },
      { s: 'TE', n: 'George Kittle', p: 'TE', ppg: 17.1, g: 13, rk: 'TE2' },
      { s: 'FLEX', n: 'Malik Nabers', p: 'WR', ppg: 17.4, g: 8, rk: 'WR6' },
    ] },
  { seed: 10, year: 2020, managerId: 'ca70f1bc-3bc8-4ab3-af35-3b3ee25c157f', manager: 'Ricci', team: 'Huntingforkickers', wins: 7, losses: 6, ties: 0, ppg: 133, index: 1.067, resume: 63.2, finish: 'champion', finalRank: 1, regularRank: 4, high: 145.9, low: 90.8, streak: 2, ppgRank: 4, seasonTeams: 12, indexRank: 20, recRank: 15, scoRank: 11, postRank: 1,
    case: 'Ben Roethlisberger sat on 22.2 a game for fifteen weeks, with Will Fuller at 18.3 and Antonio Gibson at 16.7 behind him. Never won more than two games in a row all season.',
    lineup: [
      { s: 'QB', n: 'Lamar Jackson', p: 'QB', ppg: 25.5, g: 11, rk: 'QB10' },
      { s: 'RB', n: 'Kareem Hunt', p: 'RB', ppg: 12.3, g: 8, rk: 'RB8' },
      { s: 'RB', n: 'David Johnson', p: 'RB', ppg: 12.2, g: 6, rk: 'RB23' },
      { s: 'WR', n: 'Stefon Diggs', p: 'WR', ppg: 20.9, g: 15, rk: 'WR3' },
      { s: 'WR', n: 'JuJu Smith-Schuster', p: 'WR', ppg: 14.1, g: 14, rk: 'WR17' },
      { s: 'TE', n: 'Travis Kelce', p: 'TE', ppg: 20.9, g: 15, rk: 'TE1' },
      { s: 'FLEX', n: 'Brandin Cooks', p: 'WR', ppg: 14.8, g: 7, rk: 'WR28' },
    ] },
  { seed: 11, year: 2023, managerId: '6f92aba6-b4b6-4321-bd61-e8af54e54cef', manager: 'Isaac', team: 'Nathanael Bartholomew', wins: 11, losses: 3, ties: 0, ppg: 125.1, index: 1.031, resume: 62.5, finish: 'runner-up', finalRank: 2, regularRank: 1, high: 174, low: 87.4, streak: 4, ppgRank: 3, seasonTeams: 12, indexRank: 27, recRank: 3, scoRank: 15, postRank: 8,
    case: 'Lamar Jackson at 31.1 a game and C.J. Stroud at 24.5 both cycled through without sticking, with Nico Collins and DeVonta Smith behind them. Opened 7-2 and closed on four straight.',
    lineup: [
      { s: 'QB', n: 'Justin Fields', p: 'QB', ppg: 21.3, g: 6, rk: 'QB14' },
      { s: 'RB', n: 'Breece Hall', p: 'RB', ppg: 23, g: 6, rk: 'RB4' },
      { s: 'RB', n: 'Bijan Robinson', p: 'RB', ppg: 13.1, g: 10, rk: 'RB12' },
      { s: 'WR', n: 'A.J. Brown', p: 'WR', ppg: 22.8, g: 8, rk: 'WR4' },
      { s: 'WR', n: 'Jordan Addison', p: 'WR', ppg: 14.8, g: 9, rk: 'WR22' },
      { s: 'TE', n: 'Mark Andrews', p: 'TE', ppg: 14.6, g: 9, rk: 'TE10' },
      { s: 'FLEX', n: 'Brian Robinson', p: 'RB', ppg: 13.4, g: 7, rk: 'RB21' },
    ] },
  { seed: 12, year: 2024, managerId: '6897f929-c070-4e0e-9633-d9e90794a1c0', manager: 'Sean', team: '3-Star REECHIE', wins: 10, losses: 4, ties: 0, ppg: 137.5, index: 1.117, resume: 62.4, finish: 'rank', finalRank: 4, regularRank: 1, high: 169.8, low: 102.6, streak: 5, ppgRank: 1, seasonTeams: 12, indexRank: 8, recRank: 4, scoRank: 6, postRank: 14,
    case: 'Jordan Addison averaged 15.7 a game across eleven weeks and Malik Nabers 14.1, neither able to hold a slot. Lost its first two, then went 8-1.',
    lineup: [
      { s: 'QB', n: 'Joe Burrow', p: 'QB', ppg: 27.1, g: 14, rk: 'QB2' },
      { s: 'RB', n: 'De\'Von Achane', p: 'RB', ppg: 18.7, g: 14, rk: 'RB5' },
      { s: 'RB', n: 'Joe Mixon', p: 'RB', ppg: 20, g: 11, rk: 'RB13' },
      { s: 'WR', n: 'Ja\'Marr Chase', p: 'WR', ppg: 24.6, g: 14, rk: 'WR1' },
      { s: 'WR', n: 'Chris Olave', p: 'WR', ppg: 8.3, g: 7, rk: 'WR57' },
      { s: 'TE', n: 'Jake Ferguson', p: 'TE', ppg: 9.5, g: 8, rk: 'TE15' },
      { s: 'FLEX', n: 'Kenneth Walker III', p: 'RB', ppg: 19.1, g: 6, rk: 'RB24' },
    ] },
  { seed: 13, year: 2022, managerId: 'c8db587f-7936-4cd7-a4d7-a3efa9edbe4c', manager: 'Kyle', team: 'Wyle Wiverd', wins: 10, losses: 4, ties: 0, ppg: 131.5, index: 1.111, resume: 61.9, finish: 'rank', finalRank: 4, regularRank: 2, high: 170.9, low: 100.1, streak: 4, ppgRank: 1, seasonTeams: 12, indexRank: 11, recRank: 4, scoRank: 7, postRank: 14,
    case: 'DK Metcalf averaged 16 a game and started six times and is still only the spare receiver here. Opened 7-2 and won four straight from week five.',
    lineup: [
      { s: 'QB', n: 'Josh Allen', p: 'QB', ppg: 28.1, g: 14, rk: 'QB2' },
      { s: 'RB', n: 'Derrick Henry', p: 'RB', ppg: 18.9, g: 14, rk: 'RB4' },
      { s: 'RB', n: 'Josh Jacobs', p: 'RB', ppg: 20, g: 12, rk: 'RB3' },
      { s: 'WR', n: 'A.J. Brown', p: 'WR', ppg: 16.8, g: 12, rk: 'WR5' },
      { s: 'WR', n: 'Diontae Johnson', p: 'WR', ppg: 11, g: 10, rk: 'WR28' },
      { s: 'TE', n: 'Pat Freiermuth', p: 'TE', ppg: 10.9, g: 13, rk: 'TE5' },
      { s: 'FLEX', n: 'Dameon Pierce', p: 'RB', ppg: 15.1, g: 7, rk: 'RB24' },
    ] },
  { seed: 14, year: 2022, managerId: '6f92aba6-b4b6-4321-bd61-e8af54e54cef', manager: 'Isaac', team: 'Pat Bateman', wins: 7, losses: 7, ties: 0, ppg: 125.7, index: 1.062, resume: 61.1, finish: 'champion', finalRank: 1, regularRank: 5, high: 166.4, low: 80.2, streak: 2, ppgRank: 4, seasonTeams: 12, indexRank: 22, recRank: 16, scoRank: 13, postRank: 1,
    case: 'Jalen Hurts averaged 27.3 a game across four starts as the backup quarterback, with Dalvin Cook and James Conner both around 13 behind the starters. Never won more than two in a row.',
    lineup: [
      { s: 'QB', n: 'Patrick Mahomes', p: 'QB', ppg: 30.3, g: 9, rk: 'QB1' },
      { s: 'RB', n: 'Christian McCaffrey', p: 'RB', ppg: 23.9, g: 9, rk: 'RB2' },
      { s: 'RB', n: 'Travis Etienne', p: 'RB', ppg: 13.6, g: 12, rk: 'RB18' },
      { s: 'WR', n: 'Amari Cooper', p: 'WR', ppg: 15.4, g: 9, rk: 'WR10' },
      { s: 'WR', n: 'Keenan Allen', p: 'WR', ppg: 17.2, g: 7, rk: 'WR42' },
      { s: 'TE', n: 'Travis Kelce', p: 'TE', ppg: 21, g: 7, rk: 'TE1' },
      { s: 'FLEX', n: 'Chris Olave', p: 'WR', ppg: 14.5, g: 7, rk: 'WR24' },
    ] },
  { seed: 15, year: 2021, managerId: '6897f929-c070-4e0e-9633-d9e90794a1c0', manager: 'Sean', team: 'Dude Lipas', wins: 10, losses: 4, ties: 0, ppg: 127.4, index: 1.047, resume: 57.9, finish: 'rank', finalRank: 3, regularRank: 2, high: 187.5, low: 82.6, streak: 6, ppgRank: 3, seasonTeams: 12, indexRank: 25, recRank: 4, scoRank: 14, postRank: 12,
    case: 'Jonathan Taylor put up 16.9 a game across five starts and still never held the slot, with AJ Dillon, Brandon Aiyuk and Aaron Jones all above 13 behind him. Won six in a row from week three.',
    lineup: [
      { s: 'QB', n: 'Dak Prescott', p: 'QB', ppg: 23.1, g: 12, rk: 'QB7' },
      { s: 'RB', n: 'Najee Harris', p: 'RB', ppg: 18.4, g: 14, rk: 'RB3' },
      { s: 'RB', n: 'Myles Gaskin', p: 'RB', ppg: 10.6, g: 12, rk: 'RB24' },
      { s: 'WR', n: 'Ja\'Marr Chase', p: 'WR', ppg: 17.4, g: 14, rk: 'WR5' },
      { s: 'WR', n: 'Hunter Renfrow', p: 'WR', ppg: 16.7, g: 7, rk: 'WR20' },
      { s: 'TE', n: 'Dawson Knox', p: 'TE', ppg: 12.2, g: 9, rk: 'TE11' },
      { s: 'FLEX', n: 'Antonio Brown', p: 'WR', ppg: 19.3, g: 6, rk: 'WR42' },
    ] },
  { seed: 16, year: 2024, managerId: '55ab525f-9fa0-4bdd-a842-a0dcc99577b1', manager: 'Luke', team: 'The GLIZZYS', wins: 8, losses: 6, ties: 0, ppg: 121.5, index: 0.987, resume: 57.2, finish: 'champion', finalRank: 1, regularRank: 6, high: 147.3, low: 96.6, streak: 4, ppgRank: 6, seasonTeams: 12, indexRank: 45, recRank: 13, scoRank: 16, postRank: 1,
    case: 'No skill depth at all: nothing behind the starters cleared what an average starter at its own position puts up, bar a rotating defence. Started 1-4, then went 7-2 the rest of the way and won four straight into January.',
    lineup: [
      { s: 'QB', n: 'Kyler Murray', p: 'QB', ppg: 19, g: 16, rk: 'QB11' },
      { s: 'RB', n: 'Jahmyr Gibbs', p: 'RB', ppg: 19.9, g: 16, rk: 'RB2' },
      { s: 'RB', n: 'James Cook', p: 'RB', ppg: 16.2, g: 16, rk: 'RB9' },
      { s: 'WR', n: 'Garrett Wilson', p: 'WR', ppg: 15.2, g: 16, rk: 'WR9' },
      { s: 'WR', n: 'DeVonta Smith', p: 'WR', ppg: 15.3, g: 13, rk: 'WR24' },
      { s: 'TE', n: 'Jonnu Smith', p: 'TE', ppg: 17.3, g: 8, rk: 'TE9' },
      { s: 'FLEX', n: 'DeAndre Hopkins', p: 'WR', ppg: 10.3, g: 8, rk: 'WR41' },
    ] },
]

export const BY_SEED: ReadonlyMap<number, GoatTeam> = new Map(FIELD.map((t) => [t.seed, t]))

/** A team's short handle: "2019 Joey". Unique across the field by construction. */
export function label(t: GoatTeam): string {
  return `${t.year} ${t.manager}`
}

export function record(t: GoatTeam): string {
  return t.ties ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`
}

/**
 * Points, always to one decimal. A stored 136.0 renders as "136" otherwise,
 * which breaks a tabular column sitting next to a 135.4.
 */
export function pts(n: number): string {
  return n.toFixed(1)
}

/**
 * The scoring index as a plain percentage: 1.168 becomes "+17%". Nobody reads
 * "1.17" and thinks "seventeen per cent more than everyone else that year",
 * which is the only thing the number is trying to say.
 */
export function vsLeague(index: number): string {
  const pct = Math.round((index - 1) * 100)
  return `${pct >= 0 ? '+' : ''}${pct}%`
}

/**
 * The three parts of a team's seed score, derived from the row rather than
 * stored alongside it so they can never drift out of step with resume().
 */
export function breakdown(t: GoatTeam): { record: number; scoring: number; post: number; total: number } {
  const games = t.wins + t.losses + t.ties
  const winRate = games ? (t.wins + 0.5 * t.ties) / games : 0
  return {
    record: +(43 * winRate).toFixed(1),
    scoring: +(37 * Math.max(0, Math.min(1, (t.index - 0.85) / 0.4))).toFixed(1),
    post: placementPoints(t.finalRank),
    total: t.resume,
  }
}

/** How a season ended, in words, for the card. */
export function finishLine(t: GoatTeam): string {
  if (t.finish === 'champion') return `${t.year} champion`
  if (t.finish === 'runner-up') return `Lost the ${t.year} final`
  const n = t.finalRank
  const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'
  return `Finished ${n}${suffix} in ${t.year}`
}

// ─────────────────────────────────────────────────────────────────────────
// The bracket
// ─────────────────────────────────────────────────────────────────────────

export type RoundId = 'r16' | 'qf' | 'sf' | 'final'

export const ROUNDS: ReadonlyArray<{ id: RoundId; name: string; games: number }> = [
  { id: 'r16', name: 'Round of 16', games: 8 },
  { id: 'qf', name: 'Quarterfinals', games: 4 },
  { id: 'sf', name: 'Semifinals', games: 2 },
  { id: 'final', name: 'The Final', games: 1 },
]

export const ROUND_ORDER: readonly RoundId[] = ['r16', 'qf', 'sf', 'final']

/**
 * Standard bracket seeding, written out rather than generated so the shape is
 * readable: the one and the two can only meet in the final, and every game in
 * a round sits next to the game whose winner it plays.
 */
const R16_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 16], [8, 9],
  [5, 12], [4, 13],
  [6, 11], [3, 14],
  [7, 10], [2, 15],
]

/** Stable id for one game: "r16-3". Never derived from team names. */
export function gameId(round: RoundId, index: number): string {
  return `${round}-${index}`
}

export type GameKey = { round: RoundId; index: number; id: string }

/** Every game in the tournament, in bracket order. */
export const GAMES: readonly GameKey[] = ROUNDS.flatMap((r) =>
  Array.from({ length: r.games }, (_, i) => ({ round: r.id, index: i, id: gameId(r.id, i) })),
)

/** Winners so far, by game id, as the seed number that advanced. */
export type Results = Record<string, number>

export type ResolvedGame = {
  id: string
  round: RoundId
  index: number
  /** Null while the feeding game upstream is still undecided. */
  home: GoatTeam | null
  away: GoatTeam | null
  /** The seed that won, once the room has settled it. */
  winner: number | null
  /** True when both sides are known, so the game can actually be voted on. */
  ready: boolean
}

/**
 * Walk the bracket forward from the results so far. A game in a later round
 * only has teams once both of its feeders are settled, which is what stops the
 * room opening a semifinal before the quarters are in.
 */
export function buildBracket(results: Results): ResolvedGame[] {
  const games: ResolvedGame[] = []
  const seedFor = (id: string) => {
    const s = results[id]
    return typeof s === 'number' ? (BY_SEED.get(s) ?? null) : null
  }

  R16_PAIRS.forEach(([a, b], i) => {
    const id = gameId('r16', i)
    games.push({
      id, round: 'r16', index: i,
      home: BY_SEED.get(a) ?? null,
      away: BY_SEED.get(b) ?? null,
      winner: results[id] ?? null,
      ready: true,
    })
  })

  for (const round of ['qf', 'sf', 'final'] as const) {
    const prev = ROUND_ORDER[ROUND_ORDER.indexOf(round) - 1]
    const count = ROUNDS.find((r) => r.id === round)!.games
    for (let i = 0; i < count; i++) {
      const id = gameId(round, i)
      const home = seedFor(gameId(prev, i * 2))
      const away = seedFor(gameId(prev, i * 2 + 1))
      games.push({
        id, round, index: i, home, away,
        winner: results[id] ?? null,
        ready: !!home && !!away,
      })
    }
  }
  return games
}

/** The games of one round. */
export function gamesInRound(bracket: ResolvedGame[], round: RoundId): ResolvedGame[] {
  return bracket.filter((g) => g.round === round)
}

/** The champion, once the final has been settled. */
export function winnerOf(bracket: ResolvedGame[]): GoatTeam | null {
  const f = bracket.find((g) => g.round === 'final')
  return f?.winner ? (BY_SEED.get(f.winner) ?? null) : null
}

/** The final itself, teams attached once both semifinals are settled. */
export function finalGame(bracket: ResolvedGame[]): ResolvedGame | null {
  return bracket.find((g) => g.round === 'final') ?? null
}

/**
 * Everybody a seed has already beaten, in bracket order. This is the road to
 * the final: by the time two teams are left, how each of them got there is
 * most of the argument for which one is better.
 */
export function pathTo(bracket: ResolvedGame[], seed: number): { round: RoundId; beat: GoatTeam }[] {
  const out: { round: RoundId; beat: GoatTeam }[] = []
  for (const g of bracket) {
    if (g.winner !== seed) continue
    const beat = g.home?.seed === seed ? g.away : g.home
    if (beat) out.push({ round: g.round, beat })
  }
  return out
}

/**
 * The earliest round that is not fully settled. This is what the room opens
 * next, and what the public bracket highlights.
 */
export function currentRound(results: Results): RoundId | null {
  for (const r of ROUND_ORDER) {
    const count = ROUNDS.find((x) => x.id === r)!.games
    const settled = Array.from({ length: count }, (_, i) => results[gameId(r, i)]).filter((x) => typeof x === 'number').length
    if (settled < count) return r
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────
// Voting
// ─────────────────────────────────────────────────────────────────────────

/** One person's card for one round: game id -> the seed they picked. */
export type Ballot = Record<string, number>

export type VoteRecord = { name: string; round: RoundId; picks: Ballot }

/**
 * Check a card against the round that is actually open. A pick for a game
 * outside the round, or for a seed that is not in that game, is refused rather
 * than dropped, because a card that arrives malformed was not built by this
 * page and guessing at it would quietly change somebody's vote.
 */
export function validateBallot(
  bracket: ResolvedGame[],
  round: RoundId,
  picks: unknown,
): { ok: true; picks: Ballot } | { ok: false; error: string } {
  if (!picks || typeof picks !== 'object') return { ok: false, error: 'Nothing was sent.' }
  const raw = picks as Record<string, unknown>
  const open = gamesInRound(bracket, round).filter((g) => g.ready && g.winner === null)
  if (!open.length) return { ok: false, error: 'That round is already settled.' }

  const clean: Ballot = {}
  for (const g of open) {
    const v = raw[g.id]
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      return { ok: false, error: `Still need a pick in ${label(g.home!)} vs ${label(g.away!)}.` }
    }
    if (v !== g.home!.seed && v !== g.away!.seed) {
      return { ok: false, error: `That pick isn't in ${label(g.home!)} vs ${label(g.away!)}.` }
    }
    clean[g.id] = v
  }
  const strays = Object.keys(raw).filter((k) => !(k in clean))
  if (strays.length) return { ok: false, error: 'That card has a game on it that is not open.' }

  return { ok: true, picks: clean }
}

export type Tally = {
  game: ResolvedGame
  homeVotes: number
  awayVotes: number
  count: number
  /** The seed ahead on votes, or null on a dead tie. */
  leader: number | null
  /** Share held by the leader, 0.5 to 1. Drives how lopsided a row reads. */
  edge: number
}

/** Count one round's votes, game by game, in bracket order. */
export function tallyRound(bracket: ResolvedGame[], round: RoundId, votes: VoteRecord[]): Tally[] {
  const cast = votes.filter((v) => v.round === round)
  return gamesInRound(bracket, round).map((game) => {
    let homeVotes = 0
    let awayVotes = 0
    for (const v of cast) {
      const pick = v.picks[game.id]
      if (pick === game.home?.seed) homeVotes++
      else if (pick === game.away?.seed) awayVotes++
    }
    const count = homeVotes + awayVotes
    return {
      game, homeVotes, awayVotes, count,
      leader: homeVotes === awayVotes ? null : homeVotes > awayVotes ? game.home!.seed : game.away!.seed,
      edge: count ? Math.max(homeVotes, awayVotes) / count : 0.5,
    }
  })
}

/**
 * Settle a round from its votes. A tie is NOT broken here and is reported
 * instead: the room decides, because the alternative is a coin the league
 * never agreed to.
 */
export function settleRound(
  bracket: ResolvedGame[],
  round: RoundId,
  votes: VoteRecord[],
): { ok: true; results: Results } | { ok: false; error: string; ties: string[] } {
  // Games the room already called by hand keep their winner and are not put
  // back to the vote, so breaking a tie and then settling the round does not
  // re-litigate the game that was stuck.
  const tallies = tallyRound(bracket, round, votes).filter((t) => t.game.winner === null)
  if (!tallies.length) return { ok: true, results: {} }
  const ties = tallies.filter((t) => t.count > 0 && t.leader === null).map((t) => t.game.id)
  const empty = tallies.filter((t) => t.count === 0)
  if (empty.length) {
    return { ok: false, error: `${empty.length} game${empty.length > 1 ? 's have' : ' has'} no votes yet.`, ties: [] }
  }
  if (ties.length) {
    const names = ties.map((id) => {
      const g = tallies.find((t) => t.game.id === id)!.game
      return `${label(g.home!)} vs ${label(g.away!)}`
    })
    return { ok: false, error: `Dead tie in ${names.join(' and ')}. Break it from the room.`, ties }
  }
  const results: Results = {}
  for (const t of tallies) results[t.game.id] = t.leader!
  return { ok: true, results }
}

// ─────────────────────────────────────────────────────────────────────────
// One person's card, back to them
// ─────────────────────────────────────────────────────────────────────────

/** One call on somebody's card, against what the room went on to decide. */
export type CardLine = {
  game: ResolvedGame
  pick: GoatTeam | null
  /** The side they left for dead. */
  against: GoatTeam | null
  /** Null while the round is still sealed: no result to be right or wrong about. */
  right: boolean | null
}

export type CardRound = { id: RoundId; name: string; lines: CardLine[] }

/**
 * Somebody's whole tournament, round by round, graded where the room has
 * settled and left open where it hasn't.
 *
 * Only rounds they actually filed a card in appear: a voter who missed the
 * quarterfinals should see a card with a hole in it rather than four rows of
 * blanks pretending to be picks.
 */
export function scoreCard(
  bracket: ResolvedGame[],
  votes: VoteRecord[],
): { rounds: CardRound[]; right: number; graded: number } {
  const rounds: CardRound[] = []
  let right = 0
  let graded = 0

  for (const round of ROUNDS) {
    const card = votes.find((v) => v.round === round.id)
    if (!card) continue
    const lines: CardLine[] = []
    for (const game of gamesInRound(bracket, round.id)) {
      const seed = card.picks[game.id]
      if (typeof seed !== 'number') continue
      const pick = BY_SEED.get(seed) ?? null
      const against = game.home?.seed === seed ? game.away : game.home
      const hit = game.winner === null ? null : game.winner === seed
      if (hit !== null) {
        graded++
        if (hit) right++
      }
      lines.push({ game, pick, against, right: hit })
    }
    if (lines.length) rounds.push({ id: round.id, name: round.name, lines })
  }

  return { rounds, right, graded }
}

/** Every pick on somebody's card, flattened to game id -> seed. */
export function flattenCard(votes: VoteRecord[]): Ballot {
  const out: Ballot = {}
  for (const v of votes) Object.assign(out, v.picks)
  return out
}
