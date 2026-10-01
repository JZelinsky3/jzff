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
// The email is the front page of the paper: the headline, the lead story,
// the scoreboard, the best of the record book and next week's headliner. The
// game stories, the standings and the rest are on the page. The words come
// from ./story.ts, so the email and the page say exactly the same thing.

import { TIER_PRICES } from '@/lib/stripe'
import { pts, recapSections, type RecapFacts, type RecapGame } from './facts'
import { bookLine, writeEdition } from './story'

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
  // Where the league's mailing list signup is: the bottom of the page.
  join: string
}

// The commissioner gets it because they run the league; a list member
// because they signed up for it. Only the footer differs.
export type RecapAudience = 'owner' | 'subscriber'

const winnerOf = (g: RecapGame) => (g.winner === 'a' ? g.a : g.b)
const loserOf = (g: RecapGame) => (g.winner === 'a' ? g.b : g.a)

function sectionHead(label: string): string {
  return `<tr><td class="pad" bgcolor="${C.card}" style="padding:26px 40px 8px;">
<div style="font-family:${SANS}; font-size:10px; letter-spacing:3px; text-transform:uppercase; color:${C.gold}; padding-bottom:8px; border-bottom:1px solid ${C.rule};">${esc(label)}</div>
</td></tr>`
}

export function renderRecapEmail(
  f: RecapFacts,
  intro: string,
  subject: string,
  links: RecapEmailLinks,
  audience: RecapAudience = 'owner',
): { html: string; text: string } {
  const show = recapSections(f.tier)
  const rows: string[] = []
  const text: string[] = []

  const weekLabel = f.phase === 'playoffs' ? `Playoffs, week ${f.week}` : `Week ${f.week}`

  const edition = writeEdition(f)
  const { front } = edition

  // ── Masthead ──
  rows.push(`<tr><td class="pad" align="center" bgcolor="${C.card}" style="padding:28px 40px 18px; border-bottom:3px double #a88a4a;">
<div style="font-family:${SANS}; font-size:10px; letter-spacing:3px; text-transform:uppercase; color:${C.muted}; padding-bottom:10px;">The Sunday Chronicle</div>
<div class="hed" style="font-family:${SERIF}; font-size:30px; line-height:1.15; color:${C.ink};">${esc(f.league.name)}</div>
<div style="font-family:${SANS}; font-size:10px; letter-spacing:3px; text-transform:uppercase; color:${C.gold}; padding-top:10px;">${esc(weekLabel)} · ${f.year}</div>
</td></tr>`)

  // ── Front page: headline, deck, the lead story ──
  rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:24px 40px 0;">
<div style="font-family:${SERIF}; font-size:28px; line-height:1.15; color:${C.ink};">${esc(front.headline)}</div>
${front.deck ? `<div style="font-family:${SERIF}; font-style:italic; font-size:17px; line-height:1.45; color:${C.muted}; padding-top:10px;">${esc(front.deck)}</div>` : ''}
<div style="font-family:${SANS}; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:${C.gold}; padding:14px 0 4px; border-bottom:1px solid ${C.rule};">By the Chronicle staff</div>
</td></tr>`)
  for (const para of front.paragraphs) {
    rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:14px 40px 0; font-family:${SERIF}; font-size:16px; line-height:1.6; color:${C.ink};">${esc(para)}</td></tr>`)
  }
  text.push(`${f.league.name}: ${weekLabel}, ${f.year}`, '', front.headline.toUpperCase(), ...(front.deck ? [front.deck] : []), '', ...front.paragraphs.flatMap((p) => [p, '']))

  // ── Final scores ──
  rows.push(sectionHead('Final Scores'))
  text.push('FINAL SCORES')
  const scoreRows = f.games
    .map((g) => {
      const decided = g.winner === 'a' || g.winner === 'b'
      const first = decided ? winnerOf(g) : g.a
      const second = decided ? loserOf(g) : g.b
      const tag = g.kind === 'championship' ? 'Final' : g.leg?.n === 1 ? 'Leg 1 of 2' : g.winner === 'tie' ? 'Tie' : null
      text.push(`${first.name} ${pts(first.score)}, ${second.name} ${pts(second.score)}${tag ? ` (${tag})` : ''}`)
      return `<tr>
<td style="padding:7px 0; font-family:${SERIF}; font-size:15px; color:${C.ink}; border-bottom:1px solid ${C.rule};">${decided ? `<b>${esc(first.name)}</b>` : esc(first.name)}<span style="color:${C.muted};">, </span>${esc(second.name)}${tag ? `<span style="font-family:${SANS}; font-size:10px; letter-spacing:1px; text-transform:uppercase; color:${C.gold};"> &nbsp;${esc(tag)}</span>` : ''}</td>
<td align="right" style="padding:7px 0; font-family:${SANS}; font-size:14px; color:${C.ink}; border-bottom:1px solid ${C.rule}; white-space:nowrap;">${decided ? `<b>${pts(first.score)}</b>` : pts(first.score)}<span style="color:${C.muted};"> - </span>${pts(second.score)}</td>
</tr>`
    })
    .join('')
  rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:2px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${scoreRows}</table></td></tr>`)
  text.push('')

  // ── The record book: only the rows that mean something ──
  const book = show.paid ? (f.book ?? []).filter((r) => r.rank <= 10 || (r.seasonRank === 1 && f.week > 1)).slice(0, 3) : []
  if (book.length) {
    rows.push(sectionHead('From the Record Book'))
    text.push('FROM THE RECORD BOOK')
    const bookRows = book
      .map((r) => {
        const value = r.key === 'closest' || r.key === 'blowout' ? `by ${pts(r.value)}` : pts(r.value)
        const who = r.vs ? `${r.who} ${r.key === 'heartbreak' ? 'vs' : 'over'} ${r.vs}` : r.who
        text.push(`${r.label}: ${who}, ${value}. ${bookLine(r, f)}.`)
        return `<tr><td style="padding:7px 0; border-bottom:1px solid ${C.rule};">
<div style="font-family:${SANS}; font-size:10px; letter-spacing:1px; text-transform:uppercase; color:${C.muted};">${esc(r.label)}</div>
<div style="font-family:${SERIF}; font-size:15px; line-height:1.45; color:${C.ink};">${esc(who)}, <b>${esc(value)}</b></div>
<div style="font-family:${SERIF}; font-style:italic; font-size:14px; line-height:1.45; color:${r.rank <= 10 ? C.gold : C.muted};">${esc(bookLine(r, f))}</div>
</td></tr>`
      })
      .join('')
    rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:2px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${bookRows}</table></td></tr>`)
    text.push('')
  }

  // ── Coming up: the headliner ──
  const head = edition.previews[0]
  if (head && f.next) {
    const g = head.game
    const rec = (s: typeof g.a) => (s.record ? ` (${s.record})` : '')
    const label = g.gotw && show.paid ? 'Game of the week' : 'Headliner'
    rows.push(sectionHead(`Coming Up: Week ${f.next.week}`))
    rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:6px 40px 0;">
<div style="font-family:${SANS}; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:${C.gold};">${label}</div>
<div style="font-family:${SERIF}; font-size:19px; line-height:1.3; color:${C.ink}; padding-top:4px;">${esc(g.a.name)}${esc(rec(g.a))} vs. ${esc(g.b.name)}${esc(rec(g.b))}</div>
<div style="font-family:${SERIF}; font-size:15px; line-height:1.5; color:${C.muted}; padding-top:4px;">${esc(head.note ?? '')}</div>
</td></tr>`)
    text.push(`COMING UP: WEEK ${f.next.week}`, `${label}: ${g.a.name}${rec(g.a)} vs. ${g.b.name}${rec(g.b)}. ${head.note ?? ''}`, '')
  }

  if (!show.paid) {
    const price = `$${(TIER_PRICES.tier1.yearly.amountCents / 100).toFixed(0)} a year`
    const pitch = `This is the short edition. The full paper adds the record book, how teams with this start have finished, a year ago this week, the players behind each result, power rankings and playoff odds, pick'ems and next week's lines. Rookie is ${price} for your league.`
    rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:22px 40px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.panel}" style="background-color:${C.panel}; border:1px solid ${C.rule};">
<tr><td style="padding:16px 18px; font-family:${SERIF}; font-size:15px; line-height:1.55; color:${C.ink};">
${esc(pitch)}
<div style="padding-top:10px; font-family:${SANS}; font-size:13px;"><a href="${esc(links.pricing)}" style="color:${C.gold}; text-decoration:underline;">See plans</a></div>
</td></tr></table></td></tr>`)
    text.push(`${pitch} ${links.pricing}`, '')
  }

  // ── Button + share ──
  rows.push(`<tr><td class="pad" align="center" bgcolor="${C.card}" style="padding:28px 40px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${C.gold}" style="background-color:${C.gold}; border-radius:2px;">
<a href="${esc(links.page)}" style="display:inline-block; padding:13px 28px; font-family:${SANS}; font-size:14px; font-weight:bold; letter-spacing:1px; color:${C.page}; text-decoration:none;">Read the full paper</a>
</td></tr></table>
</td></tr>`)
  rows.push(`<tr><td class="pad" align="center" bgcolor="${C.card}" style="padding:10px 40px 26px; font-family:${SANS}; font-size:13px; line-height:1.6; color:${C.muted};">
A story for every game, the standings and all of next week are on the page.<br>
Send it to the league: <a href="${esc(links.share)}" style="color:${C.gold}; text-decoration:underline; word-break:break-all;">${esc(links.share)}</a>
</td></tr>`)
  text.push(`Read the full paper: ${links.page}`, `Send it to the league: ${links.share}`, '')

  // ── The mailing list, for the commissioner to pass on ──
  if (audience === 'owner') {
    rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:0 40px 24px; font-family:${SANS}; font-size:13px; line-height:1.6; color:${C.muted};">
Want the rest of the league getting this too? Anyone can add their own email at the bottom of the page: <a href="${esc(links.join)}" style="color:${C.gold}; text-decoration:underline;">join the mailing list</a>.
</td></tr>`)
    text.push(`The rest of the league can get this every Tuesday too: ${links.join}`, '')
  }

  // ── Footer ──
  const why =
    audience === 'owner'
      ? `You're getting this because you run ${esc(f.league.name)} on The Sunday Chronicle. Recaps go to the league's commissioner once a week, after Monday night.`
      : `You're getting this because you joined the ${esc(f.league.name)} mailing list on The Sunday Chronicle. It comes every Tuesday morning.`
  const stop = audience === 'owner' ? 'Stop recap emails' : 'Leave the mailing list'
  rows.push(`<tr><td class="pad" bgcolor="${C.card}" style="padding:18px 40px 26px; border-top:1px solid ${C.rule}; font-family:${SANS}; font-size:11px; line-height:1.7; color:${C.foot};">
${why}<br>
<a href="${esc(links.league)}" style="color:${C.foot}; text-decoration:underline;">View the league</a> · <a href="${esc(links.unsubscribe)}" style="color:${C.foot}; text-decoration:underline;">${stop}</a>${
    audience === 'owner' ? ` · <a href="${esc(links.account)}" style="color:${C.foot}; text-decoration:underline;">Account settings</a>` : ''
  } · <a href="${esc(links.newLeague)}" style="color:${C.foot}; text-decoration:underline;">Add another league? Start the book free</a>
</td></tr>`)
  text.push(
    audience === 'owner'
      ? `You're getting this because you run ${f.league.name} on The Sunday Chronicle.`
      : `You're getting this because you joined the ${f.league.name} mailing list on The Sunday Chronicle.`,
    `View the league: ${links.league}`,
    `${stop}: ${links.unsubscribe}`,
    ...(audience === 'owner' ? [`Account settings: ${links.account}`] : []),
  )

  const preheader = front.deck ? `${front.deck}.` : (intro.split(/(?<=\.)\s/)[0] ?? intro)

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

// ── Mailing list confirmation ─────────────────────────────────────────────

// The one email a new list member gets before they confirm. Short, plain,
// one button. It also asks them to add the sender to their contacts: the
// first message from a new sender is the one most likely to be filtered,
// and a contact entry is the strongest "I want this" signal a reader can
// give their mail provider.
export function renderSubscribeConfirmEmail(args: { league: string; confirmUrl: string; from: string }): {
  subject: string
  html: string
  text: string
} {
  const subject = `Confirm: the ${args.league} paper, every Tuesday`
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
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:${C.page};">
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:${C.page}; font-size:1px; line-height:1px;">One click and the ${esc(args.league)} paper comes to you every Tuesday.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page};">
<tr><td align="center" style="padding:24px 10px;">
<table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="width:560px; max-width:560px; background-color:${C.card}; border:1px solid ${C.rule};">
<tr><td class="pad" align="center" bgcolor="${C.card}" style="padding:28px 40px 18px; border-bottom:3px double #a88a4a;">
<div style="font-family:${SANS}; font-size:10px; letter-spacing:3px; text-transform:uppercase; color:${C.muted}; padding-bottom:10px;">The Sunday Chronicle</div>
<div style="font-family:${SERIF}; font-size:26px; line-height:1.2; color:${C.ink};">${esc(args.league)}</div>
</td></tr>
<tr><td class="pad" bgcolor="${C.card}" style="padding:24px 40px 0; font-family:${SERIF}; font-size:16px; line-height:1.6; color:${C.ink};">
Someone, hopefully you, asked for the ${esc(args.league)} weekly paper to come to this address. It lands every Tuesday morning: a story for every game, the standings and what's coming next week.
</td></tr>
<tr><td class="pad" align="center" bgcolor="${C.card}" style="padding:24px 40px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${C.gold}" style="background-color:${C.gold}; border-radius:2px;">
<a href="${esc(args.confirmUrl)}" style="display:inline-block; padding:13px 28px; font-family:${SANS}; font-size:14px; font-weight:bold; letter-spacing:1px; color:${C.page}; text-decoration:none;">Confirm my email</a>
</td></tr></table>
</td></tr>
<tr><td class="pad" bgcolor="${C.card}" style="padding:16px 40px 6px; font-family:${SANS}; font-size:13px; line-height:1.6; color:${C.muted};">
So Tuesday's paper lands in your inbox and not in spam, add <b style="color:${C.ink};">${esc(args.from)}</b> to your contacts. If this email went to spam or promotions, mark it as not spam first.
</td></tr>
<tr><td class="pad" bgcolor="${C.card}" style="padding:14px 40px 26px; font-family:${SANS}; font-size:11px; line-height:1.7; color:${C.foot};">
Didn't ask for this? Ignore it and you won't hear from us again. Nothing is sent until the button above is pressed.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
  const text = [
    `The Sunday Chronicle: ${args.league}`,
    '',
    `Someone, hopefully you, asked for the ${args.league} weekly paper to come to this address. It lands every Tuesday morning.`,
    '',
    `Confirm your email: ${args.confirmUrl}`,
    '',
    `So Tuesday's paper lands in your inbox and not in spam, add ${args.from} to your contacts.`,
    '',
    "Didn't ask for this? Ignore it and you won't hear from us again.",
  ].join('\n')
  return { subject, html, text }
}
