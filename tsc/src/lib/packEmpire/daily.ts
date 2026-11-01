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
// Each pack has a clock, which is what keeps Ball Knower about what you know
// rather than what you can look up. A pack isn't sent until you rip it open, and
// that's when its clock starts, so it can't be read early or restarted with a
// refresh. If it runs out, the first card that fits signs. Between packs
// there's no clock: you can put your phone down, you just can't see what's next.
//
// Top lineups are the other leak. Today's stay hidden until you've finished
// that version, otherwise the board is an answer sheet. Past days are open.

import { createAdminClient } from '@/lib/supabase/admin'
import { ruleForDay, ruleView, scoreLineup, type DailyScore, type DayRuleView } from './dayRules'
import { dailyCapLeft, dailyCard, dailyPack, dailySet, dailyUsable, maskDaily, priced, type DailyPick } from './deal'
import { cleanGuestName, guestNameTaken, nameForUser } from './people'
import { signDaily } from './share'
import { DAILY_PACK_SECONDS, SALARY_CAP, SLOT_COUNT, signingPrice, slotForCard, type Player } from './rules'

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

/**
 * Whose run it is: an account, or a browser with no account. A guest is the
 * hash of a long-lived cookie (see ./dailyWho), so a refresh or a closed tab
 * keeps their one try, and a private window is a new guest, the same as a second
 * account would be. A guest's name is blank until they give one at the end, and
 * a blank name stays off the boards.
 */
export type DailyWho = { userId: string } | { guestKey: string }

function ownedBy(who: DailyWho): ['user_id' | 'guest_key', string] {
  return 'userId' in who ? ['user_id', who.userId] : ['guest_key', who.guestKey]
}

type Row = {
  id: string
  day: string
  version: DailyVersion
  user_id: string | null
  guest_key: string | null
  name: string
  captain: number | null
  picks: DailyPick[]
  step: number
  done: boolean
  score: number | null
  detail: DailyDetail | null
  started_at: string
  finished_at: string | null
  /** When the current pack was handed over. Null until it's opened. */
  pack_opened_at: string | null
}

export type PackLook = { cards: Player[]; kept: string; reserve: boolean }

export type DailyResult = DailyDetail & {
  captain: number | null
  /** On a salary cap day, what the eleven cost. */
  spent: number | null
  rank: number
  entrants: number
  /** Every pack as it was, cards turned over, with what you kept. */
  packs: PackLook[]
  /** A guest hasn't put a name on it yet, so it isn't on the board. */
  named: boolean
  /** The signed token for a link to this score (see ./share), once it has a name. */
  share: string | null
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
  /** The pack you've opened, masked. Null until you open it. */
  pack: Player[] | null
  /** What's left on the clock, while a pack is open. */
  secondsLeft: number | null
  /** The card that signed because the clock ran out, on the reply that did it. */
  timedOut: string | null
  /** The card in it that's a reserve. */
  reserve: string | null
  /** On a salary cap day, what's left to spend. */
  capLeft: number | null
  done: boolean
  result: DailyResult | null
}

export type Fail = { ok: false; error: string; status?: number }

const db = () => createAdminClient()

async function load(day: string, version: DailyVersion, who: DailyWho): Promise<Row | null> {
  const { data } = await db()
    .from('pe_daily_runs')
    .select('*')
    .eq('day', day)
    .eq('version', version)
    .eq(...ownedBy(who))
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
      .select('id', { count: 'exact', head: true })
      .eq('day', row.day)
      .eq('version', row.version)
      .eq('done', true)
      .neq('name', '')
    if (better) q = q.gt('score', row.score as number)
    return (await q).count ?? 0
  }
  const [above, entrants] = await Promise.all([count(true), count(false)])
  const spent = ruleForDay(row.day).salaryCap
    ? SALARY_CAP.shared - dailyCapLeft(dailySet(row.day, row.version), row.captain, row.picks)
    : null
  const named = !!row.name
  const share = named ? signDaily({ day: row.day, version: row.version, score: row.score, name: row.name }) : null
  return {
    ...row.detail,
    captain: row.captain,
    spent,
    rank: above + 1,
    entrants: entrants + (named ? 0 : 1),
    packs: packsOf(row),
    named,
    share,
  }
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
    secondsLeft: null,
    timedOut: null,
    reserve: null,
    capLeft: rule.salaryCap ? SALARY_CAP.shared : null,
    done: !!row?.done,
    result: null,
  }
  if (!row) return base
  if (row.done) return { ...base, lineup: row.detail?.lineup ?? base.lineup, result: await resultOf(row) }

  const show = (c: Player) => (rule.salaryCap ? { ...maskDaily(c, version, day), salary: priced(c).salary } : maskDaily(c, version, day))
  const lineup = [...base.lineup]
  for (const pick of row.picks) {
    const card = dailyCard(day, pick.id)
    if (card) lineup[pick.slot] = show(card)
  }
  const set = dailySet(day, version)
  const capLeft = rule.salaryCap ? dailyCapLeft(set, row.captain, row.picks) : null
  if (!row.pack_opened_at) return { ...base, lineup, capLeft }
  const { cards, reserve } = dailyPack(set, row.captain, row.picks)
  return {
    ...base,
    lineup,
    pack: cards.map(show),
    reserve,
    capLeft,
    secondsLeft: Math.max(0, Math.ceil(clockLeftMs(row) / 1000)),
  }
}

/** What's left on the clock of an open pack, below zero once it's run out. */
function clockLeftMs(row: Pick<Row, 'pack_opened_at'>): number {
  if (!row.pack_opened_at) return Infinity
  return DAILY_PACK_SECONDS * 1000 - (Date.now() - Date.parse(row.pack_opened_at))
}

/** A slow connection isn't a slow pick: a pick landing this late still counts. */
const CLOCK_GRACE_MS = 3000

/** The card that signs when the clock runs out: the first one you could have
    taken, in the order they were dealt. */
function clockCard(row: Row): Player | null {
  const set = dailySet(row.day, row.version)
  const usable = dailyUsable(dailyPack(set, row.captain, row.picks).cards, row.captain, row.picks)
  if (!ruleForDay(row.day).salaryCap) return usable[0] ?? null
  const left = dailyCapLeft(set, row.captain, row.picks)
  const table = usable.map(priced)
  return table.find((c) => signingPrice(c, table, left) != null) ?? null
}

/** A clock that ran out while nobody was asking: the card signs now. */
async function settle(row: Row | null, day: string): Promise<{ row: Row | null; timedOut: string | null }> {
  if (!row || row.done || clockLeftMs(row) > -CLOCK_GRACE_MS) return { row, timedOut: null }
  const card = clockCard(row)
  if (!card) return { row, timedOut: null }
  const fresh = await signCard(row, day, card)
  return { row: fresh, timedOut: card.name }
}

/** Where this account stands on today's Daily. Signed out, a run that hasn't
    started, which is enough to show the rule. */
export async function dailyState(who: DailyWho | null, version: DailyVersion): Promise<DailyState> {
  const day = dayKey()
  const { row, timedOut } = await settle(who ? await load(day, version, who) : null, day)
  return { ...(await stateOf(day, version, row)), timedOut }
}

/** Sign in for today. The captain is the commitment: it decides the first
    pack, and asking again changes nothing. */
export async function startDaily(
  who: DailyWho,
  version: DailyVersion,
  rawCaptain: unknown
): Promise<{ ok: true; state: DailyState } | Fail> {
  const day = dayKey()
  const existing = await load(day, version, who)
  if (existing) return { ok: true, state: await stateOf(day, version, existing) }

  const rule = ruleForDay(day)
  let captain: number | null = null
  if (!rule.noCaptain) {
    if (!Number.isInteger(rawCaptain) || (rawCaptain as number) < 0 || (rawCaptain as number) >= SLOT_COUNT) {
      return { ok: false, error: 'Pick a captain first.' }
    }
    captain = rawCaptain as number
  }

  const name = 'userId' in who ? await nameForUser(db(), who.userId) : ''
  const [column, owner] = ownedBy(who)
  const { error } = await db().from('pe_daily_runs').insert({ day, version, [column]: owner, name, captain })
  // 23505 is this account's other tab getting there first.
  if (error && error.code !== '23505') return { ok: false, error: 'Could not start your Daily.' }
  return { ok: true, state: await stateOf(day, version, await load(day, version, who)) }
}

/** Open the next pack, which is what starts its clock. Asking again hands
    back the same open pack, on the same clock. */
export async function openDaily(who: DailyWho, version: DailyVersion): Promise<{ ok: true; state: DailyState } | Fail> {
  const day = dayKey()
  const { row, timedOut } = await settle(await load(day, version, who), day)
  if (!row) return { ok: false, error: 'That Daily has ended. A new one is up.', status: 409 }
  if (row.done || row.pack_opened_at) return { ok: true, state: { ...(await stateOf(day, version, row)), timedOut } }
  await db()
    .from('pe_daily_runs')
    .update({ pack_opened_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('step', row.step)
    .is('pack_opened_at', null)
  return { ok: true, state: { ...(await stateOf(day, version, await load(day, version, who))), timedOut } }
}

/** The browser saying its clock hit zero. The server's clock is the one that
    counts, so this only ever signs a card once that one has run out too. */
export async function expireDaily(who: DailyWho, version: DailyVersion): Promise<{ ok: true; state: DailyState } | Fail> {
  const day = dayKey()
  const row = await load(day, version, who)
  if (!row) return { ok: false, error: 'That Daily has ended. A new one is up.', status: 409 }
  if (row.done || !row.pack_opened_at || clockLeftMs(row) > 1000) return { ok: true, state: await stateOf(day, version, row) }
  const card = clockCard(row)
  if (!card) return { ok: true, state: await stateOf(day, version, row) }
  return { ok: true, state: { ...(await stateOf(day, version, await signCard(row, day, card))), timedOut: card.name } }
}

/** Keep one card from the open pack. The eleventh is the one that scores the
    run and turns everything over. */
export async function pickDaily(
  who: DailyWho,
  version: DailyVersion,
  id: unknown
): Promise<{ ok: true; state: DailyState } | Fail> {
  const day = dayKey()
  const found = await load(day, version, who)
  if (!found) return { ok: false, error: 'That Daily has ended. A new one is up.', status: 409 }
  if (found.done) return { ok: true, state: await stateOf(day, version, found) }
  if (!found.pack_opened_at) return { ok: false, error: 'Open the pack first.' }

  // Too late: the clock already decided.
  const { row, timedOut } = await settle(found, day)
  if (!row) return { ok: false, error: 'Could not save that pick.' }
  if (timedOut) return { ok: true, state: { ...(await stateOf(day, version, row)), timedOut } }

  const set = dailySet(day, version)
  const { cards } = dailyPack(set, row.captain, row.picks)
  const card = cards.find((c) => c.id === id)
  if (!card) return { ok: false, error: 'That card is not in this pack.' }

  const filled = new Set(row.picks.map((p) => p.slot))
  const locked = row.captain != null && row.picks.length === 0
  if (!locked && slotForCard(card.pos, filled) < 0) {
    return { ok: false, error: `You have no ${card.pos} slot left. Take a card you have a slot for.` }
  }

  if (ruleForDay(day).salaryCap) {
    const usable = dailyUsable(cards, row.captain, row.picks).map(priced)
    if (signingPrice(priced(card), usable, dailyCapLeft(set, row.captain, row.picks)) == null) {
      return { ok: false, error: 'You can’t afford him. Take someone you can pay for.' }
    }
  }
  return { ok: true, state: await stateOf(day, version, await signCard(row, day, card)) }
}

/** Put a card in its slot and, on the eleventh, score the run. Nothing here
    reaches the binder: everybody opens these same packs, so filing them would
    pile pulls onto the same few cards without anyone having found them. */
async function signCard(row: Row, day: string, card: Player): Promise<Row | null> {
  const filled = new Set(row.picks.map((p) => p.slot))
  const locked = row.captain != null && row.picks.length === 0
  const slot = locked ? (row.captain as number) : slotForCard(card.pos, filled)
  const picks = [...row.picks, { id: card.id, slot }]
  const patch: Record<string, unknown> = { picks, step: picks.length, pack_opened_at: null }

  const finished = picks.length === SLOT_COUNT
  if (finished) {
    const lineup = Array<Player | null>(SLOT_COUNT).fill(null)
    for (const p of picks) lineup[p.slot] = dailyCard(day, p.id)
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
    .eq('id', row.id)
    .eq('step', row.step)
    .select('*')
    .maybeSingle()
  if (data) return data as Row
  // Lost a race with another tab: whatever it wrote stands.
  const { data: fresh } = await db().from('pe_daily_runs').select('*').eq('id', row.id).maybeSingle()
  return (fresh as Row | null) ?? null
}

/**
 * A guest's name, on a run they've finished. It's what puts them on the board,
 * so the same rules as a guest's name on the Builder board: no slurs, no email
 * addresses, nobody else's name. `key` is that browser's poster key, so a name
 * they already post under isn't refused as someone else's.
 */
export async function nameDaily(
  who: DailyWho,
  version: DailyVersion,
  rawName: unknown,
  key: string | null
): Promise<{ ok: true; state: DailyState } | Fail> {
  const day = dayKey()
  const row = await load(day, version, who)
  if (!row?.done) return { ok: false, error: 'Finish your Daily first.' }
  if (row.name) return { ok: true, state: await stateOf(day, version, row) }
  const name = cleanGuestName(rawName)
  if (!name) return { ok: false, error: 'Pick a different name, 2 to 24 characters.' }

  const { data: others } = await db().from('pe_daily_runs').select('name, user_id, guest_key').eq('day', day).neq('name', '')
  const wanted = name.toLowerCase()
  const mine = (r: Pick<Row, 'user_id' | 'guest_key'>) => r.guest_key === row.guest_key && !r.user_id
  const taken = ((others ?? []) as Pick<Row, 'name' | 'user_id' | 'guest_key'>[]).some((r) => r.name.toLowerCase() === wanted && !mine(r))
  if (taken || (await guestNameTaken(name, key ?? ''))) return { ok: false, error: 'That name is already on the board.' }

  const { data } = await db().from('pe_daily_runs').update({ name }).eq('id', row.id).select('*').maybeSingle()
  return { ok: true, state: await stateOf(day, version, (data as Row | null) ?? row) }
}

/** A guest signed up: their runs are the account's now, so the one try carries
    over. A day the account already played stays as the account played it. */
export async function claimDaily(userId: string, guestKey: string): Promise<void> {
  const { data } = await db().from('pe_daily_runs').select('id').eq('guest_key', guestKey)
  const rows = (data ?? []) as { id: string }[]
  if (rows.length === 0) return
  const name = await nameForUser(db(), userId)
  for (const r of rows) {
    const { error } = await db().from('pe_daily_runs').update({ user_id: userId, guest_key: null, name }).eq('id', r.id)
    if (error?.code === '23505') await db().from('pe_daily_runs').delete().eq('id', r.id)
  }
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

async function boardFor(day: string, version: DailyVersion, who: DailyWho | null, isToday: boolean): Promise<DailyBoard> {
  const [top, mine, count] = await Promise.all([
    db()
      .from('pe_daily_runs')
      .select('*')
      .eq('day', day)
      .eq('version', version)
      .eq('done', true)
      .neq('name', '')
      .order('score', { ascending: false })
      .order('finished_at', { ascending: true })
      .limit(DAILY_TOP),
    who ? load(day, version, who) : Promise.resolve(null),
    db()
      .from('pe_daily_runs')
      .select('id', { count: 'exact', head: true })
      .eq('day', day)
      .eq('version', version)
      .eq('done', true)
      .neq('name', ''),
  ])

  const locked = isToday && !mine?.done
  const shown = (r: Row, rank: number): DailyRow => ({
    rank,
    name: r.name || 'You',
    score: r.score ?? 0,
    you: r.id === mine?.id,
    detail: locked ? null : r.detail,
    captain: r.captain,
  })
  const rows = ((top.data ?? []) as Row[]).map((r, i) => shown(r, i + 1))

  let yourRank: number | null = null
  if (mine?.done && mine.score != null) {
    const { count: above } = await db()
      .from('pe_daily_runs')
      .select('id', { count: 'exact', head: true })
      .eq('day', day)
      .eq('version', version)
      .eq('done', true)
      .neq('name', '')
      .gt('score', mine.score)
    yourRank = (above ?? 0) + 1
  }
  return {
    version,
    rows,
    entrants: (count.count ?? 0) + (mine?.done && !mine.name ? 1 : 0),
    you: mine?.done && yourRank ? shown(mine, yourRank) : null,
    yourStep: mine ? (mine.done ? SLOT_COUNT : mine.step) : null,
    yourRank,
    locked,
  }
}

/** A day's rule for a link preview, any day. A bad day falls back to today. */
/** "October 31st". */
export function longDate(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
  const n = d.getUTCDate()
  const th = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${month} ${n}${th}`
}

/** Which Daily a shared score was on: "today's Daily" until it isn't. */
export function dailyScoreLine(day: string): string {
  return day === dayKey() ? "today's Daily" : `the ${longDate(day)} Daily`
}

export function dailySpec(day: string | null): { day: string; title: string; line: string } {
  const d = day && isDay(day) && day <= dayKey() ? day : dayKey()
  const rule = ruleView(ruleForDay(d))
  return { day: d, title: rule.title, line: rule.line }
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

export async function dailyLobby(who: DailyWho | null): Promise<DailyLobby> {
  const day = dayKey()
  const [boards, recent, yours] = await Promise.all([
    Promise.all(DAILY_VERSIONS.map((v) => boardFor(day, v, who, true))),
    db()
      .from('pe_daily_runs')
      .select('day, version, name, score')
      .eq('done', true)
      .neq('name', '')
      .lt('day', day)
      .gte('day', daysBefore(day, PAST_DAYS))
      .order('score', { ascending: false })
      .limit(500),
    who
      ? db()
          .from('pe_daily_runs')
          .select('day, version, score')
          .eq(...ownedBy(who))
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
export async function dailyDay(day: string, who: DailyWho | null) {
  const today = dayKey()
  return {
    day,
    isToday: day === today,
    rule: ruleView(ruleForDay(day)),
    boards: await Promise.all(DAILY_VERSIONS.map((v) => boardFor(day, v, who, day === today))),
  }
}
