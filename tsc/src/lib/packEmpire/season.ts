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
import { weekStartFor } from '@/lib/minigames/leaderboard'
import { createAdminClient } from '@/lib/supabase/admin'
import { archetypeOf, type ArchetypeTag, type Lane } from './archetypes'
import { dealPack } from './deal'
import { DEFENSES, SEASON_GAMES, defenseById, elite, rngFor, scheduleFor, type Defense } from './defenses'
import { cpuBoostSlot, cpuTeamName } from './leagueCpu'
import { nameForUser, newId } from './people'
import { playerById } from './pool'
import { LEAGUE_ORDINARY, SLOTS, STANDINGS_WEIGHTS, type Player, type Weights } from './rules'
import { benchCards, seasonCards } from './seasonCards'
import {
  BENCH_MAX,
  BENCH_PACKS,
  REWARD_LOOK,
  SEASON_SIZES,
  bracketOrder,
  defaultPlayoffs,
  playoffRounds,
  rewardFor,
  type RewardTier,
} from './seasonRules'
import { bestSub, scout, simGame, type BoxLine, type DriveEnd, type GameResult } from './seasonSim'

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
}

type Pending = { phase: 'regular'; week: number; tier: RewardTier; ids: string[] }

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

const FRANCHISE: { normal: Weights; boosted: Weights } = { normal: STANDINGS_WEIGHTS.standard_pack, boosted: STANDINGS_WEIGHTS.standard_pack }
const REWARD_TABLE: Record<RewardTier, { normal: Weights; boosted: Weights }> = {
  league: LEAGUE_ORDINARY,
  starter: FRANCHISE,
  rising: { normal: STANDINGS_WEIGHTS.rising_pack, boosted: STANDINGS_WEIGHTS.rising_pack },
}

const dealLabel = (l: LeagueRow, t: TeamRow, part: string) => `season:${l.seed}:${t.id}:${part}`

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

function slotPack(l: LeagueRow, t: TeamRow, slot: number): Player[] {
  const table = t.draft.franchise === slot ? FRANCHISE : LEAGUE_ORDINARY
  return dealPack({ label: dealLabel(l, t, 'draft'), slot, base: table.normal, boosted: table.boosted, exclude: taken(t) })
}

/** A pack of one position the seed picks: Draft Day's bench packs and every game's pack. */
function wildPack(l: LeagueRow, t: TeamRow, part: string, table: { normal: Weights; boosted: Weights }): Player[] {
  const label = dealLabel(l, t, part)
  const slot = Math.floor(rngFor(label)() * SLOTS.length)
  return dealPack({ label, slot, base: table.normal, boosted: table.boosted, exclude: taken(t) })
}

const gameSeed = (l: LeagueRow, t: TeamRow, phase: string, week: number) => `${l.seed}|${t.id}|${l.season_number}|${phase}|${week}`

/** The front a playoff round plays: one of the schedule's, a step better. */
export function playoffDefense(scheduleSeed: string, round: number): Defense {
  const pool = DEFENSES.filter((d) => d.id !== 'base')
  return elite(pool[Math.floor(rngFor(`${scheduleSeed}|playoffs|${round}`)() * pool.length)])
}

function lineupOf(t: TeamRow): Player[] {
  return (t.roster ?? []).map((id) => card(id)).filter((p): p is Player => !!p)
}

function stored(g: GameResult): StoredResult {
  const { matchup, ...rest } = g
  return { ...rest, expected: Math.round(matchup.expected * 10) / 10 }
}

// ============================================================
// CPU teams
// ============================================================

const best = (ps: Player[]) => ps.reduce((a, b) => (b.score > a.score ? b : a))

/** Draft Day the way the CPU does it: the Franchise Pack where it lifts most,
    then the biggest card in every pack. */
function cpuDraft(l: LeagueRow, t: TeamRow): TeamRow {
  const next: TeamRow = { ...t, draft: { franchise: cpuBoostSlot('standard_pack', SLOTS.map((_, i) => i)), picks: [], packs: {}, bench: [] } }
  for (let slot = 0; slot < SLOTS.length; slot++) {
    const pack = slotPack(l, next, slot)
    next.draft.packs![slot] = pack.map((p) => p.id)
    next.draft.picks!.push({ slot, id: best(pack).id })
  }
  for (let n = 0; n < BENCH_PACKS; n++) {
    const pack = wildPack(l, next, `bench${n}`, LEAGUE_ORDINARY)
    next.draft.bench!.push({ ids: pack.map((p) => p.id), kept: best(pack).id })
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

/** Keeps the best card in a game's pack; a full bench lets its smallest go. */
function cpuKeep(t: TeamRow, ids: string[]): TeamRow {
  const keep = best(cards(ids))
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
    const g = simGame(seasonCards(lineupOf(t)), d, gameSeed(l, t, 'regular', wk.week))
    const won = g.points >= wk.line
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
    const pack = wildPack(l, t, `reward:regular:${wk.week}`, REWARD_TABLE[rewardFor(g.points, wk.line)])
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
      // Solo seasons started the same week share one schedule, so they compare.
      schedule_seed: kind === 'solo' ? `solo:${weekStartFor()}` : newId(12),
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
  if (t.draft.franchise != null || (t.draft.picks?.length ?? 0) > 0) return { ok: false, error: 'The Franchise Pack is already placed.' }
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
  if (d.franchise == null) return { ok: false, error: 'Place your Franchise Pack first.' }
  const s = Number(slot)
  if (!Number.isInteger(s) || s < 0 || s >= SLOTS.length) return { ok: false, error: 'Pick a slot.' }
  if (d.open != null) return d.open === s ? { ok: true, cards: cards(d.packs?.[d.open] ?? []) } : { ok: false, error: 'Take a card from the open pack first.' }
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
  const next = { ...d, open: null, picks: [...(d.picks ?? []), { slot: d.open, id: cardId }] }
  const { data } = await db().from('pe_season_teams').update({ draft: next }).eq('id', t.id).eq('draft->>open', String(d.open)).select('id')
  if (!data?.length) return { ok: false, error: 'That pick already went in.' }
  return { ok: true }
}

export async function openBenchPack(id: unknown, who: SeasonWho | null): Promise<Ok<{ cards: Player[] }> | Fail> {
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { l, t } = got
  const bad = draftLive(l, t)
  if (bad) return bad
  const d = t.draft
  if ((d.picks?.length ?? 0) < SLOTS.length) return { ok: false, error: 'Fill your eleven first.' }
  const bench = d.bench ?? []
  const last = bench[bench.length - 1]
  if (last && !last.kept) return { ok: true, cards: cards(last.ids) }
  if (bench.length >= BENCH_PACKS) return { ok: false, error: 'Your bench packs are open.' }
  const ids = wildPack(l, t, `bench${bench.length}`, LEAGUE_ORDINARY).map((p) => p.id)
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
  const done = next.draft.bench!.length >= BENCH_PACKS ? finishDraft(next) : next
  await saveTeam(done, ['draft', 'roster', 'bench'])
  return { ok: true }
}

// ============================================================
// The season
// ============================================================

export async function playSeasonGame(id: unknown, who: SeasonWho | null): Promise<Ok<{ phase: 'regular' | 'playoffs'; week: number }> | Fail> {
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { l, teams, t } = got
  if (!t.roster) return { ok: false, error: 'Finish Draft Day first.' }
  if (t.pending) return { ok: false, error: 'Open your pack from the last game first.' }

  if (l.phase === 'regular') {
    if (t.played >= SEASON_GAMES) return { ok: false, error: 'Your regular season is done.' }
    const wk = scheduleFor(l.schedule_seed)[t.played]
    const d = defenseById(wk.defense)!
    const g = simGame(seasonCards(lineupOf(t)), d, gameSeed(l, t, 'regular', wk.week))
    const won = g.points >= wk.line
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
      result: stored(g),
    })
    if (error) return error.code === '23505' ? { ok: true, phase: 'regular', week: wk.week } : { ok: false, error: 'That game would not play.' }
    const tier = rewardFor(g.points, wk.line)
    const pending: Pending = { phase: 'regular', week: wk.week, tier, ids: wildPack(l, t, `reward:regular:${wk.week}`, REWARD_TABLE[tier]).map((p) => p.id) }
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
    await playPlayoff(l, t, l.round, m.a === t.id ? m.b : m.a)
    await advance(l.id)
    return { ok: true, phase: 'playoffs', week: l.round }
  }
  return { ok: false, error: 'There are no games to play.' }
}

async function playPlayoff(l: LeagueRow, t: TeamRow, round: number, opponent: string | null) {
  const d = playoffDefense(l.schedule_seed, round)
  const g = simGame(seasonCards(lineupOf(t)), d, gameSeed(l, t, 'playoffs', round))
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
    result: stored(g),
  })
}

/** Keep a card from the last game's pack, or pass on it. A full bench names the one to let go. */
export async function keepReward(id: unknown, who: SeasonWho | null, cardId: unknown, release: unknown): Promise<Ok | Fail> {
  const got = await myTeam(id, who)
  if ('ok' in got) return got
  const { t } = got
  if (!t.pending) return { ok: false, error: 'No pack waiting.' }
  let bench = [...t.bench]
  if (cardId != null) {
    if (typeof cardId !== 'string' || !t.pending.ids.includes(cardId)) return { ok: false, error: "That card isn't in this pack." }
    if (bench.length >= BENCH_MAX) {
      if (typeof release !== 'string' || !bench.includes(release)) return { ok: false, error: `Your bench holds ${BENCH_MAX}. Pick one to let go.` }
      bench = bench.filter((x) => x !== release)
    }
    bench.push(cardId)
  }
  await db().from('pe_season_teams').update({ bench, pending: null }).eq('id', t.id)
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
        const g = simGame(seasonCards(lineupOf(cur)), d, gameSeed(l, cur, 'regular', wk.week))
        const won = g.points >= wk.line
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
        if (t && !games.some((g) => g.phase === 'playoffs' && g.week === l.round && g.team_id === t.id)) await playPlayoff(l, t, l.round, side === m.a ? m.b : m.a)
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
          await playPlayoff(l, cpuSubs(t, playoffDefense(l.schedule_seed, l.round)), l.round, side === m.a ? m.b : m.a)
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
// Views
// ============================================================

export type DefenseCard = Pick<Defense, 'id' | 'name' | 'blurb' | 'shuts' | 'soft'>

const defenseCard = (d: Defense): DefenseCard => ({ id: d.id, name: d.name, blurb: d.blurb, shuts: d.shuts, soft: d.soft })

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

export type CardStyle = { tag: ArchetypeTag; lanes: Record<Lane, number> }

export type ScoutView = {
  expected: number
  line: number | null
  passShare: number
  lanes: { lane: 'run' | 'short' | 'deep' | 'redZone'; eff: number }[]
  stopped: string[]
  helped: string[]
  pocket: number
  sub: { in: Player; out: Player; slot: number; gain: number } | null
}

export type GameLine = { phase: 'regular' | 'playoffs'; week: number; defense: string; line: number | null; points: number; won: boolean | null; opponent: string | null }

export type SeasonLine = {
  id: string
  name: string
  pos: Player['pos']
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
  grade: number | null
  pts: number
  value: number
}

export type Award = { title: string; line: string; team: string; who?: SeasonLine }

export type BracketView = {
  rounds: { round: number; defense: string; games: { a: TableRow | null; b: TableRow | null; aPts: number | null; bPts: number | null; winner: string | null }[] }[]
}

export type MySeason = {
  id: string
  teamName: string
  step: 'franchise' | 'packs' | 'bench' | 'season'
  franchise: number | null
  lineup: (Player | null)[]
  bench: Player[]
  openSlot: number | null
  openCards: Player[] | null
  benchPacks: number
  benchOpen: Player[] | null
  styles: Record<string, CardStyle>
  next: { phase: 'regular' | 'playoffs'; week: number; defense: DefenseCard; line: number | null; opponent: string | null; scouting: ScoutView } | null
  waiting: string | null
  pending: { tier: RewardTier; label: string; color: string; cards: Player[] } | null
  games: GameLine[]
  /** The game just played: how each drive ended and who did the most. */
  last: (GameLine & { drives: DriveEnd[]; top: BoxLine[]; yards: number }) | null
  book: SeasonLine[]
}

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
  me: MySeason | null
  bracket: BracketView | null
  leaders: { title: string; stat: keyof SeasonLine; rows: SeasonLine[] }[]
  awards: Award[]
}

function scoutView(t: TeamRow, d: Defense, line: number | null): ScoutView {
  const lineup = lineupOf(t)
  const s = scout(seasonCards(lineup), benchCards(cards(t.bench)), d, line ?? 0, POOLS)
  const nameOf = (id: string) => lineup.find((p) => p.id === id)?.name ?? ''
  return {
    expected: Math.round(s.expected * 10) / 10,
    line,
    passShare: s.passShare,
    lanes: s.lanes,
    stopped: s.stopped.map(nameOf),
    helped: s.helped.map(nameOf),
    pocket: s.pocket,
    sub: s.sub ? { in: card(s.sub.benchId)!, out: card(s.sub.outId)!, slot: s.sub.slot, gain: Math.round(s.sub.gain * 10) / 10 } : null,
  }
}

/** Every man's season off his box lines, for one team or the league. */
function seasonLines(games: GameRow[], teamName: (id: string) => string): SeasonLine[] {
  const by = new Map<string, SeasonLine & { grades: number[] }>()
  for (const g of games) {
    for (const b of g.result.box as BoxLine[]) {
      const k = `${g.team_id}|${b.id}`
      const cur =
        by.get(k) ??
        ({
          id: b.id,
          name: b.name,
          pos: b.pos,
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
          grade: null,
          pts: 0,
          value: card(b.id)?.score ?? 0,
          grades: [],
        } as SeasonLine & { grades: number[] })
      cur.games++
      cur.passYds += b.passYds ?? 0
      cur.passTd += b.passTd ?? 0
      cur.int += b.int ?? 0
      cur.rushYds += b.rushYds ?? 0
      cur.rushTd += b.rushTd ?? 0
      cur.rec += b.rec ?? 0
      cur.recYds += b.recYds ?? 0
      cur.recTd += b.recTd ?? 0
      cur.pts += b.pts
      if (b.grade != null) cur.grades.push(b.grade)
      by.set(k, cur)
    }
  }
  return [...by.values()].map(({ grades, ...l }) => ({
    ...l,
    pts: Math.round(l.pts * 10) / 10,
    grade: grades.length ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length) : null,
  }))
}

const LEADERS: { title: string; stat: keyof SeasonLine }[] = [
  { title: 'Most Valuable', stat: 'pts' },
  { title: 'Passing Yards', stat: 'passYds' },
  { title: 'Rushing Yards', stat: 'rushYds' },
  { title: 'Receiving Yards', stat: 'recYds' },
]

function awardsFor(teams: TeamRow[], lines: SeasonLine[]): Award[] {
  const out: Award[] = []
  const skill = lines.filter((l) => l.grade == null)
  const mvp = [...skill].sort((a, b) => b.pts - a.pts)[0]
  if (mvp) out.push({ title: 'MVP', line: `${mvp.pts.toLocaleString()} points`, who: mvp, team: mvp.team })
  // The least valuable: the biggest card who did the least with it.
  const big = skill.filter((l) => l.value >= 1600 && l.games >= 4)
  const lvp = [...big].sort((a, b) => a.pts / a.value - b.pts / b.value)[0]
  if (lvp) out.push({ title: 'Least Valuable Player', line: `${lvp.pts.toLocaleString()} points off a ${lvp.value.toLocaleString()} card`, who: lvp, team: lvp.team })
  // The best man who didn't start on Draft Day.
  const drafted = new Map(teams.map((t) => [t.id, new Set((t.draft.picks ?? []).map((p) => p.id))]))
  const breakout = [...skill].filter((l) => !drafted.get(l.teamId)?.has(l.id) && l.games >= 2).sort((a, b) => b.pts - a.pts)[0]
  if (breakout) out.push({ title: 'Breakout Player', line: `${breakout.pts.toLocaleString()} points off the bench`, who: breakout, team: breakout.team })
  const lineGrades = new Map<string, number[]>()
  for (const l of lines) if (l.grade != null) lineGrades.set(l.team, [...(lineGrades.get(l.team) ?? []), l.grade])
  const bestLine = [...lineGrades.entries()].map(([team, g]) => ({ team, avg: g.reduce((a, b) => a + b, 0) / g.length })).sort((a, b) => b.avg - a.avg)[0]
  if (bestLine) out.push({ title: 'Best Line', line: `Graded ${Math.round(bestLine.avg)} on average`, team: bestLine.team })
  return out
}

export async function seasonView(id: unknown, who: SeasonWho | null): Promise<SeasonView | null> {
  const l = await loadLeague(id)
  if (!l) return null
  const [teams, games] = await Promise.all([loadTeams(l.id), loadGames(l)])
  const mine = teams.find((t) => isMine(t, who)) ?? null
  const teamName = (tid: string) => teams.find((t) => t.id === tid)?.team_name ?? 'Team'
  const schedule = scheduleFor(l.schedule_seed).map((w) => ({ week: w.week, defense: defenseCard(defenseById(w.defense)!), line: w.line }))

  const table: TableRow[] = standings(teams).map((t) => ({
    id: t.id,
    teamName: t.team_name,
    owner: t.is_cpu ? 'CPU' : t.display_name,
    cpu: t.is_cpu,
    you: t.id === mine?.id,
    wins: t.wins,
    losses: t.losses,
    pointsFor: t.points_for,
    played: t.played,
    drafted: !!t.roster,
    seed: t.playoff_seed,
    eliminated: t.eliminated,
    champion: l.champion_id === t.id,
  }))
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
  const lines = seasonLines(games, teamName)
  const leaders = LEADERS.map((x) => ({ ...x, rows: [...lines].sort((a, b) => Number(b[x.stat]) - Number(a[x.stat])).filter((r) => Number(r[x.stat]) > 0).slice(0, 5) }))
  const awards = l.phase === 'playoffs' || l.phase === 'complete' ? awardsFor(teams, seasonLines(regular, teamName)) : []

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
    const step: MySeason['step'] = mine.roster ? 'season' : d.franchise == null ? 'franchise' : picks.length < SLOTS.length ? 'packs' : 'bench'
    const styles: Record<string, CardStyle> = {}
    for (const p of [...lineup, ...bench]) if (p) styles[p.id] = (({ tag, lanes }) => ({ tag, lanes }))(archetypeOf(p))

    let next: MySeason['next'] = null
    let waiting: string | null = null
    if (mine.roster && !mine.pending) {
      if (l.phase === 'regular' && mine.played < SEASON_GAMES) {
        const wk = scheduleFor(l.schedule_seed)[mine.played]
        const front = defenseById(wk.defense)!
        next = { phase: 'regular', week: wk.week, defense: defenseCard(front), line: wk.line, opponent: null, scouting: scoutView(mine, front, wk.line) }
      } else if (l.phase === 'regular') {
        const left = teams.filter((t) => t.played < SEASON_GAMES)
        waiting = `Waiting on ${left.length} ${left.length === 1 ? 'team' : 'teams'} to finish: ${left.map((t) => t.team_name).join(', ')}`
      } else if (l.phase === 'playoffs' && bracket) {
        const m = bracket.rounds[l.round - 1]?.games.find((x) => x.a?.id === mine.id || x.b?.id === mine.id)
        const playedIt = games.some((g) => g.phase === 'playoffs' && g.week === l.round && g.team_id === mine.id)
        if (m && !m.winner && !playedIt) {
          const front = playoffDefense(l.schedule_seed, l.round)
          const opp = m.a?.id === mine.id ? m.b : m.a
          next = { phase: 'playoffs', week: l.round, defense: defenseCard(front), line: null, opponent: opp?.teamName ?? null, scouting: scoutView(mine, front, null) }
        } else if (m && !m.winner) waiting = 'Waiting on the other team to play.'
      }
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
    })
    const lastRow = myGames[myGames.length - 1]
    me = {
      id: mine.id,
      teamName: mine.team_name,
      step,
      franchise: d.franchise ?? null,
      lineup,
      bench,
      openSlot: d.open ?? null,
      openCards: d.open != null ? cards(d.packs?.[d.open] ?? []) : null,
      benchPacks: (d.bench ?? []).filter((b) => b.kept).length,
      benchOpen: lastBench && !lastBench.kept ? cards(lastBench.ids) : null,
      styles,
      next,
      waiting,
      pending: mine.pending
        ? { tier: mine.pending.tier, label: REWARD_LOOK[mine.pending.tier].label, color: REWARD_LOOK[mine.pending.tier].color, cards: cards(mine.pending.ids) }
        : null,
      games: myGames.map(lineOf),
      last: lastRow
        ? {
            ...lineOf(lastRow),
            drives: lastRow.result.drives.map((x) => x.end),
            top: [...(lastRow.result.box as BoxLine[])].filter((b) => b.grade == null).sort((a, b) => b.pts - a.pts).slice(0, 3),
            yards: lastRow.result.yards,
          }
        : null,
      book: lines.filter((x) => x.teamId === mine.id).sort((a, b) => b.pts - a.pts),
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
    me,
    bracket,
    leaders,
    awards,
  }
}

/** One game, whole: the drives and every man's line. Anyone in the league can read any game. */
export async function seasonGame(id: unknown, teamId: unknown, phase: unknown, week: unknown): Promise<{ team: string; defense: string; line: number | null; game: GameRow } | null> {
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
  return { team: (t as { team_name: string } | null)?.team_name ?? 'Team', defense: front?.name ?? g.defense, line: g.line, game: g }
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
