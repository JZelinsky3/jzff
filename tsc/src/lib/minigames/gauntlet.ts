// The Gauntlet — the rules and the shapes.
//
// One question at a time, always the same question: these two teams played in
// this week of this season, and one of them won. Which one? Call it right and
// you're asked again. Call it wrong and the run is over.
//
// The whole design is the second half of that sentence. Roster Roulette and
// Guess the Draft both let you finish a bad run — you play out the wheel, you
// play out the eight cards, and the number at the end is a sum. A streak isn't
// a sum, it's a survival, and the reason it's worth building alongside the
// others is that it produces the one score that needs no calibration at all.
// Roulette needed a simulated benchmark before "good" meant anything. Eleven
// in a row means eleven in a row.
//
// It is also the game with the LOWEST bar to entry of anything on the page,
// which is the other reason it exists. Roulette needs rank files for the
// season and a roster deep enough to draft from; Guess the Draft needs drafts,
// which UDFA leagues are never sent. This needs two teams and a final score.
// A league that synced ten minutes ago with a single season on the books can
// play it, which makes it the natural front door for a league that just
// arrived. See the note on stages in the sync route.
//
// This file holds no imports on purpose, the same as ./guessDraft: the board
// is a client component and reads these constants, so an `fs` or supabase
// import here would drag the server half into the browser bundle.

/**
 * Two ways to play, because sudden death alone is a bad deal.
 *
 * `endless` is the original: keep calling until you miss. It is the purest
 * version and it is also the one that can end four seconds after it started,
 * and then make you wait on a fresh deck before you can try again. That is a
 * miserable loop, and the reason for the second mode.
 *
 * `ten` is a fixed card of ten. A miss costs you one of ten instead of the
 * night, so a run always lasts long enough to be worth having played, and the
 * score is a number you can hold up against somebody else's. It is the mode a
 * new player should meet first.
 *
 * (The other half of the fix isn't here: the board prefetches the next deck
 * while you're still playing, so "Go again" is instant either way.)
 */
export type GauntletMode = 'endless' | 'ten'

export function isGauntletMode(v: string | null | undefined): v is GauntletMode {
  return v === 'endless' || v === 'ten'
}

/** A fixed card's length. */
export const SET_ROUNDS = 10

/**
 * How far `endless` can actually run.
 *
 * It can't be infinite — the deck is one league's finite history and the
 * answers ride down with it. A hundred sits far beyond where runs end: a
 * caller genuinely reading the room is beaten by variance long before this, so
 * the cap is invisible in practice and reaching it is a real thing to have
 * done. Small leagues cap out at their own deck size, which is fine and says
 * so on the final card.
 */
export const ENDLESS_ROUNDS = 100

export function roundsFor(mode: GauntletMode): number {
  return mode === 'ten' ? SET_ROUNDS : ENDLESS_ROUNDS
}

/**
 * Fewest decided matchups a league needs before the game will deal.
 *
 * Below this the deck starts repeating inside a single run, and being asked
 * the same game twice tells you the answer to the second one. Twelve is about
 * a season and a half for a ten-team league, so a league with one year on the
 * books still qualifies.
 */
export const MIN_DECK = 12

/** One side of a matchup, as the reader sees it before calling. */
export type GauntletSide = {
  managerId: string
  managerName: string
  teamName: string | null
  /** Record going INTO this week, regular season only. See the dealer.
      Hidden by the board until the call is made. */
  wins: number
  losses: number
  ties: number
  /** Per-season avatar. The board is two names and a number without it, and
      a face is the cheapest thing that makes a fixture look like a fixture. */
  avatarUrl: string | null
}

export type GauntletQuestion = {
  key: string
  year: number
  week: number
  isPlayoff: boolean
  isChampionship: boolean
  a: GauntletSide
  b: GauntletSide
  /** Which side won. */
  answer: 'a' | 'b'
  /** Revealed after the call, never before. */
  scoreA: number
  scoreB: number
}

export type GauntletDeal = {
  ok: true
  seed: string
  mode: GauntletMode
  pool: { id: string; label: string; sublabel: string; leagueSlug: string | null }
  questions: GauntletQuestion[]
  /** How many decided matchups the deck could have drawn from. */
  deckSize: number
}

export type GauntletError = { ok: false; error: string; status: number }

/** Reads a side's record as a line. Ties are dropped when there are none,
    which is almost always, and a "6-2-0" reads like a typo. */
export function recordLine(side: GauntletSide): string {
  return side.ties > 0
    ? `${side.wins}-${side.losses}-${side.ties}`
    : `${side.wins}-${side.losses}`
}

/**
 * What a finished run is called.
 *
 * Written to be said out loud by someone reporting their own number, so they
 * climb rather than congratulate: nobody quotes a line that pats them on the
 * head for getting three.
 */
export function streakGrade(streak: number, cleared = false): { title: string; line: string } {
  if (cleared) {
    return {
      title: 'Cleared the gauntlet',
      line: 'You ran out of league before the league ran out of you.',
    }
  }
  if (streak >= 25) return { title: 'Total recall', line: 'You have been keeping notes.' }
  if (streak >= 15) return { title: 'A long run', line: 'That is further than anyone gets by guessing.' }
  if (streak >= 10) return { title: 'Double figures', line: 'You know how this room plays.' }
  if (streak >= 6) return { title: 'A good run', line: 'Far enough to be annoyed it ended.' }
  if (streak >= 3) return { title: 'Warm', line: 'Something to build on.' }
  if (streak >= 1) return { title: 'Short', line: 'The first one is the easy one.' }
  return { title: 'Out at the first', line: 'It happens. Go again.' }
}

/**
 * What a fixed card of ten is called. Separate from the streak grades because
 * they measure different things — ten out of ten is a clean sheet, whereas a
 * ten-long STREAK is barely a warm-up — and sharing one ladder between them
 * would flatter one mode and insult the other.
 */
export function setGrade(hits: number): { title: string; line: string } {
  if (hits === SET_ROUNDS) return { title: 'A perfect card', line: 'Ten from ten. You were there for all of it.' }
  if (hits === 9) return { title: 'One away', line: 'And you already know which one.' }
  if (hits >= 7) return { title: 'You know this room', line: 'Comfortably better than guessing.' }
  if (hits === 6) return { title: 'A small edge', line: 'Ahead, but not by much.' }
  if (hits === 5) return { title: 'Exactly a coin', line: 'Half of these were news to you.' }
  if (hits >= 3) return { title: 'Hazy', line: 'Some seasons blur together.' }
  return { title: 'A stranger here', line: 'Sit in on a season sometime.' }
}

// The answers ride down with the questions, the same deliberate trade Guess
// the Draft makes and for the same reason: a round trip per call would put a
// network hop between pressing a name and finding out, which on a game whose
// whole texture is "again, again, again" is the difference between a habit and
// a chore. There is nothing to win. If a leaderboard ever lands, the seed is
// enough to re-deal and re-score the run server-side, and THEN the questions
// would have to be served one at a time — a streak board is worth cheating on
// in a way that a private diversion is not.
