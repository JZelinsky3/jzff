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

/**
 * Bump this whenever the QUESTION SET changes, not just when the wording does.
 *
 * A score only means something against the set it was answered on, and a run
 * is filed as one row per (league, edition, manager): a new edition frees
 * everybody to sit it again and leaves the old rows in the table as history
 * rather than deleting them. Reads are edition-scoped, so nothing from a
 * previous set shows on the board.
 *
 * pams-2026    the original twenty, answers keyed by question position
 * pams-2026.2  twenty-five, five of them pick-N, answers keyed by question id
 */
export const EDITION = 'pams-2026.2'

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
  /** Stable across edits. Questions get cut and added while the set is being
   *  tuned, so nothing downstream may key off position: TABLES is keyed by id
   *  and so are a run's filed answers. */
  id: string
  q: string
  /** Where the number comes from, shown while they are choosing. It points at
   *  which corner of seven years to think about without narrowing the names,
   *  which is the difference between a clue and a tell. */
  source: string
  /** The names offered, in a DELIBERATELY SHUFFLED order. Every question was
   *  first written with its answer at the top, which made the whole exam "tap
   *  the first option" for twenty out of twenty. */
  options: string[]
  /** One name on a normal question, several on a pick-N. */
  answers: string[]
  /** How many to choose. Absent means one. */
  pick?: number
  /** The number behind it, shown the moment they answer. */
  why: string
  vein: Vein
  /** Names held back in this question's table until `pairedWith` is answered,
   *  because that question is the other end of the same measure and the table
   *  is ordered. The row stays and is redacted, so the table is still honest
   *  about how many managers are on it. */
  mask?: string[]
  pairedWith?: string
}

/** How many names this question wants. */
export function pickCount(q: Question): number {
  return q.pick ?? 1
}

export function isMulti(q: Question): boolean {
  return pickCount(q) > 1
}

/** Did this set of names answer the question? Multi is all-or-nothing: part of
 *  a three-name answer is a guess with the odds improved, not a right answer. */
export function isCorrect(q: Question, chosen: string[]): boolean {
  if (chosen.length !== q.answers.length) return false
  const want = [...q.answers].sort().join('|')
  return [...chosen].sort().join('|') === want
}

export const QUESTIONS: Question[] = [
  {
    id: 'bottom-half-wins',
    vein: 'Luck',
    q: 'Who has 21 wins in weeks he finished in the bottom half of the league?',
    source: 'Every week scored against all eleven others',
    options: ['Luke', 'Cat', 'Charlie', 'Connie'],
    answers: ['Charlie'],
    why: 'Twenty-one times he was in the bottom six for the week and won anyway. Connie is next on 13, Kyle has 7. Charlie is also the luckiest manager in league history overall, <b>five and a half wins</b> above what his scores earned him.',
  },
  {
    id: 'losing-to-nine',
    vein: 'Records',
    q: 'Who has a losing record against nine of the other eleven managers?',
    source: 'All-time head to head, the current twelve',
    options: ['Evan', 'Luke', 'Cat', 'Charlie'],
    answers: ['Luke'],
    why: 'Nine of the eleven are above water against him. Isaac is the far end of the same measure: <b>one</b> manager in this league holds a winning record over Isaac.',
  },
  {
    id: 'under-100-worst',
    vein: 'Luck',
    q: 'Who is 21-4 when the opponent scores under 100, the worst rate in the league?',
    source: 'Every game the other side missed 100 in',
    options: ['Kyle', 'Charlie', 'Connie', 'Cat'],
    answers: ['Connie'],
    why: 'Four times he has lost a game in which the other team could not reach 100. Nobody else in the league has lost more than three.',
    mask: ['Joey', 'Evan'],
    pairedWith: 'under-100-unbeaten',
  },
  {
    id: 'no-ring-record',
    vein: 'Records',
    q: 'Who is 12-19 against the five managers who have never won a ring?',
    source: 'Career, against the five with no ring',
    options: ['Cat', 'Kyle', 'Charlie', 'Luke'],
    answers: ['Kyle'],
    why: 'Four playoff trips, and a losing record against the people who have won nothing. Sean is <b>25-12</b> against that same five.',
  },
  {
    id: 'cleared-190',
    vein: 'Luck',
    q: 'Only three managers have ever posted a 190-point week. Pick all three.',
    source: 'Every weekly score since 2019',
    options: ['Isaac', 'Chris', 'Sean', 'Cat', 'Joey', 'Mason'],
    answers: ['Mason', 'Chris', 'Joey'],
    pick: 3,
    why: 'Chris holds the record at <b>200.6</b>, the only 200 ever posted here. Cat got closest of the rest at 189.5 and Sean at 187.5.',
  },
  {
    id: 'early-late-drafter',
    vein: 'Draft',
    q: 'Whose first six rounds produce a startable player 71% of the time, and whose rounds nine to fifteen produce one 6% of the time?',
    source: 'Every pick graded against where the player finished',
    options: ['Mason', 'Ricci', 'Isaac', 'Chris'],
    answers: ['Ricci'],
    why: 'The best early drafter here and the worst late one: <b>6%</b> of his rounds nine to fifteen produce a starter, the lowest of the twelve.',
  },
  {
    id: 'bottom-half-run',
    vein: 'Luck',
    q: 'Who once spent ten straight weeks in the bottom half of the league?',
    source: 'Weekly finishing position, 2019 to 2025',
    options: ['Charlie', 'Luke', 'Cat', 'Mason'],
    answers: ['Mason'],
    why: 'Ten in a row. Joey owns the other end with <b>eleven straight</b> weeks in the top half, and Charlie’s best run up there is three.',
  },
  {
    id: 'playoff-teams-record',
    vein: 'Records',
    q: 'Who has the only winning record in the league against teams that made the playoffs?',
    source: 'Career, against playoff teams',
    options: ['Joey', 'Sean', 'Mason', 'Isaac'],
    answers: ['Isaac'],
    why: '<b>23-22</b>. Charlie is 14-33 against the same teams and Evan is 7-18.',
  },
  {
    id: 'never-beat-charlie',
    vein: 'Records',
    q: 'Which manager has never beaten Charlie?',
    source: 'One pair, every meeting',
    options: ['Isaac', 'Luke', 'Evan', 'Kyle'],
    answers: ['Evan'],
    mask: ['Kyle', 'Luke'],
    pairedWith: 'charlie-owns',
    why: '<b>0-6</b>. It is the only winless pair in the league.',
  },
  {
    id: 'best-drafter',
    vein: 'Draft',
    q: 'Who has the highest hit rate of any drafter here, 39% of every pick he has ever made?',
    source: 'Every pick graded against where the player finished',
    options: ['Mason', 'Chris', 'Joey', 'Ricci'],
    answers: ['Chris'],
    why: 'His first five picks finish <b>71st</b> on average, the best in the league, and his squads leave the draft with 2,249 points a year.',
  },
  {
    id: 'charlie-owns',
    vein: 'Records',
    q: 'Charlie holds a winning record over exactly three of the other eleven. Pick all three.',
    source: 'One column of the all-time head to head',
    options: ['Joey', 'Luke', 'Evan', 'Connie', 'Kyle', 'Isaac'],
    answers: ['Kyle', 'Evan', 'Luke'],
    pick: 3,
    why: '<b>6-0</b> over Evan, 5-2 over Kyle and 6-4 over Luke. The other eight are all above water on him, and Connie is 8-2.',
  },
  {
    id: 'drew-top-scorer',
    vein: 'Luck',
    q: 'Who has run into the league’s highest scorer fifteen times, more than anyone?',
    source: 'Who the schedule handed him, week by week',
    options: ['Connie', 'Charlie', 'Joey', 'Cat'],
    answers: ['Cat'],
    why: 'Mason is the opposite draw entirely: the week’s top scorer <b>three times</b>, the week’s lowest scorer fourteen.',
  },
  {
    id: 'worst-draft-class',
    vein: 'Draft',
    q: 'Who had the worst draft in league history and finished third that year?',
    source: 'Seven draft classes, graded',
    options: ['Sean', 'Charlie', 'Luke', 'Kyle'],
    answers: ['Sean'],
    why: '2023. Graded against where every player actually finished, it is the worst class anybody has assembled here. He came <b>third</b> anyway.',
  },
  {
    id: 'under-100-unbeaten',
    vein: 'Luck',
    q: 'Who has never lost a game in which the opponent scored under 100?',
    source: 'Every game the other side missed 100 in',
    options: ['Joey', 'Mason', 'Sean', 'Chris'],
    answers: ['Joey'],
    why: '<b>12-0</b>. Evan is 5-0 on a third of the sample; every other manager in the league has dropped at least one, and Connie has dropped four.',
  },
  {
    id: 'missed-five',
    vein: 'Records',
    q: 'Two managers have missed the playoffs five times in seven years. Pick both.',
    source: 'Seven years of who got in',
    options: ['Evan', 'Cat', 'Luke', 'Charlie', 'Kyle'],
    answers: ['Cat', 'Charlie'],
    pick: 2,
    why: 'Five out of seven each. Luke and Kyle have missed four and three, and Evan has missed two of his three.',
  },
  {
    id: 'saquon-four',
    vein: 'Draft',
    q: 'Who has drafted Saquon Barkley four separate times?',
    source: 'Every name called in seven drafts',
    options: ['Mason', 'Kyle', 'Sean', 'Joey'],
    answers: ['Mason'],
    why: 'Including <b>third overall</b> in 2020, the year Barkley finished 419th. It is the worst pick anyone has made here.',
  },
  {
    id: 'one-seed-twice',
    vein: 'Records',
    q: 'Who has been the number one seed twice and has never won a title?',
    source: 'Seven years of seeds and finishes',
    options: ['Chris', 'Cat', 'Kyle', 'Sean'],
    answers: ['Sean'],
    mask: ['Mason'],
    pairedWith: 'top-seed-twice',
    why: 'Top seed in 2021 and 2024, finished <b>3rd and 4th</b>. Kyle’s best entry is the 2 seed in 2022, and he finished 4th.',
  },
  {
    id: 'points-against',
    vein: 'Luck',
    q: 'Who faced 1,879 points in one season, the most anybody has had thrown at them, and went 4-10?',
    source: 'Points against, season by season',
    options: ['Joey', 'Evan', 'Isaac', 'Cat'],
    answers: ['Isaac'],
    why: '2024. Joey’s 2024 is second at <b>1,873</b>, and he went 5-9. The two hardest schedules ever run landed in the same year.',
  },
  {
    id: 'top-seed-twice',
    vein: 'Records',
    q: 'Two managers have gone into the playoffs as the number one seed twice. Pick both.',
    source: 'Seven years of seeds',
    options: ['Joey', 'Chris', 'Sean', 'Isaac', 'Mason'],
    answers: ['Sean', 'Mason'],
    pick: 2,
    why: 'Isaac and Joey have done it once each. Nobody else has ever had the top seed, and <b>Sean has two of them and no title</b>.',
  },
  {
    id: 'first-five-worst',
    vein: 'Draft',
    q: 'Whose first five picks finish 146th on average, the worst in the league?',
    source: 'First five picks, seven years',
    options: ['Kyle', 'Luke', 'Charlie', 'Sean'],
    answers: ['Kyle'],
    why: '146th, with Sean next at 137th. Chris is best at <b>71st</b>.',
  },
  {
    id: 'losses-130',
    vein: 'Luck',
    q: 'Who has eleven losses in games he scored 130 or more?',
    source: 'Every game he scored 130 or more',
    options: ['Connie', 'Cat', 'Chris', 'Joey'],
    answers: ['Cat'],
    why: 'Connie has 10. Mason and Charlie have <b>two each</b>.',
  },
  {
    id: 'vs-140',
    vein: 'Luck',
    q: 'Who is 4-13 when the opponent posts 140 or more, the best anyone here manages?',
    source: 'Every game the other side cleared 140 in',
    options: ['Chris', 'Sean', 'Mason', 'Isaac'],
    answers: ['Sean'],
    why: 'Nobody in this league wins that game often. Sean at <b>.235</b> is the best of it, Joey is next at .194, and <b>Evan and Luke have never won one at all</b>.',
  },
  {
    id: 'never-top-three',
    vein: 'Records',
    q: 'Three managers have never once finished in the top three. Pick all three.',
    source: 'Seven years of final standings',
    options: ['Ricci', 'Luke', 'Charlie', 'Cat', 'Evan', 'Kyle'],
    answers: ['Kyle', 'Charlie', 'Evan'],
    pick: 3,
    why: 'Kyle is the surprise: <b>four playoff trips</b> and never a top three to show for it. Cat has a third from 2024, Ricci has three of them, and Luke won it outright in 2024.',
  },
  {
    id: 'best-draft-class',
    vein: 'Draft',
    q: 'Who had the best draft anyone has ever had, and lost the final that year?',
    source: 'Seven draft classes, graded',
    options: ['Connie', 'Isaac', 'Chris', 'Joey'],
    answers: ['Joey'],
    why: 'His 2021 is the only class that has ever graded <b>positive</b> against where the players finished, and Chris’s 2021 is the only other one even to break even. Joey lost that final to Chris.',
  },
  {
    id: 'playoff-weeks-lift',
    vein: 'Records',
    q: 'Who averages 24 points a game more in the playoff weeks than he does in the regular season?',
    source: 'Playoff weeks against the regular season',
    options: ['Ricci', 'Joey', 'Evan', 'Mason'],
    answers: ['Evan'],
    why: '115.5 a week in the regular season, <b>139.5</b> in playoff weeks. Joey is next at plus 8.2 and Cat drops 14.3. Worth knowing on this one: three seasons is only eight of those weeks for him, against seventeen for most of the league.',
  },
]

export const VEINS: Vein[] = ['Luck', 'Records', 'Draft']

/** The label a vein carries on the result split. */
export function veinLabel(v: Vein): string {
  return v === 'Draft' ? 'The draft' : v
}

/** One filed run: the name on it and what they answered. */
export type RunRecord = { name: string; picks: Record<string, string[]>; score: number }

/**
 * Score a set of picks. The server owns this: the client submits the names it
 * chose and never a total, so a run's score is always something the database
 * can stand behind. Same rule the games-page leaderboards run on.
 */
export function scorePicks(picks: Record<string, string[]>): number {
  let n = 0
  QUESTIONS.forEach((q) => {
    if (isCorrect(q, picks[q.id] ?? [])) n += 1
  })
  return n
}

/** A submission is only valid if every answer is one of that question's four. */
export function validatePicks(picks: unknown): { ok: false; error: string } | { ok: true; picks: Record<string, string[]> } {
  if (!picks || typeof picks !== 'object') return { ok: false, error: 'No answers were sent.' }
  const raw = picks as Record<string, unknown>
  const out: Record<string, string[]> = {}
  for (let i = 0; i < QUESTIONS.length; i += 1) {
    const q = QUESTIONS[i]
    const v = raw[q.id]
    if (!Array.isArray(v)) return { ok: false, error: `Question ${i + 1} has no answer.` }
    if (v.length !== pickCount(q)) return { ok: false, error: `Question ${i + 1} needs ${pickCount(q)} names.` }
    if (new Set(v).size !== v.length) return { ok: false, error: `Question ${i + 1} has the same name twice.` }
    for (const name of v) {
      if (typeof name !== 'string' || !q.options.includes(name)) {
        return { ok: false, error: `Question ${i + 1} has an answer that was never offered.` }
      }
    }
    out[q.id] = v as string[]
  }
  return { ok: true, picks: out }
}

/**
 * How the room did on one question: of everybody who has finished, how many
 * got it. This is the part worth reading. A question eleven of twelve miss
 * says more about the league than anybody's total does.
 */
export function roomSplit(runs: RunRecord[], q: Question): { got: number; of: number } | null {
  const done = runs.filter((r) => Array.isArray(r.picks[q.id]))
  if (!done.length) return null
  return { got: done.filter((r) => isCorrect(q, r.picks[q.id])).length, of: done.length }
}

/** Score bands. Milk, because everything in this series is. */
export const BANDS: { from: number; name: string; line: string }[] = [
  { from: 23, name: 'Route manager', line: 'You have read the ledger. There is nothing left to tell you.' },
  { from: 19, name: 'Full crate', line: 'Comfortably better than the room. Two or three of these nobody gets.' },
  { from: 14, name: 'Half gallon', line: 'Respectable. You know the league, you just do not know the margins.' },
  { from: 9, name: 'Skimmed', line: 'You watch the scores and not much else.' },
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
export const TABLES: Record<string, StatTable> = {
  'bottom-half-wins': {
    label: "Wins from the bottom half", sort: 'desc',
    topTag: "most", botTag: "fewest",
    rows: [['Cat', "10", 10], ['Charlie', "21", 21], ['Chris', "9", 9], ['Connie', "13", 13], ['Evan', "4", 4], ['Isaac', "10", 10], ['Joey', "7", 7], ['Kyle', "7", 7], ['Luke', "11", 11], ['Mason', "10", 10], ['Ricci', "10", 10], ['Sean', "9", 9]],
  },
  'losing-to-nine': {
    label: "Opponents who own him", sort: 'desc',
    topTag: "most", botTag: "fewest",
    rows: [['Cat', "6", 6], ['Charlie', "6", 6], ['Chris', "2", 2], ['Connie', "4", 4], ['Evan', "6", 6], ['Isaac', "1", 1], ['Joey', "4", 4], ['Kyle', "5", 5], ['Luke', "9", 9], ['Mason', "2", 2], ['Ricci', "5", 5], ['Sean', "3", 3]],
  },
  'kickers-early': {
    label: "Kickers and defences before round 13", sort: 'desc',
    topTag: "most", botTag: "none at all",
    rows: [['Cat', "5", 5], ['Charlie', "7", 7], ['Chris', "1", 1], ['Connie', "7", 7], ['Evan', "3", 3], ['Isaac', "3", 3], ['Joey', "0", 0], ['Kyle', "5", 5], ['Luke', "7", 7], ['Mason', "3", 3], ['Ricci', "4", 4], ['Sean', "3", 3]],
  },
  'under-100-worst': {
    label: "When the opponent misses 100", sort: 'rec',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "22-3", 0.88], ['Charlie', "22-3", 0.88], ['Chris', "23-2", 0.92], ['Connie', "21-4", 0.84], ['Evan', "5-0", 1.0], ['Isaac', "16-1", 0.9412], ['Joey', "12-0", 1.0], ['Kyle', "17-3", 0.85], ['Luke', "16-1", 0.9412], ['Mason', "23-3", 0.8846], ['Ricci', "20-1", 0.9524], ['Sean', "20-3", 0.8696]],
  },
  'no-ring-record': {
    label: "Against the five with no ring", sort: 'rec',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "16-20", 0.4444], ['Charlie', "18-16", 0.5294], ['Chris', "21-20", 0.5122], ['Connie', "24-18", 0.5714], ['Evan', "8-12", 0.4], ['Isaac', "28-18", 0.6087], ['Joey', "23-20", 0.5349], ['Kyle', "12-19", 0.3871], ['Luke', "19-19", 0.5], ['Mason', "22-25", 0.4681], ['Ricci', "23-20", 0.5349], ['Sean', "25-12", 0.6757]],
  },
  'early-late-drafter': {
    label: "First six rounds, startable", sort: 'desc',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "50%", 50], ['Charlie', "55%", 55], ['Chris', "69%", 69], ['Connie', "52%", 52], ['Evan', "61%", 61], ['Isaac', "43%", 43], ['Joey', "55%", 55], ['Kyle', "46%", 46], ['Luke', "53%", 53], ['Mason', "55%", 55], ['Ricci', "71%", 71], ['Sean', "43%", 43]],
  },
  'bottom-half-run': {
    label: "Longest run in the bottom half", sort: 'desc',
    topTag: "longest", botTag: "shortest",
    rows: [['Cat', "6", 6], ['Charlie', "8", 8], ['Chris', "5", 5], ['Connie', "8", 8], ['Evan', "5", 5], ['Isaac', "8", 8], ['Joey', "5", 5], ['Kyle', "5", 5], ['Luke', "7", 7], ['Mason', "10", 10], ['Ricci', "7", 7], ['Sean', "5", 5]],
  },
  'playoff-teams-record': {
    label: "Against teams that made the playoffs", sort: 'rec',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "16-33", 0.3265], ['Charlie', "14-33", 0.2979], ['Chris', "26-27", 0.4906], ['Connie', "19-32", 0.3725], ['Evan', "7-18", 0.28], ['Isaac', "23-22", 0.5111], ['Joey', "27-28", 0.4909], ['Kyle', "23-31", 0.4259], ['Luke', "17-32", 0.3469], ['Mason', "21-28", 0.4286], ['Ricci', "17-30", 0.3617], ['Sean', "22-26", 0.4583]],
  },
  'best-drafter': {
    label: "Every pick, startable", sort: 'desc',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "30%", 30], ['Charlie', "28%", 28], ['Chris', "39%", 39], ['Connie', "30%", 30], ['Evan', "33%", 33], ['Isaac', "23%", 23], ['Joey', "34%", 34], ['Kyle', "31%", 31], ['Luke', "30%", 30], ['Mason', "34%", 34], ['Ricci', "33%", 33], ['Sean', "29%", 29]],
  },
  'drew-top-scorer': {
    label: "Weeks he drew the top scorer", sort: 'desc',
    topTag: "hardest draw", botTag: "easiest draw",
    rows: [['Cat', "15", 15], ['Charlie', "10", 10], ['Chris', "5", 5], ['Connie', "11", 11], ['Evan', "2", 2], ['Isaac', "8", 8], ['Joey', "9", 9], ['Kyle', "6", 6], ['Luke', "4", 4], ['Mason', "3", 3], ['Ricci', "6", 6], ['Sean', "9", 9]],
  },
  'worst-draft-class': {
    label: "His worst draft class", sort: 'desc',
    topTag: "least bad", botTag: "worst ever",
    rows: [['Cat', "2025  -837", -837], ['Charlie', "2020  -1081", -1081], ['Chris', "2025  -810", -810], ['Connie', "2024  -692", -692], ['Evan', "2024  -1032", -1032], ['Isaac', "2024  -690", -690], ['Joey', "2020  -699", -699], ['Kyle', "2025  -743", -743], ['Luke', "2023  -1193", -1193], ['Mason', "2019  -809", -809], ['Ricci', "2023  -838", -838], ['Sean', "2023  -1396", -1396]],
  },
  'never-beat-charlie': {
    label: "All-time against Charlie", sort: 'rec',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "5-2", 0.7143], ['Chris', "4-4", 0.5], ['Connie', "8-2", 0.8], ['Evan', "0-6", 0.0], ['Isaac', "7-2", 0.7778], ['Joey', "6-2", 0.75], ['Kyle', "2-5", 0.2857], ['Luke', "4-6", 0.4], ['Mason', "5-4", 0.5556], ['Ricci', "4-4", 0.5], ['Sean', "6-4", 0.6]],
  },
  'under-100-unbeaten': {
    label: "When the opponent misses 100", sort: 'rec',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "22-3", 0.88], ['Charlie', "22-3", 0.88], ['Chris', "23-2", 0.92], ['Connie', "21-4", 0.84], ['Evan', "5-0", 1.0], ['Isaac', "16-1", 0.9412], ['Joey', "12-0", 1.0], ['Kyle', "17-3", 0.85], ['Luke', "16-1", 0.9412], ['Mason', "23-3", 0.8846], ['Ricci', "20-1", 0.9524], ['Sean', "20-3", 0.8696]],
  },
  'saquon-four': {
    label: "Most times he took the same player", sort: 'desc',
    topTag: "most", botTag: "fewest",
    rows: [['Cat', "2", 2], ['Charlie', "3", 3], ['Chris', "3", 3], ['Connie', "3", 3], ['Evan', "2", 2], ['Isaac', "3", 3], ['Joey', "3", 3], ['Kyle', "3", 3], ['Luke', "3", 3], ['Mason', "4", 4], ['Ricci', "2", 2], ['Sean', "3", 3]],
  },
  'one-seed-twice': {
    label: "Times he was the 1 seed", sort: 'desc',
    topTag: "most", botTag: "never",
    rows: [['Cat', "0", 0], ['Charlie', "0", 0], ['Chris', "0", 0], ['Connie', "0", 0], ['Evan', "0", 0], ['Isaac', "1", 1], ['Joey', "1", 1], ['Kyle', "0", 0], ['Luke', "0", 0], ['Mason', "2", 2], ['Ricci', "0", 0], ['Sean', "2", 2]],
  },
  'points-against': {
    label: "Worst season of points against", sort: 'desc',
    topTag: "heaviest", botTag: "lightest",
    rows: [['Cat', "1,841", 1841], ['Charlie', "1,758", 1758], ['Chris', "1,714", 1714], ['Connie', "1,745", 1745], ['Evan', "1,826", 1826], ['Isaac', "1,879", 1879], ['Joey', "1,873", 1873], ['Kyle', "1,789", 1789], ['Luke', "1,822", 1822], ['Mason', "1,684", 1684], ['Ricci', "1,748", 1748], ['Sean', "1,739", 1739]],
  },
  'first-five-worst': {
    label: "First five picks, average finish", sort: 'asc',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "100th", 100], ['Charlie', "94th", 94], ['Chris', "71st", 71], ['Connie', "127th", 127], ['Evan', "103rd", 103], ['Isaac', "105th", 105], ['Joey', "108th", 108], ['Kyle', "146th", 146], ['Luke', "106th", 106], ['Mason', "116th", 116], ['Ricci', "91st", 91], ['Sean', "137th", 137]],
  },
  'losses-130': {
    label: "Losses scoring 130 or more", sort: 'desc',
    topTag: "most", botTag: "fewest",
    rows: [['Cat', "11", 11], ['Charlie', "2", 2], ['Chris', "9", 9], ['Connie', "10", 10], ['Evan', "3", 3], ['Isaac', "3", 3], ['Joey', "9", 9], ['Kyle', "5", 5], ['Luke', "6", 6], ['Mason', "2", 2], ['Ricci', "4", 4], ['Sean', "4", 4]],
  },
  'best-draft-class': {
    label: "His best draft class", sort: 'desc',
    topTag: "best", botTag: "worst",
    rows: [['Cat', "2023  -92", -92], ['Charlie', "2019  -310", -310], ['Chris', "2021  +0", 0], ['Connie', "2020  -18", -18], ['Evan', "2023  -276", -276], ['Isaac', "2022  -153", -153], ['Joey', "2021  +73", 73], ['Kyle', "2023  -144", -144], ['Luke', "2024  -124", -124], ['Mason', "2024  -395", -395], ['Ricci', "2020  -263", -263], ['Sean', "2021  -178", -178]],
  },
  'playoff-weeks-lift': {
    label: "Playoff weeks vs the regular season", sort: 'desc',
    topTag: "biggest lift", botTag: "biggest drop",
    rows: [['Cat', "-14.3", -14.3], ['Charlie', "-4.7", -4.7], ['Chris', "+2.2", 2.2], ['Connie', "+2.4", 2.4], ['Evan', "+24.0", 24.0], ['Isaac', "-4.1", -4.1], ['Joey', "+8.2", 8.2], ['Kyle', "-2.2", -2.2], ['Luke', "-9.4", -9.4], ['Mason', "-0.5", -0.5], ['Ricci', "+4.0", 4.0], ['Sean', "-11.8", -11.8]],
    // Playoff weeks each has actually played. Evan's +24.0 rests on eight.
    subs: { Cat: '15 wks', Charlie: '17 wks', Chris: '17 wks', Connie: '17 wks', Evan: '8 wks', Isaac: '13 wks', Joey: '17 wks', Kyle: '17 wks', Luke: '14 wks', Mason: '15 wks', Ricci: '16 wks', Sean: '15 wks' },
  },
}

/** The twelve on one question's measure, ordered, with the ends named. */
export function tableFor(id: string): StatTable | null {
  return TABLES[id] ?? null
}

/** Rows in display order for a table. */
export function sortedRows(t: StatTable): [string, string, number][] {
  const rows = [...t.rows]
  rows.sort((a, b) => (t.sort === 'asc' ? a[2] - b[2] : b[2] - a[2]))
  return rows
}
