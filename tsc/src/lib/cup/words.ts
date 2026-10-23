// The Cup's lines for the recap, shared by the email block and the recap
// page so the two say the same thing. Pure: everything comes in on the
// teaser.

import type { CupTeaser, CupTeaserGame, CupTeaserSide } from './teaser'

function pts(n: number): string {
  return n.toFixed(2)
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']

function list(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// The launch teaser's one line (a league with no Cup yet): what it is and
// when the draw is. The detail lives on the preview page.
export function cupLaunchLine(t: CupTeaser): string {
  const p = t.preview
  if (!p) return ''
  if (p.final) return `The draw is ${p.drawDay}, seeded on the Cup Rating after this week. Round one is week ${t.startWeek}.`
  return `A knockout bracket inside your season, starting week ${t.startWeek}. Your score each week is your Cup score. The draw is ${p.drawDay}.`
}

// One or two sentences under the Cup's name: what happened this week, in
// plain words.
export function cupDeck(t: CupTeaser): string {
  if (t.preview) {
    const p = t.preview
    if (p.final) return `The draw is ${p.drawDay}, and the seeds are set: the Cup Rating after week ${p.throughWeek}. Round one is next week.`
    return `${t.name} starts in week ${t.startWeek}: the top ${Math.min(t.field, 12)} after week ${t.startWeek - 1}, one round a week, the final in week ${t.finalWeek}. Your score each week is your Cup score. Here is how the draw sets up today.`
  }
  if (t.champion) {
    const c = t.champion
    return `${c.name} won ${t.name} as the ${ordinal(c.seed)} seed, beating ${c.over} ${pts(c.score)} to ${pts(c.theirs)} in the final.`
  }
  if (t.results) {
    const winners = t.results.games.map((g) => (g.winner === 'a' ? g.a : g.b).name)
    const upsets = t.results.games.filter((g) => g.upset)
    const into = t.next ? ` to the ${t.next.round.toLowerCase()}` : ''
    const through = winners.length === 1 ? `${winners[0]} is through${into}.` : `${list(winners)} are through${into}.`
    const up =
      upsets.length === 1
        ? ` One upset: ${(upsets[0]!.winner === 'a' ? upsets[0]!.a : upsets[0]!.b).name} knocked out ${(upsets[0]!.winner === 'a' ? upsets[0]!.b : upsets[0]!.a).name}.`
        : upsets.length > 1
          ? ` ${NUMBER_WORDS[upsets.length] ?? upsets.length} upsets.`
          : ''
    return `${through}${up}`
  }
  if (t.next) {
    const byes = t.next.byes.length
    return `The draw is set and round one is next week: ${t.field} teams, one round a week, the final in week ${t.finalWeek}.${byes ? ` Seeds 1 to ${byes} have byes.` : ''} Your score each week is your Cup score.`
  }
  return ''
}

// The round's best story as a headline, and the game it's about (so the
// line under it can tell the rest without repeating it). In order: the
// biggest upset, a photo finish, a rout, the round's top score. Before any
// results, the state of the draw.
export function cupHeadline(t: CupTeaser): { headline: string; game: CupTeaserGame | null } {
  if (t.champion) return { headline: `${t.champion.name} wins ${t.name}`, game: null }
  if (t.results) {
    const told = t.results.games.map((g) => {
      const [w, l] = g.winner === 'b' ? [g.b, g.a] : [g.a, g.b]
      return { g, w, l, margin: (w.score ?? 0) - (l.score ?? 0), gap: w.seed - l.seed }
    })
    const upset = told.filter((x) => x.g.upset).sort((a, b) => b.gap - a.gap)[0]
    if (upset) return { headline: `${ordinal(upset.w.seed)}-seeded ${upset.w.name} knocks out ${upset.l.name}`, game: upset.g }
    const close = [...told].sort((a, b) => a.margin - b.margin)[0]
    if (close && close.margin < 4) return { headline: `${close.w.name} survives ${close.l.name} by ${pts(close.margin)}`, game: close.g }
    const rout = [...told].sort((a, b) => b.margin - a.margin)[0]
    if (rout && rout.margin >= 40) return { headline: `${rout.w.name} routs ${rout.l.name} by ${pts(rout.margin)}`, game: rout.g }
    const top = [...told].sort((a, b) => (b.w.score ?? 0) - (a.w.score ?? 0))[0]
    if (top && told.length > 1) return { headline: `${top.w.name} leads the way with ${pts(top.w.score ?? 0)}`, game: top.g }
    return { headline: `${list(told.map((x) => x.w.name))} ${told.length === 1 ? 'moves' : 'move'} on`, game: null }
  }
  if (t.preview) return { headline: t.preview.final ? 'The seeds are set' : `${t.name} starts week ${t.startWeek}`, game: null }
  return { headline: 'Round one is next week', game: null }
}

// The line under the headline: the rest of the round, never the headline's
// own game again.
export function cupStoryDeck(t: CupTeaser, game: CupTeaserGame | null): string {
  if (t.champion) {
    const c = t.champion
    return `The ${ordinal(c.seed)} seed beat ${c.over} ${pts(c.score)} to ${pts(c.theirs)} in the final.`
  }
  if (t.preview?.final) {
    return `Seeded on the Cup Rating after week ${t.preview.throughWeek}. Round one is week ${t.startWeek}, the final week ${t.finalWeek}.`
  }
  if (!t.results || !game) return cupDeck(t)
  const lead = (game.winner === 'b' ? game.b : game.a).name
  const others = t.results.games.filter((g) => g !== game).map((g) => (g.winner === 'b' ? g.b : g.a).name)
  const into = t.next ? `the ${t.next.round.toLowerCase()}` : 'the next round'
  const upsets = t.results.games.filter((g) => g.upset).length
  const extra = upsets > 1 ? ` ${NUMBER_WORDS[upsets] ?? upsets} upsets in all.` : ''
  if (!others.length) return `${lead} is through to ${into}.${extra}`
  return `${list(others)} ${others.length === 1 ? 'joins' : 'join'} ${lead} in ${into}.${extra}`
}

// The rounds as a strip: played, this week's (the one the paper reports),
// next week's, and the rest.
export function cupRoundStrip(t: CupTeaser): { short: string; week: number; state: 'done' | 'now' | 'next' | 'later' }[] {
  return (t.rounds ?? []).map((r) => ({
    short: r.short,
    week: r.week,
    state: r.week < t.week ? 'done' : r.week === t.week ? 'now' : r.week === t.week + 1 ? 'next' : 'later',
  }))
}

// A Cup title chance, already a percent: "24%", ">99%", "<1%".
export function cupWin(n: number): string {
  if (n >= 99.95) return '100%'
  if (n > 99) return '>99%'
  if (n > 0 && n < 1) return '<1%'
  return `${Math.round(n)}%`
}

// "Thursday 8:00 PM", Eastern.
export function cupLockText(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

// "2.4 rating points behind", "level on rating with": read before a name.
function ratingBack(n: number): string {
  if (n <= 0) return 'level on rating with'
  return `${n.toFixed(1)} rating ${n === 1 ? 'point' : 'points'} behind`
}

// The launch's bubble, in a line or two: the first team outside the twelve
// and the race for the last bye.
export function cupBubbleLines(t: CupTeaser): string[] {
  const p = t.preview
  if (!p) return []
  const out: string[] = []
  if (p.firstOut) out.push(`First out: ${p.firstOut.name}, ${ratingBack(p.firstOut.gap)} the last team in.`)
  if (p.byeRace) out.push(`Bye race: ${p.byeRace.next} is ${ratingBack(p.byeRace.gap)} ${p.byeRace.last} for the last bye.`)
  return out
}

// The label over the round-one card, and the button, for each state.
export function cupNextLabel(t: CupTeaser): string {
  if (!t.next) return ''
  if (t.preview) return `${t.preview.final ? 'The draw' : 'If the draw were today'} · ${t.next.round}`
  return `Next week · ${t.next.round}`
}

export function cupCta(t: CupTeaser): string {
  if (t.next?.open) return 'Make your Cup picks'
  return t.preview ? 'Preview the Cup' : 'See the bracket'
}

export function cupTag(t: CupTeaser): string {
  if (t.preview) return `The draw · ${t.preview.drawDay.replace(/^\w+, /, '')}`
  if (t.champion) return 'Champion'
  return t.results ? t.results.round : 'Starts next week'
}

// The bracket challenge in a line.
export function cupLeadersLine(t: CupTeaser): string | null {
  if (t.leaders.length) return `Bracket challenge: ${t.leaders.map((l) => `${l.name} ${l.points}`).join(', ')}.`
  if (t.next && t.pickers) return `${t.inPicks} of ${t.pickers} have made picks in the bracket challenge.`
  return null
}

// What a side shows on the right: its score (a result), its chance (next
// week), or its record (the launch preview, which has no odds).
export function cupSideRight(s: CupTeaserSide, kind: 'result' | 'next'): string {
  if (kind === 'result') return s.score != null ? pts(s.score) : ''
  return s.prob != null ? cupPct(s.prob) : (s.record ?? '')
}

export function cupPct(p: number | null): string {
  if (p == null) return ''
  const n = Math.round(p * 100)
  return n >= 100 ? '>99%' : n <= 0 ? '<1%' : `${n}%`
}

export { pts as cupPts }
