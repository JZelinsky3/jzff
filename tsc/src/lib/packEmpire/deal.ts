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
import { drawBattles } from './battles'
import {
  DAILY_H_FROM,
  DAILY_NEW_POOL_FROM,
  DAILY_N_FROM,
  DAILY_O_FROM,
  POOL,
  POOL_M_VERSION,
  POOL_N,
  POOL_N_VERSION,
  POOL_BEFORE,
  POOL_BEFORE_VERSION,
  POOL_H,
  POOL_H_VERSION,
  POOL_VERSION,
  cardWeight,
  cardWeightH,
  cardWeightM,
  cardWeightN,
  liveCard,
  personOfId,
  playerById,
} from './pool'
import {
  MEGA_POOL_COUNTS,
  MEGA_TOTAL_PICKS,
  MEGA_WEIGHTS,
  EVEN_MARK,
  PACK_SIZE,
  POOL_KEYS,
  RARITY_FLOOR,
  tableRarity,
  RESERVE_WEIGHTS,
  SALARY_CAP,
  SEED_ALPHABET,
  SEED_DIFF,
  MYSTERY_CAP_WEIGHTS,
  MYSTERY_DIFF,
  MYSTERY_RICH_CAP,
  SHARED_WEIGHTS,
  SOLO_BOOSTED,
  SLOTS,
  SLOT_COUNT,
  SOLO_WEIGHTS,
  VALUE_TOP,
  VERSUS_WEIGHTS,
  difficultyFromSeed,
  formatFromSeed,
  isBlind,
  megaPickOwner,
  megaWorth,
  personOf,
  signingPrice,
  slotForCard,
  type Difficulty,
  type MegaFormat,
  type Player,
  type PoolKey,
  type Weights,
  EVEN_CEILING,
  EVEN_CONTESTED_MARK,
  EVEN_MYSTERY_MARK,
  EVEN_PLANTED_STAR,
  EVEN_THREE_AT_TOP,
  VERSUS_CAPTAIN_SHIFT,
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

function hmac(label: string, version: string = POOL_VERSION): Buffer {
  return createHmac('sha256', key()).update(`${version}|${label}`).digest()
}

/** For what belongs to a card rather than a deal, its range and its salary.
    Tied to one fixed version, so they hold still when the pool grows. */
function cardHash(label: string): Buffer {
  return hmac(label, POOL_BEFORE_VERSION)
}

/**
 * What a deal is dealt from. Only the Daily ever asks for anything but the
 * current one: a day's deal is fixed by its date, so a day already under way
 * stays on the pool it started on (see DAILY_NEW_POOL_FROM).
 */
type Era = {
  version: string
  pool: Record<PoolKey, Player[]>
  weigh: (p: Player, weights: Weights) => number
  seasons?: Player[][]
  traps?: Map<PoolKey, Player[]>
}

const CURRENT_ERA: Era = { version: POOL_VERSION, pool: POOL, weigh: cardWeight }

/** Raw table weights: cardWeight only exists for pools that have grown since. */
const BEFORE_ERA: Era = {
  version: POOL_BEFORE_VERSION,
  pool: POOL_BEFORE,
  weigh: (p, weights) => Math.max(0, weights[tableRarity(p.rarity)] ?? 0),
}

const H_ERA: Era = { version: POOL_H_VERSION, pool: POOL_H, weigh: cardWeightH }

/** The 10n cards, Canton on the odds it had before 10n. */
const M_ERA: Era = { version: POOL_M_VERSION, pool: POOL_N, weigh: cardWeightM }

/** The 10n cards and odds, before 10o. */
const N_ERA: Era = { version: POOL_N_VERSION, pool: POOL_N, weigh: cardWeightN }

function dailyEra(day: string): Era {
  if (day < DAILY_H_FROM) return BEFORE_ERA
  if (day < DAILY_NEW_POOL_FROM) return H_ERA
  if (day < DAILY_N_FROM) return M_ERA
  return day < DAILY_O_FROM ? N_ERA : CURRENT_ERA
}

/** A card as a day's Daily dealt it, at the value that day started with. */
export function dailyCard(day: string, id: string): Player | null {
  const era = dailyEra(day)
  return era.pool[id.split('-')[0].toUpperCase() as PoolKey]?.find((p) => p.id === id) ?? playerById(id)
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
 * A captain-bound seed: eight random characters, the captain's slot, the
 * difficulty, and a six-character signature over all of it.
 *
 * The signature is what makes the captain and the difficulty commitments.
 * Without it the browser could ask for the same seed's packs under two
 * different captains and keep whichever universe dealt better, or read a blind
 * run's packs face up. An open run leaves the difficulty out, which is the
 * shape every seed had before there were difficulties.
 */
export function newCaptainSeed(captain: number, diff: Difficulty = 'open'): string {
  const mark = diff === 'open' ? '' : Object.keys(SEED_DIFF).find((k) => SEED_DIFF[k] === diff)
  const body = randomChars(8) + ALPHABET[captain] + mark
  return body + encode(hmac(`seed|${body}`), 6)
}

/** A Classic Versus seat: a captain seed whose ordinary packs are richer. A Builder run
    can't be one, and the board refuses it, so it never reaches a binder. `mystery` is a
    Mystery Versus seat: the same richer odds, packs in a line of mixed positions. */
export function newVersusSeed(captain: number, diff: Difficulty = 'open', mystery = false): string {
  const mark = mystery
    ? Object.keys(MYSTERY_DIFF).find((k) => MYSTERY_DIFF[k] === diff)
    : diff === 'open'
      ? ''
      : Object.keys(SEED_DIFF).find((k) => SEED_DIFF[k] === diff)
  const body = randomChars(8) + ALPHABET[captain + VERSUS_CAPTAIN_SHIFT] + mark
  return body + encode(hmac(`seed|${body}`), 6)
}

/** An Even Versus: both seats play this one seed, and there is no captain in
    it. A different universe from every captain seed, so never reused for one.
    `mystery` is an Even Mystery: the same, in eleven wild packs. */
export function newEvenSeed(diff: Difficulty, mystery = false): string {
  const mark = Object.keys(SEED_DIFF).find((k) => SEED_DIFF[k] === diff)
  const body = randomChars(8) + (mystery ? EVEN_MYSTERY_MARK : EVEN_CONTESTED_MARK) + mark
  return body + encode(hmac(`seed|${body}`), 6)
}

/** A Mystery Builder run: the captain's pack, then ten packs of five random positions. */
export function newMysterySeed(captain: number, diff: Difficulty = 'open'): string {
  const mark = Object.keys(MYSTERY_DIFF).find((k) => MYSTERY_DIFF[k] === diff)
  const body = randomChars(8) + ALPHABET[captain] + mark
  return body + encode(hmac(`seed|${body}`), 6)
}

/** `versus` is a Classic Versus seat, on the richer ordinary packs. `mystery` is a
    Mystery Builder run. */
export type SeedInfo = { captain: number | null; diff: Difficulty; even: boolean; versus: boolean; mystery: boolean }

/** What a seed commits to, or null if it wasn't signed here (or not for this
    pool, which is how a run saved before a pool change stops replaying). */
export function readSeed(seed: string): SeedInfo | null {
  if (!/^[A-Z2-9]{15,16}$/.test(seed)) return null
  const bodyLength = seed.length - 6
  const body = seed.slice(0, bodyLength)
  if (encode(hmac(`seed|${body}`), 6) !== seed.slice(bodyLength)) return null
  if (seed[8] === EVEN_MARK || seed[8] === EVEN_CONTESTED_MARK || seed[8] === EVEN_MYSTERY_MARK) {
    if (seed.length !== 16) return null
    return { captain: null, diff: difficultyFromSeed(seed), even: true, versus: false, mystery: seed[8] === EVEN_MYSTERY_MARK }
  }
  const at = ALPHABET.indexOf(seed[8])
  const versus = at >= VERSUS_CAPTAIN_SHIFT
  const captain = versus ? at - VERSUS_CAPTAIN_SHIFT : at
  if (captain < 0 || captain >= SLOT_COUNT) return null
  const mystery = formatFromSeed(seed) === 'mystery'
  return { captain, diff: difficultyFromSeed(seed), even: false, versus, mystery }
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
function stream(label: string, version?: string): () => number {
  const d = hmac(label, version)
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

function sampler(pool: Player[], weights: Weights, weigh: Era['weigh'] = cardWeight): (r: number) => Player | null {
  const cum: number[] = []
  let total = 0
  for (const p of pool) {
    total += weigh(p, weights)
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
// Masking
// ============================================================

/**
 * How wide a range can run. Which of these a card gets comes off the secret and
 * the card alone, nothing to do with its value (a width that grew with value
 * would give it away), so some cards are easy to read and some aren't. With one
 * width for everything the top, the middle and the bottom of a range all rank a
 * pack the same way, and just taking the highest read scored 93% of a perfect
 * draft. Off sim/range-sim.ts: with these, the top alone scores 82% and no one
 * read beats 92%.
 */
export const RANGE_WIDTHS = [1400, 2000, 2500]

/**
 * Where a range sits on a card. The real value can be anywhere inside, right up
 * to either end, so a 1,100 can read 1,000-3,000 and a 2,500 can read 500-2,500,
 * and the card with the higher top isn't always the better card. The value is
 * always truly inside: `lo` is on the hundreds, rounded in, never out.
 *
 * A cheap card's start runs anywhere from zero to its own value, or every one of
 * them would read "0-2,000" and that would be the rarity again.
 */
function placeRange(p: Player, width: number, at: number, top: number): { lo: number; hi: number } {
  const first = Math.ceil(Math.max(0, p.score - width) / 100)
  const last = Math.floor(p.score / 100)
  const roof = Math.max(top, Math.ceil(p.score / 100) * 100)
  const lo = Math.min((first + Math.round(at * (last - first))) * 100, roof - width)
  return { lo, hi: lo + width }
}

/** The range a card prints. Same every time it's dealt, so asking for it a
    hundred times can't narrow it down. */
export function rangeOf(p: Player, label = 'range', top: number = VALUE_TOP): { lo: number; hi: number } {
  const width = RANGE_WIDTHS[cardHash(`${label}-width|${p.id}`)[0] % RANGE_WIDTHS.length]
  return placeRange(p, width, cardHash(`${label}-at|${p.id}`).readUInt16LE(0) / 65535, top)
}

/** Where ranges topped out when no card went past 5,600. A Daily dealt then keeps it. */
const RANGE_TOP_BEFORE = 5600

/** The ranges a Daily printed before RANGE_WIDTHS, for days already out. */
function rangeBefore(p: Player): { lo: number; hi: number } {
  const width = [1400, 2800, 4000][cardHash(`daily-width|${p.id}`)[0] % 3]
  const at = cardHash(`daily-range|${p.id}`).readUInt16LE(0) / 65535
  const lowest = Math.max(0, p.score - 0.92 * width)
  const highest = p.score > 0.08 * width ? p.score - 0.08 * width : p.score / 2
  const lo = Math.floor((lowest + at * (highest - lowest)) / 100) * 100
  const over = Math.max(0, lo + width - RANGE_TOP_BEFORE)
  return { lo: Math.max(0, lo - over), hi: Math.min(lo + width, RANGE_TOP_BEFORE) }
}

/** A Daily card's range. Its own draw, so a card reads differently here than in
    the Builder, and a day that's already out keeps what it printed. */
export function dailyRange(p: Player, day: string): { lo: number; hi: number } {
  if (day < DAILY_H_FROM) return rangeBefore(p)
  return rangeOf(p, 'daily-range', day < DAILY_NEW_POOL_FROM ? RANGE_TOP_BEFORE : VALUE_TOP)
}

/** A card on the Daily's table. */
export function maskDaily(p: Player, version: 'range' | 'season', day: string): Player {
  const card = maskCard(p, version)
  return version === 'range' ? { ...card, blind: { level: 'range', ...dailyRange(p, day) } } : card
}

/**
 * What a card costs under a salary cap, in $M: its value at $1M a hundred, give
 * or take 40%, off the secret and the card alone. If salary were simply value,
 * spending the whole budget would be the whole game. The swing is what makes a
 * bargain worth finding, and on a blind card it's as much of a clue as you get.
 */
export function salaryOf(p: Player): number {
  const at = cardHash(`salary|${p.id}`).readUInt16LE(0) / 65535
  return Math.max(1, Math.round((p.score / 100) * (0.6 + 0.8 * at)))
}

export function priced(p: Player): Player {
  return { ...p, salary: salaryOf(p) }
}

/** A card as the browser may see it on a blind difficulty. A new object with
    only the visible fields, so nothing can be read off the network tab. */
export function maskCard(p: Player, diff: Difficulty): Player {
  if (diff === 'open') return p
  if (diff === 'cap') return priced(p)
  const shared = { id: p.id, name: p.name, pos: p.pos, year: p.year, img: p.img, score: 0, rarity: 'common' as const, accolades: [] }
  return diff === 'range'
    ? { ...shared, team: p.team, club: p.club, blind: { level: 'range', ...rangeOf(p) } }
    : { ...shared, team: '', blind: { level: 'season' } }
}

/**
 * How sharp the CPU is, set to an average player: on the blind modes people score
 * about 83% of a perfect draft on Range and 72% on Ball Knower (pe_daily_runs,
 * October 2026), and this lands there in Classic and Even (sim/cpu-sim.ts).
 * `misread` is how far out a read can be, as a power of e: 1.8 is anywhere from
 * a sixth of a card's worth to six times it, so a star stays a star and it's the
 * mid cards it gets wrong. `chem` is how much of the chemistry on offer it spots.
 *
 * Face up there's nothing to misread, so a CPU with no noise read every card right and
 * took every bond: on an Even, where it sees your packs, the best anyone could do was
 * tie it. Here `misread` is a person weighing one card against another, and the numbers
 * come off sim/versus-sim.ts.
 */
export const CPU_SKILL: Record<Difficulty, { misread: number; chem: number }> = {
  open: { misread: 0.3, chem: 0.5 },
  cap: { misread: 0.3, chem: 0.5 },
  range: { misread: 0.3, chem: 0.5 },
  season: { misread: 1.8, chem: 0.5 },
}

/**
 * How the CPU reads a card on a Versus. It gets no more than a person would: a
 * Range card's midpoint, and on Ball Knower a memory of the value. Off its own
 * stream, so its draft is settled the moment its seed is dealt.
 */
export function cpuEye(seed: string, diff: Difficulty): (p: Player) => number {
  const skill = CPU_SKILL[diff]
  const rnd = stream(`cpu:${seed}`)
  return (p) => {
    const { lo, hi } = rangeOf(p)
    return (diff === 'range' ? (lo + hi) / 2 : p.score) * Math.exp(skill.misread * (2 * rnd() - 1))
  }
}

// ============================================================
// Shared packs: Even Versus and the Daily
// ============================================================
//
// When two people have to see the same cards, a pick can't be allowed to
// change what's dealt next. So a shared deal is laid out whole, up front, with
// no man in it twice. That makes every pack a fixed fact: nothing to exclude,
// nothing to re-deal, and nobody can land on a different card by taking the
// same five men in a different order.

/** One card per man, drawn weighted without replacement. */
function drawInto(
  out: Player[],
  pool: Player[],
  want: number,
  weights: Weights,
  used: Set<string>,
  rnd: () => number,
  weigh: Era['weigh'] = cardWeight
) {
  for (let n = 0; n < want; n++) {
    const open = pool.filter((p) => !used.has(personOf(p)))
    const p = open.length ? sampler(open, weights, weigh)(rnd()) : null
    if (!p) return
    used.add(personOf(p))
    out.push(p)
  }
}

function shuffled<T>(list: T[], rnd: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Real team-seasons deep enough to build around: four cards or more at three
    positions or more. Sorted, because a deal must not depend on JSON order. */
function teamSeasons(era: Era): Player[][] {
  if (era.seasons) return era.seasons
  const by = new Map<string, Player[]>()
  for (const k of POOL_KEYS) {
    for (const p of era.pool[k]) {
      if (!p.year) continue
      const key = `${p.year} ${p.team}`
      by.set(key, [...(by.get(key) ?? []), p])
    }
  }
  era.seasons = [...by.keys()]
    .sort()
    .map((key) => by.get(key) as Player[])
    .filter((cards) => cards.length >= 4 && new Set(cards.map((c) => c.pos)).size >= 3)
  return era.seasons
}

/**
 * One real team hidden across a shared deal: its men drop into different packs
 * among everything else, nothing marks them, and finding them pays double
 * chemistry. It's the reason to know who actually played together in 2019.
 *
 * Always the teams the odds were tuned on, whatever the pool holds now. A team's
 * cards go in with no weighted draw, so as the pool gains commons a team would
 * bring more of them with it: the 1,000-card pool put Even packs about a point
 * more common, and its totals about 3% down.
 */
function plantedSeason(rnd: () => number, era: Era = CURRENT_ERA): Player[] {
  const seasons = teamSeasons(BEFORE_ERA)
  const cards = shuffled(seasons[Math.floor(rnd() * seasons.length)], rnd)
  const seen = new Set<string>()
  const team = cards.filter((c) => !seen.has(personOf(c)) && !!seen.add(personOf(c)))
  // The teams are fixed, their cards are as the pool has them now: at today's
  // value, and a man in the vault sits this one out. N_ERA was the current era
  // when its day was set, so it reads its own frozen pool the same way.
  if (era === CURRENT_ERA) return team.map((c) => liveCard(c.id)).filter((c): c is Player => !!c)
  if (era === N_ERA) return team.flatMap((c) => POOL_N[c.pos as PoolKey]?.find((p) => p.id === c.id) ?? [])
  return team
}

/** The eleven packs of an Even Versus, one per slot, the same for both seats. */
export function evenPacks(seed: string): Player[][] {
  const rnd = stream(`even:${seed}|deal`)
  const used = new Set<string>()
  const packs: Player[][] = SLOTS.map(() => [])

  const old = seed[8] === EVEN_MARK
  // A team deep enough to plant is a good one, so all of it would lift the top of the
  // deal well past its ceiling. Its stars only come along some of the time: the rest of
  // the team is still there to find.
  const planted = plantedSeason(rnd).filter((c) => old || c.score < RARITY_FLOOR.transcendent || rnd() < EVEN_PLANTED_STAR)
  for (const card of planted) {
    const open = shuffled(SLOTS.map((_, i) => i).filter((i) => SLOTS[i].pool === card.pos && !packs[i].length), rnd)
    if (open.length === 0) continue
    used.add(personOf(card))
    packs[open[0]].push(card)
  }
  SLOTS.forEach((def, i) => {
    if (old) drawInto(packs[i], POOL[def.pool], PACK_SIZE - packs[i].length, SHARED_WEIGHTS, used, rnd)
    else contest(packs[i], POOL[def.pool], used, rnd)
  })
  return packs.map((p) => shuffled(p, rnd))
}

const TABLE_RARITIES: (keyof Weights)[] = ['common', 'rare', 'dynasty', 'transcendent', 'immortal']

function rollCeiling(rnd: () => number): number {
  const total = TABLE_RARITIES.reduce((sum, r) => sum + EVEN_CEILING[r], 0)
  let x = rnd() * total
  for (let i = 0; i < TABLE_RARITIES.length; i++) {
    x -= EVEN_CEILING[TABLE_RARITIES[i]]
    if (x <= 0) return i
  }
  return 1
}

/** A pack with a fight at the top of it: see EVEN_CEILING. A planted card over the
    ceiling lifts it, so it's never left standing alone. */
function contest(pack: Player[], pool: Player[], used: Set<string>, rnd: () => number) {
  const rank = (p: Player) => TABLE_RARITIES.indexOf(tableRarity(p.rarity))
  const top = Math.max(rollCeiling(rnd), ...pack.map(rank))
  const weights = (keep: (i: number) => boolean) => Object.fromEntries(TABLE_RARITIES.map((r, i) => [r, keep(i) ? SHARED_WEIGHTS[r] : 0])) as Weights
  const want = rnd() < EVEN_THREE_AT_TOP ? 3 : 2
  drawInto(pack, pool, want - pack.filter((p) => rank(p) === top).length, weights((i) => i === top), used, rnd)
  drawInto(pack, pool, PACK_SIZE - pack.length, weights((i) => i < top), used, rnd)
  // A position that's run dry at those rarities still deals a full pack.
  drawInto(pack, pool, PACK_SIZE - pack.length, SHARED_WEIGHTS, used, rnd)
}

/** A big name in a bad year, dropped into the Daily on purpose: a star at
    dynasty or better on a card worth under 40% of his best. Taking the most
    famous man in the pack is a real strategy, and these are what beat it. */
const TRAP_CHANCE = 0.8

function trapsAt(k: PoolKey, era: Era): Player[] {
  if (!era.traps) {
    const best = new Map<string, number>()
    for (const key of POOL_KEYS) {
      for (const p of era.pool[key]) best.set(personOf(p), Math.max(best.get(personOf(p)) ?? 0, p.score))
    }
    era.traps = new Map()
    for (const key of POOL_KEYS) {
      era.traps.set(
        key,
        era.pool[key].filter((p) => {
          const top = best.get(personOf(p)) ?? 0
          return top >= RARITY_FLOOR.dynasty && p.score <= top * 0.4
        })
      )
    }
  }
  return era.traps.get(k) ?? []
}

/** One trap at this position, if one's left. */
function drawTrap(out: Player[], k: PoolKey, used: Set<string>, rnd: () => number, era: Era): boolean {
  const open = trapsAt(k, era).filter((p) => !used.has(personOf(p)))
  if (open.length === 0) return false
  const p = open[Math.floor(rnd() * open.length)]
  used.add(personOf(p))
  out.push(p)
  return true
}

/** How often a position turns up in a wild pack. Weighted toward the slots it
    has to fill, and flatter than that, so the scarce ones aren't a rumour. */
const WILD_POOL_WEIGHT: Record<PoolKey, number> = { QB: 1.5, RB: 1.5, WR: 3, TE: 1.5, OT: 2, OG: 2, C: 1.5 }

/** Five different positions, so a pack always has something to want. */
function wildPools(rnd: () => number): PoolKey[] {
  const left = [...POOL_KEYS]
  const out: PoolKey[] = []
  while (out.length < PACK_SIZE) {
    let x = rnd() * left.reduce((sum, k) => sum + WILD_POOL_WEIGHT[k], 0)
    const k = left.find((p) => (x -= WILD_POOL_WEIGHT[p]) < 0) ?? left[left.length - 1]
    out.push(k)
    left.splice(left.indexOf(k), 1)
  }
  return out
}

export type DailySet = {
  /** Eleven wild packs, always opened in this order. A day with a captain
      uses the first ten. */
  wild: Player[][]
  /** One locked captain pack per position, off the captain table. */
  captains: Record<PoolKey, Player[]>
  /** For a pack with nothing in it that fits: one card per slot at the
      position, replacement level. */
  reserves: Record<PoolKey, Player[]>
}

/** What a Daily run has left under a salary cap, walking its picks in order. */
export function dailyCapLeft(set: DailySet, captain: number | null, picks: DailyPick[]): number {
  let left: number = SALARY_CAP.shared
  picks.forEach((pick, i) => {
    const before = picks.slice(0, i)
    const usable = dailyUsable(dailyPack(set, captain, before).cards, captain, before).map(priced)
    const card = usable.find((c) => c.id === pick.id)
    if (card) left -= signingPrice(card, usable, left) ?? 0
  })
  return left
}

/** The cards in a pack that have a slot to go to. */
export function dailyUsable(cards: Player[], captain: number | null, picks: DailyPick[]): Player[] {
  if (captain != null && picks.length === 0) return cards
  const filled = new Set(picks.map((p) => p.slot))
  return cards.filter((c) => slotForCard(c.pos, filled) >= 0)
}

const SET_CACHE_SIZE = 8
const dailySets = new Map<string, DailySet>()

/** A day's whole deal, off the day and the secret. `version` keeps Range and
    Ball Knower apart: one can't be a look at the other's cards. */
export function dailySet(day: string, version: string): DailySet {
  const label = `daily:${day}:${version}`
  const hit = dailySets.get(label)
  if (hit) return hit

  const era = dailyEra(day)
  const rnd = stream(`${label}|deal`, era.version)
  const used = new Set<string>()
  const pools = Array.from({ length: SLOT_COUNT }, () => wildPools(rnd))
  const wild: Player[][] = pools.map(() => [])

  // In the first ten packs, so a day with a captain can still reach them all.
  const packOrder = shuffled(Array.from({ length: SLOT_COUNT - 1 }, (_, i) => i), rnd)
  for (const card of plantedSeason(rnd, era)) {
    const pack = packOrder.find((i) => !wild[i].length)
    if (pack == null) break
    if (!pools[pack].includes(card.pos)) pools[pack][Math.floor(rnd() * PACK_SIZE)] = card.pos
    used.add(personOf(card))
    wild[pack].push(card)
  }

  pools.forEach((list, i) => {
    const needed = [...list]
    const held = wild[i][0]
    if (held) needed.splice(needed.indexOf(held.pos), 1)
    if (rnd() < TRAP_CHANCE) {
      const k = needed[Math.floor(rnd() * needed.length)]
      if (drawTrap(wild[i], k, used, rnd, era)) needed.splice(needed.indexOf(k), 1)
    }
    for (const k of needed) drawInto(wild[i], era.pool[k], 1, SHARED_WEIGHTS, used, rnd, era.weigh)
  })

  const captains = {} as DailySet['captains']
  const reserves = {} as DailySet['reserves']
  for (const k of POOL_KEYS) {
    captains[k] = []
    const trapped = drawTrap(captains[k], k, used, rnd, era)
    drawInto(captains[k], era.pool[k], PACK_SIZE - (trapped ? 1 : 0), SOLO_WEIGHTS.captain, used, rnd, era.weigh)
    captains[k] = shuffled(captains[k], rnd)
  }
  for (const k of POOL_KEYS) {
    reserves[k] = []
    drawInto(reserves[k], era.pool[k], SLOTS.filter((s) => s.pool === k).length, RESERVE_WEIGHTS, used, rnd, era.weigh)
  }

  const set: DailySet = { wild: wild.map((p) => shuffled(p, rnd)), captains, reserves }
  if (dailySets.size >= SET_CACHE_SIZE) dailySets.delete(dailySets.keys().next().value as string)
  dailySets.set(label, set)
  return set
}

export type DailyPick = { id: string; slot: number }

export type DailyPack = {
  cards: Player[]
  /** The card swapped in because nothing else fit. */
  reserve: string | null
}

/**
 * The pack a Daily run is on, given what it has signed so far.
 *
 * Everyone opens the same packs in the same order. The first pack of a day with
 * a captain is the locked one for that position. The rest are wild, and a wild
 * pack can hold nothing you have a slot for: a player down to one tight end
 * slot would hit that in about one pack in three. So when none of the five fit,
 * the last card is swapped for the day's reserve at the position you need most.
 * Which card that is depends only on the day and the position, so it's the same
 * for everyone in the same spot, the four others stay on the table to show what
 * you passed up, and a reserve is replacement level, so leaving a position
 * late costs you but never leaves a hole.
 */
export function dailyPack(set: DailySet, captain: number | null, picks: DailyPick[]): DailyPack {
  if (captain != null && picks.length === 0) return { cards: set.captains[SLOTS[captain].pool], reserve: null }

  const filled = new Set(picks.map((p) => p.slot))
  const pack = set.wild[picks.length - (captain != null ? 1 : 0)] ?? []
  const open = SLOTS.filter((_, i) => !filled.has(i))
  if (open.length === 0 || pack.some((c) => open.some((s) => s.pool === c.pos))) return { cards: pack, reserve: null }

  const taken = new Set(picks.map((p) => p.id))
  const openAt = (k: PoolKey) => open.filter((s) => s.pool === k).length
  const need = [...POOL_KEYS].sort((a, b) => openAt(b) - openAt(a))[0]
  const reserve = set.reserves[need].find((c) => !taken.has(c.id))
  if (!reserve) return { cards: pack, reserve: null }
  return { cards: [...pack.slice(0, PACK_SIZE - 1), reserve], reserve: reserve.id }
}

// ============================================================
// Even Mystery Versus
// ============================================================

const evenMysterySets = new Map<string, DailySet>()

/**
 * An Even Mystery's whole deal: eleven wild packs of five positions, laid out up
 * front with no man twice, and a reserve line per position. Both seats open these
 * same packs in the same order, so it's the Daily's deal off a Versus seed: Even's
 * rich table (SHARED_WEIGHTS) and its hidden team, no captain, no traps.
 */
function evenMysterySet(seed: string): DailySet {
  const hit = evenMysterySets.get(seed)
  if (hit) return hit
  const rnd = stream(`even-mystery:${seed}|deal`)
  const used = new Set<string>()
  const pools = Array.from({ length: SLOT_COUNT }, () => wildPools(rnd))
  const wild: Player[][] = pools.map(() => [])

  const packOrder = shuffled(Array.from({ length: SLOT_COUNT }, (_, i) => i), rnd)
  const planted = plantedSeason(rnd).filter((c) => c.score < RARITY_FLOOR.transcendent || rnd() < EVEN_PLANTED_STAR)
  for (const card of planted) {
    const pack = packOrder.find((i) => !wild[i].length)
    if (pack == null) break
    if (!pools[pack].includes(card.pos)) pools[pack][Math.floor(rnd() * PACK_SIZE)] = card.pos
    used.add(personOf(card))
    wild[pack].push(card)
  }
  pools.forEach((list, i) => {
    const needed = [...list]
    const held = wild[i][0]
    if (held) needed.splice(needed.indexOf(held.pos), 1)
    for (const k of needed) drawInto(wild[i], POOL[k], 1, SHARED_WEIGHTS, used, rnd)
  })

  const reserves = {} as DailySet['reserves']
  for (const k of POOL_KEYS) {
    reserves[k] = []
    drawInto(reserves[k], POOL[k], SLOTS.filter((s) => s.pool === k).length, RESERVE_WEIGHTS, used, rnd)
  }
  const set: DailySet = { wild: wild.map((p) => shuffled(p, rnd)), captains: {} as DailySet['captains'], reserves }
  if (evenMysterySets.size >= SET_CACHE_SIZE) evenMysterySets.delete(evenMysterySets.keys().next().value as string)
  evenMysterySets.set(seed, set)
  return set
}

/** The pack an Even Mystery seat is on, given its own picks so far. The same for
    both seats; only the reserve, when nothing fits a seat's open slots, can differ,
    and it's the same card for anyone who needs that position at that pack. */
export function evenMysteryPack(seed: string, picks: { slot: number; id: string }[]): MysteryPack {
  return dailyPack(evenMysterySet(seed), null, picks)
}

// ============================================================
// Mystery Builder
// ============================================================

export type MysteryPack = {
  cards: Player[]
  /** The card swapped in because nothing else fit. */
  reserve: string | null
}

/**
 * The pack a Mystery run is on, given its picks so far.
 *
 * The first is the captain's, dealt exactly like a Classic captain pack. The ten
 * after it are wild: five different positions (wildPools, the Daily's mix), one
 * card from each off Empire Builder's own tables, one of the five off the boosted
 * table, so a card is as likely to be a star as in any Builder pack and the
 * binder can take it. A man already signed never comes back.
 *
 * Which positions a pack holds depends only on the seed and how far in you are,
 * never on what you kept, so planning for what's left is the game. When none of
 * the five fit a slot you still have open, the last card is swapped for a reserve
 * at the position you need most: replacement level, so leaving a position late
 * costs you but never leaves a hole (the Daily's rule).
 */
export function mysteryPack(seed: string, captain: number, picks: { slot: number; id: string }[], versus = false): MysteryPack {
  const ordinary = versus
    ? VERSUS_WEIGHTS
    : seed[9] === MYSTERY_RICH_CAP
      ? MYSTERY_CAP_WEIGHTS
      : { normal: SOLO_WEIGHTS.normal, boosted: SOLO_BOOSTED.normal }
  const taken = picks.map((p) => p.id)
  if (picks.length === 0) {
    const cards = dealPack({ label: `mystery:${seed}`, slot: captain, base: SOLO_WEIGHTS.captain, boosted: SOLO_BOOSTED.captain, exclude: taken })
    return { cards, reserve: null }
  }

  const label = `mystery:${seed}|${picks.length}`
  const head = stream(`${label}|head`)
  const pools = wildPools(head)
  const boostedAt = Math.floor(head() * PACK_SIZE)
  const men = new Set(taken.map(personOfId))
  const draw = (k: PoolKey, table: Weights, lane: () => number): Player | null => {
    const pool = POOL[k]
    const from = sampler(pool, table)
    for (let n = 0; n < LANE_DEPTH; n++) {
      const p = from(lane())
      if (p && !men.has(personOf(p))) return p
    }
    const rest = pool.filter((p) => !men.has(personOf(p)))
    return rest.length ? rest[Math.floor(lane() * rest.length)] : null
  }

  let cards: Player[] = []
  pools.forEach((k, i) => {
    const p = draw(k, i === boostedAt ? ordinary.boosted : ordinary.normal, stream(`${label}|lane${i}`))
    if (!p) return
    men.add(personOf(p))
    cards.push(p)
  })
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(head() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }

  const filled = new Set(picks.map((p) => p.slot))
  const open = SLOTS.filter((_, i) => !filled.has(i))
  if (open.length === 0 || cards.some((c) => open.some((s) => s.pool === c.pos))) return { cards, reserve: null }

  const openAt = (k: PoolKey) => open.filter((s) => s.pool === k).length
  const need = [...POOL_KEYS].sort((a, b) => openAt(b) - openAt(a))[0]
  const reserve = draw(need, RESERVE_WEIGHTS, stream(`${label}|reserve|${need}`))
  if (!reserve) return { cards, reserve: null }
  cards = [...cards.slice(0, PACK_SIZE - 1), reserve]
  return { cards, reserve: reserve.id }
}

/** Where a Mystery pick goes: the captain's slot first, then the first open slot
    at the card's position. -1 when it has nowhere to go. */
export function mysterySlot(captain: number, picks: { slot: number }[], pos: PoolKey): number {
  if (picks.length === 0) return captain
  return slotForCard(pos, new Set(picks.map((p) => p.slot)))
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

/** The star at each position is any dynasty-or-better, all alike. Through the
    sampler anyway, so a pool that gains dynasties doesn't crowd out immortals. */
const ONE_EACH: Weights = { common: 1, rare: 1, dynasty: 1, transcendent: 1, immortal: 1 }

/** How many franchises a Chemistry board is stacked around. */
const MEGA_STACKS = 4

/** On a Chemistry board, how many of each position come off the stacked
    franchises: fifteen of the thirty-six, three or four a franchise, at the
    positions that bond (a quarterback and his receivers, a center and his
    guards). Enough that both seats can build one, few enough to fight over. */
const MEGA_STACK_COUNTS: Record<PoolKey, number> = { QB: 2, RB: 2, WR: 3, TE: 2, OT: 2, OG: 2, C: 2 }

/** The franchises a Chemistry board is stacked around, off the seed alone, so
    every re-deal of it while checking it's fair keeps the same four. */
function megaStacks(seed: string): string[] {
  const rnd = stream(`mega:${seed}|stacks`)
  const teams = [...new Set(POOL.QB.map((p) => p.team).filter(Boolean))].sort()
  const out: string[] = []
  while (out.length < MEGA_STACKS && out.length < teams.length) {
    const t = teams[Math.floor(rnd() * teams.length)]
    if (!out.includes(t)) out.push(t)
  }
  return out
}

/** A board's cards: at least one dynasty-or-better at every position, the
    rest weighted off MEGA_WEIGHTS without replacement. One version of a man
    per board, so the two seats can't both draft him. A Chemistry board takes
    MEGA_STACK_COUNTS of each position off its stacked franchises first, a
    different franchise each time round. */
function megaCards(seed: string, deal: number, stacks: string[] | null = null): Player[] {
  const out: Player[] = []
  for (const k of POOL_KEYS) {
    const rnd = stream(`mega:${seed}|${deal}|${k}`)
    const pool = POOL[k]
    const picked = new Set<string>()
    const want = MEGA_POOL_COUNTS[k]

    const stars = pool.filter((p) => p.rarity === 'dynasty' || p.rarity === 'transcendent' || tableRarity(p.rarity) === 'immortal')
    if (stars.length) {
      const s = sampler(stars, ONE_EACH)(rnd()) as Player
      picked.add(personOf(s))
      out.push(s)
    }

    if (stacks) {
      const from = Math.floor(rnd() * stacks.length)
      for (let i = 0; i < MEGA_STACK_COUNTS[k] && picked.size < want; i++) {
        const team = stacks[(from + i) % stacks.length]
        const avail = pool.filter((p) => p.team === team && !picked.has(personOf(p)))
        const p = avail.length ? sampler(avail, MEGA_WEIGHTS)(rnd()) : null
        if (p) {
          picked.add(personOf(p))
          out.push(p)
        }
      }
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
export function dealMegaBoard(seed: string, format: MegaFormat = 'classic'): Player[] {
  const stacks = format === 'chem' ? megaStacks(seed) : null
  let out = megaCards(seed, 0, stacks)
  let closest = Infinity
  for (let deal = 0; deal < MEGA_MAX_DEALS; deal++) {
    const cards = megaCards(seed, deal, stacks)
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

/**
 * A Mega Draft's budget under a salary cap, in $M, for each seat: a share of
 * what the best eleven on the board would cost. Off the board alone, so it
 * never has to be stored. Set with sim/mega-modes-sim.ts: at 0.55 a seat that
 * takes the top card it can afford runs dry and fills three or four slots for
 * nothing, someone pricing a dollar at 40-70 beats it 60-67% and the plain
 * board reader 51-60%, so the money matters without one trick solving it. At
 * 0.6 it barely binds and pricing loses; at 0.4 half of every lineup is free.
 */
export const MEGA_CAP_SHARE = 0.55

export function megaCap(board: Player[]): number {
  let best = 0
  for (const k of POOL_KEYS) {
    const slots = SLOTS.filter((s) => s.pool === k).length
    best += board
      .filter((p) => p.pos === k)
      .sort((a, b) => b.score - a.score)
      .slice(0, slots)
      .reduce((sum, p) => sum + salaryOf(p), 0)
  }
  return Math.round(best * MEGA_CAP_SHARE)
}

/** A Battles draft's three, off its seed: the same three on every read. */
export function megaBattles(seed: string): string[] {
  const rnd = stream(`mega:${seed}|battles`)
  return drawBattles((n) => Math.floor(rnd() * n))
}

/** How the CPU reads a card on a Mega board: no more than a person could, a
    Range card's midpoint and on Ball Knower a memory of the value (see cpuEye).
    The same read of a card for the whole draft, so it doesn't change its mind
    about a man between picks. */
export function megaRead(seed: string, diff: Difficulty, p: Player): number {
  if (!isBlind(diff)) return p.score
  const u = 2 * stream(`mega-cpu:${seed}|${p.id}`)() - 1
  const { lo, hi } = rangeOf(p)
  return (diff === 'range' ? (lo + hi) / 2 : p.score) * Math.exp(CPU_SKILL[diff].misread * u)
}
