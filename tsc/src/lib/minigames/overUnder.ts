// The Over/Under — the rules and the shapes.
//
// A real team, a real week, and a number. Did they beat it?
//
// The number is the whole design. Two versions were on the table and only one
// of them is a game:
//
//   · The league average that week. Honest, and requires no invention, but
//     the gap between one team's score and the room's average is routinely
//     thirty points, so a third of the calls answer themselves.
//   · A line set NEAR what they actually scored. Every call is close, which
//     means every call is a real read rather than a free one.
//
// The second is what this is. The line is the true score displaced by a
// seeded amount and rounded to the half point, so the sign of that
// displacement IS the answer and the player's job is to estimate the score
// they can't see. There are no pushes: a line ending in .5 against a score
// carried to two decimals can never be exactly met.
//
// The displacement is scaled to how much the LEAGUE's scores actually move
// (see the sigma note in ./overUnderDeal) rather than being a flat number of
// points. A flat ±10 is a hard call in a league that plays half-PPR and a
// gift in one that plays six-point passing touchdowns with a deep bench, and
// the same board should not be twice as hard depending on a setting nobody
// playing it chose.
//
// Import-free on purpose, the same as ./gauntlet and ./guessDraft: the board
// is a client component and reads these constants.

/** Calls in a card. */
export const ROUNDS = 10

/**
 * Fewest team-weeks a league needs before the game will deal.
 *
 * Each matchup yields two of these, so this is about a season and a half for
 * a ten-team league — a league with one year on the books qualifies, which is
 * the point.
 */
export const MIN_DECK = 40

export type OverUnderCall = 'over' | 'under'

export type OverUnderQuestion = {
  key: string
  year: number
  week: number
  isPlayoff: boolean
  isChampionship: boolean
  managerName: string
  teamName: string | null
  /** Per-season avatar, so the ticket has a face on it. */
  avatarUrl: string | null
  /** The number on the board, always ending in .5. */
  line: number
  /** The answer. Revealed after the call, never before. */
  score: number
  answer: OverUnderCall
  /**
   * What the whole league averaged that week, and who they played.
   *
   * Both are shown BEFORE the call, and both are deliberate help. A line on
   * its own is unreadable if you can't remember whether Week 4 that year was
   * a shootout or a bloodbath, so the week's average gives the number
   * somewhere to stand — a 118.5 line means one thing against a room that
   * averaged 95 and the opposite against one that averaged 130. The opponent
   * is context rather than evidence: it tells you which game this was, which
   * is often enough to remember it.
   *
   * Neither touches the fairness of the line (see drawQuestions): the pairing
   * and the coin are unchanged, the player simply knows more. That is the
   * point — the board was a coin flip for anyone whose memory of a specific
   * week had faded, which is everyone, about most weeks.
   */
  weekAverage: number
  oppTeamName: string | null
  oppManagerName: string
  /** Held back until the call — the opponent's SCORE would give the game
      away to anyone who remembers the result. */
  oppScore: number
  /** Whether the team won that game. Reveal only. */
  won: boolean
}

export type OverUnderDeal = {
  ok: true
  seed: string
  pool: { id: string; label: string; sublabel: string; leagueSlug: string | null }
  questions: OverUnderQuestion[]
  /** How many team-weeks the deck could have drawn from. */
  deckSize: number
}

export type OverUnderError = { ok: false; error: string; status: number }

/**
 * What a finished card is called.
 *
 * Ten calls means the bottom of the range is reachable by bad luck alone, so
 * nothing below halfway is written as an insult — five out of ten is what a
 * coin does, and the line for it says so rather than calling the reader
 * clueless for landing where chance puts most people.
 */
export function grade(hits: number): { title: string; line: string } {
  if (hits === ROUNDS) {
    return { title: 'The book is closed', line: 'Ten from ten. Nobody in this league can price you.' }
  }
  if (hits === 9) return { title: 'Sharp', line: 'One away from clean, and the one you missed will bother you.' }
  if (hits >= 7) return { title: 'You beat the book', line: 'Comfortably clear of a coin.' }
  if (hits === 6) return { title: 'A small edge', line: 'Ahead, but not by more than a good night explains.' }
  if (hits === 5) return { title: 'Exactly a coin', line: 'The lines did their job.' }
  if (hits >= 3) return { title: 'The book wins', line: 'Some weeks are unrecognisable years later.' }
  return { title: 'Fade yourself', line: 'Call the opposite next time and clean up.' }
}
