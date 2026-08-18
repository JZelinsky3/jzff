// The Leftovers: the questions, the roster, and the scoring.
//
// A spin-off of THE MILK ORDER, the twelve-day 2026 power ranking countdown.
// Each day of that countdown ends on a tease card carrying one statistic that
// belongs to exactly one manager. Six of those got spent. This is everything
// that was mined and did not fit: twenty questions, four names each.
//
// Like src/lib/winBallot.ts, the roster is a fixed list rather than a
// managers-table read, because the game is played by whoever holds the link
// with no account and so no identity to resolve. Names here are exactly what
// lands in leftovers_runs.manager_name.
//
// Every number below is computed off the league's own history: seven seasons
// of weekly matchups (2019-2025), all seven drafts graded against where each
// player actually finished that year, and the season standings. The one rule
// the countdown settled on and this inherits: NOTHING turns on where a
// manager finished last season. That is the single fact everybody in a league
// already knows, which makes it an answer rather than a question.

export const EDITION = 'pams-2026'

/** The twelve, so a player claims a name before seeing a single answer. */
export const ROSTER = [
  'Cat', 'Charlie', 'Chris', 'Connie', 'Evan', 'Isaac',
  'Joey', 'Kyle', 'Luke', 'Mason', 'Ricci', 'Sean',
] as const

/** Which vein a question came out of, for the three-way split on the result. */
export type Vein = 'Luck' | 'Records' | 'Draft'

export type Question = {
  /** The question itself. */
  q: string
  /** Four names, the right one among them. Four, not twelve: a one-in-twelve
   *  guess on an obscure number is a coin toss nobody enjoys losing, and the
   *  shortlist is what makes an honest guess possible. */
  options: string[]
  answer: string
  /** The number behind it, shown the moment they answer. This is the actual
   *  product: the score is a reason to read these. */
  why: string
  vein: Vein
}

export const QUESTIONS: Question[] = [
  {
    vein: 'Luck',
    q: 'Who has 21 wins in weeks he finished in the bottom half of the league?',
    options: ['Charlie', 'Luke', 'Connie', 'Cat'],
    answer: 'Charlie',
    why: 'Twenty-one times he was in the bottom six for the week and won anyway. Connie is next on 13, Kyle has 7. Charlie is also the luckiest man in league history overall, <b>five and a half wins</b> above what his scores earned him.',
  },
  {
    vein: 'Records',
    q: 'Who has a losing record against nine of the other eleven managers?',
    options: ['Luke', 'Charlie', 'Cat', 'Evan'],
    answer: 'Luke',
    why: 'Nine of the eleven are above water against him. Isaac is the far end of the same measure: <b>one</b> man in this league holds a winning record over Isaac.',
  },
  {
    vein: 'Draft',
    q: 'Who has never taken a kicker or a defence before round 13, in seven drafts?',
    options: ['Joey', 'Chris', 'Sean', 'Isaac'],
    answer: 'Joey',
    why: 'Zero, in 105 picks. Connie, Charlie and Luke have <b>seven each</b>.',
  },
  {
    vein: 'Luck',
    q: 'Who is 21-4 when the opponent scores under 100, the worst rate in the league?',
    options: ['Connie', 'Kyle', 'Cat', 'Charlie'],
    answer: 'Connie',
    why: 'Four times he has lost a game in which the other team could not reach 100. Joey has never lost one, at <b>12-0</b>.',
  },
  {
    vein: 'Records',
    q: 'Who is 12-19 against the five men who have never won a ring?',
    options: ['Kyle', 'Cat', 'Luke', 'Charlie'],
    answer: 'Kyle',
    why: 'Four playoff trips, and a losing record against the people who have won nothing. Sean is <b>25-12</b> against that same five.',
  },
  {
    vein: 'Draft',
    q: 'Whose first six rounds produce a startable player 71% of the time, and whose rounds nine to fifteen produce one 6% of the time?',
    options: ['Ricci', 'Chris', 'Isaac', 'Mason'],
    answer: 'Ricci',
    why: 'The best early drafter here and the worst late one. Kyle is the exact reverse: worst first five picks in the league, best late-round rate at <b>18%</b>.',
  },
  {
    vein: 'Luck',
    q: 'Who once spent ten straight weeks in the bottom half of the league?',
    options: ['Mason', 'Cat', 'Charlie', 'Luke'],
    answer: 'Mason',
    why: 'Ten in a row. Joey owns the other end with <b>eleven straight</b> weeks in the top half, and Charlie’s best run up there is three.',
  },
  {
    vein: 'Records',
    q: 'Who has the only winning record in the league against teams that made the bracket?',
    options: ['Isaac', 'Joey', 'Sean', 'Mason'],
    answer: 'Isaac',
    why: '<b>23-22</b>. Charlie is 14-33 against the same teams and Evan is 7-18.',
  },
  {
    vein: 'Draft',
    q: 'Who has the highest hit rate of any drafter here, 39% of every pick he has ever made?',
    options: ['Chris', 'Joey', 'Mason', 'Ricci'],
    answer: 'Chris',
    why: 'His first five picks finish <b>71st</b> on average, the best in the league, and his squads leave the draft with 2,249 points a year.',
  },
  {
    vein: 'Luck',
    q: 'Who has run into the league’s highest scorer fifteen times, more than anyone?',
    options: ['Cat', 'Connie', 'Charlie', 'Joey'],
    answer: 'Cat',
    why: 'Mason is the opposite draw entirely: the week’s top scorer <b>three times</b>, the week’s lowest scorer fourteen.',
  },
  {
    vein: 'Draft',
    q: 'Who had the worst draft in league history and finished third that year?',
    options: ['Sean', 'Luke', 'Kyle', 'Charlie'],
    answer: 'Sean',
    why: '2023. Graded against where every player actually finished, it is the worst class anybody has assembled here. He came <b>third</b> anyway.',
  },
  {
    vein: 'Records',
    q: 'Which manager has never beaten Charlie?',
    options: ['Evan', 'Luke', 'Kyle', 'Isaac'],
    answer: 'Evan',
    why: '<b>0-6</b>. It is the only winless pair in the league.',
  },
  {
    vein: 'Luck',
    q: 'Who has never lost a game in which the opponent scored under 100?',
    options: ['Joey', 'Sean', 'Mason', 'Chris'],
    answer: 'Joey',
    why: '<b>12-0</b>. Every other man in the league has dropped at least one, and Connie has dropped four.',
  },
  {
    vein: 'Draft',
    q: 'Who has drafted Saquon Barkley four separate times?',
    options: ['Mason', 'Sean', 'Joey', 'Kyle'],
    answer: 'Mason',
    why: 'Including <b>third overall</b> in 2020, the year Barkley finished 419th. It is the worst pick anyone has made here.',
  },
  {
    vein: 'Records',
    q: 'Who has been the number one seed twice and has never won a title?',
    options: ['Sean', 'Kyle', 'Chris', 'Cat'],
    answer: 'Sean',
    why: 'Top seed in 2021 and 2024, finished <b>3rd and 4th</b>. Kyle’s best entry is the 2 seed in 2022, and he finished 4th.',
  },
  {
    vein: 'Luck',
    q: 'Who faced 1,879 points in one season, the most anybody has had thrown at them, and went 4-10?',
    options: ['Isaac', 'Joey', 'Evan', 'Cat'],
    answer: 'Isaac',
    why: '2024. Joey’s 2024 is second at <b>1,873</b>, and he went 5-9. The two hardest schedules ever run landed in the same year.',
  },
  {
    vein: 'Draft',
    q: 'Whose first five picks finish 146th on average, the worst in the league?',
    options: ['Kyle', 'Sean', 'Luke', 'Charlie'],
    answer: 'Kyle',
    why: '146th, with Sean next at 137th. Chris is best at <b>71st</b>.',
  },
  {
    vein: 'Luck',
    q: 'Who has eleven losses in games he scored 130 or more?',
    options: ['Cat', 'Connie', 'Chris', 'Joey'],
    answer: 'Cat',
    why: 'Connie has 10. Mason and Charlie have <b>two each</b>.',
  },
  {
    vein: 'Draft',
    q: 'Who had the best draft anyone has ever had, and lost the final that year?',
    options: ['Joey', 'Chris', 'Isaac', 'Connie'],
    answer: 'Joey',
    why: '2021, the only class that has ever graded positive against where the players finished. He lost the final to <b>Chris</b>.',
  },
  {
    vein: 'Records',
    q: 'Who scores 24 points a game more in the last three weeks of a season than he does in the rest of it?',
    options: ['Evan', 'Joey', 'Ricci', 'Mason'],
    answer: 'Evan',
    why: '115.5 a week through the season, <b>139.5</b> once it gets to the closing weeks. Joey is next at plus 8.2, and Cat drops 14.3.',
  },
]

export const VEINS: Vein[] = ['Luck', 'Records', 'Draft']

/** The label a vein carries on the result split. */
export function veinLabel(v: Vein): string {
  return v === 'Draft' ? 'The draft' : v
}

/** One filed run: the name on it and what they answered. */
export type RunRecord = { name: string; picks: Record<string, string>; score: number }

/**
 * Score a set of picks. The server owns this: the client submits the names it
 * chose and never a total, so a run's score is always something the database
 * can stand behind. Same rule the games-page leaderboards run on.
 */
export function scorePicks(picks: Record<string, string>): number {
  let n = 0
  QUESTIONS.forEach((q, i) => {
    if (picks[String(i)] === q.answer) n += 1
  })
  return n
}

/** A submission is only valid if every answer is one of that question's four. */
export function validatePicks(picks: unknown): { ok: false; error: string } | { ok: true; picks: Record<string, string> } {
  if (!picks || typeof picks !== 'object') return { ok: false, error: 'No answers were sent.' }
  const raw = picks as Record<string, unknown>
  const out: Record<string, string> = {}
  for (let i = 0; i < QUESTIONS.length; i += 1) {
    const v = raw[String(i)]
    if (typeof v !== 'string') return { ok: false, error: `Question ${i + 1} has no answer.` }
    if (!QUESTIONS[i].options.includes(v)) return { ok: false, error: `Question ${i + 1} has an answer that was never offered.` }
    out[String(i)] = v
  }
  return { ok: true, picks: out }
}

/**
 * How the room did on one question: of everybody who has finished, how many
 * got it. This is the part worth reading. A question eleven of twelve miss
 * says more about the league than anybody's total does.
 */
export function roomSplit(runs: RunRecord[], index: number): { got: number; of: number } | null {
  const done = runs.filter((r) => typeof r.picks[String(index)] === 'string')
  if (!done.length) return null
  return { got: done.filter((r) => r.picks[String(index)] === QUESTIONS[index].answer).length, of: done.length }
}

/** Score bands. Milk, because everything in this series is. */
export const BANDS: { from: number; name: string; line: string }[] = [
  { from: 19, name: 'Route manager', line: 'You have read the ledger. There is nothing left to tell you.' },
  { from: 16, name: 'Full crate', line: 'Comfortably better than the room. Two or three of these nobody gets.' },
  { from: 12, name: 'Half gallon', line: 'Respectable. You know the league, you just do not know the margins.' },
  { from: 8, name: 'Skimmed', line: 'You watch the scores and not much else.' },
  { from: 0, name: 'Left on the step', line: 'In fairness, most of this was built to be unguessable.' },
]

export function bandFor(score: number) {
  return BANDS.find((b) => score >= b.from) ?? BANDS[BANDS.length - 1]
}

/**
 * The board. Equal scores share a position, so a three-way tie reads as three
 * firsts rather than 1, 2, 3; ties break to whoever filed first.
 */
export function standings(runs: RunRecord[]): { pos: number; name: string; score: number }[] {
  const sorted = [...runs].sort((a, b) => b.score - a.score)
  let pos = 0
  let last: number | null = null
  return sorted.map((r, i) => {
    if (r.score !== last) { pos = i + 1; last = r.score }
    return { pos, name: r.name, score: r.score }
  })
}
