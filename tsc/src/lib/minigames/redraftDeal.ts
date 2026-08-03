// Redraft — building the board, and dealing a set of slots.
//
// Server half. The rules and the wire shapes live in ./redraft, which is
// import-free so the board can read them in the browser.
//
// A "board" is one season's canonical draft with every pick joined to what
// that player actually did per game, in the league's own scoring. A "deal" is
// the slots one seed picks out of it, plus the six-man shortlist hung on each.

import { promises as fs } from 'fs'
import path from 'path'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalDraftIds } from '@/lib/canonicalDraft'
import { pageAll } from './pool'
import { DEMO_POOL_ID, DEMO_POOL_LABEL } from './demoPool'
import { makeRng, newSeed, normalizeSeed } from './roulette'
import { loadManagerNames } from './managerNames'
import {
  getRankLookup,
  latestRankYear,
  normPlayerName,
  isScoringProfile,
  FIRST_RANK_YEAR,
  SITE_PROFILE,
  type ScoringProfile,
  type RankLookup,
} from './ranks'
import {
  SHORTLIST,
  MANAGER_PICKS,
  MAX_ROUND1_PICKS,
  type RedraftMode,
  type RedraftCandidate,
  type RedraftSlot,
  type RedraftDeal,
  type RedraftError,
} from './redraft'

/** Only positions the rank files score. A kicker taken in round fourteen is
    a fine joke on a Guess the Draft card and an unanswerable question here. */
const SCORABLE = new Set(['QB', 'RB', 'WR', 'TE'])

/** How far past the slot the shortlist reaches for its other five names.
    Thirty picks is roughly two and a half rounds — far enough that a genuine
    steal is in range, close enough that everyone offered was valued about the
    same at the time. */
const WINDOW = 30

/** One real pick, joined to what the player actually did. */
type BoardPick = {
  key: string
  overallPick: number
  round: number
  managerKey: string
  managerName: string
  teamName: string | null
  name: string
  pos: string
  nflTeam: string | null
  playerId: string | null
  ppg: number
  fpts: number
  gp: number
  posRank: number
}

type Board = {
  year: number
  /** Ordered by overall pick, scorable picks only. */
  picks: BoardPick[]
  /** Every pick in the draft, used only to know how big round one was. */
  roundOneSize: number
}

type Pool = {
  label: string
  sublabel: string
  leagueSlug: string | null
  profile: ScoringProfile
  boards: Board[]
}

function normTeam(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim().toUpperCase()
  if (!t || t === 'FA' || t === 'NONE' || t === 'NULL') return null
  return t
}

/** Joins one raw pick to the rank files. Returns null when the player can't
    be scored, which is a kicker, a defence, or somebody who never played. */
function toBoardPick(
  raw: {
    overallPick: number
    round: number
    managerKey: string
    managerName: string
    teamName: string | null
    playerName: string | null
    position: string | null
    nflTeam: string | null
  },
  ranks: RankLookup,
  keyPrefix: string
): BoardPick | null {
  if (!raw.playerName) return null
  const entry = ranks.get(normPlayerName(raw.playerName))
  if (!entry) return null
  const pos = (entry.position || raw.position || '').toUpperCase()
  if (!SCORABLE.has(pos)) return null
  return {
    key: `${keyPrefix}-${raw.overallPick}`,
    overallPick: raw.overallPick,
    round: raw.round,
    managerKey: raw.managerKey,
    managerName: raw.managerName,
    teamName: raw.teamName,
    name: raw.playerName,
    pos,
    // The rank files' own team field is a present-day snapshot and wrong for
    // past seasons, so the per-season truth comes off the draft row.
    nflTeam: normTeam(raw.nflTeam),
    playerId: entry.playerId,
    ppg: entry.ppg,
    fpts: entry.fpts,
    gp: entry.gp,
    posRank: entry.posRank,
  }
}

// ============================================================
// The league board
// ============================================================

async function buildLeaguePool(slug: string): Promise<Pool | null> {
  const db = createAdminClient()

  const { data: leagueRows } = await db
    .from('leagues')
    .select('id, name, draft_scoring_profile')
    .eq('slug', slug)
    .eq('manager_view', false)
    .limit(1)
  const league = (leagueRows ?? [])[0] as
    | { id: string; name: string; draft_scoring_profile: string | null }
    | undefined
  if (!league) return null

  const profile: ScoringProfile = isScoringProfile(league.draft_scoring_profile)
    ? league.draft_scoring_profile
    : SITE_PROFILE

  // Unlike The Gauntlet, this game DOES score players, so the seasons are
  // clamped to the years the rank files actually cover. Completed seasons
  // only, by the house rule.
  const newest = await latestRankYear()
  const seasons = await pageAll<{ id: string; year: number }>(() =>
    db
      .from('seasons')
      .select('id, year')
      .eq('league_id', league.id)
      .not('champion_manager_id', 'is', null)
      .gte('year', FIRST_RANK_YEAR)
      .lte('year', newest)
      .order('year')
  )
  if (seasons.length === 0) return null

  const seasonIds = seasons.map((s) => s.id)
  const [nameById, msRows, draftRows] = await Promise.all([
    // The league's own name for each manager (renames and merges applied),
    // not the platform's. See ./managerNames.
    loadManagerNames(db, [league.id]),
    pageAll<{ season_id: string; manager_id: string; team_name: string | null }>(() =>
      db
        .from('manager_seasons')
        .select('season_id, manager_id, team_name')
        .in('season_id', seasonIds)
        .order('season_id')
    ),
    pageAll<{ id: string; season_id: string; external_id: string | null }>(() =>
      db.from('drafts').select('id, season_id, external_id').in('season_id', seasonIds).order('id')
    ),
  ])
  if (draftRows.length === 0) return null

  const pickRows = await pageAll<{
    draft_id: string
    round: number
    pick: number
    manager_id: string | null
    player_name: string | null
    position: string | null
    nfl_team: string | null
  }>(() =>
    db
      .from('draft_picks')
      .select('draft_id, round, pick, manager_id, player_name, position, nfl_team')
      .in('draft_id', draftRows.map((d) => d.id))
      .order('pick')
  )

  // One draft per season, by the shared rule. pams 2019 carries both a
  // curated upload and an NFL.com scrape; reading both would put the same
  // player on the board twice at two different picks, which in a game about
  // who was available is not a cosmetic problem.
  const pickCount = new Map<string, number>()
  for (const row of pickRows) pickCount.set(row.draft_id, (pickCount.get(row.draft_id) ?? 0) + 1)
  const canonical = canonicalDraftIds(draftRows, pickCount)
  const seasonByDraft = new Map(draftRows.map((d) => [d.id, d.season_id]))

  const teamBySeasonManager = new Map(
    msRows.map((r) => [`${r.season_id}|${r.manager_id}`, r.team_name])
  )

  const bySeason = new Map<string, typeof pickRows>()
  for (const row of pickRows) {
    if (!canonical.has(row.draft_id)) continue
    const seasonId = seasonByDraft.get(row.draft_id)
    if (!seasonId) continue
    const list = bySeason.get(seasonId)
    if (list) list.push(row)
    else bySeason.set(seasonId, [row])
  }

  const boards: Board[] = []
  for (const season of seasons) {
    const rows = bySeason.get(season.id)
    if (!rows || rows.length === 0) continue
    const ranks = await getRankLookup(profile, season.year)
    if (ranks.size === 0) continue

    const sorted = rows.slice().sort((a, b) => a.pick - b.pick)
    const picks: BoardPick[] = []
    for (const row of sorted) {
      if (!row.manager_id) continue
      const managerName = nameById.get(row.manager_id)
      if (!managerName) continue
      const bp = toBoardPick(
        {
          overallPick: row.pick,
          round: row.round,
          managerKey: row.manager_id,
          managerName,
          teamName: teamBySeasonManager.get(`${season.id}|${row.manager_id}`) ?? null,
          playerName: row.player_name,
          position: row.position,
          nflTeam: row.nfl_team,
        },
        ranks,
        season.id.slice(0, 8)
      )
      if (bp) picks.push(bp)
    }
    if (picks.length === 0) continue

    boards.push({
      year: season.year,
      picks,
      roundOneSize: sorted.filter((r) => r.round === 1).length,
    })
  }

  if (boards.length === 0) return null
  return {
    label: league.name,
    sublabel: 'League history',
    leagueSlug: slug,
    profile,
    boards,
  }
}

// ============================================================
// The demo board
// ============================================================
//
// Same shape off the static demo tree rather than the database, so the game is
// playable by someone who has never signed in. The demo is a rename of a real
// league, so the drafts are genuine and so are the seasons the players had.

const DEMO_DIR = path.join(process.cwd(), 'public', 'demo', 'data')
const DEMO_PROFILE: ScoringProfile = 'ppr_6pt'

type DemoDraftFile = {
  year: number
  picks: Array<{
    overall_pick: number
    round: number
    player_name: string | null
    position: string | null
    nfl_team: string | null
    user_id: number
    manager_name: string | null
  }>
}

type DemoSeasonFile = {
  year: number
  standings: Array<{ team_name: string | null; owner_name: string | null; owner_user_id: number }>
}

async function readDemoJson<T>(rel: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DEMO_DIR, rel), 'utf8')) as T
  } catch {
    return null
  }
}

async function buildDemoPool(): Promise<Pool | null> {
  const dir = await readDemoJson<{ drafts: Array<{ year: number }> }>('drafts/drafts_directory.json')
  const newest = await latestRankYear()
  const years = (dir?.drafts ?? [])
    .map((d) => d.year)
    .filter((y) => y >= FIRST_RANK_YEAR && y <= newest)
    .sort((a, b) => a - b)
  if (years.length === 0) return null

  const boards: Board[] = []
  for (const year of years) {
    const [draft, season] = await Promise.all([
      readDemoJson<DemoDraftFile>(`drafts/${year}.json`),
      readDemoJson<DemoSeasonFile>(`seasons/${year}.json`),
    ])
    if (!draft?.picks?.length) continue
    const ranks = await getRankLookup(DEMO_PROFILE, year)
    if (ranks.size === 0) continue

    const standings = season?.standings ?? []
    const sorted = draft.picks.slice().sort((a, b) => a.overall_pick - b.overall_pick)
    const picks: BoardPick[] = []
    for (const p of sorted) {
      const standing = standings.find((s) => s.owner_user_id === p.user_id)
      const managerName = standing?.owner_name ?? p.manager_name
      if (!managerName) continue
      const bp = toBoardPick(
        {
          overallPick: p.overall_pick,
          round: p.round,
          managerKey: `demo-${p.user_id}`,
          managerName,
          teamName: standing?.team_name ?? null,
          playerName: p.player_name,
          position: p.position,
          nflTeam: p.nfl_team,
        },
        ranks,
        `demo${year}`
      )
      if (bp) picks.push(bp)
    }
    if (picks.length === 0) continue
    boards.push({ year, picks, roundOneSize: sorted.filter((p) => p.round === 1).length })
  }

  if (boards.length === 0) return null
  return {
    label: DEMO_POOL_LABEL,
    sublabel: 'Demo league',
    leagueSlug: null,
    profile: DEMO_PROFILE,
    boards,
  }
}

// Cached for the same half day as the other decks. The rank-file year is part
// of the key so the deploy that adds a season invalidates this by itself
// rather than waiting the cache out, exactly as the squad index does.
async function loadPool(poolId: string): Promise<Pool | null> {
  const newest = await latestRankYear()
  if (poolId === DEMO_POOL_ID) {
    return unstable_cache(
      async () => buildDemoPool(),
      ['minigame-redraft-pool', 'v1', String(newest), 'demo'],
      { tags: ['minigame-pool'], revalidate: 60 * 60 * 12 }
    )()
  }
  return unstable_cache(
    async () => buildLeaguePool(poolId),
    ['minigame-redraft-pool', 'v1', String(newest), poolId],
    { tags: ['minigame-pool'], revalidate: 60 * 60 * 12 }
  )()
}

// ============================================================
// The deal
// ============================================================

function toCandidate(p: BoardPick): RedraftCandidate {
  return {
    key: p.key,
    name: p.name,
    pos: p.pos,
    nflTeam: p.nflTeam,
    playerId: p.playerId,
    ppg: p.ppg,
    fpts: p.fpts,
    gp: p.gp,
    posRank: p.posRank,
    overallPick: p.overallPick,
    round: p.round,
  }
}

/**
 * Builds the six-man shortlist for one slot.
 *
 * The player actually taken is always in it, and the other five come from
 * players still on the board when that pick was made — which here means
 * anyone taken LATER in the real draft, since everyone taken earlier was
 * already gone.
 *
 * Two rules that matter:
 *
 *  · The five are drawn from a window of about thirty picks rather than from
 *    the whole remaining class. Offering a first-round slot the choice
 *    between the real pick and somebody taken in round eleven is not a
 *    decision, it's a trivia question about one player.
 *  · Nobody appears in two shortlists on the same card. The alternative is
 *    letting a player you already took come back around, and since the whole
 *    card is dealt in one response there would be no way to take him off the
 *    later list once you had — you could draft the same man twice and have
 *    him counted twice. Costs a little realism, removes a whole class of
 *    "wait, I already have him". `used` arrives pre-loaded with every slot's
 *    real pick for this reason; see buildSlots.
 */
function buildShortlist(
  board: Board,
  slot: BoardPick,
  used: Set<string>,
  rng: () => number
): RedraftCandidate[] | null {
  const eligible = board.picks.filter(
    (p) => p.overallPick > slot.overallPick && !used.has(p.key)
  )
  const near = eligible.filter((p) => p.overallPick <= slot.overallPick + WINDOW)
  // Late in a draft the window runs out of players. Widening beats dealing a
  // short list, and by then the picks are lottery tickets anyway.
  const source = near.length >= SHORTLIST - 1 ? near : eligible
  if (source.length < SHORTLIST - 1) return null

  const shuffled = source.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = shuffled[i]
    shuffled[i] = shuffled[j]
    shuffled[j] = tmp
  }

  const chosen = [slot, ...shuffled.slice(0, SHORTLIST - 1)]
  // Shuffled again so the real pick isn't always first on the list, which
  // would give the answer away before anyone read a name.
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = chosen[i]
    chosen[i] = chosen[j]
    chosen[j] = tmp
  }
  for (const c of chosen) used.add(c.key)
  return chosen.map(toCandidate)
}

function buildSlots(
  board: Board,
  slotPicks: BoardPick[],
  rng: () => number
): RedraftSlot[] {
  // Every slot's own pick is reserved BEFORE any shortlist is built, and this
  // is load-bearing. Reserving them as we went let an early slot draw a later
  // slot's real pick as one of its five extras — so the player appeared on two
  // lists, and taking him at pick 1 and again at pick 5 counted him twice in a
  // total that is supposed to be a team. Measured on pams before the fix: 7
  // repeats in a twelve-slot first round, 2 in an eight-round manager board.
  const used = new Set<string>(slotPicks.map((p) => p.key))
  const slots: RedraftSlot[] = []
  for (const p of slotPicks) {
    const candidates = buildShortlist(board, p, used, rng)
    if (!candidates) break
    slots.push({
      key: p.key,
      overallPick: p.overallPick,
      round: p.round,
      slotManagerName: p.managerName,
      slotTeamName: p.teamName,
      candidates,
      actualKey: p.key,
    })
  }
  return slots
}

export async function dealRedraft(
  poolParam: string,
  modeParam: RedraftMode,
  seedParam: string | null
): Promise<RedraftDeal | RedraftError> {
  const poolId = (poolParam ?? '').trim().toLowerCase()
  const seed = normalizeSeed(seedParam) ?? newSeed()

  if (!poolId) {
    return { ok: false, status: 400, error: 'Pick a league to play.' }
  }
  // One league at a time. A draft board is a single ordered event — the whole
  // question is who was still there — and there is no such thing as one board
  // spanning two leagues.
  if (poolId === 'site' || poolId.includes(',')) {
    return {
      ok: false,
      status: 400,
      error: 'Redraft is played one league at a time. A draft board only exists inside one draft.',
    }
  }
  if (poolId !== DEMO_POOL_ID && !/^[a-z0-9-]{1,80}$/.test(poolId)) {
    return { ok: false, status: 404, error: 'No league on this site goes by that name.' }
  }

  const pool = await loadPool(poolId)
  if (!pool) {
    return { ok: false, status: 404, error: 'No league on this site goes by that name.' }
  }
  if (pool.boards.length === 0) {
    return {
      ok: false,
      status: 409,
      error: "This league's drafts haven't come across from its old platform, so there is no board to redo.",
    }
  }

  const rng = makeRng(seed)

  // Mode decides how many slots are wanted, which decides which boards are
  // even usable, so the board is chosen from the ones that can fill the mode
  // rather than at random and then apologised for.
  if (modeParam === 'round1') {
    const usable = pool.boards.filter((b) => {
      const firsts = b.picks.filter((p) => p.round === 1)
      return firsts.length >= 4 && b.picks.length >= firsts.length + SHORTLIST
    })
    if (usable.length === 0) {
      return {
        ok: false,
        status: 409,
        error: 'No draft in this league has a first round complete enough to redo yet.',
      }
    }
    const board = usable[Math.floor(rng() * usable.length)]
    const firsts = board.picks.filter((p) => p.round === 1).slice(0, MAX_ROUND1_PICKS)
    const slots = buildSlots(board, firsts, rng)
    if (slots.length < 4) {
      return { ok: false, status: 409, error: 'Not enough of that draft can be scored to redo it.' }
    }
    return {
      ok: true,
      seed,
      mode: 'round1',
      pool: { id: poolId, label: pool.label, sublabel: pool.sublabel, leagueSlug: pool.leagueSlug },
      year: board.year,
      managerName: null,
      teamName: null,
      slots,
      profile: pool.profile,
    }
  }

  // manager mode: somebody's whole draft, their real slots in order.
  type Cand = { board: Board; picks: BoardPick[] }
  const candidates: Cand[] = []
  for (const board of pool.boards) {
    const byManager = new Map<string, BoardPick[]>()
    for (const p of board.picks) {
      const list = byManager.get(p.managerKey)
      if (list) list.push(p)
      else byManager.set(p.managerKey, [p])
    }
    for (const picks of byManager.values()) {
      if (picks.length < MANAGER_PICKS) continue
      candidates.push({ board, picks: picks.slice(0, MANAGER_PICKS) })
    }
  }
  if (candidates.length === 0) {
    return {
      ok: false,
      status: 409,
      error: 'No draft in this league runs deep enough yet to hand over a whole board.',
    }
  }

  const chosen = candidates[Math.floor(rng() * candidates.length)]
  const slots = buildSlots(chosen.board, chosen.picks, rng)
  if (slots.length < 4) {
    return { ok: false, status: 409, error: 'Not enough of that draft can be scored to redo it.' }
  }

  return {
    ok: true,
    seed,
    mode: 'manager',
    pool: { id: poolId, label: pool.label, sublabel: pool.sublabel, leagueSlug: pool.leagueSlug },
    year: chosen.board.year,
    managerName: chosen.picks[0].managerName,
    teamName: chosen.picks[0].teamName,
    slots,
    profile: pool.profile,
  }
}
