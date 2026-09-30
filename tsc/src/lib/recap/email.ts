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
// And one of its own: it is short. Scores, the week's headlines, one button.
// Everything else is on the page.

import { TIER_PRICES } from '@/lib/stripe'
import { ordinal, pts, recapSections, type RecapFacts, type RecapGame } from './facts'

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
}

const winnerOf = (g: RecapGame) => (g.winner === 'a' ? g.a : g.b)
const loserOf = (g: RecapGame) => (g.winner === 'a' ? g.b : g.a)

function gameLine(g: RecapGame): { left: string; right: string; joiner: string; note: string | null } {
  const kind = g.kind === 'championship' ? 'Championship' : g.kind === 'consolation' ? 'Consolation' : null
  if (g.winner === 'a' || g.winner === 'b') {
    const w = winnerOf(g)
    const l = loserOf(g)
    const total =
      g.leg?.n === 2 && g.leg.totalA != null && g.leg.totalB != null
        ? `Two-week total ${pts(g.winner === 'a' ? g.leg.totalA : g.leg.totalB)} to ${pts(g.winner === 'a' ? g.leg.totalB : g.leg.totalA)}`
        : null
    return {
      left: `<b>${esc(w.name)}</b> ${pts(w.score)}`,
      right: `${esc(l.name)} ${pts(l.score)}`,
      joiner: 'over',
      note: [kind, total].filter(Boolean).join(' · ') || null,
    }
  }
  return {
    left: `${esc(g.a.name)} ${pts(g.a.score)}`,
    right: `${esc(g.b.name)} ${pts(g.b.score)}`,
    joiner: 'and',
    note: [kind, g.leg?.n === 1 ? 'First leg of two, decided next week' : 'Tie'].filter(Boolean).join(' · '),
  }
}

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

  // ── Scores ──
  rows.push(sectionHead('Final scores'))
  text.push('FINAL SCORES')
  const scoreRows = f.games
    .map((g) => {
      const l = gameLine(g)
      text.push(`${l.left.replace(/<[^>]+>/g, '')} ${l.joiner} ${l.right.replace(/&amp;/g, '&')}${l.note ? `  (${l.note})` : ''}`)
      return `<tr>
<td style="padding:7px 0; font-family:${SERIF}; font-size:15px; color:${C.ink}; border-bottom:1px solid ${C.rule};">${l.left}<span style="color:${C.muted};"> ${l.joiner} </span>${l.right}${l.note ? `<div style="font-family:${SANS}; font-size:11px; color:${C.muted}; padding-top:2px;">${esc(l.note)}</div>` : ''}</td>
</tr>`
    })
    .join('')
  rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:2px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${scoreRows}</table></td></tr>`)
  text.push('')

  // ── The week ──
  const week: [string, string][] = []
  const weekText: string[] = []
  if (f.top) {
    week.push(['Top score', `${esc(f.top.name)}, ${pts(f.top.score)}`])
    weekText.push(`Top score: ${f.top.name}, ${pts(f.top.score)}`)
  }
  if (f.low) {
    week.push(['Low score', `${esc(f.low.name)}, ${pts(f.low.score)}`])
    weekText.push(`Low score: ${f.low.name}, ${pts(f.low.score)}`)
  }
  if (f.closest) {
    const v = `${winnerOf(f.closest).name} by ${pts(f.closest.margin)} over ${loserOf(f.closest).name}`
    week.push(['Closest', esc(v)])
    weekText.push(`Closest: ${v}`)
  }
  if (f.blowout) {
    const v = `${winnerOf(f.blowout).name} by ${pts(f.blowout.margin)} over ${loserOf(f.blowout).name}`
    week.push(['Biggest win', esc(v)])
    weekText.push(`Biggest win: ${v}`)
  }
  if (f.upset) {
    const v = `${f.upset.winner} (${f.upset.winnerRecord}) beat ${f.upset.loser} (${f.upset.loserRecord})`
    week.push(['Upset', esc(v)])
    weekText.push(`Upset: ${v}`)
  }
  for (const s of f.streaks.slice(0, 2)) {
    const v = `${s.name} has ${s.kind === 'W' ? 'won' : 'lost'} ${s.length} straight`
    week.push(['Streak', esc(v)])
    weekText.push(`Streak: ${v}`)
  }
  if (week.length) {
    rows.push(sectionHead('The week'))
    rows.push(labelRows(week))
    text.push('THE WEEK', ...weekText, '')
  }

  // ── Paid extras, one line each. The detail lives on the page. ──
  if (show.paid) {
    const extra: [string, string][] = []
    const extraText: string[] = []
    for (const r of f.records ?? []) {
      extra.push(['Record', esc(r)])
      extraText.push(`Record: ${r}`)
    }
    if (f.power?.length) {
      const top3 = f.power.slice(0, 3).map((p) => `${p.rank}. ${p.name}`).join(', ')
      extra.push(['Power top 3', esc(top3)])
      extraText.push(`Power top 3: ${top3}`)
      const up = [...f.power].sort((a, b) => b.delta - a.delta)[0]
      if (up && up.delta > 0) {
        const v = `${up.name}, up ${up.delta} to ${ordinal(up.rank)}`
        extra.push(['Biggest riser', esc(v)])
        extraText.push(`Biggest riser: ${v}`)
      }
    }
    if (f.pickems?.best.length) {
      const b = f.pickems.best
      const v = `${b.map((r) => r.name).join(', ')} went ${b[0].right}-${b[0].wrong}`
      extra.push(["Pick'ems", esc(v)])
      extraText.push(`Pick'ems: ${v}`)
    }
    for (const m of (f.milestones ?? []).slice(0, 2)) {
      extra.push(['Milestone', esc(`${m.name}: ${m.text}`)])
      extraText.push(`Milestone: ${m.name}: ${m.text}`)
    }
    if (show.veteran && f.bench?.worst) {
      const v = `${f.bench.worst.name} left ${pts(f.bench.worst.left)} points on the bench`
      extra.push(['Bench', esc(v)])
      extraText.push(`Bench: ${v}`)
    }
    if (show.veteran && f.trades?.length) {
      const v = f.trades.map((t) => t.headline).join('; ')
      extra.push([f.trades.length === 1 ? 'Trade' : 'Trades', esc(v)])
      extraText.push(`Trades: ${v}`)
    }
    if (extra.length) {
      rows.push(sectionHead('Around the league'))
      rows.push(labelRows(extra))
      text.push('AROUND THE LEAGUE', ...extraText, '')
    }
  } else {
    const price = `$${(TIER_PRICES.tier1.yearly.amountCents / 100).toFixed(0)} a year`
    rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:22px 40px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.panel}" style="background-color:${C.panel}; border:1px solid ${C.rule};">
<tr><td style="padding:16px 18px; font-family:${SERIF}; font-size:15px; line-height:1.55; color:${C.ink};">
This is the short version. The full recap adds power rankings, pick'ems, league records and milestones, and it keeps your standings and pages up to date all season. Rookie is ${price} for your league.
<div style="padding-top:10px; font-family:${SANS}; font-size:13px;"><a href="${esc(links.pricing)}" style="color:${C.gold}; text-decoration:underline;">See plans</a></div>
</td></tr></table></td></tr>`)
    text.push(`This is the short version. The full recap adds power rankings, pick'ems, league records and milestones. Rookie is ${price} for your league: ${links.pricing}`, '')
  }

  // ── Button + share ──
  rows.push(`<tr><td class="pad" align="center" bgcolor="${C.card}" style="padding:28px 40px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${C.gold}" style="background-color:${C.gold}; border-radius:2px;">
<a href="${esc(links.page)}" style="display:inline-block; padding:13px 28px; font-family:${SANS}; font-size:14px; font-weight:bold; letter-spacing:1px; color:${C.page}; text-decoration:none;">Open the full recap</a>
</td></tr></table>
</td></tr>`)
  rows.push(`<tr><td class="pad" align="center" bgcolor="${C.card}" style="padding:10px 40px 26px; font-family:${SANS}; font-size:13px; line-height:1.6; color:${C.muted};">
Send it to the league:<br><a href="${esc(links.share)}" style="color:${C.gold}; text-decoration:underline; word-break:break-all;">${esc(links.share)}</a>
</td></tr>`)
  text.push(`Open the full recap: ${links.page}`, `Send it to the league: ${links.share}`, '')

  // ── Footer ──
  rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:18px 40px 26px; border-top:1px solid ${C.rule}; font-family:${SANS}; font-size:11px; line-height:1.7; color:${C.foot};">
You're getting this because you run ${esc(f.league.name)} on The Sunday Chronicle. Recaps go to the league's commissioner once a week, after Monday night.<br>
<a href="${esc(links.unsubscribe)}" style="color:${C.foot}; text-decoration:underline;">Stop recap emails</a> · <a href="${esc(links.account)}" style="color:${C.foot}; text-decoration:underline;">Account settings</a> · <a href="${esc(links.newLeague)}" style="color:${C.foot}; text-decoration:underline;">Run another league? Start its book free</a>
</td></tr>`)
  text.push(
    `You're getting this because you run ${f.league.name} on The Sunday Chronicle.`,
    `Stop recap emails: ${links.unsubscribe}`,
    `Account settings: ${links.account}`,
  )

  const preheader = intro.split(/(?<=\.)\s/)[0] ?? intro

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
