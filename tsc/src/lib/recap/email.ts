// The recap email: HTML and plain-text parts, built from the same facts the
// page renders.
//
// The email's job is to get the league onto the page, not to replace it. So
// it carries the front page only up to the jump ("Continued inside"), the
// scores with each game's headline as a link into its story, a box of quick
// hits that are fun to read in ten seconds, next week's headliner, and an
// index of what else is inside. The game stories, the standings and the
// record book are on the page.
//
// It wears the page's newsprint: cream paper on a tan desk, a red tag flag on
// each section, each section on its own stock (games on the lighter stock,
// quick hits on salmon, coming up on green), Georgia for the type.
//
// Design rules carried over from scripts/emails/launch-notice.html:
//   · Gmail's dark theme inverts lightness but keeps hue. Every colour here
//     is warm or a deliberate hue (salmon, green), so the flip lands on warm
//     brown, rust and pale green rather than blue-grey. Check a change with
//     node scripts/emails/gmail-dark-sim.mjs.
//   · `color-scheme: light only` asks Apple Mail and the clients that listen
//     to leave the one design alone.
//   · Georgia and Arial only. No web fonts, no @import.
//   · No hidden zero-width preheader padding; the preview line is plain words.
//   · Every table carries bgcolor as well as an inline style, for Outlook.

import { TIER_PRICES } from '@/lib/stripe'
import { editionDate, ordinal, pts, recapSections, roman, type RecapFacts, type RecapGame } from './facts'
import { poss, writeEdition } from './story'

const C = {
  desk: '#ddd4bf',
  paper: '#f6f1e4',
  card: '#fffbf2',
  ink: '#1c1915',
  ink2: '#463f35',
  mute: '#776e5f',
  rule: '#cdc2a8',
  red: '#a3302a',
  // The games: the lighter stock.
  games: '#efe8d6',
  gamesRule: '#c9bda1',
  // Quick hits: the standings' salmon.
  salmon: '#f3dfcf',
  salmonCard: '#fbeee3',
  salmonRule: '#d6b49c',
  rust: '#9b3a26',
  // Coming up: matchup-preview green with gold.
  green: '#1d3a2c',
  greenCard: '#234536',
  greenInk: '#f1ead7',
  greenMute: '#a3b2a3',
  greenRule: '#3e5f4e',
  gold: '#d8b45e',
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
const isDecided = (g: RecapGame) => g.winner === 'a' || g.winner === 'b'

// A link into the page: the page URL keeps its utm query, the anchor goes
// after it.
const at = (links: RecapEmailLinks, id: string) => `${links.page}#${id}`

// The lead story up to the jump. The first paragraph, cut at a sentence end
// once it has said enough, so the email reads as the top of the story and
// the rest is a click away.
function leadTeaser(paragraphs: string[]): string {
  const first = paragraphs[0] ?? ''
  const sentences = first.split(/(?<=[.!?])\s+/)
  let out = ''
  for (const s of sentences) {
    out = out ? `${out} ${s}` : s
    // "vs." ends a word, not a sentence.
    if (/\bvs\.$/.test(s)) continue
    if (out.split(/\s+/).length >= 40) break
  }
  return out
}

// ── Pieces ──

function flagHead(tag: string, title: string, o: { ink: string; flag: string; onFlag: string; bg: string }): string {
  return `<tr><td class="pad" bgcolor="${o.bg}" style="background-color:${o.bg}; padding:28px 32px 10px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${o.flag}" style="background-color:${o.flag}; padding:4px 9px 3px; font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${o.onFlag};">${esc(tag)}</td></tr></table>
<div style="font-family:${SERIF}; font-size:26px; line-height:1.15; color:${o.ink}; padding:10px 0 10px; border-bottom:2px solid ${o.ink};">${esc(title)}</div>
</td></tr>`
}

// `names`: who the tile is about, so it can be dropped when the front page
// already told it.
type Tile = { label: string; big: string; line: string; text: string; names?: string[] }

function tileCell(t: Tile, span = false): string {
  return `<td class="col" ${span ? 'colspan="2"' : 'width="50%"'} valign="top" style="padding:6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.salmonCard}" style="background-color:${C.salmonCard}; border:1px solid ${C.salmonRule};"><tr><td style="padding:14px 16px 15px;">
<div style="font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${C.rust};">${esc(t.label)}</div>
<div style="font-family:${SERIF}; font-size:30px; font-weight:bold; line-height:1.1; color:${C.ink}; padding-top:6px;">${esc(t.big)}</div>
<div style="font-family:${SERIF}; font-size:14px; line-height:1.45; color:${C.ink2}; padding-top:5px;">${esc(t.line)}</div>
</td></tr></table>
</td>`
}

// The quick hits: small, true, and fun to read without opening anything.
// Strongest first; the box takes the first six that apply and that the
// front page above hasn't already told (`told` is its headline, deck and
// teaser).
function quickHits(f: RecapFacts, paid: boolean, told: string): Tile[] {
  const out: Tile[] = []
  const n = f.teams.length
  const scored = f.teams.filter((t) => t.result === 'W' || t.result === 'L')

  if (paid && f.star) {
    out.push({
      label: 'Player of the Week',
      big: pts(f.star.points),
      line: `${f.star.player}${f.star.pos ? `, ${f.star.pos}` : ''}, for ${f.star.manager}.`,
      text: `${f.star.player} scored ${pts(f.star.points)} for ${f.star.manager}`,
    })
  }

  const dud = paid ? f.projections?.under?.[0] : null
  if (dud && dud.diff <= -8) {
    out.push({
      label: 'The Dud',
      big: pts(dud.points),
      line: `${dud.player} was projected for ${pts(dud.proj)} in ${poss(dud.manager)} lineup.`,
      text: `${dud.player} scored ${pts(dud.points)} on a ${pts(dud.proj)} projection for ${dud.manager}`,
    })
  }

  // Scored like a contender, lost anyway.
  const hard = scored.filter((t) => t.result === 'L').sort((a, b) => a.weekRank - b.weekRank)[0]
  if (hard && n >= 6 && hard.weekRank <= Math.floor(n / 2)) {
    out.push({
      label: 'Hard Luck',
      big: pts(hard.score),
      line: `${hard.name} had the ${ordinal(hard.weekRank)} best score of the week, beat ${hard.allPlay.w} of ${n - 1} teams on paper, and lost.`,
      text: `${hard.name} scored ${pts(hard.score)}, ${ordinal(hard.weekRank)} best of the week, and lost`,
    })
  }

  // Scored like a basement team, won anyway.
  const lucky = scored.filter((t) => t.result === 'W').sort((a, b) => b.weekRank - a.weekRank)[0]
  if (lucky && n >= 6 && lucky.weekRank > Math.ceil(n / 2)) {
    out.push({
      label: 'Dumb Luck',
      big: pts(lucky.score),
      line: `${lucky.name} had the ${ordinal(lucky.weekRank)} best score of ${n} and still won.`,
      text: `${lucky.name} won with ${pts(lucky.score)}, ${ordinal(lucky.weekRank)} best of ${n}`,
    })
  }

  const close = f.closest
  if (close && isDecided(close) && close.margin < 5) {
    out.push({
      label: 'Photo Finish',
      big: pts(close.margin),
      line: `${winnerOf(close).name} over ${loserOf(close).name}, ${pts(winnerOf(close).score)} to ${pts(loserOf(close).score)}.`,
      text: `${winnerOf(close).name} beat ${loserOf(close).name} by ${pts(close.margin)}`,
    })
  }

  // The biggest pile of points left on the bench. The total only, never a
  // player's name: the best bench player isn't always in the best lineup.
  if (paid) {
    const benches = f.games.flatMap((g) => [
      { side: g.a, lost: g.winner === 'b', margin: g.margin },
      { side: g.b, lost: g.winner === 'a', margin: g.margin },
    ])
    const pine = benches.filter((b) => b.side.left != null).sort((x, y) => y.side.left! - x.side.left!)[0]
    if (pine && pine.side.left! >= 15) {
      const cost = pine.lost && pine.side.left! > pine.margin
      out.push({
        label: 'Left on the Pine',
        big: pts(pine.side.left!),
        line: cost
          ? `${pine.side.name} left ${pts(pine.side.left!)} on the bench and lost by ${pts(pine.margin)}.`
          : `${pine.side.name} left ${pts(pine.side.left!)} on the bench, the most in the league.`,
        text: `${pine.side.name} left ${pts(pine.side.left!)} on the bench${cost ? ` and lost by ${pts(pine.margin)}` : ''}`,
      })
    }
  }

  if (paid && f.pickems) {
    const p = f.pickems
    const best = p.best[0]
    const odds = p.crowd?.match(/(\d+) of (\d+)/)
    if (p.crowd && odds) {
      out.push({ label: 'The Crowd', big: `${odds[1]} of ${odds[2]}`, line: p.crowd, text: p.crowd.replace(/\.$/, '') })
    } else if (best) {
      const tied = p.best.filter((b) => b.right === best.right && b.wrong === best.wrong).map((b) => b.name)
      const who = tied.length > 2 ? `${tied.length} pickers` : tied.join(' and ')
      out.push({
        label: 'Called It',
        big: `${best.right}-${best.wrong}`,
        line: `${who} had the best week in pick'ems.`,
        text: `${who} went ${best.right}-${best.wrong} in pick'ems`,
      })
    }
  }

  const hot = f.streaks.filter((s) => s.kind === 'W' && s.length >= 3).sort((a, b) => b.length - a.length)
  if (hot.length) {
    const len = hot[0].length
    const who = hot.filter((s) => s.length === len).map((s) => s.name)
    out.push({
      label: 'On a Heater',
      big: `W${len}`,
      line: `${who.join(' and ')} ${who.length > 1 ? 'have each' : 'has'} won ${len} straight.`,
      text: `${who.join(' and ')} ${who.length > 1 ? 'have each' : 'has'} won ${len} straight`,
    })
  }
  const cold = f.streaks.filter((s) => s.kind === 'L' && s.length >= 3).sort((a, b) => b.length - a.length)
  if (cold.length) {
    const len = cold[0].length
    const who = cold.filter((s) => s.length === len).map((s) => s.name)
    const names = who.length > 2 ? `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}` : who.join(' and ')
    out.push({
      label: 'Ice Cold',
      big: `L${len}`,
      line: `${names} ${who.length > 1 ? 'have each' : 'has'} lost ${len} straight.`,
      text: `${names} ${who.length > 1 ? 'have each' : 'has'} lost ${len} straight`,
    })
  }

  if (paid && f.weekRecord) {
    const r = f.weekRecord
    out.push({
      label: `Week ${f.week}, All-Time`,
      big: pts(r.value),
      line: r.isNew
        ? `${r.who} just posted the best week ${f.week} score in league history.`
        : `The best week ${f.week} score ever is still ${poss(r.who)}, from ${r.year}.`,
      text: r.isNew ? `${poss(r.who)} ${pts(r.value)} is the best week ${f.week} score in league history` : `best week ${f.week} score ever: ${r.who}, ${pts(r.value)} in ${r.year}`,
    })
  }

  if (f.upset) {
    const u = f.upset
    out.push({
      label: 'Upset',
      big: pts(u.winnerScore),
      line: `${u.winner}, ${u.winnerRecord} coming in, took down ${u.loser} at ${u.loserRecord}.`,
      text: `${u.winner} (${u.winnerRecord}) beat ${u.loser} (${u.loserRecord})`,
      names: [u.winner, u.loser],
    })
  }

  // Already on the front page: the same score, or every name the tile is
  // about (the deck's "Connie hands CAT their first loss" is the upset).
  const said = (t: Tile) => (/\./.test(t.big) && told.includes(t.big)) || (!!t.names && t.names.every((x) => told.includes(x)))
  return out.filter((t) => !said(t)).slice(0, 6)
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
  const volume = `Vol. ${roman(f.history.seasons)}, No. ${f.week}`

  const edition = writeEdition(f)
  const { front } = edition

  // ── Masthead: two ears, the nameplate, the dateline ──
  const ear = (lines: string[], align: 'left' | 'right') =>
    `<td valign="top" align="${align}" style="padding:0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.ink};"><tr><td align="center" style="padding:7px 10px; font-family:${SANS}; font-size:10px; line-height:1.5; letter-spacing:1px; text-transform:uppercase; color:${C.ink};">${lines.join('<br>')}</td></tr></table>
</td>`
  const forecast = f.top && f.low
    ? [`<b style="color:${C.red};">Forecast</b>`, `High ${pts(f.top.score)}`, `Low ${pts(f.low.score)}`]
    : [`<b style="color:${C.red};">Late final</b>`, `${f.games.length} games`, 'All final']
  rows.push(`<tr><td class="pad" bgcolor="${C.paper}" style="background-color:${C.paper}; padding:24px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${ear(forecast, 'left')}
${ear([`<b style="color:${C.red};">${esc(volume)}</b>`, 'Late final', 'Price: one click'], 'right')}
</tr></table>
</td></tr>`)
  rows.push(`<tr><td class="pad" align="center" bgcolor="${C.paper}" style="background-color:${C.paper}; padding:18px 32px 0;">
<div style="font-family:${SANS}; font-size:10px; letter-spacing:4px; text-transform:uppercase; color:${C.mute};">The Sunday Chronicle</div>
<div class="hed" style="font-family:${SERIF}; font-size:38px; font-weight:bold; line-height:1.1; color:${C.ink}; padding-top:8px;">${esc(f.league.name)}</div>
</td></tr>
<tr><td class="pad" bgcolor="${C.paper}" style="background-color:${C.paper}; padding:14px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:3px double ${C.ink}; border-bottom:1px solid ${C.ink};"><tr>
<td style="padding:6px 0; font-family:${SANS}; font-size:10px; letter-spacing:1px; text-transform:uppercase; color:${C.ink};">${esc(editionDate(f.generatedAt))}</td>
<td align="right" style="padding:6px 0; font-family:${SANS}; font-size:10px; letter-spacing:1px; text-transform:uppercase; color:${C.ink};">${esc(weekLabel)}</td>
</tr></table>
</td></tr>`)

  // ── Front page, up to the jump ──
  const teaser = leadTeaser(front.paragraphs)
  rows.push(`<tr><td class="pad" bgcolor="${C.paper}" style="background-color:${C.paper}; padding:22px 32px 30px;">
<a href="${esc(links.page)}" style="text-decoration:none; color:${C.ink};"><div class="big" style="font-family:${SERIF}; font-size:32px; font-weight:bold; line-height:1.12; color:${C.ink};">${esc(front.headline)}</div></a>
${front.deck ? `<div style="font-family:${SERIF}; font-style:italic; font-size:18px; line-height:1.4; color:${C.ink2}; padding-top:10px;">${esc(front.deck)}</div>` : ''}
<div style="font-family:${SANS}; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:${C.mute}; padding:14px 0 12px; border-bottom:1px solid ${C.rule};">By the Chronicle staff</div>
<div style="font-family:${SERIF}; font-size:17px; line-height:1.6; color:${C.ink}; padding-top:14px;">${esc(teaser)}</div>
<div style="padding-top:12px; font-family:${SANS}; font-size:11px; font-weight:bold; letter-spacing:2px; text-transform:uppercase;"><a href="${esc(links.page)}" style="color:${C.red}; text-decoration:none;">Continued inside</a></div>
</td></tr>`)
  text.push(
    `THE SUNDAY CHRONICLE`,
    `${f.league.name}: ${weekLabel}, ${f.year}`,
    '',
    front.headline.toUpperCase(),
    ...(front.deck ? [front.deck] : []),
    '',
    teaser,
    `Continued inside: ${links.page}`,
    '',
  )

  // ── Final scores, each with its story's headline ──
  rows.push(flagHead('Results', 'Final Scores', { ink: C.ink, flag: C.red, onFlag: '#ffffff', bg: C.games }))
  text.push('FINAL SCORES')
  const storyOf = new Map(edition.stories.map((s) => [s.game, s]))
  const scoreRows = f.games
    .map((g) => {
      const decided = isDecided(g)
      const first = decided ? winnerOf(g) : g.a
      const second = decided ? loserOf(g) : g.b
      const tag = g.kind === 'championship' ? 'Final' : g.leg?.n === 1 ? 'Leg 1 of 2' : g.winner === 'tie' ? 'Tie' : null
      const story = storyOf.get(g)
      text.push(`${first.name} ${pts(first.score)}, ${second.name} ${pts(second.score)}${tag ? ` (${tag})` : ''}`, ...(story ? [`  ${story.headline}`] : []))
      return `<tr><td style="padding:0 0 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="background-color:${C.card}; border:1px solid ${C.gamesRule};"><tr><td style="padding:12px 14px 13px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="font-family:${SERIF}; font-size:16px; line-height:1.4; color:${C.ink};">${decided ? `<b>${esc(first.name)}</b>` : esc(first.name)}</td><td align="right" style="font-family:${SANS}; font-size:15px; color:${C.ink}; white-space:nowrap;">${decided ? `<b>${pts(first.score)}</b>` : pts(first.score)}</td></tr>
<tr><td style="font-family:${SERIF}; font-size:16px; line-height:1.4; color:${C.mute};">${esc(second.name)}${tag ? `<span style="font-family:${SANS}; font-size:10px; letter-spacing:1px; text-transform:uppercase; color:${C.red};"> &nbsp;${esc(tag)}</span>` : ''}</td><td align="right" style="font-family:${SANS}; font-size:15px; color:${C.mute}; white-space:nowrap;">${pts(second.score)}</td></tr>
</table>
${story ? `<div style="padding-top:8px; margin-top:8px; border-top:1px dotted ${C.gamesRule}; font-family:${SERIF}; font-style:italic; font-size:15px; line-height:1.4;"><a href="${esc(at(links, story.anchor))}" style="color:${C.red}; text-decoration:none;">${esc(story.headline)}</a></div>` : ''}
</td></tr></table>
</td></tr>`
    })
    .join('')
  rows.push(`<tr><td class="pad" bgcolor="${C.games}" style="background-color:${C.games}; padding:6px 32px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${scoreRows}</table></td></tr>`)
  text.push('')

  // ── Quick hits ──
  const hits = quickHits(f, show.paid, [front.headline, front.deck ?? '', teaser].join(' '))
  if (hits.length >= 2) {
    rows.push(flagHead('Quick hits', 'Odds and Ends', { ink: C.ink, flag: C.rust, onFlag: '#ffffff', bg: C.salmon }))
    const cells: string[] = []
    for (let i = 0; i < hits.length; i += 2) {
      const pair = hits.slice(i, i + 2)
      cells.push(`<tr>${pair.length === 2 ? pair.map((t) => tileCell(t)).join('') : tileCell(pair[0], true)}</tr>`)
    }
    rows.push(`<tr><td class="pad tiles" bgcolor="${C.salmon}" style="background-color:${C.salmon}; padding:6px 26px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells.join('')}</table></td></tr>`)
    text.push('ODDS AND ENDS', ...hits.map((t) => `${t.label}: ${t.text}.`), '')
  }

  // ── Coming up: the headliner, the milestones, the pick'ems lock ──
  const head = edition.previews[0]
  if (head && f.next) {
    const g = head.game
    const rec = (s: typeof g.a) => (s.record ? ` (${s.record})` : '')
    const label = g.gotw && show.paid ? 'Game of the week' : 'Headliner'
    const notes = show.paid ? (f.next.milestones ?? []) : []
    const lock =
      show.paid && f.next.picksLockAt
        ? new Date(f.next.picksLockAt).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
        : null
    const pickemsUrl = `${links.league.split('?')[0]}live/pickems/`
    rows.push(flagHead(`Week ${f.next.week}`, 'Coming Up', { ink: C.greenInk, flag: C.greenInk, onFlag: C.green, bg: C.green }))
    rows.push(`<tr><td class="pad" bgcolor="${C.green}" style="background-color:${C.green}; padding:6px 32px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.greenCard}" style="background-color:${C.greenCard}; border:1px solid ${C.greenRule};"><tr><td style="padding:16px 18px;">
<div style="font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${C.gold};">${label}</div>
<div style="font-family:${SERIF}; font-size:21px; line-height:1.3; color:${C.greenInk}; padding-top:6px;">${esc(g.a.name)}<span style="color:${C.greenMute};">${esc(rec(g.a))}</span> vs. ${esc(g.b.name)}<span style="color:${C.greenMute};">${esc(rec(g.b))}</span></div>
${head.note ? `<div style="font-family:${SERIF}; font-style:italic; font-size:15px; line-height:1.5; color:${C.greenMute}; padding-top:6px;">${esc(head.note)}</div>` : ''}
</td></tr></table>
${notes.map((m) => `<div style="font-family:${SERIF}; font-size:15px; line-height:1.5; color:${C.greenInk}; padding-top:12px;"><span style="color:${C.gold};">&#9733;</span> ${esc(m)}</div>`).join('')}
${lock ? `<div style="padding-top:14px; font-family:${SANS}; font-size:12px; font-weight:bold; letter-spacing:1px; text-transform:uppercase;"><a href="${esc(pickemsUrl)}" style="color:${C.greenInk}; text-decoration:underline;">Make your picks before ${esc(lock)} ET</a></div>` : ''}
</td></tr>`)
    text.push(
      `COMING UP: WEEK ${f.next.week}`,
      `${label}: ${g.a.name}${rec(g.a)} vs. ${g.b.name}${rec(g.b)}. ${head.note ?? ''}`,
      ...notes,
      ...(lock ? [`Make your picks before ${lock} ET: ${pickemsUrl}`] : []),
      '',
    )
  }

  // ── Inside today's paper: what the click gets you ──
  const book = show.paid ? (f.book ?? []) : []
  const hasBook = !!book.length || (show.paid && (!!f.weekRecord || !!f.milestones?.length))
  const n = f.games.length
  const inside: { id: string; title: string; note: string }[] = [
    { id: 'games', title: 'The Games', note: n === 1 ? 'The story of the game' : `A story for all ${n} games` },
    ...(f.standings?.length
      ? [{ id: 'standings', title: 'Standings', note: show.paid && f.standings.some((s) => s.odds != null) ? 'Every team, with playoff odds' : 'Every team, top to bottom' }]
      : []),
    ...(hasBook ? [{ id: 'book', title: 'The Record Book', note: book.length ? `${book.length} ${book.length === 1 ? 'entry' : 'entries'} from this week` : 'This week against all of league history' }] : []),
    ...(show.paid && f.totals?.length ? [{ id: 'season', title: 'The Season So Far', note: 'Running totals against every season' }] : []),
    ...(show.paid && f.projections ? [{ id: 'projections', title: 'Over and Under', note: "Who beat their projection, and who didn't" }] : []),
    ...(show.paid && f.pickems ? [{ id: 'pickems', title: 'Who Called It', note: "Pick'ems, the week and the season" }] : []),
    ...(show.veteran && (f.trades?.length || f.verdicts?.length) ? [{ id: 'trades', title: 'Trades', note: 'Off the wire, graded' }] : []),
    ...(edition.previews.length ? [{ id: 'next', title: `Week ${f.next!.week}`, note: `All ${edition.previews.length} games previewed` }] : []),
  ]
  const insideRows = inside
    .map(
      (x) => `<tr>
<td style="padding:9px 0; border-bottom:1px dotted ${C.mute}; font-family:${SERIF}; font-size:16px; font-weight:bold;"><a href="${esc(at(links, x.id))}" style="color:${C.ink}; text-decoration:none;">${esc(x.title)}</a></td>
<td align="right" style="padding:9px 0 9px 12px; border-bottom:1px dotted ${C.mute}; font-family:${SERIF}; font-style:italic; font-size:14px; color:${C.mute};">${esc(x.note)}</td>
</tr>`,
    )
    .join('')
  rows.push(`<tr><td class="pad" bgcolor="${C.paper}" style="background-color:${C.paper}; padding:30px 32px 6px;">
<div style="font-family:${SANS}; font-size:11px; font-weight:bold; letter-spacing:3px; text-transform:uppercase; color:${C.ink}; padding-bottom:6px; border-bottom:2px solid ${C.ink};">Inside Today's Paper</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${insideRows}</table>
</td></tr>`)
  text.push("INSIDE TODAY'S PAPER", ...inside.map((x) => `${x.title}: ${x.note}`), '')

  // ── The button ──
  rows.push(`<tr><td class="pad" align="center" bgcolor="${C.paper}" style="background-color:${C.paper}; padding:24px 32px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${C.red}" style="background-color:${C.red}; border:2px solid ${C.ink};">
<a href="${esc(links.page)}" style="display:inline-block; padding:14px 30px; font-family:${SANS}; font-size:14px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:#ffffff; text-decoration:none;">Read the full paper</a>
</td></tr></table>
</td></tr>
<tr><td class="pad" align="center" bgcolor="${C.paper}" style="background-color:${C.paper}; padding:8px 32px 26px; font-family:${SANS}; font-size:13px; line-height:1.6; color:${C.mute};">
<a href="${esc(links.share)}" style="color:${C.red}; text-decoration:underline;">Send it to the league chat</a>
</td></tr>`)
  text.push(`Read the full paper: ${links.page}`, `Send it to the league: ${links.share}`, '')

  if (!show.paid) {
    const price = `$${(TIER_PRICES.tier1.yearly.amountCents / 100).toFixed(0)} a year`
    const pitch = `This is the short edition. The full paper adds the record book, how teams with this start have finished, a year ago this week, the players behind each result, power rankings and playoff odds, pick'ems and next week's lines. Rookie is ${price} for your league.`
    rows.push(`<tr><td class="pad" bgcolor="${C.paper}" style="background-color:${C.paper}; padding:0 32px 26px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="background-color:${C.card}; border:2px dashed ${C.ink};">
<tr><td style="padding:16px 18px; font-family:${SERIF}; font-size:15px; line-height:1.55; color:${C.ink};">
<div style="font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${C.red}; padding-bottom:6px;">Clip and save</div>
${esc(pitch)}
<div style="padding-top:10px; font-family:${SANS}; font-size:13px; font-weight:bold;"><a href="${esc(links.pricing)}" style="color:${C.red}; text-decoration:underline;">See plans</a></div>
</td></tr></table></td></tr>`)
    text.push(`${pitch} ${links.pricing}`, '')
  }

  // ── The mailing list, for the commissioner to pass on ──
  if (audience === 'owner') {
    rows.push(`<tr><td class="pad" bgcolor="${C.paper}" style="background-color:${C.paper}; padding:0 32px 24px; font-family:${SANS}; font-size:13px; line-height:1.6; color:${C.ink2};">
Want the rest of the league getting this too? Anyone can add their own email at the bottom of the page: <a href="${esc(links.join)}" style="color:${C.red}; text-decoration:underline;">join the mailing list</a>.
</td></tr>`)
    text.push(`The rest of the league can get this every Tuesday too: ${links.join}`, '')
  }

  // ── Footer ──
  const why =
    audience === 'owner'
      ? `You're getting this because you run ${esc(f.league.name)} on The Sunday Chronicle. Recaps go to the league's commissioner once a week, after Monday night.`
      : `You're getting this because you joined the ${esc(f.league.name)} mailing list on The Sunday Chronicle. It comes every Tuesday morning.`
  const stop = audience === 'owner' ? 'Stop recap emails' : 'Leave the mailing list'
  rows.push(`<tr><td class="pad" bgcolor="${C.paper}" style="background-color:${C.paper}; padding:18px 32px 26px; border-top:3px double ${C.ink}; font-family:${SANS}; font-size:11px; line-height:1.7; color:${C.mute};">
${why}<br>
<a href="${esc(links.league)}" style="color:${C.mute}; text-decoration:underline;">View the league</a> · <a href="${esc(links.unsubscribe)}" style="color:${C.mute}; text-decoration:underline;">${stop}</a>${
    audience === 'owner' ? ` · <a href="${esc(links.account)}" style="color:${C.mute}; text-decoration:underline;">Account settings</a>` : ''
  } · <a href="${esc(links.newLeague)}" style="color:${C.mute}; text-decoration:underline;">Add another league? Start the book free</a>
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
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(subject)}</title>
<style>
  :root { color-scheme: light only; supported-color-schemes: light only; }
  @media only screen and (max-width: 620px) {
    .wrap { width: 100% !important; }
    .pad  { padding-left: 18px !important; padding-right: 18px !important; }
    .tiles { padding-left: 12px !important; padding-right: 12px !important; }
    .col  { display: block !important; width: 100% !important; box-sizing: border-box; }
    .hed  { font-size: 30px !important; }
    .big  { font-size: 27px !important; }
  }
  a { text-decoration: none; }
</style>
</head>
<body style="margin:0; padding:0; background-color:${C.desk}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:${C.desk}; font-size:1px; line-height:1px;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.desk}" style="background-color:${C.desk};">
<tr><td align="center" style="padding:24px 8px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="width:600px; max-width:600px; background-color:${C.paper}; border:1px solid ${C.rule};">
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
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(subject)}</title>
<style>
  @media only screen and (max-width: 620px) {
    .wrap { width: 100% !important; }
    .pad  { padding-left: 20px !important; padding-right: 20px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:${C.desk};">
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:${C.desk}; font-size:1px; line-height:1px;">One click and the ${esc(args.league)} paper comes to you every Tuesday.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.desk}" style="background-color:${C.desk};">
<tr><td align="center" style="padding:24px 10px;">
<table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="width:560px; max-width:560px; background-color:${C.paper}; border:1px solid ${C.rule};">
<tr><td class="pad" align="center" bgcolor="${C.paper}" style="padding:28px 40px 0;">
<div style="font-family:${SANS}; font-size:10px; letter-spacing:4px; text-transform:uppercase; color:${C.mute}; padding-bottom:8px;">The Sunday Chronicle</div>
<div style="font-family:${SERIF}; font-size:30px; font-weight:bold; line-height:1.15; color:${C.ink}; padding-bottom:14px; border-bottom:3px double ${C.ink};">${esc(args.league)}</div>
</td></tr>
<tr><td class="pad" bgcolor="${C.paper}" style="padding:22px 40px 0; font-family:${SERIF}; font-size:16px; line-height:1.6; color:${C.ink};">
Someone, hopefully you, asked for the ${esc(args.league)} weekly paper to come to this address. It lands every Tuesday morning: a story for every game, the standings and what's coming next week.
</td></tr>
<tr><td class="pad" align="center" bgcolor="${C.paper}" style="padding:24px 40px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${C.red}" style="background-color:${C.red}; border:2px solid ${C.ink};">
<a href="${esc(args.confirmUrl)}" style="display:inline-block; padding:13px 28px; font-family:${SANS}; font-size:14px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:#ffffff; text-decoration:none;">Confirm my email</a>
</td></tr></table>
</td></tr>
<tr><td class="pad" bgcolor="${C.paper}" style="padding:16px 40px 6px; font-family:${SANS}; font-size:13px; line-height:1.6; color:${C.ink2};">
So Tuesday's paper lands in your inbox and not in spam, add <b style="color:${C.ink};">${esc(args.from)}</b> to your contacts. If this email went to spam or promotions, mark it as not spam first.
</td></tr>
<tr><td class="pad" bgcolor="${C.paper}" style="padding:14px 40px 26px; font-family:${SANS}; font-size:11px; line-height:1.7; color:${C.mute};">
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
