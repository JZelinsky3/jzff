// Roster Roulette — the rules, and the deal.
//
// The wheel lands on a manager-season. You take one player off that squad
// and set him in a slot he's eligible for. Spin again, take another, until
// the lineup is full. A player can only hold one slot and a filled slot is
// closed, so the whole game is deciding when a very good running back is
// worth burning your FLEX on.
//
// The deal is deterministic from its seed: same seed, same nine squads, in
// the same order. That's what makes a run shareable — you can hand someone
// a link and they play your exact wheel — and it's what would let a future
// leaderboard re-deal a submitted run server-side and check the score
// instead of trusting the browser.

import type { Squad, SquadRef, PoolPosition } from './pool'

export type SlotId = 'QB' | 'RB1' | 'RB2' | 'WR1' | 'WR2' | 'TE' | 'FLEX'

export type SlotDef = {
  id: SlotId
  label: string
  /** Positions allowed in this slot. */
  accepts: PoolPosition[]
}

export const SLOTS: SlotDef[] = [
  { id: 'QB', label: 'QB', accepts: ['QB'] },
  { id: 'RB1', label: 'RB', accepts: ['RB'] },
  { id: 'RB2', label: 'RB', accepts: ['RB'] },
  { id: 'WR1', label: 'WR', accepts: ['WR'] },
  { id: 'WR2', label: 'WR', accepts: ['WR'] },
  { id: 'TE', label: 'TE', accepts: ['TE'] },
  { id: 'FLEX', label: 'FLEX', accepts: ['RB', 'WR', 'TE'] },
]

export const REROLLS = 1

/** Squads dealt per game: one per slot, plus one in reserve per reroll. */
export const SPINS_PER_GAME = SLOTS.length + REROLLS

// ============================================================
// Seeded randomness
// ============================================================

// xmur3 + mulberry32. Small, fast, and — the reason it's hand-rolled rather
// than Math.random — reproducible, so the same seed deals the same game on
// the server today and on the server that re-scores it later.
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return (h ^= h >>> 16) >>> 0
}

export function makeRng(seed: string): () => number {
  let a = hashSeed(seed)
  return function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEED_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** A short, unambiguous, shareable seed. No O/0 or I/1 confusion. */
export function newSeed(): string {
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += SEED_ALPHABET[Math.floor(Math.random() * SEED_ALPHABET.length)]
  }
  return out
}

export function normalizeSeed(raw: string | null | undefined): string | null {
  if (!raw) return null
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)
  return clean.length >= 4 ? clean : null
}

// ============================================================
// The deal
// ============================================================

/**
 * Picks which squads this seed's wheel will land on, without touching their
 * rosters — callers hydrate the winners via loadSquadRosters(). Never deals
 * the same manager twice in one game: landing on the same guy in two
 * different years is a fine spin, landing on him twice is a bad one.
 */
export function dealRefs(index: SquadRef[], seed: string, count: number): SquadRef[] {
  const rng = makeRng(seed)
  const pool = index.slice()
  const picked: SquadRef[] = []
  const seenManagers = new Set<string>()

  // Partial Fisher-Yates: walk the shuffle only as far as we need, skipping
  // repeats of a manager we've already landed on.
  for (let i = 0; i < pool.length && picked.length < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
    const cand = pool[i]
    const managerKey = `${cand.leagueSlug}|${cand.managerId}`
    if (seenManagers.has(managerKey)) continue
    seenManagers.add(managerKey)
    picked.push(cand)
  }
  return picked
}

/** Roster reading order: by position, best season first inside each. */
const POS_ORDER: Record<PoolPosition, number> = { QB: 0, RB: 1, WR: 2, TE: 3 }

export function sortSquadPlayers(squad: Squad): Squad {
  return {
    ...squad,
    players: squad.players
      .slice()
      .sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ppg - a.ppg),
  }
}

/**
 * Whether a squad can still contribute to a lineup with these slots open.
 * A spin that can't fill anything is dead — the UI offers a reroll and,
 * failing that, lets the player pass and eat the empty slot.
 */
export function squadCanFill(squad: Squad, openSlots: SlotId[]): boolean {
  const accepted = new Set<PoolPosition>()
  for (const id of openSlots) {
    const def = SLOTS.find((s) => s.id === id)
    if (def) def.accepts.forEach((p) => accepted.add(p))
  }
  return squad.players.some((p) => accepted.has(p.pos))
}

/**
 * The most PPG these nine squads could ever have produced — the par for a
 * wheel, and the only fair thing to grade a run against, since a seed that
 * deals three championship rosters is not the seed that deals three
 * last-place ones.
 *
 * Exact rather than estimated. Assigning squads to slots is a matching
 * problem, and it is small enough to just solve: seven slots is a 128-value
 * bitmask, so a DP over (squads seen, slots filled) settles it in a few
 * thousand operations. Note this is the ceiling for a player who could see
 * all nine squads up front — you can't, which is the game.
 */
export function parForDeal(spins: Squad[], slots: SlotDef[] = SLOTS): number {
  const full = (1 << slots.length) - 1
  // best[squad][slot] — the top-scoring player that squad can put in that slot.
  const best = spins.map((squad) =>
    slots.map((slot) => {
      let top = 0
      for (const p of squad.players) {
        if (slot.accepts.includes(p.pos) && p.ppg > top) top = p.ppg
      }
      return top
    })
  )

  const NONE = -1
  let cur = new Float64Array(full + 1).fill(NONE)
  cur[0] = 0
  for (let i = 0; i < spins.length; i++) {
    const next = new Float64Array(full + 1).fill(NONE)
    for (let mask = 0; mask <= full; mask++) {
      const have = cur[mask]
      if (have === NONE) continue
      // Skip this squad — what a reroll, or simply running out of slots,
      // amounts to.
      if (next[mask] < have) next[mask] = have
      for (let s = 0; s < slots.length; s++) {
        const bit = 1 << s
        if (mask & bit) continue
        const gain = best[i][s]
        if (gain <= 0) continue
        const val = have + gain
        if (next[mask | bit] < val) next[mask | bit] = val
      }
    }
    cur = next
  }
  return cur[full] === NONE ? 0 : Math.round(cur[full] * 100) / 100
}
