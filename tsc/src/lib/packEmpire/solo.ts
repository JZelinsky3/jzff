// Empire Builder: dealing a run and re-scoring it. SERVER ONLY.
//
// Versus Challenge plays the exact same draft, so it uses these too; the only
// difference is that a challenge stores the seed it issued against the seat
// it issued it to. An Even Versus goes through here as well: its seed has no
// captain, and its eleven packs are laid out once for both seats.

import { dealPack, evenPacks, mysteryPack, mysterySlot, priced, readSeed, type SeedInfo } from './deal'
import {
  SALARY_CAP,
  SLOTS,
  SLOT_COUNT,
  SOLO_BOOSTED,
  SOLO_WEIGHTS,
  VERSUS_WEIGHTS,
  chemistryCounts,
  chemistryFor,
  lineupScore,
  signingPrice,
  tierFor,
  type Chemistry,
  type Difficulty,
  type Player,
} from './rules'

export type SoloPick = { slot: number; id: string }

/** The pack a slot deals, given what is already on the roster. `versus` is a Classic
    Versus seat, whose ordinary packs are richer than a Builder run's. */
export function soloPack(seed: string, captain: number, slot: number, taken: Iterable<string>, versus = false): Player[] {
  const isCaptain = slot === captain
  const ordinary = versus ? VERSUS_WEIGHTS : { normal: SOLO_WEIGHTS.normal, boosted: SOLO_BOOSTED.normal }
  return dealPack({
    label: `solo:${seed}`,
    slot,
    base: isCaptain ? SOLO_WEIGHTS.captain : ordinary.normal,
    boosted: isCaptain ? SOLO_BOOSTED.captain : ordinary.boosted,
    exclude: taken,
  })
}

/** The pack any seed deals for a slot: the one thing the deal route and every
    replay need to agree on. An Even pack is fixed, so `taken` doesn't touch it. */
export function seedPack(seed: string, info: SeedInfo, slot: number, taken: Iterable<string>): Player[] {
  if (info.even || info.captain == null) return evenPacks(seed)[slot] ?? []
  return soloPack(seed, info.captain, slot, taken, info.versus)
}

/**
 * The pack a pick came out of, given the picks before it, and whether the slot it
 * claims is the one it has to go to. Classic: the slot's own pack, any order.
 * Mystery: the next pack in line, and the card takes the first open slot at its
 * position (the captain pack's goes to the captain).
 */
export function pickPack(seed: string, info: SeedInfo, before: SoloPick[], pick: SoloPick): { pack: Player[]; reserve: string | null; fits: boolean } {
  if (!info.mystery || info.captain == null) {
    return { pack: seedPack(seed, info, pick.slot, before.map((p) => p.id)), reserve: null, fits: true }
  }
  const { cards, reserve } = mysteryPack(seed, info.captain, before, info.versus)
  const card = cards.find((c) => c.id === pick.id)
  return { pack: cards, reserve, fits: !!card && mysterySlot(info.captain, before, card.pos) === pick.slot }
}

/** What a Mystery cap run can pay: only cards with a slot to go to count. */
function usableIn(info: SeedInfo, before: SoloPick[], pack: Player[]): Player[] {
  if (!info.mystery || info.captain == null) return pack
  const captain = info.captain
  return pack.filter((c) => mysterySlot(captain, before, c.pos) >= 0)
}

export function parseSoloPicks(raw: unknown): SoloPick[] | null {
  if (!Array.isArray(raw) || raw.length !== SLOT_COUNT) return null
  const out: SoloPick[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const { slot, id } = item as Record<string, unknown>
    if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= SLOT_COUNT) return null
    if (typeof id !== 'string' || id.length > 40) return null
    out.push({ slot: slot as number, id })
  }
  return out
}

export type SoloReplay =
  | {
      ok: true
      lineup: Player[]
      /** Cards plus chemistry, where chemistry counts. */
      score: number
      /** The cards alone. */
      base: number
      /** Null on a run that doesn't play for it. */
      chem: Chemistry | null
      captain: number | null
      diff: Difficulty
      even: boolean
      /** A Classic Versus seat, on richer packs: never a run for the board. */
      versus: boolean
      /** Under a salary cap, what the eleven cost. */
      spent: number
      /** A Mystery run. */
      mystery: boolean
      /** Every pack as it was dealt, in the order it was opened: what the
          binder records. `reserve` on a Mystery pack nothing else fit. */
      packs: { slot: number; cards: Player[]; kept: string; reserve?: string | null }[]
    }
  | { ok: false; error: string }

/**
 * Re-deal every pack in the order it was opened and check each pick was in
 * the pack it claims to come from. The score is derived here, never read.
 */
export function replaySolo(seed: string, picks: SoloPick[]): SoloReplay {
  const parsed = readSeed(seed)
  if (!parsed) return { ok: false, error: 'That run was not dealt here.' }

  const seen = new Set<number>()
  const lineup: (Player | null)[] = Array(SLOT_COUNT).fill(null)
  const taken: string[] = []
  const packs: { slot: number; cards: Player[]; kept: string; reserve?: string | null }[] = []
  const done: SoloPick[] = []
  const budget: number = parsed.even ? SALARY_CAP.shared : SALARY_CAP.own
  let left = budget

  for (const pick of picks) {
    if (seen.has(pick.slot)) return { ok: false, error: 'A slot was filled twice.' }
    seen.add(pick.slot)
    const { pack, reserve, fits } = pickPack(seed, parsed, done, pick)
    const card = pack.find((p) => p.id === pick.id)
    if (!card) return { ok: false, error: `The ${SLOTS[pick.slot].label.toLowerCase()} pick is not in that pack.` }
    if (!fits) return { ok: false, error: 'That pick went in the wrong slot.' }
    if (parsed.diff === 'cap') {
      const price = signingPrice(priced(card), usableIn(parsed, done, pack).map(priced), left)
      if (price == null) return { ok: false, error: 'That lineup is over the cap.' }
      left -= price
    }
    lineup[pick.slot] = card
    taken.push(card.id)
    done.push(pick)
    packs.push({ slot: pick.slot, cards: pack, kept: card.id, ...(parsed.mystery ? { reserve } : {}) })
  }

  if (lineup.some((p) => !p)) return { ok: false, error: 'The lineup is not complete.' }
  const full = lineup as Player[]
  const base = lineupScore(full)
  const chem = chemistryCounts(parsed.diff, parsed.even) ? chemistryFor(full, true) : null
  return {
    ok: true,
    lineup: full,
    score: base + (chem?.total ?? 0),
    base,
    chem,
    captain: parsed.captain,
    diff: parsed.diff,
    even: parsed.even,
    versus: parsed.versus,
    mystery: parsed.mystery,
    spent: budget - left,
    packs,
  }
}

/** What a board row and a share card print. */
export function soloDisplay(score: number) {
  return { accolades: score, tier: tierFor(score).label }
}
