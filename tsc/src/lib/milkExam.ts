// THE MILK EXAM: the questions, the roster, and the scoring.
//
// Twenty questions on seven years of one league, four names each.
//
// Internal note, and it matters until the countdown has finished: these came
// out of the same stat mining as THE MILK ORDER's daily tease cards, and are
// the ones that did not get used. NONE of that goes on the page. While the
// countdown is still running, saying so would tell the league which numbers
// are not coming, and it is production trivia either way.
//
// Like src/lib/winBallot.ts, the roster is a fixed list rather than a
// managers-table read, because the game is played by whoever holds the link
// with no account and so no identity to resolve. Names here are exactly what
// lands in exam_runs.manager_name.
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

/**
 * The full twelve on the measure a question was built from.
 *
 * People care about their own number more than they care about the answer, so
 * every result row can open into the whole league on that stat with the
 * reader's own line called out. `sort` is how the twelve are ordered and the
 * two tags name the ends: a bare "10-5" in a list looks like a random record
 * unless something says it is the worst one here.
 *
 * Rows are [name, what to print, what to sort on]. The sort key is separate
 * because a record sorts on win rate while printing as "21-4", and a draft
 * class sorts on its grade while printing with the year attached.
 */
export type StatTable = {
  label: string
  sort: 'desc' | 'asc' | 'rec'
  topTag: string
  botTag: string
  rows: [string, string, number][]
  /** A small qualifier per row, for stats where the sample is not the same
   *  size for everybody. Twenty-four points a game across eight weeks is not
   *  the same claim as across seventeen, and a table that hides that is
   *  quietly misleading. */
  subs?: Record<string, string>
}

export type Question = {
  /** The question itself. */
  q: string
  /** Where the number comes from, shown while they are choosing. It points
   *  at which corner of seven years of history to think about without
   *  narrowing the names, which is the difference between a clue and a tell. */
  source: string
  /** Four names, the right one among them. Four, not twelve: a one-in-twelve
   *  guess on an obscure number is a coin toss nobody enjoys losing, and the
   *  shortlist is what makes an honest guess possible. */
  options: string[]
  answer: string
  /** The number behind it, shown the moment they answer. This is the actual
   *  product: the score is a reason to read these. */
  why: string
  vein: Vein
  /**
   * Managers whose row is held back in this question's table until the
   * question named in `pairedWith` has also been answered.
   *
   * Two questions can be the two ends of one measure: the worst rate when the
   * opponent misses 100, and the only unbeaten record on the same split. The
   * table is ordered best to worst, so answering either one hands over the
   * other eight questions early. The row stays in place and is redacted, so
   * the shape of the table is honest about there being something there.
   */
  mask?: string[]
  pairedWith?: number
}

export const QUESTIONS: Question[] = [
  {
    vein: 'Luck',
    q: 'Who has 21 wins in weeks he finished in the bottom half of the league?',
    source: 'Every week scored against all eleven others',
    options: ['Charlie', 'Luke', 'Connie', 'Cat'],
    answer: 'Charlie',
    why: 'Twenty-one times he was in the bottom six for the week and won anyway. Connie is next on 13, Kyle has 7. Charlie is also the luckiest manager in league history overall, <b>five and a half wins</b> above what his scores earned him.',
  },
  {
    vein: 'Records',
    q: 'Who has a losing record against nine of the other eleven managers?',
    source: 'All-time head to head, the current twelve',
    options: ['Luke', 'Charlie', 'Cat', 'Evan'],
    answer: 'Luke',
    why: 'Nine of the eleven are above water against him. Isaac is the far end of the same measure: <b>one</b> manager in this league holds a winning record over Isaac.',
  },
  {
    vein: 'Draft',
    q: 'Who has never taken a kicker or a defence before round 13, in seven drafts?',
    source: 'Seven drafts, 105 picks each',
    options: ['Joey', 'Chris', 'Sean', 'Isaac'],
    answer: 'Joey',
    why: 'Zero, in 105 picks. Connie, Charlie and Luke have <b>seven each</b>.',
  },
  {
    vein: 'Luck',
    q: 'Who is 21-4 when the opponent scores under 100, the worst rate in the league?',
    source: 'Every game the other side missed 100 in',
    options: ['Connie', 'Kyle', 'Cat', 'Charlie'],
    answer: 'Connie',
    why: 'Four times he has lost a game in which the other team could not reach 100. Nobody else in the league has lost more than three.',
    mask: ['Joey', 'Evan'],
    pairedWith: 12,
  },
  {
    vein: 'Records',
    q: 'Who is 12-19 against the five managers who have never won a ring?',
    source: 'Career, against the five with no ring',
    options: ['Kyle', 'Cat', 'Luke', 'Charlie'],
    answer: 'Kyle',
    why: 'Four playoff trips, and a losing record against the people who have won nothing. Sean is <b>25-12</b> against that same five.',
  },
  {
    vein: 'Draft',
    q: 'Whose first six rounds produce a startable player 71% of the time, and whose rounds nine to fifteen produce one 6% of the time?',
    source: 'Every pick graded against where the player finished',
    options: ['Ricci', 'Chris', 'Isaac', 'Mason'],
    answer: 'Ricci',
    why: 'The best early drafter here and the worst late one: <b>6%</b> of his rounds nine to fifteen produce a starter, the lowest of the twelve.',
  },
  {
    vein: 'Luck',
    q: 'Who once spent ten straight weeks in the bottom half of the league?',
    source: 'Weekly finishing position, 2019 to 2025',
    options: ['Mason', 'Cat', 'Charlie', 'Luke'],
    answer: 'Mason',
    why: 'Ten in a row. Joey owns the other end with <b>eleven straight</b> weeks in the top half, and Charlie’s best run up there is three.',
  },
  {
    vein: 'Records',
    q: 'Who has the only winning record in the league against teams that made the playoffs?',
    source: 'Career, against playoff teams',
    options: ['Isaac', 'Joey', 'Sean', 'Mason'],
    answer: 'Isaac',
    why: '<b>23-22</b>. Charlie is 14-33 against the same teams and Evan is 7-18.',
  },
  {
    vein: 'Draft',
    q: 'Who has the highest hit rate of any drafter here, 39% of every pick he has ever made?',
    source: 'Every pick graded against where the player finished',
    options: ['Chris', 'Joey', 'Mason', 'Ricci'],
    answer: 'Chris',
    why: 'His first five picks finish <b>71st</b> on average, the best in the league, and his squads leave the draft with 2,249 points a year.',
  },
  {
    vein: 'Luck',
    q: 'Who has run into the league’s highest scorer fifteen times, more than anyone?',
    source: 'Who the schedule handed him, week by week',
    options: ['Cat', 'Connie', 'Charlie', 'Joey'],
    answer: 'Cat',
    why: 'Mason is the opposite draw entirely: the week’s top scorer <b>three times</b>, the week’s lowest scorer fourteen.',
  },
  {
    vein: 'Draft',
    q: 'Who had the worst draft in league history and finished third that year?',
    source: 'Seven draft classes, graded',
    options: ['Sean', 'Luke', 'Kyle', 'Charlie'],
    answer: 'Sean',
    why: '2023. Graded against where every player actually finished, it is the worst class anybody has assembled here. He came <b>third</b> anyway.',
  },
  {
    vein: 'Records',
    q: 'Which manager has never beaten Charlie?',
    source: 'One pair, every meeting',
    options: ['Evan', 'Luke', 'Kyle', 'Isaac'],
    answer: 'Evan',
    why: '<b>0-6</b>. It is the only winless pair in the league.',
  },
  {
    vein: 'Luck',
    q: 'Who has never lost a game in which the opponent scored under 100?',
    source: 'Every game the other side missed 100 in',
    options: ['Joey', 'Sean', 'Mason', 'Chris'],
    answer: 'Joey',
    why: '<b>12-0</b>. Evan is 5-0 on a third of the sample; every other manager in the league has dropped at least one, and Connie has dropped four.',
  },
  {
    vein: 'Draft',
    q: 'Who has drafted Saquon Barkley four separate times?',
    source: 'Every name called in seven drafts',
    options: ['Mason', 'Sean', 'Joey', 'Kyle'],
    answer: 'Mason',
    why: 'Including <b>third overall</b> in 2020, the year Barkley finished 419th. It is the worst pick anyone has made here.',
  },
  {
    vein: 'Records',
    q: 'Who has been the number one seed twice and has never won a title?',
    source: 'Seven years of seeds and finishes',
    options: ['Sean', 'Kyle', 'Chris', 'Cat'],
    answer: 'Sean',
    why: 'Top seed in 2021 and 2024, finished <b>3rd and 4th</b>. Kyle’s best entry is the 2 seed in 2022, and he finished 4th.',
  },
  {
    vein: 'Luck',
    q: 'Who faced 1,879 points in one season, the most anybody has had thrown at them, and went 4-10?',
    source: 'Points against, season by season',
    options: ['Isaac', 'Joey', 'Evan', 'Cat'],
    answer: 'Isaac',
    why: '2024. Joey’s 2024 is second at <b>1,873</b>, and he went 5-9. The two hardest schedules ever run landed in the same year.',
  },
  {
    vein: 'Draft',
    q: 'Whose first five picks finish 146th on average, the worst in the league?',
    source: 'First five picks, seven years',
    options: ['Kyle', 'Sean', 'Luke', 'Charlie'],
    answer: 'Kyle',
    why: '146th, with Sean next at 137th. Chris is best at <b>71st</b>.',
  },
  {
    vein: 'Luck',
    q: 'Who has eleven losses in games he scored 130 or more?',
    source: 'Every game he scored 130 or more',
    options: ['Cat', 'Connie', 'Chris', 'Joey'],
    answer: 'Cat',
    why: 'Connie has 10. Mason and Charlie have <b>two each</b>.',
  },
  {
    vein: 'Draft',
    q: 'Who had the best draft anyone has ever had, and lost the final that year?',
    source: 'Seven draft classes, graded',
    options: ['Joey', 'Chris', 'Isaac', 'Connie'],
    answer: 'Joey',
    why: 'His 2021 is the only class that has ever graded <b>positive</b> against where the players finished, and Chris’s 2021 is the only other one even to break even. Joey lost that final to Chris.',
  },
  {
    vein: 'Records',
    q: 'Who averages 24 points a game more in the playoff weeks than he does in the regular season?',
    source: 'Playoff weeks against the regular season',
    options: ['Evan', 'Joey', 'Ricci', 'Mason'],
    answer: 'Evan',
    why: '115.5 a week in the regular season, <b>139.5</b> in playoff weeks. Joey is next at plus 8.2 and Cat drops 14.3. Worth knowing on this one: three seasons is only eight of those weeks for him, against seventeen for most of the league.',
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

// ---------------------------------------------------------------------------
// The full twelve, per question.
//
// GENERATED, and regenerated rather than hand-edited: the source script lives
// with the countdown at ~/Desktop/pams 2026 power rankings and reads the same
// weekly matchups, drafts and standings the questions were written from. Hand
// editing one number here would put a table and its own prose in disagreement
// in public, which is exactly how the "Joey is the only man who has never lost
// one" line got caught: Evan is 5-0 too, and the table said so.
//
// Each definition matches the claim its question makes. Career splits count
// every game; anything about a week's standing in the league is regular season
// only, because a playoff week has a different field in it.
//
// The ROWS are generated. The `label`, `topTag` and `botTag` strings are COPY
// and are edited here by hand: regenerating rewrites the numbers, not the
// words. Keep them plain and specific enough to stand alone under a table,
// because that is the only context they get.
export const TABLES: Record<number, StatTable> = {
  0: {
    label: "Wins from the bottom half", sort: 'desc',
    topTag: "most", botTag: "fewest",
    rows: [['Cat', "10", 10], ['Charlie', "21", 21], ['Chris', "9", 9], ['Connie', "13", 13], ['Evan', "4", 4], ['Isaac', "10", 10], ['Joey', "7", 7], ['Kyle', "7", 7], ['Luke', "11", 11], ['Mason', "10", 10], ['Ricci', "10", 10], ['Sean', "9", 9]],
  },
  1: {
    label: "Opponents who own him", sort: 'desc',
    topTag: "most", botTag: "fewest",
    rows: [['Cat', "6", 6], ['Charlie', "6", 6], ['Chris', "2", 2], ['Connie', "4", 4], ['Evan', "6", 6], ['Isaac', "1", 1], ['Joey', "4", 4], ['Kyle', "5", 5], ['Luke', "9", 9], ['Mason', "2", 2], ['Ricci', "5", 5], ['Sean', "3", 3]],
  },
  2: {
    label: "Kickers and defences before round 13", sort: 'desc',
    topTag: "most", botTag: "none at all",
    rows: [['Cat', "5", 5], ['Charlie', "7", 7], ['Chris', "1", 1], ['Connie', "7", 7], ['Evan', "3", 3], ['Isaac', "3", 3], ['Joey', "0", 0], ['Kyle', "5", 5], ['Luke', "7", 7], ['Mason', "3", 3], ['Ricci', "4", 4], ['Sean', "3", 3]],
  },
  3: {
    label: "When the opponent misses 100", sort: 'rec',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "22-3", 0.88], ['Charlie', "22-3", 0.88], ['Chris', "23-2", 0.92], ['Connie', "21-4", 0.84], ['Evan', "5-0", 1.0], ['Isaac', "16-1", 0.9412], ['Joey', "12-0", 1.0], ['Kyle', "17-3", 0.85], ['Luke', "16-1", 0.9412], ['Mason', "23-3", 0.8846], ['Ricci', "20-1", 0.9524], ['Sean', "20-3", 0.8696]],
  },
  4: {
    label: "Against the five with no ring", sort: 'rec',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "16-20", 0.4444], ['Charlie', "18-16", 0.5294], ['Chris', "21-20", 0.5122], ['Connie', "24-18", 0.5714], ['Evan', "8-12", 0.4], ['Isaac', "28-18", 0.6087], ['Joey', "23-20", 0.5349], ['Kyle', "12-19", 0.3871], ['Luke', "19-19", 0.5], ['Mason', "22-25", 0.4681], ['Ricci', "23-20", 0.5349], ['Sean', "25-12", 0.6757]],
  },
  5: {
    label: "First six rounds, startable", sort: 'desc',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "50%", 50], ['Charlie', "55%", 55], ['Chris', "69%", 69], ['Connie', "52%", 52], ['Evan', "61%", 61], ['Isaac', "43%", 43], ['Joey', "55%", 55], ['Kyle', "46%", 46], ['Luke', "53%", 53], ['Mason', "55%", 55], ['Ricci', "71%", 71], ['Sean', "43%", 43]],
  },
  6: {
    label: "Longest run in the bottom half", sort: 'desc',
    topTag: "longest", botTag: "shortest",
    rows: [['Cat', "6", 6], ['Charlie', "8", 8], ['Chris', "5", 5], ['Connie', "8", 8], ['Evan', "5", 5], ['Isaac', "8", 8], ['Joey', "5", 5], ['Kyle', "5", 5], ['Luke', "7", 7], ['Mason', "10", 10], ['Ricci', "7", 7], ['Sean', "5", 5]],
  },
  7: {
    label: "Against teams that made the playoffs", sort: 'rec',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "16-33", 0.3265], ['Charlie', "14-33", 0.2979], ['Chris', "26-27", 0.4906], ['Connie', "19-32", 0.3725], ['Evan', "7-18", 0.28], ['Isaac', "23-22", 0.5111], ['Joey', "27-28", 0.4909], ['Kyle', "23-31", 0.4259], ['Luke', "17-32", 0.3469], ['Mason', "21-28", 0.4286], ['Ricci', "17-30", 0.3617], ['Sean', "22-26", 0.4583]],
  },
  8: {
    label: "Every pick, startable", sort: 'desc',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "30%", 30], ['Charlie', "28%", 28], ['Chris', "39%", 39], ['Connie', "30%", 30], ['Evan', "33%", 33], ['Isaac', "23%", 23], ['Joey', "34%", 34], ['Kyle', "31%", 31], ['Luke', "30%", 30], ['Mason', "34%", 34], ['Ricci', "33%", 33], ['Sean', "29%", 29]],
  },
  9: {
    label: "Weeks he drew the top scorer", sort: 'desc',
    topTag: "hardest draw", botTag: "easiest draw",
    rows: [['Cat', "15", 15], ['Charlie', "10", 10], ['Chris', "5", 5], ['Connie', "11", 11], ['Evan', "2", 2], ['Isaac', "8", 8], ['Joey', "9", 9], ['Kyle', "6", 6], ['Luke', "4", 4], ['Mason', "3", 3], ['Ricci', "6", 6], ['Sean', "9", 9]],
  },
  10: {
    label: "His worst draft class", sort: 'desc',
    topTag: "least bad", botTag: "worst ever",
    rows: [['Cat', "2025  -837", -837], ['Charlie', "2020  -1081", -1081], ['Chris', "2025  -810", -810], ['Connie', "2024  -692", -692], ['Evan', "2024  -1032", -1032], ['Isaac', "2024  -690", -690], ['Joey', "2020  -699", -699], ['Kyle', "2025  -743", -743], ['Luke', "2023  -1193", -1193], ['Mason', "2019  -809", -809], ['Ricci', "2023  -838", -838], ['Sean', "2023  -1396", -1396]],
  },
  11: {
    label: "All-time against Charlie", sort: 'rec',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "5-2", 0.7143], ['Chris', "4-4", 0.5], ['Connie', "8-2", 0.8], ['Evan', "0-6", 0.0], ['Isaac', "7-2", 0.7778], ['Joey', "6-2", 0.75], ['Kyle', "2-5", 0.2857], ['Luke', "4-6", 0.4], ['Mason', "5-4", 0.5556], ['Ricci', "4-4", 0.5], ['Sean', "6-4", 0.6]],
  },
  12: {
    label: "When the opponent misses 100", sort: 'rec',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "22-3", 0.88], ['Charlie', "22-3", 0.88], ['Chris', "23-2", 0.92], ['Connie', "21-4", 0.84], ['Evan', "5-0", 1.0], ['Isaac', "16-1", 0.9412], ['Joey', "12-0", 1.0], ['Kyle', "17-3", 0.85], ['Luke', "16-1", 0.9412], ['Mason', "23-3", 0.8846], ['Ricci', "20-1", 0.9524], ['Sean', "20-3", 0.8696]],
  },
  13: {
    label: "Most times he took the same player", sort: 'desc',
    topTag: "most", botTag: "fewest",
    rows: [['Cat', "2", 2], ['Charlie', "3", 3], ['Chris', "3", 3], ['Connie', "3", 3], ['Evan', "2", 2], ['Isaac', "3", 3], ['Joey', "3", 3], ['Kyle', "3", 3], ['Luke', "3", 3], ['Mason', "4", 4], ['Ricci', "2", 2], ['Sean', "3", 3]],
  },
  14: {
    label: "Times he was the 1 seed", sort: 'desc',
    topTag: "most", botTag: "never",
    rows: [['Cat', "0", 0], ['Charlie', "0", 0], ['Chris', "0", 0], ['Connie', "0", 0], ['Evan', "0", 0], ['Isaac', "1", 1], ['Joey', "1", 1], ['Kyle', "0", 0], ['Luke', "0", 0], ['Mason', "2", 2], ['Ricci', "0", 0], ['Sean', "2", 2]],
  },
  15: {
    label: "Worst season of points against", sort: 'desc',
    topTag: "heaviest", botTag: "lightest",
    rows: [['Cat', "1,841", 1841], ['Charlie', "1,758", 1758], ['Chris', "1,714", 1714], ['Connie', "1,745", 1745], ['Evan', "1,826", 1826], ['Isaac', "1,879", 1879], ['Joey', "1,873", 1873], ['Kyle', "1,789", 1789], ['Luke', "1,822", 1822], ['Mason', "1,684", 1684], ['Ricci', "1,748", 1748], ['Sean', "1,739", 1739]],
  },
  16: {
    label: "First five picks, average finish", sort: 'asc',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "100th", 100], ['Charlie', "94th", 94], ['Chris', "71st", 71], ['Connie', "127th", 127], ['Evan', "103rd", 103], ['Isaac', "105th", 105], ['Joey', "108th", 108], ['Kyle', "146th", 146], ['Luke', "106th", 106], ['Mason', "116th", 116], ['Ricci', "91st", 91], ['Sean', "137th", 137]],
  },
  17: {
    label: "Losses scoring 130 or more", sort: 'desc',
    topTag: "most", botTag: "fewest",
    rows: [['Cat', "11", 11], ['Charlie', "2", 2], ['Chris', "9", 9], ['Connie', "10", 10], ['Evan', "3", 3], ['Isaac', "3", 3], ['Joey', "9", 9], ['Kyle', "5", 5], ['Luke', "6", 6], ['Mason', "2", 2], ['Ricci', "4", 4], ['Sean', "4", 4]],
  },
  18: {
    label: "His best draft class", sort: 'desc',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "2023  -92", -92], ['Charlie', "2019  -310", -310], ['Chris', "2021  +0", 0], ['Connie', "2020  -18", -18], ['Evan', "2023  -276", -276], ['Isaac', "2022  -153", -153], ['Joey', "2021  +73", 73], ['Kyle', "2023  -144", -144], ['Luke', "2024  -124", -124], ['Mason', "2024  -395", -395], ['Ricci', "2020  -263", -263], ['Sean', "2021  -178", -178]],
  },
  19: {
    label: "Playoff weeks vs the regular season", sort: 'desc',
    topTag: "biggest lift", botTag: "biggest drop",
    rows: [['Cat', "-14.3", -14.3], ['Charlie', "-4.7", -4.7], ['Chris', "+2.2", 2.2], ['Connie', "+2.4", 2.4], ['Evan', "+24.0", 24.0], ['Isaac', "-4.1", -4.1], ['Joey', "+8.2", 8.2], ['Kyle', "-2.2", -2.2], ['Luke', "-9.4", -9.4], ['Mason', "-0.5", -0.5], ['Ricci', "+4.0", 4.0], ['Sean', "-11.8", -11.8]],
    // Playoff weeks each has actually played. Evan's +24.0 rests on eight.
    subs: { Cat: '15 wks', Charlie: '17 wks', Chris: '17 wks', Connie: '17 wks', Evan: '8 wks', Isaac: '13 wks', Joey: '17 wks', Kyle: '17 wks', Luke: '14 wks', Mason: '15 wks', Ricci: '16 wks', Sean: '15 wks' },
  },
}

/** The twelve on one question's measure, ordered, with the ends named. */
export function tableFor(index: number): StatTable | null {
  return TABLES[index] ?? null
}

/** Rows in display order for a table. */
export function sortedRows(t: StatTable): [string, string, number][] {
  const rows = [...t.rows]
  rows.sort((a, b) => (t.sort === 'asc' ? a[2] - b[2] : b[2] - a[2]))
  return rows
}
