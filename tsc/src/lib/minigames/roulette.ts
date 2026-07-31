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

function normIdentity(raw: string | null | undefined): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * The handles by which a player would call two spins "the same team".
 *
 * Deliberately not the manager row id, which is what this used to key on and
 * which let the same team through twice by two different routes:
 *
 *   • A league carrying two manager rows for one person. Real and current —
 *     pams has two "Sean" rows, fontain two "Eric" — usually a platform
 *     migration that couldn't join an old id to a new one.
 *   • The same league published twice under two slugs. Also real: `pams`
 *     and `pa-milk-society` are both PA Milk Society, so on the site wheel
 *     their shared seasons were two different rows describing one team.
 *
 * Both are invisible to an id check and obvious to a human, so the check is
 * on what the human sees: the league's name, plus the manager's name AND
 * the team name, either of which colliding is enough. Team name alone
 * wouldn't do it (a manager renames his team between years) and manager name
 * alone wouldn't either (two managers, one recycled team name).
 */
function squadIdentities(ref: SquadRef): string[] {
  const league = normIdentity(ref.leagueName)
  const keys = [`${league}|m:${normIdentity(ref.managerName)}`]
  const team = normIdentity(ref.teamName)
  if (team) keys.push(`${league}|t:${team}`)
  return keys
}

/**
 * Picks which squads this seed's wheel will land on, without touching their
 * rosters — callers hydrate the winners via loadSquadRosters(). Landing on
 * the same team twice in one game is the single worst spin the wheel can
 * produce, so distinct teams are dealt first and repeats are only reached
 * for when the pool genuinely cannot fill a wheel without them.
 */
export function dealRefs(index: SquadRef[], seed: string, count: number): SquadRef[] {
  const rng = makeRng(seed)
  const pool = index.slice()
  const picked: SquadRef[] = []
  const spares: SquadRef[] = []
  const seen = new Set<string>()

  // Partial Fisher-Yates: walk the shuffle only as far as we need, setting
  // aside any squad belonging to a team already on this wheel.
  for (let i = 0; i < pool.length && picked.length < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
    const cand = pool[i]
    const keys = squadIdentities(cand)
    if (keys.some((k) => seen.has(k))) {
      spares.push(cand)
      continue
    }
    for (const k of keys) seen.add(k)
    picked.push(cand)
  }

  // Only reachable when the loop above ran out of pool, i.e. a league with
  // one or two seasons and not enough distinct teams to fill eight spins.
  // Dealing a repeat there beats dealing a short wheel, which costs the
  // player their reroll or a whole lineup slot. Anything with four or five
  // seasons clears the wheel long before this and never sees a repeat.
  // Spares are distinct rows in seeded order, so the deal stays reproducible.
  for (const spare of spares) {
    if (picked.length >= count) break
    picked.push(spare)
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
