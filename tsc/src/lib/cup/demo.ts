// The demo league's Cup: /leagues/demo/cup/ for people who haven't signed
// up, so the Cup can be tried before a league of theirs has one. The same
// page, bracket, odds, stamps and Hall as every league's, built from
// demo-cup.json (scripts/build-demo-cup.mjs) instead of the database. There
// is no `demo` row in leagues; every caller checks isDemoCup first.
//
// The Lakeside League has played the Cup since 2021 and is frozen in week 8
// of 2026, the same week the demo's live pages show: round one and the
// quarterfinals are in, the semifinals are this week with picks open, and
// the final is next. Picks made on the demo stay in the visitor's browser.
//
// The rest of the league's bracket challenge is dealt from a seed, so it
// always fits the brackets built here and never moves between loads.

import { resolveWeekLockAt } from '@/lib/liveSeason'
import { week1TuesdayUtc } from '@/lib/nflClock'
import { ratingSeeds, type CupBracket, type CupMatch } from './bracket'
import { CHAMPION_BONUS, computeCupExtras, roundPoints, type CupExtras, type CupHistoryGame } from './extras'
import type { LeagueCups } from './history'
import { buildCupView, type CupRow, type CupSeasonGame, type CupView } from './load'
import { buildCupPreview, type CupPreview } from './preview'
import { cupStamps, type StampPick } from './stamps'
import data from './demo-cup.json'

export const DEMO_CUP_SLUG = 'demo'

export const DEMO_CUP_LEAGUE = {
  id: 'demo',
  name: 'The Lakeside League',
  slug: DEMO_CUP_SLUG,
  owner_id: null,
  published_at: '2026-01-01T00:00:00Z',
}

// Where "View the league" goes: the demo almanac (phones bounce to /demo-m/).
export const DEMO_ALMANAC = '/demo/'

export function isDemoCup(slug: string): boolean {
  return slug === DEMO_CUP_SLUG
}

const CUP_NAME = 'The League Cup'
const START_WEEK = 6
const SEEDED_THROUGH = 5
const LIVE_YEAR = 2026

type Person = { id: string; name: string; current: boolean; profileId: string; teams: Record<string, string> }
type Game = [number, string, string, number | null, number | null, number]

const people = data.people as Person[]
const personById = new Map(people.map((p) => [p.id, p]))
const seasons = data.seasons as { year: number; games: Game[] }[]
const champions = data.champions as Record<string, string>

const seasonId = (year: number) => `demo-${year}`

function gamesOf(year: number): CupSeasonGame[] {
  return (seasons.find((s) => s.year === year)?.games ?? []).map(([week, a, b, sa, sb]) => ({ week, a, b, sa, sb }))
}

// The demo's clock. Week 8 always locks at the coming Thursday kickoff, so
// the semifinal picks are open whenever someone visits; earlier weeks are
// past. Past seasons run on their own NFL calendar.
function settingsFor(year: number, now: number): Record<string, unknown> {
  if (year !== LIVE_YEAR) return { season_start_date: new Date(week1TuesdayUtc(year)).toISOString().slice(0, 10) }
  const day = 24 * 60 * 60 * 1000
  const today = new Date(now)
  const tuesday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - ((today.getUTCDay() - 2 + 7) % 7) * day
  const startFrom = (t: number) => ({ season_start_date: new Date(t - (data.currentWeek - 1) * 7 * day).toISOString().slice(0, 10) })
  const thisWeek = startFrom(tuesday)
  const lock = resolveWeekLockAt(thisWeek, data.currentWeek)
  return lock && Date.parse(lock) > now ? thisWeek : startFrom(tuesday + 7 * day)
}

function cupRow(year: number): CupRow {
  const counted = gamesOf(year)
    .filter((g) => g.week <= SEEDED_THROUGH && g.sa != null && g.sb != null)
    .map((g) => ({ week: g.week, a: g.a, b: g.b, sa: g.sa!, sb: g.sb! }))
  return {
    id: `demo-cup-${year}`,
    league_id: DEMO_CUP_LEAGUE.id,
    season_year: year,
    name: CUP_NAME,
    start_week: START_WEEK,
    seeded_through: SEEDED_THROUGH,
    seeds: ratingSeeds(counted),
  }
}

function viewOf(year: number, now: number): CupView {
  return buildCupView({
    cup: cupRow(year),
    season: { id: seasonId(year), settings: settingsFor(year, now) },
    // Past seasons are over (every round settled); 2026 is frozen in week 8.
    currentWeek: year === LIVE_YEAR ? data.currentWeek : null,
    nameOf: (id) => ({ name: personById.get(id)?.name ?? 'Unknown', team: personById.get(id)?.teams[String(year)] ?? null }),
    games: gamesOf(year),
  })
}

// ── The league's bracket challenge, dealt ──

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
const roll = (key: string) => {
  // One draw of mulberry32 from the key's hash.
  let t = (hash(key) + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function team(m: CupMatch, side: 'a' | 'b') {
  const s = m[side]
  return s.kind === 'team' ? s.entrant : null
}

// Everyone in the Cup picks most games; the round on the table now is only
// half in, so the page has a "Still to pick" list. Your own team gets your
// vote nine times in ten; otherwise the better seed, more often than not.
function dealPicks(bracket: CupBracket, cupId: string, live: boolean): StampPick[] {
  const out: StampPick[] = []
  const pickers = bracket.rounds[0]
    ? [...bracket.rounds[0].matches.flatMap((m) => [team(m, 'a'), team(m, 'b')]), ...bracket.rounds[0].byes]
        .filter((e): e is NonNullable<typeof e> => !!e)
        .map((e) => ({ profileId: personById.get(e.managerId)?.profileId ?? e.managerId, teamId: e.managerId }))
    : []
  const entrants = [...pickers].map((p) => p.teamId)
  const seedOf = new Map<string, number>()
  for (const r of bracket.rounds) {
    for (const m of r.matches) for (const e of [team(m, 'a'), team(m, 'b')]) if (e) seedOf.set(e.managerId, e.seed)
    for (const e of r.byes) seedOf.set(e.managerId, e.seed)
  }
  for (const p of pickers) {
    // The champion pick, before round one: weighted to the top seeds.
    if (roll(`${cupId}|${p.profileId}|in`) < 0.92) {
      const own = roll(`${cupId}|${p.profileId}|own`) < 0.22
      let picked = p.teamId
      if (!own) {
        const weights = entrants.map((id) => 1 / Math.pow(seedOf.get(id) ?? 12, 1.1))
        let x = roll(`${cupId}|${p.profileId}|champ`) * weights.reduce((s, w) => s + w, 0)
        picked = entrants[weights.findIndex((w) => (x -= w) <= 0)] ?? entrants[0]!
      }
      out.push({ profileId: p.profileId, round: -1, slot: 0, picked })
    }
    for (const r of bracket.rounds) {
      for (const m of r.matches) {
        const a = team(m, 'a')
        const b = team(m, 'b')
        if (!a || !b || m.state === 'upcoming') continue
        const share = live && m.state !== 'final' ? 0.58 : 0.88
        const key = `${cupId}|${p.profileId}|${r.round}|${m.slot}`
        if (roll(`${key}|in`) > share) continue
        let picked: string
        if (p.teamId === a.managerId || p.teamId === b.managerId) picked = roll(`${key}|loyal`) < 0.9 ? p.teamId : p.teamId === a.managerId ? b.managerId : a.managerId
        else {
          const lean = Math.min(0.82, Math.max(0.24, 0.5 + 0.055 * (b.seed - a.seed)))
          picked = roll(`${key}|side`) < lean ? a.managerId : b.managerId
        }
        out.push({ profileId: p.profileId, round: r.round, slot: m.slot, picked })
      }
    }
  }
  return out
}

// ── What the pages read ──

export function demoCupYears(): number[] {
  return [...data.cupYears]
}

// The newest Cup, or `year`'s. Null for a year the demo has no Cup in.
export function demoCupView(year?: number | null, now: number = Date.now()): CupView | null {
  const y = year ?? LIVE_YEAR
  return data.cupYears.includes(y) ? viewOf(y, now) : null
}

function picksFor(view: CupView): StampPick[] {
  return dealPicks(view.bracket, view.cup.id, view.cup.season_year === LIVE_YEAR)
}

const history: CupHistoryGame[] = seasons.flatMap((s) =>
  s.games.map(([week, a, b, sa, sb, playoff]) => ({
    season_id: seasonId(s.year),
    week,
    manager_a_id: a,
    manager_b_id: b,
    score_a: sa,
    score_b: sb,
    is_playoff: !!playoff,
  })),
)

export function demoCupExtras(view: CupView, now: number = Date.now()): CupExtras {
  return computeCupExtras(view, {
    seasons: seasons.map((s) => ({ id: seasonId(s.year), year: s.year })),
    managers: people.map((p) => ({ id: p.id, profile_id: p.profileId, display_name: p.name })),
    profiles: people.map((p) => ({ id: p.profileId, canonical_name: p.name, is_hidden: false })),
    picks: picksFor(view).map((p) => ({ profile_id: p.profileId, round: p.round, slot: p.slot, picked_manager_id: p.picked })),
    history,
    lockAtOf: (week) => resolveWeekLockAt(view.season.settings, week),
    now,
  })
}

// Every Cup and every stamp, the shape lib/cup/history.ts gives a real
// league. `current` is a Cup already built (the page's), reused.
export function demoLeagueCups(opts?: { current?: CupView; now?: number }): LeagueCups {
  const now = opts?.now ?? Date.now()
  const profileOf = new Map(people.map((p) => [p.id, p.profileId]))
  const nameByPerson = new Map(people.flatMap((p) => [[p.profileId, p.name] as const, [p.id, p.name] as const]))
  const personOf = (managerId: string) => profileOf.get(managerId) ?? managerId
  const nameOf = (person: string) => nameByPerson.get(person) ?? 'Unknown'
  const cups = data.cupYears.map((year) => {
    const view = opts?.current && opts.current.cup.season_year === year ? opts.current : viewOf(year, now)
    return { view, picks: picksFor(view) }
  })
  const stamps = cupStamps(
    cups.map(({ view, picks }) => ({
      cup: { id: view.cup.id, year: view.cup.season_year },
      bracket: view.bracket,
      picks,
      personOf,
      nameOf,
      points: roundPoints(view.bracket.rounds.length),
      championBonus: CHAMPION_BONUS,
      leagueChampion: champions[String(view.cup.season_year)] ?? null,
    })),
  )
  return { cups, stamps, nameOf, personOf }
}

// The launch countdown page as a league sees it before its first draw: the
// 2026 table through week 7, drawn the way the real draw would be.
export function demoCupPreview(): Promise<CupPreview | null> {
  return buildCupPreview({
    games: gamesOf(LIVE_YEAR),
    // Before the draw, as every league is until October 28th.
    currentWeek: 7,
    names: () => (id) => ({ name: personById.get(id)?.name ?? 'Unknown', team: personById.get(id)?.teams[String(LIVE_YEAR)] ?? null }),
  })
}

// The demo's strip and nav row, the same shape the almanac's route hands a
// real league (__DC.cup / __DC.cupLink).
export const DEMO_CUP_HREF = `/leagues/${DEMO_CUP_SLUG}/cup/`
