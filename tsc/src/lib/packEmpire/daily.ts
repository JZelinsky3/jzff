// The Daily. SERVER ONLY.
//
// One deal a day, the same for everybody, one attempt each, as hard as the game
// gets: every card blind, chemistry at double, packs of mixed positions opened
// in a fixed order, and one rule that changes what counts. Two versions, Range
// and Ball Knower, each with its own deal and its own board, so playing one is
// no look at the other. A new day starts at midnight Eastern.
//
// The server holds a run, not the browser. It deals one pack at a time and
// only after the last one was answered, so there's no opening them all in
// another tab to plan around them, and nothing about a card's value leaves
// here until the eleventh pick. That also means an account is required: a run
// nobody owns can be replayed forever, and anybody who has seen the reveal knows
// today's answers. Someone determined can still scout with a second account;
// it costs them that account's Daily, and that's as far as this goes.
//
// Top lineups are the other leak. Today's stay hidden until you've finished
// that version, otherwise the board is an answer sheet. Past days are open.

import { createAdminClient } from '@/lib/supabase/admin'
import { recordPacks } from './binder'
import { ruleForDay, ruleView, scoreLineup, type DailyScore, type DayRuleView } from './dayRules'
import { dailyPack, dailySet, maskCard, type DailyPick } from './deal'
import { nameForUser } from './people'
import { playerById } from './pool'
import { SLOT_COUNT, slotForCard, type Player } from './rules'

export type DailyVersion = 'range' | 'season'

export const DAILY_VERSIONS: DailyVersion[] = ['range', 'season']

export function isDailyVersion(v: unknown): v is DailyVersion {
  return v === 'range' || v === 'season'
}

/** Today in Eastern time, 'YYYY-MM-DD'. */
export function dayKey(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

export function isDay(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
}

export type DailyDetail = DailyScore & { lineup: Player[] }

type Row = {
  day: string
  version: DailyVersion
  user_id: string
  name: string
  captain: number | null
  picks: DailyPick[]
  step: number
  done: boolean
  score: number | null
  detail: DailyDetail | null
  started_at: string
  finished_at: string | null
}

export type PackLook = { cards: Player[]; kept: string; reserve: boolean }

export type DailyResult = DailyDetail & {
  captain: number | null
  rank: number
  entrants: number
  /** Every pack as it was, cards turned over, with what you kept. */
  packs: PackLook[]
}

export type DailyState = {
  day: string
  version: DailyVersion
  rule: DayRuleView
  started: boolean
  captain: number | null
  /** Masked until the run is done. */
  lineup: (Player | null)[]
  step: number
  /** The pack you're on, masked. Null before you've started and once done. */
  pack: Player[] | null
  /** The card in it that's a reserve. */
  reserve: string | null
  done: boolean
  result: DailyResult | null
}

export type Fail = { ok: false; error: string; status?: number }

const db = () => createAdminClient()

async function load(day: string, version: DailyVersion, userId: string): Promise<Row | null> {
  const { data } = await db()
    .from('pe_daily_runs')
    .select('*')
    .eq('day', day)
    .eq('version', version)
    .eq('user_id', userId)
    .maybeSingle()
  return (data as Row | null) ?? null
}

/** Each pack of a finished run, played back. A pack depends only on what was
    kept before it, so walking the picks again finds exactly what was dealt. */
function packsOf(row: Pick<Row, 'day' | 'version' | 'captain' | 'picks'>): PackLook[] {
  const set = dailySet(row.day, row.version)
  return row.picks.map((pick, i) => {
    const { cards, reserve } = dailyPack(set, row.captain, row.picks.slice(0, i))
    return { cards, kept: pick.id, reserve: reserve === pick.id }
  })
}

async function resultOf(row: Row): Promise<DailyResult | null> {
  if (!row.done || !row.detail || row.score == null) return null
  const count = async (better: boolean) => {
    let q = db()
      .from('pe_daily_runs')
      .select('user_id', { count: 'exact', head: true })
      .eq('day', row.day)
      .eq('version', row.version)
      .eq('done', true)
    if (better) q = q.gt('score', row.score as number)
    return (await q).count ?? 0
  }
  const [above, entrants] = await Promise.all([count(true), count(false)])
  return { ...row.detail, captain: row.captain, rank: above + 1, entrants, packs: packsOf(row) }
}

async function stateOf(day: string, version: DailyVersion, row: Row | null): Promise<DailyState> {
  const rule = ruleForDay(day)
  const base: DailyState = {
    day,
    version,
    rule: ruleView(rule),
    started: !!row,
    captain: row?.captain ?? null,
    lineup: Array(SLOT_COUNT).fill(null),
    step: row?.step ?? 0,
    pack: null,
    reserve: null,
    done: !!row?.done,
    result: null,
  }
  if (!row) return base
  if (row.done) return { ...base, lineup: row.detail?.lineup ?? base.lineup, result: await resultOf(row) }

  const lineup = [...base.lineup]
  for (const pick of row.picks) {
    const card = playerById(pick.id)
    if (card) lineup[pick.slot] = maskCard(card, version)
  }
  const { cards, reserve } = dailyPack(dailySet(day, version), row.captain, row.picks)
  return { ...base, lineup, pack: cards.map((c) => maskCard(c, version)), reserve }
}

/** Where this account stands on today's Daily. Signed out, a run that hasn't
    started, which is enough to show the rule. */
export async function dailyState(userId: string | null, version: DailyVersion): Promise<DailyState> {
  const day = dayKey()
  return stateOf(day, version, userId ? await load(day, version, userId) : null)
}

/** Sign in for today. The captain is the commitment: it decides the first
    pack, and asking again changes nothing. */
export async function startDaily(
  userId: string,
  version: DailyVersion,
  rawCaptain: unknown
): Promise<{ ok: true; state: DailyState } | Fail> {
  const day = dayKey()
  const existing = await load(day, version, userId)
  if (existing) return { ok: true, state: await stateOf(day, version, existing) }

  const rule = ruleForDay(day)
  let captain: number | null = null
  if (!rule.noCaptain) {
    if (!Number.isInteger(rawCaptain) || (rawCaptain as number) < 0 || (rawCaptain as number) >= SLOT_COUNT) {
      return { ok: false, error: 'Pick a captain first.' }
    }
    captain = rawCaptain as number
  }

  const name = await nameForUser(db(), userId)
  const { error } = await db().from('pe_daily_runs').insert({ day, version, user_id: userId, name, captain })
  // 23505 is this account's other tab getting there first.
  if (error && error.code !== '23505') return { ok: false, error: 'Could not start your Daily.' }
  return { ok: true, state: await stateOf(day, version, await load(day, version, userId)) }
}

/** Keep one card from the current pack. The eleventh is the one that scores
    the run and turns everything over. */
export async function pickDaily(
  userId: string,
  version: DailyVersion,
  id: unknown
): Promise<{ ok: true; state: DailyState } | Fail> {
  const day = dayKey()
  const row = await load(day, version, userId)
  if (!row) return { ok: false, error: 'That Daily has ended. A new one is up.', status: 409 }
  if (row.done) return { ok: true, state: await stateOf(day, version, row) }

  const { cards } = dailyPack(dailySet(day, version), row.captain, row.picks)
  const card = cards.find((c) => c.id === id)
  if (!card) return { ok: false, error: 'That card is not in this pack.' }

  const filled = new Set(row.picks.map((p) => p.slot))
  const locked = row.captain != null && row.picks.length === 0
  const slot = locked ? (row.captain as number) : slotForCard(card.pos, filled)
  if (slot < 0) return { ok: false, error: `You have no ${card.pos} slot left. Take a card you have a slot for.` }

  const picks = [...row.picks, { id: card.id, slot }]
  const patch: Record<string, unknown> = { picks, step: picks.length }

  const finished = picks.length === SLOT_COUNT
  if (finished) {
    const lineup = Array<Player | null>(SLOT_COUNT).fill(null)
    for (const p of picks) lineup[p.slot] = playerById(p.id)
    const full = lineup as Player[]
    const scored = scoreLineup(full, row.captain, ruleForDay(day))
    patch.done = true
    patch.score = scored.total
    patch.detail = { ...scored, lineup: full }
    patch.finished_at = new Date().toISOString()
  }

  const { data } = await db()
    .from('pe_daily_runs')
    .update(patch)
    .eq('day', day)
    .eq('version', version)
    .eq('user_id', userId)
    .eq('step', row.step)
    .select('*')
    .maybeSingle()
  const fresh = (data as Row | null) ?? (await load(day, version, userId))
  if (!fresh) return { ok: false, error: 'Could not save that pick.' }

  if (finished && data) {
    await recordPacks(
      userId,
      'daily',
      packsOf(fresh).map((p, i) => ({
        deal: `daily:${day}:${version}`,
        slot: i,
        cards: p.cards.map((c) => c.id),
        kept: p.kept,
      }))
    )
  }
  return { ok: true, state: await stateOf(day, version, fresh) }
}

// ============================================================
// The boards
// ============================================================

/** Rows a day's board shows. */
export const DAILY_TOP = 5

export type DailyRow = {
  rank: number
  name: string
  score: number
  you: boolean
  /** Null while it's hidden: today, until you've finished this version. */
  detail: DailyDetail | null
  captain: number | null
}

export type DailyBoard = {
  version: DailyVersion
  rows: DailyRow[]
  entrants: number
  /** Your own run, whether or not it made the top. */
  you: DailyRow | null
  /** Whether you've started, for the play button. */
  yourStep: number | null
  yourRank: number | null
  locked: boolean
}

async function boardFor(day: string, version: DailyVersion, userId: string | null, isToday: boolean): Promise<DailyBoard> {
  const [top, mine, count] = await Promise.all([
    db()
      .from('pe_daily_runs')
      .select('*')
      .eq('day', day)
      .eq('version', version)
      .eq('done', true)
      .order('score', { ascending: false })
      .order('finished_at', { ascending: true })
      .limit(DAILY_TOP),
    userId ? load(day, version, userId) : Promise.resolve(null),
    db()
      .from('pe_daily_runs')
      .select('user_id', { count: 'exact', head: true })
      .eq('day', day)
      .eq('version', version)
      .eq('done', true),
  ])

  const locked = isToday && !mine?.done
  const shown = (r: Row, rank: number): DailyRow => ({
    rank,
    name: r.name,
    score: r.score ?? 0,
    you: r.user_id === userId,
    detail: locked ? null : r.detail,
    captain: r.captain,
  })
  const rows = ((top.data ?? []) as Row[]).map((r, i) => shown(r, i + 1))

  let yourRank: number | null = null
  if (mine?.done && mine.score != null) {
    const { count: above } = await db()
      .from('pe_daily_runs')
      .select('user_id', { count: 'exact', head: true })
      .eq('day', day)
      .eq('version', version)
      .eq('done', true)
      .gt('score', mine.score)
    yourRank = (above ?? 0) + 1
  }
  return {
    version,
    rows,
    entrants: count.count ?? 0,
    you: mine?.done && yourRank ? shown(mine, yourRank) : null,
    yourStep: mine ? (mine.done ? SLOT_COUNT : mine.step) : null,
    yourRank,
    locked,
  }
}

export type DayRecap = { day: string; rule: DayRuleView; winners: { version: DailyVersion; name: string; score: number }[] }

export type YourDaily = { day: string; version: DailyVersion; score: number; title: string }

export type DailyLobby = {
  day: string
  rule: DayRuleView
  boards: DailyBoard[]
  /** Finished days, newest first. */
  past: DayRecap[]
  yours: YourDaily[]
}

const PAST_DAYS = 14

function daysBefore(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export async function dailyLobby(userId: string | null): Promise<DailyLobby> {
  const day = dayKey()
  const [boards, recent, yours] = await Promise.all([
    Promise.all(DAILY_VERSIONS.map((v) => boardFor(day, v, userId, true))),
    db()
      .from('pe_daily_runs')
      .select('day, version, name, score')
      .eq('done', true)
      .lt('day', day)
      .gte('day', daysBefore(day, PAST_DAYS))
      .order('score', { ascending: false })
      .limit(500),
    userId
      ? db()
          .from('pe_daily_runs')
          .select('day, version, score')
          .eq('user_id', userId)
          .eq('done', true)
          .lt('day', day)
          .order('day', { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] }),
  ])

  const byDay = new Map<string, DayRecap>()
  for (const r of (recent.data ?? []) as { day: string; version: DailyVersion; name: string; score: number }[]) {
    const recap = byDay.get(r.day) ?? { day: r.day, rule: ruleView(ruleForDay(r.day)), winners: [] }
    // Highest first, so the first row seen per version is the winner.
    if (!recap.winners.some((w) => w.version === r.version)) recap.winners.push(r)
    byDay.set(r.day, recap)
  }

  return {
    day,
    rule: ruleView(ruleForDay(day)),
    boards,
    past: [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)),
    yours: ((yours.data ?? []) as { day: string; version: DailyVersion; score: number }[]).map((r) => ({
      ...r,
      title: ruleForDay(r.day).title,
    })),
  }
}

/** One day's page: the top lineups in both versions. */
export async function dailyDay(day: string, userId: string | null) {
  const today = dayKey()
  return {
    day,
    isToday: day === today,
    rule: ruleView(ruleForDay(day)),
    boards: await Promise.all(DAILY_VERSIONS.map((v) => boardFor(day, v, userId, day === today))),
  }
}
