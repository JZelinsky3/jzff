// Signatures: what the top of the game does beyond its number. Plain data, so a card's
// sheet, the table and the engine all read the same list.
//
// Past Dynasty, more Power Level alone stops being interesting, so every Transcendent,
// Immortal and Canton carries one thing of its own. It comes off the card's rarity and
// position, so a thousand cards still need no rule of their own, and it follows the same
// shape as everything else on the table: none of these is a flat number on a lane, each
// one scales with what's around it or changes what the other side does next.
//
// Three kinds, by rarity. A Transcendent does something when it arrives or with who's
// beside it. An Immortal bends the whole table. A Canton is the same for all of them.
// A card only uses its signature lined up: stacked, it adds its PL and nothing else.

import type { PoolKey, Rarity } from '../rules'

export type SigId =
  | 'quick-release'
  | 'bell-cow'
  | 'deep-threat'
  | 'mismatch'
  | 'road-grader'
  | 'franchise'
  | 'dual-threat'
  | 'double-coverage'
  | 'seam-buster'
  | 'the-wall'
  | 'gold-jacket'

export type Signature = { id: SigId; title: string; line: string }

type Group = 'QB' | 'RB' | 'WR' | 'TE' | 'OL'

const GROUP: Record<PoolKey, Group> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OT: 'OL', OG: 'OL', C: 'OL' }

const GOLD_JACKET: Signature = { id: 'gold-jacket', title: 'Gold Jacket', line: 'Adds 2 to every teammate in its lane and 2 to each of your other lanes.' }

export const SIGNATURES: Partial<Record<Rarity, Record<Group, Signature>>> = {
  transcendent: {
    QB: { id: 'quick-release', title: 'Quick Release', line: 'When it comes in, draw 2 more cards next drive.' },
    RB: { id: 'bell-cow', title: 'Bell Cow', line: 'Adds 3 for every lineman in its lane.' },
    WR: { id: 'deep-threat', title: 'Deep Threat', line: "When it comes in, they can't play in its lane next drive." },
    TE: { id: 'mismatch', title: 'Mismatch', line: 'Counts as a WR and a lineman for formations and goals.' },
    OL: { id: 'road-grader', title: 'Road Grader', line: 'Adds 2 for every ball carrier in its lane, not 1.' },
  },
  immortal: {
    QB: { id: 'franchise', title: 'Franchise', line: 'Adds 1 to every ball carrier in your other lanes.' },
    RB: { id: 'dual-threat', title: 'Dual Threat', line: "Also adds a third of its PL to Ground or Short, whichever it isn't on." },
    WR: { id: 'double-coverage', title: 'Double Coverage', line: 'At the end, their cards in its lane lose 1 each.' },
    TE: { id: 'seam-buster', title: 'Seam Buster', line: 'Adds 3 to every teammate in its lane.' },
    OL: { id: 'the-wall', title: 'The Wall', line: 'Adds 3 for every ball carrier in its lane, not 1. Nothing takes points off it, and no card leaves it.' },
  },
  canton: { QB: GOLD_JACKET, RB: GOLD_JACKET, WR: GOLD_JACKET, TE: GOLD_JACKET, OL: GOLD_JACKET },
}

export const signatureOf = (card: { pos: PoolKey; rarity: Rarity }): Signature | null => SIGNATURES[card.rarity]?.[GROUP[card.pos]] ?? null
