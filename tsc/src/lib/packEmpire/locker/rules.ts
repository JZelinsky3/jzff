// The Locker: the card collection every Locker game shares. Import-free apart from
// the game's own rules, so the browser can read it too.
//
// The binder is what you kept out of runs you can play all day. The Locker is what
// you own, from packs that come slowly, so a card here is worth something: a new
// game only has to say what it does with a card. Four things live here so that no
// game has to own them:
//
//   packs    what a pack is, as data. A new kind of pack is a row in LOCKER_PACKS,
//            which is also where priced packs with better odds would go.
//   stats    what a card costs and how strong it is, off its rarity and value.
//   events   a day where some cards count for more than their rarity says. A rule
//            on the card, so every game gets them without knowing they exist.
//   rewards  wins across every game, so a new game feeds the bonus pack by itself.

import { RARITIES, RARITY_FLOOR, type Player, type PoolKey, type Rarity } from '../rules'

// ============================================================
// Packs
// ============================================================

/** Chance per card, by rarity, in a pack off this table. Sums to 100. */
export type PackTable = Record<Rarity, number>

/**
 * A pack a day has to carry the whole collection, so this is far richer per card
 * than a run's packs, which you can open all day. With the last card held to Rare
 * or better, about 1 pack in 29 holds an Immortal or better and 1 in 280 a Canton,
 * measured over 200,000 packs: nine months of daily packs, half that for anyone
 * taking the bonus every day.
 */
export const LOCKER_TABLE: PackTable = { common: 66, rare: 24, dynasty: 7.6, transcendent: 1.9, immortal: 0.45, canton: 0.05 }

/** The same table with no commons: the last card in a pack. */
const FLOOR_TABLE: PackTable = { ...LOCKER_TABLE, common: 0 }

/** One card of a pack that's laid out by hand, rather than off a table. */
export type PackSlot = { pos: PoolKey; rarity: Rarity }

export type PackDef = {
  label: string
  line: string
  /** Art on the wrapper. */
  art: string
  /** Off a table: each card in `table`, the last `floor` cards in `floorTable`. */
  size: number
  table?: PackTable
  floor?: number
  floorTable?: PackTable
  /** Laid out by hand: one card per slot, whoever's dealt. */
  slots?: PackSlot[]
}

export type LockerPackKind = 'starter' | 'daily' | 'bonus'

const PACK_ART = '/games/pack-empire/packs/wild.webp'

/**
 * Enough to field a full deck the minute you sign up: every lane covered, a curve
 * to play on every turn, and a little under the deck cap, so the first good pull
 * has a place to go.
 */
const STARTER_SLOTS: PackSlot[] = [
  { pos: 'QB', rarity: 'dynasty' },
  { pos: 'WR', rarity: 'dynasty' },
  { pos: 'RB', rarity: 'rare' },
  { pos: 'WR', rarity: 'rare' },
  { pos: 'TE', rarity: 'rare' },
  { pos: 'OT', rarity: 'rare' },
  { pos: 'C', rarity: 'rare' },
  { pos: 'QB', rarity: 'common' },
  { pos: 'RB', rarity: 'common' },
  { pos: 'RB', rarity: 'common' },
  { pos: 'WR', rarity: 'common' },
  { pos: 'WR', rarity: 'common' },
  { pos: 'TE', rarity: 'common' },
  { pos: 'OG', rarity: 'common' },
  { pos: 'OT', rarity: 'common' },
]

export const LOCKER_PACKS: Record<LockerPackKind, PackDef> = {
  starter: { label: 'Starter Pack', line: 'Fifteen cards, enough to field a deck today.', art: PACK_ART, size: STARTER_SLOTS.length, slots: STARTER_SLOTS },
  daily: { label: 'Daily Pack', line: 'One a day, and you keep all five.', art: PACK_ART, size: 5, table: LOCKER_TABLE, floor: 1, floorTable: FLOOR_TABLE },
  bonus: { label: 'Bonus Pack', line: 'Earned by winning today.', art: PACK_ART, size: 5, table: LOCKER_TABLE, floor: 1, floorTable: FLOOR_TABLE },
}

export const isPackKind = (v: unknown): v is LockerPackKind => typeof v === 'string' && v in LOCKER_PACKS

/** Wins in a day, across every Locker game, for the bonus pack. */
export const BONUS_WINS = 5

// ============================================================
// Stats
// ============================================================

/** What a card costs to play. Rarity alone, so a game can be read at a glance. */
export const LOCKER_COST: Record<Rarity, number> = { common: 1, rare: 2, dynasty: 3, transcendent: 4, immortal: 5, canton: 6 }

/** How strong a card is, low to high across its rarity. The steps get bigger as the
    rarity climbs: a Canton costs a quarter of a deck's cap, and on a pack a day
    pulling one should feel like it. */
export const LOCKER_POWER: Record<Rarity, [number, number]> = {
  common: [2, 3],
  rare: [4, 5],
  dynasty: [6, 8],
  transcendent: [9, 11],
  immortal: [13, 15],
  canton: [19, 21],
}

/** Where the top of the scale sits, for sharing a rarity's range out. */
const VALUE_TOP = 6000

type Valued = Pick<Player, 'score' | 'rarity'>

export function lockerCost(card: Pick<Player, 'rarity'>): number {
  return LOCKER_COST[card.rarity]
}

export function lockerPower(card: Valued): number {
  const [lo, hi] = LOCKER_POWER[card.rarity]
  const floor = RARITY_FLOOR[card.rarity]
  const next = RARITY_FLOOR[RARITIES[RARITIES.indexOf(card.rarity) + 1]] ?? VALUE_TOP
  const at = Math.min(1, Math.max(0, (card.score - floor) / (next - floor)))
  return Math.round(lo + (hi - lo) * at)
}

// ============================================================
// Events
// ============================================================

export type Division =
  | 'AFC East' | 'AFC North' | 'AFC South' | 'AFC West'
  | 'NFC East' | 'NFC North' | 'NFC South' | 'NFC West'

/** By the franchise's current name, which is what a card's `team` holds. */
export const TEAM_DIVISION: Record<string, Division> = {
  'Buffalo Bills': 'AFC East', 'Miami Dolphins': 'AFC East', 'New England Patriots': 'AFC East', 'New York Jets': 'AFC East',
  'Baltimore Ravens': 'AFC North', 'Cincinnati Bengals': 'AFC North', 'Cleveland Browns': 'AFC North', 'Pittsburgh Steelers': 'AFC North',
  'Houston Texans': 'AFC South', 'Indianapolis Colts': 'AFC South', 'Jacksonville Jaguars': 'AFC South', 'Tennessee Titans': 'AFC South',
  'Denver Broncos': 'AFC West', 'Kansas City Chiefs': 'AFC West', 'Las Vegas Raiders': 'AFC West', 'Los Angeles Chargers': 'AFC West',
  'Dallas Cowboys': 'NFC East', 'New York Giants': 'NFC East', 'Philadelphia Eagles': 'NFC East', 'Washington Commanders': 'NFC East',
  'Chicago Bears': 'NFC North', 'Detroit Lions': 'NFC North', 'Green Bay Packers': 'NFC North', 'Minnesota Vikings': 'NFC North',
  'Atlanta Falcons': 'NFC South', 'Carolina Panthers': 'NFC South', 'New Orleans Saints': 'NFC South', 'Tampa Bay Buccaneers': 'NFC South',
  'Arizona Cardinals': 'NFC West', 'Los Angeles Rams': 'NFC West', 'San Francisco 49ers': 'NFC West', 'Seattle Seahawks': 'NFC West',
}

/** Which cards a rule is about. Every field given has to hold. */
export type CardMatch = {
  divisions?: Division[]
  pos?: PoolKey[]
  rarities?: Rarity[]
  /** Seasons, first and last, inclusive. */
  years?: [number, number]
}

type Matchable = Pick<Player, 'team' | 'pos' | 'rarity' | 'year'>

export function cardMatches(card: Matchable, m: CardMatch): boolean {
  if (m.divisions && !m.divisions.includes(TEAM_DIVISION[card.team])) return false
  if (m.pos && !m.pos.includes(card.pos)) return false
  if (m.rarities && !m.rarities.includes(card.rarity)) return false
  if (m.years && !(card.year != null && card.year >= m.years[0] && card.year <= m.years[1])) return false
  return true
}

/**
 * A day where a card is worth more than its rarity says. It's a rule on the card,
 * so any game reading eventPower gets it for nothing, and it's what lets a Dynasty
 * from the right division outplay a Canton from the wrong one: `times` lifts the
 * cards it's about and `others` sinks the rest.
 */
export type LockerEvent = {
  id: string
  title: string
  line: string
  match: CardMatch
  times: number
  others: number
  /** Taken off the cost of the cards it's about. */
  cheaper?: number
}

const division = (d: Division, title: string): LockerEvent => ({
  id: d.toLowerCase().replace(' ', '-'),
  title,
  line: `${d} players count double. Everyone else plays at half strength.`,
  match: { divisions: [d] },
  times: 2,
  others: 0.5,
})

export const LOCKER_EVENTS: LockerEvent[] = [
  division('NFC North', 'Black And Blue'),
  { id: 'trenches', title: 'Win The Trenches', line: 'Linemen count double and cost one less.', match: { pos: ['OT', 'OG', 'C'] }, times: 2, others: 1, cheaper: 1 },
  division('AFC East', 'Lake Effect'),
  { id: 'nineties', title: 'The Nineties', line: 'Seasons from 1990 to 1999 count double. Everyone else plays at half strength.', match: { years: [1990, 1999] }, times: 2, others: 0.5 },
  division('NFC South', 'Bayou To Bay'),
  { id: 'underdogs', title: 'Underdog Sunday', line: 'Commons and Rares count double. Everyone else plays at half strength.', match: { rarities: ['common', 'rare'] }, times: 2, others: 0.5 },
  division('AFC North', 'Rust Belt'),
  { id: 'ground-pound', title: 'Ground And Pound', line: 'Running backs count double and cost one less.', match: { pos: ['RB'] }, times: 2, others: 1, cheaper: 1 },
  division('NFC West', 'Pacific Time'),
  { id: 'air-raid', title: 'Air Raid', line: 'Quarterbacks and receivers count for half as much again.', match: { pos: ['QB', 'WR'] }, times: 1.5, others: 1 },
  division('AFC South', 'Southern Hospitality'),
  { id: 'two-thousands', title: 'The Two Thousands', line: 'Seasons from 2000 to 2009 count double. Everyone else plays at half strength.', match: { years: [2000, 2009] }, times: 2, others: 0.5 },
  division('NFC East', 'Beltway To Broadway'),
  { id: 'tight-ends', title: 'Seam Route', line: 'Tight ends count double and cost one less.', match: { pos: ['TE'] }, times: 2, others: 1, cheaper: 1 },
  division('AFC West', 'Mile High And Beyond'),
  { id: 'right-now', title: 'Right Now', line: 'Seasons from 2020 on count double. Everyone else plays at half strength.', match: { years: [2020, 2099] }, times: 2, others: 0.5 },
]

const DAY_MS = 86_400_000

/** Today's event, off the date, so everyone's on the same one. `day` is a dayKey. */
export function lockerEventForDay(day: string): LockerEvent {
  const n = Math.floor(Date.parse(`${day}T12:00:00Z`) / DAY_MS)
  return LOCKER_EVENTS[((n % LOCKER_EVENTS.length) + LOCKER_EVENTS.length) % LOCKER_EVENTS.length]
}

export function lockerEventById(id: string | null | undefined): LockerEvent | null {
  return LOCKER_EVENTS.find((e) => e.id === id) ?? null
}

/** A card's strength under an event. Never below one: a man still takes the field. */
export function eventPower(card: Valued & Matchable, event: LockerEvent | null): number {
  const base = lockerPower(card)
  if (!event) return base
  const by = cardMatches(card, event.match) ? event.times : event.others
  return Math.max(1, Math.round(base * by))
}

export function eventCost(card: Matchable, event: LockerEvent | null): number {
  const base = lockerCost(card)
  if (!event?.cheaper || !cardMatches(card, event.match)) return base
  return Math.max(1, base - event.cheaper)
}

// ============================================================
// Games
// ============================================================

/** A game on the Locker. `deck` is its rule for a deck, if it plays from one. */
export type LockerGameDef = {
  id: string
  title: string
  titleEm: string
  line: string
  href: string
  deck: { size: number; cap: number }
}

export const LOCKER_GAMES: LockerGameDef[] = [
  {
    id: 'field-general',
    title: 'Field',
    titleEm: 'General',
    line: 'Twelve cards, three lanes, six drives. Call where your men go and take two lanes of three.',
    href: '/games/pack-empire/locker/field-general/',
    deck: { size: 12, cap: 25 },
  },
]

export function lockerGame(id: string): LockerGameDef | null {
  return LOCKER_GAMES.find((g) => g.id === id) ?? null
}

/** Whether a set of cards is a legal deck for a game, and why not if it isn't. */
export function deckProblem(cards: Pick<Player, 'id' | 'pid' | 'rarity'>[], rule: LockerGameDef['deck']): string | null {
  if (cards.length !== rule.size) return `A deck is ${rule.size} cards.`
  const men = new Set(cards.map((c) => c.pid ?? c.id))
  if (men.size !== cards.length) return 'One season of a man to a deck.'
  if (cards.filter((c) => c.rarity === 'canton').length > 1) return 'One Canton to a deck.'
  const cost = cards.reduce((sum, c) => sum + lockerCost(c), 0)
  if (cost > rule.cap) return `That deck costs ${cost}, and the cap is ${rule.cap}.`
  return null
}

/** One-cost cards a built deck keeps, so there's usually a play on the first drive. */
const CHEAP_KEPT = 4

/** The best legal deck a set of cards makes: what a new deck starts from. The
    strongest men it can afford with room left for a few cheap ones, one season a
    man, then the best of those cheap ones and the best value for what's left. */
export function autoDeck<T extends Pick<Player, 'id' | 'pid' | 'rarity' | 'score'>>(owned: T[], rule: LockerGameDef['deck']): T[] {
  const out: T[] = []
  const men = new Set<string>()
  let cost = 0
  const fits = (card: T, spare: number) =>
    !men.has(card.pid ?? card.id) &&
    !(card.rarity === 'canton' && out.some((c) => c.rarity === 'canton')) &&
    cost + lockerCost(card) + spare <= rule.cap
  const take = (card: T) => {
    out.push(card)
    men.add(card.pid ?? card.id)
    cost += lockerCost(card)
  }
  const strongest = [...owned].sort((a, b) => lockerPower(b) - lockerPower(a) || b.score - a.score)
  const cheap = strongest.filter((c) => lockerCost(c) === 1).slice(0, CHEAP_KEPT)
  for (const card of strongest) {
    if (out.length >= rule.size - cheap.length) break
    if (!cheap.includes(card) && fits(card, rule.size - out.length - 1)) take(card)
  }
  for (const card of cheap) if (fits(card, rule.size - out.length - 1)) take(card)
  const value = [...owned].sort((a, b) => lockerPower(b) / lockerCost(b) - lockerPower(a) / lockerCost(a) || b.score - a.score)
  for (const card of value) {
    if (out.length >= rule.size) break
    if (fits(card, 0)) take(card)
  }
  return out
}
