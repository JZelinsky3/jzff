// The recap as a newspaper: a headline, a lead story, a short written story
// for every game, and next week's previews. The page and the email both
// print from here.
//
// Every sentence is a template filled from facts.ts, so nothing in it can be
// wrong in a way the numbers aren't. (A model wrote the intro for a while and
// kept fusing facts: "Connie snapping CAT's run" when Connie had extended her
// own.) Variety comes from picking between phrasings with a seed made of the
// league, year and week, so the same week always reads the same way.
//
// Two weeks must not read alike either. Joey, after weeks 3 and 4 of 2026:
// both headlines were "X snaps N-game skid against Y", both papers ran the
// same paragraphs in the same order, and "none of the 3-0 teams won the
// title" was followed by "none of the 4-0 teams won the title", which the
// first one already said. So every paper carries an outline of last week's
// (facts.prior, see editionSig): the story kind that led it, the layout, and
// every phrasing it used. This week's lead story steers away from last
// week's kind, the paragraphs come in a different order, and each phrasing
// goes to the back of its queue.
//
// Each fact is told once. The lead story claims the facts it uses, and the
// game stories skip anything already claimed, so the series line or the
// career high that leads the paper doesn't turn up again underneath it.

import {
  numberWord,
  ordinal,
  pts,
  recordStr,
  type RecapBookRow,
  type RecapEditionSig,
  type RecapFacts,
  type RecapGame,
  type RecapMark,
  type RecapMeeting,
  type RecapNextGame,
  type RecapSeries,
  type RecapSide,
  type RecapStanding,
  type RecapStart,
  type RecapStartMark,
  type RecapTeamCard,
  type RecapTotalRow,
  type RecapRunMark,
} from './facts'

export type FrontPage = { headline: string; deck: string | null; paragraphs: string[] }
export type GameStory = { anchor: string; kicker: string | null; headline: string; body: string; game: RecapGame }
export type Preview = { game: RecapNextGame; note: string | null }
export type Edition = { front: FrontPage; stories: GameStory[]; previews: Preview[]; sig: RecapEditionSig }

// ── Small helpers ─────────────────────────────────────────────────────────

const W = (g: RecapGame) => (g.winner === 'b' ? g.b : g.a)
const L = (g: RecapGame) => (g.winner === 'b' ? g.a : g.b)
const decided = (g: RecapGame) => g.winner === 'a' || g.winner === 'b'

// AP style: Chris' team, Joey's team.
export function poss(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`
}

function score(g: RecapGame): string {
  if (g.leg?.n === 2 && g.leg.totalA != null && g.leg.totalB != null) {
    const [w, l] = g.winner === 'a' ? [g.leg.totalA, g.leg.totalB] : [g.leg.totalB, g.leg.totalA]
    return `${pts(w)} to ${pts(l)} over two weeks`
  }
  return `${pts(W(g).score)} to ${pts(L(g).score)}`
}

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// Capitalise a sentence that opens on an ordinary word ("the series is
// even"). Never a name: Sleeper usernames like jonah32 are printed exactly as
// the league knows them.
const PLAIN_START = /^(the|though|and|defending|[a-z]+-time|it|that|both|after|for|no|nobody|none|only|all|those|this|next|of|a|week|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/
function cap(s: string): string {
  return PLAIN_START.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

const bare = (s: string) => s.replace(/\.\s*$/, '')
const words = (s: string) => s.split(/\s+/).length

// Two sentences about the same person become one: "Mason still leads the
// series 6-5." + "Mason is 0-3 for the first time..." reads as "Mason still
// leads the series 6-5 and is 0-3 for the first time...". Only when the
// second one opens on the name the first one's last sentence opens on, and
// only while the result stays a readable length.
function fuse(a: string, b: string, names: string[]): string {
  const parts = a.split(/(?<=\.)\s+/)
  const last = parts[parts.length - 1]
  const name = names.find((n) => last.startsWith(`${n} `) && b.startsWith(`${n} `))
  if (!name || words(last) + words(b) > 34 || /\b(and|but|though)\b/.test(last.slice(name.length))) return `${a} ${b}`
  const conj = /\b0-\d|\blow|\bfewest|\bslow|\blost\b/.test(b) !== /\b0-\d|\blow|\bfewest|\bslow|\blost\b/.test(last) ? 'but' : 'and'
  parts[parts.length - 1] = `${bare(last)} ${conj} ${b.slice(name.length + 1)}`
  return parts.join(' ')
}

// Opening a later sentence in a paragraph: "Elsewhere, Evan beat Luke".
// A plain word after the comma goes lower case; a name never changes.
function after(lead: string, s: string): string {
  const low = s.charAt(0).toLowerCase() + s.slice(1)
  return `${lead}, ${PLAIN_START.test(low) ? low : s}`
}

const ORDINAL_WORDS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth']
function ordinalWord(n: number): string {
  return ORDINAL_WORDS[n] ?? ordinal(n)
}

// A count inside a sentence: "four teams", "21 teams".
function num(n: number): string {
  return n <= 9 ? numberWord(n) : String(n)
}

// A count at the start of a sentence: "Eleven teams", "21 teams".
function countWord(n: number): string {
  const w = numberWord(n)
  return w.charAt(0).toUpperCase() + w.slice(1)
}

function pct(r: { w: number; l: number; t: number }): number | null {
  const n = r.w + r.l + r.t
  return n ? (r.w + r.t / 2) / n : null
}

function oddsText(odds: number): string {
  if (odds < 1) return 'less than a 1%'
  if (odds > 99 && odds < 100) return 'a 99%'
  return `a ${Math.round(odds)}%`
}

// A small stable hash, so the same recap always picks the same phrasing.
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Every phrasing choice in one paper goes through here. Inside a paper, a
// family hands out each of its options once before repeating any, so six
// game stories don't all say "leading the way". Across papers, whatever last
// week's paper used goes to the back of the queue. The seed settles the
// rest, so a paper always comes out the same. A bias below zero moves an
// option forward when it is the stronger thing to say.
type Option<T> = [id: string, value: T, bias?: number]

class Desk {
  readonly used: string[] = []
  private count = new Map<string, number>()
  constructor(
    private seed: string,
    private avoid: Set<string>,
  ) {}

  pick<T>(family: string, options: Option<T>[]): T {
    const rank = ([id, , bias = 0]: Option<T>) => {
      const key = `${family}:${id}`
      return (this.count.get(key) ?? 0) * 4 + (this.avoid.has(key) ? 2 : 0) + bias + (hash(`${this.seed}:${key}`) % 1000) / 1000
    }
    const [id, value] = [...options].sort((a, b) => rank(a) - rank(b))[0]
    const key = `${family}:${id}`
    this.count.set(key, (this.count.get(key) ?? 0) + 1)
    this.used.push(key)
    return value
  }

  // Was this option used last week?
  stale(family: string, id: string): boolean {
    return this.avoid.has(`${family}:${id}`)
  }
}

// The series from one side's point of view.
function seriesFrom(g: RecapGame | RecapNextGame, name: string, s: RecapSeries): { w: number; l: number; t: number } {
  return g.a.name === name ? { w: s.w, l: s.l, t: s.t } : { w: s.l, l: s.w, t: s.t }
}

// "Connie leads the series 5-4", as a sentence of its own. No "since 2019":
// the series starts when the two of them were first in the league together,
// and saying so adds nothing.
function seriesState(me: string, them: string, r: { w: number; l: number; t: number }): string {
  if (r.w > r.l) return `${me} leads the series ${recordStr(r.w, r.l, r.t)}`
  if (r.w < r.l) return `${them} leads the series ${recordStr(r.l, r.w, r.t)}`
  return `the series is even at ${recordStr(r.w, r.l, r.t)}`
}

// The same thing as a clause that follows a sentence about `me`: "and leads
// the series 8-2", "though Mason still leads the series 6-5".
function seriesTail(me: string, them: string, r: { w: number; l: number; t: number }): string {
  if (r.w > r.l) return `and leads the series ${recordStr(r.w, r.l, r.t)}`
  if (r.w < r.l) return `though ${them} still leads the series ${recordStr(r.l, r.w, r.t)}`
  return `and the series is even at ${recordStr(r.w, r.l, r.t)}`
}

// The series after a win, as a clause that follows a sentence about that
// win: "which puts Connie ahead 5-4 in the series", "though Mason still
// leads the series 6-5".
function seriesAfter(me: string, them: string, r: { w: number; l: number; t: number }): string {
  if (r.w > r.l) return `which puts ${me} ahead ${recordStr(r.w, r.l, r.t)} in the series`
  if (r.w < r.l) return `though ${them} still leads the series ${recordStr(r.l, r.w, r.t)}`
  return `which evens the series at ${recordStr(r.w, r.l, r.t)}`
}

// "a 112.32 to 107.36 win", "a 220.5 to 210.1 win over two weeks".
function winBy(g: RecapGame): string {
  if (g.leg?.n === 2 && g.leg.totalA != null && g.leg.totalB != null) {
    const [w, l] = g.winner === 'a' ? [g.leg.totalA, g.leg.totalB] : [g.leg.totalB, g.leg.totalA]
    return `${pts(w)} to ${pts(l)} win over two weeks`
  }
  return `${pts(W(g).score)} to ${pts(L(g).score)} win`
}

// Only the final is named. Platforms flag consolation games as playoff
// games (twfl marks all eight games of every playoff week), so "the 2025
// playoffs" could be a game for seventh place.
function when(m: RecapMeeting, year: number): string {
  if (m.kind === 'championship') return `the ${m.year} final`
  if (m.year === year) return `week ${m.week}`
  if (m.year === year - 1) return `week ${m.week} last season`
  return `week ${m.week} of ${m.year}`
}

// "defending champion", "two-time champion", "2024 champion". Older single
// titles are left off: in a league where most people have won once, tagging
// every name turns into noise.
function epithet(s: { titles: number[] }, year: number): string | null {
  const t = s.titles
  if (!t.length) return null
  if (t.length >= 2) return `${numberWord(t.length)}-time champion`
  if (t[0] === year - 1) return 'defending champion'
  if (t[0] >= year - 3) return `${t[0]} champion`
  return null
}

function cardOf(f: RecapFacts, managerId: string): RecapTeamCard | undefined {
  return f.teams.find((t) => t.managerId === managerId)
}

function gameIndexOf(f: RecapFacts, managerId: string): number {
  return f.games.findIndex((g) => g.a.managerId === managerId || g.b.managerId === managerId)
}

const SUPERLATIVE: Record<RecapBookRow['key'], [string, string]> = {
  top: ['highest score', 'scores'],
  low: ['lowest score', 'scores'],
  heartbreak: ['most points in a loss', 'losing scores'],
  robbery: ['fewest points in a win', 'winning scores'],
  closest: ['closest game', 'games'],
  blowout: ['biggest margin', 'games'],
}

// The history line under a record-book row.
export function bookLine(row: RecapBookRow, f: RecapFacts): string {
  const [sup, unit] = SUPERLATIVE[row.key]
  if (row.rank === 1) return `The ${sup} in league history`
  if (row.rank <= 10) return `${ordinal(row.rank)} ${sup} in league history, out of ${row.of.toLocaleString('en-US')} ${unit}`
  if (row.seasonRank === 1 && f.week > 1) return `The ${sup} of the season so far`
  return `${ordinal(row.seasonRank)} ${sup} this season`
}

// A start compared with the manager's own past starts. `v` picks the
// phrasing.
function startSentence(name: string, rec: string, m: RecapStartMark, v = 0): string {
  if (m.kind === 'first-ever') {
    return v % 2 === 0
      ? `${name} is ${rec} for the first time in ${numberWord(m.seasons)} seasons in the league.`
      : `It is ${poss(name)} first ${rec} start in ${numberWord(m.seasons)} seasons in the league.`
  }
  if (m.kind === 'first-since') {
    return v % 2 === 0 ? `It is ${poss(name)} first ${rec} start since ${m.year}.` : `${name} hasn't started ${rec} since ${m.year}.`
  }
  return v % 2 === 0
    ? `${name} has started ${rec} for the ${ordinalWord(m.years)} straight season.`
    : `It is the ${ordinalWord(m.years)} straight season ${name} has started ${rec}.`
}

// The same facts as predicates, so two of them about one person can share a
// sentence ("Sean is 3-0 for the first time since 2023 but hasn't scored
// this little through three weeks since 2021"). `good` decides between "and"
// and "but" when two are joined.
type Clause = { text: string; good: boolean }

function startClause(rec: string, m: RecapStartMark): Clause {
  const good = /-0$/.test(rec)
  if (m.kind === 'first-ever') return { text: `is ${rec} for the first time in ${numberWord(m.seasons)} seasons in the league`, good }
  if (m.kind === 'first-since') return { text: `is ${rec} for the first time since ${m.year}`, good }
  return { text: `has started ${rec} for the ${ordinalWord(m.years)} straight season`, good }
}

// Each kind has two or three phrasings, dealt by the desk, because a paper
// can carry four of these and "is off to a career-best start" read four
// times is the thing a reader notices.
function runClause(desk: Desk, name: string, week: number, m: RecapRunMark): Clause {
  const w = numberWord(week)
  const v = pts(m.value)
  switch (m.kind) {
    case 'start-best':
      return m.since == null
        ? desk.pick('run-best', [
            ['0', { text: `is off to a career-best start, ${v} points through ${w} weeks`, good: true }],
            ['1', { text: `has ${v} points through ${w} weeks, the best start of ${poss(name)} career`, good: true }],
            ['2', { text: `has never scored more through ${w} weeks than this year's ${v}`, good: true }],
          ])
        : desk.pick('run-best-since', [
            ['0', { text: `hasn't started this well since ${m.since}, with ${v} points through ${w} weeks`, good: true }],
            ['1', { text: `has ${v} points through ${w} weeks, ${poss(name)} best start since ${m.since}`, good: true }],
          ])
    case 'start-worst':
      return m.since == null
        ? desk.pick('run-worst', [
            ['0', { text: `is off to a career-worst start, ${v} points through ${w} weeks`, good: false }],
            ['1', { text: `has ${v} points through ${w} weeks, the fewest of ${poss(name)} career`, good: false }],
          ])
        : desk.pick('run-worst-since', [
            ['0', { text: `hasn't scored this little through ${w} weeks since ${m.since} (${v} points)`, good: false }],
            ['1', { text: `has ${v} points through ${w} weeks, ${poss(name)} fewest since ${m.since}`, good: false }],
          ])
    case 'two-week-best':
      return m.since == null
        ? desk.pick('run-two', [
            ['0', { text: `has a career-best ${v} points over the last two weeks`, good: true }],
            ['1', { text: `has never had a better two weeks than the last two (${v} points)`, good: true }],
          ])
        : desk.pick('run-two-since', [
            ['0', { text: `hasn't had a better two-week stretch since ${m.since} (${v} points)`, good: true }],
            ['1', { text: `has ${v} points over the last two weeks, ${poss(name)} best two weeks since ${m.since}`, good: true }],
          ])
  }
}

// One or two clauses about one person, as a sentence. A clause with a comma
// in it ("..., 313.48 points through two weeks") can only go last; two of
// those stay two sentences.
function clauseSentence(name: string, cs: Clause[]): string {
  if (cs.length === 1) return `${name} ${cs[0].text}.`
  const [a, b] = cs[0].text.includes(',') ? [cs[1], cs[0]] : [cs[0], cs[1]]
  if (a.text.includes(',')) return `${name} ${a.text}. ${name} also ${b.text}.`
  return `${name} ${a.text} ${a.good === b.good ? 'and' : 'but'} ${b.text}.`
}

function markSentence(name: string, s: number, m: RecapMark): string | null {
  switch (m.kind) {
    case 'career-high':
      return `The ${pts(s)} was a career high for ${name}, topping the ${pts(m.old)} from ${m.oldYear}.`
    case 'career-low':
      return `${poss(name)} ${pts(s)} was a career low.`
    case 'best-since':
      return `It was ${poss(name)} best score since ${m.year}.`
    case 'low-since':
      return `It was ${poss(name)} lowest score since ${m.year}.`
    default:
      return null
  }
}

// The phrase each running total ranks on.
const TOTAL_SUP: Record<RecapTotalRow['key'], string> = {
  pf: 'most points',
  pfLow: 'fewest points',
  pa: 'most points against',
  twoWeek: 'most points in back-to-back weeks',
  leagueHigh: 'highest league-wide average',
  leagueLow: 'lowest league-wide average',
  streak: 'longest win streak',
}

function totalValue(row: RecapTotalRow): string {
  return row.key === 'streak' ? `${row.value} straight` : pts(row.value)
}

// The history line under a running-total row, with the mark it is measured
// against (the old record it broke, or the record it chases) split off so
// the page can print it in its own colour.
export function totalLine(row: RecapTotalRow, f: RecapFacts): { line: string; mark: string | null } {
  const sup = TOTAL_SUP[row.key]
  const at = row.key === 'pf' || row.key === 'pfLow' || row.key === 'pa' ? ` through ${numberWord(f.week)} weeks` : row.key === 'streak' ? ' in a season' : row.key.startsWith('league') ? ' for a week' : ''
  const held = (r: { who: string; value: number; year: number }) =>
    r.who === 'The league' ? `${r.year}'s ${row.key === 'streak' ? r.value : pts(r.value)}` : `${poss(r.who)} ${row.key === 'streak' ? r.value : pts(r.value)} in ${r.year}`
  if (row.rank === 1) return { line: `The ${sup}${at} in league history`, mark: row.record ? `The old mark was ${held(row.record)}` : null }
  if (row.rank <= 10) return { line: `${ordinal(row.rank)} ${sup}${at} in league history`, mark: row.record ? `Record: ${held(row.record)}` : null }
  return { line: `The ${sup}${at} since ${row.since ? held(row.since) : ''}`, mark: null }
}

// The same thing as a sentence for the lead story. `v` picks the phrasing
// where there is more than one.
function totalSentence(row: RecapTotalRow, f: RecapFacts, v = 0): string {
  const w = numberWord(f.week)
  const val = totalValue(row)
  const rankText = row.rank === 1
    ? 'the most in league history'
    : row.rank <= 10
      ? `the ${ordinal(row.rank)}-most in league history`
      : `the most since ${row.since!.who === 'The league' ? row.since!.year : `${row.since!.who} in ${row.since!.year}`}`
  // "Just ahead" only when it is: 547 to 475 is not close.
  const close = !!row.chaser && row.value - row.chaser.value <= row.value * 0.03
  const fewest = rankText.replace('most', 'fewest')
  const lowest = rankText.replace('most', 'lowest')
  const highest = rankText.replace('most', 'highest')
  switch (row.key) {
    case 'pf':
      if (v % 2 === 1 && row.rank === 1) {
        return `No team has ever had more points through ${w} weeks than ${poss(row.who)} ${val}${
          row.chaser ? (close ? `, and ${poss(row.chaser.who)} ${pts(row.chaser.value)} is right behind it` : `, with ${poss(row.chaser.who)} ${pts(row.chaser.value)} next`) : ''
        }.`
      }
      if (v % 2 === 1 && row.rank <= 10) return `${poss(row.who)} ${val} points through ${w} weeks are ${rankText} at this point of a season.`
      return `${row.who} has ${val} points through ${w} weeks, ${rankText} at this point of a season${
        row.chaser ? `, ${close ? 'just ' : ''}ahead of ${poss(row.chaser.who)} ${pts(row.chaser.value)}` : ''
      }.`
    case 'pfLow':
      return `${row.who} has ${val} points through ${w} weeks, ${fewest} at this point of a season.`
    case 'pa':
      if (v % 2 === 1 && row.rank === 1) return `No team has had more scored against it through ${w} weeks than ${row.who}, at ${val}.`
      return `${row.who} has had ${val} points scored against them through ${w} weeks, ${rankText} at this point of a season.`
    case 'twoWeek':
      return `${poss(row.who)} ${val} over the last two weeks is ${rankText} for back-to-back weeks.`
    case 'leagueHigh':
      return `The league averaged ${val} points a team this week, ${highest} for a week.`
    case 'leagueLow':
      return `The league averaged ${val} points a team this week, ${lowest} for a week.`
    case 'streak':
      return `${row.who} has won ${row.value} straight, ${rankText.replace('most', 'longest')} for a streak inside a season.`
  }
}

// Through two weeks, "the last two weeks" and "through two weeks" are the
// same number; only the start is told. A win streak as long as the season
// is the unbeaten start, which the table tells.
function liveTotals(f: RecapFacts): RecapTotalRow[] {
  return (f.totals ?? []).filter((r) => !(r.key === 'twoWeek' && f.week === 2) && !(r.key === 'streak' && r.value >= f.week))
}

// Claims a running total makes about its manager, so the start and
// two-week notes underneath don't say the same number again.
function totalClaims(row: RecapTotalRow, f: RecapFacts): string[] {
  const out = [`total:${row.key}`]
  const t = f.teams.find((x) => x.name === row.who)
  if (t && (row.key === 'pf' || row.key === 'pfLow')) out.push(`run:start:${t.managerId}`, `pts:${t.managerId}`)
  const chaser = row.chaser ? f.teams.find((x) => x.name === row.chaser!.who) : null
  if (chaser && row.key === 'pf') out.push(`run:start:${chaser.managerId}`)
  if (t && row.key === 'twoWeek') out.push(`run:two:${t.managerId}`)
  return out
}

// ── The lead story ────────────────────────────────────────────────────────

type Variant = { id: string; headline: string; lede: string }

type Angle = {
  // What kind of story this is ("snap", "first-loss", "total-pf"). Last
  // week's headline kind is held back this week.
  kind: string
  weight: number
  // Two or three ways to write it; the desk picks one.
  variants: Variant[]
  // The same fact as a sentence that can follow another angle's lede about
  // the same game, without restating the score.
  tail: string | null
  // The game this angle is about, when it is about one.
  game: number | null
  // Facts this angle tells, so nothing else repeats them.
  claims: string[]
}

type Chosen = Angle & { headline: string; lede: string; tails: string[] }

function angles(f: RecapFacts, league: string): Angle[] {
  const out: Angle[] = []
  const book = new Map((f.book ?? []).map((r) => [r.key, r]))
  const result = (t: RecapTeamCard) =>
    t.result === 'W' ? `in a win over ${t.opponent}` : t.result === 'L' ? `and still lost to ${t.opponent}` : `against ${t.opponent}`
  const seasons = numberWord(f.history.seasons)

  const final = f.games.findIndex((g) => g.kind === 'championship' && decided(g))
  if (final >= 0) {
    const g = f.games[final]
    const n = W(g).titles.length + 1
    out.push({
      kind: 'title',
      weight: 100,
      variants: [{
        id: '0',
        headline: `${W(g).name} wins the ${f.year} title`,
        lede: `${W(g).name} beat ${L(g).name} ${score(g)} in the final and is the ${f.year} champion of ${league}, ${
          n === 1 ? `the first title of ${poss(W(g).name)} career.` : `a ${ordinalWord(n)} title to go with ${list(W(g).titles.map(String))}.`
        }`,
      }],
      tail: null,
      game: final,
      claims: [],
    })
  }

  const top = book.get('top')
  if (top && top.rank <= 5) {
    const r = top.record
    out.push({
      kind: 'top',
      weight: top.rank === 1 ? 90 : 85 - top.rank,
      variants: top.rank === 1
        ? [
            {
              id: '0',
              headline: `${top.who} sets the league scoring record`,
              lede: `${top.who} scored ${pts(top.value)}, the most any team has put up in ${seasons} seasons of ${league}${
                r ? `, breaking the record of ${pts(r.value)} that ${r.who} set in ${r.year}` : ''
              }.`,
            },
            {
              id: '1',
              headline: `${pts(top.value)} from ${top.who}, a league record`,
              lede: `No team in ${seasons} seasons of ${league} had scored more than the ${pts(top.value)} ${top.who} put up this week${
                r ? `. The old record was the ${pts(r.value)} ${r.who} scored in ${r.year}` : ''
              }.`,
            },
          ]
        : [
            {
              id: '0',
              headline: `${top.who} posts the ${ordinal(top.rank)}-best score in league history`,
              lede: `${top.who} scored ${pts(top.value)}, the ${ordinal(top.rank)}-highest score in ${seasons} seasons of ${league}${
                r ? `, though the record is still the ${pts(r.value)} ${r.who} put up in ${r.year}` : ''
              }.`,
            },
            {
              id: '1',
              headline: `${top.who} puts up ${pts(top.value)}, the ${ordinal(top.rank)}-best score ever`,
              lede: `Only ${numberWord(top.rank - 1)} ${top.rank === 2 ? 'score' : 'scores'} in ${seasons} seasons of ${league} ${top.rank === 2 ? 'has' : 'have'} topped the ${pts(top.value)} ${top.who} put up this week${
                r ? `, and the record is still the ${pts(r.value)} ${r.who} scored in ${r.year}` : ''
              }.`,
            },
          ],
      tail:
        top.rank === 1
          ? `${poss(top.who)} ${pts(top.value)} is a league record.`
          : `${poss(top.who)} ${pts(top.value)} is the ${ordinal(top.rank)}-highest score in league history.`,
      game: gameIndexOf(f, top.managerId),
      claims: ['book:top', `mark:${top.managerId}`],
    })
  }
  const low = book.get('low')
  if (low && low.rank === 1) {
    out.push({
      kind: 'low',
      weight: 82,
      variants: [
        {
          id: '0',
          headline: `${low.who} sets the league's low-score record`,
          lede: `${poss(low.who)} ${pts(low.value)} is the lowest score in ${league} history${
            low.record ? `, under the ${pts(low.record.value)} ${low.record.who} scored in ${low.record.year}` : ''
          }.`,
        },
        {
          id: '1',
          headline: `${low.who} hits a new league low`,
          lede: `No team in ${seasons} seasons of ${league} had scored less than the ${pts(low.value)} ${low.who} put up this week${
            low.record ? `. The old low was ${poss(low.record.who)} ${pts(low.record.value)} in ${low.record.year}` : ''
          }.`,
        },
      ],
      tail: `${poss(low.who)} ${pts(low.value)} is the lowest score in league history.`,
      game: gameIndexOf(f, low.managerId),
      claims: ['book:low', `mark:${low.managerId}`],
    })
  }

  f.games.forEach((g, i) => {
    const ev = g.seriesEvent
    if (!ev || !decided(g)) return
    const w = W(g).name
    const l = L(g).name
    const r = g.series ? seriesFrom(g, w, g.series) : null
    if (ev.kind === 'snap') {
      const n = numberWord(ev.run)
      // After a snapped run the loser usually still leads the series: "still".
      const state = !r
        ? ''
        : r.w > r.l
          ? ` ${w} now leads the series ${recordStr(r.w, r.l, r.t)}.`
          : r.w < r.l
            ? ` ${l} still leads the series ${recordStr(r.l, r.w, r.t)}.`
            : ` The series is now even at ${recordStr(r.w, r.l, r.t)}.`
      out.push({
        kind: 'snap',
        weight: 70 + ev.run,
        // "ends Mason's five-game run" read as five straight wins overall;
        // the skid is Joey's, and it was against Mason.
        variants: [
          {
            id: '0',
            headline: `${w} snaps ${n}-game skid against ${l}`,
            lede: `${w} had lost ${n} straight to ${l} until this week, when a ${winBy(g)} finally ended the skid.${state}`,
          },
          {
            id: '1',
            headline: `${w} finally gets one against ${l}`,
            lede: `After ${n} straight losses to ${l}, ${w} finally got one, ${score(g)}.${state}`,
          },
          {
            id: '2',
            headline: `${poss(w)} losing run against ${l} ends at ${n}`,
            lede: `${w} beat ${l} ${score(g)}, ending a run of ${n} straight losses in the series.${state}`,
          },
        ],
        tail: `It also ended ${poss(l)} ${n}-game run in the series.`,
        game: i,
        claims: [`game:${i}:series`],
      })
    } else if (ev.kind === 'extend') {
      const tail = r ? `, ${seriesAfter(w, l, r)}` : ''
      const ledeTail = r ? `, ${seriesTail(w, l, r)}` : ''
      out.push({
        kind: 'extend',
        weight: 45 + ev.run,
        variants: [
          {
            id: '0',
            headline: `${w} makes it ${numberWord(ev.run)} straight over ${l}`,
            lede: `${w} beat ${l} for the ${ordinalWord(ev.run)} straight time, ${score(g)}${ledeTail.replace(', and leads', ', and now leads')}.`,
          },
          {
            id: '1',
            headline: `${l} still can't beat ${w}`,
            lede: `${w} beat ${l} again, ${score(g)}, for a ${ordinalWord(ev.run)} straight win${tail}.`,
          },
          {
            id: '2',
            headline: cap(`${numberWord(ev.run)} in a row for ${w} over ${l}`),
            lede: `${l} has now lost ${numberWord(ev.run)} straight to ${w}, the latest ${score(g)}${r ? `, and ${seriesState(w, l, r)}` : ''}.`,
          },
        ],
        tail: `It was ${poss(w)} ${ordinalWord(ev.run)} straight win over ${l}${tail}.`,
        game: i,
        claims: [`game:${i}:series`],
      })
    }
  })

  for (const t of f.teams) {
    const m = t.mark
    if (!m) continue
    const gi = gameIndexOf(f, t.managerId)
    if (m.kind === 'career-high') {
      out.push({
        kind: 'career-high',
        weight: 75,
        variants: [
          { id: '0', headline: `${t.name} sets a career high`, lede: `${t.name} scored ${pts(t.score)} ${result(t)}, a career high that tops the ${pts(m.old)} from ${m.oldYear}.` },
          { id: '1', headline: `A career-best ${pts(t.score)} for ${t.name}`, lede: `${poss(t.name)} ${pts(t.score)} ${result(t)} is the most ${t.name} has ever scored, topping the ${pts(m.old)} from ${m.oldYear}.` },
        ],
        tail: markSentence(t.name, t.score, m),
        game: gi,
        claims: [`mark:${t.managerId}`],
      })
    } else if (m.kind === 'career-low') {
      out.push({
        kind: 'career-low',
        weight: 58,
        variants: [
          { id: '0', headline: `${t.name} hits a career low`, lede: `${t.name} scored ${pts(t.score)} ${result(t)}, the fewest in ${poss(t.name)} career.` },
          { id: '1', headline: `${t.name} bottoms out at ${pts(t.score)}`, lede: `${t.name} had never scored less than this week's ${pts(t.score)}, which came ${result(t)}.` },
        ],
        tail: markSentence(t.name, t.score, m),
        game: gi,
        claims: [`mark:${t.managerId}`],
      })
    } else if (m.kind === 'best-since' && f.year - m.year >= 3) {
      out.push({
        kind: 'best-since',
        weight: 40 + (f.year - m.year) * 3,
        variants: [
          { id: '0', headline: `${poss(t.name)} best week since ${m.year}`, lede: `${t.name} scored ${pts(t.score)} ${result(t)}, ${poss(t.name)} best score since ${m.year}.` },
          { id: '1', headline: `${t.name} puts up ${pts(t.score)}, a best since ${m.year}`, lede: `${t.name} hadn't scored as many as this week's ${pts(t.score)} since ${m.year}. It came ${result(t)}.` },
        ],
        tail: markSentence(t.name, t.score, m),
        game: gi,
        claims: [`mark:${t.managerId}`],
      })
    }
  }

  const heartbreak = book.get('heartbreak')
  if (heartbreak && heartbreak.rank <= 3) {
    const more =
      heartbreak.rank === 1
        ? 'No team in league history has scored more in a loss.'
        : `Only ${numberWord(heartbreak.rank - 1)} ${heartbreak.rank === 2 ? 'team' : 'teams'} in league history ${heartbreak.rank === 2 ? 'has' : 'have'} scored more in a loss.`
    out.push({
      kind: 'heartbreak',
      weight: 64 - heartbreak.rank,
      variants: [
        { id: '0', headline: `${heartbreak.who} scores ${pts(heartbreak.value)} and loses`, lede: `${heartbreak.who} scored ${pts(heartbreak.value)} and still lost to ${heartbreak.vs}. ${more}` },
        { id: '1', headline: `${pts(heartbreak.value)} isn't enough for ${heartbreak.who}`, lede: `${heartbreak.vs} beat ${heartbreak.who} even though ${heartbreak.who} put up ${pts(heartbreak.value)}. ${more}` },
      ],
      tail: `${heartbreak.who} scored ${pts(heartbreak.value)} in the loss. ${more}`,
      game: gameIndexOf(f, heartbreak.managerId),
      claims: ['book:heartbreak'],
    })
  }
  for (const key of ['closest', 'blowout'] as const) {
    const row = book.get(key)
    if (!row || row.rank > 3) continue
    const what = key === 'closest' ? 'closest game' : 'biggest margin'
    const nth = row.rank === 1 ? `the ${what}` : `the ${ordinal(row.rank)}-${what}`
    out.push({
      kind: key,
      weight: (key === 'closest' ? 58 : 60) - row.rank,
      variants: [
        { id: '0', headline: `${row.who} beats ${row.vs} by ${pts(row.value)}`, lede: `${row.who} beat ${row.vs} by ${pts(row.value)}, ${nth} in league history.` },
        {
          id: '1',
          headline: key === 'closest' ? `${row.who} wins by ${pts(row.value)}` : `${row.who} wins by ${pts(row.value)}, ${nth} ever`,
          lede: `The ${pts(row.value)} points between ${row.who} and ${row.vs} make it ${nth} in league history.`,
        },
      ],
      tail: `The ${pts(row.value)}-point margin is ${nth} in league history.`,
      game: gameIndexOf(f, row.managerId),
      claims: [`book:${key}`],
    })
  }

  if (f.upset) {
    const u = f.upset
    const firstLoss = /^\d+-0$/.test(u.loserRecord)
    const gi = f.games.findIndex((g) => decided(g) && W(g).name === u.winner && L(g).name === u.loser)
    const ids = gi >= 0 ? [W(f.games[gi]).managerId, L(f.games[gi]).managerId] : []
    const s = `${pts(u.winnerScore)} to ${pts(u.loserScore)}`
    out.push({
      kind: firstLoss ? 'first-loss' : 'upset',
      weight: firstLoss ? 52 : 46,
      variants: firstLoss
        ? [
            { id: '0', headline: `${u.winner} hands ${u.loser} their first loss`, lede: `${u.winner} came in at ${u.winnerRecord} and handed ${u.loser} their first loss, ${s}.` },
            { id: '1', headline: `${u.loser} is unbeaten no more`, lede: `${poss(u.loser)} unbeaten start is over: ${u.winner}, who came in at ${u.winnerRecord}, won ${s}.` },
            { id: '2', headline: `${u.winner} ends ${poss(u.loser)} unbeaten start`, lede: `${u.loser} came in at ${u.loserRecord} and lost ${s} to ${u.winner}, who had been ${u.winnerRecord}.` },
          ]
        : [
            { id: '0', headline: `${u.winner} upsets ${u.loser}`, lede: `${u.winner} came in at ${u.winnerRecord} and beat ${u.loser}, who came in at ${u.loserRecord}, ${s}.` },
            { id: '1', headline: `${u.winner} knocks off ${u.loser}`, lede: `${u.winner}, at ${u.winnerRecord}, pulled the upset of the week over ${u.loser}, at ${u.loserRecord}, ${s}.` },
          ],
      tail: firstLoss ? `It was ${poss(u.loser)} first loss of the season.` : `${u.winner} came in at ${u.winnerRecord}, ${u.loser} at ${u.loserRecord}.`,
      game: gi >= 0 ? gi : null,
      // The records going in are the story, and "moves to 1-3" underneath
      // would be the same record told again.
      claims: ['upset', ...ids.map((id) => `rec:${id}`)],
    })
  }

  if (f.weekRecord?.isNew) {
    out.push({
      kind: 'week-record',
      weight: 52,
      variants: [
        { id: '0', headline: `${f.weekRecord.who} sets the week ${f.week} record`, lede: `${poss(f.weekRecord.who)} ${pts(f.weekRecord.value)} is the best week ${f.week} score in league history.` },
        { id: '1', headline: `Nobody has scored more in a week ${f.week} than ${f.weekRecord.who}`, lede: `No team had put up more in week ${f.week} of a season than the ${pts(f.weekRecord.value)} ${f.weekRecord.who} scored this time.` },
      ],
      tail: `It is also the best week ${f.week} score in league history.`,
      game: f.top ? gameIndexOf(f, f.top.managerId) : null,
      claims: ['weekRecord'],
    })
  }

  // A first-ever start for a team that isn't unbeaten or winless. Those two
  // are told with the table further down, and telling it here as well put
  // "Isaac is 4-0" in two paragraphs in a row.
  const tableTells = f.phase === 'regular' && !!f.standings?.length && f.week >= 2
  for (const t of f.teams) {
    const m = t.startMark
    if (!m || !t.record || m.kind !== 'first-ever') continue
    if (tableTells && /^(\d+-0|0-\d+)$/.test(t.record)) continue
    out.push({
      kind: 'start',
      weight: /-0$/.test(t.record) ? 44 : 42,
      variants: [
        { id: '0', headline: `${t.name} is ${t.record} for the first time`, lede: startSentence(t.name, t.record, m) },
        { id: '1', headline: `A first ${t.record} start for ${t.name}`, lede: startSentence(t.name, t.record, m, 1) },
      ],
      tail: startSentence(t.name, t.record, m),
      game: gameIndexOf(f, t.managerId),
      claims: [`start:${t.managerId}`, `rec:${t.managerId}`],
    })
  }

  // The season so far, when it is the biggest thing in the paper: the most
  // points anyone has had through this many weeks, a record win streak.
  for (const row of liveTotals(f)) {
    // Points against only as the record: "3rd-most points against" is a
    // table line, not a headline.
    const strong = row.key === 'pf' || row.key === 'twoWeek' || row.key === 'streak' ? row.rank <= 3 : row.rank === 1
    if (!strong) continue
    const w = numberWord(f.week)
    const t = f.teams.find((x) => x.name === row.who)
    // "The most ever" in a league with three seasons on record beats nine
    // other teams' starts. It still runs, it just doesn't push a snapped
    // skid or an upset off the top.
    const shallow = f.history.seasons < 5 ? 15 : 0
    const weight = -shallow + (
      row.key === 'pf' ? [0, 78, 64, 58][row.rank]
      : row.key === 'streak' ? (row.rank === 1 ? 70 : 50)
      : row.key === 'twoWeek' ? (row.rank === 1 ? 66 : 52)
      : row.key === 'pa' ? (row.rank === 1 ? 50 : 40)
      : row.key === 'pfLow' ? 56
      : 54)
    const nth = row.rank === 1 ? 'most' : `${ordinal(row.rank)}-most`
    const heads: Record<RecapTotalRow['key'], string[]> = {
      pf: row.rank === 1
        ? [`${row.who} has the most points ever through ${w} weeks`, `${row.who} is on a record scoring pace`]
        : [`${row.who} is on the ${ordinal(row.rank)}-best scoring start in league history`, `${row.who} has the ${nth} points ever through ${w} weeks`],
      pfLow: [`${row.who} has the fewest points ever through ${w} weeks`, `A record-low start for ${row.who}`],
      pa: row.rank === 1
        ? [`No team has had more scored against it than ${row.who}`, `A record ${pts(row.value)} points against ${row.who}`]
        : [`${row.who} has the ${nth} points against ever through ${w} weeks`, `${pts(row.value)} points against ${row.who} through ${w} weeks`],
      twoWeek: row.rank === 1
        ? [`${row.who} has the best two weeks in league history`, `A record two weeks for ${row.who}`]
        : [`${row.who} has the ${ordinal(row.rank)}-best two weeks in league history`, `${pts(row.value)} in two weeks for ${row.who}`],
      leagueHigh: [`The highest-scoring week in league history`, `${league} has its biggest scoring week ever`],
      leagueLow: [`The lowest-scoring week in league history`, `${league} has its quietest scoring week ever`],
      streak: row.rank === 1
        ? [`${row.who} wins a record ${row.value} straight`, `${row.value} straight for ${row.who}, a league record`]
        : [`${row.who} has won ${row.value} straight`, `${row.who} makes it ${row.value} in a row`],
    }
    out.push({
      kind: `total-${row.key}`,
      weight,
      variants: heads[row.key].map((headline, v) => ({ id: String(v), headline: cap(headline), lede: totalSentence(row, f, v) })),
      tail: totalSentence(row, f),
      game: t ? gameIndexOf(f, t.managerId) : null,
      claims: totalClaims(row, f),
    })
  }

  if (f.top) {
    out.push({
      kind: 'top-score',
      weight: 20,
      variants: [
        {
          id: '0',
          headline: `${f.top.name} leads week ${f.week} with ${pts(f.top.score)}`,
          lede: `${f.top.name} had the best score of the week, ${pts(f.top.score)}, ${f.top.won ? `in a win over ${f.top.opponent}` : `and still lost to ${f.top.opponent}`}.`,
        },
        {
          id: '1',
          headline: `${pts(f.top.score)} from ${f.top.name} tops week ${f.week}`,
          lede: `Nobody scored more this week than ${f.top.name}, whose ${pts(f.top.score)} came ${f.top.won ? `in a win over ${f.top.opponent}` : `in a loss to ${f.top.opponent}`}.`,
        },
      ],
      tail: null,
      game: gameIndexOf(f, f.top.managerId),
      claims: ['top'],
    })
  }
  return out
}

// Last week's headline kind is held back unless this one is a record or a
// title, and anything else last week led with is nudged down, so a second
// snapped skid in a row is still told but doesn't lead the paper again.
function reweigh(all: Angle[], prior: RecapEditionSig | null): Angle[] {
  return all
    .map((a) => {
      if (!prior || a.weight >= 85) return a
      if (prior.head === a.kind) return { ...a, weight: a.weight - 30 }
      if (prior.leads.includes(a.kind)) return { ...a, weight: a.weight - 10 }
      return a
    })
    .sort((a, b) => b.weight - a.weight)
}

// The lead: up to three angles about different games. An angle about a game
// that is already in the lead is folded into it as a tail sentence, so one
// game is never told twice.
function chooseLead(all: Angle[], desk: Desk): Chosen[] {
  const chosen: Chosen[] = []
  const claimed = new Set<string>()
  for (const a of all) {
    if (a.claims.some((c) => claimed.has(c))) continue
    // A tail about a game reads as part of that game's story ("It was
    // Connie's fifth straight win"), so it can only follow a lede that told
    // the game. A running total doesn't; the game stands as its own story.
    const same = a.game != null && a.game >= 0 ? chosen.find((c) => c.game === a.game && !c.kind.startsWith('total-')) : undefined
    if (same) {
      if (a.tail && same.tails.length < 1 && a.weight >= 30) {
        same.tails.push(a.tail)
        same.claims.push(...a.claims)
        for (const c of a.claims) claimed.add(c)
      }
      continue
    }
    if (chosen.length >= 3 || (chosen.length && a.weight < 30)) continue
    const v = desk.pick(`angle-${a.kind}`, a.variants.map((x): Option<Variant> => [x.id, x]))
    chosen.push({ ...a, claims: [...a.claims], tails: [], headline: v.headline, lede: v.lede })
    for (const c of a.claims) claimed.add(c)
  }
  return chosen
}

// ── The table: unbeaten and winless teams ────────────────────────────────

// One way to tell where a start leads: the title count, how many teams have
// done it, how they finished, the schedule behind it and ahead of it. A
// clause can ride on the opening sentence; a sentence stands alone.
type Frame = { id: string; clause: string | null; sentence: string; bias?: number }
type GroupSig = RecapEditionSig['up']

function groupFrames(
  f: RecapFacts,
  which: 'up' | 'down',
  rows: RecapStanding[],
  rec: string,
  st: RecapStart | undefined,
  claimed: Set<string>,
): Frame[] {
  const up = which === 'up'
  const prior = which === 'up' ? f.prior?.up : f.prior?.down
  const single = rows.length === 1 ? rows[0] : null
  const out: Frame[] = []

  if (st) {
    // "None of the 3-0 teams won the title" already told the reader that no
    // 4-0 team did.
    const implied = !!prior?.noneWon && st.champs === 0
    if (!implied) {
      const last = st.lastChamp ? `, most recently ${st.lastChamp.name} in ${st.lastChamp.year}` : ''
      if (st.champs === 0) {
        out.push({
          id: 'title',
          clause: up
            ? `, though history isn't kind to ${rec} starts: none of the ${num(st.teams)} teams to start ${rec} in league history went on to win the title`
            : `, and no ${rec} team has ever come back to win the title (${num(st.teams)} have tried)`,
          sentence: up
            ? `None of the ${num(st.teams)} teams to start ${rec} before went on to win the title.`
            : `No team that started ${rec} has ever come back to win the title, and ${num(st.teams)} have tried.`,
        })
      } else {
        out.push({
          id: 'title',
          clause: up
            ? `, and ${numberWord(st.champs)} of the ${num(st.teams)} teams to start ${rec} in league history went on to win the title${last}`
            : `, though ${numberWord(st.champs)} of the ${num(st.teams)} teams to start ${rec} in league history still won the title${last}`,
          sentence: `${countWord(st.champs)} of the ${num(st.teams)} teams to start ${rec} before went on to win the title${last}.`,
          bias: -0.5,
        })
      }
    }

    const k = rows.length
    out.push({
      id: 'count',
      clause: k === 1
        ? `, the ${ordinalWord(st.teams + 1)} team in league history to start that way`
        : `, ${numberWord(k)} of the ${num(st.teams + k)} teams in league history to start that way`,
      sentence: st.teams <= 6
        ? `Only ${numberWord(st.teams)} teams had started ${rec} before this season.`
        : `${countWord(st.teams)} teams had started ${rec} before this season.`,
    })

    if (st.avgFinish != null && st.bestFinish && st.worstFinish) {
      const avg = ordinal(Math.round(st.avgFinish))
      const range = st.bestFinish.rank === st.worstFinish.rank ? '' : `, anywhere from ${ordinal(st.bestFinish.rank)} to ${ordinal(st.worstFinish.rank)}`
      out.push({
        id: 'finish',
        clause: `, and the ${num(st.teams)} teams to do it before finished ${avg} on average`,
        sentence: `The ${num(st.teams)} teams to start ${rec} before finished ${avg} on average${range}.`,
      })
    }

    if (st.playoffs != null) {
      const p = st.playoffs
      out.push({
        id: 'playoffs',
        clause: p === st.teams
          ? `, and all ${num(st.teams)} teams to do it before made the playoffs`
          : p === 0
            ? `, and none of the ${num(st.teams)} teams to do it before made the playoffs`
            : `, and ${num(p)} of the ${num(st.teams)} teams to do it before made the playoffs`,
        sentence: p === st.teams
          ? `All ${num(st.teams)} teams to start ${rec} before made the playoffs.`
          : p === 0
            ? `None of the ${num(st.teams)} teams to start ${rec} before made the playoffs.`
            : `${up ? '' : 'Only '}${up ? countWord(p) : numberWord(p)} of the ${num(st.teams)} teams to start ${rec} before made the playoffs.`,
        bias: !up && p === 0 ? -0.3 : 0,
      })
    }
  }

  if (!single) return out
  const card = cardOf(f, single.managerId)

  // Their points against the teams that had this start before.
  if (st?.maxPts && st.minPts && st.avgPts && !claimed.has(`pts:${single.managerId}`)) {
    const pf = single.pf
    if (pf > st.maxPts.value) {
      out.push({
        id: 'points',
        clause: null,
        sentence: up
          ? `No team that started ${rec} before had scored as many as ${poss(single.name)} ${pts(pf)} points; the closest was ${poss(st.maxPts.name)} ${pts(st.maxPts.value)} in ${st.maxPts.year}.`
          : `${single.name} has scored ${pts(pf)}, more than any of the ${num(st.teams)} teams to start ${rec} before.`,
      })
    } else if (pf < st.minPts.value) {
      out.push({
        id: 'points',
        clause: null,
        sentence: up
          ? `${single.name} has done it on ${pts(pf)} points, fewer than any of the ${num(st.teams)} teams to start ${rec} before.`
          : `${poss(single.name)} ${pts(pf)} points are the fewest of any team to start ${rec}.`,
      })
    } else if (Math.abs(pf - st.avgPts) / st.avgPts >= 0.08) {
      out.push({
        id: 'points',
        clause: null,
        sentence: `${poss(single.name)} ${pts(pf)} points are ${pf > st.avgPts ? 'well above' : 'well below'} the ${pts(st.avgPts)} those teams averaged.`,
      })
    }
  }

  // The schedule behind the record.
  const faced = card?.sched?.faced
  const fp = faced ? pct(faced) : null
  if (faced && fp != null && faced.w + faced.l + faced.t >= 6 && (fp <= 0.38 || fp >= 0.62)) {
    const r = recordStr(faced.w, faced.l, faced.t)
    const soft = fp <= 0.38
    out.push({
      id: 'schedule',
      clause: null,
      sentence: up
        ? soft
          ? `The schedule has helped: ${poss(single.name)} opponents are a combined ${r} against everyone else.`
          : `None of it came cheap. ${poss(single.name)} opponents are a combined ${r} against the rest of the league.`
        : soft
          ? `It hasn't been the schedule. ${poss(single.name)} opponents are a combined ${r} against everyone else.`
          : `The schedule hasn't helped: ${poss(single.name)} opponents are a combined ${r} against everyone else.`,
      bias: -0.2,
    })
  }

  // And the schedule ahead.
  const ahead = card?.sched?.ahead
  const ap = ahead ? pct(ahead) : null
  if (ahead && ap != null && ahead.w + ahead.l + ahead.t >= 6 && (ap <= 0.4 || ap >= 0.6)) {
    const r = recordStr(ahead.w, ahead.l, ahead.t)
    const n = numberWord(ahead.weeks)
    const hard = ap >= 0.6
    out.push({
      id: 'ahead',
      clause: null,
      sentence: up
        ? hard
          ? `The next ${n} weeks will test it: ${list(ahead.names)}, a combined ${r}.`
          : `The next ${n} weeks bring ${list(ahead.names)}, a combined ${r}.`
        : hard
          ? `It doesn't get easier, with ${list(ahead.names)} (a combined ${r}) up next.`
          : `A way out could be coming. The next ${n} weeks bring ${list(ahead.names)}, a combined ${r}.`,
      bias: -0.2,
    })
  }

  // The sim, from week four on, when it has run.
  const odds = card?.odds?.now
  if (odds != null && f.week >= 4) {
    out.push({
      id: 'odds',
      clause: null,
      sentence: `The sim gives ${single.name} ${oddsText(odds)} chance at the playoffs.`,
    })
  }
  return out
}

function groupStory(
  f: RecapFacts,
  desk: Desk,
  claimed: Set<string>,
  which: 'up' | 'down',
  afterUp: boolean,
  // Frames the other group already used in this paper: the top and the
  // bottom of the table shouldn't both lead on the title count.
  sibling: string[],
): { text: string; sig: GroupSig } {
  const none = { text: '', sig: null }
  if (f.phase !== 'regular' || !f.standings?.length || f.week < 2) return none
  const s = f.standings
  const up = which === 'up'
  const rows = up
    ? s.filter((r) => r.losses === 0 && r.ties === 0 && r.wins === f.week)
    : s.filter((r) => r.wins === 0 && r.ties === 0 && r.losses === f.week)
  const prior = up ? f.prior?.up : f.prior?.down

  // No unbeaten team: the leader, with one thing about where they stand.
  if (!rows.length) {
    if (!up) return none
    const top = s[0]
    const tied = s.filter((r) => r.wins === top.wins && r.losses === top.losses && r.ties === top.ties)
    const rec = recordStr(top.wins, top.losses, top.ties)
    for (const r of tied) claimed.add(`rec:${r.managerId}`)
    if (tied.length > 1) {
      return { text: `${list(tied.map((r) => r.name))} share the best record at ${rec}.`, sig: { record: rec, frames: [], noneWon: false } }
    }
    const open = desk.pick('lead-open', [
      ['0', `${top.name} leads the league at ${rec}.`],
      ['1', `${top.name} has the best record in the league, ${rec}.`],
      ['2', `${top.name} sits alone at the top at ${rec}.`],
    ])
    const frames = groupFrames(f, 'up', [top], rec, undefined, claimed).filter((x) => x.id !== 'count')
    if (!frames.length || f.week < 4) return { text: open, sig: { record: rec, frames: [], noneWon: false } }
    const fr = desk.pick('lead-frame', frames.map((x): Option<Frame> => [x.id, x, x.bias]))
    return { text: `${open} ${fr.sentence}`, sig: { record: rec, frames: [fr.id], noneWon: false } }
  }

  const rec = up ? recordStr(f.week, 0) : recordStr(0, f.week)
  const st = f.starts?.find((x) => x.record === rec)
  const names = rows.map((r) => r.name)
  const single = rows.length === 1 ? rows[0] : null
  const lastOne = !!single && f.week >= 3

  let open: string
  if (single) {
    const n = single.name
    open = up
      ? desk.pick('up-open', [
          ['0', lastOne ? `${n} is ${rec}, the last unbeaten team in the league` : `${n} is ${rec}`],
          ['1', lastOne ? `${n} is the last unbeaten team, at ${rec}` : `${n} is still perfect at ${rec}`],
          ['2', lastOne ? `${n} is the only team left without a loss, at ${rec}` : `${n} is unbeaten at ${rec}`],
        ])
      : desk.pick('down-open', [
          ['0', `${n} is ${rec}`],
          ['1', `${n} is still looking for a first win at ${rec}`],
          ['2', lastOne ? `${n} is the last winless team, at ${rec}` : `${n} is winless at ${rec}`],
        ])
  } else {
    open = `${list(names)} ${names.length === 2 ? 'are both' : 'are all'} ${rec}`
  }
  if (!up) {
    const lead = afterUp
      ? desk.pick('down-turn', [['0', 'At the other end'], ['1', 'Down at the bottom']])
      : desk.pick('down-turn-cold', [['0', 'At the bottom of the table'], ['1', 'At the bottom']])
    open = after(lead, open)
  }

  // Up to two frames, neither of the ones last week used, and a personal
  // start mark ("first 0-4 start since 2023") when there is one. A
  // first-ever start is news enough to take a slot.
  const frames = groupFrames(f, which, rows, rec, st, claimed)
  let mark: { text: string; id: string } | null = null
  for (const r of rows) {
    const t = cardOf(f, r.managerId)
    if (!t?.startMark || !t.record || claimed.has(`start:${t.managerId}`)) continue
    claimed.add(`start:${t.managerId}`)
    // When the opening line is already "Isaac is 4-0", the mark can't open
    // on "Isaac is 4-0" again.
    const v = single ? 1 : desk.pick('start-mark', [['0', 0], ['1', 1]])
    mark = { text: startSentence(t.name, t.record, t.startMark, v), id: t.startMark.kind }
    break
  }
  const family = `${which}-frame`
  const chosen: Frame[] = []
  const pool = [...frames]
  const want = mark ? 1 : 2
  while (chosen.length < want && pool.length) {
    const fr = desk.pick(
      family,
      pool.map((x): Option<Frame> => [x.id, x, (x.bias ?? 0) + (prior?.frames.includes(x.id) ? 2 : 0) + (sibling.includes(x.id) ? 3 : 0)]),
    )
    chosen.push(fr)
    pool.splice(pool.indexOf(fr), 1)
  }

  let text: string
  const [first, second] = chosen
  if (first?.clause) text = `${open}${first.clause}.`
  else if (first) text = `${open}. ${first.sentence}`
  else text = `${open}.`
  if (mark) text += ` ${mark.text}`
  if (second) text += ` ${second.sentence}`

  for (const r of rows) claimed.add(`rec:${r.managerId}`)
  return {
    text,
    sig: {
      record: rec,
      frames: chosen.map((x) => x.id),
      noneWon: chosen.some((x) => x.id === 'title') && st?.champs === 0,
    },
  }
}

// ── The front page ────────────────────────────────────────────────────────

// Paragraph plans for the front page. Each token is a block, "+" puts two
// blocks in one paragraph, and an empty block drops out. The lead always
// comes first (it carries the headline); everything after it moves. Not
// every plan prints a year ago, so that paragraph comes and goes.
const LAYOUTS: string[][] = [
  ['lead', 'news', 'up+down', 'totals', 'ago', 'next'],
  ['lead', 'up+down', 'news', 'totals', 'next'],
  ['lead+news', 'totals', 'up', 'down+ago', 'next'],
  ['lead', 'totals', 'news', 'up+down', 'next'],
  ['lead', 'news+totals', 'up+down', 'ago+next'],
  ['lead', 'up', 'news', 'down', 'next'],
  ['lead+totals', 'news', 'up+down', 'ago', 'next'],
  ['lead', 'news', 'totals+up', 'down', 'next'],
  ['lead', 'up+down', 'totals', 'news', 'ago+next'],
  ['lead', 'news', 'down', 'up+totals', 'next'],
  ['lead', 'news', 'ago+up', 'down+totals', 'next'],
  ['lead', 'totals', 'up+down', 'news', 'next'],
  ['lead+news', 'up+down', 'ago', 'totals+next'],
]

function frontPage(
  f: RecapFacts,
  league: string,
  claimed: Set<string>,
  desk: Desk,
): { front: FrontPage; sig: Omit<RecapEditionSig, 'used'>; leadGame: number | null } {
  const prior = f.prior ?? null
  const lead = chooseLead(reweigh(angles(f, league), prior), desk)
  for (const a of lead) {
    for (const c of a.claims) claimed.add(c)
    if (a.game != null && a.game >= 0) claimed.add(`lead:${a.game}`)
  }
  // Longest first, so "Big Mike" is matched before "Big".
  const names = f.teams.map((t) => t.name).sort((a, b) => b.length - a.length)
  const told = (a: Chosen) => a.tails.reduce((acc, t) => fuse(acc, t, names), a.lede)

  const layout = desk.pick('layout', LAYOUTS.map((l, i): Option<number> => [String(i), i]))
  let up: GroupSig = null
  let down: GroupSig = null
  let agoNames: string[] = []

  const render = (tok: string, prev: string): string => {
    switch (tok) {
      case 'lead':
        return lead[0] ? told(lead[0]) : ''
      case 'news': {
        if (lead.length < 2) return ''
        // Straight after the lead, the second story needs no turn; anywhere
        // else (or folded into the lead's paragraph) it opens on one, and
        // the third story takes the next.
        const turns = desk.pick('turns', [['0', ['Elsewhere', 'And']], ['1', ['Across the league', 'Meanwhile']], ['2', ['Meanwhile', 'Elsewhere']]])
        const items = lead.slice(1).map(told)
        const short = paragraphs.length === 1 && prev === 'lead' && words(items.join(' ')) < 18
        newsFolds = short
        // A lead that is a running total isn't a game, so the first game
        // story after it still needs its turn.
        const k = prev === 'lead' && !short && !lead[0].kind.startsWith('total-') ? 0 : 1
        return items.map((t, i) => (i + k === 0 ? t : after(turns[i + k - 1] ?? 'And', t))).join(' ')
      }
      case 'up': {
        const r = groupStory(f, desk, claimed, 'up', false, (down as GroupSig)?.frames ?? [])
        up = r.sig
        return r.text
      }
      case 'down': {
        const r = groupStory(f, desk, claimed, 'down', prev === 'up', (up as GroupSig)?.frames ?? [])
        down = r.sig
        return r.text
      }
      case 'totals': {
        // The two that rank highest and weren't already the lead.
        const totals = [...liveTotals(f)]
          .filter((r) => !claimed.has(`total:${r.key}`))
          .sort((a, b) => a.rank - b.rank)
          .slice(0, 2)
        for (const r of totals) for (const c of totalClaims(r, f)) claimed.add(c)
        return totals.map((r) => totalSentence(r, f, desk.pick(`total-${r.key}`, [['0', 0], ['1', 1]]))).join(' ')
      }
      case 'ago':
        return yearAgo()
      case 'next':
        return upNext()
      default:
        return ''
    }
  }

  // A year ago tonight, and where those teams are now. Skipped when last
  // week's paper already ran it for the same people: three weeks of "a year
  // ago, Ricci and Isaac..." is the same paragraph three times.
  const yearAgo = (): string => {
    const ya = f.yearAgo
    if (!ya?.leaders.length) return ''
    if (prior?.yearAgo.some((n) => ya.leaders.some((l) => l.name === n))) return ''
    agoNames = ya.leaders.map((l) => l.name)
    const recOf = (n: string) => f.teams.find((t) => t.name === n)?.record ?? null
    const one = ya.leaders.length === 1 ? ya.leaders[0] : null
    if (one && one.finish && recOf(one.name) && !desk.stale('ago', '1')) {
      const v = desk.pick('ago', [['0', 0], ['1', 1]])
      if (v === 1) {
        const ended = one.finish === 'won the title' ? 'the title' : `a ${one.finish.replace(/^finished /, '')}-place finish`
        return `This time last year, ${one.name} was ${ya.record} and on the way to ${ended}. This year ${one.name} is ${recOf(one.name)}.`
      }
    }
    // "Ricci, who went on to finish 3rd, is 0-3 this year".
    const wentOn = (finish: string) => (finish === 'won the title' ? 'went on to win the title' : finish.replace(/^finished/, 'went on to finish'))
    // The first one says "went on to" and "this year"; the rest lean on it.
    const then = ya.leaders.map((l, i) => {
      const rec = recOf(l.name)
      const fin = l.finish ? (i === 0 ? wentOn(l.finish) : l.finish) : null
      if (fin && rec) return `${l.name}, who ${fin}, is ${rec}${i === 0 ? ' this year' : ''}`
      if (fin) return `${l.name} ${fin}`
      return rec ? `${l.name} is ${rec}${i === 0 ? ' this year' : ''}` : null
    }).filter((x): x is string => !!x)
    const joined = then.length > 2 ? `${then.slice(0, -1).join('; ')}; and ${then[then.length - 1]}` : then.join(', and ')
    const names = ya.leaders.map((l) => l.name)
    return `A year ago after week ${f.week}, ${list(names)} ${names.length === 1 ? 'led the league' : 'shared the lead'} at ${ya.record}.${joined ? ` ${joined}.` : ''}`
  }

  // Up next, in a line. The previews carry the detail.
  const upNext = (): string => {
    const next = f.next ? headliner(f.next.games) : null
    if (!next) return ''
    const wk = f.next!.week
    const rec = (s: RecapNextGame['a']) => (s.record ? ` (${s.record})` : '')
    return next.gotw
      ? desk.pick('next', [
          ['0', `Up next: ${next.a.name} and ${next.b.name} in the week ${wk} game of the week.`],
          ['1', `Next week's game of the week is ${next.a.name} against ${next.b.name}.`],
          ['2', `The week ${wk} game of the week: ${next.a.name} and ${next.b.name}.`],
        ])
      : desk.pick('next', [
          ['0', `Up next: ${next.a.name}${rec(next.a)} against ${next.b.name}${rec(next.b)} headlines week ${wk}.`],
          ['1', `The week ${wk} headliner is ${next.a.name}${rec(next.a)} against ${next.b.name}${rec(next.b)}.`],
          ['2', `Next week, ${next.a.name}${rec(next.a)} takes on ${next.b.name}${rec(next.b)}.`],
        ])
  }

  const paragraphs: string[] = []
  // A one-line second story is too thin for a paragraph of its own; it
  // joins the lead's.
  let newsFolds = false
  let prev = ''
  for (const group of LAYOUTS[layout]) {
    const parts: string[] = []
    for (const tok of group.split('+')) {
      newsFolds = false
      const text = render(tok, prev)
      if (!text) continue
      if (tok === 'news' && newsFolds && group === 'news') paragraphs[0] += ' ' + text
      else parts.push(text)
      prev = tok
    }
    if (parts.length) paragraphs.push(parts.join(' '))
  }
  // A one-sentence lead ("No team has ever had more points through four
  // weeks than Charlie's 636.24.") takes the next paragraph in with it.
  if (paragraphs.length > 1 && words(paragraphs[0]) < 18 && words(paragraphs[0]) + words(paragraphs[1]) <= 90) {
    paragraphs.splice(0, 2, `${paragraphs[0]} ${paragraphs[1]}`)
  }

  const headline = lead[0]?.headline ?? `Week ${f.week} in ${league}`
  const deck = lead.length > 1 ? lead.slice(1).map((a) => a.headline).join(', and ') : null
  return {
    front: { headline, deck, paragraphs },
    leadGame: lead[0]?.game ?? null,
    sig: {
      week: f.week,
      head: lead[0]?.kind ?? '',
      leads: lead.map((a) => a.kind),
      layout,
      up,
      down,
      yearAgo: agoNames,
    },
  }
}

// ── Game stories ──────────────────────────────────────────────────────────

function gameHeadline(f: RecapFacts, g: RecapGame, desk: Desk, isLead: boolean): string {
  const w = W(g).name
  const l = L(g).name
  if (g.kind === 'championship' && decided(g)) return `${w} wins the title`
  if (g.leg?.n === 1 || g.winner == null) {
    const [lead, trail] = g.a.score >= g.b.score ? [g.a.name, g.b.name] : [g.b.name, g.a.name]
    return `${lead} takes a ${pts(g.margin)}-point lead over ${trail} into week ${f.week + 1}`
  }
  if (g.winner === 'tie') return `${g.a.name} and ${g.b.name} tie`
  // The game the front page leads with already has its story in the
  // headline up there; this one just says who won.
  const ev = isLead ? null : g.seriesEvent
  if (ev?.kind === 'snap') return desk.pick('gh-snap', [['0', `${w} finally gets past ${l}`], ['1', `${w} gets one back against ${l}`]])
  if (ev?.kind === 'extend') return desk.pick('gh-extend', [['0', `${w} beats ${l} again`], ['1', `Another one for ${w} over ${l}`], ['2', `${w} keeps rolling against ${l}`]])
  if (!isLead && f.upset && f.upset.winner === w) return desk.pick('gh-upset', [['0', `${w} knocks off ${l}`], ['1', `${w} trips up ${l}`]])
  // Bands by margin; one family across the paper, so two close games get
  // two different verbs.
  if (g.margin < 2) return desk.pick('gh', [['survives', `${w} survives ${l}`], ['holds', `${w} holds off ${l}`], ['slips', `${w} slips past ${l}`]])
  if (g.margin < 8) return desk.pick('gh', [['edges', `${w} edges ${l}`], ['gets', `${w} gets past ${l}`], ['outlasts', `${w} outlasts ${l}`]])
  if (g.margin < 20) return desk.pick('gh', [['beats', `${w} beats ${l}`], ['takes', `${w} takes care of ${l}`], ['downs', `${w} downs ${l}`]])
  if (g.margin < 40) return desk.pick('gh', [['handles', `${w} handles ${l}`], ['pulls', `${w} pulls away from ${l}`], ['clear', `${w} beats ${l} going away`]])
  return desk.pick('gh', [['routs', `${w} routs ${l}`], ['runs', `${w} runs past ${l}`], ['buries', `${w} buries ${l}`]])
}

function gameKicker(f: RecapFacts, g: RecapGame): string | null {
  const has = (id: string | undefined) => !!id && (g.a.managerId === id || g.b.managerId === id)
  if (g.kind === 'championship') return 'Championship'
  if (g.kind === 'playoff') return 'Playoffs'
  if (g.kind === 'consolation') return 'Consolation'
  if (f.upset && decided(g) && f.upset.winner === W(g).name) return 'Upset'
  if (f.top && has(f.top.managerId)) return 'Top score'
  if (f.closest && has(f.closest.a.managerId)) return 'Closest game'
  if (f.blowout && has(f.blowout.a.managerId)) return 'Biggest win'
  return null
}

// The order a game story tells its pieces in: R the result, S the series,
// WC and LC what the start means for each side, LB the losing side's player
// and bench, REC the records. The desk deals these out across a paper so
// six stories in a row don't share one shape.
const SHAPES: Record<string, string[]> = {
  a: ['R', 'S', 'WC', 'LB', 'LC', 'REC'],
  b: ['R', 'LB', 'LC', 'S', 'WC', 'REC'],
  c: ['R', 'WC', 'S', 'LB', 'LC', 'REC'],
  d: ['R', 'S', 'LB', 'LC', 'WC', 'REC'],
}

function gameStory(f: RecapFacts, g: RecapGame, i: number, claimed: Set<string>, desk: Desk, isLead: boolean): GameStory {
  const paid = !!f.book
  const story = (body: string[]): GameStory => ({
    anchor: `game-${i + 1}`,
    kicker: gameKicker(f, g),
    headline: gameHeadline(f, g, desk, isLead),
    body: body.join(' '),
    game: g,
  })

  // A first leg has no winner yet: say where it stands.
  if (g.leg?.n === 1 || !decided(g)) {
    const [lead, trail] = g.a.score >= g.b.score ? [g.a, g.b] : [g.b, g.a]
    return story([
      g.winner === 'tie'
        ? `${g.a.name} and ${g.b.name} tied at ${pts(g.a.score)}.`
        : `${lead.name} outscored ${trail.name} ${pts(lead.score)} to ${pts(trail.score)} in the first of two weeks. The total decides it.`,
    ])
  }

  const w = W(g)
  const l = L(g)
  const wCard = cardOf(f, w.managerId)
  const lCard = cardOf(f, l.managerId)
  const named = (s: RecapSide) => {
    const e = epithet(s, f.year)
    return e ? `${e} ${s.name}` : s.name
  }
  const markOf = (s: RecapSide, card: RecapTeamCard | undefined) => {
    if (!card?.mark || claimed.has(`mark:${s.managerId}`)) return null
    const m = card.mark
    const text =
      m.kind === 'career-high'
        ? `a career high for ${s.name} that tops the ${pts(m.old)} from ${m.oldYear}`
        : m.kind === 'career-low'
          ? `a career low for ${s.name}`
          : m.kind === 'best-since'
            ? `${poss(s.name)} best score since ${m.year}`
            : m.kind === 'low-since'
              ? `${poss(s.name)} lowest score since ${m.year}`
              : null
    if (text) claimed.add(`mark:${s.managerId}`)
    return text
  }
  const wMark = markOf(w, wCard)
  const lMark = markOf(l, lCard)
  const wStar = paid && w.star && w.star.points >= 15 ? w.star : null

  // Each side's own story: how the start compares with their past starts,
  // and their running numbers against their own past. Worked out before the
  // result sentence, because a result that leads on the record needs to
  // know whether one of these already says it.
  const clausesFor = (s: RecapSide, card: RecapTeamCard | undefined): Clause[] => {
    const cs: Clause[] = []
    if (card?.startMark && card.record && !claimed.has(`start:${s.managerId}`)) {
      cs.push(startClause(card.record, card.startMark))
      claimed.add(`start:${s.managerId}`)
    }
    for (const m of card?.runs ?? []) {
      // Through two weeks, the start and the last two weeks are one number.
      if (m.kind === 'two-week-best' && f.week === 2) continue
      const key = `run:${m.kind === 'two-week-best' ? 'two' : 'start'}:${s.managerId}`
      if (claimed.has(key)) continue
      claimed.add(key)
      cs.push(runClause(desk, s.name, f.week, m))
    }
    return cs.slice(0, 2)
  }
  const wClauses = clausesFor(w, wCard)
  const lClauses = clausesFor(l, lCard)
  const saysRecord = (cs: Clause[]) => cs.some((c) => c.text.startsWith('is '))
  const wRec = f.phase === 'regular' && wCard?.record && !claimed.has(`rec:${w.managerId}`) && !saysRecord(wClauses) ? wCard.record : null
  const lRec = f.phase === 'regular' && lCard?.record && !claimed.has(`rec:${l.managerId}`) && !saysRecord(lClauses) ? lCard.record : null

  const pieces: Record<string, string> = {}

  // R. The result, with titles on first mention. A personal mark rides on
  // the score it is about ("..., Evan's best score since 2024"); otherwise
  // the player who carried it does.
  const verb = g.margin < 2
    ? desk.pick('verb-close', [['0', 'edged'], ['1', 'slipped past']])
    : g.margin >= 40
      ? desk.pick('verb-rout', [['0', 'routed'], ['1', 'crushed']])
      : g.margin >= 20
        ? desk.pick('verb-big', [['0', 'beat'], ['1', 'handled'], ['2', 'pulled away from']])
        : desk.pick('verb', [['0', 'beat'], ['1', 'got past'], ['2', 'took down']])
  const starTail = (st: NonNullable<typeof wStar>) =>
    desk.pick('star', [
      ['0', `, behind ${pts(st.points)} points from ${st.player}`],
      ['1', `, with ${st.player} leading the way on ${pts(st.points)} points`],
      ['2', `, as ${st.player} put up ${pts(st.points)} points`],
      ['3', `, and ${st.player} had ${pts(st.points)} of them`],
      ['4', `, led by ${poss(st.player)} ${pts(st.points)}`],
    ])
  const starSentence = (st: NonNullable<typeof wStar>) =>
    desk.pick('star-s', [
      ['0', `${st.player} led the way with ${pts(st.points)} points.`],
      ['1', `${st.player} did the heavy lifting with ${pts(st.points)}.`],
      ['2', `${w.name} got ${pts(st.points)} from ${st.player}.`],
      ['3', `${st.player} had a team-high ${pts(st.points)}.`],
    ])
  const opts: Option<string>[] = []
  {
    let s = `${cap(named(w))} ${verb} ${named(l)}, ${score(g)}`
    if (wMark) s += `, ${wMark}.${wStar ? ` ${starSentence(wStar)}` : ''}`
    else s += `${wStar ? starTail(wStar) : ''}.`
    opts.push(['plain', s])
  }
  if (wStar && !wMark) {
    opts.push(['star', `${wStar.player} put up ${pts(wStar.points)} points as ${named(w)} ${verb} ${named(l)}, ${score(g)}.`])
  }
  if (g.margin >= 8 && !lMark) {
    opts.push([
      'loser',
      `${cap(named(l))} fell to ${named(w)}, ${score(g)}${wStar ? `, as ${wStar.player} scored ${pts(wStar.points)} for ${w.name}` : ''}.${
        wMark ? ` The ${pts(w.score)} was ${wMark}.` : ''
      }`,
    ])
  }
  if (wRec && !g.leg && f.week >= 2) {
    opts.push([
      'record',
      // The star gets a sentence of his own here: a tail like "and X had
      // 41.3 of them" needs the score right before it.
      `${cap(named(w))} moved to ${wRec} with a ${winBy(g)} over ${named(l)}${wMark ? `, ${wMark}` : ''}.${wStar ? ` ${starSentence(wStar)}` : ''}`,
    ])
  }
  const resultId = desk.pick('result', opts.map(([id]): Option<string> => [id, id]))
  pieces.R = opts.find(([id]) => id === resultId)![1]
  const recordTold = resultId === 'record'
  if (recordTold) claimed.add(`rec:${w.managerId}`)

  // S. History between the two.
  if (!claimed.has(`game:${i}:series`)) {
    const ev = g.seriesEvent
    const after = g.series ? seriesFrom(g, w.name, g.series) : null
    if (ev?.kind === 'snap') {
      pieces.S = `It ended ${poss(l.name)} ${numberWord(ev.run)}-game run in the series${after && after.w < after.l ? `, though ${l.name} still leads it ${recordStr(after.l, after.w, after.t)}` : ''}.`
    } else if (ev?.kind === 'extend') {
      pieces.S = `${w.name} has won ${numberWord(ev.run)} straight in the series${after ? `, ${seriesTail(w.name, l.name, after)}` : ''}.`
    } else if (ev?.kind === 'even' && after) {
      pieces.S = desk.pick('s-even', [
        ['0', `The win evens their all-time series at ${recordStr(after.w, after.l, after.t)}.`],
        ['1', `That makes the all-time series ${recordStr(after.w, after.l, after.t)}, dead even.`],
      ])
    } else if (ev?.kind === 'lead' && after) {
      pieces.S = desk.pick('s-lead', [
        ['0', `The win puts ${w.name} ahead ${recordStr(after.w, after.l, after.t)} in their all-time series.`],
        ['1', `${w.name} now leads the all-time series ${recordStr(after.w, after.l, after.t)}.`],
      ])
    } else if (ev?.kind === 'first') {
      pieces.S = 'It was the first time the two had met.'
    } else if (g.last && after) {
      const state = cap(seriesState(w.name, l.name, after))
      pieces.S = g.last.winner === w.name
        ? desk.pick('s-last', [
            ['0', `${w.name} also won their last meeting, in ${when(g.last, f.year)}, ${seriesTail(w.name, l.name, after)}.`],
            ['1', `${w.name} has won the last two meetings, ${seriesAfter(w.name, l.name, after)}.`],
            ['2', `${state} all time.`],
          ])
        : desk.pick('s-last-lost', [
            [
              '0',
              `${l.name} had won their last meeting, in ${when(g.last, f.year)}, ${
                after.w > after.l
                  ? `but this one puts ${w.name} ahead ${recordStr(after.w, after.l, after.t)} in the series`
                  : after.w < after.l
                    ? `and still leads the series ${recordStr(after.l, after.w, after.t)}`
                    : `and this one evens the series at ${recordStr(after.w, after.l, after.t)}`
              }.`,
            ],
            ['1', `${w.name} paid back ${poss(l.name)} win from ${when(g.last, f.year)}, ${seriesAfter(w.name, l.name, after)}.`],
          ])
    } else if (after) {
      pieces.S = `${cap(seriesState(w.name, l.name, after))} all time.`
    }
  }

  // WC / LC. Two facts about one person share a sentence.
  if (wClauses.length) pieces.WC = clauseSentence(w.name, wClauses)
  if (lClauses.length) pieces.LC = clauseSentence(l.name, lClauses)

  // LB. The losing side: the player who nearly carried them, what the bench
  // cost (only the total is safe to print: the best bench player isn't
  // always one the best lineup would have started), and their own marks.
  const lStar = paid && l.star && l.star.points >= 25 && (!w.star || l.star.points > w.star.points) ? l.star : null
  const benched = paid && l.left != null && l.left > g.margin && !g.leg ? l.left : null
  const lb: string[] = []
  if (lMark) lb.push(`${l.name} scored ${pts(l.score)} in the loss, ${lMark}.`)
  if (lStar && benched != null) {
    lb.push(desk.pick('lstar-bench', [
      ['0', `${l.name} got ${pts(lStar.points)} from ${lStar.player} but left ${pts(benched)} points on the bench in a game decided by ${pts(g.margin)}.`],
      ['1', `${lStar.player} scored ${pts(lStar.points)} for ${l.name}, but ${pts(benched)} points stayed on the bench in a game decided by ${pts(g.margin)}.`],
    ]))
  } else if (lStar) {
    lb.push(desk.pick('lstar', [
      ['0', `${poss(lStar.player)} ${pts(lStar.points)} for ${l.name} wasn't enough.`],
      ['1', `${l.name} got ${pts(lStar.points)} from ${lStar.player} in the loss.`],
      ['2', `${lStar.player} gave ${l.name} ${pts(lStar.points)}, not enough this time.`],
    ]))
  } else if (benched != null) {
    lb.push(desk.pick('bench', [
      ['0', `${l.name} left ${pts(benched)} points on the bench in a game decided by ${pts(g.margin)}.`],
      ['1', `${l.name} had ${pts(benched)} points sitting on the bench, more than the ${pts(g.margin)}-point margin.`],
      ['2', `The ${pts(benched)} points ${l.name} left on the bench would have covered the ${pts(g.margin)}-point margin.`],
    ]))
  }
  if (lb.length) pieces.LB = lb.join(' ')

  // REC. Where it leaves them, when nothing above already said it.
  const told = Object.keys(pieces).length
  if (told < 5 && f.phase === 'regular') {
    const wr = recordTold ? null : wRec
    const skid = lCard?.streak && lCard.streak.kind === 'L' && lCard.streak.length >= 3 ? `, losers of ${numberWord(lCard.streak.length)} straight` : ''
    if (wr && lRec && wr === lRec) {
      pieces.REC = `${w.name} and ${l.name} are both ${wr} now${skid ? `, and ${l.name} has lost ${numberWord(lCard!.streak!.length)} straight` : ''}.`
    } else if (wr && lRec) {
      pieces.REC = desk.pick('rec-both', [
        ['0', `${w.name} moves to ${wr}, and ${l.name} falls to ${lRec}${skid}.`],
        ['1', `That makes it ${wr} for ${w.name} and ${lRec} for ${l.name}${skid}.`],
        ['2', `${w.name} sits at ${wr}, ${l.name} at ${lRec}${skid}.`],
      ])
    } else if (wr) {
      pieces.REC = desk.pick('rec-w', [['0', `The win moves ${w.name} to ${wr}.`], ['1', `${w.name} is now ${wr}.`]])
    } else if (lRec) {
      pieces.REC = desk.pick('rec-l', [['0', `The loss drops ${l.name} to ${lRec}${skid}.`], ['1', `${l.name} falls to ${lRec}${skid}.`]])
    }
  }

  const shape = desk.pick('shape', Object.keys(SHAPES).map((k): Option<string> => [k, k]))
  return story(SHAPES[shape].map((p) => pieces[p]).filter((x): x is string => !!x))
}

// ── Next week ─────────────────────────────────────────────────────────────

// The game to lead next week with: the preview's game of the week when there
// is one, otherwise the two best teams in the table that meet.
function headliner(games: RecapNextGame[]): RecapNextGame | null {
  const gotw = games.find((g) => g.gotw)
  if (gotw) return gotw
  const ranked = games.filter((g) => g.a.place != null && g.b.place != null)
  if (!ranked.length) return games[0] ?? null
  return [...ranked].sort((x, y) => x.a.place! + x.b.place! - (y.a.place! + y.b.place!))[0]
}

// One line of history for a game next week: who leads the series, and who
// has had the better of it lately, when that says something.
function previewNote(f: RecapFacts, g: RecapNextGame): string | null {
  if (g.last?.kind === 'championship' && g.last.year === f.year - 1) {
    return `A rematch of last season's final, which ${g.last.winner} won.`
  }
  if (!g.series) return 'First meeting.'
  const r = seriesFrom(g, g.a.name, g.series)
  const leader = r.w > r.l ? g.a.name : r.w < r.l ? g.b.name : null
  const state = cap(seriesState(g.a.name, g.b.name, r))
  let form = ''
  if (g.run && g.run.n >= 3) form = `${g.run.name === leader ? 'and has' : `${g.run.name} has`} won the last ${numberWord(g.run.n)}`
  else if (g.recent && g.series.w + g.series.l + g.series.t >= 6) form = `${g.recent.name === leader ? 'and has' : `${g.recent.name} has`} won ${numberWord(g.recent.w)} of the last ${numberWord(g.recent.of)}`
  if (!form) return `${state}.`
  return form.startsWith('and') ? `${state} ${form}.` : `${state}, but ${form}.`
}

// ── The edition ───────────────────────────────────────────────────────────

export function leagueLabel(f: RecapFacts): string {
  return f.league.name.length > 24 && f.league.abbr ? f.league.abbr : f.league.name
}

export function writeEdition(f: RecapFacts): Edition {
  const league = leagueLabel(f)
  const claimed = new Set<string>()
  const desk = new Desk(`${f.league.id}:${f.year}:${f.week}`, new Set(f.prior?.used ?? []))
  const { front, sig, leadGame } = frontPage(f, league, claimed, desk)
  const stories = f.games.map((g, i) => gameStory(f, g, i, claimed, desk, i === leadGame))
  const lead = f.next ? headliner(f.next.games) : null
  const previews = (f.next?.games ?? [])
    .map((g) => ({ game: g, note: previewNote(f, g) }))
    .sort((x, y) => Number(y.game === lead) - Number(x.game === lead))
  return { front, stories, previews, sig: { ...sig, used: [...new Set(desk.used)] } }
}

// What this paper said, in outline, for next week's to steer around.
export function editionSig(f: RecapFacts): RecapEditionSig {
  return writeEdition(f).sig
}
