// Guess the Draft — the rules, and the deal.
//
// One manager's draft, printed with the name and the year taken off the top.
// You read the picks and say whose board that was, and when.
//
// Guessing only the year is the version this replaced, and it doesn't work.
// A league with five seasons has five possible answers and is exhausted in
// five rounds. Asking for both halves turns the answer space into
// managers x seasons — sixty-odd distinct puzzles in that same five-season
// league — and the two halves lean on each other: the players date the year,
// and the year narrows who was even in the league.
//
// Drafts are the evidence because they're the evidence that EXISTS: a draft
// is the one thing every platform export brings across, and the players date
// themselves, which is what makes the year half guessable at all. The other
// two ideas from the drawing board are a starting lineup (blocked, about two
// in five published seasons carry no weekly lineup history at all — see
// `lineupsKnown` in ./pool) and a bare standings line.
//
// The card `kind` field is kept so this shell, its scoring and its deal can
// back one of those if the data ever arrives. It would be a SIBLING game
// rather than a mode, though: the game is named for its evidence now, and a
// lineup round inside something called Guess the Draft would be a lie.
//
// Unlike Roster Roulette this is a LEAGUE game and cannot be played site-wide
// or combined: naming a stranger off their draft is not a puzzle, it's a
// blank. That's a feature — it's the one thing on the Games Page that only
// works if you have an almanac of your own.
//
// This file is the RULES and the shapes, and holds no imports on purpose: the
// board is a client component and needs the scoring constants, so anything
// reaching for `fs` or the database in here would drag the whole server half
// into the browser bundle. The dealer lives next door in ./guessDraftDeal, the
// same way ./roulette and ./deal split Roster Roulette.

/** Cards dealt per game. */
export const ROUNDS = 8

/** How many of a manager's picks the draft card shows. */
export const PICKS_SHOWN = 8

/** Points for naming the manager, the year, and both in one round. */
export const PTS_MANAGER = 1
export const PTS_YEAR = 1
export const PTS_SWEEP = 1
export const PTS_PER_ROUND = PTS_MANAGER + PTS_YEAR + PTS_SWEEP
export const PTS_PERFECT = ROUNDS * PTS_PER_ROUND

// Below these the game gives itself away. Three managers and one season is a
// coin flip dressed up as a puzzle, and a player who works that out feels
// cheated rather than clever.
export const MIN_MANAGERS = 4
export const MIN_YEARS = 2

export type CluePick = {
  round: number
  name: string
  pos: string
  nflTeam: string | null
}

/** What the reader is shown, with the answer taken out. */
export type DraftCard = {
  key: string
  kind: 'draft'
  picks: CluePick[]
  /** The answer. Sent with the card — see the note on cheating below. */
  answer: {
    managerId: string
    year: number
    teamName: string | null
    wins: number
    losses: number
    ties: number
    finalRank: number | null
    isChampion: boolean
  }
}

export type GuessDraftDeal = {
  ok: true
  seed: string
  pool: { id: string; label: string; sublabel: string; leagueSlug: string | null }
  /** The answer set for the manager half, in league order. */
  managers: { id: string; name: string }[]
  /** The answer set for the year half, oldest first. */
  years: number[]
  cards: DraftCard[]
  /** How many manager-seasons the deck could have dealt from. */
  deckSize: number
}

export type GuessDraftError = { ok: false; error: string; status: number }

// The answers ride down with the cards, which means a determined reader can
// read them out of the page source. That's a deliberate trade and the same
// one every daily word game makes: this is a diversion between friends with
// no leaderboard and nothing to win, and the alternative — a round trip per
// guess — would put a network hop between pressing a name and seeing whether
// it was right. If a leaderboard ever lands, the seed is enough to re-deal
// and re-score the run server-side, so scores can be checked then without
// changing how the game plays now.

