// Battles: the head-to-head half of an Even Versus.
//
// On the same eleven packs two good drafters keep most of the same cards, and a
// shared penalty can't separate them: both lose the same, so the gap stays.
// Only a prize one side wins and the other doesn't changes who should take
// what. So every Even game names three categories before the first pack, one
// from each family, and whoever beats the other on one takes BATTLE_BONUS.
// A tie pays nobody. You don't need the best number, just a better one than
// theirs, which is what makes it a read on your opponent. The sim that set the
// bonus is in scripts/pack-empire-pool/sim/hard-sim.ts: at half of it ignoring
// Battles costs nothing.
//
// A family per game keeps the three from fighting each other: Oldest Lineup
// and Newest Lineup in one game would just cancel out.
//
// Every category counts on every difficulty. On Ball Knower that means knowing
// where a man played that year and what he did, which is the point of it. Each
// one has to be reachable from several packs: Most Decades, Longest Span and
// Most Rushing Yards were cut because one card or one pack settled them, and
// All-Pro linemen because any honor filled the line and First-Team was too rare
// to contest.
//
// Plain data with no runtime imports, so the browser can print the same list
// the server scores.

import type { Player } from './rules'

export const BATTLE_BONUS = 1500

type Family = 'era' | 'franchise' | 'record'

export const BATTLE_FAMILIES: Family[] = ['era', 'franchise', 'record']

export type Battle = {
  id: string
  family: Family
  title: string
  line: string
  /** Higher wins. */
  value: (lineup: Player[]) => number
  show: (value: number) => string
  /** How far this card goes toward winning it, about 0 to 1, for the CPU. */
  lean: (card: Player, roster: Player[]) => number
}

const DIVISIONS: Record<string, string> = {
  'Buffalo Bills': 'AFC East',
  'Miami Dolphins': 'AFC East',
  'New England Patriots': 'AFC East',
  'New York Jets': 'AFC East',
  'Baltimore Ravens': 'AFC North',
  'Cincinnati Bengals': 'AFC North',
  'Cleveland Browns': 'AFC North',
  'Pittsburgh Steelers': 'AFC North',
  'Houston Texans': 'AFC South',
  'Indianapolis Colts': 'AFC South',
  'Jacksonville Jaguars': 'AFC South',
  'Tennessee Titans': 'AFC South',
  'Denver Broncos': 'AFC West',
  'Kansas City Chiefs': 'AFC West',
  'Las Vegas Raiders': 'AFC West',
  'Los Angeles Chargers': 'AFC West',
  'Dallas Cowboys': 'NFC East',
  'New York Giants': 'NFC East',
  'Philadelphia Eagles': 'NFC East',
  'Washington Commanders': 'NFC East',
  'Chicago Bears': 'NFC North',
  'Detroit Lions': 'NFC North',
  'Green Bay Packers': 'NFC North',
  'Minnesota Vikings': 'NFC North',
  'Atlanta Falcons': 'NFC South',
  'Carolina Panthers': 'NFC South',
  'New Orleans Saints': 'NFC South',
  'Tampa Bay Buccaneers': 'NFC South',
  'Arizona Cardinals': 'NFC West',
  'Los Angeles Rams': 'NFC West',
  'San Francisco 49ers': 'NFC West',
  'Seattle Seahawks': 'NFC West',
}

/** Who won it all each season, by today's franchise name, which is what
    `team` holds: the 1999 Rams are the Los Angeles Rams here. */
const CHAMPIONS: Record<number, string> = {
  1970: 'Indianapolis Colts',
  1971: 'Dallas Cowboys',
  1972: 'Miami Dolphins',
  1973: 'Miami Dolphins',
  1974: 'Pittsburgh Steelers',
  1975: 'Pittsburgh Steelers',
  1976: 'Las Vegas Raiders',
  1977: 'Dallas Cowboys',
  1978: 'Pittsburgh Steelers',
  1979: 'Pittsburgh Steelers',
  1980: 'Las Vegas Raiders',
  1981: 'San Francisco 49ers',
  1982: 'Washington Commanders',
  1983: 'Las Vegas Raiders',
  1984: 'San Francisco 49ers',
  1985: 'Chicago Bears',
  1986: 'New York Giants',
  1987: 'Washington Commanders',
  1988: 'San Francisco 49ers',
  1989: 'San Francisco 49ers',
  1990: 'New York Giants',
  1991: 'Washington Commanders',
  1992: 'Dallas Cowboys',
  1993: 'Dallas Cowboys',
  1994: 'San Francisco 49ers',
  1995: 'Dallas Cowboys',
  1996: 'Green Bay Packers',
  1997: 'Denver Broncos',
  1998: 'Denver Broncos',
  1999: 'Los Angeles Rams',
  2000: 'Baltimore Ravens',
  2001: 'New England Patriots',
  2002: 'Tampa Bay Buccaneers',
  2003: 'New England Patriots',
  2004: 'New England Patriots',
  2005: 'Pittsburgh Steelers',
  2006: 'Indianapolis Colts',
  2007: 'New York Giants',
  2008: 'Pittsburgh Steelers',
  2009: 'New Orleans Saints',
  2010: 'Green Bay Packers',
  2011: 'New York Giants',
  2012: 'Baltimore Ravens',
  2013: 'Seattle Seahawks',
  2014: 'New England Patriots',
  2015: 'Denver Broncos',
  2016: 'New England Patriots',
  2017: 'Philadelphia Eagles',
  2018: 'New England Patriots',
  2019: 'Kansas City Chiefs',
  2020: 'Tampa Bay Buccaneers',
  2021: 'Los Angeles Rams',
  2022: 'Kansas City Chiefs',
  2023: 'Kansas City Chiefs',
  2024: 'Philadelphia Eagles',
  2025: 'Seattle Seahawks',
}

const yearOf = (c: Player) => c.year ?? 2000
const teamOf = (c: Player) => c.team ?? ''
const divisionOf = (c: Player) => DIVISIONS[teamOf(c)] ?? ''
const sum = (l: Player[], f: (c: Player) => number) => l.reduce((n, c) => n + f(c), 0)
const count = (l: Player[], f: (c: Player) => boolean) => l.filter(f).length
const distinct = (l: Player[], f: (c: Player) => string | number) => new Set(l.map(f)).size
const average = (l: Player[]) => (l.length ? sum(l, yearOf) / l.length : 0)
const spread = (l: Player[]) => (l.length ? Math.max(...l.map(yearOf)) - Math.min(...l.map(yearOf)) : 0)
const clamp = (n: number) => Math.max(0, Math.min(1, n))

/** The biggest group in a lineup, by whatever groups it. */
function stacked(l: Player[], f: (c: Player) => string): number {
  const groups = new Map<string, number>()
  for (const c of l) groups.set(f(c), (groups.get(f(c)) ?? 0) + 1)
  return Math.max(0, ...groups.values())
}

/** A number off a skill player's stat line. A lineman's first line is honors,
    and his team's totals sit on the second, so none of these reach him. */
function stat(c: Player, label: RegExp): number {
  const m = (c.accolades[0] ?? '').match(label)
  return m ? Number(m[1].replace(/,/g, '')) : 0
}

const touchdowns = (c: Player) => stat(c, /([\d,]+) TD\b/)
const catches = (c: Player) => stat(c, /([\d,]+) rec\b/)
/** A quarterback's line prints his passing the same way, so receivers only. */
const receiving = (c: Player) => (c.pos === 'WR' || c.pos === 'TE' ? stat(c, /([\d,]+) yds\b/) : 0)
const champion = (c: Player) => CHAMPIONS[yearOf(c)] === teamOf(c)

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`
const counted = (one: string, many?: string) => (v: number) => plural(v, one, many)

export const BATTLES: Battle[] = [
  // ── Era ────────────────────────────────────────────────────
  {
    id: 'oldest',
    family: 'era',
    title: 'Oldest Lineup',
    line: 'Earliest average season.',
    value: (l) => -average(l),
    show: (v) => (-v).toFixed(1),
    lean: (c) => clamp((2026 - yearOf(c)) / 30),
  },
  {
    id: 'newest',
    family: 'era',
    title: 'Newest Lineup',
    line: 'Latest average season.',
    value: average,
    show: (v) => v.toFixed(1),
    lean: (c) => clamp((yearOf(c) - 1996) / 30),
  },
  {
    id: 'same-era',
    family: 'era',
    title: 'Same Era',
    line: 'Fewest years from your oldest season to your newest.',
    value: (l) => -spread(l),
    show: (v) => plural(-v, 'year'),
    lean: (c, r) => (r.length ? clamp(1 - Math.abs(yearOf(c) - average(r)) / 12) : 0),
  },
  {
    id: 'the-2020s',
    family: 'era',
    title: 'Most 2020s',
    line: 'Cards from 2020 on.',
    value: (l) => count(l, (c) => yearOf(c) >= 2020),
    show: counted('card'),
    lean: (c) => (yearOf(c) >= 2020 ? 1 : 0),
  },
  {
    id: 'throwback',
    family: 'era',
    title: 'Most Throwbacks',
    line: 'Cards from before 2010.',
    value: (l) => count(l, (c) => yearOf(c) < 2010),
    show: counted('card'),
    lean: (c) => (yearOf(c) < 2010 ? 1 : 0),
  },

  // ── Franchise ──────────────────────────────────────────────
  {
    id: 'most-franchises',
    family: 'franchise',
    title: 'Most Franchises',
    line: 'Different teams in your lineup.',
    value: (l) => distinct(l, teamOf),
    show: counted('team'),
    lean: (c, r) => (r.some((x) => teamOf(x) === teamOf(c)) ? 0 : 1),
  },
  {
    id: 'fewest-franchises',
    family: 'franchise',
    title: 'Fewest Franchises',
    line: 'The fewest different teams in your lineup.',
    value: (l) => -distinct(l, teamOf),
    show: (v) => plural(-v, 'team'),
    lean: (c, r) => (r.some((x) => teamOf(x) === teamOf(c)) ? 1 : 0),
  },
  {
    id: 'afc',
    family: 'franchise',
    title: 'Most AFC',
    line: 'Cards from AFC teams, by where the franchise sits today.',
    value: (l) => count(l, (c) => divisionOf(c).startsWith('AFC')),
    show: counted('card'),
    lean: (c) => (divisionOf(c).startsWith('AFC') ? 1 : 0),
  },
  {
    id: 'nfc',
    family: 'franchise',
    title: 'Most NFC',
    line: 'Cards from NFC teams, by where the franchise sits today.',
    value: (l) => count(l, (c) => divisionOf(c).startsWith('NFC')),
    show: counted('card'),
    lean: (c) => (divisionOf(c).startsWith('NFC') ? 1 : 0),
  },
  {
    id: 'division-stack',
    family: 'franchise',
    title: 'Division Stack',
    line: 'Most cards from any one division.',
    value: (l) => stacked(l, divisionOf),
    show: counted('card'),
    lean: (c, r) => clamp(count(r, (x) => divisionOf(x) === divisionOf(c)) / 2),
  },
  {
    id: 'all-divisions',
    family: 'franchise',
    title: 'Around The League',
    line: 'Most of the eight divisions covered.',
    value: (l) => distinct(l, divisionOf),
    show: counted('division'),
    lean: (c, r) => (r.some((x) => divisionOf(x) === divisionOf(c)) ? 0 : 1),
  },

  // ── The record ─────────────────────────────────────────────
  {
    id: 'touchdowns',
    family: 'record',
    title: 'Most Touchdowns',
    line: 'Every touchdown on your cards.',
    value: (l) => sum(l, touchdowns),
    show: counted('TD', 'TDs'),
    lean: (c) => clamp(touchdowns(c) / 25),
  },
  {
    id: 'receiving',
    family: 'record',
    title: 'Most Receiving Yards',
    line: 'Every receiving yard on your cards.',
    value: (l) => sum(l, receiving),
    show: counted('yard'),
    lean: (c) => clamp(receiving(c) / 1500),
  },
  {
    id: 'catches',
    family: 'record',
    title: 'Most Catches',
    line: 'Every catch on your cards.',
    value: (l) => sum(l, catches),
    show: counted('catch', 'catches'),
    lean: (c) => clamp(catches(c) / 100),
  },
  {
    id: 'rings',
    family: 'record',
    title: 'Most Rings',
    line: 'Cards from the team that won the Super Bowl that season.',
    value: (l) => count(l, champion),
    show: counted('ring'),
    lean: (c) => (champion(c) ? 1 : 0),
  },
]

const BY_ID = new Map(BATTLES.map((b) => [b.id, b]))

export function battlesFrom(ids: string[] | null | undefined): Battle[] {
  return (ids ?? []).flatMap((id) => BY_ID.get(id) ?? [])
}

/** One from each family. `pick(n)` is a whole number under n. */
export function drawBattles(pick: (n: number) => number): string[] {
  return BATTLE_FAMILIES.map((family) => {
    const list = BATTLES.filter((b) => b.family === family)
    return list[pick(list.length)].id
  })
}

export type BattleLine = {
  id: string
  title: string
  host: string
  guest: string
  winner: 'host' | 'guest' | null
}

export type BattleOutcome = { lines: BattleLine[]; host: number; guest: number }

/** Who took what. Both lineups go in, so it runs once both are locked. */
export function settleBattles(ids: string[], host: Player[], guest: Player[]): BattleOutcome {
  const lines = battlesFrom(ids).map((b): BattleLine => {
    const h = b.value(host)
    const g = b.value(guest)
    return {
      id: b.id,
      title: b.title,
      host: b.show(h),
      guest: b.show(g),
      winner: h === g ? null : h > g ? 'host' : 'guest',
    }
  })
  const won = (seat: 'host' | 'guest') => lines.filter((l) => l.winner === seat).length * BATTLE_BONUS
  return { lines, host: won('host'), guest: won('guest') }
}
