// Everything on the Cup page beyond the bracket itself: each game's win
// odds, the all-time series between the two managers and their last
// meeting, recent form, every team's odds of winning the Cup, and the
// league's bracket challenge (picks and the leaderboard).
//
// Win odds use the same model as the playoff odds (lib/powerSim): each
// team's true scoring rate is its season PPG shrunk toward the league
// average by how little evidence there is, plus a week of scoring noise.
// The Cup odds play the rest of the bracket out 20,000 times on those rates.

import { createAdminClient } from '@/lib/supabase/admin'
import { bracketGameFilter } from '@/lib/bracketGames'
import { resolveWeekLockAt } from '@/lib/liveSeason'
import { GAME_SD_REL, TEAM_SD_REL } from '@/lib/powerSim'
import { leagueName } from '@/lib/pamsNames'
import { seedOrder, type CupBracket, type CupMatch } from './bracket'
import type { CupView } from './load'

// ── Shapes (all JSON, handed to the client page) ──────────────────────────

export type CupSeries = {
  // From side a's point of view.
  w: number
  l: number
  t: number
  last: { year: number; week: number; winner: 'a' | 'b' | 'tie'; sa: number; sb: number; playoff: boolean } | null
}

export type CupMatchDetail = {
  // Side a's chance to win, before the week's games (0-1). Null when a side
  // isn't known yet or there's no season scoring to go on.
  probA: number | null
  series: CupSeries | null
  // Last three scores before the round's week, oldest first.
  formA: number[]
  formB: number[]
  ppgA: number | null
  ppgB: number | null
  // The Cup's own rule run over this season so far: in how many weeks each
  // side put up the higher score (whoever they were playing).
  duel: { a: number; b: number; t: number } | null
  lockAt: string | null
  // Picks are open right now (both sides known, before kickoff).
  open: boolean
  locked: boolean
  // How many league members picked each side.
  crowd: { a: number; b: number }
}

export type CupOdds = {
  managerId: string
  name: string
  seed: number
  alive: boolean
  // Chance to reach each round after the first (index 0 = round two), and
  // to win the whole thing.
  reach: number[]
  win: number
  out: { round: string; to: string; mine: number; theirs: number } | null
}

export type CupPicker = { profileId: string; name: string; teamId: string | null }

export type CupPickRow = { profileId: string; round: number; slot: number; picked: string }

export type CupBoardRow = {
  profileId: string
  name: string
  points: number
  correct: number
  decided: number
  champion: string | null
  // true once their champion wins it, false as soon as it's knocked out.
  championRight: boolean | null
}

export type CupExtras = {
  details: Record<string, CupMatchDetail>
  odds: CupOdds[]
  pickers: CupPicker[]
  picks: CupPickRow[]
  board: CupBoardRow[]
  points: number[]
  championBonus: number
  championLockAt: string | null
  championOpen: boolean
  hasPickTable: boolean
}

// Points for a correct pick, by round: 1, 2, 2, 3 in a four-round Cup, the
// final worth the most. Flat on purpose (Joey, 2026-10-14): each game is
// picked the week it's played, with both teams known, so a late round is no
// harder to call than an early one and the final (a 50/50) shouldn't be
// worth more than all of round one. The long-range call is the champion
// pick, made before round one; that's the bonus.
export function roundPoints(rounds: number): number[] {
  const fromEnd = [3, 2, 2, 1]
  return Array.from({ length: rounds }, (_, r) => fromEnd[rounds - 1 - r] ?? 1)
}
export const CHAMPION_BONUS = 5

// ── Maths ─────────────────────────────────────────────────────────────────

// Abramowitz-Stegun erf, plenty for a percentage.
function phi(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2))
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2)
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

type Rating = { mu: number; sd: number }

// Each team's shrunk scoring rate from its scores so far, and the week-to-
// week noise, the way powerSim does it.
function ratings(scores: Map<string, number[]>): { rate: Map<string, Rating>; gameSd: number } {
  const all = [...scores.values()].flat()
  const mean = all.length ? all.reduce((s, v) => s + v, 0) / all.length : 100
  let ss = 0
  let df = 0
  for (const list of scores.values()) {
    if (list.length < 2) continue
    const m = list.reduce((s, v) => s + v, 0) / list.length
    for (const v of list) ss += (v - m) ** 2
    df += list.length - 1
  }
  const prior = GAME_SD_REL * mean
  const gameSd = Math.sqrt((ss + 30 * prior ** 2) / (df + 30))
  const teamSd = TEAM_SD_REL * mean
  const rate = new Map<string, Rating>()
  for (const [id, list] of scores) {
    const n = list.length
    const ppg = n ? list.reduce((s, v) => s + v, 0) / n : mean
    const prec = 1 / teamSd ** 2 + n / gameSd ** 2
    rate.set(id, { mu: (mean / teamSd ** 2 + (n * ppg) / gameSd ** 2) / prec, sd: Math.sqrt(1 / prec) })
  }
  return { rate, gameSd }
}

function gauss(rand: () => number, mu: number, sd: number): number {
  const u = Math.max(rand(), 1e-12)
  const v = rand()
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ── Loader ────────────────────────────────────────────────────────────────

type Db = ReturnType<typeof createAdminClient>

export type CupHistoryGame = { season_id: string; week: number; manager_a_id: string; manager_b_id: string; score_a: number | null; score_b: number | null; is_playoff: boolean | null }

// Placement games (5th place and below) aren't meetings, so the series
// leaves them out (lib/bracketGames).
async function allLeagueGames(db: Db, seasonIds: string[]) {
  type Row = CupHistoryGame
  const out: Row[] = []
  if (!seasonIds.length) return out
  const counts = await bracketGameFilter(db, seasonIds)
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('matchups')
      .select('id, season_id, week, manager_a_id, manager_b_id, score_a, score_b, is_playoff')
      .in('season_id', seasonIds)
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error || !data) break
    out.push(...(data as Row[]).filter(counts))
    if (data.length < 1000) break
  }
  return out
}

// What the extras are worked out from: the database's rows (loadCupExtras)
// or the demo league's (demo.ts).
export type CupExtrasSource = {
  seasons: { id: string; year: number }[]
  managers: { id: string; profile_id: string | null; display_name: string | null }[]
  profiles: { id: string; canonical_name: string; is_hidden: boolean | null }[]
  // Null when the cup_picks table isn't there (before migration 0079).
  picks: { profile_id: string; round: number; slot: number; picked_manager_id: string }[] | null
  // Every game the league has played, for the all-time series.
  history: CupHistoryGame[]
  // When a week's picks lock (Thursday kickoff).
  lockAtOf: (week: number) => string | null
  now: number
}

export async function loadCupExtras(leagueId: string, view: CupView): Promise<CupExtras> {
  const db = createAdminClient()
  const [{ data: seasons }, { data: managers }, { data: profiles }, picksRes] = await Promise.all([
    db.from('seasons').select('id, year').eq('league_id', leagueId),
    db.from('managers').select('id, profile_id, display_name').eq('league_id', leagueId),
    db.from('manager_profiles').select('id, canonical_name, is_hidden').eq('league_id', leagueId),
    db.from('cup_picks').select('profile_id, round, slot, picked_manager_id').eq('cup_id', view.cup.id),
  ])
  const seasonRows = (seasons ?? []) as CupExtrasSource['seasons']
  return computeCupExtras(view, {
    seasons: seasonRows,
    managers: (managers ?? []) as CupExtrasSource['managers'],
    profiles: (profiles ?? []) as CupExtrasSource['profiles'],
    picks: picksRes.error ? null : ((picksRes.data ?? []) as NonNullable<CupExtrasSource['picks']>),
    history: await allLeagueGames(db, seasonRows.map((s) => s.id)),
    lockAtOf: (week) => resolveWeekLockAt(view.season.settings, week),
    now: Date.now(),
  })
}

export function computeCupExtras(view: CupView, src: CupExtrasSource): CupExtras {
  const { cup, bracket } = view
  const { seasons, managers, profiles, history, now } = src
  const hasPickTable = src.picks != null
  const yearOf = new Map((seasons ?? []).map((s) => [s.id as string, s.year as number]))
  const personOf = new Map((managers ?? []).map((m) => [m.id as string, (m.profile_id as string | null) ?? (m.id as string)]))
  const person = (id: string) => personOf.get(id) ?? id
  const profileName = new Map((profiles ?? []).map((p) => [p.id as string, p.canonical_name as string]))
  const nameOfManager = (id: string) => {
    const m = (managers ?? []).find((x) => x.id === id)
    const prof = m?.profile_id ? profileName.get(m.profile_id as string) : undefined
    return prof || leagueName(id, (m?.display_name as string) ?? 'Unknown')
  }

  // ── Season scoring: form and ratings ──
  const scoresBefore = (week: number) => {
    const out = new Map<string, number[]>()
    for (const g of view.games) {
      if (g.week >= week || !view.weekFinal(g.week)) continue
      for (const [id, s] of [
        [g.a, g.sa],
        [g.b, g.sb],
      ] as const) {
        if (s == null || !(s > 0)) continue
        out.set(id, [...(out.get(id) ?? []), s])
      }
    }
    return out
  }
  const formOf = (id: string, week: number) => {
    const list = view.games
      .filter((g) => g.week < week && view.weekFinal(g.week) && (g.a === id || g.b === id))
      .sort((x, y) => x.week - y.week)
      .map((g) => (g.a === id ? g.sa : g.sb) ?? 0)
    return list.slice(-3).map((v) => Math.round(v * 10) / 10)
  }

  // Week by week this season, who scored more (the Cup's rule, backdated).
  const duelOf = (a: string, b: string, week: number): CupMatchDetail['duel'] => {
    const by = new Map<number, { a?: number; b?: number }>()
    for (const g of view.games) {
      if (g.week >= week || !view.weekFinal(g.week)) continue
      for (const [id, sc] of [
        [g.a, g.sa],
        [g.b, g.sb],
      ] as const) {
        if (sc == null || !(sc > 0)) continue
        if (id === a) by.set(g.week, { ...(by.get(g.week) ?? {}), a: sc })
        if (id === b) by.set(g.week, { ...(by.get(g.week) ?? {}), b: sc })
      }
    }
    let wa = 0
    let wb = 0
    let t = 0
    for (const x of by.values()) {
      if (x.a == null || x.b == null) continue
      if (x.a > x.b) wa++
      else if (x.b > x.a) wb++
      else t++
    }
    return wa + wb + t ? { a: wa, b: wb, t } : null
  }

  // ── All-time series between two people ──
  const seriesOf = (aId: string, bId: string, beforeYear: number, beforeWeek: number): CupSeries | null => {
    const pa = person(aId)
    const pb = person(bId)
    let w = 0
    let l = 0
    let t = 0
    let last: CupSeries['last'] = null
    let lastKey = -1
    for (const g of history) {
      const year = yearOf.get(g.season_id)
      if (year == null || g.score_a == null || g.score_b == null || !(Number(g.score_a) > 0) || !(Number(g.score_b) > 0)) continue
      if (year > beforeYear || (year === beforeYear && g.week >= beforeWeek)) continue
      const ga = person(g.manager_a_id)
      const gb = person(g.manager_b_id)
      let mine: number
      let theirs: number
      if (ga === pa && gb === pb) {
        mine = Number(g.score_a)
        theirs = Number(g.score_b)
      } else if (ga === pb && gb === pa) {
        mine = Number(g.score_b)
        theirs = Number(g.score_a)
      } else continue
      if (mine > theirs) w++
      else if (mine < theirs) l++
      else t++
      const key = year * 100 + g.week
      if (key > lastKey) {
        lastKey = key
        last = { year, week: g.week, winner: mine > theirs ? 'a' : mine < theirs ? 'b' : 'tie', sa: mine, sb: theirs, playoff: !!g.is_playoff }
      }
    }
    return w + l + t ? { w, l, t, last } : null
  }

  // ── Picks ──
  const pickRows: CupPickRow[] = (src.picks ?? []).map((p) => ({
    profileId: p.profile_id as string,
    round: p.round as number,
    slot: p.slot as number,
    picked: p.picked_manager_id as string,
  }))

  // ── Each game ──
  const details: Record<string, CupMatchDetail> = {}
  for (const r of bracket.rounds) {
    const before = scoresBefore(r.week)
    const { rate, gameSd } = ratings(before)
    const lockAt = src.lockAtOf(r.week)
    const locked = lockAt != null && now >= Date.parse(lockAt)
    for (const m of r.matches) {
      const a = m.a.kind === 'team' ? m.a.entrant.managerId : null
      const b = m.b.kind === 'team' ? m.b.entrant.managerId : null
      let probA: number | null = null
      if (a && b && rate.get(a) && rate.get(b)) {
        const ra = rate.get(a)!
        const rb = rate.get(b)!
        probA = phi((ra.mu - rb.mu) / Math.sqrt(2 * gameSd ** 2 + ra.sd ** 2 + rb.sd ** 2))
      }
      const crowd = { a: 0, b: 0 }
      for (const p of pickRows) {
        if (p.round !== r.round || p.slot !== m.slot) continue
        if (p.picked === a) crowd.a++
        else if (p.picked === b) crowd.b++
      }
      const avg = (list: number[] | undefined) => (list && list.length ? Math.round((list.reduce((s, v) => s + v, 0) / list.length) * 10) / 10 : null)
      details[m.id] = {
        probA,
        series: a && b ? seriesOf(a, b, cup.season_year, r.week) : null,
        formA: a ? formOf(a, r.week) : [],
        formB: b ? formOf(b, r.week) : [],
        ppgA: a ? avg(before.get(a)) : null,
        ppgB: b ? avg(before.get(b)) : null,
        duel: a && b ? duelOf(a, b, r.week) : null,
        lockAt,
        open: !!a && !!b && m.state !== 'final' && m.state !== 'waiting' && !locked,
        locked,
        crowd,
      }
    }
  }

  // ── The Cup odds ──
  const odds = titleOdds(bracket, view, cup.id)

  // ── Pickers and the leaderboard ──
  const liveTeams = new Set(cup.seeds.map((s) => s.manager_id))
  const teamByProfile = new Map<string, string>()
  for (const m of managers ?? []) {
    if (m.profile_id && liveTeams.has(m.id as string)) teamByProfile.set(m.profile_id as string, m.id as string)
  }
  // Only the managers in the Cup pick, not every alumnus on the books.
  const pickers: CupPicker[] = (profiles ?? [])
    .filter((p) => !p.is_hidden && teamByProfile.has(p.id as string))
    .map((p) => ({ profileId: p.id as string, name: p.canonical_name as string, teamId: teamByProfile.get(p.id as string) ?? null }))
    .sort((x, y) => x.name.localeCompare(y.name))

  const points = roundPoints(bracket.rounds.length)
  const championLockAt = src.lockAtOf(cup.start_week)
  // With no calendar to lock on, it closes once round one has a result.
  const championOpen = championLockAt == null ? !bracket.rounds[0]?.matches.some((m) => m.state === 'final') : now < Date.parse(championLockAt)
  const matchAt = new Map<string, CupMatch>()
  for (const r of bracket.rounds) for (const m of r.matches) matchAt.set(`${r.round}:${m.slot}`, m)
  // Knocked out so far: a champion pick on one of these can't come good.
  const beaten = new Set<string>()
  for (const r of bracket.rounds) {
    for (const m of r.matches) {
      if (m.state !== 'final' || !m.winner) continue
      const l = m[m.winner === 'a' ? 'b' : 'a']
      if (l.kind === 'team') beaten.add(l.entrant.managerId)
    }
  }
  const board = new Map<string, CupBoardRow>()
  const rowFor = (profileId: string) => {
    let row = board.get(profileId)
    if (!row) {
      row = { profileId, name: profileName.get(profileId) ?? 'Unknown', points: 0, correct: 0, decided: 0, champion: null, championRight: null }
      board.set(profileId, row)
    }
    return row
  }
  for (const p of pickRows) {
    const row = rowFor(p.profileId)
    if (p.round === -1) {
      // Hidden from the board until it can't be changed.
      if (!championOpen) row.champion = nameOfManager(p.picked)
      if (bracket.champion) {
        row.championRight = bracket.champion.managerId === p.picked
        if (row.championRight) row.points += CHAMPION_BONUS
      } else if (beaten.has(p.picked)) row.championRight = false
      continue
    }
    const m = matchAt.get(`${p.round}:${p.slot}`)
    if (!m || m.state !== 'final' || !m.winner) continue
    const winner = m[m.winner]
    row.decided++
    if (winner.kind === 'team' && winner.entrant.managerId === p.picked) {
      row.correct++
      row.points += points[p.round] ?? 1
    }
  }

  return {
    details,
    odds,
    pickers,
    picks: pickRows,
    board: [...board.values()].sort((x, y) => y.points - x.points || y.correct - x.correct || x.name.localeCompare(y.name)),
    points,
    championBonus: CHAMPION_BONUS,
    championLockAt,
    championOpen,
    hasPickTable,
  }
}

// Play the rest of the bracket out: finished games keep their real winner,
// everything else is drawn from the teams' current scoring rates. Seeded by
// the Cup and the scores so far, so a reload never moves the numbers.
function titleOdds(bracket: CupBracket, view: CupView, cupId: string): CupOdds[] {
  const scores = new Map<string, number[]>()
  for (const g of view.games) {
    if (!view.weekFinal(g.week)) continue
    for (const [id, s] of [
      [g.a, g.sa],
      [g.b, g.sb],
    ] as const) {
      if (s != null && s > 0) scores.set(id, [...(scores.get(id) ?? []), s])
    }
  }
  const { rate, gameSd } = ratings(scores)
  const seeds = view.cup.seeds
  const bySeed = new Map(seeds.map((s) => [s.seed, s.manager_id]))
  const seedOf = new Map(seeds.map((s) => [s.manager_id, s.seed]))
  const order = seedOrder(bracket.size).map((s) => bySeed.get(s) ?? null)
  const rounds = bracket.rounds.length
  const matchAt = new Map<string, CupMatch>()
  for (const r of bracket.rounds) for (const m of r.matches) matchAt.set(`${r.round}:${m.slot}`, m)

  const reach = new Map(seeds.map((s) => [s.manager_id, new Array<number>(rounds).fill(0)]))
  const RUNS = 20000
  const rand = mulberry32(hash(`${cupId}|${[...scores.values()].flat().length}|${[...scores.values()].flat().reduce((s, v) => s + v, 0).toFixed(2)}`))
  const strength = new Map<string, number>()
  for (let run = 0; run < RUNS; run++) {
    for (const s of seeds) {
      const r = rate.get(s.manager_id) ?? { mu: 100, sd: 10 }
      strength.set(s.manager_id, gauss(rand, r.mu, r.sd))
    }
    let nodes = order
    for (let r = 0; r < rounds; r++) {
      const next: (string | null)[] = []
      for (let i = 0; i < nodes.length; i += 2) {
        const a = nodes[i]
        const b = nodes[i + 1]
        if (!a || !b) {
          next.push(a ?? b ?? null)
          continue
        }
        const m = matchAt.get(`${r}:${i / 2}`)
        let won: string
        if (m && m.state === 'final' && m.winner) {
          const w = m[m.winner]
          won = w.kind === 'team' ? w.entrant.managerId : a
        } else {
          const sa = gauss(rand, strength.get(a)!, gameSd)
          const sb = gauss(rand, strength.get(b)!, gameSd)
          won = sa > sb ? a : sb > sa ? b : (seedOf.get(a) ?? 99) < (seedOf.get(b) ?? 99) ? a : b
        }
        next.push(won)
      }
      for (const id of next) if (id) reach.get(id)![r]++
      nodes = next
    }
  }

  // Who knocked each team out, from the finished games.
  const outOf = new Map<string, CupOdds['out']>()
  for (const r of bracket.rounds) {
    for (const m of r.matches) {
      if (m.state !== 'final' || !m.winner || m.a.kind !== 'team' || m.b.kind !== 'team') continue
      const w = m[m.winner] as Extract<typeof m.a, { kind: 'team' }>
      const l = (m.winner === 'a' ? m.b : m.a) as Extract<typeof m.a, { kind: 'team' }>
      outOf.set(l.entrant.managerId, { round: r.name, to: w.entrant.name, mine: l.score ?? 0, theirs: w.score ?? 0 })
    }
  }

  const nameOf = new Map<string, string>()
  for (const r of bracket.rounds) {
    for (const m of r.matches) for (const s of [m.a, m.b]) if (s.kind === 'team') nameOf.set(s.entrant.managerId, s.entrant.name)
    for (const e of r.byes) nameOf.set(e.managerId, e.name)
  }
  return seeds
    .map((s) => {
      const counts = reach.get(s.manager_id)!
      // 100 and 0 only when certain (every run, or none): a team with a bye
      // is in round two, so it reads 100%, not ">99%". Near-certain caps at
      // 99.9 (and near-impossible floors at 0.1) so the page can tell them
      // apart.
      const pct = (c: number) => (c === RUNS ? 100 : c === 0 ? 0 : Math.min(99.9, Math.max(0.1, Math.round((c / RUNS) * 1000) / 10)))
      const out = outOf.get(s.manager_id) ?? null
      return {
        managerId: s.manager_id,
        name: nameOf.get(s.manager_id) ?? 'Unknown',
        seed: s.seed,
        alive: !out,
        // counts[r] = advanced past round r. Reaching round r+1 = counts[r].
        reach: counts.slice(0, rounds - 1).map(pct),
        win: bracket.champion ? (bracket.champion.managerId === s.manager_id ? 100 : 0) : pct(counts[rounds - 1] ?? 0),
        out,
      }
    })
    .sort((x, y) => Number(y.alive) - Number(x.alive) || y.win - x.win || x.seed - y.seed)
}
