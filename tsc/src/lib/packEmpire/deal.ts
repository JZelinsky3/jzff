// Dealing packs. SERVER ONLY.
//
// The original dealt in the browser with Math.random, which made every number
// on its leaderboard a claim nobody could check, and let a League player
// refresh a bad pack away (it papered over that by saving open packs to a
// table). Here a pack is a pure function of a seed, a slot and a SECRET:
//
//   · the seed is public, so a run can be re-dealt and re-scored later, the
//     same way every other board on the Games Page verifies a run;
//   · the secret is not, so the browser cannot work out what is in a pack it
//     has not opened yet, which is the only hidden information this game has.
//
// Refreshing re-deals the identical pack, so there is nothing to reroll.

import { createHmac, hkdfSync, randomBytes } from 'crypto'
import { POOL, POOL_VERSION, personOfId } from './pool'
import {
  MEGA_POOL_COUNTS,
  MEGA_TOTAL_PICKS,
  MEGA_WEIGHTS,
  PACK_SIZE,
  POOL_KEYS,
  SEED_ALPHABET,
  SLOTS,
  SLOT_COUNT,
  megaPickOwner,
  megaWorth,
  personOf,
  type Player,
  type Weights,
} from './rules'

// ============================================================
// Keys
// ============================================================

let cachedKey: Buffer | null = null

/**
 * Derived, not stored: PACK_EMPIRE_SECRET when it is set, otherwise the
 * service-role key every server route already has. HKDF with this game's own
 * label, so the derived key is useless for anything but dealing packs.
 */
function key(): Buffer {
  if (cachedKey) return cachedKey
  const base = process.env.PACK_EMPIRE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('Pack Empire has no dealing secret configured.')
  cachedKey = Buffer.from(hkdfSync('sha256', base, 'tsc-pack-empire', 'deal-v1', 32))
  return cachedKey
}

function hmac(label: string): Buffer {
  return createHmac('sha256', key()).update(`${POOL_VERSION}|${label}`).digest()
}

// ============================================================
// Seeds
// ============================================================

const ALPHABET = SEED_ALPHABET

function encode(bytes: Buffer, chars: number): string {
  let out = ''
  for (let i = 0; i < chars; i++) out += ALPHABET[bytes[i] % 32]
  return out
}

function randomChars(chars: number): string {
  return encode(randomBytes(chars), chars)
}

/**
 * A captain-bound seed: eight random characters, the captain's slot, and a
 * six-character signature over both.
 *
 * The signature is what makes the captain a commitment. Without it the
 * browser could ask for the same seed's packs under two different captains
 * and keep whichever universe dealt better.
 */
export function newCaptainSeed(captain: number): string {
  const body = randomChars(8) + ALPHABET[captain]
  return body + encode(hmac(`seed|${body}`), 6)
}

export function readCaptainSeed(seed: string): { captain: number } | null {
  if (!/^[A-Z2-9]{15}$/.test(seed)) return null
  const body = seed.slice(0, 9)
  if (encode(hmac(`seed|${body}`), 6) !== seed.slice(9)) return null
  const captain = ALPHABET.indexOf(seed[8])
  if (captain < 0 || captain >= SLOT_COUNT) return null
  return { captain }
}

/** A plain random seed, for things the server keeps to itself (a League
    week's draft, a Mega Draft's board). */
export function newServerSeed(): string {
  return randomChars(12)
}

// ============================================================
// Randomness
// ============================================================

/** sfc32, seeded from an HMAC so every stream is unguessable and replayable. */
function stream(label: string): () => number {
  const d = hmac(label)
  let a = d.readUInt32LE(0)
  let b = d.readUInt32LE(4)
  let c = d.readUInt32LE(8)
  let n = d.readUInt32LE(12)
  return () => {
    a >>>= 0
    b >>>= 0
    c >>>= 0
    n >>>= 0
    let t = (a + b) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    n = (n + 1) | 0
    t = (t + n) | 0
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }
}

function sampler(pool: Player[], weights: Weights): (r: number) => Player | null {
  const cum: number[] = []
  let total = 0
  for (const p of pool) {
    total += Math.max(0, weights[p.rarity] ?? 0)
    cum.push(total)
  }
  return (r: number) => {
    if (total <= 0) return null
    const x = r * total
    let lo = 0
    let hi = cum.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cum[mid] > x) hi = mid
      else lo = mid + 1
    }
    return pool[lo] ?? null
  }
}

// ============================================================
// Packs
// ============================================================

/** Candidates each card position draws before falling back. */
const LANE_DEPTH = 40

/**
 * Five cards for one slot.
 *
 * Each card position has its own LANE: a fixed sequence of weighted draws off
 * its own stream. A card is the first candidate in its lane whose MAN isn't
 * excluded and isn't already in the pack: cards are seasons, and Jerry Rice's
 * 1995 and his 1994 are still one Jerry Rice. One lane in five draws off the
 * boosted table, exactly as the original did.
 *
 * Lanes rather than one shared stream because of the three receiver slots
 * (and two tackles, two guards): they draw from the same pool, and a player
 * taken in one can't come up in another. With a shared stream, every
 * exclusion shifted every later draw, so the ORDER you opened your receiver
 * packs in rewrote what was in them. With lanes, taking a man only replaces
 * that man.
 */
export function dealPack({
  label,
  slot,
  base,
  boosted,
  exclude,
}: {
  /** Which universe: 'solo:<seed>', 'league:<seed>' and so on. */
  label: string
  slot: number
  base: Weights
  boosted: Weights
  exclude: Iterable<string>
}): Player[] {
  const def = SLOTS[slot]
  if (!def) return []
  const pool = POOL[def.pool]
  const out: Player[] = []
  // by man, not by card; ids from an older pool are their own man
  const taken = new Set([...exclude].map(personOfId))
  const left = new Set(pool.map(personOf).filter((m) => !taken.has(m))).size
  const size = Math.min(PACK_SIZE, left)

  const head = stream(`${label}|${def.key}|head`)
  const boostedAt = Math.floor(head() * PACK_SIZE)
  const drawBase = sampler(pool, base)
  const drawBoost = sampler(pool, boosted)

  for (let i = 0; i < size; i++) {
    const lane = stream(`${label}|${def.key}|lane${i}`)
    const draw = i === boostedAt ? drawBoost : drawBase
    let pick: Player | null = null
    for (let n = 0; n < LANE_DEPTH && !pick; n++) {
      const p = draw(lane())
      if (p && !taken.has(personOf(p))) pick = p
    }
    if (!pick) {
      // A pool nearly drafted dry. Still deterministic: same lane, same order.
      const rest = pool.filter((p) => !taken.has(personOf(p)))
      if (rest.length === 0) break
      pick = rest[Math.floor(lane() * rest.length)]
    }
    taken.add(personOf(pick))
    out.push(pick)
  }

  // Fisher-Yates off the head stream, so the boosted card isn't always in
  // the same place.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(head() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ============================================================
// Mega Draft
// ============================================================

/** How far apart the two seats may finish when the same draft is played from
    both sides. Tested against the pool with scripts/pack-empire-pool/sim/
    mega-sim.ts: an unchecked board gave first pick 65% between equal players. */
const MEGA_FAIR_TOP_CARD = 100
const MEGA_FAIR_READ = 150

/** A typical board takes about 70 deals to pass, one in a thousand 600. */
const MEGA_MAX_DEALS = 700

/** A board's cards: at least one dynasty-or-better at every position, the
    rest weighted off MEGA_WEIGHTS without replacement. One version of a man
    per board, so the two seats can't both draft him. */
function megaCards(seed: string, deal: number): Player[] {
  const out: Player[] = []
  for (const k of POOL_KEYS) {
    const rnd = stream(`mega:${seed}|${deal}|${k}`)
    const pool = POOL[k]
    const picked = new Set<string>()
    const want = MEGA_POOL_COUNTS[k]

    const stars = pool.filter((p) => p.rarity === 'dynasty' || p.rarity === 'transcendent' || p.rarity === 'immortal')
    if (stars.length) {
      const s = stars[Math.floor(rnd() * stars.length)]
      picked.add(personOf(s))
      out.push(s)
    }

    let guard = 0
    while (picked.size < want && guard++ < 500) {
      const avail = pool.filter((p) => !picked.has(personOf(p)))
      if (avail.length === 0) break
      const p = sampler(avail, MEGA_WEIGHTS)(rnd())
      if (p && !picked.has(personOf(p))) {
        picked.add(personOf(p))
        out.push(p)
      }
    }
  }
  return out
}

/** Both seats draft a board the same way: first seat's total minus second's. */
function draftMargin(board: Player[], worth: (p: Player, left: Player[], rivalOpen: number) => number): number {
  const open = (lineup: Player[], pos: Player['pos']) =>
    SLOTS.filter((s) => s.pool === pos).length - lineup.filter((p) => p.pos === pos).length
  const seats: [Player[], Player[]] = [[], []]
  let left = board
  for (let n = 0; n < MEGA_TOTAL_PICKS; n++) {
    const seat = megaPickOwner(n)
    const [mine, theirs] = seat === 0 ? seats : [seats[1], seats[0]]
    let best: Player | null = null
    let bestWorth = -Infinity
    for (const p of left) {
      if (open(mine, p.pos) <= 0) continue
      const w = worth(p, left, open(theirs, p.pos))
      if (w > bestWorth) {
        bestWorth = w
        best = p
      }
    }
    if (!best) break
    mine.push(best)
    const taken = best
    left = left.filter((p) => p !== taken)
  }
  const total = (lineup: Player[]) => lineup.reduce((sum, p) => sum + p.score, 0)
  return total(seats[0]) - total(seats[1])
}

/**
 * The shared board for a Mega Draft: 36 players, shuffled.
 *
 * Left alone, the seat that wins the coin takes the best card on the board
 * and, with one immortal out on its own, usually the game. So a board only
 * goes out if it's level from either seat, played out here two ways: both
 * seats taking the top card, and both reading the board (megaWorth). That
 * leaves the choices to decide it. It's a filter, not a rule: boards still
 * carry none, one or several immortals in the same proportions as before.
 * Dealt once and stored, so this never runs against a draft already going.
 */
export function dealMegaBoard(seed: string): Player[] {
  let out = megaCards(seed, 0)
  let closest = Infinity
  for (let deal = 0; deal < MEGA_MAX_DEALS; deal++) {
    const cards = megaCards(seed, deal)
    const gap = Math.max(
      Math.abs(draftMargin(cards, (p) => p.score)) / MEGA_FAIR_TOP_CARD,
      Math.abs(draftMargin(cards, megaWorth)) / MEGA_FAIR_READ
    )
    if (gap < closest) {
      closest = gap
      out = cards
    }
    if (gap <= 1) break
  }

  out = [...out]
  const rnd = stream(`mega:${seed}|shuffle`)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
