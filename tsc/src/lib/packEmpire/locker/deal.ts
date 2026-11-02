// Dealing Locker packs and CPU decks. SERVER ONLY: it reads the pool.
//
// A pack is dealt once, the moment it's opened, and the cards go on its row, so
// nothing here has to replay and no pool change can move a card you already have.

import { POOL, cardWeight } from '../pool'
import { POOL_KEYS, RARITIES, personOf, type Player, type PoolKey, type Rarity, type Weights } from '../rules'
import { cardMatches, type LockerEvent, type PackDef, type PackTable } from './rules'

const ALL = POOL_KEYS.flatMap((k) => POOL[k])
const OF_RARITY = Object.fromEntries(RARITIES.map((r) => [r, ALL.filter((p) => p.rarity === r)])) as Record<Rarity, Player[]>

/** Inside the top two rarities a card is as hard to pull as the game says it is:
    the odds that open up with value. Everywhere else they're level. */
const TOP_ONLY: Weights = { common: 0, rare: 0, dynasty: 0, transcendent: 0, immortal: 1 }
const weight = (p: Player) => (p.rarity === 'immortal' || p.rarity === 'canton' ? cardWeight(p, TOP_ONLY) : 1)

/**
 * A card you already own, against one you don't, inside its rarity. The rarity is
 * rolled first and never looks at your collection, so this can't tilt what a pack
 * holds: a long-time player still pulls as many Commons as anyone, just fewer of the
 * same ones. 1 would be no lean at all. Over a year of daily packs 0.5 takes repeats
 * from 9% to 5% of cards in the first month and from 27% to 17% by month three.
 */
export const REPEAT_WEIGHT = 0.5

function pick(list: Player[], rnd: () => number, owned?: ReadonlySet<string>): Player | null {
  const worth = (p: Player) => weight(p) * (owned?.has(p.id) ? REPEAT_WEIGHT : 1)
  const total = list.reduce((s, p) => s + worth(p), 0)
  let x = rnd() * total
  for (const p of list) {
    x -= worth(p)
    if (x <= 0) return p
  }
  return list[list.length - 1] ?? null
}

function rollRarity(table: PackTable, rnd: () => number): Rarity {
  const total = RARITIES.reduce((s, r) => s + table[r], 0)
  let x = rnd() * total
  for (const r of RARITIES) {
    x -= table[r]
    if (x <= 0) return r
  }
  return 'common'
}

/** One new man off a list, or null if it's run out of them. */
function fresh(list: Player[], men: Set<string>, rnd: () => number, owned?: ReadonlySet<string>): Player | null {
  const open = list.filter((p) => !men.has(personOf(p)))
  const card = pick(open, rnd, owned)
  if (card) men.add(personOf(card))
  return card
}

/** `owned` is the ids of what's already in the collection: see REPEAT_WEIGHT. */
export function dealLockerPack(def: PackDef, rnd: () => number, owned?: ReadonlySet<string>): Player[] {
  const men = new Set<string>()
  const out: Player[] = []
  if (def.slots) {
    for (const s of def.slots) {
      const card = fresh(OF_RARITY[s.rarity].filter((p) => p.pos === s.pos), men, rnd, owned)
      if (card) out.push(card)
    }
    return out
  }
  const floor = def.floor ?? 0
  const fits = (rarity: Rarity) => (def.match ? OF_RARITY[rarity].filter((p) => cardMatches(p, def.match as PackDef['match'] & object)) : OF_RARITY[rarity])
  for (let i = 0; i < def.size; i++) {
    const table = i >= def.size - floor && def.floorTable ? def.floorTable : (def.table as PackTable)
    // A theme can run dry at the top of the table, and then the card comes off the
    // rarity under it rather than leaving a pack short.
    let at = RARITIES.indexOf(rollRarity(table, rnd))
    let card = fresh(fits(RARITIES[at]), men, rnd, owned)
    while (!card && at > 0) card = fresh(fits(RARITIES[--at]), men, rnd, owned)
    if (card) out.push(card)
  }
  return out
}

type Curve = { rarity: Rarity; pos: PoolKey[]; n: number }[]

const SKILL: PoolKey[] = ['QB', 'WR', 'RB', 'TE']
const EVERYONE: PoolKey[] = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C']
const NO_QB: PoolKey[] = ['RB', 'WR', 'TE', 'OT', 'OG', 'C']

/** The CPU's decks. Its best card is never a rarity above yours, so nobody opens a
    Starter Pack and meets an Immortal, and a Canton is always the best card out there. */
const CPU_CURVES: { upTo: Rarity; curve: Curve }[] = [
  { upTo: 'dynasty', curve: [{ rarity: 'dynasty', pos: SKILL, n: 2 }, { rarity: 'rare', pos: EVERYONE, n: 4 }, { rarity: 'common', pos: NO_QB, n: 6 }] },
  { upTo: 'transcendent', curve: [{ rarity: 'transcendent', pos: SKILL, n: 1 }, { rarity: 'dynasty', pos: SKILL, n: 2 }, { rarity: 'rare', pos: EVERYONE, n: 4 }, { rarity: 'common', pos: NO_QB, n: 5 }] },
  { upTo: 'canton', curve: [{ rarity: 'immortal', pos: SKILL, n: 1 }, { rarity: 'dynasty', pos: SKILL, n: 2 }, { rarity: 'rare', pos: EVERYONE, n: 3 }, { rarity: 'common', pos: NO_QB, n: 6 }] },
]

/** How much less the CPU leans into an event than you did, so building for one pays. */
const EVENT_LEAN = 0.6

/** The CPU's deck for a match, on the same cap as yours and off your best card. On an
    event it holds a share of the event's cards, but never as many as you brought. */
export function dealCpuDeck(rnd: () => number, event: LockerEvent | null, yours: Player[]): Player[] {
  const top = Math.max(0, ...yours.map((c) => RARITIES.indexOf(c.rarity)))
  const { curve } = CPU_CURVES.find((c) => top <= RARITIES.indexOf(c.upTo)) ?? CPU_CURVES[CPU_CURVES.length - 1]
  const lean = event ? (yours.filter((c) => cardMatches(c, event.match)).length / (yours.length || 1)) * EVENT_LEAN : 0
  const men = new Set<string>()
  const out: Player[] = []
  for (const { rarity, pos, n } of curve) {
    const list = OF_RARITY[rarity].filter((p) => pos.includes(p.pos))
    const wanted = event ? list.filter((p) => cardMatches(p, event.match)) : []
    const not = event ? list.filter((p) => !cardMatches(p, event.match)) : list
    for (let i = 0; i < n; i++) {
      const card = (wanted.length && rnd() < lean ? fresh(wanted, men, rnd) : fresh(not, men, rnd)) ?? fresh(list, men, rnd)
      if (card) out.push(card)
    }
  }
  return out
}

/** A real source of chance for a real pack. */
export function packRandom(): () => number {
  const { getRandomValues } = globalThis.crypto
  const buf = new Uint32Array(1)
  return () => {
    getRandomValues.call(globalThis.crypto, buf)
    return buf[0] / 4294967296
  }
}
