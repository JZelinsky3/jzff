// The Daily's rule: one twist a day, the same for everyone.
//
// Import-free apart from the rules, like ./rules.ts, because both sides need
// it: the browser prints the rule and marks the cards it can see it touching,
// and the server scores the lineup with it. The whole list runs before any
// rule repeats.

import {
  SLOT_COUNT,
  chemistryFor,
  type BlindFace,
  type ChemBond,
  type Chemistry,
  type Player,
} from './rules'

const DIVISIONS: Record<string, string[]> = {
  'AFC East': ['Buffalo Bills', 'Miami Dolphins', 'New England Patriots', 'New York Jets'],
  'AFC North': ['Baltimore Ravens', 'Cincinnati Bengals', 'Cleveland Browns', 'Pittsburgh Steelers'],
  'AFC South': ['Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars', 'Tennessee Titans'],
  'AFC West': ['Denver Broncos', 'Kansas City Chiefs', 'Las Vegas Raiders', 'Los Angeles Chargers'],
  'NFC East': ['Dallas Cowboys', 'New York Giants', 'Philadelphia Eagles', 'Washington Commanders'],
  'NFC North': ['Chicago Bears', 'Detroit Lions', 'Green Bay Packers', 'Minnesota Vikings'],
  'NFC South': ['Atlanta Falcons', 'Carolina Panthers', 'New Orleans Saints', 'Tampa Bay Buccaneers'],
  'NFC West': ['Arizona Cardinals', 'Los Angeles Rams', 'San Francisco 49ers', 'Seattle Seahawks'],
}

function inConference(conf: 'AFC' | 'NFC', team: string): boolean {
  return Object.entries(DIVISIONS).some(([div, teams]) => div.startsWith(conf) && teams.includes(team))
}

export type DayRule = {
  id: string
  title: string
  line: string
  /** Eleven wild packs and no captain pack. */
  noCaptain?: boolean
  /** Multiplies one card. Every rule that touches single cards goes through
      this, so the recap can show what each one counted for. */
  mult?: (p: Pick<Player, 'team' | 'year' | 'pos' | 'rarity'>) => number
  /** What on a card's face shows the rule applies: a rule keyed on something a
      blind card hides (its rarity, a Ball Knower's team) marks nothing. */
  hint?: 'team' | 'year' | 'pos'
  /** The most any one card can count for. */
  cap?: number
  captainMult?: number
  /** The lowest card in the lineup counts this many times over. */
  weakest?: number
  chemScale?: number
  rivalsClick?: boolean
  /** Added for every pair in the lineup from the same season. */
  seasonPair?: number
}

const divisionRules: DayRule[] = Object.entries(DIVISIONS).map(([div, teams]) => ({
  id: div.toLowerCase().replace(' ', '-'),
  title: `${div} Day`,
  line: `${div} players count 1.5x.`,
  hint: 'team',
  mult: (p) => (teams.includes(p.team) ? 1.5 : 1),
}))

export const DAY_RULES: DayRule[] = [
  ...divisionRules,
  {
    id: 'afc',
    title: 'AFC Day',
    line: 'AFC players count 1.25x.',
    hint: 'team',
    mult: (p) => (inConference('AFC', p.team) ? 1.25 : 1),
  },
  {
    id: 'nfc',
    title: 'NFC Day',
    line: 'NFC players count 1.25x.',
    hint: 'team',
    mult: (p) => (inConference('NFC', p.team) ? 1.25 : 1),
  },
  {
    id: 'commons',
    title: 'Commons Count Double',
    line: 'Every common card scores double.',
    mult: (p) => (p.rarity === 'common' ? 2 : 1),
  },
  { id: 'rares', title: 'Rare Day', line: 'Every rare card counts 1.5x.', mult: (p) => (p.rarity === 'rare' ? 1.5 : 1) },
  {
    id: 'dynasties',
    title: 'Dynasty Day',
    line: 'Every dynasty card counts 1.5x.',
    mult: (p) => (p.rarity === 'dynasty' ? 1.5 : 1),
  },
  { id: 'cap', title: 'Salary Cap', line: 'No card counts for more than 3,000.', cap: 3000 },
  {
    id: 'throwback',
    title: 'Throwback Day',
    line: 'Seasons before 2010 count 1.5x.',
    hint: 'year',
    mult: (p) => ((p.year ?? 9999) < 2010 ? 1.5 : 1),
  },
  {
    id: 'twenty-tens',
    title: 'The 2010s',
    line: 'Seasons from 2010 to 2019 count 1.5x.',
    hint: 'year',
    mult: (p) => ((p.year ?? 0) >= 2010 && (p.year ?? 0) <= 2019 ? 1.5 : 1),
  },
  {
    id: 'twenty-twenties',
    title: 'The 2020s',
    line: 'Seasons from 2020 on count 1.5x.',
    hint: 'year',
    mult: (p) => ((p.year ?? 0) >= 2020 ? 1.5 : 1),
  },
  {
    id: 'even-years',
    title: 'Even Years',
    line: 'Seasons in even years count 1.5x.',
    hint: 'year',
    mult: (p) => (p.year != null && p.year % 2 === 0 ? 1.5 : 1),
  },
  {
    id: 'odd-years',
    title: 'Odd Years',
    line: 'Seasons in odd years count 1.5x.',
    hint: 'year',
    mult: (p) => (p.year != null && p.year % 2 === 1 ? 1.5 : 1),
  },
  {
    id: 'trenches',
    title: 'Trench Day',
    line: 'Offensive linemen count double.',
    hint: 'pos',
    mult: (p) => (p.pos === 'OT' || p.pos === 'OG' || p.pos === 'C' ? 2 : 1),
  },
  { id: 'tight-ends', title: 'Tight End Day', line: 'Tight ends count triple.', hint: 'pos', mult: (p) => (p.pos === 'TE' ? 3 : 1) },
  { id: 'ground', title: 'Ground Game', line: 'Running backs count triple.', hint: 'pos', mult: (p) => (p.pos === 'RB' ? 3 : 1) },
  { id: 'air-raid', title: 'Air Raid', line: 'Wide receivers count double.', hint: 'pos', mult: (p) => (p.pos === 'WR' ? 2 : 1) },
  { id: 'quarterbacks', title: 'Quarterback Day', line: 'Quarterbacks count triple.', hint: 'pos', mult: (p) => (p.pos === 'QB' ? 3 : 1) },
  { id: 'double-chem', title: 'Double Chemistry', line: 'All chemistry counts double, good and bad.', chemScale: 2 },
  { id: 'no-chem', title: 'No Chemistry', line: 'Chemistry counts for nothing today.', chemScale: 0 },
  { id: 'rivals', title: 'Rivals Click', line: 'Rival pairs add points today instead of costing them.', rivalsClick: true },
  { id: 'same-season', title: 'Same Season', line: 'Every pair of men from the same season adds 200.', seasonPair: 200 },
  { id: 'no-captain', title: 'No Captain', line: 'No captain today: eleven wild packs.', noCaptain: true },
  { id: 'captain', title: 'Captain Counts Double', line: "Your captain's card counts double.", captainMult: 2 },
  { id: 'weakest', title: 'Weakest Link', line: 'Your lowest card counts triple.', weakest: 3 },
]

/** A fixed shuffle of the list, so a rule comes back exactly once every
    DAY_RULES.length days and two like it never land side by side by accident. */
const RULE_ORDER: DayRule[] = (() => {
  const order = [...DAY_RULES]
  let state = 20261030
  for (let i = order.length - 1; i > 0; i--) {
    state = (Math.imul(state, 48271) >>> 0) % 2147483647
    const j = state % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
})()

/** The rule on a 'YYYY-MM-DD'. Runs off the date alone, nothing secret. */
export function ruleForDay(day: string): DayRule {
  const n = Math.round(Date.parse(`${day}T00:00:00Z`) / 86400000)
  return RULE_ORDER[((n % RULE_ORDER.length) + RULE_ORDER.length) % RULE_ORDER.length]
}

/** What the browser gets: everything but the functions. */
export type DayRuleView = { id: string; title: string; line: string; noCaptain: boolean }

export function ruleView(rule: DayRule): DayRuleView {
  return { id: rule.id, title: rule.title, line: rule.line, noCaptain: !!rule.noCaptain }
}

/** "1.5x" on a card in the pack, when its face shows the rule touches it. */
export function ruleChip(ruleId: string, card: Pick<Player, 'team' | 'year' | 'pos' | 'rarity'> & { blind?: BlindFace }): string | null {
  const rule = DAY_RULES.find((r) => r.id === ruleId)
  if (!rule?.mult || !rule.hint) return null
  if (rule.hint === 'team' && !card.team) return null
  const m = rule.mult(card)
  return m === 1 ? null : `${m}x`
}

export type DailyScore = {
  /** What each slot counted for, after the rule. */
  counted: number[]
  /** The face value of the cards. */
  cards: number
  /** What the rule added to the cards, or took off them. */
  ruleDelta: number
  chem: Chemistry
  total: number
}

type ChemCard = Pick<Player, 'id' | 'name' | 'pos' | 'team' | 'year'>

/** A lineup's chemistry once the rule has had its say. */
export function dayChemistry(lineup: ChemCard[], rule: DayRule): Chemistry {
  const scale = rule.chemScale ?? 1
  if (scale === 0) return { bonds: [], synergy: 0, rivalry: 0, total: 0 }
  const bonds: ChemBond[] = chemistryFor(lineup, true).bonds.map((b) => {
    const flip = b.type === 'rivalry' && rule.rivalsClick
    return { ...b, type: flip ? 'synergy' : b.type, points: (flip ? -b.points : b.points) * scale }
  })
  if (rule.seasonPair != null) {
    for (let i = 0; i < lineup.length; i++) {
      for (let j = i + 1; j < lineup.length; j++) {
        const [x, y] = [lineup[i], lineup[j]]
        if (x.year == null || x.year !== y.year) continue
        bonds.push({
          a: x.id,
          b: y.id,
          aName: x.name,
          bName: y.name,
          type: 'synergy',
          points: rule.seasonPair,
          reason: `Both from ${x.year}`,
        })
      }
    }
  }
  const synergy = bonds.filter((b) => b.type === 'synergy').reduce((s, b) => s + b.points, 0)
  const rivalry = bonds.filter((b) => b.type === 'rivalry').reduce((s, b) => s + b.points, 0)
  return { bonds, synergy, rivalry, total: synergy + rivalry }
}

/** The running total and the chip on a card, by rule id: what the browser has
    to hand, since a rule's functions don't cross the wire. */
export function dayChemTotal(ruleId: string, lineup: ChemCard[]): number {
  const rule = DAY_RULES.find((r) => r.id === ruleId)
  return rule ? dayChemistry(lineup, rule).total : 0
}

export function dayChemPreview(ruleId: string, card: ChemCard, lineup: ChemCard[]): number {
  return dayChemTotal(ruleId, [...lineup, card]) - dayChemTotal(ruleId, lineup)
}

export function scoreLineup(lineup: Player[], captain: number | null, rule: DayRule): DailyScore {
  const counted = lineup.map((p) => Math.round(p.score * (rule.mult?.(p) ?? 1)))
  if (rule.cap != null) counted.forEach((v, i) => (counted[i] = Math.min(v, rule.cap as number)))
  if (rule.weakest != null && counted.length === SLOT_COUNT) {
    const low = counted.indexOf(Math.min(...counted))
    counted[low] *= rule.weakest
  }
  if (rule.captainMult != null && captain != null) counted[captain] *= rule.captainMult

  const chem = dayChemistry(lineup, rule)

  const cards = lineup.reduce((s, p) => s + p.score, 0)
  const sum = counted.reduce((s, v) => s + v, 0)
  return { counted, cards, ruleDelta: sum - cards, chem, total: sum + chem.total }
}
