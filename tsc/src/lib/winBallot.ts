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

/** One filed ballot: who sent it, and what they called all twelve. */
export type BallotRecord = { name: string; picks: Picks }

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

/**
 * Which ballots set a line. `all` counts everyone. `outsiders` throws out a
 * manager's own projection of themselves, so nobody has a hand in their own
 * number: eleven opinions per line instead of twelve.
 */
export type BoardBasis = 'all' | 'outsiders'

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
  /** What this manager called their own season, if they filed. */
  self: number | null
}

/** Turn every submitted ballot into the board, highest line first. */
export function buildBoard(
  roster: BallotManager[],
  ballots: BallotRecord[],
  basis: BoardBasis = 'all',
): BoardLine[] {
  return roster
    .map((m) => {
      const own = ballots.find((b) => b.name === m.name)
      const self = Number.isFinite(own?.picks[m.name]) ? (own!.picks[m.name] as number) : null
      const counted = basis === 'outsiders' ? ballots.filter((b) => b.name !== m.name) : ballots
      const picks = counted
        .map((b) => b.picks[m.name])
        .filter((v): v is number => Number.isFinite(v))
      if (picks.length === 0) {
        return { name: m.name, conference: m.conference, mean: 0, line: 0, high: 0, low: 0, gap: 0, count: 0, model: m.model, self }
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
        self,
      }
    })
    .sort((a, b) => b.line - a.line)
}

// ─────────────────────────────────────────────────────────────────────────
// Phase two: the vote. The board gets locked, and then everybody comes back
// and takes a side on every line but their own, calls four props, and picks
// the rivalry games.
// ─────────────────────────────────────────────────────────────────────────

/**
 * The lines as they were the moment the room locked them. Frozen rather than
 * recomputed, because a ballot filed late must not slide a number somebody
 * has already voted against.
 */
export type LockedBoard = {
  basis: BoardBasis
  /** manager name -> line. Always a half, never a whole number. */
  lines: Record<string, number>
  /**
   * manager name -> the ballot range behind that line. A 6.5 everybody
   * agreed on is a different bet from a 6.5 drawn from 3s and 10s, so the
   * card shows both. Empty on a board locked before the column existed.
   */
  spread: Record<string, { high: number; low: number }>
  ballotCount: number
  lockedAt: string
  /** The room's picks stay sealed until Joey opens them. */
  revealed: boolean
}

/**
 * What the twelve projections add up to. A season holds exactly 84 wins, so
 * a board that sums to 91 is a room that likes everybody.
 */
export function boardTotals(board: BoardLine[]): { mean: number; line: number } {
  return {
    mean: board.reduce((a, l) => a + l.mean, 0),
    line: board.reduce((a, l) => a + l.line, 0),
  }
}

export type Side = 'over' | 'under'

export const RIVALRIES: ReadonlyArray<readonly [string, string]> = [
  ['Chris', 'Joey'],
  ['Kyle', 'Sean'],
  ['Cat', 'Isaac'],
  ['Connie', 'Mason'],
  ['Charlie', 'Luke'],
  ['Evan', 'Ricci'],
]

/** Stable key for a rivalry game, so pair order can never flip on a re-render. */
export function rivalryKey(pair: readonly [string, string]): string {
  return [...pair].sort().join('|')
}

export type PropKind = 'manager' | 'conference'
export type Prop = { key: string; ask: string; note: string; kind: PropKind }

// Four calls that settle themselves off the finished season, so nobody has to
// argue about who was right in January.
export const PROPS: readonly Prop[] = [
  { key: 'champion',   ask: 'Who wins it',            note: 'The 2026 champion', kind: 'manager' },
  { key: 'last',       ask: 'Who finishes last',      note: 'Twelfth, all by themselves', kind: 'manager' },
  { key: 'points',     ask: 'Who scores the most',    note: 'Most total points, title or not', kind: 'manager' },
  { key: 'conference', ask: 'Which conference wins',  note: 'The head-to-head series between Whole and Skim', kind: 'conference' },
]

export type VoteCard = {
  /** manager name -> side. Every manager but the voter. */
  lines: Record<string, Side>
  /** prop key -> a manager name, or a conference. */
  props: Record<string, string>
  /** rivalry key -> the name they have winning it. */
  rivalry: Record<string, string>
}

export const VOTE_PIECES = ['lines', 'props', 'rivalry'] as const

/** How many calls a voter owes: eleven lines, four props, six rivalry games. */
export function voteSize(roster: BallotManager[]): number {
  return roster.length - 1 + PROPS.length + RIVALRIES.length
}

/** Everything the voter still hasn't answered, in card order. */
export function missingFromVote(roster: BallotManager[], who: string, card: VoteCard) {
  return {
    lines: roster.filter((m) => m.name !== who && card.lines[m.name] !== 'over' && card.lines[m.name] !== 'under').map((m) => m.name),
    props: PROPS.filter((p) => !card.props[p.key]).map((p) => p.key),
    rivalry: RIVALRIES.filter((r) => !card.rivalry[rivalryKey(r)]).map((r) => rivalryKey(r)),
  }
}

/**
 * Validate a whole card. A voter's own line is not merely optional, it is
 * refused: the roster skips it on the way in, and a card that carries one
 * anyway was not built by this page.
 */
export function validateVote(
  roster: BallotManager[],
  who: string,
  card: unknown,
): { ok: true; card: VoteCard } | { ok: false; error: string } {
  if (!card || typeof card !== 'object') return { ok: false, error: 'Nothing was sent.' }
  const raw = card as Partial<VoteCard>
  const names = new Set(roster.map((m) => m.name))

  const lines: Record<string, Side> = {}
  for (const m of roster) {
    if (m.name === who) continue
    const v = raw.lines?.[m.name]
    if (v !== 'over' && v !== 'under') return { ok: false, error: `No side on ${m.name}'s line yet.` }
    lines[m.name] = v
  }
  if (raw.lines && Object.keys(raw.lines).some((n) => !names.has(n) || n === who)) {
    return { ok: false, error: 'That card has a line on it that is not yours to call.' }
  }

  const props: Record<string, string> = {}
  for (const p of PROPS) {
    const v = raw.props?.[p.key]
    if (typeof v !== 'string' || !v) return { ok: false, error: `The "${p.ask}" prop is still blank.` }
    const good = p.kind === 'manager' ? names.has(v) : v === 'Whole' || v === 'Skim'
    if (!good) return { ok: false, error: `"${v}" isn't an answer to "${p.ask}".` }
    props[p.key] = v
  }

  const rivalry: Record<string, string> = {}
  for (const pair of RIVALRIES) {
    const key = rivalryKey(pair)
    const v = raw.rivalry?.[key]
    if (typeof v !== 'string' || !pair.includes(v)) {
      return { ok: false, error: `Pick a winner in ${pair[0]} vs ${pair[1]}.` }
    }
    rivalry[key] = v
  }

  return { ok: true, card: { lines, props, rivalry } }
}

export type VoteRecord = { name: string; card: VoteCard }

export type LineTally = {
  name: string
  conference: Conference
  line: number
  over: number
  under: number
  count: number
  /** Who the room is on. A dead even split has no side. */
  lean: Side | 'split'
  /** Share on the leaning side, 0.5 to 1. Drives how loud a row reads. */
  edge: number
}

/** The room's side on every line, most lopsided first. */
export function tallyLines(
  roster: BallotManager[],
  board: LockedBoard,
  votes: VoteRecord[],
): LineTally[] {
  return roster
    .map((m) => {
      const sides = votes.map((v) => v.card.lines[m.name]).filter((s): s is Side => s === 'over' || s === 'under')
      const over = sides.filter((s) => s === 'over').length
      const under = sides.length - over
      const count = sides.length
      return {
        name: m.name,
        conference: m.conference,
        line: board.lines[m.name] ?? 0,
        over,
        under,
        count,
        lean: (over === under ? 'split' : over > under ? 'over' : 'under') as Side | 'split',
        edge: count === 0 ? 0.5 : Math.max(over, under) / count,
      }
    })
    .sort((a, b) => b.edge - a.edge || b.count - a.count)
}

// ─────────────────────────────────────────────────────────────────────────
// The recap: everything the league said about one manager, gathered into a
// single card. Ballots, the line they made, the side the room took on it,
// the props they got named in, their rivalry game, and the record behind it.
// ─────────────────────────────────────────────────────────────────────────

/** A win total as a record, for a season of GAMES games. */
export function asRecord(wins: number): string {
  const w = Math.round(wins)
  return `${w}-${GAMES - w}`
}

/** Wins out of a "10-4" string. */
function winsOf(record: string): number {
  return Number.parseInt(record, 10) || 0
}

export type RecapPick = { from: string; wins: number; self: boolean; counted: boolean }
export type RecapProp = { key: string; ask: string; count: number }

export type ManagerRecap = {
  manager: BallotManager
  /** The line as locked, never recomputed. */
  line: number
  /** Where the ballots sit now. Can drift off the line if one filed late. */
  mean: number
  high: number
  low: number
  gap: number
  /** Ballots behind the mean, on the board's basis. */
  count: number
  self: number | null
  /** Every ballot's number on them, highest first. */
  picks: RecapPick[]
  over: number
  under: number
  cast: number
  lean: Side | 'split'
  /** The three manager props, and how many named this manager in each. */
  props: RecapProp[]
  /** How the room called their conference's series. */
  conference: { took: number; cast: number } | null
  rivalry: { opponent: string; mine: number; theirs: number } | null
  modelRecord: string
  /** Line minus the model. Positive means the room likes them more than the math does. */
  vsModel: number
  /** Line minus what they actually won last season. */
  vsLast: number
}

/** Everything the league said about one manager. */
export function buildRecap(
  roster: BallotManager[],
  ballots: BallotRecord[],
  board: LockedBoard,
  votes: VoteRecord[],
  name: string,
): ManagerRecap | null {
  const manager = roster.find((m) => m.name === name)
  if (!manager) return null

  // Every ballot's number on them, self included and flagged. `counted` is
  // whether that ballot had a hand in the line, which on an outsiders board
  // is everybody but the manager themselves.
  const picks: RecapPick[] = ballots
    .filter((b) => Number.isFinite(b.picks[name]))
    .map((b) => ({
      from: b.name,
      wins: b.picks[name],
      self: b.name === name,
      counted: board.basis === 'all' || b.name !== name,
    }))
    .sort((a, b) => b.wins - a.wins || a.from.localeCompare(b.from))

  const counted = picks.filter((p) => p.counted).map((p) => p.wins)
  const mean = counted.length ? counted.reduce((a, b) => a + b, 0) / counted.length : 0
  const frozen = board.spread?.[name]
  const high = counted.length ? Math.max(...counted) : frozen?.high ?? 0
  const low = counted.length ? Math.min(...counted) : frozen?.low ?? 0

  const sides = votes.map((v) => v.card.lines[name]).filter((s): s is Side => s === 'over' || s === 'under')
  const over = sides.filter((s) => s === 'over').length
  const under = sides.length - over

  const props = PROPS.filter((p) => p.kind === 'manager').map((p) => ({
    key: p.key,
    ask: p.ask,
    count: votes.filter((v) => v.card.props[p.key] === name).length,
  }))

  const confVotes = votes.filter((v) => v.card.props.conference)
  const conference = confVotes.length
    ? { took: confVotes.filter((v) => v.card.props.conference === manager.conference).length, cast: confVotes.length }
    : null

  const pair = RIVALRIES.find((r) => r.includes(name))
  let rivalry: ManagerRecap['rivalry'] = null
  if (pair) {
    const opponent = pair[0] === name ? pair[1] : pair[0]
    const key = rivalryKey(pair)
    const called = votes.map((v) => v.card.rivalry[key]).filter(Boolean)
    rivalry = {
      opponent,
      mine: called.filter((c) => c === name).length,
      theirs: called.filter((c) => c === opponent).length,
    }
  }

  const line = board.lines[name] ?? 0

  return {
    manager,
    line,
    mean,
    high,
    low,
    gap: high - low,
    count: counted.length,
    self: picks.find((p) => p.self)?.wins ?? null,
    picks,
    over,
    under,
    cast: sides.length,
    lean: over === under ? 'split' : over > under ? 'over' : 'under',
    props,
    conference,
    rivalry,
    modelRecord: asRecord(manager.model),
    vsModel: line - manager.model,
    vsLast: line - winsOf(manager.lastRecord),
  }
}

/** Vote counts for one prop or rivalry game, most-picked first. */
export function tallyChoices(votes: VoteRecord[], pick: (c: VoteCard) => string | undefined) {
  const counts = new Map<string, number>()
  for (const v of votes) {
    const answer = pick(v.card)
    if (answer) counts.set(answer, (counts.get(answer) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([answer, count]) => ({ answer, count }))
    .sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer))
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
