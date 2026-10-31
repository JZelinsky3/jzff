// Empire Builder: dealing a run and re-scoring it. SERVER ONLY.
//
// Versus Challenge plays the exact same draft, so it uses these too; the only
// difference is that a challenge stores the seed it issued against the seat
// it issued it to. An Even Versus goes through here as well: its seed has no
// captain, and its eleven packs are laid out once for both seats.

import { dealPack, evenPacks, readSeed, type SeedInfo } from './deal'
import {
  SLOTS,
  SLOT_COUNT,
  SOLO_BOOSTED,
  SOLO_WEIGHTS,
  chemistryCounts,
  chemistryFor,
  lineupScore,
  tierFor,
  type Chemistry,
  type Difficulty,
  type Player,
} from './rules'

export type SoloPick = { slot: number; id: string }

/** The pack a slot deals, given what is already on the roster. */
export function soloPack(seed: string, captain: number, slot: number, taken: Iterable<string>): Player[] {
  const isCaptain = slot === captain
  return dealPack({
    label: `solo:${seed}`,
    slot,
    base: isCaptain ? SOLO_WEIGHTS.captain : SOLO_WEIGHTS.normal,
    boosted: isCaptain ? SOLO_BOOSTED.captain : SOLO_BOOSTED.normal,
    exclude: taken,
  })
}

/** The pack any seed deals for a slot: the one thing the deal route and every
    replay need to agree on. An Even pack is fixed, so `taken` doesn't touch it. */
export function seedPack(seed: string, info: SeedInfo, slot: number, taken: Iterable<string>): Player[] {
  if (info.even || info.captain == null) return evenPacks(seed)[slot] ?? []
  return soloPack(seed, info.captain, slot, taken)
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
      /** Every pack as it was dealt, in the order it was opened: what the
          binder records. */
      packs: { slot: number; cards: Player[]; kept: string }[]
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
  const packs: { slot: number; cards: Player[]; kept: string }[] = []

  for (const pick of picks) {
    if (seen.has(pick.slot)) return { ok: false, error: 'A slot was filled twice.' }
    seen.add(pick.slot)
    const pack = seedPack(seed, parsed, pick.slot, taken)
    const card = pack.find((p) => p.id === pick.id)
    if (!card) return { ok: false, error: `The ${SLOTS[pick.slot].label.toLowerCase()} pick is not in that pack.` }
    lineup[pick.slot] = card
    taken.push(card.id)
    packs.push({ slot: pick.slot, cards: pack, kept: card.id })
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
    packs,
  }
}

/** What a board row and a share card print. */
export function soloDisplay(score: number) {
  return { accolades: score, tier: tierFor(score).label }
}
