// Preseason win-total ballot: the roster, the reference figures, and the
// line math. Shared by the ballot itself and the commissioner's room.
//
// The roster is a fixed list rather than a managers-table read because the
// ballot is filled in by whoever holds the link, with no account and so no
// identity to resolve. Names here are exactly what lands in
// win_ballots.manager_name.

export const GAMES = 14
export const SEASON = 2026
// Twelve teams x fourteen games / two. Every win that exists in a season.
export const TOTAL_WINS = 84
// How far a board can drift off 84 before the ballot says something. Close
// is fine; exact was deliberately not required.
export const DRIFT = 6
// High-to-low ballot spread that marks a manager as one the room is split on.
export const SPLIT_GAP = 5

export type Conference = 'Whole' | 'Skim'

export type BallotManager = {
  name: string
  conference: Conference
  /** Best and worst season by win rate, as W-L plus the year. */
  best: string
  bestYear: number
  worst: string
  worstYear: number
  /** Career wins per season, scaled to a 14-game pace. */
  avgWins: number
  lastRecord: string
  career: string
  seasons: number
  /** Raw best/worst win counts, drawn as the range band on the scale. */
  bestWins: number
  worstWins: number
  /**
   * The model: half career pace, three tenths last season, two tenths pulled
   * toward a .500 team. Shown as an anchor, never prefilled as an answer.
   * The twelve of them sum to 84.5 against a season that holds 84.
   */
  model: number
}

// PA Milk Society, seven seasons of history (2019-2025). Averages are a
// 14-game pace and best/worst rank by win rate, because 2019 and 2020 were
// 13-game seasons. Alphabetical, so the ballot hands nobody a ranking to
// anchor on. This order is also the ballot's wire order (see encode below).
export const PAMS_ROSTER: BallotManager[] = [
  { name: 'Cat',     conference: 'Whole', best: '9-5',  bestYear: 2024, worst: '3-11', worstYear: 2021, avgWins: 6.7, lastRecord: '7-7',  career: '46-50', seasons: 7, bestWins: 9,  worstWins: 3, model: 6.9 },
  { name: 'Charlie', conference: 'Skim',  best: '8-6',  bestYear: 2023, worst: '4-9',  worstYear: 2020, avgWins: 6.7, lastRecord: '7-7',  career: '46-50', seasons: 7, bestWins: 8,  worstWins: 4, model: 6.9 },
  { name: 'Chris',   conference: 'Skim',  best: '10-4', bestYear: 2021, worst: '6-8',  worstYear: 2025, avgWins: 7.4, lastRecord: '6-8',  career: '51-45', seasons: 7, bestWins: 10, worstWins: 6, model: 6.9 },
  { name: 'Connie',  conference: 'Whole', best: '8-6',  bestYear: 2024, worst: '2-12', worstYear: 2022, avgWins: 6.1, lastRecord: '7-7',  career: '42-54', seasons: 7, bestWins: 8,  worstWins: 2, model: 6.6 },
  { name: 'Evan',    conference: 'Whole', best: '7-7',  bestYear: 2023, worst: '5-9',  worstYear: 2025, avgWins: 5.7, lastRecord: '5-9',  career: '17-25', seasons: 3, bestWins: 7,  worstWins: 5, model: 5.8 },
  { name: 'Isaac',   conference: 'Skim',  best: '11-3', bestYear: 2023, worst: '4-10', worstYear: 2024, avgWins: 7.8, lastRecord: '10-4', career: '46-37', seasons: 6, bestWins: 11, worstWins: 4, model: 8.3 },
  { name: 'Joey',    conference: 'Whole', best: '12-2', bestYear: 2022, worst: '4-10', worstYear: 2023, avgWins: 7.7, lastRecord: '7-7',  career: '53-43', seasons: 7, bestWins: 12, worstWins: 4, model: 7.4 },
  { name: 'Kyle',    conference: 'Whole', best: '10-4', bestYear: 2022, worst: '3-10', worstYear: 2019, avgWins: 6.7, lastRecord: '8-6',  career: '46-50', seasons: 7, bestWins: 10, worstWins: 3, model: 7.2 },
  { name: 'Luke',    conference: 'Skim',  best: '8-6',  bestYear: 2023, worst: '4-10', worstYear: 2025, avgWins: 6.4, lastRecord: '4-10', career: '38-45', seasons: 6, bestWins: 8,  worstWins: 4, model: 5.8 },
  { name: 'Mason',   conference: 'Skim',  best: '11-2', bestYear: 2019, worst: '4-10', worstYear: 2024, avgWins: 8.2, lastRecord: '10-4', career: '56-40', seasons: 7, bestWins: 11, worstWins: 4, model: 8.5 },
  { name: 'Ricci',   conference: 'Skim',  best: '10-4', bestYear: 2024, worst: '4-9',  worstYear: 2019, avgWins: 6.7, lastRecord: '7-7',  career: '46-50', seasons: 7, bestWins: 10, worstWins: 4, model: 6.9 },
  { name: 'Sean',    conference: 'Whole', best: '10-4', bestYear: 2021, worst: '6-8',  worstYear: 2025, avgWins: 8.2, lastRecord: '6-8',  career: '56-40', seasons: 7, bestWins: 10, worstWins: 6, model: 7.3 },
]

export type Picks = Record<string, number>

/**
 * The line for one manager: the mean of every ballot, to the nearest half.
 * A whole number would let a season land exactly on the line, so push it a
 * half win the way the room already leans, and up on a dead tie, since the
 * house should make you pay for the over.
 */
export function toLine(mean: number): number {
  const half = Math.round(mean * 2) / 2
  if (half % 1 !== 0) return half
  return mean >= half ? half + 0.5 : half - 0.5
}

export type BoardLine = {
  name: string
  conference: Conference
  mean: number
  line: number
  high: number
  low: number
  gap: number
  count: number
  model: number
}

/** Turn every submitted ballot into the board, highest line first. */
export function buildBoard(roster: BallotManager[], ballots: Picks[]): BoardLine[] {
  return roster
    .map((m) => {
      const picks = ballots
        .map((b) => b[m.name])
        .filter((v): v is number => Number.isFinite(v))
      if (picks.length === 0) {
        return { name: m.name, conference: m.conference, mean: 0, line: 0, high: 0, low: 0, gap: 0, count: 0, model: m.model }
      }
      const mean = picks.reduce((a, b) => a + b, 0) / picks.length
      const high = Math.max(...picks)
      const low = Math.min(...picks)
      return {
        name: m.name,
        conference: m.conference,
        mean,
        line: toLine(mean),
        high,
        low,
        gap: high - low,
        count: picks.length,
        model: m.model,
      }
    })
    .sort((a, b) => b.line - a.line)
}

/** Validate a submitted set of picks against the roster. */
export function validatePicks(roster: BallotManager[], picks: unknown): { ok: true; picks: Picks; total: number } | { ok: false; error: string } {
  if (!picks || typeof picks !== 'object') return { ok: false, error: 'No numbers were sent.' }
  const clean: Picks = {}
  for (const m of roster) {
    const v = (picks as Record<string, unknown>)[m.name]
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > GAMES) {
      return { ok: false, error: `${m.name} needs a whole number of wins between 0 and ${GAMES}.` }
    }
    clean[m.name] = v as number
  }
  const total = Object.values(clean).reduce((a, b) => a + b, 0)
  return { ok: true, picks: clean, total }
}
