// League Mode. SERVER ONLY.
//
// The season, as the original actually ran it (its api/advance-week route,
// not the design notes in lib/league/season.ts, which describe a different
// postseason that was never built):
//
//   Regular season, eight weeks. Every week each team drafts: one pack per
//   slot it hasn't locked. After drafting, the team may lock one player from
//   that week's eleven, and he holds his slot for the next LOCK_WEEKS weeks.
//   Chemistry is added to the cards, counted the way every mode counts it.
//
//   Rebuilt 2026-11-02, after a season against seven CPUs where the week-one
//   winner had the richest pack every week after and the bottom half never had
//   a boost. Now:
//   - Everyone opens a Standings Pack, on a slot chosen BEFORE the first pack
//     is dealt. Last week's finish sets how good: the winner's Elite Drop down
//     to a Starter Pack, which still beats an ordinary pack.
//   - Ordinary packs deal off Versus' table (rules.ts, LEAGUE_ORDINARY).
//   - Locks run out after LOCK_WEEKS, and can be let go before a draft.
//   - The bottom half of the table gets a mulligan each week: one opened pack
//     thrown back for a fresh one.
//   - Each week has a twist, the Daily's rules, unless the commissioner turns
//     them off (leagueWeek.ts).
//   - Every opened pack is kept on the draft row, so a pool update mid-week
//     can't change a pack and the recap can show what each one held.
//
//   The commissioner advances the week. Drafts stay hidden until then.
//
//   Postseason: the playoff field ('half' or a number) by regular-season
//   total. With three or more, one Gauntlet week halves the field (rounding
//   up); then one Final week, and the highest postseason total, Gauntlet plus
//   Final, is champion. With two, straight to the Final.
//
// One deliberate change: standings are CUMULATIVE. The original overwrote
// each team's score with that week's score, so its standings were only ever
// last week, and it seeded the playoffs off the last two weeks. Its own
// comment called that ranking "cumulative", which is what this is.

import { createAdminClient } from '@/lib/supabase/admin'
import { containsHateSpeech } from '@/lib/contentModeration'
import { dealPack, newServerSeed } from './deal'
import { cpuBoostSlot, cpuDraft, cpuLock, cpuTeamName } from './leagueCpu'
import { ruleForWeek, weekRule, weekRuleView, weekScore, type WeekRuleView } from './leagueWeek'
import { mysteryMissed } from './missed'
import { isId, nameForUser, newId } from './people'
import {
  LEAGUE_ORDINARY,
  LEAGUE_SIZES,
  LOCK_WEEKS,
  MIN_LEAGUE_PLAYERS,
  PACK_TIER_LABEL,
  REGULAR_WEEKS,
  SLOT_COUNT,
  STANDINGS_WEIGHTS,
  chemistryFor,
  lineupScore,
  mulliganForRank,
  packTierForRank,
  playoffFieldSize,
  playoffOptions,
  type Chemistry,
  type LeaguePhase,
  type Missed,
  type PackTier,
  type Player,
  type Weights,
} from './rules'

const CODE_LEN = 6

// ============================================================
// Rows
// ============================================================

export type LeagueRow = {
  id: string
  created_at: string
  name: string
  commissioner_id: string
  visibility: 'public' | 'invite'
  join_code: string
  max_players: number
  playoff_size: string
  phase: LeaguePhase
  current_week: number
  season_number: number
  /** The weekly twist, on unless the commissioner turned it off (0103). */
  week_rules: boolean
}

/** `until` is the last week he holds the slot. Locks from before they ran out
    have none and hold to the end of the regular season. */
export type Lock = { slot: number; player: Player; until?: number }

/** The locks still holding a slot in this week of the regular season. */
export function liveLocks(member: Pick<MemberRow, 'permanent_locks'>, week: number): Lock[] {
  return (member.permanent_locks ?? []).filter((l) => (l.until ?? REGULAR_WEEKS) >= week)
}

export type MemberRow = {
  id: string
  league_id: string
  /** Null on a CPU team. */
  user_id: string | null
  joined_at: string
  display_name: string
  team_name: string | null
  team_score: number
  playoff_score: number
  next_pack_tier: PackTier
  permanent_locks: Lock[]
  playoff_active: boolean
  playoff_seed: number | null
  /** Leagues won, across every season (0082). */
  titles: number
  /** A CPU team, added by the commissioner (0102). */
  is_cpu: boolean
  /** Bottom half of the table: one pack can go back this week (0103). */
  mulligan: boolean
}

export type DraftRow = {
  id: string
  league_id: string
  member_id: string
  user_id: string | null
  season_number: number
  phase: string
  week_number: number
  status: 'drafting' | 'submitted'
  seed: string
  pack_tier: PackTier
  boosted_slot: number | null
  carried: Lock[]
  picks: { slot: number; id: string }[]
  open_slot: number | null
  roster: (Player | null)[] | null
  draft_score: number | null
  chemistry: Chemistry | null
  final_score: number | null
  locked_this_week: string | null
  started_at: string
  completed_at: string | null
  /** Every pack opened, by slot, as dealt (0103). Empty on older drafts. */
  packs: Record<string, Player[]>
  /** The week's twist; 'plain' with none; null on drafts from before 0103. */
  rule_id: string | null
  mulligan_slot: number | null
  thrown: Player[] | null
}

const db = () => createAdminClient()

export type Fail = { ok: false; error: string; status?: number }

async function loadLeague(id: string): Promise<LeagueRow | null> {
  if (!isId(id, CODE_LEN)) return null
  const { data } = await db().from('pe_leagues').select('*').eq('id', id).maybeSingle()
  return (data as LeagueRow | null) ?? null
}

async function loadMembers(leagueId: string): Promise<MemberRow[]> {
  const { data } = await db().from('pe_league_members').select('*').eq('league_id', leagueId).order('joined_at')
  return (data ?? []) as MemberRow[]
}

function isPostseason(phase: LeaguePhase) {
  return phase === 'gauntlet' || phase === 'finals'
}

/** Who drafts this week: everyone in the regular season, the surviving
    field in the postseason, nobody before or after. */
function drafts(league: LeagueRow, m: MemberRow): boolean {
  if (league.phase === 'regular') return true
  if (isPostseason(league.phase)) return m.playoff_active
  return false
}

// ============================================================
// Names
// ============================================================

function cleanLeagueName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.replace(/\s+/g, ' ').trim()
  if (s.length < 3 || s.length > 40 || containsHateSpeech(s)) return null
  return s
}

function cleanTeamName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.replace(/\s+/g, ' ').trim()
  if (s.length < 2 || s.length > 28 || containsHateSpeech(s)) return null
  return s
}

// ============================================================
// Lobby
// ============================================================

export async function createLeague(
  userId: string,
  input: { name: unknown; visibility: unknown; maxPlayers: unknown; playoffSize: unknown }
): Promise<{ ok: true; id: string } | Fail> {
  const name = cleanLeagueName(input.name)
  if (!name) return { ok: false, error: 'League names run 3 to 40 characters.' }
  const visibility = input.visibility === 'public' ? 'public' : 'invite'
  const maxPlayers = Number(input.maxPlayers)
  if (!LEAGUE_SIZES.includes(maxPlayers)) return { ok: false, error: 'Pick a league size.' }
  const playoffSize = typeof input.playoffSize === 'string' ? input.playoffSize : 'half'
  if (!playoffOptions(maxPlayers).includes(playoffSize)) return { ok: false, error: 'Pick a playoff field.' }

  const display = await nameForUser(db(), userId)
  for (let attempt = 0; attempt < 4; attempt++) {
    const id = newId(CODE_LEN)
    const { error } = await db().from('pe_leagues').insert({
      id,
      name,
      commissioner_id: userId,
      visibility,
      join_code: newId(CODE_LEN),
      max_players: maxPlayers,
      playoff_size: playoffSize,
    })
    if (error) {
      if (error.code === '23505') continue
      return { ok: false, error: 'Could not create the league.' }
    }
    await db().from('pe_league_members').insert({ league_id: id, user_id: userId, display_name: display })
    return { ok: true, id }
  }
  return { ok: false, error: 'Could not create the league.' }
}

export async function joinLeague(
  userId: string,
  input: { id?: unknown; code?: unknown }
): Promise<{ ok: true; id: string } | Fail> {
  const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : ''
  let league: LeagueRow | null = null
  if (code) {
    const { data } = await db().from('pe_leagues').select('*').eq('join_code', code).maybeSingle()
    league = (data as LeagueRow | null) ?? null
    if (!league) return { ok: false, error: 'No league with that code.' }
  } else if (typeof input.id === 'string') {
    league = await loadLeague(input.id.toUpperCase())
    if (!league) return { ok: false, error: 'No such league.', status: 404 }
    if (league.visibility !== 'public') return { ok: false, error: 'This league is invite-only. You need its code.' }
  } else {
    return { ok: false, error: 'Enter a league code.' }
  }

  const members = await loadMembers(league.id)
  if (members.some((m) => m.user_id === userId)) return { ok: true, id: league.id }
  if (league.phase !== 'pregame') return { ok: false, error: 'This season has already started.' }
  if (members.length >= league.max_players) {
    // A person takes a CPU's seat: the newest one gives way.
    const cpu = members.filter((m) => m.is_cpu).pop()
    if (!cpu) return { ok: false, error: 'This league is full.' }
    await db().from('pe_league_members').delete().eq('id', cpu.id).eq('is_cpu', true)
  }

  const display = await nameForUser(db(), userId)
  const { error } = await db().from('pe_league_members').insert({ league_id: league.id, user_id: userId, display_name: display })
  if (error && error.code !== '23505') return { ok: false, error: 'Could not join.' }
  return { ok: true, id: league.id }
}

export type LeagueCard = {
  id: string
  name: string
  phase: LeaguePhase
  week: number
  season: number
  members: number
  maxPlayers: number
  commissioner: boolean
}

export async function myLeagues(userId: string): Promise<LeagueCard[]> {
  const { data } = await db().from('pe_league_members').select('league_id').eq('user_id', userId)
  const ids = (data ?? []).map((r: { league_id: string }) => r.league_id)
  if (!ids.length) return []
  const { data: leagues } = await db().from('pe_leagues').select('*').in('id', ids).order('created_at', { ascending: false })
  const { data: all } = await db().from('pe_league_members').select('league_id').in('league_id', ids)
  const count = new Map<string, number>()
  for (const r of (all ?? []) as { league_id: string }[]) count.set(r.league_id, (count.get(r.league_id) ?? 0) + 1)
  return ((leagues ?? []) as LeagueRow[]).map((l) => ({
    id: l.id,
    name: l.name,
    phase: l.phase,
    week: l.current_week,
    season: l.season_number,
    members: count.get(l.id) ?? 0,
    maxPlayers: l.max_players,
    commissioner: l.commissioner_id === userId,
  }))
}

/** Public leagues still taking teams. */
export async function openLeagues(userId: string | null): Promise<LeagueCard[]> {
  const { data: leagues } = await db()
    .from('pe_leagues')
    .select('*')
    .eq('visibility', 'public')
    .eq('phase', 'pregame')
    .order('created_at', { ascending: false })
    .limit(20)
  const rows = (leagues ?? []) as LeagueRow[]
  if (!rows.length) return []
  const { data: all } = await db()
    .from('pe_league_members')
    .select('league_id, user_id, is_cpu')
    .in('league_id', rows.map((l) => l.id))
  const count = new Map<string, number>()
  const people = new Map<string, number>()
  const mine = new Set<string>()
  for (const r of (all ?? []) as { league_id: string; user_id: string | null; is_cpu: boolean }[]) {
    count.set(r.league_id, (count.get(r.league_id) ?? 0) + 1)
    if (!r.is_cpu) people.set(r.league_id, (people.get(r.league_id) ?? 0) + 1)
    if (userId && r.user_id === userId) mine.add(r.league_id)
  }
  // A seat a CPU holds is still open: a person who joins takes it.
  return rows
    .filter((l) => (people.get(l.id) ?? 0) < l.max_players && !mine.has(l.id))
    .map((l) => ({
      id: l.id,
      name: l.name,
      phase: l.phase,
      week: l.current_week,
      season: l.season_number,
      members: count.get(l.id) ?? 0,
      maxPlayers: l.max_players,
      commissioner: false,
    }))
}

// ============================================================
// The league page
// ============================================================

export type StandingRow = {
  memberId: string
  userId: string | null
  name: string
  team: string | null
  total: number
  playoff: number
  /** Revealed weekly finals, regular season, in week order. */
  weeks: (number | null)[]
  lastWeek: number | null
  locks: number
  /** The Standings Pack this team opens this week. */
  tier: PackTier
  mulligan: boolean
  /** This week's draft: none, started, or in. Never its contents. */
  thisWeek: 'none' | 'drafting' | 'submitted'
  active: boolean
  seed: number | null
  you: boolean
  cpu: boolean
}

export type LeagueView = {
  league: Omit<LeagueRow, 'join_code' | 'commissioner_id'> & { joinCode: string | null }
  commissioner: boolean
  member: MemberRow | null
  standings: StandingRow[]
  /** Champion's member id, once the season is complete. */
  champion: string | null
  /** This viewer's own draft for the current week, summarised. */
  myDraft: { status: DraftRow['status']; finalScore: number | null; locked: string | null } | null
  canStart: boolean
  minPlayers: number
  /** CPU teams in the league. */
  cpus: number
  /** This week's twist, while there's a week to draft. */
  rule: WeekRuleView | null
  /** The viewer's locks holding a slot this week. */
  myLocks: Lock[]
}

export async function leagueView(id: string, userId: string | null): Promise<LeagueView | null> {
  const league = await loadLeague(id)
  if (!league) return null
  const members = await loadMembers(league.id)
  const member = userId ? members.find((m) => m.user_id === userId) ?? null : null

  const { data: draftRows } = await db()
    .from('pe_league_drafts')
    .select('member_id, phase, week_number, status, final_score, locked_this_week')
    .eq('league_id', league.id)
    .eq('season_number', league.season_number)
  const ds = (draftRows ?? []) as Pick<DraftRow, 'member_id' | 'phase' | 'week_number' | 'status' | 'final_score' | 'locked_this_week'>[]

  const current = (d: { phase: string; week_number: number }) =>
    d.phase === league.phase && d.week_number === league.current_week

  const standings: StandingRow[] = members.map((m) => {
    const mine = ds.filter((d) => d.member_id === m.id)
    const weeks: (number | null)[] = []
    for (let w = 1; w <= REGULAR_WEEKS; w++) {
      const d = mine.find((x) => x.phase === 'regular' && x.week_number === w && x.status === 'submitted')
      // A week is revealed once the league has moved past it.
      const revealed = league.phase !== 'regular' || w < league.current_week
      weeks.push(d && revealed ? (d.final_score ?? 0) : null)
    }
    const revealedWeeks = weeks.filter((x): x is number => x != null)
    const now = mine.find(current)
    return {
      memberId: m.id,
      userId: m.user_id,
      name: m.display_name,
      team: m.team_name,
      total: m.team_score,
      playoff: m.playoff_score,
      weeks,
      lastWeek: revealedWeeks.length ? revealedWeeks[revealedWeeks.length - 1] : null,
      locks: league.phase === 'regular' ? liveLocks(m, league.current_week).length : 0,
      tier: m.next_pack_tier,
      mulligan: !!m.mulligan,
      thisWeek: now ? now.status : 'none',
      active: m.playoff_active,
      seed: m.playoff_seed,
      you: !!userId && m.user_id === userId,
      cpu: !!m.is_cpu,
    }
  })

  const post = isPostseason(league.phase) || league.phase === 'complete'
  standings.sort((a, b) =>
    post
      ? Number(b.active) - Number(a.active) || b.playoff - a.playoff || b.total - a.total
      : b.total - a.total || a.name.localeCompare(b.name)
  )

  const championRow = league.phase === 'complete' ? members.find((m) => m.playoff_active && m.playoff_seed === 1) : null
  const mineNow = member ? ds.find((d) => d.member_id === member.id && current(d)) : null
  const commissioner = !!userId && league.commissioner_id === userId

  const { join_code, commissioner_id: _c, ...rest } = league
  void _c
  return {
    league: { ...rest, joinCode: member ? join_code : null },
    commissioner,
    member,
    standings,
    champion: championRow?.id ?? null,
    myDraft: mineNow ? { status: mineNow.status, finalScore: mineNow.final_score, locked: mineNow.locked_this_week } : null,
    canStart: commissioner && league.phase === 'pregame' && members.length >= MIN_LEAGUE_PLAYERS,
    minPlayers: MIN_LEAGUE_PLAYERS,
    cpus: members.filter((m) => m.is_cpu).length,
    rule: ['regular', 'gauntlet', 'finals'].includes(league.phase) ? weekRuleView(currentRule(league)) : null,
    myLocks: member && league.phase === 'regular' ? liveLocks(member, league.current_week) : [],
  }
}

// ============================================================
// The week's draft
// ============================================================

export type DraftView = {
  league: { id: string; name: string; phase: LeaguePhase; week: number }
  status: DraftRow['status'] | 'not_started'
  /** The Standings Pack this team opens this week. */
  tier: PackTier
  /** The slot it goes on: chosen before anything is dealt. */
  boostedSlot: number | null
  /** The week's twist, or null on a plain week. */
  rule: WeekRuleView | null
  /** Sent so the browser scores the lineup the way the server will. */
  ruleId: string
  lineup: (Player | null)[]
  carried: number[]
  /** The locks holding a slot this week, and through which week. */
  locks: Lock[]
  /** Before the draft starts, a lock can be let go and his slot opened. */
  canRelease: boolean
  openSlot: number | null
  openCards: Player[] | null
  /** The bottom half of the table: one opened pack can go back for a fresh one. */
  mulligan: { has: boolean; usedOn: number | null }
  chemistry: Chemistry | null
  draftScore: number | null
  finalScore: number | null
  /** Regular season, after submitting: the one keeper still to choose. */
  canLock: boolean
  locked: string | null
  lockedIds: string[]
  /** After submitting, every pack opened against what it held. */
  board: Missed | null
}

async function context(leagueId: string, userId: string) {
  const league = await loadLeague(leagueId)
  if (!league) return { error: { ok: false as const, error: 'No such league.', status: 404 } }
  const { data } = await db()
    .from('pe_league_members')
    .select('*')
    .eq('league_id', league.id)
    .eq('user_id', userId)
    .maybeSingle()
  const member = (data as MemberRow | null) ?? null
  if (!member) return { error: { ok: false as const, error: 'You are not in this league.', status: 403 } }
  return { league, member }
}

async function weekDraft(league: LeagueRow, member: MemberRow): Promise<DraftRow | null> {
  const { data } = await db()
    .from('pe_league_drafts')
    .select('*')
    .eq('league_id', league.id)
    .eq('member_id', member.id)
    .eq('season_number', league.season_number)
    .eq('phase', league.phase)
    .eq('week_number', league.current_week)
    .maybeSingle()
  return (data as DraftRow | null) ?? null
}

/** The week's twist for the league as it stands. */
function currentRule(league: LeagueRow) {
  return league.week_rules === false ? weekRule(null) : ruleForWeek(league.id, league.season_number, league.phase, league.current_week)
}

function lineupOf(d: DraftRow): (Player | null)[] {
  if (d.roster) return d.roster
  const lineup: (Player | null)[] = Array(SLOT_COUNT).fill(null)
  for (const c of d.carried) lineup[c.slot] = c.player
  return lineup
}

type DealOf = Pick<DraftRow, 'seed' | 'boosted_slot' | 'pack_tier'>

/** A fresh pack for a slot: the Standings Pack's table on its slot, the
    ordinary one everywhere else. A mulligan deals off its own stream and never
    hands back a man from the pack it replaced. */
function packFor(d: DealOf, slot: number, lineup: (Player | null)[], again: string[] | null = null): Player[] {
  const table =
    d.boosted_slot === slot ? { normal: STANDINGS_WEIGHTS[d.pack_tier], boosted: STANDINGS_WEIGHTS[d.pack_tier] } : LEAGUE_ORDINARY
  return dealPack({
    label: `league:${d.seed}${again ? ':again' : ''}`,
    slot,
    base: table.normal,
    boosted: table.boosted,
    exclude: [...lineup.filter((p): p is Player => !!p).map((p) => p.id), ...(again ?? [])],
  })
}

/** Drafts started before 0103 kept no packs and re-deal off their seed, on the
    tables they were dealt from. Only one still in progress across the change
    needs this. */
const LEGACY_WEIGHTS: Record<PackTier, Weights> = {
  standard_pack: { common: 44.6, rare: 15.5, dynasty: 12.2, transcendent: 6.4, immortal: 0.7 },
  rising_pack: { common: 28.9, rare: 20.3, dynasty: 16.3, transcendent: 9.6, immortal: 1.4 },
  prime_pack: { common: 15.7, rare: 23.6, dynasty: 18.8, transcendent: 12.7, immortal: 2.8 },
  elite_drop: { common: 11.4, rare: 16.8, dynasty: 22, transcendent: 17.5, immortal: 5.6 },
}

function legacyPack(d: DraftRow, slot: number, lineup: (Player | null)[]): Player[] {
  const tier: PackTier = d.boosted_slot === slot ? d.pack_tier : 'standard_pack'
  return dealPack({
    label: `league:${d.seed}`,
    slot,
    base: LEGACY_WEIGHTS[tier],
    boosted: tier === 'elite_drop' ? { ...LEGACY_WEIGHTS.elite_drop, rare: 16.1 } : LEGACY_WEIGHTS[tier],
    exclude: lineup.filter((p): p is Player => !!p).map((p) => p.id),
  })
}

/** The pack a slot was dealt: kept on the row since 0103, re-dealt before it. */
function dealtPack(d: DraftRow, slot: number, lineup: (Player | null)[]): Player[] {
  return d.packs?.[slot] ?? (d.rule_id == null ? legacyPack(d, slot, lineup) : packFor(d, slot, lineup))
}

/** The lineup as it stands mid-draft: carried locks plus every pick so far,
    each taken from the pack it was dealt in. */
function liveLineup(d: DraftRow): (Player | null)[] {
  const lineup = lineupOf(d)
  if (d.roster) return lineup
  for (const pk of d.picks) {
    const p = dealtPack(d, pk.slot, lineup).find((x) => x.id === pk.id)
    if (p) lineup[pk.slot] = p
  }
  return lineup
}

/** Every pack opened, in order, against what it held. League packs change with
    what you keep, so there's no one perfect eleven: like Mystery's board. */
function boardFor(d: DraftRow): Missed | null {
  if (d.status !== 'submitted' || d.rule_id == null) return null
  const rows = d.picks.flatMap((pk) => {
    const cards = d.packs?.[pk.slot]
    return cards?.length ? [{ slot: pk.slot, cards, kept: pk.id }] : []
  })
  if (!rows.length) return null
  const board = mysteryMissed(rows, d.final_score ?? 0)
  for (const row of board.rows ?? []) {
    if (row.slot === d.mulligan_slot) row.note = 'Mulligan'
    else if (row.slot === d.boosted_slot) row.note = PACK_TIER_LABEL[d.pack_tier]
  }
  return board
}

function draftView(league: LeagueRow, member: MemberRow, d: DraftRow | null): DraftView {
  const live = league.phase === 'regular' ? liveLocks(member, league.current_week) : []
  const base = {
    league: { id: league.id, name: league.name, phase: league.phase, week: league.current_week },
    lockedIds: live.map((l) => l.player.id),
    locks: live,
  }
  if (!d) {
    const rule = currentRule(league)
    const lineup: (Player | null)[] = Array(SLOT_COUNT).fill(null)
    for (const c of live) lineup[c.slot] = c.player
    return {
      ...base,
      status: 'not_started',
      tier: member.next_pack_tier,
      boostedSlot: null,
      rule: weekRuleView(rule),
      ruleId: rule.id,
      lineup,
      carried: live.map((c) => c.slot),
      canRelease: league.phase === 'regular' && live.length > 0,
      openSlot: null,
      openCards: null,
      mulligan: { has: !!member.mulligan, usedOn: null },
      chemistry: null,
      draftScore: null,
      finalScore: null,
      canLock: false,
      locked: null,
      board: null,
    }
  }
  const rule = weekRule(d.rule_id)
  const lineup = liveLineup(d)
  return {
    ...base,
    status: d.status,
    tier: d.pack_tier,
    boostedSlot: d.boosted_slot,
    rule: weekRuleView(rule),
    ruleId: rule.id,
    lineup,
    carried: d.carried.map((c) => c.slot),
    canRelease: false,
    openSlot: d.open_slot,
    openCards: d.open_slot != null ? dealtPack(d, d.open_slot, lineup) : null,
    mulligan: { has: !!member.mulligan, usedOn: d.mulligan_slot ?? null },
    chemistry: d.chemistry,
    draftScore: d.draft_score,
    finalScore: d.final_score,
    canLock:
      d.status === 'submitted' &&
      league.phase === 'regular' &&
      league.current_week < REGULAR_WEEKS &&
      !d.locked_this_week,
    locked: d.locked_this_week,
    board: boardFor(d),
  }
}

export async function getDraft(leagueId: string, userId: string): Promise<{ ok: true; view: DraftView } | Fail> {
  const ctx = await context(leagueId, userId)
  if ('error' in ctx) return ctx.error!
  const { league, member } = ctx
  if (!drafts(league, member)) return { ok: false, error: 'There is no draft for you this week.' }
  return { ok: true, view: draftView(league, member, await weekDraft(league, member)) }
}

/** Let a lock go before the week's draft starts: his slot gets a pack again. */
export async function releaseLock(
  leagueId: string,
  userId: string,
  playerId: unknown
): Promise<{ ok: true; view: DraftView } | Fail> {
  const ctx = await context(leagueId, userId)
  if ('error' in ctx) return ctx.error!
  const { league, member } = ctx
  if (league.phase !== 'regular') return { ok: false, error: 'Locks only hold in the regular season.' }
  if (await weekDraft(league, member)) return { ok: false, error: 'Let a lock go before you start the week.' }
  const locks = member.permanent_locks ?? []
  if (!locks.some((l) => l.player.id === playerId)) return { ok: false, error: 'He is not locked.' }
  const next = locks.filter((l) => l.player.id !== playerId)
  await db().from('pe_league_members').update({ permanent_locks: next }).eq('id', member.id)
  return { ok: true, view: draftView(league, { ...member, permanent_locks: next }, null) }
}

export async function beginDraft(
  leagueId: string,
  userId: string,
  boostSlot: unknown
): Promise<{ ok: true; view: DraftView } | Fail> {
  const ctx = await context(leagueId, userId)
  if ('error' in ctx) return ctx.error!
  const { league, member } = ctx
  if (!drafts(league, member)) return { ok: false, error: 'There is no draft for you this week.' }
  const existing = await weekDraft(league, member)
  if (existing) return { ok: true, view: draftView(league, member, existing) }

  const carried = league.phase === 'regular' ? liveLocks(member, league.current_week) : []
  const taken = new Set(carried.map((c) => c.slot))
  // Everyone has a Standings Pack now, and it goes on an open slot.
  const s = Number(boostSlot)
  if (!Number.isInteger(s) || s < 0 || s >= SLOT_COUNT || taken.has(s)) {
    return { ok: false, error: 'Choose a slot for your Standings Pack.' }
  }

  const { data, error } = await db()
    .from('pe_league_drafts')
    .insert({
      league_id: league.id,
      member_id: member.id,
      user_id: userId,
      season_number: league.season_number,
      phase: league.phase,
      week_number: league.current_week,
      seed: newServerSeed(),
      pack_tier: member.next_pack_tier,
      boosted_slot: s,
      carried,
      rule_id: currentRule(league).id,
    })
    .select('*')
    .maybeSingle()
  if (error || !data) {
    // Another tab got there first. Use whatever it started.
    const again = await weekDraft(league, member)
    if (again) return { ok: true, view: draftView(league, member, again) }
    return { ok: false, error: 'Could not start your draft.' }
  }
  return { ok: true, view: draftView(league, member, data as DraftRow) }
}

export async function openLeaguePack(
  leagueId: string,
  userId: string,
  slot: unknown
): Promise<{ ok: true; view: DraftView } | Fail> {
  const ctx = await context(leagueId, userId)
  if ('error' in ctx) return ctx.error!
  const { league, member } = ctx
  const d = await weekDraft(league, member)
  if (!d) return { ok: false, error: 'Start your draft first.' }
  if (d.status !== 'drafting') return { ok: false, error: 'Your lineup is already in.' }
  // A pack already open stays open: open it, take a card. Same answer twice.
  if (d.open_slot != null) return { ok: true, view: draftView(league, member, d) }

  const s = Number(slot)
  const lineup = liveLineup(d)
  if (!Number.isInteger(s) || s < 0 || s >= SLOT_COUNT) return { ok: false, error: 'No such slot.' }
  if (lineup[s]) return { ok: false, error: 'That slot is already filled.' }

  // Dealt once and kept, so the same five come back on a refresh.
  const pack = d.rule_id == null ? legacyPack(d, s, lineup) : packFor(d, s, lineup)
  const { data } = await db()
    .from('pe_league_drafts')
    .update({ open_slot: s, packs: { ...(d.packs ?? {}), [s]: pack } })
    .eq('id', d.id)
    .is('open_slot', null)
    .select('*')
    .maybeSingle()
  const fresh = (data as DraftRow | null) ?? (await weekDraft(league, member))
  if (!fresh) return { ok: false, error: 'Could not open that pack.' }
  return { ok: true, view: draftView(league, member, fresh) }
}

/** Throw the open pack back for a fresh one. Once a week, bottom half only. */
export async function mulliganPack(leagueId: string, userId: string): Promise<{ ok: true; view: DraftView } | Fail> {
  const ctx = await context(leagueId, userId)
  if ('error' in ctx) return ctx.error!
  const { league, member } = ctx
  const d = await weekDraft(league, member)
  if (!d || d.status !== 'drafting' || d.open_slot == null) return { ok: false, error: 'Open a pack first.' }
  if (!member.mulligan) return { ok: false, error: 'No mulligan this week.' }
  if (d.mulligan_slot != null) return { ok: false, error: 'You have used your mulligan.' }

  const slot = d.open_slot
  const lineup = liveLineup(d)
  const old = dealtPack(d, slot, lineup)
  const pack = packFor(d, slot, lineup, old.map((p) => p.id))
  const { data } = await db()
    .from('pe_league_drafts')
    .update({ packs: { ...(d.packs ?? {}), [slot]: pack }, mulligan_slot: slot, thrown: old })
    .eq('id', d.id)
    .eq('open_slot', slot)
    .is('mulligan_slot', null)
    .select('*')
    .maybeSingle()
  const fresh = (data as DraftRow | null) ?? (await weekDraft(league, member))
  if (!fresh) return { ok: false, error: 'That pack would not go back.' }
  return { ok: true, view: draftView(league, member, fresh) }
}

export async function pickLeagueCard(
  leagueId: string,
  userId: string,
  cardId: unknown
): Promise<{ ok: true; view: DraftView } | Fail> {
  const ctx = await context(leagueId, userId)
  if ('error' in ctx) return ctx.error!
  const { league, member } = ctx
  const d = await weekDraft(league, member)
  if (!d || d.status !== 'drafting') return { ok: false, error: 'No draft in progress.' }
  if (d.open_slot == null) return { ok: false, error: 'Open a pack first.' }

  const lineup = liveLineup(d)
  const card = dealtPack(d, d.open_slot, lineup).find((p) => p.id === cardId)
  if (!card) return { ok: false, error: 'That card is not in this pack.' }

  const picks = [...d.picks, { slot: d.open_slot, id: card.id }]
  const { data } = await db()
    .from('pe_league_drafts')
    .update({ picks, open_slot: null })
    .eq('id', d.id)
    .eq('open_slot', d.open_slot)
    .select('*')
    .maybeSingle()
  const fresh = (data as DraftRow | null) ?? (await weekDraft(league, member))
  if (!fresh) return { ok: false, error: 'That pick did not save.' }
  return { ok: true, view: draftView(league, member, fresh) }
}

/** A full eleven's score for the week: the cards under the twist, and
    chemistry the way every mode counts it now. */
function scoreWeek(roster: Player[], d: Pick<DraftRow, 'boosted_slot' | 'rule_id'>) {
  // Drafts from before 0103 score as they were started: soft chemistry, no twist.
  if (d.rule_id == null) {
    const chem = chemistryFor(roster)
    const cards = lineupScore(roster)
    return { draftScore: cards, chemistry: chem, finalScore: cards + chem.total }
  }
  const s = weekScore(roster, d.boosted_slot, d.rule_id)
  return { draftScore: s.cards + s.ruleDelta, chemistry: s.chem, finalScore: s.total }
}

export async function submitLeagueDraft(
  leagueId: string,
  userId: string
): Promise<{ ok: true; view: DraftView } | Fail> {
  const ctx = await context(leagueId, userId)
  if ('error' in ctx) return ctx.error!
  const { league, member } = ctx
  const d = await weekDraft(league, member)
  if (!d) return { ok: false, error: 'No draft in progress.' }
  if (d.status === 'submitted') return { ok: true, view: draftView(league, member, d) }

  const lineup = liveLineup(d)
  if (lineup.some((p) => !p)) return { ok: false, error: 'Fill every slot first.' }
  const roster = lineup as Player[]
  const { draftScore, chemistry, finalScore } = scoreWeek(roster, d)

  const { data } = await db()
    .from('pe_league_drafts')
    .update({
      status: 'submitted',
      roster,
      draft_score: draftScore,
      chemistry,
      final_score: finalScore,
      completed_at: new Date().toISOString(),
    })
    .eq('id', d.id)
    .eq('status', 'drafting')
    .select('*')
    .maybeSingle()
  const fresh = (data as DraftRow | null) ?? (await weekDraft(league, member))
  if (!fresh) return { ok: false, error: 'Could not submit.' }
  return { ok: true, view: draftView(league, member, fresh) }
}

export async function lockPlayer(
  leagueId: string,
  userId: string,
  playerId: unknown
): Promise<{ ok: true; view: DraftView } | Fail> {
  const ctx = await context(leagueId, userId)
  if ('error' in ctx) return ctx.error!
  const { league, member } = ctx
  const d = await weekDraft(league, member)
  if (!d || d.status !== 'submitted') return { ok: false, error: 'Submit this week first.' }
  if (league.phase !== 'regular' || league.current_week >= REGULAR_WEEKS) {
    return { ok: false, error: 'Nothing left to lock him for.' }
  }
  if (d.locked_this_week) return { ok: false, error: 'You have already locked someone this week.' }

  const roster = (d.roster ?? []) as (Player | null)[]
  const slot = roster.findIndex((p) => p?.id === playerId)
  if (slot < 0) return { ok: false, error: 'He is not on this week’s roster.' }
  // Only locks that still hold next week are in the way.
  const holding = liveLocks(member, league.current_week + 1)
  if (holding.some((l) => l.player.id === playerId || l.slot === slot)) return { ok: false, error: 'That slot is already locked.' }

  const { data } = await db()
    .from('pe_league_drafts')
    .update({ locked_this_week: playerId })
    .eq('id', d.id)
    .is('locked_this_week', null)
    .select('*')
    .maybeSingle()
  if (!data) return { ok: false, error: 'You have already locked someone this week.' }
  const nextLocks: Lock[] = [...holding, { slot, player: roster[slot] as Player, until: league.current_week + LOCK_WEEKS }]
  await db().from('pe_league_members').update({ permanent_locks: nextLocks }).eq('id', member.id)
  return { ok: true, view: draftView(league, { ...member, permanent_locks: nextLocks }, data as DraftRow) }
}

// ============================================================
// Team view
// ============================================================

export type TeamView = {
  league: { id: string; name: string; phase: LeaguePhase; week: number }
  member: { id: string; name: string; team: string | null; you: boolean }
  /** The most recent draft the viewer is allowed to see. */
  draft: {
    phase: string
    week: number
    lineup: (Player | null)[]
    draftScore: number
    chemistry: Chemistry
    finalScore: number
    /** The twist it was drafted under, its Standings Pack and where it went. */
    ruleId: string | null
    rule: WeekRuleView | null
    tier: PackTier
    packSlot: number | null
    board: Missed | null
  } | null
  /** Locks holding a slot this week. */
  locks: Lock[]
}

export async function teamView(leagueId: string, memberId: string, userId: string | null): Promise<TeamView | null> {
  const league = await loadLeague(leagueId)
  if (!league) return null
  const { data: m } = await db().from('pe_league_members').select('*').eq('id', memberId).eq('league_id', league.id).maybeSingle()
  const member = (m as MemberRow | null) ?? null
  if (!member) return null
  const you = !!userId && member.user_id === userId

  const { data: rows } = await db()
    .from('pe_league_drafts')
    .select('*')
    .eq('league_id', league.id)
    .eq('member_id', member.id)
    .eq('season_number', league.season_number)
    .eq('status', 'submitted')
    .order('completed_at', { ascending: false })
  const list = (rows ?? []) as DraftRow[]
  // Somebody else's current-week draft stays hidden until the week turns.
  const visible = list.find(
    (d) => you || !(d.phase === league.phase && d.week_number === league.current_week && league.phase !== 'complete')
  )

  return {
    league: { id: league.id, name: league.name, phase: league.phase, week: league.current_week },
    member: { id: member.id, name: member.display_name, team: member.team_name, you },
    draft: visible
      ? {
          phase: visible.phase,
          week: visible.week_number,
          lineup: (visible.roster ?? []) as (Player | null)[],
          draftScore: visible.draft_score ?? 0,
          chemistry: visible.chemistry ?? { bonds: [], synergy: 0, rivalry: 0, total: 0 },
          finalScore: visible.final_score ?? 0,
          ruleId: visible.rule_id,
          rule: visible.rule_id ? weekRuleView(weekRule(visible.rule_id)) : null,
          tier: visible.pack_tier,
          packSlot: visible.boosted_slot,
          board: boardFor(visible),
        }
      : null,
    locks: league.phase === 'regular' ? liveLocks(member, league.current_week) : [],
  }
}

// ============================================================
// Commissioner
// ============================================================

async function asCommissioner(leagueId: string, userId: string) {
  const league = await loadLeague(leagueId)
  if (!league) return { error: { ok: false as const, error: 'No such league.', status: 404 } }
  if (league.commissioner_id !== userId) return { error: { ok: false as const, error: 'Only the commissioner can do that.', status: 403 } }
  return { league }
}

export async function startSeason(leagueId: string, userId: string): Promise<{ ok: true } | Fail> {
  const c = await asCommissioner(leagueId, userId)
  if ('error' in c) return c.error!
  const members = await loadMembers(c.league.id)
  if (c.league.phase !== 'pregame') return { ok: false, error: 'The season is already under way.' }
  if (members.length < MIN_LEAGUE_PLAYERS) return { ok: false, error: `You need at least ${MIN_LEAGUE_PLAYERS} teams.` }
  await db().from('pe_leagues').update({ phase: 'regular', current_week: 1 }).eq('id', c.league.id).eq('phase', 'pregame')
  await playCpuWeek(c.league.id)
  return { ok: true }
}

/**
 * Close the current week: reveal every draft, add the scores in, re-rank,
 * hand out next week's packs, and move the league on. A team that didn't
 * draft scores nothing for the week; the league doesn't wait for anyone.
 */
export async function advanceWeek(leagueId: string, userId: string): Promise<{ ok: true; to: string } | Fail> {
  const c = await asCommissioner(leagueId, userId)
  if ('error' in c) return c.error!
  if (!['regular', 'gauntlet', 'finals'].includes(c.league.phase)) return { ok: false, error: 'There is no week to close.' }
  // They play the week the moment it opens; this is only a CPU that missed it.
  await playCpuWeek(c.league.id)
  const out = await closeWeek(c.league)
  if (out.ok) await playCpuWeek(c.league.id)
  return out
}

async function closeWeek(league: LeagueRow): Promise<{ ok: true; to: string } | Fail> {

  const members = await loadMembers(league.id)
  const { data: weekRows } = await db()
    .from('pe_league_drafts')
    .select('member_id, status, final_score')
    .eq('league_id', league.id)
    .eq('season_number', league.season_number)
    .eq('phase', league.phase)
    .eq('week_number', league.current_week)
  const score = new Map<string, number>()
  for (const r of (weekRows ?? []) as { member_id: string; status: string; final_score: number | null }[]) {
    if (r.status === 'submitted') score.set(r.member_id, r.final_score ?? 0)
  }

  // Drafts started and never finished don't count, and aren't kept.
  await db()
    .from('pe_league_drafts')
    .delete()
    .eq('league_id', league.id)
    .eq('season_number', league.season_number)
    .eq('phase', league.phase)
    .eq('week_number', league.current_week)
    .eq('status', 'drafting')

  const field = league.phase === 'regular' ? members : members.filter((m) => m.playoff_active)
  const ranked = [...field].sort(
    (a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || b.team_score - a.team_score
  )
  const tierOf = new Map(ranked.map((m, i) => [m.id, packTierForRank(i + 1, ranked.length)]))
  // The mulligan goes to the bottom half of the table, not of the week: it's for
  // a team that's behind, not one that had one bad night. In the sim that's what
  // brings a slow start back as often as luck alone would (sim/league-cpu-sim.ts).
  const mulligans = (running: Map<string, number>, among: MemberRow[]) => {
    const order = [...among].sort((a, b) => (running.get(b.id) ?? 0) - (running.get(a.id) ?? 0))
    return new Map(order.map((m, i) => [m.id, mulliganForRank(i + 1, order.length)]))
  }

  const update = (id: string, patch: Record<string, unknown>) =>
    db().from('pe_league_members').update(patch).eq('id', id)

  if (league.phase === 'regular') {
    const totals = new Map(members.map((m) => [m.id, m.team_score + (score.get(m.id) ?? 0)]))
    const mullOf = mulligans(totals, members)

    if (league.current_week >= REGULAR_WEEKS) {
      const size = playoffFieldSize(league.playoff_size, members.length)
      const seeded = [...members].sort((a, b) => totals.get(b.id)! - totals.get(a.id)! || a.joined_at.localeCompare(b.joined_at))
      await Promise.all(
        seeded.map((m, i) =>
          update(m.id, {
            team_score: totals.get(m.id),
            next_pack_tier: tierOf.get(m.id) ?? 'standard_pack',
            // Everyone starts the postseason level, so the low seeds get it.
            mulligan: i < size && mulliganForRank(i + 1, size),
            playoff_active: i < size,
            playoff_seed: i < size ? i + 1 : null,
            playoff_score: 0,
          })
        )
      )
      const to = size <= 2 ? 'finals' : 'gauntlet'
      await db().from('pe_leagues').update({ phase: to, current_week: 1 }).eq('id', league.id)
      return { ok: true, to }
    }

    // Locks that have run their weeks let go of their slots here.
    const next = league.current_week + 1
    await Promise.all(
      members.map((m) =>
        update(m.id, {
          team_score: totals.get(m.id),
          next_pack_tier: tierOf.get(m.id) ?? 'standard_pack',
          mulligan: mullOf.get(m.id) ?? false,
          permanent_locks: liveLocks(m, next),
        })
      )
    )
    await db().from('pe_leagues').update({ current_week: league.current_week + 1 }).eq('id', league.id)
    return { ok: true, to: `week ${league.current_week + 1}` }
  }

  const playoff = new Map(field.map((m) => [m.id, m.playoff_score + (score.get(m.id) ?? 0)]))
  const order = [...field].sort(
    (a, b) => playoff.get(b.id)! - playoff.get(a.id)! || (a.playoff_seed ?? 99) - (b.playoff_seed ?? 99)
  )

  if (league.phase === 'gauntlet') {
    const through = Math.ceil(order.length / 2)
    await Promise.all(
      order.map((m, i) =>
        update(m.id, {
          playoff_score: playoff.get(m.id),
          next_pack_tier: tierOf.get(m.id) ?? 'standard_pack',
          // The lower finalist gets it; a team that's out doesn't.
          mulligan: i < through && mulliganForRank(i + 1, through),
          playoff_active: i < through,
          playoff_seed: i < through ? i + 1 : null,
        })
      )
    )
    await db().from('pe_leagues').update({ phase: 'finals', current_week: 1 }).eq('id', league.id)
    return { ok: true, to: 'finals' }
  }

  // The Final. The phase flips first and only if it is still the Final, so
  // a double-tapped button can't hand the champion a second title.
  const { data: closed } = await db()
    .from('pe_leagues')
    .update({ phase: 'complete' })
    .eq('id', league.id)
    .eq('phase', 'finals')
    .select('id')
  if (!closed?.length) return { ok: true, to: 'complete' }
  await Promise.all(
    order.map((m, i) =>
      update(m.id, {
        playoff_score: playoff.get(m.id),
        playoff_active: i === 0,
        playoff_seed: i === 0 ? 1 : null,
        // Kept across seasons, unlike everything above: a new season wipes
        // the standings, and this is the one thing it shouldn't.
        ...(i === 0 ? { titles: (m.titles ?? 0) + 1 } : {}),
      })
    )
  )
  return { ok: true, to: 'complete' }
}

// ============================================================
// CPU teams
// ============================================================
//
// The commissioner fills seats with them before a season: a few, or every
// seat but their own. They draft the moment a week opens, see each pack only
// as they open it, and keep a man off his own week (see leagueCpu.ts). A
// person who joins later takes a CPU's seat.

export async function addCpus(leagueId: string, userId: string, fill: unknown): Promise<{ ok: true } | Fail> {
  const c = await asCommissioner(leagueId, userId)
  if ('error' in c) return c.error!
  if (c.league.phase !== 'pregame') return { ok: false, error: 'CPU teams join before the season starts.' }
  const members = await loadMembers(c.league.id)
  const room = c.league.max_players - members.length
  if (room <= 0) return { ok: false, error: 'This league is full.' }
  const taken = new Set(members.map((m) => m.team_name ?? ''))
  const rows = Array.from({ length: fill === true ? room : 1 }, () => {
    const team = cpuTeamName(taken)
    taken.add(team)
    return { league_id: c.league.id, user_id: null, is_cpu: true, display_name: 'CPU', team_name: team }
  })
  const { error } = await db().from('pe_league_members').insert(rows)
  return error ? { ok: false, error: 'Could not add a CPU team.' } : { ok: true }
}

export async function removeCpus(leagueId: string, userId: string): Promise<{ ok: true } | Fail> {
  const c = await asCommissioner(leagueId, userId)
  if ('error' in c) return c.error!
  if (c.league.phase !== 'pregame') return { ok: false, error: 'CPU teams stay for the season once it starts.' }
  await db().from('pe_league_members').delete().eq('league_id', c.league.id).eq('is_cpu', true)
  return { ok: true }
}

/** Every CPU team that drafts this week and hasn't yet, drafts. */
async function playCpuWeek(leagueId: string): Promise<void> {
  const league = await loadLeague(leagueId)
  if (!league || !['regular', 'gauntlet', 'finals'].includes(league.phase)) return
  const cpus = (await loadMembers(league.id)).filter((m) => m.is_cpu && drafts(league, m))
  if (!cpus.length) return
  const { data } = await db()
    .from('pe_league_drafts')
    .select('member_id')
    .eq('league_id', league.id)
    .eq('season_number', league.season_number)
    .eq('phase', league.phase)
    .eq('week_number', league.current_week)
  const done = new Set(((data ?? []) as { member_id: string }[]).map((r) => r.member_id))
  await Promise.all(cpus.filter((m) => !done.has(m.id)).map((m) => playCpu(league, m)))
}

async function playCpu(league: LeagueRow, member: MemberRow): Promise<void> {
  const carried = league.phase === 'regular' ? liveLocks(member, league.current_week) : []
  const lineup: (Player | null)[] = Array(SLOT_COUNT).fill(null)
  for (const c of carried) lineup[c.slot] = c.player
  const open = lineup.flatMap((p, i) => (p ? [] : [i]))

  // The Standings Pack is placed before a single pack is dealt, like anyone's.
  const ruleId = currentRule(league).id
  const tier = member.next_pack_tier
  const deal = { seed: newServerSeed(), pack_tier: tier, boosted_slot: cpuBoostSlot(tier, open, ruleId) }
  const week = cpuDraft({
    lineup,
    packSlot: deal.boosted_slot,
    tier,
    ruleId,
    mulligan: !!member.mulligan,
    deal: (slot, now) => packFor(deal, slot, now),
    redeal: (slot, now, thrown) => packFor(deal, slot, now, thrown.map((p) => p.id)),
  })
  const row = { ...deal, carried, picks: week.picks, packs: week.packs, rule_id: ruleId, roster: null } as unknown as DraftRow
  const roster = liveLineup(row)
  if (roster.some((p) => !p)) return
  const full = roster as Player[]
  const { draftScore, chemistry, finalScore } = scoreWeek(full, row)

  // Its keeper, off this week's eleven. Next week's packs aren't dealt yet.
  const keep =
    league.phase === 'regular' && league.current_week < REGULAR_WEEKS
      ? cpuLock(full, new Set(liveLocks(member, league.current_week + 1).map((c) => c.slot)))
      : null

  const now = new Date().toISOString()
  const { error } = await db().from('pe_league_drafts').insert({
    league_id: league.id,
    member_id: member.id,
    user_id: null,
    season_number: league.season_number,
    phase: league.phase,
    week_number: league.current_week,
    status: 'submitted',
    ...deal,
    carried,
    picks: week.picks,
    packs: week.packs,
    rule_id: ruleId,
    mulligan_slot: week.mulliganSlot,
    thrown: week.thrown,
    roster: full,
    draft_score: draftScore,
    chemistry,
    final_score: finalScore,
    locked_this_week: keep?.player.id ?? null,
    started_at: now,
    completed_at: now,
  })
  // A second call for the same week loses on the unique key and changes nothing.
  if (error || !keep) return
  await db()
    .from('pe_league_members')
    .update({ permanent_locks: [...liveLocks(member, league.current_week + 1), { ...keep, until: league.current_week + LOCK_WEEKS }] })
    .eq('id', member.id)
}

export async function newSeason(leagueId: string, userId: string): Promise<{ ok: true } | Fail> {
  const c = await asCommissioner(leagueId, userId)
  if ('error' in c) return c.error!
  if (c.league.phase !== 'complete') return { ok: false, error: 'Finish this season first.' }
  await db()
    .from('pe_leagues')
    .update({ phase: 'pregame', current_week: 1, season_number: c.league.season_number + 1 })
    .eq('id', c.league.id)
  await db()
    .from('pe_league_members')
    .update({
      team_score: 0,
      playoff_score: 0,
      next_pack_tier: 'standard_pack',
      mulligan: false,
      permanent_locks: [],
      playoff_active: false,
      playoff_seed: null,
    })
    .eq('league_id', c.league.id)
  // Old drafts are kept: they are the record of the seasons played.
  return { ok: true }
}

/** The weekly twist, on or off. Before the season only, so no week changes
    its rules under a team that has already drafted it. */
export async function setWeekRules(leagueId: string, userId: string, on: unknown): Promise<{ ok: true } | Fail> {
  const c = await asCommissioner(leagueId, userId)
  if ('error' in c) return c.error!
  if (c.league.phase !== 'pregame') return { ok: false, error: 'Set the twists before the season starts.' }
  await db().from('pe_leagues').update({ week_rules: on === true }).eq('id', c.league.id)
  return { ok: true }
}

export async function deleteLeague(leagueId: string, userId: string): Promise<{ ok: true } | Fail> {
  const c = await asCommissioner(leagueId, userId)
  if ('error' in c) return c.error!
  await db().from('pe_leagues').delete().eq('id', c.league.id)
  return { ok: true }
}

export async function leaveLeague(leagueId: string, userId: string): Promise<{ ok: true } | Fail> {
  const league = await loadLeague(leagueId)
  if (!league) return { ok: false, error: 'No such league.', status: 404 }
  if (league.commissioner_id === userId) return { ok: false, error: 'The commissioner can delete the league, not leave it.' }
  if (league.phase !== 'pregame') return { ok: false, error: 'You can only leave before the season starts.' }
  await db().from('pe_league_members').delete().eq('league_id', league.id).eq('user_id', userId)
  return { ok: true }
}

export async function renameTeam(leagueId: string, userId: string, raw: unknown): Promise<{ ok: true } | Fail> {
  const name = cleanTeamName(raw)
  if (!name) return { ok: false, error: 'Team names run 2 to 28 characters.' }
  const league = await loadLeague(leagueId)
  if (!league) return { ok: false, error: 'No such league.', status: 404 }
  const { error } = await db().from('pe_league_members').update({ team_name: name }).eq('league_id', league.id).eq('user_id', userId)
  return error ? { ok: false, error: 'Could not rename the team.' } : { ok: true }
}
