// The recap as a newspaper: a headline, a lead story, a short written story
// for every game, and next week's previews. The page and the email both
// print from here.
//
// Every sentence is a template filled from facts.ts, so nothing in it can be
// wrong in a way the numbers aren't. (A model wrote the intro for a while and
// kept fusing facts: "Connie snapping CAT's run" when Connie had extended her
// own.) Variety comes from picking between phrasings with a seed made of the
// league, year and week, so the same week always reads the same way and two
// weeks don't read alike.
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
  type RecapFacts,
  type RecapGame,
  type RecapMark,
  type RecapMeeting,
  type RecapNextGame,
  type RecapSeries,
  type RecapSide,
  type RecapStart,
  type RecapStartMark,
  type RecapTeamCard,
  type RecapTotalRow,
  type RecapRunMark,
} from './facts'

export type FrontPage = { headline: string; deck: string | null; paragraphs: string[] }
export type GameStory = { anchor: string; kicker: string | null; headline: string; body: string; game: RecapGame }
export type Preview = { game: RecapNextGame; note: string | null }
export type Edition = { front: FrontPage; stories: GameStory[]; previews: Preview[] }

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
const PLAIN_START = /^(the|though|and|defending|[a-z]+-time|it|that|both)\b/
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

// A small stable hash, so the same recap always picks the same phrasing.
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick<T>(seed: string, options: T[]): T {
  return options[hash(seed) % options.length]
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
// phrasing, so two of them in one story don't read the same.
function startSentence(name: string, rec: string, m: RecapStartMark, v = 0): string {
  if (m.kind === 'first-ever') return `${name} is ${rec} for the first time in ${numberWord(m.seasons)} seasons in the league.`
  if (m.kind === 'first-since') {
    return v % 2 === 0 ? `It is ${poss(name)} first ${rec} start since ${m.year}.` : `${name} hasn't started ${rec} since ${m.year}.`
  }
  return `${name} has started ${rec} for the ${ordinalWord(m.years)} straight season.`
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

function runClause(week: number, m: RecapRunMark): Clause {
  const w = numberWord(week)
  const v = pts(m.value)
  switch (m.kind) {
    case 'start-best':
      return m.since == null
        ? { text: `is off to a career-best start, ${v} points through ${w} weeks`, good: true }
        : { text: `hasn't started this well since ${m.since}, with ${v} points through ${w} weeks`, good: true }
    case 'start-worst':
      return m.since == null
        ? { text: `is off to a career-worst start, ${v} points through ${w} weeks`, good: false }
        : { text: `hasn't scored this little through ${w} weeks since ${m.since} (${v} points)`, good: false }
    case 'two-week-best':
      return m.since == null
        ? { text: `has a career-best ${v} points over the last two weeks`, good: true }
        : { text: `hasn't had a better two-week stretch since ${m.since} (${v} points)`, good: true }
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

// How earlier teams with this start finished, as a clause that follows
// "Isaac and Sean are both 3-0".
function startHistory(s: RecapStart, unbeaten: boolean): string {
  if (s.champs === 0) {
    return unbeaten
      ? `, though history isn't kind to ${s.record} starts: none of the ${s.teams} teams to start ${s.record} in league history went on to win the title`
      : `, and no ${s.record} team has ever come back to win the title (${s.teams} have tried)`
  }
  const last = s.lastChamp ? `, most recently ${s.lastChamp.name} in ${s.lastChamp.year}` : ''
  return unbeaten
    ? `, and ${numberWord(s.champs)} of the ${s.teams} teams to start ${s.record} in league history went on to win the title${last}`
    : `, though ${numberWord(s.champs)} of the ${s.teams} teams to start ${s.record} in league history still won the title${last}`
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

// The same thing as a sentence for the lead story.
function totalSentence(row: RecapTotalRow, f: RecapFacts): string {
  const w = numberWord(f.week)
  const v = totalValue(row)
  const rankText = row.rank === 1
    ? 'the most in league history'
    : row.rank <= 10
      ? `the ${ordinal(row.rank)}-most in league history`
      : `the most since ${row.since!.who === 'The league' ? row.since!.year : `${row.since!.who} in ${row.since!.year}`}`
  const fewest = rankText.replace('most', 'fewest')
  const lowest = rankText.replace('most', 'lowest')
  const highest = rankText.replace('most', 'highest')
  switch (row.key) {
    case 'pf':
      return `${row.who} has ${v} points through ${w} weeks, ${rankText} at this point of a season${
        row.chaser ? `, just ahead of ${poss(row.chaser.who)} ${pts(row.chaser.value)}` : ''
      }.`
    case 'pfLow':
      return `${row.who} has ${v} points through ${w} weeks, ${fewest} at this point of a season.`
    case 'pa':
      return `${row.who} has had ${v} points scored against them through ${w} weeks, ${rankText} at this point of a season.`
    case 'twoWeek':
      return `${poss(row.who)} ${v} over the last two weeks is ${rankText} for back-to-back weeks.`
    case 'leagueHigh':
      return `The league averaged ${v} points a team this week, ${highest} for a week.`
    case 'leagueLow':
      return `The league averaged ${v} points a team this week, ${lowest} for a week.`
    case 'streak':
      return `${row.who} has won ${row.value} straight, ${rankText.replace('most', 'longest')} for a streak inside a season.`
  }
}

// ── The lead story ────────────────────────────────────────────────────────

type Angle = {
  weight: number
  headline: string
  // One or two sentences that open a paragraph.
  lede: string
  // The same fact as a sentence that can follow another angle's lede about
  // the same game, without restating the score.
  tail: string | null
  // The game this angle is about, when it is about one.
  game: number | null
  // Facts this angle tells, so nothing else repeats them.
  claims: string[]
}

function angles(f: RecapFacts, league: string): Angle[] {
  const out: Angle[] = []
  const book = new Map((f.book ?? []).map((r) => [r.key, r]))
  const result = (t: RecapTeamCard) =>
    t.result === 'W' ? `in a win over ${t.opponent}` : t.result === 'L' ? `and still lost to ${t.opponent}` : `against ${t.opponent}`

  const final = f.games.findIndex((g) => g.kind === 'championship' && decided(g))
  if (final >= 0) {
    const g = f.games[final]
    const n = W(g).titles.length + 1
    out.push({
      weight: 100,
      headline: `${W(g).name} wins the ${f.year} title`,
      lede: `${W(g).name} beat ${L(g).name} ${score(g)} in the final and is the ${f.year} champion of ${league}, ${
        n === 1 ? `the first title of ${poss(W(g).name)} career.` : `a ${ordinalWord(n)} title to go with ${list(W(g).titles.map(String))}.`
      }`,
      tail: null,
      game: final,
      claims: [],
    })
  }

  const top = book.get('top')
  if (top && top.rank <= 5) {
    const r = top.record
    out.push({
      weight: top.rank === 1 ? 90 : 85 - top.rank,
      headline: top.rank === 1 ? `${top.who} sets the league scoring record` : `${top.who} posts the ${ordinal(top.rank)}-best score in league history`,
      lede:
        top.rank === 1
          ? `${top.who} scored ${pts(top.value)}, the most any team has put up in ${numberWord(f.history.seasons)} seasons of ${league}${
              r ? `, breaking the record of ${pts(r.value)} that ${r.who} set in ${r.year}` : ''
            }.`
          : `${top.who} scored ${pts(top.value)}, the ${ordinal(top.rank)}-highest score in ${numberWord(f.history.seasons)} seasons of ${league}${
              r ? `, though the record is still the ${pts(r.value)} ${r.who} put up in ${r.year}` : ''
            }.`,
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
      weight: 82,
      headline: `${low.who} sets the league's low-score record`,
      lede: `${poss(low.who)} ${pts(low.value)} is the lowest score in ${league} history${
        low.record ? `, under the ${pts(low.record.value)} ${low.record.who} scored in ${low.record.year}` : ''
      }.`,
      tail: `${poss(low.who)} ${pts(low.value)} is the lowest score in league history.`,
      game: gameIndexOf(f, low.managerId),
      claims: ['book:low', `mark:${low.managerId}`],
    })
  }

  f.games.forEach((g, i) => {
    const ev = g.seriesEvent
    if (!ev || !decided(g)) return
    const r = g.series ? seriesFrom(g, W(g).name, g.series) : null
    if (ev.kind === 'snap') {
      // After a snapped run the loser usually still leads the series: "still".
      const state = !r
        ? ''
        : r.w > r.l
          ? ` ${W(g).name} now leads the series ${recordStr(r.w, r.l, r.t)}.`
          : r.w < r.l
            ? ` ${L(g).name} still leads the series ${recordStr(r.l, r.w, r.t)}.`
            : ` The series is now even at ${recordStr(r.w, r.l, r.t)}.`
      out.push({
        weight: 70 + ev.run,
        // "ends Mason's five-game run" read as five straight wins overall;
        // the skid is Joey's, and it was against Mason.
        headline: `${W(g).name} snaps ${numberWord(ev.run)}-game skid against ${L(g).name}`,
        lede: `${W(g).name} had lost ${numberWord(ev.run)} straight to ${L(g).name} until this week, when a ${winBy(g)} finally ended the skid.${state}`,
        tail: `It also ended ${poss(L(g).name)} ${numberWord(ev.run)}-game run in the series.`,
        game: i,
        claims: [`game:${i}:series`],
      })
    } else if (ev.kind === 'extend') {
      const tail = r ? `, ${seriesAfter(W(g).name, L(g).name, r)}` : ''
      const ledeTail = r ? `, ${seriesTail(W(g).name, L(g).name, r)}` : ''
      out.push({
        weight: 45 + ev.run,
        headline: `${W(g).name} makes it ${numberWord(ev.run)} straight over ${L(g).name}`,
        lede: `${W(g).name} beat ${L(g).name} for the ${ordinalWord(ev.run)} straight time, ${score(g)}${ledeTail.replace(', and leads', ', and now leads')}.`,
        tail: `It was ${poss(W(g).name)} ${ordinalWord(ev.run)} straight win over ${L(g).name}${tail}.`,
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
        weight: 75,
        headline: `${t.name} sets a career high`,
        lede: `${t.name} scored ${pts(t.score)} ${result(t)}, a career high that tops the ${pts(m.old)} from ${m.oldYear}.`,
        tail: markSentence(t.name, t.score, m),
        game: gi,
        claims: [`mark:${t.managerId}`],
      })
    } else if (m.kind === 'career-low') {
      out.push({
        weight: 58,
        headline: `${t.name} hits a career low`,
        lede: `${t.name} scored ${pts(t.score)} ${result(t)}, the fewest in ${poss(t.name)} career.`,
        tail: markSentence(t.name, t.score, m),
        game: gi,
        claims: [`mark:${t.managerId}`],
      })
    } else if (m.kind === 'best-since' && f.year - m.year >= 3) {
      out.push({
        weight: 40 + (f.year - m.year) * 3,
        headline: `${poss(t.name)} best week since ${m.year}`,
        lede: `${t.name} scored ${pts(t.score)} ${result(t)}, ${poss(t.name)} best score since ${m.year}.`,
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
      weight: 64 - heartbreak.rank,
      headline: `${heartbreak.who} scores ${pts(heartbreak.value)} and loses`,
      lede: `${heartbreak.who} scored ${pts(heartbreak.value)} and still lost to ${heartbreak.vs}. ${more}`,
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
      weight: (key === 'closest' ? 58 : 60) - row.rank,
      headline: `${row.who} beats ${row.vs} by ${pts(row.value)}`,
      lede: `${row.who} beat ${row.vs} by ${pts(row.value)}, ${nth} in league history.`,
      tail: `The ${pts(row.value)}-point margin is ${nth} in league history.`,
      game: gameIndexOf(f, row.managerId),
      claims: [`book:${key}`],
    })
  }

  if (f.upset) {
    const u = f.upset
    const firstLoss = /^\d+-0$/.test(u.loserRecord)
    const gi = f.games.findIndex((g) => decided(g) && W(g).name === u.winner && L(g).name === u.loser)
    out.push({
      weight: firstLoss ? 52 : 46,
      headline: firstLoss ? `${u.winner} hands ${u.loser} their first loss` : `${u.winner} upsets ${u.loser}`,
      lede: firstLoss
        ? `${u.winner} came in at ${u.winnerRecord} and handed ${u.loser} their first loss, ${pts(u.winnerScore)} to ${pts(u.loserScore)}.`
        : `${u.winner} came in at ${u.winnerRecord} and beat ${u.loser}, who came in at ${u.loserRecord}, ${pts(u.winnerScore)} to ${pts(u.loserScore)}.`,
      tail: firstLoss ? `It was ${poss(u.loser)} first loss of the season.` : `${u.winner} came in at ${u.winnerRecord}, ${u.loser} at ${u.loserRecord}.`,
      game: gi >= 0 ? gi : null,
      claims: ['upset'],
    })
  }

  if (f.weekRecord?.isNew) {
    out.push({
      weight: 52,
      headline: `${f.weekRecord.who} sets the week ${f.week} record`,
      lede: `${poss(f.weekRecord.who)} ${pts(f.weekRecord.value)} is the best week ${f.week} score in league history.`,
      tail: `It is also the best week ${f.week} score in league history.`,
      game: f.top ? gameIndexOf(f, f.top.managerId) : null,
      claims: ['weekRecord'],
    })
  }

  for (const t of f.teams) {
    const m = t.startMark
    if (!m || !t.record || m.kind !== 'first-ever') continue
    out.push({
      weight: /-0$/.test(t.record) ? 44 : 42,
      headline: `${t.name} is ${t.record} for the first time`,
      lede: startSentence(t.name, t.record, m),
      tail: startSentence(t.name, t.record, m),
      game: gameIndexOf(f, t.managerId),
      claims: [`start:${t.managerId}`],
    })
  }

  if (f.top) {
    out.push({
      weight: 20,
      headline: `${f.top.name} leads week ${f.week} with ${pts(f.top.score)}`,
      lede: `${f.top.name} had the best score of the week, ${pts(f.top.score)}, ${
        f.top.won ? `in a win over ${f.top.opponent}` : `and still lost to ${f.top.opponent}`
      }.`,
      tail: null,
      game: gameIndexOf(f, f.top.managerId),
      claims: ['top'],
    })
  }
  return out.sort((a, b) => b.weight - a.weight)
}

// The lead: up to three angles about different games. An angle about a game
// that is already in the lead is folded into it as a tail sentence, so one
// game is never told twice.
function chooseLead(all: Angle[]): (Angle & { tails: string[] })[] {
  const chosen: (Angle & { tails: string[] })[] = []
  const claimed = new Set<string>()
  for (const a of all) {
    if (a.claims.some((c) => claimed.has(c))) continue
    const same = a.game != null && a.game >= 0 ? chosen.find((c) => c.game === a.game) : undefined
    if (same) {
      if (a.tail && same.tails.length < 1 && a.weight >= 30) {
        same.tails.push(a.tail)
        same.claims.push(...a.claims)
        for (const c of a.claims) claimed.add(c)
      }
      continue
    }
    if (chosen.length >= 3 || (chosen.length && a.weight < 30)) continue
    chosen.push({ ...a, claims: [...a.claims], tails: [] })
    for (const c of a.claims) claimed.add(c)
  }
  return chosen
}

function frontPage(f: RecapFacts, league: string, claimed: Set<string>): FrontPage {
  const lead = chooseLead(angles(f, league))
  for (const a of lead) {
    for (const c of a.claims) claimed.add(c)
    if (a.game != null && a.game >= 0) claimed.add(`lead:${a.game}`)
  }
  // Longest first, so "Big Mike" is matched before "Big".
  const names = f.teams.map((t) => t.name).sort((a, b) => b.length - a.length)
  const told = (a: (typeof lead)[number]) => a.tails.reduce((acc, t) => fuse(acc, t, names), a.lede)

  const seed = `${f.league.id}:${f.year}:${f.week}:front`
  const paragraphs: string[] = []
  if (lead[0]) paragraphs.push(told(lead[0]))
  if (lead.length > 1) {
    const turns = pick(seed, [['Elsewhere', 'And'], ['Across the league', 'Meanwhile'], ['Meanwhile', 'Elsewhere']])
    const rest = lead.slice(1).map((a, i) => (i === 0 ? told(a) : after(turns[i - 1] ?? 'And', told(a)))).join(' ')
    // A one-line second story is too thin for a paragraph of its own.
    if (words(rest) < 18) paragraphs[0] += ' ' + after(turns[0], rest)
    else paragraphs.push(rest)
  }

  // The table, told as the season's story so far.
  if (f.phase === 'regular' && f.standings?.length && f.week >= 2) {
    const s = f.standings
    const bits: string[] = []
    const unbeaten = s.filter((r) => r.losses === 0 && r.ties === 0 && r.wins === f.week)
    const winless = s.filter((r) => r.wins === 0 && r.ties === 0 && r.losses === f.week)
    const startOf = (rec: string) => f.starts?.find((x) => x.record === rec)
    let variant = 0
    const markFor = (names: string[]) => {
      for (const n of names) {
        const t = f.teams.find((x) => x.name === n)
        if (!t?.startMark || !t.record || claimed.has(`start:${t.managerId}`)) continue
        claimed.add(`start:${t.managerId}`)
        return ' ' + startSentence(t.name, t.record, t.startMark, variant++)
      }
      return ''
    }
    if (unbeaten.length) {
      const names = unbeaten.map((r) => r.name)
      const rec = recordStr(f.week, 0)
      const lastOne = unbeaten.length === 1 && f.week >= 3
      const st = startOf(rec)
      bits.push(
        `${list(names)} ${names.length === 1 ? 'is' : names.length === 2 ? 'are both' : 'are'} ${rec}${lastOne ? ', the last unbeaten team in the league' : ''}${
          st ? startHistory(st, true) : ''
        }.${markFor(names)}`,
      )
      for (const r of unbeaten) claimed.add(`rec:${r.managerId}`)
    } else {
      const top = s[0]
      const tied = s.filter((r) => r.wins === top.wins && r.losses === top.losses && r.ties === top.ties)
      bits.push(
        tied.length === 1
          ? `${top.name} leads the league at ${recordStr(top.wins, top.losses, top.ties)}.`
          : `${list(tied.map((r) => r.name))} share the best record at ${recordStr(top.wins, top.losses, top.ties)}.`,
      )
      for (const r of tied) claimed.add(`rec:${r.managerId}`)
    }
    if (winless.length) {
      const names = winless.map((r) => r.name)
      const rec = recordStr(0, f.week)
      const st = startOf(rec)
      bits.push(`At the other end, ${list(names)} ${names.length === 1 ? 'is' : 'are'} ${rec}${st ? startHistory(st, false) : ''}.${markFor(names)}`)
      for (const r of winless) claimed.add(`rec:${r.managerId}`)
    }
    paragraphs.push(bits.join(' '))
  }

  // The season so far, in running totals: the two that rank highest.
  const totals = [...(f.totals ?? [])]
    .filter((r) => !claimed.has(`total:${r.key}`))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 2)
  if (totals.length) {
    for (const r of totals) {
      claimed.add(`total:${r.key}`)
      // "Most points ever through three weeks" already says it is that
      // manager's best start too.
      const t = f.teams.find((x) => x.name === r.who)
      if (t && (r.key === 'pf' || r.key === 'pfLow')) claimed.add(`run:start:${t.managerId}`)
      const chaser = r.chaser ? f.teams.find((x) => x.name === r.chaser!.who) : null
      if (chaser && r.key === 'pf') claimed.add(`run:start:${chaser.managerId}`)
      if (t && r.key === 'twoWeek') claimed.add(`run:two:${t.managerId}`)
    }
    paragraphs.push(totals.map((r) => totalSentence(r, f)).join(' '))
  }

  // A year ago tonight, and where those teams are now.
  if (f.yearAgo?.leaders.length) {
    const ya = f.yearAgo
    const names = ya.leaders.map((l) => l.name)
    // "Ricci, who went on to finish 3rd, is 0-3 this year".
    const wentOn = (finish: string) => (finish === 'won the title' ? 'went on to win the title' : finish.replace(/^finished/, 'went on to finish'))
    // The first one says "went on to" and "this year"; the rest lean on it.
    const then = ya.leaders.map((l, i) => {
      const rec = f.teams.find((t) => t.name === l.name)?.record
      const fin = l.finish ? (i === 0 ? wentOn(l.finish) : l.finish) : null
      if (fin && rec) return `${l.name}, who ${fin}, is ${rec}${i === 0 ? ' this year' : ''}`
      if (fin) return `${l.name} ${fin}`
      return rec ? `${l.name} is ${rec}${i === 0 ? ' this year' : ''}` : null
    }).filter((x): x is string => !!x)
    const joined = then.length > 2 ? `${then.slice(0, -1).join('; ')}; and ${then[then.length - 1]}` : then.join(', and ')
    paragraphs.push(
      `A year ago after week ${f.week}, ${list(names)} ${names.length === 1 ? 'led the league' : 'shared the lead'} at ${ya.record}.${
        joined ? ` ${joined}.` : ''
      }`,
    )
  }

  // Up next, in a line. The previews carry the detail.
  const next = f.next ? headliner(f.next.games) : null
  if (next) {
    const rec = (s: RecapNextGame['a']) => (s.record ? ` (${s.record})` : '')
    paragraphs.push(
      next.gotw
        ? `Up next: ${next.a.name} and ${next.b.name} in the week ${f.next!.week} game of the week.`
        : `Up next: ${next.a.name}${rec(next.a)} against ${next.b.name}${rec(next.b)} headlines week ${f.next!.week}.`,
    )
  }

  const headline = lead[0]?.headline ?? `Week ${f.week} in ${league}`
  const deck = lead.length > 1 ? lead.slice(1).map((a) => a.headline).join(', and ') : null
  return { headline, deck, paragraphs }
}

// ── Game stories ──────────────────────────────────────────────────────────

function gameHeadline(f: RecapFacts, g: RecapGame, i: number, avoid: string): string {
  const seed = `${f.league.id}:${f.year}:${f.week}:${i}`
  const w = W(g).name
  const l = L(g).name
  if (g.kind === 'championship' && decided(g)) return `${w} wins the title`
  if (g.leg?.n === 1 || g.winner == null) {
    const [lead, trail] = g.a.score >= g.b.score ? [g.a.name, g.b.name] : [g.b.name, g.a.name]
    return `${lead} takes a ${pts(g.margin)}-point lead over ${trail} into week ${f.week + 1}`
  }
  if (g.winner === 'tie') return `${g.a.name} and ${g.b.name} tie`
  const options: string[] = []
  const ev = g.seriesEvent
  if (ev?.kind === 'snap') options.push(`${w} finally gets past ${l}`)
  else if (ev?.kind === 'extend') options.push(`${w} beats ${l} again`, `Another one for ${w} over ${l}`, `${w} keeps rolling against ${l}`)
  else if (f.upset && f.upset.winner === w) options.push(`${w} knocks off ${l}`)
  else if (g.margin < 2) options.push(`${w} survives ${l}`, `${w} holds off ${l}`)
  else if (g.margin < 8) options.push(`${w} edges ${l}`, `${w} gets past ${l}`)
  else if (g.margin < 20) options.push(`${w} beats ${l}`, `${w} takes care of ${l}`)
  else if (g.margin < 40) options.push(`${w} handles ${l}`, `${w} pulls away from ${l}`)
  else options.push(`${w} routs ${l}`, `${w} runs past ${l}`)
  const h = pick(seed, options)
  return h === avoid ? `${w} over ${l}, ${score(g)}` : h
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

function gameStory(f: RecapFacts, g: RecapGame, i: number, claimed: Set<string>, frontHeadline: string): GameStory {
  const seed = `${f.league.id}:${f.year}:${f.week}:${i}`
  const paid = !!f.book
  const out: string[] = []
  const story = (): GameStory => ({
    anchor: `game-${i + 1}`,
    kicker: gameKicker(f, g),
    headline: gameHeadline(f, g, i, frontHeadline),
    body: out.join(' '),
    game: g,
  })

  // A first leg has no winner yet: say where it stands.
  if (g.leg?.n === 1 || !decided(g)) {
    const [lead, trail] = g.a.score >= g.b.score ? [g.a, g.b] : [g.b, g.a]
    out.push(
      g.winner === 'tie'
        ? `${g.a.name} and ${g.b.name} tied at ${pts(g.a.score)}.`
        : `${lead.name} outscored ${trail.name} ${pts(lead.score)} to ${pts(trail.score)} in the first of two weeks. The total decides it.`,
    )
    return story()
  }

  const w = W(g)
  const l = L(g)
  const wCard = cardOf(f, w.managerId)
  const lCard = cardOf(f, l.managerId)

  // 1. The result, with titles on first mention. A personal mark rides on
  // the score it is about ("..., Evan's best score since 2024"); otherwise
  // the player who carried it does.
  const named = (s: RecapSide) => {
    const e = epithet(s, f.year)
    return e ? `${e} ${s.name}` : s.name
  }
  const verb = g.margin < 2 ? 'edged' : g.margin >= 40 ? 'routed' : 'beat'
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
  let first = `${cap(named(w))} ${verb} ${named(l)}, ${score(g)}`
  if (wMark) {
    first += `, ${wMark}.`
    if (wStar) {
      first +=
        ' ' +
        pick(`${seed}:star`, [
          `${wStar.player} led the way with ${pts(wStar.points)} points.`,
          `${wStar.player} did the heavy lifting with ${pts(wStar.points)}.`,
          `${w.name} got ${pts(wStar.points)} from ${wStar.player}.`,
        ])
    }
  } else if (wStar) {
    first += pick(`${seed}:star`, [
      `, behind ${pts(wStar.points)} points from ${wStar.player}.`,
      `, with ${wStar.player} leading the way on ${pts(wStar.points)} points.`,
      `, as ${wStar.player} put up ${pts(wStar.points)} points.`,
    ])
  } else first += '.'
  out.push(first)

  // 2. History between the two.
  if (!claimed.has(`game:${i}:series`)) {
    const ev = g.seriesEvent
    const after = g.series ? seriesFrom(g, w.name, g.series) : null
    if (ev?.kind === 'snap') out.push(`It ended ${poss(l.name)} ${numberWord(ev.run)}-game run in the series${after && after.w < after.l ? `, though ${l.name} still leads it ${recordStr(after.l, after.w, after.t)}` : ''}.`)
    else if (ev?.kind === 'extend') out.push(`${w.name} has won ${numberWord(ev.run)} straight in the series${after ? `, ${seriesTail(w.name, l.name, after)}` : ''}.`)
    else if (ev?.kind === 'even' && after) out.push(`The win evens their all-time series at ${recordStr(after.w, after.l, after.t)}.`)
    else if (ev?.kind === 'lead' && after) out.push(`The win puts ${w.name} ahead ${recordStr(after.w, after.l, after.t)} in their all-time series.`)
    else if (ev?.kind === 'first') out.push('It was the first time the two had met.')
    else if (g.last && after) {
      out.push(
        g.last.winner === w.name
          ? `${w.name} also won their last meeting, in ${when(g.last, f.year)}, ${seriesTail(w.name, l.name, after)}.`
          : `${l.name} had won their last meeting, in ${when(g.last, f.year)}, ${
              after.w > after.l
                ? `but this one puts ${w.name} ahead ${recordStr(after.w, after.l, after.t)} in the series`
                : after.w < after.l
                  ? `and still leads the series ${recordStr(after.l, after.w, after.t)}`
                  : `and this one evens the series at ${recordStr(after.w, after.l, after.t)}`
            }.`,
      )
    } else if (after) out.push(`${cap(seriesState(w.name, l.name, after))} all time.`)
  }

  // 3. Each side's own story: how the start compares with their past
  // starts, and their running numbers against their own past. Two facts
  // about one person share a sentence.
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
      cs.push(runClause(f.week, m))
    }
    return cs.slice(0, 2)
  }
  const wClauses = clausesFor(w, wCard)
  if (wClauses.length) out.push(clauseSentence(w.name, wClauses))

  // 4. The losing side: the player who nearly carried them, what the bench
  // cost (only the total is safe to print: the best bench player isn't
  // always one the best lineup would have started), and their own marks.
  const lStar = paid && l.star && l.star.points >= 25 && (!w.star || l.star.points > w.star.points) ? l.star : null
  const benched = paid && l.left != null && l.left > g.margin && !g.leg ? l.left : null
  if (lMark) out.push(`${l.name} scored ${pts(l.score)} in the loss, ${lMark}.`)
  if (lStar && benched != null) {
    out.push(`${l.name} got ${pts(lStar.points)} from ${lStar.player} but left ${pts(benched)} points on the bench in a game decided by ${pts(g.margin)}.`)
  } else if (lStar) {
    out.push(`${poss(lStar.player)} ${pts(lStar.points)} for ${l.name} wasn't enough.`)
  } else if (benched != null) {
    out.push(`${l.name} left ${pts(benched)} points on the bench in a game decided by ${pts(g.margin)}.`)
  }
  const lClauses = clausesFor(l, lCard)
  if (lClauses.length) out.push(clauseSentence(l.name, lClauses))

  // 5. Where it leaves them, when nothing above already said it.
  if (out.length < 5 && f.phase === 'regular') {
    const wRec = wCard?.record && !claimed.has(`rec:${w.managerId}`) && !wClauses.some((c) => c.text.startsWith('is ')) ? wCard.record : null
    const lRec = lCard?.record && !claimed.has(`rec:${l.managerId}`) && !lClauses.some((c) => c.text.startsWith('is ')) ? lCard.record : null
    const skid = lCard?.streak && lCard.streak.kind === 'L' && lCard.streak.length >= 3 ? `, losers of ${numberWord(lCard.streak.length)} straight` : ''
    if (wRec && lRec) out.push(`${w.name} moves to ${wRec}, and ${l.name} falls to ${lRec}${skid}.`)
    else if (wRec) out.push(`The win moves ${w.name} to ${wRec}.`)
    else if (lRec) out.push(`The loss drops ${l.name} to ${lRec}${skid}.`)
  }

  return story()
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
  const front = frontPage(f, league, claimed)
  const stories = f.games.map((g, i) => gameStory(f, g, i, claimed, front.headline))
  const lead = f.next ? headliner(f.next.games) : null
  const previews = (f.next?.games ?? [])
    .map((g) => ({ game: g, note: previewNote(f, g) }))
    .sort((x, y) => Number(y.game === lead) - Number(x.game === lead))
  return { front, stories, previews }
}
