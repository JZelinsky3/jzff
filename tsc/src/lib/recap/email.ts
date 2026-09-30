// The recap email: HTML and plain-text parts, built from the same facts the
// page renders.
//
// Design rules carried over from scripts/emails/launch-notice.html, which is
// where they were learned the hard way:
//   · ONE warm near-black design. Gmail's dark theme inverts lightness but
//     keeps hue, so warm ink lands on cream instead of pale blue.
//   · Georgia and Arial only. No web fonts, no @import.
//   · No hidden zero-width preheader padding; the preview line is plain words.
//   · Every table carries bgcolor as well as an inline style, for Outlook.
//
// The email is the trailer, the page is the film: scores with the history
// behind each one, the week's awards, the best of the history lines, and
// next week's marquee game. Everything else is a tap away.

import { TIER_PRICES } from '@/lib/stripe'
import { ordinal, pts, recapSections, seriesLine, type RecapFacts, type RecapGame } from './facts'

const C = {
  page: '#150f07',
  card: '#1e1709',
  panel: '#2a2012',
  rule: '#453824',
  ink: '#f4ebd8',
  muted: '#b0a48d',
  foot: '#a89b84',
  gold: '#e8c889',
}
const SERIF = "Georgia,'Times New Roman',serif"
const SANS = 'Arial,Helvetica,sans-serif'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export type RecapEmailLinks = {
  page: string
  share: string
  unsubscribe: string
  account: string
  pricing: string
  newLeague: string
  league: string
}

const winnerOf = (g: RecapGame) => (g.winner === 'a' ? g.a : g.b)
const loserOf = (g: RecapGame) => (g.winner === 'a' ? g.b : g.a)

function sectionHead(label: string): string {
  return `<tr><td class="pad" bgcolor="${C.card}" style="padding:26px 40px 8px;">
<div style="font-family:${SANS}; font-size:10px; letter-spacing:3px; text-transform:uppercase; color:${C.gold}; padding-bottom:8px; border-bottom:1px solid ${C.rule};">${esc(label)}</div>
</td></tr>`
}

function labelRows(rows: [string, string][]): string {
  const body = rows
    .map(
      ([k, v]) => `<tr>
<td valign="top" style="padding:5px 12px 5px 0; font-family:${SANS}; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:${C.muted}; white-space:nowrap;">${esc(k)}</td>
<td valign="top" style="padding:5px 0; font-family:${SERIF}; font-size:15px; line-height:1.45; color:${C.ink};">${v}</td>
</tr>`,
    )
    .join('')
  return `<tr><td class="pad" bgcolor="${C.card}" style="padding:4px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
</td></tr>`
}

function bullets(lines: string[]): string {
  const body = lines
    .map(
      (l) => `<tr><td valign="top" style="padding:5px 10px 5px 0; font-family:${SERIF}; font-size:15px; color:${C.gold};">&#9733;</td>
<td style="padding:5px 0; font-family:${SERIF}; font-size:15px; line-height:1.5; color:${C.ink};">${esc(l)}</td></tr>`,
    )
    .join('')
  return `<tr><td class="pad" bgcolor="${C.card}" style="padding:4px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
</td></tr>`
}

// The best few lines of history in the recap: records first, then snapped
// runs and career marks. These are the lines no platform email can carry.
export function historyLines(f: RecapFacts, max: number): string[] {
  const out: string[] = [...(f.records ?? [])]
  for (const g of f.games) {
    if (g.seriesNote && / snaps | has now won /.test(g.seriesNote)) out.push(g.seriesNote)
  }
  const marks = f.teams
    .filter((t) => t.note && /Career|since/.test(t.note))
    .map((t) => `${t.name}, ${pts(t.score)}: ${t.note!.replace(/\.$/, '')}.`)
  out.push(...marks)
  return out.slice(0, max)
}

export function renderRecapEmail(
  f: RecapFacts,
  intro: string,
  subject: string,
  links: RecapEmailLinks,
): { html: string; text: string } {
  const show = recapSections(f.tier)
  const rows: string[] = []
  const text: string[] = []

  const weekLabel = f.phase === 'playoffs' ? `Playoffs, week ${f.week}` : `Week ${f.week}`

  // ── Masthead + intro ──
  rows.push(`<tr><td class="pad" align="center" bgcolor="${C.card}" style="padding:28px 40px 20px; border-bottom:3px double #a88a4a;">
<div style="font-family:${SANS}; font-size:10px; letter-spacing:3px; text-transform:uppercase; color:${C.muted}; padding-bottom:10px;">The Sunday Chronicle</div>
<div class="hed" style="font-family:${SERIF}; font-size:30px; line-height:1.15; color:${C.ink};">${esc(f.league.name)}</div>
<div style="font-family:${SANS}; font-size:10px; letter-spacing:3px; text-transform:uppercase; color:${C.gold}; padding-top:10px;">${esc(weekLabel)} recap · ${f.year}</div>
</td></tr>`)
  rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:22px 40px 4px; font-family:${SERIF}; font-size:17px; line-height:1.6; color:${C.ink};">${esc(intro)}</td></tr>`)
  text.push(`${f.league.name}: ${weekLabel} recap, ${f.year}`, '', intro, '')

  // ── Scores, each with the series behind it ──
  rows.push(sectionHead('Final scores'))
  text.push('FINAL SCORES')
  const scoreRows = f.games
    .map((g) => {
      const decided = g.winner === 'a' || g.winner === 'b'
      const first = decided ? winnerOf(g) : g.a
      const second = decided ? loserOf(g) : g.b
      const joiner = decided ? 'over' : 'and'
      const kind = g.kind === 'championship' ? 'Championship' : g.kind === 'consolation' ? 'Consolation' : null
      const legNote = g.leg?.n === 1 ? 'First leg of two, decided next week' : g.winner === 'tie' ? 'Tie' : null
      const series = g.series ? seriesLine(g.a.name, g.b.name, g.series) : null
      const sub = [kind, legNote, g.seriesNote && / snaps | has now won /.test(g.seriesNote) ? g.seriesNote.replace(/\.$/, '') : series]
        .filter(Boolean)
        .join(' · ')
      text.push(`${first.name} ${pts(first.score)} ${joiner} ${second.name} ${pts(second.score)}${sub ? `  (${sub})` : ''}`)
      return `<tr>
<td style="padding:8px 0; font-family:${SERIF}; font-size:15px; color:${C.ink}; border-bottom:1px solid ${C.rule};">${decided ? `<b>${esc(first.name)}</b>` : esc(first.name)} ${pts(first.score)}<span style="color:${C.muted};"> ${joiner} </span>${esc(second.name)} ${pts(second.score)}${sub ? `<div style="font-family:${SANS}; font-size:11px; line-height:1.5; color:${C.muted}; padding-top:3px;">${esc(sub)}</div>` : ''}</td>
</tr>`
    })
    .join('')
  rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:2px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${scoreRows}</table></td></tr>`)
  text.push('')

  // ── The week's awards ──
  if (f.awards.length) {
    rows.push(sectionHead('The week'))
    rows.push(labelRows(f.awards.map((a) => [a.title, `${esc(a.who)}, ${esc(a.value)}`])))
    text.push('THE WEEK', ...f.awards.map((a) => `${a.title}: ${a.who}, ${a.value}`), '')
  }

  // ── History: the part the platform's email can't send ──
  const hist = historyLines(f, 4)
  if (hist.length) {
    rows.push(sectionHead('From the history books'))
    rows.push(bullets(hist))
    text.push('FROM THE HISTORY BOOKS', ...hist, '')
  }

  // ── Paid extras, one line each ──
  if (show.paid) {
    const extra: [string, string][] = []
    const extraText: string[] = []
    const add = (k: string, v: string) => {
      extra.push([k, esc(v)])
      extraText.push(`${k}: ${v}`)
    }
    if (f.power?.length) {
      add('Power top 3', f.power.slice(0, 3).map((p) => `${p.rank}. ${p.name}`).join(', '))
      const up = [...f.power].sort((a, b) => b.delta - a.delta)[0]
      if (up && up.delta > 0) add('Biggest riser', `${up.name}, up ${up.delta} to ${ordinal(up.rank)}`)
    }
    if (f.lineups?.mvps.length) {
      const top2 = [...f.lineups.mvps].sort((a, b) => b.points - a.points).slice(0, 2)
      add('Top players', top2.map((m) => `${m.player} ${pts(m.points)} (${m.manager})`).join(', '))
    }
    if (f.lineups?.efficiency) {
      const e = f.lineups.efficiency
      add('Lineups', `${e.best.name} started ${e.best.pct}% of the best possible. ${e.worst.name} left ${pts(e.worst.left)} on the bench.`)
    }
    if (f.pickems?.best.length) {
      const b = f.pickems.best
      add("Pick'ems", `${b.map((r) => r.name).join(', ')} went ${b[0].right}-${b[0].wrong}${f.pickems.crowd ? `. ${f.pickems.crowd.replace(/\.$/, '')}` : ''}`)
    }
    if (show.veteran && f.trades?.length) add(f.trades.length === 1 ? 'Trade' : 'Trades', f.trades.map((t) => t.headline).join('; '))
    if (extra.length) {
      rows.push(sectionHead('Around the league'))
      rows.push(labelRows(extra))
      text.push('AROUND THE LEAGUE', ...extraText, '')
    }
  }

  // ── Next week ──
  if (f.next?.games.length) {
    const lines = f.next.games.slice(0, 3).map((g) => {
      const fav =
        show.paid && g.spread != null && g.favorite ? ` ${g.favorite === 'a' ? g.a.name : g.b.name} by ${pts(g.spread)}.` : ''
      const series = g.series ? ` ${seriesLine(g.a.name, g.b.name, g.series)}.` : ' First meeting.'
      return `${g.gotw ? 'Game of the week: ' : ''}${g.a.name} vs ${g.b.name}.${fav}${series}`
    })
    rows.push(sectionHead(`Week ${f.next.week}`))
    rows.push(bullets(lines))
    text.push(`WEEK ${f.next.week}`, ...lines, '')
  }

  if (!show.paid) {
    const price = `$${(TIER_PRICES.tier1.yearly.amountCents / 100).toFixed(0)} a year`
    rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:22px 40px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.panel}" style="background-color:${C.panel}; border:1px solid ${C.rule};">
<tr><td style="padding:16px 18px; font-family:${SERIF}; font-size:15px; line-height:1.55; color:${C.ink};">
This is the short version. The full recap adds league records, power rankings and playoff odds, pick'ems, the lineup desk, and next week's lines. Rookie is ${price} for your league.
<div style="padding-top:10px; font-family:${SANS}; font-size:13px;"><a href="${esc(links.pricing)}" style="color:${C.gold}; text-decoration:underline;">See plans</a></div>
</td></tr></table></td></tr>`)
    text.push(`This is the short version. The full recap adds league records, power rankings and playoff odds, pick'ems, the lineup desk and next week's lines. Rookie is ${price} for your league: ${links.pricing}`, '')
  }

  // ── Button + share ──
  rows.push(`<tr><td class="pad" align="center" bgcolor="${C.card}" style="padding:28px 40px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${C.gold}" style="background-color:${C.gold}; border-radius:2px;">
<a href="${esc(links.page)}" style="display:inline-block; padding:13px 28px; font-family:${SANS}; font-size:14px; font-weight:bold; letter-spacing:1px; color:${C.page}; text-decoration:none;">Open the full recap</a>
</td></tr></table>
</td></tr>`)
  rows.push(`<tr><td class="pad" align="center" bgcolor="${C.card}" style="padding:10px 40px 26px; font-family:${SANS}; font-size:13px; line-height:1.6; color:${C.muted};">
Every team's week, the lineup desk and all of next week are on the page.<br>
Send it to the league: <a href="${esc(links.share)}" style="color:${C.gold}; text-decoration:underline; word-break:break-all;">${esc(links.share)}</a>
</td></tr>`)
  text.push(`Open the full recap: ${links.page}`, `Send it to the league: ${links.share}`, '')

  // ── Footer ──
  rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:18px 40px 26px; border-top:1px solid ${C.rule}; font-family:${SANS}; font-size:11px; line-height:1.7; color:${C.foot};">
You're getting this because you run ${esc(f.league.name)} on The Sunday Chronicle. Recaps go to the league's commissioner once a week, after Monday night.<br>
<a href="${esc(links.league)}" style="color:${C.foot}; text-decoration:underline;">View the league</a> · <a href="${esc(links.unsubscribe)}" style="color:${C.foot}; text-decoration:underline;">Stop recap emails</a> · <a href="${esc(links.account)}" style="color:${C.foot}; text-decoration:underline;">Account settings</a> · <a href="${esc(links.newLeague)}" style="color:${C.foot}; text-decoration:underline;">Run another league? Start its book free</a>
</td></tr>`)
  text.push(
    `You're getting this because you run ${f.league.name} on The Sunday Chronicle.`,
    `View the league: ${links.league}`,
    `Stop recap emails: ${links.unsubscribe}`,
    `Account settings: ${links.account}`,
  )

  const preheader = (f.hooks?.[0] ? `${f.hooks[0]}.` : intro.split(/(?<=\.)\s/)[0]) ?? intro

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(subject)}</title>
<style>
  @media only screen and (max-width: 620px) {
    .wrap { width: 100% !important; }
    .pad  { padding-left: 20px !important; padding-right: 20px !important; }
    .hed  { font-size: 25px !important; }
  }
  a { text-decoration: none; }
</style>
</head>
<body style="margin:0; padding:0; background-color:${C.page}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:${C.page}; font-size:1px; line-height:1px;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page};">
<tr><td align="center" style="padding:24px 10px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="width:600px; max-width:600px; background-color:${C.card}; border:1px solid ${C.rule};">
${rows.join('\n')}
</table>
</td></tr>
</table>
</body>
</html>`

  return { html, text: text.join('\n') }
}
