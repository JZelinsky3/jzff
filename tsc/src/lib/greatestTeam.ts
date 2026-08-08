// The greatest team in PA Milk Society history, settled by bracket.
//
// Eighty-six team-seasons exist across 2019-2025. The sixteen best resumes get
// in, and nothing else does: no automatic bids, no seat held for a title. Six
// of the seven champions clear the bar on merit anyway; the one that misses is
// 2024 Luke, the only champion in league history to score below league average
// across a whole season. First team out is 2024 Cat.
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
 * Weeks a player must have been started to claim a lineup slot. Set at six of
 * a fourteen-game season: enough that the slot describes the year rather than
 * a hot month.
 */
export const MIN_STARTS = 6

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
  /** Regular-season points per game. */
  ppg: number
  /**
   * That PPG over the league average of the same season. 2019 and 2020 were
   * thirteen-game years in a lower-scoring league, so raw points cannot
   * compare across eras and this is what the seeding actually uses.
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
  /** The argument, in one line. Shown on the voting card. */
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
  lineup: { s: string; n: string; p: string; ppg: number; g: number; rk: string | null }[]
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
 * The seeding number: forty parts record, forty parts scoring against the
 * league that season, twenty parts where the season finished.
 *
 * Record and scoring are weighted evenly on purpose. Win rate alone rewards a
 * team that kept drawing the right opponent, and in a twelve-team league a
 * couple of wins is mostly schedule. The scoring term is clamped to the
 * 0.85-1.25 index band, which is where every team-season in league history
 * actually lands.
 */
export function resume(t: { wins: number; losses: number; ties: number; index: number; finalRank: number }): number {
  const games = t.wins + t.losses + t.ties
  const winRate = games ? (t.wins + 0.5 * t.ties) / games : 0
  const scoring = Math.max(0, Math.min(1, (t.index - 0.85) / 0.4))
  return 40 * winRate + 40 * scoring + placementPoints(t.finalRank)
}

export const FIELD: readonly GoatTeam[] = [
  { seed: 1, year: 2019, managerId: '196e3501-8cec-49b4-a09b-17771bc997f1', manager: 'Joey', team: 'On Jah', wins: 9, losses: 4, ties: 0, ppg: 135.4, index: 1.168, resume: 79.5, finish: 'champion', finalRank: 1, regularRank: 2, high: 191.8, low: 78.6, streak: 5,
    case: 'Opened the league with a 191 in week one and won the first title there has ever been. Closed the regular season on five straight, then took the final by twelve.',
    lineup: [
      { s: 'QB', n: 'Lamar Jackson', p: 'QB', ppg: 31.6, g: 12, rk: 'QB1' },
      { s: 'RB', n: 'Derrick Henry', p: 'RB', ppg: 18.6, g: 12, rk: 'RB5' },
      { s: 'RB', n: 'Austin Ekeler', p: 'RB', ppg: 17.2, g: 10, rk: 'RB3' },
      { s: 'WR', n: 'Sammy Watkins', p: 'WR', ppg: 12.9, g: 8, rk: 'WR41' },
      { s: 'WR', n: 'JuJu Smith-Schuster', p: 'WR', ppg: 12.2, g: 8, rk: 'WR44' },
      { s: 'TE', n: 'Darren Waller', p: 'TE', ppg: 12.4, g: 9, rk: 'TE2' },
      { s: 'FLEX', n: 'D.J. Chark', p: 'WR', ppg: 13.2, g: 7, rk: 'WR19' },
    ] },
  { seed: 2, year: 2019, managerId: 'eaeedefa-2711-4d93-b0ce-a795c5f4d55a', manager: 'Mason', team: 'Mdog346', wins: 11, losses: 2, ties: 0, ppg: 136, index: 1.174, resume: 78.2, finish: 'runner-up', finalRank: 2, regularRank: 1, high: 183.9, low: 111.4, streak: 5,
    case: 'Eleven and two, the highest-scoring team in the league that year, and never once held under 111 all season. Lost the final by twelve. No ring to show for any of it.',
    lineup: [
      { s: 'QB', n: 'Dak Prescott', p: 'QB', ppg: 24.9, g: 8, rk: 'QB4' },
      { s: 'RB', n: 'Nick Chubb', p: 'RB', ppg: 17.8, g: 9, rk: 'RB8' },
      { s: 'RB', n: 'Saquon Barkley', p: 'RB', ppg: 15.5, g: 9, rk: 'RB17' },
      { s: 'WR', n: 'Amari Cooper', p: 'WR', ppg: 16.9, g: 12, rk: 'WR7' },
      { s: 'WR', n: 'D.J. Moore', p: 'WR', ppg: 17.5, g: 9, rk: 'WR8' },
      { s: 'TE', n: 'Zach Ertz', p: 'TE', ppg: 13.5, g: 12, rk: 'TE4' },
      { s: 'FLEX', n: 'Aaron Jones', p: 'RB', ppg: 22.6, g: 4, rk: 'RB6' },
    ] },
  { seed: 3, year: 2021, managerId: 'dca75bbf-9c3e-4576-b6c4-845e6dc20030', manager: 'Chris', team: 'Stafford University', wins: 10, losses: 4, ties: 0, ppg: 137.2, index: 1.129, resume: 76.5, finish: 'champion', finalRank: 1, regularRank: 1, high: 200.6, low: 81.2, streak: 5,
    case: 'Owns the only 200-point week in league history. The only champion that also finished first in the regular season, and it won its two playoff games by sixty-two and forty.',
    lineup: [
      { s: 'QB', n: 'Matthew Stafford', p: 'QB', ppg: 26.3, g: 13, rk: 'QB4' },
      { s: 'RB', n: 'Ezekiel Elliott', p: 'RB', ppg: 15.7, g: 13, rk: 'RB7' },
      { s: 'RB', n: 'D\'Andre Swift', p: 'RB', ppg: 17.1, g: 11, rk: 'RB10' },
      { s: 'WR', n: 'Davante Adams', p: 'WR', ppg: 21, g: 12, rk: 'WR3' },
      { s: 'WR', n: 'Diontae Johnson', p: 'WR', ppg: 18.4, g: 12, rk: 'WR8' },
      { s: 'TE', n: 'Mark Andrews', p: 'TE', ppg: 16, g: 13, rk: 'TE1' },
      { s: 'FLEX', n: 'Courtland Sutton', p: 'WR', ppg: 10.4, g: 9, rk: 'WR34' },
    ] },
  { seed: 4, year: 2021, managerId: '196e3501-8cec-49b4-a09b-17771bc997f1', manager: 'Joey', team: 'Oreos', wins: 9, losses: 5, ties: 0, ppg: 142, index: 1.168, resume: 69.5, finish: 'runner-up', finalRank: 2, regularRank: 3, high: 189.6, low: 109.4, streak: 6,
    case: 'The highest scoring average any team has ever posted, 142 a week, and it still only went 9-5. Won its last six, then ran into 2021 Chris in the final.',
    lineup: [
      { s: 'QB', n: 'Kirk Cousins', p: 'QB', ppg: 20.9, g: 8, rk: 'QB13' },
      { s: 'RB', n: 'Austin Ekeler', p: 'RB', ppg: 21.3, g: 13, rk: 'RB2' },
      { s: 'RB', n: 'Cordarrelle Patterson', p: 'RB', ppg: 16.2, g: 8, rk: 'RB8' },
      { s: 'WR', n: 'Cooper Kupp', p: 'WR', ppg: 25.8, g: 13, rk: 'WR1' },
      { s: 'WR', n: 'Justin Jefferson', p: 'WR', ppg: 21.5, g: 7, rk: 'WR2' },
      { s: 'TE', n: 'Travis Kelce', p: 'TE', ppg: 15, g: 13, rk: 'TE2' },
      { s: 'FLEX', n: 'Tyler Lockett', p: 'WR', ppg: 13.8, g: 10, rk: 'WR15' },
    ] },
  { seed: 5, year: 2025, managerId: 'eaeedefa-2711-4d93-b0ce-a795c5f4d55a', manager: 'Mason', team: 'Rizzlers', wins: 10, losses: 4, ties: 0, ppg: 126.5, index: 1.054, resume: 69, finish: 'champion', finalRank: 1, regularRank: 2, high: 164.8, low: 95.4, streak: 7,
    case: 'Ripped off seven straight through the middle of the year, then hung 193 on Kyle in the semifinal. The most recent ring, and the one the room still has to answer for.',
    lineup: [
      { s: 'QB', n: 'Jalen Hurts', p: 'QB', ppg: 22, g: 13, rk: 'QB5' },
      { s: 'RB', n: 'Ashton Jeanty', p: 'RB', ppg: 14.2, g: 13, rk: 'RB14' },
      { s: 'RB', n: 'D\'Andre Swift', p: 'RB', ppg: 13.6, g: 10, rk: 'RB16' },
      { s: 'WR', n: 'Puka Nacua', p: 'WR', ppg: 21.6, g: 12, rk: 'WR2' },
      { s: 'WR', n: 'Stefon Diggs', p: 'WR', ppg: 12.5, g: 9, rk: 'WR26' },
      { s: 'TE', n: 'George Kittle', p: 'TE', ppg: 13.3, g: 8, rk: 'TE16' },
      { s: 'FLEX', n: 'Keenan Allen', p: 'WR', ppg: 10.2, g: 11, rk: 'WR27' },
    ] },
  { seed: 6, year: 2025, managerId: '6f92aba6-b4b6-4321-bd61-e8af54e54cef', manager: 'Isaac', team: 'CHILD OF GOD', wins: 10, losses: 4, ties: 0, ppg: 141.9, index: 1.181, resume: 66.7, finish: 'rank', finalRank: 5, regularRank: 1, high: 171.3, low: 112.7, streak: 7,
    case: 'The most dominant scoring season the league has ever seen against its own era, a floor of 112, first place in the regular season, and seven straight wins. Then lost its opening playoff game by three. Fifth place is a lie.',
    lineup: [
      { s: 'QB', n: 'Lamar Jackson', p: 'QB', ppg: 20.7, g: 10, rk: 'QB14' },
      { s: 'RB', n: 'Jonathan Taylor', p: 'RB', ppg: 24, g: 13, rk: 'RB2' },
      { s: 'RB', n: 'Christian McCaffrey', p: 'RB', ppg: 24.3, g: 4, rk: 'RB1' },
      { s: 'WR', n: 'Jaxon Smith-Njigba', p: 'WR', ppg: 22.3, g: 13, rk: 'WR1' },
      { s: 'WR', n: 'Rashee Rice', p: 'WR', ppg: 19.7, g: 7, rk: 'WR30' },
      { s: 'TE', n: 'Harold Fannin Jr.', p: 'TE', ppg: 9.5, g: 6, rk: 'TE6' },
      { s: 'FLEX', n: 'Oronde Gadsden II', p: 'TE', ppg: 7.7, g: 6, rk: 'TE18' },
    ] },
  { seed: 7, year: 2023, managerId: 'f28186ad-c398-4bf5-a425-e387fa1e03a3', manager: 'Connie', team: 'Milk Man', wins: 8, losses: 6, ties: 0, ppg: 129.4, index: 1.066, resume: 64.5, finish: 'champion', finalRank: 1, regularRank: 3, high: 186, low: 80.1, streak: 4,
    case: 'An 8-6 team that peaked at exactly the right moment and beat the 11-3 wagon by thirty-one in the final. Proof that the regular season is a suggestion.',
    lineup: [
      { s: 'QB', n: 'Dak Prescott', p: 'QB', ppg: 24, g: 5, rk: 'QB2' },
      { s: 'RB', n: 'Travis Etienne', p: 'RB', ppg: 17.5, g: 13, rk: 'RB3' },
      { s: 'RB', n: 'Derrick Henry', p: 'RB', ppg: 15.1, g: 13, rk: 'RB7' },
      { s: 'WR', n: 'CeeDee Lamb', p: 'WR', ppg: 21.8, g: 13, rk: 'WR2' },
      { s: 'WR', n: 'Deebo Samuel Sr.', p: 'WR', ppg: 17.3, g: 11, rk: 'WR15' },
      { s: 'TE', n: 'George Kittle', p: 'TE', ppg: 13.2, g: 13, rk: 'TE3' },
      { s: 'FLEX', n: 'Mike Williams', p: 'WR', ppg: 16.7, g: 3, rk: 'WR62' },
    ] },
  { seed: 8, year: 2022, managerId: '196e3501-8cec-49b4-a09b-17771bc997f1', manager: 'Joey', team: 'Space Mav', wins: 12, losses: 2, ties: 0, ppg: 124.2, index: 1.053, resume: 63.6, finish: 'rank', finalRank: 3, regularRank: 1, high: 170.3, low: 49.5, streak: 6,
    case: 'Twelve and two, the best record in the history of the league. It also posted the lowest score anybody has ever put up, a 49.5, in the same season. Went out of the playoffs by seven.',
    lineup: [
      { s: 'QB', n: 'Lamar Jackson', p: 'QB', ppg: 24.4, g: 11, rk: 'QB6' },
      { s: 'RB', n: 'Saquon Barkley', p: 'RB', ppg: 17.4, g: 13, rk: 'RB5' },
      { s: 'RB', n: 'Kenneth Walker III', p: 'RB', ppg: 17.4, g: 7, rk: 'RB20' },
      { s: 'WR', n: 'Justin Jefferson', p: 'WR', ppg: 22.1, g: 12, rk: 'WR1' },
      { s: 'WR', n: 'Christian Kirk', p: 'WR', ppg: 15.5, g: 11, rk: 'WR10' },
      { s: 'TE', n: 'Zach Ertz', p: 'TE', ppg: 10.4, g: 7, rk: 'TE5' },
      { s: 'FLEX', n: 'David Montgomery', p: 'RB', ppg: 10.7, g: 6, rk: 'RB25' },
    ] },
  { seed: 9, year: 2024, managerId: '6897f929-c070-4e0e-9633-d9e90794a1c0', manager: 'Sean', team: '3-Star REECHIE', wins: 10, losses: 4, ties: 0, ppg: 137.9, index: 1.126, resume: 63.2, finish: 'rank', finalRank: 4, regularRank: 1, high: 169.8, low: 102.6, streak: 5,
    case: 'First in the league and first in scoring at 138 a week, then gone in two playoff games decided by a combined twenty-nine points. The best team to leave with nothing.',
    lineup: [
      { s: 'QB', n: 'Joe Burrow', p: 'QB', ppg: 27, g: 13, rk: 'QB2' },
      { s: 'RB', n: 'De\'Von Achane', p: 'RB', ppg: 17.7, g: 13, rk: 'RB6' },
      { s: 'RB', n: 'Joe Mixon', p: 'RB', ppg: 21.2, g: 10, rk: 'RB10' },
      { s: 'WR', n: 'Ja\'Marr Chase', p: 'WR', ppg: 24.8, g: 13, rk: 'WR1' },
      { s: 'WR', n: 'Chris Olave', p: 'WR', ppg: 8.3, g: 7, rk: 'WR55' },
      { s: 'TE', n: 'Jake Ferguson', p: 'TE', ppg: 9.5, g: 8, rk: 'TE18' },
      { s: 'FLEX', n: 'Kenneth Walker III', p: 'RB', ppg: 19.1, g: 6, rk: 'RB22' },
    ] },
  { seed: 10, year: 2022, managerId: 'c8db587f-7936-4cd7-a4d7-a3efa9edbe4c', manager: 'Kyle', team: 'Wyle Wiverd', wins: 10, losses: 4, ties: 0, ppg: 131.7, index: 1.116, resume: 62.2, finish: 'rank', finalRank: 4, regularRank: 2, high: 170.9, low: 100.1, streak: 4,
    case: 'Ten and four while scoring 132 a week, and it drew the second-softest slate in league history to do it: 108 points against. Lost the semifinal by three to the team that won the whole thing.',
    lineup: [
      { s: 'QB', n: 'Josh Allen', p: 'QB', ppg: 28.2, g: 13, rk: 'QB3' },
      { s: 'RB', n: 'Derrick Henry', p: 'RB', ppg: 18.9, g: 13, rk: 'RB4' },
      { s: 'RB', n: 'Josh Jacobs', p: 'RB', ppg: 21.2, g: 11, rk: 'RB2' },
      { s: 'WR', n: 'A.J. Brown', p: 'WR', ppg: 16.9, g: 11, rk: 'WR5' },
      { s: 'WR', n: 'Diontae Johnson', p: 'WR', ppg: 11, g: 9, rk: 'WR31' },
      { s: 'TE', n: 'Pat Freiermuth', p: 'TE', ppg: 10.7, g: 12, rk: 'TE4' },
      { s: 'FLEX', n: 'Dameon Pierce', p: 'RB', ppg: 15.1, g: 7, rk: 'RB15' },
    ] },
  { seed: 11, year: 2024, managerId: 'ca70f1bc-3bc8-4ab3-af35-3b3ee25c157f', manager: 'Ricci', team: 'OG CARHARTT', wins: 10, losses: 4, ties: 0, ppg: 130.3, index: 1.063, resume: 61.9, finish: 'runner-up', finalRank: 2, regularRank: 2, high: 163.7, low: 93.5, streak: 7,
    case: 'Ten wins, a seven-game streak, and a final it lost by eleven to a team that had finished sixth. The most conventional great team in the field.',
    lineup: [
      { s: 'QB', n: 'Jalen Hurts', p: 'QB', ppg: 24.2, g: 13, rk: 'QB5' },
      { s: 'RB', n: 'Bijan Robinson', p: 'RB', ppg: 19, g: 13, rk: 'RB4' },
      { s: 'RB', n: 'Chuba Hubbard', p: 'RB', ppg: 14.9, g: 7, rk: 'RB12' },
      { s: 'WR', n: 'Drake London', p: 'WR', ppg: 15.2, g: 13, rk: 'WR8' },
      { s: 'WR', n: 'Jaxon Smith-Njigba', p: 'WR', ppg: 15.9, g: 10, rk: 'WR7' },
      { s: 'TE', n: 'George Kittle', p: 'TE', ppg: 16.7, g: 11, rk: 'TE2' },
      { s: 'FLEX', n: 'Malik Nabers', p: 'WR', ppg: 17.4, g: 8, rk: 'WR12' },
    ] },
  { seed: 12, year: 2023, managerId: '6f92aba6-b4b6-4321-bd61-e8af54e54cef', manager: 'Isaac', team: 'Nathanael Bartholomew', wins: 11, losses: 3, ties: 0, ppg: 125.5, index: 1.033, resume: 61.7, finish: 'runner-up', finalRank: 2, regularRank: 1, high: 174, low: 87.4, streak: 4,
    case: 'Eleven and three, first in the league, four straight to close it out. Then lost the final by thirty-one to an 8-6 team. The third-best record ever posted, and nothing on the wall.',
    lineup: [
      { s: 'QB', n: 'Justin Fields', p: 'QB', ppg: 21.3, g: 6, rk: 'QB15' },
      { s: 'RB', n: 'Bijan Robinson', p: 'RB', ppg: 13.1, g: 10, rk: 'RB9' },
      { s: 'RB', n: 'Brian Robinson', p: 'RB', ppg: 13.4, g: 7, rk: 'RB15' },
      { s: 'WR', n: 'A.J. Brown', p: 'WR', ppg: 22.8, g: 8, rk: 'WR4' },
      { s: 'WR', n: 'Jordan Addison', p: 'WR', ppg: 14.8, g: 9, rk: 'WR23' },
      { s: 'TE', n: 'Mark Andrews', p: 'TE', ppg: 14.6, g: 9, rk: 'TE6' },
      { s: 'FLEX', n: 'Nico Collins', p: 'WR', ppg: 13.8, g: 6, rk: 'WR12' },
    ] },
  { seed: 13, year: 2020, managerId: 'ca70f1bc-3bc8-4ab3-af35-3b3ee25c157f', manager: 'Ricci', team: 'Huntingforkickers', wins: 7, losses: 6, ties: 0, ppg: 127, index: 1.024, resume: 58.9, finish: 'champion', finalRank: 1, regularRank: 4, high: 145.9, low: 90.8, streak: 2,
    case: 'Squeaked in at 7-6 having never won more than two in a row, then won three straight in January and closed with a 179 in the final. The original proof that you only have to be good for three weeks.',
    lineup: [
      { s: 'QB', n: 'Lamar Jackson', p: 'QB', ppg: 23.2, g: 9, rk: 'QB11' },
      { s: 'RB', n: 'David Johnson', p: 'RB', ppg: 12.2, g: 6, rk: 'RB26' },
      { s: 'RB', n: 'Jerick McKinnon', p: 'RB', ppg: 9.3, g: 7, rk: 'RB29' },
      { s: 'WR', n: 'Stefon Diggs', p: 'WR', ppg: 18.1, g: 12, rk: 'WR5' },
      { s: 'WR', n: 'JuJu Smith-Schuster', p: 'WR', ppg: 13.9, g: 11, rk: 'WR20' },
      { s: 'TE', n: 'Travis Kelce', p: 'TE', ppg: 20, g: 12, rk: 'TE1' },
      { s: 'FLEX', n: 'Michael Gallup', p: 'WR', ppg: 11.8, g: 6, rk: 'WR37' },
    ] },
  { seed: 14, year: 2022, managerId: '6f92aba6-b4b6-4321-bd61-e8af54e54cef', manager: 'Isaac', team: 'Pat Bateman', wins: 7, losses: 7, ties: 0, ppg: 122.7, index: 1.039, resume: 58.9, finish: 'champion', finalRank: 1, regularRank: 5, high: 166.4, low: 80.2, streak: 2,
    case: 'Went .500 on the nose, then won three straight in January and ended it with a 146-75 demolition in the final. The least likely champion the league has produced, and it is not close.',
    lineup: [
      { s: 'QB', n: 'Patrick Mahomes', p: 'QB', ppg: 29.5, g: 6, rk: 'QB1' },
      { s: 'RB', n: 'Christian McCaffrey', p: 'RB', ppg: 24.1, g: 6, rk: 'RB3' },
      { s: 'RB', n: 'Travis Etienne', p: 'RB', ppg: 12.6, g: 9, rk: 'RB19' },
      { s: 'WR', n: 'Chris Olave', p: 'WR', ppg: 14.5, g: 7, rk: 'WR20' },
      { s: 'WR', n: 'Amari Cooper', p: 'WR', ppg: 15, g: 6, rk: 'WR13' },
      { s: 'TE', n: 'Travis Kelce', p: 'TE', ppg: 21, g: 7, rk: 'TE1' },
      { s: 'FLEX', n: 'AJ Dillon', p: 'RB', ppg: 7.7, g: 7, rk: 'RB28' },
    ] },
  { seed: 15, year: 2019, managerId: 'c4e34f56-1c96-4453-ac45-e45d63b0673d', manager: 'Krish', team: 'Man tit', wins: 7, losses: 6, ties: 0, ppg: 130, index: 1.122, resume: 57.7, finish: 'rank', finalRank: 3, regularRank: 4, high: 192.4, low: 90.8, streak: 4,
    case: 'Third in the league in scoring in a year nobody else\'s numbers survive, and a 192 in week five that is still the fourth-biggest week anybody has ever posted. Went 7-6, then won two of three in January to finish third. The only manager in the field who is no longer in the league.',
    lineup: [
      { s: 'QB', n: 'Deshaun Watson', p: 'QB', ppg: 26.1, g: 12, rk: 'QB3' },
      { s: 'RB', n: 'Dalvin Cook', p: 'RB', ppg: 22.5, g: 12, rk: 'RB2' },
      { s: 'RB', n: 'Mark Ingram', p: 'RB', ppg: 14.1, g: 10, rk: 'RB9' },
      { s: 'WR', n: 'Michael Thomas', p: 'WR', ppg: 22.8, g: 12, rk: 'WR1' },
      { s: 'WR', n: 'Allen Robinson', p: 'WR', ppg: 15.5, g: 12, rk: 'WR14' },
      { s: 'TE', n: 'Hunter Henry', p: 'TE', ppg: 11.5, g: 7, rk: 'TE8' },
      { s: 'FLEX', n: 'Royce Freeman', p: 'RB', ppg: 9.4, g: 8, rk: 'RB35' },
    ] },
  { seed: 16, year: 2020, managerId: '196e3501-8cec-49b4-a09b-17771bc997f1', manager: 'Joey', team: 'Deshaun Dotson', wins: 7, losses: 6, ties: 0, ppg: 137.9, index: 1.112, resume: 56.7, finish: 'rank', finalRank: 3, regularRank: 3, high: 199.8, low: 86.3, streak: 2,
    case: 'The highest-scoring team in the league that year and the owner of a 199.8, the second-biggest week in league history. Still only 7-6, because it also drew more points against than any other team in this field: 131 a week. Won two of three in January to finish third.',
    lineup: [
      { s: 'QB', n: 'Deshaun Watson', p: 'QB', ppg: 29.9, g: 8, rk: 'QB6' },
      { s: 'RB', n: 'Aaron Jones', p: 'RB', ppg: 19.3, g: 10, rk: 'RB5' },
      { s: 'RB', n: 'Austin Ekeler', p: 'RB', ppg: 16.2, g: 6, rk: 'RB32' },
      { s: 'WR', n: 'Davante Adams', p: 'WR', ppg: 26.8, g: 8, rk: 'WR2' },
      { s: 'WR', n: 'Tyler Lockett', p: 'WR', ppg: 18.1, g: 11, rk: 'WR7' },
      { s: 'TE', n: 'Mike Gesicki', p: 'TE', ppg: 14.5, g: 3, rk: 'TE7' },
      { s: 'FLEX', n: 'Jonathan Taylor', p: 'RB', ppg: 12.8, g: 5, rk: 'RB15' },
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
    record: +(40 * winRate).toFixed(1),
    scoring: +(40 * Math.max(0, Math.min(1, (t.index - 0.85) / 0.4))).toFixed(1),
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
