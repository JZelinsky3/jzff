// Blind Item — the rules, and the deal.
//
// A newspaper blind item is a story printed with the name taken out. This is
// the same trick played on a league's own archive: you're shown one team's
// evidence with the identifying details stripped, and you name the manager
// AND the year.
//
// Guessing only the year is the version this replaced, and it doesn't work.
// A league with five seasons has five possible answers and is exhausted in
// five rounds. Asking for both halves turns the answer space into
// managers x seasons — sixty-odd distinct puzzles in that same five-season
// league — and the two halves lean on each other: the players date the year,
// and the year narrows who was even in the league.
//
// Three kinds of evidence are planned; this ships the first:
//
//   • draft   — the manager's first eight picks that year. Best data
//               coverage of the three (a draft is the one thing every
//               platform export brings across) and the most recognisable,
//               since players date themselves.
//   • lineup  — an end-of-year starting lineup. Blocked on coverage: about
//               two in five published seasons carry no weekly lineup history
//               at all. See `lineupsKnown` in ./pool.
//   • season  — record, points for and against, final finish. Hardest, and
//               the one closest to the original idea.
//
// The card `kind` field exists so the other two can be added to the same
// shell, the same scoreboard and the same deal without a second game.
//
// Unlike Roster Roulette this is a LEAGUE game and cannot be played site-wide
// or combined: naming a stranger off their draft is not a puzzle, it's a
// blank. That's a feature — it's the one thing on the Games Page that only
// works if you have an almanac of your own.
//
// This file is the RULES and the shapes, and holds no imports on purpose: the
// board is a client component and needs the scoring constants, so anything
// reaching for `fs` or the database in here would drag the whole server half
// into the browser bundle. The dealer lives next door in ./blindDeal, the
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

export type BlindPick = {
  round: number
  name: string
  pos: string
  nflTeam: string | null
}

/** What the reader is shown, with the answer taken out. */
export type BlindCard = {
  key: string
  kind: 'draft'
  picks: BlindPick[]
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

export type BlindDeal = {
  ok: true
  seed: string
  pool: { id: string; label: string; sublabel: string; leagueSlug: string | null }
  /** The answer set for the manager half, in league order. */
  managers: { id: string; name: string }[]
  /** The answer set for the year half, oldest first. */
  years: number[]
  cards: BlindCard[]
  /** How many manager-seasons the deck could have dealt from. */
  deckSize: number
}

export type BlindError = { ok: false; error: string; status: number }

// The answers ride down with the cards, which means a determined reader can
// read them out of the page source. That's a deliberate trade and the same
// one every daily word game makes: this is a diversion between friends with
// no leaderboard and nothing to win, and the alternative — a round trip per
// guess — would put a network hop between pressing a name and seeing whether
// it was right. If a leaderboard ever lands, the seed is enough to re-deal
// and re-score the run server-side, so scores can be checked then without
// changing how the game plays now.

