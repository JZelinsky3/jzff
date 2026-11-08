// League Mode's Season variation. SERVER ONLY.
//
// A league is picked as Weekly (league.ts, untouched) or Season (here) when it's
// made. A Season team drafts once and then plays eight games at its own pace:
//
//   Draft Day   The Franchise Pack goes on a slot of your choosing (the captain's
//               table), then a pack for every slot (League odds), then BENCH_PACKS
//               wild packs whose keeps start on the bench.
//   The season  Eight games against the league's schedule of defenses
//               (defenses.ts), each with its points to beat. Before each one, a
//               scouting report (seasonSim.ts scout). Every game pays a pack
//               (seasonRules.rewardFor) and its keep goes to the bench; any bench
//               card can be subbed in at its position between games.
//   Playoffs    Once every team has played eight, the top `playoff_size` by record
//               (then points) are seeded into a bracket, byes on top. Each round
//               both teams face the same elite front and the higher score goes on.
//
// Nothing in the regular season depends on anyone else: a team can play all eight
// in one sitting, then wait. CPU teams draft and play all eight the moment the
// season starts, and play each playoff round the moment it opens.
//
// A solo season (you and eleven CPUs) works signed out, owned by the hashed guest
// key off the browser's cookie and moved onto the account at sign-in
// (seasonViewer). A league with friends needs accounts. Every pack is dealt here
// off the league's server-only seed and kept on the team row once opened, so a
// refresh shows the same five cards and nobody sees a pack before it's opened.
// See 0106_pack_empire_season.sql.

import { containsHateSpeech } from '@/lib/contentModeration'
import { createAdminClient } from '@/lib/supabase/admin'
import { LANES, archetypeOf, type ArchetypeTag, type Lane } from './archetypes'
import { DEFENSES, SEASON_GAMES, defenseById, elite, rngFor, scheduleFor, type Defense } from './defenses'
import { cpuBoostSlot, cpuTeamName } from './leagueCpu'
import { nameForUser, newId } from './people'
import { playerById } from './pool'
import { PACK_TIER_COLOR, PACK_TIER_LABEL, RARITIES, RARITY_LOOK, SLOTS, STANDINGS_WEIGHTS, chemistryFor, type Player, type Rarity } from './rules'
import { benchCards, seasonCards } from './seasonCards'
import { TRADE_IN, benchPack, cpuPick, draftPack, rewardPack, tradePack } from './seasonPacks'
import {
  BENCH_MAX,
  BENCH_PACKS,
  REWARD_LOOK,
  SEASON_SIZES,
  bracketOrder,
  defaultPlayoffs,
  playoffRounds,
  GAME_PLANS,
  KEEPER_BUDGET,
  KEEP_YEARS,
  beatsLine,
  cleanFocus,
  keeperCost,
  standingsTierFor,
  type StandingsTier,
  type PackFocus,
  rewardFor,
  type GamePlan,
  type RewardTier,
} from './seasonRules'
import { REF, bestPlan, bestSub, counterFor, fantasyPoints, laneTotals, matchup, scout, simGame, type BoxLine, type Drive, type DriveEnd, type GameResult, type LanePart, type PlanRead } from './seasonSim'

const db = () => createAdminClient()

const CODE_LEN = 6
/** Unfinished solo seasons one person can have going at once. */
const SOLO_CAP = 3
const POOLS = SLOTS.map((s) => s.pool)

export type SeasonWho = { userId: string; guestKey?: undefined } | { guestKey: string; userId?: undefined }
type Fail = { ok: false; error: string; status?: number }
type Ok<T = object> = { ok: true } & T

// ============================================================
// Rows
// ============================================================

type Phase = 'pregame' | 'regular' | 'playoffs' | 'complete'

type LeagueRow = {
  id: string
  created_at: string
  name: string
  kind: 'solo' | 'league'
  owner_id: string | null
  owner_key: string | null
  visibility: 'public' | 'invite'
  join_code: string
  max_players: number
  playoff_size: number
  seed: string
  schedule_seed: string
  phase: Phase
  round: number
  season_number: number
  champion_id: string | null
}

type DraftState = {
  franchise?: number | null
  /** Packs opened, by slot: the five ids as dealt. */
  packs?: Record<string, string[]>
  picks?: { slot: number; id: string }[]
  open?: number | null
  bench?: { ids: string[]; kept: string | null }[]
  /** Trades made this season, so each deals its own pack. */
  trades?: number
  // The offseason (season two on). `stage` is 'keepers' until they're chosen.
  stage?: 'keepers'
  /** The Standings Pack last season's finish bought, and the finish. */
  standings?: StandingsTier
  finish?: number
  /** Last season's eleven by slot, to keep from. */
  prev?: string[]
  /** Seasons each man on the team has been kept running: last season's, and this one's. */
  prevKept?: Record<string, number>
  kept?: Record<string, number>
}

/** A pack waiting to be opened: the one a game paid, or a trade's. */
type Pending = { phase: 'regular'; week: number; tier: RewardTier; ids: string[]; focus?: PackFocus | null } | { phase: 'trade'; week: number; tier: Rarity; ids: string[] }

type TeamRow = {
  id: string
  league_id: string
  user_id: string | null
  guest_key: string | null
  is_cpu: boolean
  joined_at: string
  display_name: string
  team_name: string
  draft: DraftState
  roster: string[] | null
  bench: string[]
  pending: Pending | null
  wins: number
  losses: number
  points_for: number
  played: number
  playoff_seed: number | null
  eliminated: boolean
  titles: number
}

type StoredResult = Omit<GameResult, 'matchup'> & { expected: number }

type GameRow = {
  id: string
  league_id: string
  team_id: string
  season_number: number
  phase: 'regular' | 'playoffs'
  week: number
  defense: string
  line: number | null
  opponent_id: string | null
  lineup: string[]
  points: number
  won: boolean | null
  result: StoredResult
  created_at: string
}

const card = (id: string): Player | null => playerById(id)
const cards = (ids: string[]): Player[] => ids.flatMap((id) => card(id) ?? [])

function isMine(t: TeamRow, who: SeasonWho | null): boolean {
  if (!who) return false
  return who.userId ? t.user_id === who.userId : t.guest_key === who.guestKey
}

function owns(l: LeagueRow, who: SeasonWho | null): boolean {
  if (!who) return false
  return who.userId ? l.owner_id === who.userId : l.owner_key === who.guestKey
}

async function loadLeague(id: unknown): Promise<LeagueRow | null> {
  if (typeof id !== 'string' || !/^[A-Z2-9]{6}$/.test(id)) return null
  const { data } = await db().from('pe_season_leagues').select('*').eq('id', id).maybeSingle()
  return (data as LeagueRow | null) ?? null
}

async function loadTeams(leagueId: string): Promise<TeamRow[]> {
  const { data } = await db().from('pe_season_teams').select('*').eq('league_id', leagueId).order('joined_at', { ascending: true })
  return (data ?? []) as TeamRow[]
}

async function loadGames(l: LeagueRow): Promise<GameRow[]> {
  const { data } = await db()
    .from('pe_season_games')
    .select('*')
    .eq('league_id', l.id)
    .eq('season_number', l.season_number)
    .order('week', { ascending: true })
    .limit(2000)
  return (data ?? []) as GameRow[]
}

function cleanName(raw: unknown, min = 3, max = 40): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.replace(/\s+/g, ' ').trim()
  if (s.length < min || s.length > max || containsHateSpeech(s)) return null
  return s
}

// ============================================================
// Dealing
// ============================================================

/** Every pack's own label. Season one's are as they always were; later seasons
    carry their number, so nothing re-deals. */
const dealLabel = (l: LeagueRow, t: TeamRow, part: string) => `season:${l.seed}:${t.id}:${l.season_number > 1 ? `s${l.season_number}:` : ''}${part}`

/** Every man already on this team, so no pack hands him back. */
function taken(t: TeamRow): string[] {
  const d = t.draft
  return [
    ...(t.roster ?? []),
    ...t.bench,
    ...(d.picks ?? []).map((p) => p.id),
    ...(d.bench ?? []).flatMap((b) => (b.kept ? [b.kept] : [])),
  ]
}

/** A slot's pack on Draft Day: hot, ordinary or cold, unmarked (seasonPacks.ts). */
function slotPack(l: LeagueRow, t: TeamRow, slot: number): Player[] {
  const special = t.draft.standings ? STANDINGS_WEIGHTS[t.draft.standings] : null
  return draftPack(dealLabel(l, t, 'draft'), slot, t.draft.franchise ?? 0, taken(t), special)
}

const benchDeal = (l: LeagueRow, t: TeamRow, n: number) => benchPack(dealLabel(l, t, `bench${n}`), taken(t))
const rewardDeal = (l: LeagueRow, t: TeamRow, week: number, tier: RewardTier, focus: PackFocus | null = null) =>
  rewardPack(dealLabel(l, t, `reward:regular:${week}`), tier, taken(t), focus)

const gameSeed = (l: LeagueRow, t: TeamRow, phase: string, week: number) => `${l.seed}|${t.id}|${l.season_number}|${phase}|${week}`

/** The front a playoff round plays: one of the schedule's, a step better. */
export function playoffDefense(scheduleSeed: string, round: number): Defense {
  const pool = DEFENSES.filter((d) => d.id !== 'base')
  return elite(pool[Math.floor(rngFor(`${scheduleSeed}|playoffs|${round}`)() * pool.length)])
}

function lineupOf(t: TeamRow): Player[] {
  return (t.roster ?? []).map((id) => card(id)).filter((p): p is Player => !!p)
}

/** A game as it's kept. Every snap for a person's games, so they can be watched
    again; a CPU's or a forced game keeps its drives and box score only. */
function stored(g: GameResult, snaps = false): StoredResult {
  const { matchup, ...rest } = g
  const drives = snaps ? rest.drives : rest.drives.map((d) => ({ end: d.end, yards: d.yards, points: d.points, by: d.by }))
  return { ...rest, drives, expected: Math.round(matchup.expected * 10) / 10 }
}

/** The call a CPU makes: its best chance against this front. */
const cpuPlan = (t: TeamRow, d: Defense, line: number | null): GamePlan => bestPlan(seasonCards(lineupOf(t)), d, line).plan

const planOf = (raw: unknown): GamePlan => (GAME_PLANS.includes(raw as GamePlan) ? (raw as GamePlan) : 'balanced')

// ============================================================
// CPU teams
// ============================================================

const best = (ps: Player[]) => ps.reduce((a, b) => (b.score > a.score ? b : a))

/** Draft Day the way the CPU does it: the Franchise Pack where it lifts most,
    then the biggest card in every pack. */
function cpuDraft(l: LeagueRow, t: TeamRow): TeamRow {
  // Keepers (season two on) hold their slots; the special pack goes on another.
  const kept = t.draft.picks ?? []
  const open = SLOTS.map((_, i) => i).filter((i) => !kept.some((p) => p.slot === i))
  const next: TeamRow = { ...t, draft: { ...t.draft, franchise: cpuBoostSlot(t.draft.standings ?? 'standard_pack', open), picks: [...kept], packs: {}, bench: [] } }
  for (const slot of open) {
    const pack = slotPack(l, next, slot)
    next.draft.packs![slot] = pack.map((p) => p.id)
    next.draft.picks!.push({ slot, id: best(pack).id })
  }
  for (let n = 0; n < BENCH_PACKS; n++) {
    const pack = benchDeal(l, next, n)
    const kept = (next.draft.bench ?? []).flatMap((b) => (b.kept ? (card(b.kept) ?? []) : []))
    const lineup = (next.draft.picks ?? []).flatMap((p) => card(p.id) ?? [])
    next.draft.bench!.push({ ids: pack.map((p) => p.id), kept: cpuPick(pack, lineup, kept).id })
  }
  return finishDraft(next)
}

function finishDraft(t: TeamRow): TeamRow {
  const picks = [...(t.draft.picks ?? [])].sort((a, b) => a.slot - b.slot)
  return { ...t, roster: picks.map((p) => p.id), bench: (t.draft.bench ?? []).flatMap((b) => (b.kept ? [b.kept] : [])) }
}

/** Subs off the scouting report until none helps, the way a person reading it would. */
function cpuSubs(t: TeamRow, d: Defense): TeamRow {
  let roster = [...(t.roster ?? [])]
  let bench = [...t.bench]
  for (let n = 0; n < 4; n++) {
    const s = bestSub(seasonCards(roster.map(card)), benchCards(cards(bench)), d, POOLS)
    if (!s) break
    const out = roster[s.slot]
    roster = roster.map((id, i) => (i === s.slot ? s.benchId : id))
    bench = bench.map((id) => (id === s.benchId ? out : id))
  }
  return { ...t, roster, bench }
}

/** Keeps the card in a game's pack that steps up most; a full bench lets its smallest go. */
function cpuKeep(t: TeamRow, ids: string[]): TeamRow {
  const keep = cpuPick(cards(ids), lineupOf(t), cards(t.bench))
  let bench = [...t.bench, keep.id]
  if (bench.length > BENCH_MAX) {
    const low = cards(bench).reduce((a, b) => (b.score < a.score ? b : a))
    bench = bench.filter((id) => id !== low.id)
  }
  return { ...t, bench }
}

/** A CPU team's whole regular season, played now: eight game rows and its row after. */
function cpuSeason(l: LeagueRow, t0: TeamRow): { team: TeamRow; games: Omit<GameRow, 'id' | 'created_at'>[] } {
  let t = t0
  const games: Omit<GameRow, 'id' | 'created_at'>[] = []
  for (const wk of scheduleFor(l.schedule_seed)) {
    const d = defenseById(wk.defense)!
    t = cpuSubs(t, d)
    const g = simGame(seasonCards(lineupOf(t)), d, gameSeed(l, t, 'regular', wk.week), cpuPlan(t, d, wk.line), wk.line)
    const won = beatsLine(g.points, wk.line)
    games.push({
      league_id: l.id,
      team_id: t.id,
      season_number: l.season_number,
      phase: 'regular',
      week: wk.week,
      defense: d.id,
      line: wk.line,
      opponent_id: null,
      lineup: [...(t.roster ?? [])],
      points: g.points,
      won,
      result: stored(g),
    })
    const pack = rewardDeal(l, t, wk.week, rewardFor(g.points, wk.line))
    t = cpuKeep(
      { ...t, played: t.played + 1, wins: t.wins + (won ? 1 : 0), losses: t.losses + (won ? 0 : 1), points_for: t.points_for + g.points },
      pack.map((p) => p.id)
    )
  }
  return { team: t, games }
}

async function saveTeam(t: TeamRow, fields: (keyof TeamRow)[]) {
  const patch = Object.fromEntries(fields.map((k) => [k, t[k]]))
  await db().from('pe_season_teams').update(patch).eq('id', t.id)
}

/** Every CPU team that hasn't drafted drafts and plays its season. */
async function playCpus(l: LeagueRow, teams: TeamRow[]) {
  for (const t of teams) {
    if (!t.is_cpu || t.played > 0) continue
    const drafted = t.roster ? t : cpuDraft(l, t)
    const { team, games } = cpuSeason(l, drafted)
    if (games.length) await db().from('pe_season_games').insert(games)
    await saveTeam(team, ['draft', 'roster', 'bench', 'played', 'wins', 'losses', 'points_for'])
  }
}

async function addCpuTeams(l: LeagueRow, teams: TeamRow[], count: number) {
  const names = new Set(teams.map((t) => t.team_name))
  const rows = Array.from({ length: count }, () => {
    const team_name = cpuTeamName(names)
    names.add(team_name)
    return { league_id: l.id, is_cpu: true, display_name: 'CPU', team_name }
  })
  if (rows.length) await db().from('pe_season_teams').insert(rows)
}

// ============================================================
// Creating, joining, starting
// ============================================================

export async function createSeason(
  who: SeasonWho,
  input: { kind?: unknown; name?: unknown; visibility?: unknown; maxPlayers?: unknown; playoffSize?: unknown; teamName?: unknown }
): Promise<Ok<{ id: string }> | Fail> {
  const kind = input.kind === 'league' ? 'league' : 'solo'
  if (kind === 'league' && !who.userId) return { ok: false, error: 'A league with friends needs an account.', status: 401 }

  const maxPlayers = kind === 'solo' ? 12 : Number(input.maxPlayers)
  if (!SEASON_SIZES.includes(maxPlayers)) return { ok: false, error: 'Pick a league size.' }
  const playoffSize = input.playoffSize == null ? defaultPlayoffs(maxPlayers) : Number(input.playoffSize)
  if (!Number.isInteger(playoffSize) || playoffSize < 2 || playoffSize > maxPlayers) return { ok: false, error: 'Pick how many make the playoffs.' }

  const display = who.userId ? await nameForUser(db(), who.userId) : 'You'
  const name = kind === 'solo' ? (cleanName(input.name) ?? `${display === 'You' ? 'My' : `${display}'s`} Season`) : cleanName(input.name)
  if (!name) return { ok: false, error: 'League names run 3 to 40 characters.' }
  const teamName = cleanName(input.teamName, 2, 30) ?? (kind === 'solo' ? 'Your Team' : `${display}'s Team`)

  if (kind === 'solo') {
    const q = db().from('pe_season_leagues').select('id', { count: 'exact', head: true }).eq('kind', 'solo').neq('phase', 'complete')
    const { count } = await (who.userId ? q.eq('owner_id', who.userId) : q.eq('owner_key', who.guestKey))
    if ((count ?? 0) >= SOLO_CAP) return { ok: false, error: `You have ${SOLO_CAP} solo seasons going. Finish or delete one first.`, status: 409 }
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const id = newId(CODE_LEN)
    const row = {
      id,
      name,
      kind,
      owner_id: who.userId ?? null,
      owner_key: who.guestKey ?? null,
      visibility: kind === 'league' && input.visibility === 'public' ? 'public' : 'invite',
      join_code: newId(CODE_LEN),
      max_players: maxPlayers,
      playoff_size: playoffSize,
      seed: newId(16),
      // A new schedule every season, solo ones too (Joey: different every play-through).
      schedule_seed: newId(12),
      phase: kind === 'solo' ? 'regular' : 'pregame',
    }
    const { error } = await db().from('pe_season_leagues').insert(row)
    if (error) {
      if (error.code === '23505') continue
      return { ok: false, error: 'Could not start the season.' }
    }
    await db().from('pe_season_teams').insert({
      league_id: id,
      user_id: who.userId ?? null,
      guest_key: who.guestKey ?? null,
      display_name: display,
      team_name: teamName,
    })
    if (kind === 'solo') {
      const l = (await loadLeague(id))!
      await addCpuTeams(l, await loadTeams(id), 11)
      await playCpus(l, await loadTeams(id))
    }
    return { ok: true, id }
  }
  return { ok: false, error: 'Could not start the season.' }
}

export async function joinSeason(userId: string, input: { id?: unknown; code?: unknown }): Promise<Ok<{ id: string }> | Fail> {
  const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : ''
  let l: LeagueRow | null = null
  if (code) {
    const { data } = await db().from('pe_season_leagues').select('*').eq('join_code', code).maybeSingle()
    l = data as LeagueRow | null
  } else {
    l = await loadLeague(input.id)
    if (l && l.visibility !== 'public') l = null
  }
  if (!l || l.kind !== 'league') return { ok: false, error: 'No league with that code.', status: 404 }
  const teams = await loadTeams(l.id)
  if (teams.some((t) => t.user_id === userId)) return { ok: true, id: l.id }
  if (l.phase !== 'pregame') return { ok: false, error: 'That season has started.' }
  if (teams.length >= l.max_players) {
    // A person takes a CPU's seat before the season starts.
    const cpu = [...teams].reverse().find((t) => t.is_cpu)
    if (!cpu) return { ok: false, error: 'That league is full.' }
    await db().from('pe_season_teams').delete().eq('id', cpu.id)
  }
  const display = await nameForUser(db(), userId)
  const { error } = await db().from('pe_season_teams').insert({ league_id: l.id, user_id: userId, display_name: display, team_name: `${display}'s Team` })
  if (error && error.code !== '23505') return { ok: false, error: 'Could not join.' }
  return { ok: true, id: l.id }
}

async function asOwner(id: unknown, who: SeasonWho | null): Promise<{ l: LeagueRow; teams: TeamRow[] } | Fail> {
  const l = await loadLeague(id)
  if (!l) return { ok: false, error: 'No such season.', status: 404 }
  if (!owns(l, who)) return { ok: false, error: 'Only the commissioner can do that.', status: 403 }
  return { l, teams: await loadTeams(l.id) }
}

/** The commissioner, before the season: fill the empty seats with CPU teams (or take them out). */
export async function setSeasonCpus(id: unknown, who: SeasonWho | null, fill: boolean): Promise<Ok | Fail> {
  const got = await asOwner(id, who)
  if ('ok' in got) return got
  const { l, teams } = got
  if (l.phase !== 'pregame') return { ok: false, error: 'The season has started.' }
  if (fill) await addCpuTeams(l, teams, l.max_players - teams.length)
  else await db().from('pe_season_teams').delete().eq('league_id', l.id).eq('is_cpu', true)
  return { ok: true }
}

/** How many make the playoffs: any number up to the league, until the playoffs start. */
export async function setSeasonPlayoffs(id: unknown, who: SeasonWho | null, size: unknown): Promise<Ok | Fail> {
  const got = await asOwner(id, who)
  if ('ok' in got) return got
  const { l, teams } = got
  if (l.phase === 'playoffs' || l.phase === 'complete') return { ok: false, error: 'The playoffs have started.' }
  const n = Number(size)
  const most = l.phase === 'pregame' ? l.max_players : teams.length
  if (!Number.isInteger(n) || n < 2 || n > most) return { ok: false, error: 'Pick how many make the playoffs.' }
  await db().from('pe_season_leagues').update({ playoff_size: n }).eq('id', l.id)
  return { ok: true }
}

export async function startSeason(id: unknown, who: SeasonWho | null): Promise<Ok | Fail> {
  const got = await asOwner(id, who)
  if ('ok' in got) return got
  const { l, teams } = got
  if (l.phase !== 'pregame') return { ok: false, error: 'The season has already started.' }
  if (teams.length < 2) return { ok: false, error: 'A season needs at least two teams. Add CPU teams to fill it.' }
  const { data } = await db().from('pe_season_leagues').update({ phase: 'regular', playoff_size: Math.min(l.playoff_size, teams.length) }).eq('id', l.id).eq('phase', 'pregame').select('*')
  const started = (data as LeagueRow[] | null)?.[0]
  if (!started) return { ok: true }
  await playCpus(started, teams)
  return { ok: true }
}

export async function deleteSeason(id: unknown, who: SeasonWho | null): Promise<Ok | Fail> {
  const got = await asOwner(id, who)
  if ('ok' in got) return got
  const { l } = got
  if (l.kind === 'league' && l.phase !== 'pregame') return { ok: false, error: 'A league can only be deleted before it starts.' }
  await db().from('pe_season_leagues').delete().eq('id', l.id)
  return { ok: true }
}

export async function renameSeasonTeam(id: unknown, who: SeasonWho | null, name: unknown): Promise<Ok | Fail> {
  const l = await loadLeague(id)
  if (!l) return { ok: false, error: 'No such season.', status: 404 }
  const mine = (await loadTeams(l.id)).find((t) => isMine(t, who))
  if (!mine) return { ok: false, error: "You're not in this season.", status: 403 }
  const clean = cleanName(name, 2, 30)
  if (!clean) return { ok: false, error: 'Team names run 2 to 30 characters.' }
  await db().from('pe_season_teams').update({ team_name: clean }).eq('id', mine.id)
  return { ok: true }
}

// ============================================================
// Draft Day
// ============================================================

async function myTeam(id: unknown, who: SeasonWho | null): Promise<{ l: LeagueRow; teams: TeamRow[]; t: TeamRow } | Fail> {
  const l = await loadLeague(id)
  if (!l) return { ok: false, error: 'No such season.', status: 404 }
  const teams = await loadTeams(l.id)
  const t = teams.find((x) => isMine(x, who))
  if (!t) return { ok: false, error: "You're not in this season.", status: 403 }
  return { l, teams, t }
}

function draftLive(l: LeagueRow, t: TeamRow): Fail | null {
  if (l.phase === 'pregame') return { ok: false, error: 'The season hasn’t started yet.' }
  if (t.roster) return { ok: false, error: 'Your team is drafted.' }
  if (t.draft.stage === 'keepers') return { ok: false, error: 'Choose your keepers first.' }
  return null
}

export async function setFranchise(id: unknown, who: SeasonWho | null, slot: unknown): Promise<Ok | Fail> {
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { l, t } = got
  const bad = draftLive(l, t)
  if (bad) return bad
  const s = Number(slot)
  if (!Number.isInteger(s) || s < 0 || s >= SLOTS.length) return { ok: false, error: 'Pick a slot.' }
  if (t.draft.franchise != null) return { ok: false, error: 'That pack is already placed.' }
  if ((t.draft.picks ?? []).some((p) => p.slot === s)) return { ok: false, error: 'A keeper holds that spot.' }
  await db().from('pe_season_teams').update({ draft: { ...t.draft, franchise: s } }).eq('id', t.id)
  return { ok: true }
}

export async function openSeasonPack(id: unknown, who: SeasonWho | null, slot: unknown): Promise<Ok<{ cards: Player[] }> | Fail> {
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { l, t } = got
  const bad = draftLive(l, t)
  if (bad) return bad
  const d = t.draft
  if (d.franchise == null) return { ok: false, error: d.standings ? 'Place your Standings Pack first.' : 'Place your Franchise Pack first.' }
  const s = Number(slot)
  if (!Number.isInteger(s) || s < 0 || s >= SLOTS.length) return { ok: false, error: 'Pick a slot.' }
  if (d.open != null) return d.open === s ? { ok: true, cards: cards(d.packs?.[d.open] ?? []) } : { ok: false, error: 'Take a card from the open pack first.' }
  if (benchWaiting(d)) return { ok: false, error: 'Take a card from your bench pack first.' }
  if ((d.picks ?? []).some((p) => p.slot === s)) return { ok: false, error: 'That slot is filled.' }
  const ids = d.packs?.[s] ?? slotPack(l, t, s).map((p) => p.id)
  await db().from('pe_season_teams').update({ draft: { ...d, open: s, packs: { ...(d.packs ?? {}), [s]: ids } } }).eq('id', t.id)
  return { ok: true, cards: cards(ids) }
}

export async function pickSeasonCard(id: unknown, who: SeasonWho | null, cardId: unknown): Promise<Ok | Fail> {
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { l, t } = got
  const bad = draftLive(l, t)
  if (bad) return bad
  const d = t.draft
  if (d.open == null) return { ok: false, error: 'Open a pack first.' }
  const pack = d.packs?.[d.open] ?? []
  if (typeof cardId !== 'string' || !pack.includes(cardId)) return { ok: false, error: "That card isn't in this pack." }
  const next: TeamRow = { ...t, draft: { ...d, open: null, picks: [...(d.picks ?? []), { slot: d.open, id: cardId }] } }
  const done = drafted(next.draft) ? finishDraft(next) : next
  const { data } = await db()
    .from('pe_season_teams')
    .update({ draft: done.draft, roster: done.roster, bench: done.bench })
    .eq('id', t.id)
    .eq('draft->>open', String(d.open))
    .select('id')
  if (!data?.length) return { ok: false, error: 'That pick already went in.' }
  return { ok: true }
}

/** A bench pack opened and not picked from yet. */
function benchWaiting(d: DraftState): boolean {
  const last = (d.bench ?? [])[(d.bench ?? []).length - 1]
  return !!last && !last.kept
}

/** Every slot filled and every bench pack picked from: the team is made. */
function drafted(d: DraftState): boolean {
  const bench = d.bench ?? []
  return (d.picks?.length ?? 0) >= SLOTS.length && bench.length >= BENCH_PACKS && bench.every((b) => b.kept)
}

export async function openBenchPack(id: unknown, who: SeasonWho | null): Promise<Ok<{ cards: Player[] }> | Fail> {
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { l, t } = got
  const bad = draftLive(l, t)
  if (bad) return bad
  // The bench packs open whenever you like on Draft Day, before the eleven or
  // after (Joey: they should be there from the start, not a surprise at the end).
  const d = t.draft
  if (d.open != null) return { ok: false, error: 'Take a card from the open pack first.' }
  const bench = d.bench ?? []
  const last = bench[bench.length - 1]
  if (last && !last.kept) return { ok: true, cards: cards(last.ids) }
  if (bench.length >= BENCH_PACKS) return { ok: false, error: 'Your bench packs are open.' }
  const ids = benchDeal(l, t, bench.length).map((p) => p.id)
  await db().from('pe_season_teams').update({ draft: { ...d, bench: [...bench, { ids, kept: null }] } }).eq('id', t.id)
  return { ok: true, cards: cards(ids) }
}

export async function pickBenchCard(id: unknown, who: SeasonWho | null, cardId: unknown): Promise<Ok | Fail> {
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { l, t } = got
  const bad = draftLive(l, t)
  if (bad) return bad
  const bench = t.draft.bench ?? []
  const last = bench[bench.length - 1]
  if (!last || last.kept) return { ok: false, error: 'Open a bench pack first.' }
  if (typeof cardId !== 'string' || !last.ids.includes(cardId)) return { ok: false, error: "That card isn't in this pack." }
  const next: TeamRow = { ...t, draft: { ...t.draft, bench: [...bench.slice(0, -1), { ...last, kept: cardId }] } }
  const done = drafted(next.draft) ? finishDraft(next) : next
  await saveTeam(done, ['draft', 'roster', 'bench'])
  return { ok: true }
}

// ============================================================
// The season
// ============================================================

export async function playSeasonGame(id: unknown, who: SeasonWho | null, rawPlan: unknown = 'balanced'): Promise<Ok<{ phase: 'regular' | 'playoffs'; week: number }> | Fail> {
  const plan = planOf(rawPlan)
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { l, teams, t } = got
  if (!t.roster) return { ok: false, error: 'Finish Draft Day first.' }
  if (t.pending) return { ok: false, error: 'Open the pack waiting first.' }

  if (l.phase === 'regular') {
    if (t.played >= SEASON_GAMES) return { ok: false, error: 'Your regular season is done.' }
    const wk = scheduleFor(l.schedule_seed)[t.played]
    const d = defenseById(wk.defense)!
    const g = simGame(seasonCards(lineupOf(t)), d, gameSeed(l, t, 'regular', wk.week), plan, wk.line)
    const won = beatsLine(g.points, wk.line)
    const { error } = await db().from('pe_season_games').insert({
      league_id: l.id,
      team_id: t.id,
      season_number: l.season_number,
      phase: 'regular',
      week: wk.week,
      defense: d.id,
      line: wk.line,
      lineup: t.roster,
      points: g.points,
      won,
      result: stored(g, true),
    })
    if (error) return error.code === '23505' ? { ok: true, phase: 'regular', week: wk.week } : { ok: false, error: 'That game would not play.' }
    const tier = rewardFor(g.points, wk.line)
    // Dealt when it's opened: the focus is picked first.
    const pending: Pending = { phase: 'regular', week: wk.week, tier, ids: [] }
    await db()
      .from('pe_season_teams')
      .update({ played: t.played + 1, wins: t.wins + (won ? 1 : 0), losses: t.losses + (won ? 0 : 1), points_for: t.points_for + g.points, pending })
      .eq('id', t.id)
      .eq('played', t.played)
    await advance(l.id)
    return { ok: true, phase: 'regular', week: wk.week }
  }

  if (l.phase === 'playoffs') {
    const games = await loadGames(l)
    const br = bracketOf(l, teams, games)
    const m = br.rounds[l.round - 1]?.find((x) => x.a === t.id || x.b === t.id)
    if (!m || m.winner) return { ok: false, error: 'You have no playoff game to play.' }
    if (games.some((g) => g.phase === 'playoffs' && g.week === l.round && g.team_id === t.id)) return { ok: false, error: 'Waiting on the other team.' }
    await playPlayoff(l, t, l.round, m.a === t.id ? m.b : m.a, plan, true)
    await advance(l.id)
    return { ok: true, phase: 'playoffs', week: l.round }
  }
  return { ok: false, error: 'There are no games to play.' }
}

async function playPlayoff(l: LeagueRow, t: TeamRow, round: number, opponent: string | null, plan: GamePlan, snaps = false) {
  const d = playoffDefense(l.schedule_seed, round)
  const g = simGame(seasonCards(lineupOf(t)), d, gameSeed(l, t, 'playoffs', round), plan)
  await db().from('pe_season_games').insert({
    league_id: l.id,
    team_id: t.id,
    season_number: l.season_number,
    phase: 'playoffs',
    week: round,
    defense: d.id,
    opponent_id: opponent,
    lineup: t.roster,
    points: g.points,
    result: stored(g, snaps),
  })
}

/** Opens the pack a game paid, pointed at a position or a play style if one's
    picked. Once dealt it's kept, so asking again shows the same five. */
export async function openRewardPack(id: unknown, who: SeasonWho | null, rawFocus: unknown): Promise<Ok<{ cards: Player[] }> | Fail> {
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { l, t } = got
  const p = t.pending
  if (!p) return { ok: false, error: 'No pack waiting.' }
  if (p.ids.length) return { ok: true, cards: cards(p.ids) }
  if (p.phase !== 'regular') return { ok: false, error: 'No pack waiting.' }
  const focus = cleanFocus(rawFocus)
  const ids = rewardDeal(l, t, p.week, p.tier, focus).map((c) => c.id)
  const { data } = await db()
    .from('pe_season_teams')
    .update({ pending: { ...p, ids, focus } })
    .eq('id', t.id)
    .eq('pending->>week', String(p.week))
    .select('pending')
  const stored = (data?.[0] as { pending: Pending } | undefined)?.pending
  return { ok: true, cards: cards(stored?.ids ?? ids) }
}

/** Keep a card from the last game's pack, or pass on it. A full bench names the one to let go. */
export async function keepReward(id: unknown, who: SeasonWho | null, cardId: unknown, release: unknown): Promise<Ok | Fail> {
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { t } = got
  if (!t.pending) return { ok: false, error: 'No pack waiting.' }
  let bench = [...t.bench]
  if (cardId != null) {
    if (typeof cardId !== 'string' || !t.pending.ids.includes(cardId)) return { ok: false, error: t.pending.ids.length ? "That card isn't in this pack." : 'Open the pack first.' }
    if (bench.length >= BENCH_MAX) {
      if (typeof release !== 'string' || !bench.includes(release)) return { ok: false, error: `Your bench holds ${BENCH_MAX}. Pick one to let go.` }
      bench = bench.filter((x) => x !== release)
    }
    bench.push(cardId)
  }
  await db().from('pe_season_teams').update({ bench, pending: null }).eq('id', t.id)
  return { ok: true }
}

/** The trade up: three bench cards of one rarity go, and a pack of three at the
    rarity above is dealt (seasonPacks.tradePack). Its card goes to the bench like
    a game's, so the pack waits the same way and nothing else plays until it's opened. */
export async function tradeUp(id: unknown, who: SeasonWho | null, ids: unknown): Promise<Ok | Fail> {
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { l, t } = got
  if (!t.roster || l.phase === 'pregame' || l.phase === 'complete') return { ok: false, error: 'Trades open once your team is drafted.' }
  if (t.pending) return { ok: false, error: 'Open the pack waiting first.' }
  const list = Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === 'string'))] : []
  if (list.length !== TRADE_IN || !list.every((x) => t.bench.includes(x))) return { ok: false, error: `Pick ${TRADE_IN} players from your bench.` }
  const going = cards(list)
  const rarity = going[0]?.rarity
  if (!rarity || going.some((p) => p.rarity !== rarity)) return { ok: false, error: 'A trade takes three of the same rarity.' }
  const up = RARITIES[RARITIES.indexOf(rarity) + 1]
  if (!up || up === 'canton') return { ok: false, error: 'Immortals are as high as a trade goes.' }
  const n = t.draft.trades ?? 0
  const pack = tradePack(dealLabel(l, t, `trade:${n}`), up, taken(t))
  const { data } = await db()
    .from('pe_season_teams')
    .update({ bench: t.bench.filter((x) => !list.includes(x)), pending: { phase: 'trade', week: n, tier: up, ids: pack.map((p) => p.id) }, draft: { ...t.draft, trades: n + 1 } })
    .eq('id', t.id)
    .is('pending', null)
    .select('id')
  if (!data?.length) return { ok: false, error: 'Open the pack waiting first.' }
  return { ok: true }
}

/** A bench card in for a starter at his position; the starter takes his bench spot. */
export async function subIn(id: unknown, who: SeasonWho | null, benchId: unknown, slot: unknown): Promise<Ok | Fail> {
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { t } = got
  if (!t.roster) return { ok: false, error: 'Finish Draft Day first.' }
  const s = Number(slot)
  if (typeof benchId !== 'string' || !t.bench.includes(benchId)) return { ok: false, error: "He's not on your bench." }
  const b = card(benchId)
  if (!b || !Number.isInteger(s) || SLOTS[s]?.pool !== b.pos) return { ok: false, error: `He can't play ${SLOTS[s]?.label ?? 'there'}.` }
  const out = t.roster[s]
  await db()
    .from('pe_season_teams')
    .update({ roster: t.roster.map((x, i) => (i === s ? benchId : x)), bench: t.bench.map((x) => (x === benchId ? out : x)) })
    .eq('id', t.id)
  return { ok: true }
}

export async function releaseBench(id: unknown, who: SeasonWho | null, benchId: unknown): Promise<Ok | Fail> {
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { t } = got
  if (typeof benchId !== 'string' || !t.bench.includes(benchId)) return { ok: false, error: "He's not on your bench." }
  await db().from('pe_season_teams').update({ bench: t.bench.filter((x) => x !== benchId) }).eq('id', t.id)
  return { ok: true }
}

/** The commissioner, when someone stalls: their remaining games play with the
    lineup they have, and the playoffs can open. */
export async function forceSeason(id: unknown, who: SeasonWho | null): Promise<Ok | Fail> {
  const got = await asOwner(id, who)
  if ('ok' in got) return got
  const { l, teams } = got
  if (l.phase === 'regular') {
    for (const t of teams) {
      if (t.is_cpu || t.played >= SEASON_GAMES) continue
      // An undrafted team drafts the way the CPU would; a drafted one keeps its eleven.
      const drafted = t.roster ? { ...t, pending: null } : cpuDraft(l, t)
      const left = scheduleFor(l.schedule_seed).slice(drafted.played)
      let cur = drafted
      const rows: Omit<GameRow, 'id' | 'created_at'>[] = []
      for (const wk of left) {
        const d = defenseById(wk.defense)!
        const g = simGame(seasonCards(lineupOf(cur)), d, gameSeed(l, cur, 'regular', wk.week), 'balanced', wk.line)
        const won = beatsLine(g.points, wk.line)
        rows.push({ league_id: l.id, team_id: cur.id, season_number: l.season_number, phase: 'regular', week: wk.week, defense: d.id, line: wk.line, opponent_id: null, lineup: [...(cur.roster ?? [])], points: g.points, won, result: stored(g) })
        cur = { ...cur, played: cur.played + 1, wins: cur.wins + (won ? 1 : 0), losses: cur.losses + (won ? 0 : 1), points_for: cur.points_for + g.points }
      }
      if (rows.length) await db().from('pe_season_games').insert(rows)
      await saveTeam(cur, ['draft', 'roster', 'bench', 'pending', 'played', 'wins', 'losses', 'points_for'])
    }
  } else if (l.phase === 'playoffs') {
    const games = await loadGames(l)
    const br = bracketOf(l, teams, games)
    for (const m of br.rounds[l.round - 1] ?? []) {
      if (m.winner) continue
      for (const side of [m.a, m.b]) {
        const t = teams.find((x) => x.id === side)
        if (t && !games.some((g) => g.phase === 'playoffs' && g.week === l.round && g.team_id === t.id)) await playPlayoff(l, t, l.round, side === m.a ? m.b : m.a, 'balanced')
      }
    }
  }
  await advance(l.id)
  return { ok: true }
}

// ============================================================
// Playoffs
// ============================================================

type Matchup = { a: string | null; b: string | null; winner: string | null }
type Bracket = { size: number; rounds: Matchup[][] }

/** The seeds by record, then points: the order the table shows. */
function standings(teams: TeamRow[]): TeamRow[] {
  return [...teams].sort((x, y) => y.wins - x.wins || y.points_for - x.points_for || x.joined_at.localeCompare(y.joined_at))
}

function bracketOf(l: LeagueRow, teams: TeamRow[], games: GameRow[]): Bracket {
  const seeded = teams.filter((t) => t.playoff_seed != null).sort((a, b) => a.playoff_seed! - b.playoff_seed!)
  const rounds = playoffRounds(seeded.length)
  const size = 2 ** rounds
  const bySeed = (s: number) => seeded[s - 1]?.id ?? null
  const order = bracketOrder(size)
  const played = (team: string, round: number) => games.find((g) => g.phase === 'playoffs' && g.week === round && g.team_id === team)
  const seedOf = (id: string) => teams.find((t) => t.id === id)?.playoff_seed ?? 99

  const out: Matchup[][] = []
  let field: (string | null)[] = order.map(bySeed)
  for (let r = 1; r <= rounds; r++) {
    const round: Matchup[] = []
    for (let i = 0; i < field.length; i += 2) {
      const a = field[i]
      const b = field[i + 1]
      let winner: string | null = null
      if (a && !b) winner = a
      else if (b && !a) winner = b
      else if (a && b) {
        const ga = played(a, r)
        const gb = played(b, r)
        if (ga && gb) {
          // More points goes on, then more yards, then the better seed.
          winner =
            ga.points !== gb.points
              ? ga.points > gb.points ? a : b
              : ga.result.yards !== gb.result.yards
                ? ga.result.yards > gb.result.yards ? a : b
                : seedOf(a) < seedOf(b) ? a : b
        }
      }
      round.push({ a, b, winner })
    }
    out.push(round)
    field = round.map((m) => m.winner)
  }
  return { size, rounds: out }
}

/**
 * Moves a season on as far as it can go: the playoffs open once every team has
 * played eight; a round closes once every game in it is in, and the next opens
 * with the CPUs playing straight away; the Final crowns a champion. Run after
 * anything that could finish a game.
 */
async function advance(leagueId: string) {
  for (let guard = 0; guard < 8; guard++) {
    const l = await loadLeague(leagueId)
    if (!l) return
    const teams = await loadTeams(l.id)

    if (l.phase === 'regular') {
      if (teams.some((t) => t.played < SEASON_GAMES)) return
      const field = standings(teams).slice(0, Math.min(l.playoff_size, teams.length))
      for (const [i, t] of field.entries()) await db().from('pe_season_teams').update({ playoff_seed: i + 1 }).eq('id', t.id)
      await db().from('pe_season_teams').update({ eliminated: true }).eq('league_id', l.id).is('playoff_seed', null)
      const { data } = await db().from('pe_season_leagues').update({ phase: 'playoffs', round: 1 }).eq('id', l.id).eq('phase', 'regular').select('id')
      if (!data?.length) return
      continue
    }

    if (l.phase !== 'playoffs') return
    const games = await loadGames(l)
    const br = bracketOf(l, teams, games)
    const round = br.rounds[l.round - 1] ?? []

    // CPUs in this round play now.
    let played = false
    for (const m of round) {
      if (m.winner || !m.a || !m.b) continue
      for (const side of [m.a, m.b]) {
        const t = teams.find((x) => x.id === side)
        if (t?.is_cpu && !games.some((g) => g.phase === 'playoffs' && g.week === l.round && g.team_id === t.id)) {
          const front = playoffDefense(l.schedule_seed, l.round)
          const subbed = cpuSubs(t, front)
          await playPlayoff(l, subbed, l.round, side === m.a ? m.b : m.a, cpuPlan(subbed, front, null))
          played = true
        }
      }
    }
    if (played) continue
    if (round.some((m) => !m.winner)) return

    const losers = round.flatMap((m) => [m.a, m.b].filter((x): x is string => !!x && x !== m.winner))
    if (losers.length) await db().from('pe_season_teams').update({ eliminated: true }).in('id', losers)
    if (l.round >= br.rounds.length) {
      const champ = round[0]?.winner ?? null
      const { data } = await db().from('pe_season_leagues').update({ phase: 'complete', champion_id: champ }).eq('id', l.id).eq('phase', 'playoffs').select('id')
      const t = teams.find((x) => x.id === champ)
      if (data?.length && t) await db().from('pe_season_teams').update({ titles: t.titles + 1 }).eq('id', t.id)
      return
    }
    await db().from('pe_season_leagues').update({ round: l.round + 1 }).eq('id', l.id).eq('round', l.round)
  }
}

// ============================================================
// The next season
// ============================================================

/** How a season finished, best first: the champion, then the playoff teams by
    how far they went (seed breaking ties), then everyone else by the table. */
function finishOrder(l: LeagueRow, teams: TeamRow[], games: GameRow[]): TeamRow[] {
  const br = bracketOf(l, teams, games)
  const reach = new Map<string, number>()
  br.rounds.forEach((round, i) =>
    round.forEach((m) => {
      for (const x of [m.a, m.b]) if (x) reach.set(x, Math.max(reach.get(x) ?? 0, i + (m.winner === x ? 1 : 0)))
    })
  )
  const inPlayoffs = (t: TeamRow) => t.playoff_seed != null
  return [...teams].sort((a, b) => {
    if (inPlayoffs(a) !== inPlayoffs(b)) return inPlayoffs(a) ? -1 : 1
    if (inPlayoffs(a)) return (reach.get(b.id) ?? 0) - (reach.get(a.id) ?? 0) || a.playoff_seed! - b.playoff_seed!
    return b.wins - a.wins || b.points_for - a.points_for
  })
}

/** The keepers a CPU holds: its biggest cards that fit the budget and the limit. */
function cpuKeepers(prev: string[], prevKept: Record<string, number>): string[] {
  const out: string[] = []
  let left = KEEPER_BUDGET
  for (const p of cards(prev).sort((a, b) => b.score - a.score)) {
    const cost = keeperCost(p.rarity)
    if ((prevKept[p.id] ?? 0) >= KEEP_YEARS || cost > left) continue
    out.push(p.id)
    left -= cost
  }
  return out
}

/**
 * The commissioner (you, in a solo season) starts the next one once the Final
 * is played: a new schedule, everyone's record back to nothing, and each team's
 * offseason. A person chooses keepers, then has a Draft Day with the Standings
 * Pack their finish bought; a CPU does all of that, and its eight games, now.
 */
export async function startNextSeason(id: unknown, who: SeasonWho | null): Promise<Ok | Fail> {
  const got = await asOwner(id, who)
  if ('ok' in got) return got
  const { l, teams } = got
  if (l.phase !== 'complete') return { ok: false, error: 'Finish this season first.' }
  const games = await loadGames(l)
  const order = finishOrder(l, teams, games)
  const { data } = await db()
    .from('pe_season_leagues')
    .update({ season_number: l.season_number + 1, phase: 'regular', round: 0, champion_id: null, schedule_seed: newId(12) })
    .eq('id', l.id)
    .eq('season_number', l.season_number)
    .select('*')
  const next = (data as LeagueRow[] | null)?.[0]
  if (!next) return { ok: true }
  for (const [i, t] of order.entries()) {
    const standings = standingsTierFor(i + 1, order.length)
    const prev = t.roster ?? []
    const prevKept = t.draft.kept ?? {}
    const draft: DraftState = t.is_cpu
      ? (() => {
          const keep = cpuKeepers(prev, prevKept)
          return { standings, finish: i + 1, prev, kept: Object.fromEntries(keep.map((k) => [k, (prevKept[k] ?? 0) + 1])), picks: keep.map((k) => ({ slot: prev.indexOf(k), id: k })) }
        })()
      : { stage: 'keepers', standings, finish: i + 1, prev, prevKept, picks: [] }
    await db()
      .from('pe_season_teams')
      .update({ draft, roster: null, bench: [], pending: null, wins: 0, losses: 0, points_for: 0, played: 0, playoff_seed: null, eliminated: false })
      .eq('id', t.id)
  }
  await playCpus(next, await loadTeams(l.id))
  return { ok: true }
}

/** A person's keepers: up to the budget, none kept two seasons running already. */
export async function setKeepers(id: unknown, who: SeasonWho | null, ids: unknown): Promise<Ok | Fail> {
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { t } = got
  const d = t.draft
  if (d.stage !== 'keepers') return { ok: false, error: 'Your keepers are set.' }
  const prev = d.prev ?? []
  const list = Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === 'string'))] : []
  if (!list.every((x) => prev.includes(x))) return { ok: false, error: 'Keepers come from last season’s eleven.' }
  const cost = cards(list).reduce((n, p) => n + keeperCost(p.rarity), 0)
  if (cost > KEEPER_BUDGET) return { ok: false, error: `That's ${cost} keeper points; the budget is ${KEEPER_BUDGET}.` }
  const stale = list.find((x) => (d.prevKept?.[x] ?? 0) >= KEEP_YEARS)
  if (stale) return { ok: false, error: `${card(stale)?.name ?? 'He'} has been kept ${KEEP_YEARS} seasons running. He goes back in the pool.` }
  const draft: DraftState = {
    ...d,
    stage: undefined,
    kept: Object.fromEntries(list.map((x) => [x, (d.prevKept?.[x] ?? 0) + 1])),
    picks: list.map((x) => ({ slot: prev.indexOf(x), id: x })),
  }
  const { data } = await db().from('pe_season_teams').update({ draft }).eq('id', t.id).eq('draft->>stage', 'keepers').select('id')
  if (!data?.length) return { ok: false, error: 'Your keepers are set.' }
  return { ok: true }
}

// ============================================================
// Views
// ============================================================

/** A defense for the pages: its words, and the kinds of player it's built to
    stop (hurts) or soft on (helps), strongest first. */
export type DefenseCard = Pick<Defense, 'id' | 'name' | 'blurb' | 'shuts' | 'soft' | 'stops' | 'allows'> & { hurts: ArchetypeTag[]; helps: ArchetypeTag[] }

const defenseCard = (d: Defense): DefenseCard => {
  const c = Object.entries(d.counters) as [ArchetypeTag, number][]
  return {
    id: d.id,
    name: d.name,
    blurb: d.blurb,
    shuts: d.shuts,
    soft: d.soft,
    stops: d.stops,
    allows: d.allows,
    hurts: c.filter(([, x]) => x < 1).sort((a, b) => a[1] - b[1]).map(([t]) => t),
    helps: c.filter(([, x]) => x > 1).sort((a, b) => b[1] - a[1]).map(([t]) => t),
  }
}

export type TableRow = {
  id: string
  teamName: string
  owner: string
  cpu: boolean
  you: boolean
  wins: number
  losses: number
  pointsFor: number
  played: number
  drafted: boolean
  seed: number | null
  eliminated: boolean
  champion: boolean
}

/** A card's kind of player, where its value goes, and how the next front treats
    it: -1 built to stop him, 1 he beats it, 0 neither. */
export type CardStyle = { tag: ArchetypeTag; lanes: Record<Lane, number>; vs: -1 | 0 | 1 }

export type ScoutView = {
  expected: number
  line: number | null
  passShare: number
  lanes: { lane: 'run' | 'short' | 'deep' | 'redZone'; eff: number }[]
  /** Card ids: the starters this front is built to stop, and the ones who beat it. */
  stopped: string[]
  helped: string[]
  pocket: number
  /** Who carries each lane against this front, biggest share first. */
  parts: Record<Lane, LanePart[]>
  /** Every game plan: how it fits, how often it clicks, what it projects to. */
  plans: PlanRead[]
  best: GamePlan
  sub: { in: Player; out: Player; slot: number; gain: number } | null
}

/** Your eleven as a whole, against a typical Season offense (1 = typical). */
export type TeamProfile = {
  lanes: Record<Lane, number>
  value: number
  chem: number
  passShare: number
  /** Points against a plain defense. */
  projected: number
}

/** Who's in a game, for reading its snaps: name, position, face. */
export type Cast = Record<string, { name: string; pos: Player['pos']; img: string | null; rarity: Player['rarity'] }>

export function castOf(box: BoxLine[]): Cast {
  const out: Cast = {}
  for (const b of box) {
    const c = card(b.id)
    out[b.id] = { name: b.name, pos: b.pos, img: c?.img ?? null, rarity: c?.rarity ?? 'common' }
  }
  return out
}

/** `oppPoints`: a playoff opponent's score, once they've played. */
export type GameLine = { phase: 'regular' | 'playoffs'; week: number; defense: string; line: number | null; points: number; won: boolean | null; opponent: string | null; oppPoints: number | null }

export type SeasonLine = {
  id: string
  name: string
  pos: Player['pos']
  rarity: Player['rarity']
  img?: string
  year?: number
  tag: ArchetypeTag
  teamId: string
  team: string
  games: number
  passYds: number
  passTd: number
  int: number
  rushYds: number
  rushTd: number
  rec: number
  recYds: number
  recTd: number
  fum: number
  grade: number | null
  pts: number
  ppg: number
  value: number
}

export type Award = { title: string; line: string; team: string; who?: SeasonLine }

export type BracketView = {
  rounds: { round: number; defense: string; games: { a: TableRow | null; b: TableRow | null; aPts: number | null; bPts: number | null; winner: string | null }[] }[]
}

export type MySeason = {
  id: string
  teamName: string
  step: 'keepers' | 'franchise' | 'packs' | 'bench' | 'season'
  /** The pack placed on a slot of your choosing: the Franchise Pack in season
      one, the Standings Pack your finish bought after that. */
  special: { label: string; color: string; standings: boolean }
  /** Season two on: last season's finish and eleven, and how long each man's
      been kept, for choosing keepers. */
  offseason: { finish: number; teams: number; prev: (Player | null)[]; prevKept: Record<string, number>; kept: string[] } | null
  franchise: number | null
  lineup: (Player | null)[]
  bench: Player[]
  openSlot: number | null
  openCards: Player[] | null
  /** Bench packs picked from, and the one open now. */
  benchPacks: number
  benchOpen: Player[] | null
  styles: Record<string, CardStyle>
  profile: TeamProfile | null
  /** The regular-season games left, each projected with the eleven as it stands. */
  outlook: { week: number; defense: string; stops: string; line: number; projected: number }[]
  played: number
  next: { phase: 'regular' | 'playoffs'; week: number; defense: DefenseCard; line: number | null; opponent: string | null; scouting: ScoutView } | null
  waiting: string | null
  /** The pack waiting: a game's (opened once its focus is picked) or a trade's. */
  pending: { tier: RewardTier | Rarity; trade: boolean; label: string; color: string; opened: boolean; cards: Player[]; week: number; points: number | null; line: number | null } | null
  games: GameLine[]
  /** The game just played: how each drive ended, the three who did the most,
      the plan and its roll, and every snap to watch it back (null for a game
      stored before snaps were). */
  last: (GameLine & { drives: DriveEnd[]; top: BoxLine[]; yards: number; plan: GamePlan; clicked: boolean | null; replay: Drive[] | null; cast: Cast }) | null
  /** Your men's regular season (it locks after game eight), then their playoffs. */
  book: SeasonLine[]
  bookPlayoffs: SeasonLine[]
}

export type Leader = { title: string; stat: 'pts' | 'ppg' | 'passYds' | 'rushYds' | 'recYds' | 'td'; rows: SeasonLine[] }

export type SeasonView = {
  league: {
    id: string
    name: string
    kind: 'solo' | 'league'
    phase: Phase
    round: number
    rounds: number
    playoffSize: number
    maxPlayers: number
    teams: number
    visibility: 'public' | 'invite'
    joinCode: string | null
    owner: boolean
    seasonNumber: number
  }
  schedule: { week: number; defense: DefenseCard; line: number }[]
  table: TableRow[]
  /** In the regular season, how far the table and the leaders run: your games
      played. Nobody's record runs ahead of yours (null when it all shows). */
  through: number | null
  me: MySeason | null
  bracket: BracketView | null
  /** The regular season's leaders, and once they start, the playoffs'. */
  leaders: Leader[]
  playoffLeaders: Leader[]
  awards: Award[]
}

const r1 = (x: number) => Math.round(x * 10) / 10

function pendingView(p: Pending | null, games: GameRow[]): MySeason['pending'] {
  if (!p) return null
  const base = { opened: p.ids.length > 0, cards: cards(p.ids), week: p.week }
  if (p.phase === 'trade') return { ...base, tier: p.tier, trade: true, label: `${RARITY_LOOK[p.tier].label} Trade`, color: RARITY_LOOK[p.tier].color, points: null, line: null }
  const g = games.find((x) => x.phase === 'regular' && x.week === p.week)
  return { ...base, tier: p.tier, trade: false, label: REWARD_LOOK[p.tier].label, color: REWARD_LOOK[p.tier].color, points: g?.points ?? null, line: g?.line ?? null }
}

function scoutView(t: TeamRow, d: Defense, line: number | null): ScoutView {
  const lineup = lineupOf(t)
  const s = scout(seasonCards(lineup), benchCards(cards(t.bench)), d, line, POOLS)
  return {
    expected: Math.round(s.expected * 10) / 10,
    line,
    passShare: s.passShare,
    lanes: s.lanes,
    stopped: s.stopped,
    helped: s.helped,
    pocket: s.pocket,
    parts: s.parts,
    plans: s.plans.map((p) => ({ ...p, clicks: r1(p.clicks), misses: r1(p.misses), expected: r1(p.expected), chance: Math.round(p.chance * 100) / 100, fit: Math.round(p.fit * 100) / 100, win: Math.round(p.win * 100) / 100 })),
    best: s.best,
    sub: s.sub ? { in: card(s.sub.benchId)!, out: card(s.sub.outId)!, slot: s.sub.slot, gain: Math.round(s.sub.gain * 10) / 10 } : null,
  }
}

function profileOf(lineup: Player[]): TeamProfile | null {
  if (lineup.length < SLOTS.length) return null
  const sc = seasonCards(lineup)
  const tot = laneTotals(sc)
  const base = defenseById('base')!
  const m = matchup(sc, base)
  const lanes = Object.fromEntries(LANES.map((k) => [k, Math.round((tot[k] / REF[k]) * 100) / 100])) as Record<Lane, number>
  return {
    lanes,
    value: lineup.reduce((n, p) => n + p.score, 0),
    chem: chemistryFor(lineup, true).total,
    passShare: Math.round((m.mix.short + m.mix.deep) * 100) / 100,
    // At its best call: a team is worth what it scores when it's coached.
    projected: Math.round(bestPlan(sc, base, null).expected * 10) / 10,
  }
}

function outlookOf(lineup: Player[], weeks: { week: number; defense: string; line: number }[]): MySeason['outlook'] {
  const sc = seasonCards(lineup)
  return weeks.flatMap((w) => {
    const d = defenseById(w.defense)
    return d ? [{ week: w.week, defense: d.name, stops: d.stops, line: w.line, projected: Math.round(bestPlan(sc, d, w.line).expected * 10) / 10 }] : []
  })
}

/** Every man's season off his box lines, for one team or the league. Points are
    recounted off the line (standard PPR), whatever the game stored. */
function seasonLines(games: GameRow[], teamName: (id: string) => string): SeasonLine[] {
  const by = new Map<string, SeasonLine & { grades: number[] }>()
  for (const g of games) {
    for (const b of g.result.box as BoxLine[]) {
      const k = `${g.team_id}|${b.id}`
      let cur = by.get(k)
      if (!cur) {
        const c = card(b.id)
        const fresh: SeasonLine & { grades: number[] } = {
          id: b.id,
          name: b.name,
          pos: b.pos,
          rarity: c?.rarity ?? 'common',
          img: c?.img ?? undefined,
          year: c?.year ?? undefined,
          tag: archetypeOf({ id: b.id, pos: b.pos }).tag,
          teamId: g.team_id,
          team: teamName(g.team_id),
          games: 0,
          passYds: 0,
          passTd: 0,
          int: 0,
          rushYds: 0,
          rushTd: 0,
          rec: 0,
          recYds: 0,
          recTd: 0,
          fum: 0,
          grade: null,
          pts: 0,
          ppg: 0,
          value: c?.score ?? 0,
          grades: [],
        }
        cur = fresh
        by.set(k, fresh)
      }
      cur.games++
      cur.passYds += b.passYds ?? 0
      cur.passTd += b.passTd ?? 0
      cur.int += b.int ?? 0
      cur.rushYds += b.rushYds ?? 0
      cur.rushTd += b.rushTd ?? 0
      cur.rec += b.rec ?? 0
      cur.recYds += b.recYds ?? 0
      cur.recTd += b.recTd ?? 0
      cur.fum += b.fum ?? 0
      cur.pts += fantasyPoints(b)
      if (b.grade != null) cur.grades.push(b.grade)
    }
  }
  return [...by.values()].map(({ grades, ...l }) => ({
    ...l,
    pts: Math.round(l.pts * 10) / 10,
    ppg: Math.round((l.pts / Math.max(1, l.games)) * 10) / 10,
    grade: grades.length ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length) : null,
  }))
}

const LEADERS: { title: string; stat: Leader['stat'] }[] = [
  { title: 'Fantasy Points', stat: 'pts' },
  { title: 'Points Per Game', stat: 'ppg' },
  { title: 'Touchdowns', stat: 'td' },
  { title: 'Passing Yards', stat: 'passYds' },
  { title: 'Rushing Yards', stat: 'rushYds' },
  { title: 'Receiving Yards', stat: 'recYds' },
]

/** Touchdowns are scored ones, rushing and receiving: a passer's are in his yards. */
export const statOf = (l: SeasonLine, stat: Leader['stat']) => (stat === 'td' ? l.rushTd + l.recTd : l[stat])

function leadersOf(lines: SeasonLine[], gamesIn: number): Leader[] {
  // Points a game needs a real sample: half the games played so far.
  const enough = Math.max(1, Math.ceil(gamesIn / 2))
  return LEADERS.map((x) => ({
    ...x,
    rows: lines
      .filter((r) => r.grade == null && statOf(r, x.stat) > 0 && (x.stat !== 'ppg' || r.games >= enough))
      .sort((a, b) => statOf(b, x.stat) - statOf(a, x.stat))
      .slice(0, 5),
  }))
}

/** Half the regular season: the games a man needs to be in the running for the
    Least Valuable Player on his own merits. */
const LVP_GAMES = Math.ceil(SEASON_GAMES / 2)

function awardsFor(teams: TeamRow[], lines: SeasonLine[], playoffLines: SeasonLine[] | null, champion: string | null): Award[] {
  const out: Award[] = []
  const skill = lines.filter((l) => l.grade == null)
  const mvp = [...skill].sort((a, b) => b.pts - a.pts)[0]
  if (mvp) out.push({ title: 'MVP', line: `${mvp.pts.toLocaleString()} points, ${mvp.ppg} a game`, who: mvp, team: mvp.team })

  // The least valuable: the big card who did least with it, a game at a time
  // (Joey: points a game, not a total, so a man picked up for the last week
  // isn't it by default). Each position scores its own way, so a card is held
  // to his position's going rate for his value. Half a season makes him
  // eligible; two or three games only if he was awful, under 40% of that rate.
  const big = skill.filter((l) => l.value >= 1600 && l.games >= 2)
  const rates = new Map<string, number>()
  for (const pos of new Set(big.map((l) => l.pos))) {
    const r = big.filter((l) => l.pos === pos).map((l) => l.ppg / l.value).sort((a, b) => a - b)
    rates.set(pos, r[Math.floor(r.length / 2)] || 1)
  }
  const ratio = (l: SeasonLine) => l.ppg / l.value / (rates.get(l.pos) ?? 1)
  const lvp = big.filter((l) => l.games >= LVP_GAMES || ratio(l) <= 0.4).sort((a, b) => ratio(a) - ratio(b))[0]
  if (lvp) out.push({ title: 'Least Valuable', line: `${lvp.ppg} a game in ${lvp.games} games, off a ${lvp.value.toLocaleString()} card`, who: lvp, team: lvp.team })

  // The best man who didn't start on Draft Day.
  const drafted = new Map(teams.map((t) => [t.id, new Set((t.draft.picks ?? []).map((p) => p.id))]))
  const breakout = [...skill].filter((l) => !drafted.get(l.teamId)?.has(l.id) && l.games >= 2).sort((a, b) => b.pts - a.pts)[0]
  if (breakout) out.push({ title: 'Breakout', line: `${breakout.pts.toLocaleString()} points off the bench, ${breakout.ppg} a game`, who: breakout, team: breakout.team })

  const lineGrades = new Map<string, number[]>()
  for (const l of lines) if (l.grade != null) lineGrades.set(l.team, [...(lineGrades.get(l.team) ?? []), l.grade])
  const bestLine = [...lineGrades.entries()].map(([team, g]) => ({ team, avg: g.reduce((a, b) => a + b, 0) / g.length })).sort((a, b) => b.avg - a.avg)[0]
  if (bestLine) out.push({ title: 'Best Line', line: `Graded ${Math.round(bestLine.avg)} on average`, team: bestLine.team })

  if (playoffLines && champion) {
    const pmvp = playoffLines.filter((l) => l.grade == null && l.teamId === champion).sort((a, b) => b.pts - a.pts)[0]
    if (pmvp) out.push({ title: 'Playoff MVP', line: `${pmvp.pts.toLocaleString()} points in ${pmvp.games} playoff ${pmvp.games === 1 ? 'game' : 'games'}`, who: pmvp, team: pmvp.team })
  }
  return out
}

export async function seasonView(id: unknown, who: SeasonWho | null): Promise<SeasonView | null> {
  const l = await loadLeague(id)
  if (!l) return null
  const [teams, games] = await Promise.all([loadTeams(l.id), loadGames(l)])
  const mine = teams.find((t) => isMine(t, who)) ?? null
  const teamName = (tid: string) => teams.find((t) => t.id === tid)?.team_name ?? 'Team'
  const schedule = scheduleFor(l.schedule_seed).map((w) => ({ week: w.week, defense: defenseCard(defenseById(w.defense)!), line: w.line }))

  // Joey: in the regular season nobody's record runs ahead of yours. A CPU has
  // played all eight the moment the season starts and a friend may be further
  // on; the table and the leaders show everyone through your games played, so a
  // season unfolds week by week. Once the regular season's over it all shows.
  const through = mine && l.phase === 'regular' ? mine.played : null
  const visible = through == null ? games : games.filter((g) => g.phase !== 'regular' || g.team_id === mine!.id || g.week <= through)
  const regularSeen = visible.filter((g) => g.phase === 'regular')

  const rowFor = (t: TeamRow): TableRow => {
    const gs = regularSeen.filter((g) => g.team_id === t.id)
    const capped = through != null && t.id !== mine!.id
    return {
      id: t.id,
      teamName: t.team_name,
      owner: t.is_cpu ? 'CPU' : t.display_name,
      cpu: t.is_cpu,
      you: t.id === mine?.id,
      wins: capped ? gs.filter((g) => g.won).length : t.wins,
      losses: capped ? gs.filter((g) => g.won === false).length : t.losses,
      pointsFor: capped ? gs.reduce((n, g) => n + g.points, 0) : t.points_for,
      played: capped ? gs.length : t.played,
      drafted: !!t.roster,
      seed: t.playoff_seed,
      eliminated: t.eliminated,
      champion: l.champion_id === t.id,
    }
  }
  const table: TableRow[] =
    through == null
      ? standings(teams).map(rowFor)
      : teams
          .map(rowFor)
          .sort((x, y) => y.wins - x.wins || y.pointsFor - x.pointsFor || Number(y.you) - Number(x.you))
  const rowOf = (tid: string | null) => (tid ? (table.find((r) => r.id === tid) ?? null) : null)

  let bracket: BracketView | null = null
  if (l.phase === 'playoffs' || l.phase === 'complete') {
    const br = bracketOf(l, teams, games)
    const pts = (tid: string | null, r: number) => (tid ? (games.find((g) => g.phase === 'playoffs' && g.week === r && g.team_id === tid)?.points ?? null) : null)
    bracket = {
      rounds: br.rounds.map((ms, i) => ({
        round: i + 1,
        defense: playoffDefense(l.schedule_seed, i + 1).name,
        games: ms.map((m) => ({ a: rowOf(m.a), b: rowOf(m.b), aPts: pts(m.a, i + 1), bPts: pts(m.b, i + 1), winner: m.winner })),
      })),
    }
  }

  const regular = games.filter((g) => g.phase === 'regular')
  const lines = seasonLines(visible.filter((g) => g.phase === 'regular'), teamName)
  const playoffLines = seasonLines(games.filter((g) => g.phase === 'playoffs'), teamName)
  const gamesIn = through ?? Math.max(0, ...teams.map((t) => t.played))
  const leaders = leadersOf(lines, gamesIn)
  const playoffLeaders = playoffLines.length ? leadersOf(playoffLines, 1) : []
  const awards =
    l.phase === 'playoffs' || l.phase === 'complete'
      ? awardsFor(teams, seasonLines(regular, teamName), l.phase === 'complete' ? seasonLines(games.filter((g) => g.phase === 'playoffs'), teamName) : null, l.champion_id)
      : []

  let me: MySeason | null = null
  if (mine) {
    const d = mine.draft
    const picks = d.picks ?? []
    const lineup: (Player | null)[] = mine.roster
      ? mine.roster.map((x) => card(x))
      : SLOTS.map((_, i) => {
          const p = picks.find((x) => x.slot === i)
          return p ? card(p.id) : null
        })
    const bench = mine.roster ? cards(mine.bench) : (d.bench ?? []).flatMap((b) => (b.kept ? (card(b.kept) ?? []) : []))
    const lastBench = (d.bench ?? [])[(d.bench ?? []).length - 1]
    const step: MySeason['step'] = mine.roster ? 'season' : d.stage === 'keepers' ? 'keepers' : d.franchise == null ? 'franchise' : picks.length < SLOTS.length ? 'packs' : 'bench'

    let next: MySeason['next'] = null
    let front: Defense | null = null
    let waiting: string | null = null
    if (mine.roster && !mine.pending) {
      if (l.phase === 'regular' && mine.played < SEASON_GAMES) {
        const wk = scheduleFor(l.schedule_seed)[mine.played]
        front = defenseById(wk.defense)!
        next = { phase: 'regular', week: wk.week, defense: defenseCard(front), line: wk.line, opponent: null, scouting: scoutView(mine, front, wk.line) }
      } else if (l.phase === 'regular') {
        const left = teams.filter((t) => t.played < SEASON_GAMES)
        waiting = `Waiting on ${left.length} ${left.length === 1 ? 'team' : 'teams'} to finish: ${left.map((t) => t.team_name).join(', ')}`
      } else if (l.phase === 'playoffs' && bracket) {
        const m = bracket.rounds[l.round - 1]?.games.find((x) => x.a?.id === mine.id || x.b?.id === mine.id)
        const playedIt = games.some((g) => g.phase === 'playoffs' && g.week === l.round && g.team_id === mine.id)
        if (m && !m.winner && !playedIt) {
          front = playoffDefense(l.schedule_seed, l.round)
          const opp = m.a?.id === mine.id ? m.b : m.a
          next = { phase: 'playoffs', week: l.round, defense: defenseCard(front), line: null, opponent: opp?.teamName ?? null, scouting: scoutView(mine, front, null) }
        } else if (m && !m.winner) waiting = 'Waiting on the other team to play.'
      }
    }

    const styles: Record<string, CardStyle> = {}
    for (const p of [...lineup, ...bench]) {
      if (!p) continue
      const a = archetypeOf(p)
      const c = front ? counterFor(front, { arch: a, rarity: p.rarity }) : 1
      styles[p.id] = { tag: a.tag, lanes: a.lanes, vs: c < 0.97 ? -1 : c > 1.03 ? 1 : 0 }
    }

    const tagged = new Map(teams.map((t) => [t.id, t.team_name]))
    const playoffWon = (round: number) => {
      const w = bracket?.rounds[round - 1]?.games.find((x) => x.a?.id === mine.id || x.b?.id === mine.id)?.winner
      return w ? w === mine.id : null
    }
    const myGames = games
      .filter((g) => g.team_id === mine.id)
      .sort((a, b) => (a.phase === b.phase ? a.week - b.week : a.phase === 'regular' ? -1 : 1))
    const lineOf = (g: GameRow): GameLine => ({
      phase: g.phase,
      week: g.week,
      defense: (g.phase === 'playoffs' ? playoffDefense(l.schedule_seed, g.week) : defenseById(g.defense))?.name ?? g.defense,
      line: g.line,
      points: g.points,
      won: g.phase === 'regular' ? g.won : playoffWon(g.week),
      opponent: g.opponent_id ? (tagged.get(g.opponent_id) ?? null) : null,
      oppPoints: g.opponent_id ? (games.find((x) => x.phase === 'playoffs' && x.week === g.week && x.team_id === g.opponent_id)?.points ?? null) : null,
    })
    const lastRow = myGames[myGames.length - 1]
    me = {
      id: mine.id,
      teamName: mine.team_name,
      step,
      special: d.standings
        ? { label: PACK_TIER_LABEL[d.standings], color: PACK_TIER_COLOR[d.standings], standings: true }
        : { label: 'Franchise Pack', color: '#42c0f8', standings: false },
      offseason: d.prev ? { finish: d.finish ?? 0, teams: teams.length, prev: d.prev.map((x) => card(x)), prevKept: d.prevKept ?? {}, kept: (d.picks ?? []).filter((p) => d.kept?.[p.id]).map((p) => p.id) } : null,
      franchise: d.franchise ?? null,
      lineup,
      bench,
      openSlot: d.open ?? null,
      openCards: d.open != null ? cards(d.packs?.[d.open] ?? []) : null,
      benchPacks: (d.bench ?? []).filter((b) => b.kept).length,
      benchOpen: lastBench && !lastBench.kept ? cards(lastBench.ids) : null,
      styles,
      profile: mine.roster ? profileOf(lineupOf(mine)) : null,
      outlook: mine.roster && l.phase === 'regular' ? outlookOf(lineupOf(mine), scheduleFor(l.schedule_seed).slice(mine.played)) : [],
      played: mine.played,
      next,
      waiting,
      pending: pendingView(mine.pending, myGames),
      games: myGames.map(lineOf),
      last: lastRow
        ? {
            ...lineOf(lastRow),
            drives: lastRow.result.drives.map((x) => x.end),
            top: (lastRow.result.box as BoxLine[])
              .filter((b) => b.grade == null)
              .map((b) => ({ ...b, pts: fantasyPoints(b) }))
              .sort((a, b) => b.pts - a.pts)
              .slice(0, 3),
            yards: lastRow.result.yards,
            plan: lastRow.result.plan ?? 'balanced',
            clicked: lastRow.result.clicked ?? null,
            replay: lastRow.result.drives.every((x) => x.plays?.length) ? lastRow.result.drives : null,
            cast: castOf(lastRow.result.box as BoxLine[]),
          }
        : null,
      book: lines.filter((x) => x.teamId === mine.id).sort((a, b) => b.pts - a.pts),
      bookPlayoffs: playoffLines.filter((x) => x.teamId === mine.id).sort((a, b) => b.pts - a.pts),
    }
  }

  return {
    league: {
      id: l.id,
      name: l.name,
      kind: l.kind,
      phase: l.phase,
      round: l.round,
      rounds: playoffRounds(Math.min(l.playoff_size, teams.length)),
      playoffSize: l.playoff_size,
      maxPlayers: l.max_players,
      teams: teams.length,
      visibility: l.visibility,
      joinCode: mine || owns(l, who) ? l.join_code : null,
      owner: owns(l, who),
      seasonNumber: l.season_number,
    },
    schedule,
    table,
    through,
    me,
    bracket,
    leaders,
    playoffLeaders,
    awards,
  }
}

/** One game, whole: the drives and every man's line. Anyone in the league can read any game. */
export async function seasonGame(
  id: unknown,
  teamId: unknown,
  phase: unknown,
  week: unknown
): Promise<{ team: string; defense: string; line: number | null; game: GameRow; cast: Cast; opponent: string | null; oppPoints: number | null } | null> {
  const l = await loadLeague(id)
  if (!l || typeof teamId !== 'string' || (phase !== 'regular' && phase !== 'playoffs')) return null
  const w = Number(week)
  const { data } = await db()
    .from('pe_season_games')
    .select('*')
    .eq('league_id', l.id)
    .eq('team_id', teamId)
    .eq('season_number', l.season_number)
    .eq('phase', phase)
    .eq('week', w)
    .maybeSingle()
  const g = data as GameRow | null
  if (!g) return null
  const { data: t } = await db().from('pe_season_teams').select('team_name').eq('id', teamId).maybeSingle()
  const front = phase === 'playoffs' ? playoffDefense(l.schedule_seed, w) : defenseById(g.defense)
  // Older games stored half-PPR with a lineman's grade mixed in: recount.
  const box = (g.result.box as BoxLine[]).map((b) => ({ ...b, pts: b.grade != null ? 0 : fantasyPoints(b) }))
  let opponent: string | null = null
  let oppPoints: number | null = null
  if (g.opponent_id) {
    const [{ data: o }, { data: og }] = await Promise.all([
      db().from('pe_season_teams').select('team_name').eq('id', g.opponent_id).maybeSingle(),
      db().from('pe_season_games').select('points').eq('team_id', g.opponent_id).eq('season_number', l.season_number).eq('phase', 'playoffs').eq('week', w).maybeSingle(),
    ])
    opponent = (o as { team_name: string } | null)?.team_name ?? null
    oppPoints = (og as { points: number } | null)?.points ?? null
  }
  return {
    team: (t as { team_name: string } | null)?.team_name ?? 'Team',
    defense: front?.name ?? g.defense,
    line: g.line,
    game: { ...g, result: { ...g.result, box } },
    cast: castOf(box),
    opponent,
    oppPoints,
  }
}

export type SeasonCard = { id: string; name: string; kind: 'solo' | 'league'; phase: Phase; played: number; wins: number; losses: number; teams: number; owner: boolean }

/** The lobby's list: every season this person has a team in. */
export async function mySeasons(who: SeasonWho | null): Promise<SeasonCard[]> {
  if (!who) return []
  const q = db().from('pe_season_teams').select('league_id, played, wins, losses')
  const { data } = await (who.userId ? q.eq('user_id', who.userId) : q.eq('guest_key', who.guestKey)).limit(100)
  const rows = (data ?? []) as { league_id: string; played: number; wins: number; losses: number }[]
  if (!rows.length) return []
  const { data: ls } = await db().from('pe_season_leagues').select('*').in('id', rows.map((r) => r.league_id)).order('created_at', { ascending: false })
  const { data: counts } = await db().from('pe_season_teams').select('league_id').in('league_id', rows.map((r) => r.league_id))
  const size = new Map<string, number>()
  for (const c of (counts ?? []) as { league_id: string }[]) size.set(c.league_id, (size.get(c.league_id) ?? 0) + 1)
  return ((ls ?? []) as LeagueRow[]).map((l) => {
    const r = rows.find((x) => x.league_id === l.id)!
    return { id: l.id, name: l.name, kind: l.kind, phase: l.phase, played: r.played, wins: r.wins, losses: r.losses, teams: size.get(l.id) ?? 0, owner: owns(l, who) }
  })
}

export async function openSeasons(userId: string | null): Promise<SeasonCard[]> {
  const { data } = await db().from('pe_season_leagues').select('*').eq('visibility', 'public').eq('kind', 'league').eq('phase', 'pregame').order('created_at', { ascending: false }).limit(20)
  const ls = (data ?? []) as LeagueRow[]
  if (!ls.length) return []
  const { data: ts } = await db().from('pe_season_teams').select('league_id, user_id').in('league_id', ls.map((l) => l.id))
  const teams = (ts ?? []) as { league_id: string; user_id: string | null }[]
  return ls
    .filter((l) => !teams.some((t) => t.league_id === l.id && t.user_id === userId))
    .map((l) => ({ id: l.id, name: l.name, kind: l.kind, phase: l.phase, played: 0, wins: 0, losses: 0, teams: teams.filter((t) => t.league_id === l.id).length, owner: false }))
}

/** Sign-in: this browser's solo seasons become the account's. */
export async function claimSeasons(userId: string, guestKey: string): Promise<void> {
  try {
    await db().from('pe_season_leagues').update({ owner_id: userId, owner_key: null }).eq('owner_key', guestKey)
    await db().from('pe_season_teams').update({ user_id: userId, guest_key: null }).eq('guest_key', guestKey)
  } catch {
    // The seasons stay with the browser; nothing lost.
  }
}
