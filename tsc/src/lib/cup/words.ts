// The Cup's lines for the recap, shared by the email block and the recap
// page so the two say the same thing. Pure: everything comes in on the
// teaser.

import type { CupTeaser, CupTeaserSide } from './teaser'

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

// One or two sentences under the Cup's name: what happened this week, in
// plain words.
export function cupDeck(t: CupTeaser): string {
  if (t.preview) {
    const p = t.preview
    if (p.final) return `The draw is ${p.drawDay}, and the seeds are set: the standings after week ${p.throughWeek}. Round one is next week.`
    return `${t.name} starts in week ${t.startWeek}: the top ${Math.min(t.field, 12)} after week ${t.startWeek - 1}, one round a week, the final in week ${t.finalWeek}. Your score each week is your Cup score. The draw is ${p.drawDay}; here is how it sets up today.`
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

// "Thursday 8:00 PM", Eastern.
export function cupLockText(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

const HALF_WORDS = ['', 'one', 'two', 'three', 'four', 'five']

function gamesBack(n: number): string {
  if (n === 0) return 'level on record with'
  const whole = Math.floor(n)
  const half = n - whole >= 0.5
  if (!whole) return 'half a game behind'
  return `${HALF_WORDS[whole] ?? whole}${half ? ' and a half' : ''} ${whole === 1 && !half ? 'game' : 'games'} behind`
}

// The launch's bubble, in a line or two: the first team outside the twelve
// and the race for the last bye.
export function cupBubbleLines(t: CupTeaser): string[] {
  const p = t.preview
  if (!p) return []
  const out: string[] = []
  if (p.firstOut) out.push(`First out: ${p.firstOut.name}, ${gamesBack(p.firstOut.gb)} the last team in.`)
  if (p.byeRace) out.push(`Bye race: ${p.byeRace.next} is ${gamesBack(p.byeRace.gb)} ${p.byeRace.last} for the last bye.`)
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
