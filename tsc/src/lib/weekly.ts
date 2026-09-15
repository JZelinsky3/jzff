// The Weekly — one composed digest of everything a league member is
// supposed to check in a given week, assembled server-side so the page is
// a single small fetch instead of six large ones.
//
// The page it feeds (templates/pams-mobile/live/weekly/) is a link you send
// into the league chat once a week. It has to answer, in one scroll:
//   • have I done my pick'ems, and when do they lock
//   • who am I playing and am I favored
//   • where am I in the power rankings
//   • what traded
//   • what record or milestone just fell, and what falls next
//
// Every number here already exists somewhere else on the site. This module
// reduces those sources down to the handful of rows worth putting in front
// of someone who is checking their phone at a stoplight, and every section
// carries the link to the full page it was reduced from.
//
// Sources: getPickemsState, getPowerRankings, getTradesState, plus three
// files off the shared league export bundle (matchup_preview, records_watch,
// milestones). Nothing new is computed from the database here.

import { createAdminClient } from '@/lib/supabase/admin'
import { getLockReason } from '@/lib/leagueTier'
import { getPickemsState, type PickemsState } from '@/lib/pickems'
import { getPowerRankings } from '@/lib/powerRankings'
import { getTradesState, type TradeAsset, type TradePublic } from '@/lib/trades'
import { getLeagueBundle } from '@/lib/leagueBundleCache'
import { resolveCurrentWeek, resolveWeekLockAt } from '@/lib/liveSeason'

// ── Public shape ──────────────────────────────────────────────────────────

export type WeeklyProfile = {
  profileId: string
  name: string
  // manager_id in the live season — joins to the power rankings rows.
  managerId: string | null
  // external platform user id — joins to the matchup board and is what
  // matchup-preview's ?m= deep link takes.
  uid: string | null
}

export type WeeklySide = {
  uid: string | null
  name: string
  team: string
  record: string
  ppg: number
}

export type WeeklyGame = {
  a: WeeklySide
  b: WeeklySide
  spread: number
  favorite: 'a' | 'b' | 'pp'
  gotw: boolean
}

export type WeeklyPowerRow = {
  rank: number
  managerId: string
  team: string
  manager: string
  record: string
  delta: number
}

export type WeeklyTrade = {
  id: string
  daysAgo: number
  week: number | null
  magnitude: string | null
  // "Connie ⇄ Charlie"
  headline: string
  summary: string | null
  sides: { manager: string; gets: string[] }[]
}

export type WeeklyWatchItem = {
  category: string
  flag: string
  chaser: string
  value: string
  gap: string
  holder: string
  holderWhen: string
  pct: number
}

export type WeeklyMilestone = {
  glyph: string
  name: string
  // Pre-escaped HTML fragments straight off the milestones feed (the
  // Milestone Tracker renders the same strings).
  html: string
  meta: string
  eta: string
  etaUnit: string
}

export type WeeklyState =
  | { status: 'no-league' }
  | { status: 'locked' }
  | { status: 'no-live' }
  | { status: 'no-week'; year: number }
  | {
      status: 'ok'
      year: number
      week: number
      generatedAt: string
      league: { name: string; abbr: string | null }
      profiles: WeeklyProfile[]

      picks: {
        // Deadline has passed / the week is closed to new submissions.
        locked: boolean
        // ISO instant picks close. Null when the commissioner pinned the
        // week manually — no deadline is derivable, so none is shown.
        locksAt: string | null
        // profileIds with a submission on file for this week.
        submitted: string[]
        total: number
        // Season pick'em standings, best first.
        standings: { name: string; right: number; wrong: number }[]
      } | null

      board: { week: number; games: WeeklyGame[] } | null

      power: {
        week: number
        rows: WeeklyPowerRow[]
        riser: WeeklyPowerRow | null
        faller: WeeklyPowerRow | null
      } | null

      trades: {
        // Rookie-tier league: the Trade Desk is a Veteran feature, so the
        // section renders an upgrade note instead of deals.
        locked: boolean
        recent: WeeklyTrade[]
        // How many of `recent` landed inside the last 7 days.
        newThisWeek: number
        // Four-week verdicts that published in the last 7 days.
        verdicts: number
      }

      watch: {
        broken: WeeklyWatchItem[]
        brink: WeeklyWatchItem[]
        crossed: WeeklyMilestone[]
        imminent: WeeklyMilestone[]
        counts: { broken: number; brink: number; crossed: number; imminent: number }
        through: string | null
      } | null
    }

// ── Bundle-side shapes (the export bundle types these as `unknown`) ───────

type BundleWatchItem = {
  category?: string
  flag?: string
  chaser?: string
  chaser_value?: string
  record_value?: string
  gap?: string
  holder?: string
  holder_when?: string
  pct?: number
}
type BundleRecordsWatch = {
  meter?: { broken?: number; brink?: number; through?: string }
  broken?: BundleWatchItem[]
  brink?: BundleWatchItem[]
}
type BundleApproach = {
  glyph?: string
  name?: string
  copy_html?: string
  stats_html?: string
  eta?: string
  eta_unit?: string
}
type BundleCrossed = {
  glyph?: string
  name?: string
  tier?: string
  achievement_html?: string
  meta_html?: string
}
type BundleMilestones = {
  meter?: { week?: number; imminent?: number }
  crossed?: BundleCrossed[]
  imminent_by_category?: Record<string, BundleApproach[]>
}
type BundleMatchupPreview = {
  year?: number
  week?: number
  gotwIdx?: number | null
  matchups?: {
    gotw?: boolean
    projected?: { spread?: number; favorite?: 'a' | 'b' | 'pp' }
    a?: BundleSide
    b?: BundleSide
  }[]
}
type BundleSide = {
  uid?: string | null
  name?: string
  team?: string
  record?: string
  ppg5?: number
  ppgSeason?: number
}

// How far back a trade still counts as worth putting on the page. Wider
// than the Trade Desk's own 7-day "current" window on purpose: in a quiet
// stretch "the last deal was 11 days ago" is more useful than an empty
// section, and the row carries its own age so nothing reads as fresher
// than it is.
const TRADE_WINDOW_DAYS = 21
const MAX_TRADES = 4

export async function getWeeklyState(slug: string): Promise<WeeklyState> {
  const db = createAdminClient()

  const { data: league } = await db
    .from('leagues')
    .select('id, name, abbreviation, owner_id')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) return { status: 'no-league' }

  // The whole live-season chapter is paid-only; the page itself is already
  // behind the same page lock, but the data has to agree with the page or a
  // direct fetch would sidestep it.
  const lock = await getLockReason(league.id, league.owner_id)
  if (lock === 'udfa') return { status: 'locked' }

  const { data: liveSeason } = await db
    .from('seasons')
    .select('id, year, settings')
    .eq('league_id', league.id)
    .eq('is_live', true)
    .maybeSingle<{ id: string; year: number; settings: Record<string, unknown> | null }>()
  if (!liveSeason) return { status: 'no-live' }

  const week = resolveCurrentWeek(liveSeason.settings ?? null)
  if (week == null) return { status: 'no-week', year: liveSeason.year }

  // Everything below is independent, and each source does its own I/O, so
  // they run together rather than stacking four round-trips end to end.
  const [pickems, power, trades, bundle] = await Promise.all([
    getPickemsState(slug),
    getPowerRankings(slug),
    getTradesState(slug),
    getLeagueBundle(league.id, slug),
  ])

  const profiles = buildProfiles(pickems)

  return {
    status: 'ok',
    year: liveSeason.year,
    week,
    generatedAt: new Date().toISOString(),
    league: { name: league.name, abbr: league.abbreviation ?? null },
    profiles,
    picks: buildPicks(pickems, liveSeason.settings ?? null, week),
    board: buildBoard(bundle['matchup_preview.json'] as BundleMatchupPreview | null),
    power: buildPower(power),
    trades: buildTrades(trades),
    watch: buildWatch(
      bundle['records_watch.json'] as BundleRecordsWatch | null,
      bundle['milestones.json'] as BundleMilestones | null,
    ),
  }
}

// ── Identity ──────────────────────────────────────────────────────────────

// The name dropdown is the pick'ems roster, deliberately: a member who has
// already claimed a name over there is recognized here without picking
// again (the page reads the same localStorage key), and vice versa.
function buildProfiles(pickems: PickemsState | null): WeeklyProfile[] {
  if (!pickems || pickems.status !== 'ok') return []
  return pickems.profiles
    .map((p) => ({
      profileId: p.profileId,
      name: p.name,
      managerId: p.teamId,
      uid: p.teamId ? pickems.teams[p.teamId]?.user_id ?? null : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ── Pick'ems ──────────────────────────────────────────────────────────────

function buildPicks(
  pickems: PickemsState | null,
  settings: Record<string, unknown> | null,
  week: number,
): Extract<WeeklyState, { status: 'ok' }>['picks'] {
  if (!pickems || pickems.status !== 'ok') return null

  const weekId = String(week)
  const thisWeek = pickems.weeks.find((w) => w.id === weekId) ?? null

  const submitted: string[] = []
  for (const profileId of Object.keys(pickems.submissions)) {
    const sub = pickems.submissions[profileId]?.[weekId]
    if (sub && Object.keys(sub.picks ?? {}).length > 0) submitted.push(profileId)
  }

  return {
    locked: thisWeek?.locked ?? false,
    locksAt: thisWeek?.locks_at ?? resolveWeekLockAt(settings, week),
    submitted,
    total: pickems.profiles.length,
    standings: buildPickemsStandings(pickems),
  }
}

// Same scoring the pick'ems page and its OG card use: correct / incorrect
// across every week with known winners, excluding the picker's own game.
function buildPickemsStandings(
  state: Extract<PickemsState, { status: 'ok' }>,
): { name: string; right: number; wrong: number }[] {
  const byUser = new Map<string, { name: string; teamId: string | null; right: number; wrong: number }>()
  for (const p of state.profiles) {
    byUser.set(p.profileId, { name: p.name, teamId: p.teamId, right: 0, wrong: 0 })
  }
  for (const w of state.weeks) {
    if (!w.winners) continue
    for (const profileId of Object.keys(state.submissions)) {
      const sub = state.submissions[profileId]?.[w.id]
      if (!sub) continue
      const row = byUser.get(profileId)
      if (!row) continue
      for (const matchupId of Object.keys(sub.picks ?? {})) {
        const winner = w.winners[matchupId]
        if (!winner) continue
        const m = w.matchups.find((x) => x.id === matchupId)
        if (row.teamId && m && (m.home === row.teamId || m.away === row.teamId)) continue
        if (sub.picks[matchupId] === winner) row.right++
        else row.wrong++
      }
    }
  }
  return Array.from(byUser.values())
    .filter((r) => r.right + r.wrong > 0)
    .map((r) => ({ name: r.name, right: r.right, wrong: r.wrong }))
    .sort((a, b) => b.right - a.right || a.wrong - b.wrong || a.name.localeCompare(b.name))
}

// ── The board ─────────────────────────────────────────────────────────────

function buildBoard(mp: BundleMatchupPreview | null): Extract<WeeklyState, { status: 'ok' }>['board'] {
  if (!mp || !Array.isArray(mp.matchups) || mp.matchups.length === 0) return null

  const games: WeeklyGame[] = mp.matchups.map((m, i) => ({
    a: side(m.a),
    b: side(m.b),
    spread: Math.abs(Number(m.projected?.spread ?? 0)),
    favorite: m.projected?.favorite ?? 'pp',
    gotw: !!m.gotw || mp.gotwIdx === i,
  }))

  return { week: Number(mp.week ?? 0), games }
}

function side(s: BundleSide | undefined): WeeklySide {
  return {
    uid: s?.uid ?? null,
    name: s?.name ?? '·',
    team: s?.team ?? s?.name ?? '·',
    record: s?.record ?? '',
    // The board column is the season average; ppg5 is the recent-form
    // number, which belongs to the full preview's form pills rather than a
    // two-line digest row.
    ppg: Number(s?.ppgSeason ?? 0),
  }
}

// ── Power rankings ────────────────────────────────────────────────────────

function buildPower(
  power: Awaited<ReturnType<typeof getPowerRankings>>,
): Extract<WeeklyState, { status: 'ok' }>['power'] {
  if (!power || power.status !== 'ok') return null
  // weeks is ordered oldest-first; the last entry is the live snapshot.
  const latest = power.weeks[power.weeks.length - 1]
  if (!latest || latest.overall.length === 0) return null

  const rows: WeeklyPowerRow[] = latest.overall.map((t) => ({
    rank: t.rank,
    managerId: t.team_id,
    team: t.team_name,
    manager: t.manager,
    record: t.ties > 0 ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`,
    delta: t.delta,
  }))

  // Preseason has no previous snapshot to move against, so every delta is
  // 0 and naming a "riser" would be inventing one.
  const moved = rows.filter((r) => r.delta !== 0)
  const riser = moved.length ? moved.reduce((a, b) => (b.delta > a.delta ? b : a)) : null
  const faller = moved.length ? moved.reduce((a, b) => (b.delta < a.delta ? b : a)) : null

  return {
    week: latest.week,
    rows,
    riser: riser && riser.delta > 0 ? riser : null,
    faller: faller && faller.delta < 0 ? faller : null,
  }
}

// ── The wire ──────────────────────────────────────────────────────────────

function buildTrades(
  trades: Awaited<ReturnType<typeof getTradesState>>,
): Extract<WeeklyState, { status: 'ok' }>['trades'] {
  const empty = { locked: false, recent: [] as WeeklyTrade[], newThisWeek: 0, verdicts: 0 }
  if (!trades) return empty
  if (trades.status === 'tier-locked') return { ...empty, locked: true }
  if (trades.status !== 'ok') return empty

  const now = Date.now()
  const cutoff = now - TRADE_WINDOW_DAYS * 24 * 60 * 60 * 1000

  // current_trades and past_trades are the same feed split at 7 days;
  // re-merge and cut our own window so the page can say how old the last
  // deal is rather than showing nothing in a quiet stretch.
  const all = [...trades.current_trades, ...trades.past_trades]
    .filter((t) => Date.parse(t.executed_at) >= cutoff)
    .sort((a, b) => Date.parse(b.executed_at) - Date.parse(a.executed_at))

  const recent = all.slice(0, MAX_TRADES).map((t) => toWeeklyTrade(t, now))

  return {
    locked: false,
    recent,
    newThisWeek: all.filter((t) => now - Date.parse(t.executed_at) <= 7 * 24 * 60 * 60 * 1000).length,
    verdicts: trades.current_verdicts.length,
  }
}

function toWeeklyTrade(t: TradePublic, now: number): WeeklyTrade {
  const names = t.sides.map((s) => s.manager.display_name)
  return {
    id: t.id,
    daysAgo: Math.max(0, Math.floor((now - Date.parse(t.executed_at)) / (24 * 60 * 60 * 1000))),
    week: t.week ?? null,
    magnitude: t.magnitude ?? null,
    headline: names.join(' ⇄ '),
    summary: t.ai_summary,
    sides: t.sides.map((s) => ({
      manager: s.manager.display_name,
      gets: s.assets.map(assetLabel).filter(Boolean),
    })),
  }
}

function assetLabel(a: TradeAsset): string {
  if (a.kind === 'player') return a.name ?? 'Player'
  if (a.kind === 'pick') return `${a.season_year} R${a.round}`
  if (a.kind === 'faab') return `$${a.amount} FAAB`
  return ''
}

// ── The record room ───────────────────────────────────────────────────────

// Records Watch and the Milestone Tracker are two long pages. The Weekly
// takes the top of each: what has actually fallen, and what falls next.
function buildWatch(
  rw: BundleRecordsWatch | null,
  ms: BundleMilestones | null,
): Extract<WeeklyState, { status: 'ok' }>['watch'] {
  if (!rw && !ms) return null

  const broken = (rw?.broken ?? []).slice(0, 3).map(toWatchItem)
  const brink = (rw?.brink ?? []).slice(0, 3).map(toWatchItem)

  const crossed = (ms?.crossed ?? []).slice(0, 4).map(
    (c): WeeklyMilestone => ({
      glyph: c.glyph ?? '✦',
      name: c.name ?? '·',
      html: c.achievement_html ?? '',
      meta: c.meta_html ?? '',
      eta: c.tier ?? '',
      etaUnit: '',
    }),
  )

  // imminent_by_category is keyed wins / points / streak; the Weekly reads
  // as one "next to fall" list, so flatten and take the closest few.
  const byCat = ms?.imminent_by_category ?? {}
  const imminentAll: BundleApproach[] = []
  for (const key of ['wins', 'streak', 'points']) {
    for (const item of byCat[key] ?? []) imminentAll.push(item)
  }
  const imminent = imminentAll.slice(0, 4).map(
    (a): WeeklyMilestone => ({
      glyph: a.glyph ?? '✦',
      name: a.name ?? '·',
      html: a.copy_html ?? '',
      meta: a.stats_html ?? '',
      eta: a.eta ?? '',
      etaUnit: a.eta_unit ?? '',
    }),
  )

  const counts = {
    broken: rw?.meter?.broken ?? broken.length,
    brink: rw?.meter?.brink ?? brink.length,
    crossed: ms?.meter?.week ?? crossed.length,
    imminent: ms?.meter?.imminent ?? imminent.length,
  }
  if (
    broken.length === 0 && brink.length === 0 &&
    crossed.length === 0 && imminent.length === 0
  ) return null

  return { broken, brink, crossed, imminent, counts, through: rw?.meter?.through ?? null }
}

function toWatchItem(it: BundleWatchItem): WeeklyWatchItem {
  return {
    category: it.category ?? 'Record',
    flag: it.flag ?? '',
    chaser: it.chaser ?? '·',
    value: it.chaser_value ?? it.record_value ?? '',
    gap: it.gap ?? '',
    holder: it.holder ?? '·',
    holderWhen: it.holder_when ?? '',
    pct: Math.max(0, Math.min(100, Number(it.pct ?? 0))),
  }
}
