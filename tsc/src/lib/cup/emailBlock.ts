// The Cup's block in the Tuesday recap email (lib/recap/email.ts), on the
// weeks it runs. Its own file so the recap email only carries the one call.
//
// A pull-out on the Cup page's own board: bottle green, brass and ivory,
// the trophy and the rounds centred at the top like an event programme, so
// it can't be mistaken for Coming Up's left-aligned green further down.
// Results and next week's games on cream tickets, two up (stacked on a
// phone). Same email rules as the rest of the recap: Georgia and Arial,
// bgcolor on every table, the trophy a hosted PNG (no SVG in mail).

import type { CupTeaser } from './teaser'
import { SITE_URL } from '@/lib/recap/links'
import {
  cupBubbleLines,
  cupCta,
  cupHeadline,
  cupLaunchLine,
  cupLeadersLine,
  cupLockText,
  cupNextLabel,
  cupPts,
  cupRoundStrip,
  cupSideRight,
  cupStoryDeck,
  cupTag,
  cupWin,
} from './words'

// The board, for the full block.
const B = {
  board: '#0d2a21',
  line: '#2b4a3e',
  ivory: '#f0e6cc',
  ivory2: '#cbc2a6',
  mute: '#93a798',
  brass: '#c8a35b',
  brassHi: '#e6cb8e',
  ticket: '#f5eedb',
  ticket2: '#e6dcc0',
  tline: '#d6c8a2',
  tink: '#1b1f18',
  tmute: '#7b745f',
  green: '#1f4a3a',
  red: '#b23a26',
}

// The launch card's golden ticket.
const K = {
  band: '#ead9a8',
  rule: '#cdb67a',
  ink: '#14301f',
  ink2: '#3d4a33',
}
const SERIF = "Georgia,'Times New Roman',serif"
const SANS = 'Arial,Helvetica,sans-serif'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// The weeks before the draw week: a small "New" card at the foot of the
// Final Scores section (on its stock), not a section of its own. One line
// and the way to the preview; the projected draw and the countdown are on
// the page. The draw week itself gets the full block.
function launchCard(t: CupTeaser, text: string[]): string[] {
  const line = cupLaunchLine(t)
  const url = `${t.url}?utm_source=recap&amp;utm_medium=email&amp;utm_campaign=cup-launch`
  text.push(`NEW: ${t.name.toUpperCase()}`, line, `See the preview: ${t.url}`, '')
  return [
    `<tr><td class="pad" bgcolor="#efe8d6" style="background-color:#efe8d6; padding:0 32px 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${K.band}" style="background-color:${K.band}; border:1px solid ${K.rule};"><tr><td style="padding:14px 16px 15px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${K.ink}" style="background-color:${K.ink}; padding:2px 7px 1px; font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${K.band};">New</td>
<td style="padding-left:9px; font-family:${SERIF}; font-size:19px; line-height:1.2; color:${K.ink};">${esc(t.name)}</td>
</tr></table>
<div style="font-family:${SERIF}; font-size:15px; line-height:1.5; color:${K.ink2}; padding-top:8px;">${esc(line)}</div>
<div style="padding-top:10px; font-family:${SANS}; font-size:12px; font-weight:bold; letter-spacing:1px; text-transform:uppercase;"><a href="${url}" style="color:${K.ink}; text-decoration:underline;">See the preview</a></div>
</td></tr></table>
</td></tr>`,
  ]
}

const medal = (seed: number, out = false) =>
  `<td width="24" valign="middle" style="padding-right:8px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="22" height="22" bgcolor="${out ? B.ticket2 : B.board}" style="width:22px; height:22px; background-color:${out ? B.ticket2 : B.board}; border-radius:11px; font-family:${SANS}; font-size:10px; font-weight:bold; line-height:22px; color:${out ? B.tmute : B.brassHi};">${seed}</td></tr></table></td>`

// One cream ticket: two sides, then a foot.
function ticket(rows: string, foot: string | null): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${B.ticket}" style="background-color:${B.ticket}; border-radius:8px;">
<tr><td style="padding:9px 12px ${foot ? 4 : 9}px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>
${foot ? `<tr><td style="padding:6px 12px 7px; border-top:1px dashed ${B.tline}; font-family:${SANS}; font-size:11px; color:${B.tmute};">${foot}</td></tr>` : ''}
</table>`
}

const sideRow = (seed: number, name: string, right: string, o: { won?: boolean; out?: boolean } = {}) =>
  `<tr>${medal(seed, o.out)}<td valign="middle" style="padding:3px 0; font-family:${SERIF}; font-size:16px; line-height:1.25; color:${o.out ? B.tmute : B.tink};">${o.out ? `<s>${esc(name)}</s>` : o.won ? `<b>${esc(name)}</b>` : esc(name)}</td><td align="right" valign="middle" style="padding:3px 0 3px 8px; font-family:${SANS}; font-size:13px; white-space:nowrap; color:${o.out ? B.tmute : B.tink};">${o.won ? `<b>${right}</b>` : right}</td></tr>`

const pill = (text: string, bg: string, color: string) =>
  `<span style="display:inline-block; padding:2px 7px; background-color:${bg}; color:${color}; border-radius:9px; font-family:${SANS}; font-size:9px; font-weight:bold; letter-spacing:1px; text-transform:uppercase;">${text}</span>`

// Two to a row, each cell stacking on a phone (the recap's .col rule).
function twoUp(cells: string[]): string {
  const rows: string[] = []
  for (let i = 0; i < cells.length; i += 2) {
    const pair = cells.slice(i, i + 2)
    rows.push(
      `<tr>${pair.map((c) => `<td class="col" width="50%" valign="top" style="padding:4px;">${c}</td>`).join('')}${pair.length === 1 ? '<td class="col" width="50%" style="padding:4px;"></td>' : ''}</tr>`,
    )
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table>`
}

const boardLabel = (s: string) =>
  `<div style="font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${B.brass}; padding:0 4px 4px;">${esc(s)}</div>`

export function cupBlock(t: CupTeaser, text: string[]): string[] {
  if (t.preview && !t.preview.final) return launchCard(t, text)
  const { headline, game } = cupHeadline(t)
  const deck = cupStoryDeck(t, game)
  const lock = t.next?.open ? cupLockText(t.next.lockAt) : null
  const leaders = cupLeadersLine(t)
  const bubble = cupBubbleLines(t)
  const cta = cupCta(t)
  const tag = cupTag(t)
  const strip = cupRoundStrip(t)
  const fav = t.favourites?.[0]
  const url = `${esc(t.url)}?utm_source=recap&amp;utm_medium=email&amp;utm_campaign=cup`

  // ── The masthead: trophy, kicker, name, the rounds ──
  const stripCells = strip
    .map((r) => {
      const lit = r.state === 'done' || r.state === 'now'
      const nameColor = r.state === 'now' ? B.ivory : r.state === 'later' ? B.mute : B.ivory2
      return `<td align="center" width="${Math.floor(100 / strip.length)}%" style="padding:6px 2px 0; border-top:3px solid ${lit ? B.brass : B.line};">
<div style="font-family:${SANS}; font-size:11px; font-weight:bold; color:${nameColor}; white-space:nowrap;">${r.state === 'now' ? `&#9679; ${esc(r.short)}` : esc(r.short)}</div>
<div style="font-family:${SANS}; font-size:10px; color:${r.state === 'now' ? B.brassHi : B.mute}; padding-top:1px;">Wk ${r.week}</div>
</td>`
    })
    .join('')
  const mast = `<tr><td class="pad" align="center" bgcolor="${B.board}" style="background-color:${B.board}; padding:28px 32px 0; border-top:4px solid ${B.brass};">
<img src="${SITE_URL}/email/cup-trophy.png" width="56" height="67" alt="" style="display:block; border:0; width:56px; height:67px;">
<div style="font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:3px; text-transform:uppercase; color:${B.brass}; padding-top:12px;">${t.preview ? 'Special section &middot; The draw' : `Special section &middot; Week ${t.week}`}</div>
<div class="hed" style="font-family:${SERIF}; font-size:36px; line-height:1.1; color:${B.ivory}; padding-top:6px;">${esc(t.name)}</div>
${strip.length ? `<table role="presentation" width="88%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr>${stripCells}</tr></table>` : ''}
</td></tr>`

  // ── The story ──
  const story = `<tr><td class="pad" align="center" bgcolor="${B.board}" style="background-color:${B.board}; padding:22px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${B.line};"><tr><td align="center" style="padding-top:18px;">
${pill(esc(tag), B.brass, B.board)}
<div style="font-family:${SERIF}; font-size:25px; font-weight:bold; line-height:1.2; color:${B.ivory}; padding-top:10px;">${esc(headline)}</div>
${deck ? `<div style="font-family:${SERIF}; font-style:italic; font-size:15px; line-height:1.5; color:${B.ivory2}; padding-top:6px;">${esc(deck)}</div>` : ''}
</td></tr></table>
</td></tr>`

  // ── Results and next week, on tickets ──
  const resultCells = (t.results?.games ?? []).map((g) => {
    const [w, l] = g.winner === 'b' ? [g.b, g.a] : [g.a, g.b]
    const margin = (w.score ?? 0) - (l.score ?? 0)
    const foot = `${g.upset ? pill('Upset', B.red, '#ffffff') : pill('Through', B.green, B.ticket)} &nbsp;${g.tiebreak ? 'Level, through on seed' : `by ${cupPts(margin)}`}`
    return ticket(sideRow(w.seed, w.name, cupSideRight(w, 'result'), { won: true }) + sideRow(l.seed, l.name, cupSideRight(l, 'result'), { out: true }), foot)
  })
  const nextCells = (t.next?.games ?? []).map((g) => {
    const [top, bottom] = g.a.seed <= g.b.seed ? [g.a, g.b] : [g.b, g.a]
    const p = !t.preview && top.prob != null ? Math.max(2, Math.min(98, Math.round(top.prob * 100))) : null
    const bar =
      p != null
        ? `<tr><td></td><td colspan="2" style="padding:2px 0 3px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="${p}%" bgcolor="${B.green}" style="background-color:${B.green}; height:5px; line-height:5px; font-size:1px;">&nbsp;</td><td bgcolor="${B.tline}" style="background-color:${B.tline}; height:5px; line-height:5px; font-size:1px;">&nbsp;</td></tr></table></td></tr>`
        : ''
    return ticket(sideRow(top.seed, top.name, cupSideRight(top, 'next')) + bar + sideRow(bottom.seed, bottom.name, cupSideRight(bottom, 'next')), null)
  })
  const boards = `<tr><td class="pad tiles" bgcolor="${B.board}" style="background-color:${B.board}; padding:20px 28px 0;">
${resultCells.length ? `${boardLabel(`Week ${t.week} · ${t.results!.round}`)}${twoUp(resultCells)}` : ''}
${nextCells.length ? `<div style="height:${resultCells.length ? 14 : 0}px; line-height:1px; font-size:1px;">&nbsp;</div>${boardLabel(cupNextLabel(t))}${twoUp(nextCells)}` : ''}
${t.next?.byes.length ? `<div style="font-family:${SANS}; font-size:12px; line-height:1.5; color:${B.ivory2}; padding:8px 4px 0;">Byes: ${t.next.byes.map((b) => `${esc(b.name)} (${b.seed})`).join(', ')}</div>` : ''}
${bubble.map((l) => `<div style="font-family:${SERIF}; font-size:14px; line-height:1.5; color:${B.ivory}; padding:8px 4px 0;">${esc(l)}</div>`).join('')}
</td></tr>`

  // ── The facts row ──
  const facts: { label: string; value: string; note: string }[] = t.preview
    ? [
        { label: 'The field', value: String(t.field), note: `after week ${t.preview.throughWeek}` },
        ...(t.next?.byes.length ? [{ label: 'Byes', value: String(t.next.byes.length), note: `seeds 1 to ${t.next.byes.length}` }] : []),
        { label: 'The draw', value: t.preview.drawDay.replace(/^\w+, /, ''), note: '9 AM ET' },
      ]
    : [
        ...(t.champion || t.alive == null ? [] : [{ label: 'Still in', value: String(t.alive), note: `of ${t.field}` }]),
        ...(fav ? [{ label: 'Favourite', value: fav.name, note: `${cupWin(fav.win)} to win it` }] : []),
        ...(t.leaders[0] ? [{ label: 'Bracket challenge', value: t.leaders[0].name, note: `${t.leaders[0].points} ${t.leaders[0].points === 1 ? 'point' : 'points'}` }] : []),
      ]
  const factCells = facts
    .map(
      (f, i) => `<td valign="top" width="${Math.floor(100 / facts.length)}%" style="padding:10px ${i === facts.length - 1 ? 0 : 10}px 11px ${i ? 10 : 0}px;${i ? ` border-left:1px solid ${B.line};` : ''}">
<div style="font-family:${SANS}; font-size:9px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${B.brass};">${esc(f.label)}</div>
<div style="font-family:${SERIF}; font-size:18px; line-height:1.2; color:${B.ivory}; padding-top:3px;">${esc(f.value)}</div>
<div style="font-family:${SANS}; font-size:11px; color:${B.mute}; padding-top:1px;">${esc(f.note)}</div>
</td>`,
    )
    .join('')
  const close = `<tr><td class="pad" bgcolor="${B.board}" style="background-color:${B.board}; padding:18px 32px 28px;">
${facts.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${B.line}; border-bottom:1px solid ${B.line};"><tr>${factCells}</tr></table>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;"><tr>
<td align="center" bgcolor="${B.brass}" style="background-color:${B.brass}; border-radius:8px;">
<a href="${url}" style="display:block; padding:14px 20px; font-family:${SANS}; font-size:13px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:${B.board}; text-decoration:none;">${esc(cta)}</a>
</td></tr></table>
${lock ? `<div style="font-family:${SANS}; font-size:12px; line-height:1.5; color:${B.ivory2}; padding-top:9px; text-align:center;">Picks lock ${esc(lock)} ET. Tap the team you think wins each game.</div>` : ''}
</td></tr>`

  text.push(
    t.name.toUpperCase(),
    headline,
    ...(deck ? [deck] : []),
    ...(t.results
      ? t.results.games.map((g) => {
          const [w, l] = g.winner === 'b' ? [g.b, g.a] : [g.a, g.b]
          return `${w.name} (${w.seed}) ${w.score != null ? cupPts(w.score) : ''}, ${l.name} (${l.seed}) ${l.score != null ? cupPts(l.score) : ''}${g.upset ? ' (upset)' : ''}`
        })
      : []),
    ...(t.next ? [`${cupNextLabel(t)}:`, ...t.next.games.map((g) => `${g.a.name} (${g.a.seed}) ${cupSideRight(g.a, 'next')} v ${g.b.name} (${g.b.seed}) ${cupSideRight(g.b, 'next')}`)] : []),
    ...bubble,
    ...(fav ? [`Favourite: ${fav.name}, ${cupWin(fav.win)} to win it.`] : []),
    ...(leaders ? [leaders] : []),
    `${cta}${lock ? ` (they lock ${lock} ET)` : ''}: ${t.url}`,
    '',
  )

  return [mast, story, boards, close]
}
