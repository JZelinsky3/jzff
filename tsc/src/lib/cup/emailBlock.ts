// The Cup's block in the Tuesday recap email (lib/recap/email.ts), on the
// weeks it runs. Its own file so the recap email only carries the one call.
//
// It wears the Cup page's golden ticket: green ink on brass-cream, so it
// can't be mistaken for Coming Up's green further down. Same email rules as
// the rest of the recap: Georgia and Arial, bgcolor on every table, warm
// colours only (Gmail's dark theme flips lightness and keeps hue, so this
// lands on a dark olive with pale ink).

import type { CupTeaser, CupTeaserGame } from './teaser'
import { cupDeck, cupLeadersLine, cupLockText, cupPct, cupPts } from './words'

const K = {
  band: '#ead9a8',
  card: '#f8f1de',
  rule: '#cdb67a',
  ink: '#14301f',
  ink2: '#3d4a33',
  mute: '#6b6545',
  red: '#a3302a',
}
const SERIF = "Georgia,'Times New Roman',serif"
const SANS = 'Arial,Helvetica,sans-serif'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Two lines a game, winner (or the higher seed) on top: name and seed on
// the left, the score (results) or the chance to win (next week) on the
// right.
function gamesCard(label: string, games: CupTeaserGame[], kind: 'result' | 'next'): string {
  const name = `font-family:${SERIF}; font-size:15px; line-height:1.35;`
  const num = `font-family:${SANS}; font-size:13px; line-height:1.35; white-space:nowrap; padding-left:10px;`
  const seed = (n: number) => `<span style="font-family:${SANS}; font-size:11px; color:${K.mute};">&nbsp;(${n})</span>`
  const rows = games
    .map((g, i) => {
      const last = i === games.length - 1
      const [top, bottom] = kind === 'result' ? (g.winner === 'b' ? [g.b, g.a] : [g.a, g.b]) : g.a.seed <= g.b.seed ? [g.a, g.b] : [g.b, g.a]
      const right = (s: typeof top) => (kind === 'result' ? (s.score != null ? cupPts(s.score) : '') : cupPct(s.prob))
      const tag = g.upset ? `<span style="font-family:${SANS}; font-size:9px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:${K.red};"> &nbsp;Upset</span>` : ''
      return `<tr><td style="padding:7px 0;${last ? '' : ` border-bottom:1px dotted ${K.rule};`}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="${name} color:${K.ink};">${kind === 'result' ? `<b>${esc(top.name)}</b>` : esc(top.name)}${seed(top.seed)}${tag}</td><td align="right" style="${num} color:${K.ink};">${kind === 'result' ? `<b>${right(top)}</b>` : right(top)}</td></tr>
<tr><td style="${name} color:${K.mute};">${kind === 'result' ? `<s>${esc(bottom.name)}</s>` : esc(bottom.name)}${seed(bottom.seed)}</td><td align="right" style="${num} color:${K.mute};">${right(bottom)}</td></tr>
</table>
</td></tr>`
    })
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${K.card}" style="background-color:${K.card}; border:1px solid ${K.rule}; margin-top:14px;"><tr><td style="padding:10px 14px 4px;">
<div style="font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${K.ink2}; padding-bottom:2px;">${esc(label)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
</td></tr></table>`
}

export function cupBlock(t: CupTeaser, text: string[]): string[] {
  const deck = cupDeck(t)
  const lock = t.next ? cupLockText(t.next.lockAt) : null
  const leaders = cupLeadersLine(t)
  const cta = lock ? `Make your Cup picks before ${lock} ET` : 'See the bracket'
  const tag = t.champion ? 'Champion' : t.results ? t.results.round : 'Starts next week'

  const cards = [
    t.results ? gamesCard(`Week ${t.week} · ${t.results.round}`, t.results.games, 'result') : '',
    t.next ? gamesCard(`Next week · ${t.next.round}`, t.next.games, 'next') : '',
  ].join('')
  const byes = t.next?.byes.length ? `<div style="font-family:${SANS}; font-size:12px; line-height:1.5; color:${K.ink2}; padding-top:8px;">Byes: ${t.next.byes.map((b) => `${esc(b.name)} (${b.seed})`).join(', ')}</div>` : ''

  text.push(
    t.name.toUpperCase(),
    deck,
    ...(t.results ? t.results.games.map((g) => {
      const [w, l] = g.winner === 'b' ? [g.b, g.a] : [g.a, g.b]
      return `${w.name} (${w.seed}) ${w.score != null ? cupPts(w.score) : ''}, ${l.name} (${l.seed}) ${l.score != null ? cupPts(l.score) : ''}${g.upset ? ' (upset)' : ''}`
    }) : []),
    ...(t.next ? [`Next week, ${t.next.round.toLowerCase()}:`, ...t.next.games.map((g) => `${g.a.name} (${g.a.seed}) ${cupPct(g.a.prob)} v ${g.b.name} (${g.b.seed}) ${cupPct(g.b.prob)}`)] : []),
    ...(leaders ? [leaders] : []),
    `${cta}: ${t.url}`,
    '',
  )

  return [
    `<tr><td class="pad" bgcolor="${K.band}" style="background-color:${K.band}; padding:22px 32px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${K.ink}" style="background-color:${K.ink}; padding:3px 8px 2px; font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${K.band};">${esc(tag)}</td></tr></table>
<div style="font-family:${SERIF}; font-size:22px; line-height:1.15; color:${K.ink}; padding:7px 0 7px; border-bottom:2px solid ${K.ink};">${esc(t.name)}</div>
</td></tr>`,
    `<tr><td class="pad" bgcolor="${K.band}" style="background-color:${K.band}; padding:6px 32px 26px;">
${deck ? `<div style="font-family:${SERIF}; font-style:italic; font-size:16px; line-height:1.5; color:${K.ink2};">${esc(deck)}</div>` : ''}
${cards}
${byes}
${leaders ? `<div style="font-family:${SERIF}; font-size:15px; line-height:1.5; color:${K.ink}; padding-top:12px;">${esc(leaders)}</div>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr>
<td align="center" bgcolor="${K.ink}" style="background-color:${K.ink};">
<a href="${esc(t.url)}?utm_source=recap&amp;utm_medium=email&amp;utm_campaign=cup" style="display:inline-block; padding:11px 20px; font-family:${SANS}; font-size:12px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:${K.band}; text-decoration:none;">${esc(cta)}</a>
</td></tr></table>
</td></tr>`,
  ]
}
