// The Progress Report email: its own send, on the Thursday after a report
// week (./run.ts), not a block in the Tuesday recap.
//
// A short read that still carries the report: the whole race with odds and
// the change since the last report, next week's biggest game (or, late in
// the season, what every team still in it needs), the honor roll, a few
// superlatives and every manager's grades on one sheet. The comments, the
// subject notes and the sparklines are on the page.
//
// It wears the page's school report card: blue-grey card stock, navy ink,
// grades in red pen, the race on a navy board. Mail rules as the recap
// email (lib/recap/email.ts): Georgia and Arial only, every table carries
// bgcolor for Outlook, `color-scheme: light only`. Gmail's dark theme flips
// lightness and keeps hue, so the stock lands on dark slate and the board
// on pale blue, both still the report's blues; check a change with
// node scripts/emails/gmail-dark-sim.mjs.

import { TIER_PRICES } from '@/lib/stripe'
import { needsLabel, needsVerdict, raceGroups, type ReportTeam, type ReportView } from './build'
import { divisionLabels } from '@/lib/divisionLabels'

const C = {
  desk: '#cdd6de',
  stock: '#e3e9ed',
  sheet: '#f6f8fa',
  rule: '#bccbd6',
  ink: '#16243a',
  ink2: '#3f4f66',
  mute: '#6c7a8c',
  red: '#c23a2c',
  board: '#13233a',
  boardCard: '#1b2f4c',
  boardRule: '#33496a',
  chalk: '#e8eef4',
  chalkMute: '#aebdcd',
  bar: '#8db6dc',
  barTrack: '#24395a',
  up: '#6cc59a',
  down: '#f08a78',
}
const SERIF = "Georgia,'Times New Roman',serif"
const SANS = 'Arial,Helvetica,sans-serif'

export type ReportEmailLinks = {
  page: string
  share: string
  unsubscribe: string
  account: string
  pricing: string
  league: string
  // The league's mailing list signup, at the bottom of the recap page.
  join: string
}

export type ReportAudience = 'owner' | 'subscriber'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// A conference badge after a name, in the recap's letters and colours.
const DIV_COLORS = ['#2c5a7e', '#b4472a', '#2f7a4a', '#6b3f8a']
function badge(v: ReportView, t: ReportTeam): string {
  if (t.div == null || !v.divisions) return ''
  const label = divisionLabels(v.divisions)[t.div]
  if (!label) return ''
  return `<span style="display:inline-block; margin-left:7px; padding:1px 5px; background-color:${DIV_COLORS[t.div % 4]}; color:#ffffff; font-family:${SANS}; font-size:10px; font-weight:bold; line-height:1.4; border-radius:3px; vertical-align:middle;">${esc(label)}</span>`
}

function odds(n: number): string {
  if (n >= 99.95) return '100%'
  if (n > 99) return '>99%'
  if (n > 0 && n < 1) return '<1%'
  return `${Math.round(n)}%`
}

const record = (t: ReportTeam) => `${t.w}-${t.l}${t.t ? `-${t.t}` : ''}`
const changeOf = (t: ReportTeam) => (t.before == null ? null : Math.round(t.odds - t.before))
const article = (letter: string) => (/^[AF]/.test(letter) ? 'an' : 'a')

export function reportTitle(v: ReportView): string {
  return v.final ? 'Final Report Card' : 'Progress Report'
}

function sinceLabel(v: ReportView): string {
  return v.compareIsEdition ? `the week ${v.compareWeek} report` : `week ${v.compareWeek ?? 1}`
}

function byGpa(v: ReportView): ReportTeam[] {
  return [...v.teams].sort((a, b) => b.gpa - a.gpa || b.odds - a.odds)
}

function biggestMover(v: ReportView): { t: ReportTeam; d: number } | null {
  const moves = v.teams.flatMap((t) => {
    const d = changeOf(t)
    return d == null ? [] : [{ t, d }]
  })
  const top = moves.sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0]
  return top && Math.abs(top.d) >= 10 ? top : null
}

// Still racing for the spots nobody has clinched.
function openRace(v: ReportView) {
  const needers = v.teams.filter((t) => t.needs)
  const open = v.playoffTeams - v.teams.filter((t) => t.clinched).length
  return { needers, open }
}

// ── Subject and lead ─────────────────────────────────────────────────────

export function reportSubject(v: ReportView, paid: boolean): string {
  const head = `${reportTitle(v)} in ${v.league.name}`
  if (!paid) {
    const top = byGpa(v)[0]
    return top ? `${head}: ${top.name} tops the class` : head
  }
  const { needers, open } = openRace(v)
  if (needers.length > open && open > 0) return `${head}: ${needers.length} teams for ${open} ${open === 1 ? 'spot' : 'spots'}`
  const mover = biggestMover(v)
  if (mover && Math.abs(mover.d) >= 15) return `${head}: ${mover.t.name} ${mover.d > 0 ? 'up' : 'down'} ${Math.abs(mover.d)} points`
  const leader = v.teams[0]
  return leader ? `${head}: ${leader.name} leads at ${odds(leader.odds)}` : head
}

export function reportLead(v: ReportView, paid: boolean): string {
  const out: string[] = []
  if (!paid) {
    const top = byGpa(v)[0]
    const first = [...v.teams].sort((a, b) => a.seed - b.seed)[0]
    out.push(`Grades for all ${v.teams.length} managers through week ${v.week}.`)
    if (top) out.push(`${top.name} leads the class with ${article(top.grades.overall.letter)} ${top.grades.overall.letter}${first && first !== top ? `, and ${first.name} (${record(first)}) leads the standings` : ''}.`)
    return out.join(' ')
  }
  const leader = v.teams[0]
  if (leader) {
    out.push(leader.clinched ? `${leader.name} (${record(leader)}) has clinched a playoff spot.` : `${leader.name} (${record(leader)}) leads the race at ${odds(leader.odds)}.`)
  }
  const mover = biggestMover(v)
  if (mover && mover.t !== leader) {
    out.push(`${mover.t.name} is ${mover.d > 0 ? 'up' : 'down'} ${Math.abs(mover.d)} points since ${sinceLabel(v)}, to ${odds(mover.t.odds)}.`)
  }
  const { needers, open } = openRace(v)
  if (needers.length && open > 0) {
    out.push(`${needers.length} ${needers.length === 1 ? 'team is' : 'teams are'} still playing for ${open} ${open === 1 ? 'spot' : 'spots'} with ${v.left === 1 ? 'one week' : `${v.left} weeks`} left.`)
  } else {
    // The race for the last spot, when it's close: per conference when each
    // conference sends its own top N, the closest of them.
    let best: { a: ReportTeam; b: ReportTeam; name: string | null; gap: number } | null = null
    for (const g of raceGroups(v).groups) {
      const a = g.teams[g.spots - 1]
      const b = g.teams[g.spots]
      if (!a || !b || a.odds > 80 || b.odds < 20) continue
      const gap = a.odds - b.odds
      if (!best || gap < best.gap) best = { a, b, name: g.name, gap }
    }
    if (best) out.push(`The last ${best.name ? `${best.name} spot` : 'spot'} is between ${best.a.name} at ${odds(best.a.odds)} and ${best.b.name} at ${odds(best.b.odds)}.`)
  }
  return out.join(' ')
}

// ── Pieces ───────────────────────────────────────────────────────────────

function flagHead(tag: string, title: string, o: { ink: string; flag: string; onFlag: string; bg: string }): string {
  return `<tr><td class="pad" bgcolor="${o.bg}" style="background-color:${o.bg}; padding:24px 32px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${o.flag}" style="background-color:${o.flag}; padding:3px 8px 2px; font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${o.onFlag};">${esc(tag)}</td></tr></table>
<div style="font-family:${SERIF}; font-size:24px; line-height:1.15; color:${o.ink}; padding:7px 0 7px; border-bottom:2px solid ${o.ink};">${esc(title)}</div>
</td></tr>`
}

const label = (s: string, color: string) =>
  `<div style="font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${color}; padding-bottom:4px;">${esc(s)}</div>`

// The dashed playoff line across the race.
function cutLine(text: string): string {
  return `<tr><td colspan="4" style="padding:6px 0 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="45%" style="border-top:1px dashed ${C.bar}; font-size:1px; line-height:1px;">&nbsp;</td>
<td align="center" style="padding:0 8px; font-family:${SANS}; font-size:9px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${C.bar}; white-space:nowrap;">${esc(text)}</td>
<td width="45%" style="border-top:1px dashed ${C.bar}; font-size:1px; line-height:1px;">&nbsp;</td>
</tr></table>
</td></tr>`
}

// `badged` is false on a conference's own table, whose head already says it.
function raceRowPaid(v: ReportView, t: ReportTeam, first: boolean, badged: boolean): string {
  const w = Math.max(2, Math.min(100, Math.round(t.odds)))
  const d = changeOf(t)
  const change =
    d == null || d === 0
      ? `<span style="color:${C.chalkMute};">${d == null ? '' : '0'}</span>`
      : `<span style="color:${d > 0 ? C.up : C.down};">${d > 0 ? '&#9650;' : '&#9660;'}&nbsp;${Math.abs(d)}</span>`
  const tag = t.clinched ? ` &nbsp;<b style="color:${C.up};">CLINCHED</b>` : t.eliminated ? ` &nbsp;<b style="color:${C.chalkMute};">OUT</b>` : ''
  const top = first ? '' : ` border-top:1px solid ${C.boardRule};`
  return `<tr>
<td style="padding:8px 0;${top} font-family:${SERIF}; font-size:15px; line-height:1.2; color:${C.chalk}; word-break:break-word;">${esc(t.name)}${badged ? badge(v, t) : ''}<br><span style="font-family:${SANS}; font-size:11px; color:${C.chalkMute};">${esc(record(t))} &middot; seed ${t.seed}${tag}</span></td>
<td width="38%" style="padding:8px 10px;${top}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.barTrack}" style="background-color:${C.barTrack};"><tr><td width="${w}%" bgcolor="${C.bar}" style="background-color:${C.bar}; height:9px; line-height:9px; font-size:1px;">&nbsp;</td>${w < 100 ? `<td style="height:9px; line-height:9px; font-size:1px;">&nbsp;</td>` : ''}</tr></table>
</td>
<td align="right" style="padding:8px 0;${top} font-family:${SANS}; font-size:14px; font-weight:bold; color:${C.chalk}; white-space:nowrap;">${odds(t.odds)}</td>
<td align="right" style="padding:8px 0 8px 10px;${top} font-family:${SANS}; font-size:12px; font-weight:bold; white-space:nowrap;">${change}</td>
</tr>`
}

function raceRowFree(v: ReportView, t: ReportTeam, first: boolean, badged: boolean): string {
  const top = first ? '' : ` border-top:1px solid ${C.boardRule};`
  return `<tr>
<td style="padding:8px 0;${top} font-family:${SANS}; font-size:12px; font-weight:bold; color:${C.chalkMute}; width:26px;">${t.seed}</td>
<td colspan="2" style="padding:8px 0;${top} font-family:${SERIF}; font-size:15px; line-height:1.2; color:${C.chalk}; word-break:break-word;">${esc(t.name)}${badged ? badge(v, t) : ''}</td>
<td align="right" style="padding:8px 0;${top} font-family:${SANS}; font-size:13px; color:${C.chalk}; white-space:nowrap;"><b>${esc(record(t))}</b> &nbsp;<span style="color:${C.chalkMute};">${t.pf.toFixed(1)} pts</span></td>
</tr>`
}

// A superlative tile on the card stock.
function tile(t: { label: string; big: string; line: string }, span = false): string {
  return `<td class="col" ${span ? 'colspan="2"' : 'width="50%"'} valign="top" style="padding:3px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.sheet}" style="background-color:${C.sheet}; border:1px solid ${C.rule};"><tr><td style="padding:10px 12px 11px;">
${label(t.label, C.red)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right:10px; font-family:${SERIF}; font-size:21px; font-weight:bold; line-height:1.1; color:${C.ink}; white-space:nowrap;">${esc(t.big)}</td>
<td valign="middle" width="100%" style="font-family:${SERIF}; font-size:13px; line-height:1.35; color:${C.ink2};">${esc(t.line)}</td>
</tr></table>
</td></tr></table>
</td>`
}

function superlatives(v: ReportView): { label: string; big: string; line: string; text: string }[] {
  const out: { label: string; big: string; line: string; text: string }[] = []
  const first = <T,>(list: T[], key: (x: T) => number) => [...list].sort((a, b) => key(b) - key(a))[0]
  const scorer = first(v.teams, (t) => t.ppg)
  if (scorer) out.push({ label: 'Top scorer', big: scorer.ppg.toFixed(1), line: `points a week for ${scorer.name}, the most in the league.`, text: `${scorer.name}, ${scorer.ppg.toFixed(1)} a week` })
  const setters = v.teams.filter((t) => t.lineup)
  const setter = first(setters, (t) => t.lineup!.pct)
  if (setter) {
    const p = `${Math.round(setter.lineup!.pct * 100)}%`
    out.push({ label: 'Best lineups', big: p, line: `of the possible points started by ${setter.name}, the best in the league.`, text: `${setter.name}, ${p} of the possible points started` })
  }
  const wire = first(v.teams.filter((t) => t.moves && t.moves.pts > 0), (t) => t.moves!.pts)
  if (wire) {
    const led = wire.moves!.best ? `, led by ${wire.moves!.best.name}` : ''
    out.push({ label: 'Best pickups', big: String(Math.round(wire.moves!.pts)), line: `starter points from players ${wire.name} added${led}.`, text: `${wire.name}, ${Math.round(wire.moves!.pts)} starter points from adds${led}` })
  }
  const unlucky = first(v.teams.filter((t) => t.luck <= -0.8), (t) => -t.luck)
  if (unlucky) {
    out.push({
      label: 'Unluckiest',
      big: unlucky.expectedWins.toFixed(1),
      line: `wins' worth of scores for ${unlucky.name}, who has ${unlucky.w}.`,
      text: `${unlucky.name}, scores worth ${unlucky.expectedWins.toFixed(1)} wins with ${unlucky.w}`,
    })
  }
  return out.slice(0, 4)
}

// ── The email ────────────────────────────────────────────────────────────

export function renderReportEmail(
  v: ReportView,
  subject: string,
  links: ReportEmailLinks,
  audience: ReportAudience,
  paid: boolean,
): { html: string; text: string } {
  const rows: string[] = []
  const text: string[] = []
  const title = reportTitle(v)
  const lead = reportLead(v, paid)
  const byId = new Map(v.teams.map((t) => [t.managerId, t]))

  // ── Letterhead: centred like the recap's nameplate. The site, the
  // report's name big, the league under it, then a dateline band. ──
  const band = `font-family:${SANS}; font-size:10px; letter-spacing:1px; text-transform:uppercase; color:${C.ink};`
  rows.push(`<tr><td class="pad" align="center" bgcolor="${C.stock}" style="background-color:${C.stock}; padding:30px 32px 0;">
<div style="font-family:${SANS}; font-size:10px; letter-spacing:4px; text-transform:uppercase; color:${C.mute};">The Sunday Chronicle</div>
<div class="hed" style="font-family:${SERIF}; font-size:42px; line-height:1.05; color:${C.ink}; padding-top:10px;">${esc(title)}</div>
<div style="font-family:${SERIF}; font-style:italic; font-size:18px; line-height:1.3; color:${C.ink2}; padding-top:8px;">${esc(v.league.name)} &middot; ${v.year} season</div>
</td></tr>
<tr><td class="pad" bgcolor="${C.stock}" style="background-color:${C.stock}; padding:18px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:3px double ${C.ink}; border-bottom:1px solid ${C.ink};"><tr>
<td style="padding:7px 0; ${band} white-space:nowrap;"><b style="color:${C.red};">No. ${v.edition} of ${v.editions.length}</b></td>
<td class="dl" align="center" style="padding:7px 8px; ${band}">Weeks 1 to ${v.week}</td>
<td align="right" style="padding:7px 0; ${band} white-space:nowrap;">${v.nextEdition ? `Next: after week ${v.nextEdition}` : 'Final report'}</td>
</tr></table>
</td></tr>
<tr><td class="pad" bgcolor="${C.stock}" style="background-color:${C.stock}; padding:20px 32px 26px;">
<div style="font-family:${SERIF}; font-size:18px; line-height:1.55; color:${C.ink};">${esc(lead)}</div>
</td></tr>`)
  text.push(
    'THE SUNDAY CHRONICLE',
    `${v.league.name}, ${v.year}: ${title}, no. ${v.edition} of ${v.editions.length}, weeks 1 to ${v.week}`,
    '',
    lead,
    '',
  )

  // ── The race ──
  rows.push(flagHead(paid ? `Through week ${v.week}` : 'Standings', 'The Playoff Race', { ink: C.chalk, flag: C.red, onFlag: '#ffffff', bg: C.board }))
  const race = paid ? v.teams : [...v.teams].sort((a, b) => a.seed - b.seed)
  // One table, or one per conference when each sends its own top N.
  const { groups, wildcards } = raceGroups(v, race)
  const lineText = (g: (typeof groups)[number]) => (g.name ? `Top ${g.spots} in the ${g.name}` : paid ? `Top ${g.spots} by odds` : 'Playoff line')
  const raceRows = groups
    .map((g, gi) => {
      const head = g.name
        ? `<tr><td colspan="4" style="padding:${gi ? 22 : 4}px 0 6px; border-bottom:1px solid ${C.chalkMute};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:${SERIF}; font-size:19px; color:${C.chalk};">${esc(g.name)}${g.teams[0] ? badge(v, g.teams[0]) : ''}</td>
<td align="right" style="font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:${C.chalkMute}; white-space:nowrap;">Top ${g.spots} make it</td>
</tr></table></td></tr>`
        : ''
      return (
        head +
        g.teams.map((t, i) => (i === g.spots && i < g.teams.length ? cutLine(lineText(g)) : '') + (paid ? raceRowPaid(v, t, i === 0, !g.name) : raceRowFree(v, t, i === 0, !g.name))).join('')
      )
    })
    .join('')
  const raceNote = paid
    ? `Playoff odds from 8,000 simulated finishes to the season, and the change since ${sinceLabel(v)}.`
    : `Every team through week ${v.week}, by seed.`
  rows.push(`<tr><td class="pad" bgcolor="${C.board}" style="background-color:${C.board}; padding:6px 32px 8px;">
<div style="font-family:${SERIF}; font-style:italic; font-size:14px; line-height:1.5; color:${C.chalkMute}; padding-bottom:8px;">${esc(raceNote)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${raceRows}</table>
${wildcards ? `<div style="font-family:${SANS}; font-size:12px; line-height:1.5; color:${C.chalkMute}; padding-top:8px;">Plus ${wildcards} wildcard ${wildcards === 1 ? 'spot' : 'spots'} for the best ${wildcards === 1 ? 'record' : 'records'} left over.</div>` : ''}
</td></tr>`)
  text.push(
    paid ? `THE PLAYOFF RACE (change since ${sinceLabel(v)})` : 'THE STANDINGS',
    ...groups.flatMap((g) => [
      ...(g.name ? [`${g.name.toUpperCase()} (top ${g.spots} make it)`] : []),
      ...g.teams.flatMap((t, i) => [
        ...(i === g.spots ? ['  ----- playoff line -----'] : []),
        paid
          ? `${t.name} (${record(t)}): ${odds(t.odds)}${changeOf(t) ? ` (${changeOf(t)! > 0 ? '+' : ''}${changeOf(t)})` : ''}${t.clinched ? ', clinched' : t.eliminated ? ', out' : ''}`
          : `${t.seed}. ${t.name} ${record(t)}, ${t.pf.toFixed(1)} pts`,
      ]),
    ]),
    '',
  )

  // What they need (late in the season) or next week's biggest game.
  const { needers } = openRace(v)
  const boardBox = (inner: string) => `<tr><td class="pad" bgcolor="${C.board}" style="background-color:${C.board}; padding:10px 32px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.boardCard}" style="background-color:${C.boardCard}; border:1px solid ${C.boardRule};"><tr><td style="padding:14px 16px 10px;">${inner}</td></tr></table>
</td></tr>`
  if (paid && needers.length) {
    const list = needers.slice(0, 10)
    const needRows = list
      .map((t, i) => {
        const cells = t.needs!.map((x) => `<span style="white-space:nowrap;"><span style="font-size:10px; letter-spacing:1px; text-transform:uppercase; color:${C.chalkMute};">${esc(needsLabel(x))}</span> <b>${odds(x.pct)}</b></span>`).join(' &nbsp; ')
        return `<tr><td style="padding:9px 0;${i ? ` border-top:1px solid ${C.boardRule};` : ''}">
<div style="font-family:${SERIF}; font-size:16px; line-height:1.25; color:${C.chalk};">${esc(t.name)} <span style="font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:${C.down}; white-space:nowrap;">&nbsp;${esc(needsVerdict(t) ?? '')}</span></div>
<div style="font-family:${SANS}; font-size:13px; line-height:1.6; color:${C.chalk}; padding-top:3px;">${cells}</div>
</td></tr>`
      })
      .join('')
    const clinched = v.teams.filter((t) => t.clinched).map((t) => t.name)
    const out = v.teams.filter((t) => t.eliminated).map((t) => t.name)
    const settled = [clinched.length ? `Clinched: ${clinched.join(', ')}.` : '', out.length ? `Out: ${out.join(', ')}.` : ''].filter(Boolean).join(' ')
    rows.push(
      boardBox(`${label('What they need', C.bar)}
<div style="font-family:${SERIF}; font-style:italic; font-size:14px; line-height:1.45; color:${C.chalkMute}; padding-bottom:4px;">Playoff odds by how each team still in it finishes the last ${v.left === 1 ? 'week' : `${v.left} weeks`}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${needRows}</table>
${settled ? `<div style="font-family:${SANS}; font-size:13px; line-height:1.5; color:${C.chalkMute}; padding:9px 0 2px; border-top:1px solid ${C.boardRule};">${esc(settled)}</div>` : ''}`),
    )
    text.push(
      `WHAT THEY NEED (odds by how they finish the last ${v.left === 1 ? 'week' : `${v.left} weeks`})`,
      ...list.map((t) => `${t.name}, ${(needsVerdict(t) ?? '').toLowerCase()}: ${t.needs!.map((x) => `${needsLabel(x)} ${odds(x.pct)}`).join(', ')}`),
      ...(settled ? [settled] : []),
      '',
    )
  } else if (paid && v.bigGame) {
    const a = byId.get(v.bigGame.a)
    const b = byId.get(v.bigGame.b)
    if (a?.next && b?.next) {
      const side = (t: ReportTeam) =>
        `<tr><td style="padding:6px 0; font-family:${SERIF}; font-size:15px; color:${C.chalk};">${esc(t.name)} <span style="font-family:${SANS}; font-size:11px; color:${C.chalkMute};">${esc(record(t))}</span></td>
<td align="right" style="padding:6px 0; font-family:${SANS}; font-size:13px; color:${C.chalk}; white-space:nowrap;"><span style="font-size:10px; letter-spacing:1px; text-transform:uppercase; color:${C.chalkMute};">Win</span> <b>${odds(t.next!.ifWin)}</b> &nbsp; <span style="font-size:10px; letter-spacing:1px; text-transform:uppercase; color:${C.chalkMute};">Lose</span> <b>${odds(t.next!.ifLoss)}</b></td></tr>`
      rows.push(
        boardBox(`${label(`Week ${v.week + 1}'s biggest game`, C.bar)}
<div style="font-family:${SERIF}; font-size:20px; line-height:1.3; color:${C.chalk};">${esc(a.name)} vs. ${esc(b.name)}</div>
<div style="font-family:${SERIF}; font-style:italic; font-size:14px; line-height:1.45; color:${C.chalkMute}; padding:4px 0 6px;">${v.bigGame.swing} points of playoff odds ride on it between them.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${side(a)}${side(b)}</table>`),
      )
      text.push(
        `WEEK ${v.week + 1}'S BIGGEST GAME: ${a.name} vs. ${b.name}`,
        `${a.name}: ${odds(a.next.ifWin)} with a win, ${odds(a.next.ifLoss)} with a loss.`,
        `${b.name}: ${odds(b.next.ifWin)} with a win, ${odds(b.next.ifLoss)} with a loss.`,
        '',
      )
    }
  }
  if (!paid) {
    rows.push(`<tr><td class="pad" bgcolor="${C.board}" style="background-color:${C.board}; padding:6px 32px 0; font-family:${SANS}; font-size:13px; line-height:1.55; color:${C.chalkMute};">
Playoff odds, how they've moved and what next week is worth are on Rookie and up. <a href="${esc(links.pricing)}" style="color:${C.chalk}; text-decoration:underline;">See plans</a>
</td></tr>`)
  }
  rows.push(`<tr><td bgcolor="${C.board}" style="background-color:${C.board}; height:24px; line-height:24px; font-size:1px;">&nbsp;</td></tr>`)

  // ── Report cards ──
  const ranked = byGpa(v)
  const honor = ranked.slice(0, 3)
  const last = ranked.length > 3 ? ranked[ranked.length - 1]! : null
  const pen = (letter: string, size = 15) => `<span style="font-family:${SERIF}; font-style:italic; font-weight:bold; font-size:${size}px; color:${C.red};">${esc(letter)}</span>`
  rows.push(flagHead(`${v.teams.length} managers`, 'Report Cards', { ink: C.ink, flag: C.red, onFlag: '#ffffff', bg: C.stock }))
  rows.push(`<tr><td class="pad" bgcolor="${C.stock}" style="background-color:${C.stock}; padding:6px 32px 4px;">
<div style="font-family:${SERIF}; font-size:16px; line-height:1.55; color:${C.ink};"><span style="font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${C.red};">Honor roll</span> &nbsp;${honor.map((t) => `${esc(t.name)} ${pen(t.grades.overall.letter)}`).join(', ')}</div>
${last ? `<div style="font-family:${SERIF}; font-size:16px; line-height:1.55; color:${C.ink}; padding-top:4px;"><span style="font-family:${SANS}; font-size:10px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${C.red};">See me after class</span> &nbsp;${esc(last.name)} ${pen(last.grades.overall.letter)}</div>` : ''}
</td></tr>`)
  text.push(
    'REPORT CARDS',
    `Honor roll: ${honor.map((t) => `${t.name} ${t.grades.overall.letter}`).join(', ')}`,
    ...(last ? [`See me after class: ${last.name} ${last.grades.overall.letter}`] : []),
  )

  if (paid) {
    const sup = superlatives(v)
    if (sup.length >= 2) {
      const cells: string[] = []
      for (let i = 0; i < sup.length; i += 2) {
        const pair = sup.slice(i, i + 2)
        cells.push(`<tr>${pair.length === 2 ? pair.map((t) => tile(t)).join('') : tile(pair[0]!, true)}</tr>`)
      }
      rows.push(`<tr><td class="pad tiles" bgcolor="${C.stock}" style="background-color:${C.stock}; padding:12px 29px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells.join('')}</table></td></tr>`)
      text.push(...sup.map((s) => `${s.label}: ${s.text}.`))
    }
  }

  // The grade sheet: every manager, every mark.
  const subjects: { key: 'overall' | 'scoring' | 'lineups' | 'moves'; head: string }[] = [
    { key: 'overall', head: 'Overall' },
    { key: 'scoring', head: 'Scoring' },
    ...(paid && v.teams.every((t) => t.grades.lineups) ? [{ key: 'lineups' as const, head: 'Lineups' }] : []),
    ...(paid && v.teams.every((t) => t.grades.moves) ? [{ key: 'moves' as const, head: 'Moves' }] : []),
  ]
  // The Student head sits flush left over the names; the grade heads centre.
  const th = (s: string, align: string) =>
    `<td align="${align}" style="padding:8px ${align === 'left' ? '4px 6px 0' : '4px 6px'}; font-family:${SANS}; font-size:9px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:${C.mute}; border-bottom:1px solid ${C.ink};">${esc(s)}</td>`
  const sheetRows = ranked
    .map((t, i) => {
      const cell = (k: (typeof subjects)[number]['key']) => {
        const g = t.grades[k]
        return `<td align="center" width="50" style="padding:7px 4px; border-top:${i ? `1px solid ${C.rule}` : '0'};">${g ? (k === 'overall' ? pen(g.letter, 16) : `<span style="font-family:${SERIF}; font-size:14px; color:${C.ink};">${esc(g.letter)}</span>`) : ''}</td>`
      }
      return `<tr>
<td style="padding:7px 4px 7px 0; border-top:${i ? `1px solid ${C.rule}` : '0'}; font-family:${SERIF}; font-size:14px; line-height:1.25; color:${C.ink}; word-break:break-word;">${esc(t.name)}${badge(v, t)}</td>
${subjects.map((s) => cell(s.key)).join('')}
</tr>`
    })
    .join('')
  rows.push(`<tr><td class="pad" bgcolor="${C.stock}" style="background-color:${C.stock}; padding:12px 32px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.sheet}" style="background-color:${C.sheet}; border:1px solid ${C.rule};"><tr><td style="padding:4px 14px 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>${th('Student', 'left')}${subjects.map((s) => th(s.head, 'center')).join('')}</tr>
${sheetRows}
</table>
</td></tr></table>
<div style="font-family:${SERIF}; font-style:italic; font-size:13px; line-height:1.5; color:${C.mute}; padding-top:8px;">Graded on the league's curve, by grade point average. ${paid ? 'Every card has two comments from the teacher on the page.' : 'Lineups, roster moves, luck and the comments are on Rookie and up.'}</div>
</td></tr>`)
  text.push(
    '',
    `GRADES (${subjects.map((s) => s.head.toLowerCase()).join(', ')})`,
    ...ranked.map((t) => `${t.name}: ${subjects.map((s) => t.grades[s.key]?.letter ?? '-').join(' ')}`),
    '',
  )

  // ── The button ──
  rows.push(`<tr><td class="pad" align="center" bgcolor="${C.stock}" style="background-color:${C.stock}; padding:22px 32px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${C.red}" style="background-color:${C.red}; border:2px solid ${C.ink};">
<a href="${esc(links.page)}" style="display:inline-block; padding:14px 30px; font-family:${SANS}; font-size:14px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:#ffffff; text-decoration:none;">Read all ${v.teams.length} report cards</a>
</td></tr></table>
</td></tr>
<tr><td class="pad" align="center" bgcolor="${C.stock}" style="background-color:${C.stock}; padding:8px 32px 24px; font-family:${SANS}; font-size:13px; line-height:1.6; color:${C.mute};">
<a href="${esc(links.share)}" style="color:${C.red}; text-decoration:underline;">Send it to the league chat</a>
</td></tr>`)
  text.push(`Read all ${v.teams.length} report cards: ${links.page}`, `Send it to the league: ${links.share}`, '')

  if (!paid) {
    const price = `$${(TIER_PRICES.tier1.yearly.amountCents / 100).toFixed(0)} a year`
    const pitch = `This is the short report. The full one adds playoff odds and how they've moved, next week's biggest game, what every team needs down the stretch, every subject grade and the teacher's comments. Rookie is ${price} for your league.`
    rows.push(`<tr><td class="pad" bgcolor="${C.stock}" style="background-color:${C.stock}; padding:0 32px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.sheet}" style="background-color:${C.sheet}; border:2px dashed ${C.ink};">
<tr><td style="padding:16px 18px; font-family:${SERIF}; font-size:15px; line-height:1.55; color:${C.ink};">
${esc(pitch)}
<div style="padding-top:10px; font-family:${SANS}; font-size:13px; font-weight:bold;"><a href="${esc(links.pricing)}" style="color:${C.red}; text-decoration:underline;">See plans</a></div>
</td></tr></table></td></tr>`)
    text.push(`${pitch} ${links.pricing}`, '')
  }

  if (audience === 'owner') {
    rows.push(`<tr><td class="pad" bgcolor="${C.stock}" style="background-color:${C.stock}; padding:0 32px 22px; font-family:${SANS}; font-size:13px; line-height:1.6; color:${C.ink2};">
Want the rest of the league getting these? Anyone can add their own email at the bottom of the recap page: <a href="${esc(links.join)}" style="color:${C.red}; text-decoration:underline;">join the mailing list</a>.
</td></tr>`)
    text.push(`The rest of the league can get these too: ${links.join}`, '')
  }

  // ── Footer ──
  const weeks = v.editions.length > 1 ? `${v.editions.slice(0, -1).join(', ')} and ${v.editions[v.editions.length - 1]}` : String(v.editions[0])
  const when = `Progress Reports come on the Thursday after weeks ${weeks}, alongside the Tuesday recap.`
  const why =
    audience === 'owner'
      ? `You're getting this because you run ${v.league.name} on The Sunday Chronicle. ${when}`
      : `You're getting this because you joined the ${v.league.name} mailing list on The Sunday Chronicle. ${when}`
  const stop = audience === 'owner' ? 'Stop league emails' : 'Leave the mailing list'
  rows.push(`<tr><td class="pad" bgcolor="${C.stock}" style="background-color:${C.stock}; padding:18px 32px 26px; border-top:2px solid ${C.ink}; font-family:${SANS}; font-size:11px; line-height:1.7; color:${C.mute};">
${esc(why)}<br>
<a href="${esc(links.league)}" style="color:${C.mute}; text-decoration:underline;">View the league</a> &middot; <a href="${esc(links.unsubscribe)}" style="color:${C.mute}; text-decoration:underline;">${stop}</a>${
    audience === 'owner' ? ` &middot; <a href="${esc(links.account)}" style="color:${C.mute}; text-decoration:underline;">Account settings</a>` : ''
  }
</td></tr>`)
  text.push(why, `View the league: ${links.league}`, `${stop}: ${links.unsubscribe}`, ...(audience === 'owner' ? [`Account settings: ${links.account}`] : []))

  const preheader = lead.split(/(?<=\.)\s/)[0] ?? lead

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
    .hed  { font-size: 32px !important; }
    .dl   { font-size: 9px !important; letter-spacing: 0 !important; }
  }
  a { text-decoration: none; }
</style>
</head>
<body style="margin:0; padding:0; background-color:${C.desk}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:${C.desk}; font-size:1px; line-height:1px;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.desk}" style="background-color:${C.desk};">
<tr><td align="center" style="padding:24px 8px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.stock}" style="width:600px; max-width:600px; background-color:${C.stock}; border:1px solid ${C.rule};">
${rows.join('\n')}
</table>
</td></tr>
</table>
</body>
</html>`

  return { html, text: text.join('\n') }
}
