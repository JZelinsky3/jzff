// Play calls: the cards in a Field General deck that aren't men. Plain data, so a
// deck, the browser and the engine can all read the same list.
//
// You don't pull these. Every player has the whole playbook, and a deck picks a few
// of them to sit in a pile of their own beside its men. You hold one at a time: the
// next comes up once you've run the last, unless a goal hands you a spare. A call is
// paid for out of the drive's cap room, like a man.
//
// A call is never just points. A flat +5 in a lane is only another man, with worse
// art. Each one here either changes what happens next or scales with the table, so
// it's a decision made against the other side, not a number added to a lane. Each one's
// price comes off a sim: one copy against a deck with none is worth 54 to 65% for a
// real card. Cap alone isn't worth much, since you run out of cards first, which is
// why nothing here simply gives you more of it. The
// ones marked `ongoing` stay on the field: they sit in front of the lane where both
// sides can see them, and they're tallied once, at the end of the game, off who's in
// that lane by then. So a Blitz on the second drive tells the other side where not
// to go, and that's half of what it does.

import type { PoolKey } from '../rules'

export type CallEffect =
  /** Draw this many more cards for next drive. */
  | { kind: 'draw'; n: number }
  /** This much less cap room for them next drive. */
  | { kind: 'ice'; n: number }
  /** Counts as meeting an open goal, or draws a card if there isn't one. */
  | { kind: 'goal' }
  /** They can't play in the lane you aim it at next drive. */
  | { kind: 'close' }
  /** All your unspent cap room carries, what came in with it too. */
  | { kind: 'keep' }
  /** Moves one of your men to another lane. */
  | { kind: 'move' }
  /** Sends the last man they put in a lane back to their hand. */
  | { kind: 'turnover' }
  /** At the end, takes this many off their lane for every man in it. */
  | { kind: 'blitz'; each: number }
  /** At the end, adds this many to your lane for every man of these positions in it. */
  | { kind: 'boost'; each: number; pos: PoolKey[] }
  /** At the end, you take this lane if you're within this many of them. */
  | { kind: 'stand'; within: number }

export type FgCall = {
  id: string
  title: string
  line: string
  cost: number
  does: CallEffect
  /** Whose lane you point it at, if you point it at one. */
  aim?: 'yours' | 'theirs'
  /** Stays on the field and tallies at the end. */
  ongoing?: boolean
}

export const CALL_PREFIX = 'call:'

export const CALLS: FgCall[] = [
  { id: 'call:film-study', title: 'Film Study', line: 'Draw 3 cards.', cost: 2, does: { kind: 'draw', n: 3 } },
  { id: 'call:ice-the-kicker', title: 'Ice The Kicker', line: 'They get 4 less cap next drive.', cost: 1, does: { kind: 'ice', n: 4 } },
  { id: 'call:game-plan', title: 'Game Plan', line: 'Meet an open goal. None open? Draw a card.', cost: 1, does: { kind: 'goal' } },
  { id: 'call:spike-it', title: 'Spike It', line: 'Keep all your unspent cap for next drive.', cost: 0, does: { kind: 'keep' } },
  { id: 'call:hard-count', title: 'Hard Count', line: "They can't play in a lane next drive.", cost: 1, does: { kind: 'close' }, aim: 'theirs' },
  { id: 'call:audible', title: 'Audible', line: 'Move one of your cards to another lane.', cost: 2, does: { kind: 'move' }, aim: 'yours' },
  { id: 'call:turnover', title: 'Turnover', line: 'The last card they put in a lane goes back to their hand.', cost: 3, does: { kind: 'turnover' }, aim: 'theirs' },
  { id: 'call:blitz', title: 'Blitz', line: 'At the end, their lane loses 1 for every card in it.', cost: 2, does: { kind: 'blitz', each: 1 }, aim: 'theirs', ongoing: true },
  { id: 'call:max-protect', title: 'Max Protect', line: 'At the end, your lane gains 3 for every lineman in it.', cost: 2, does: { kind: 'boost', each: 3, pos: ['OT', 'OG', 'C'] }, aim: 'yours', ongoing: true },
  { id: 'call:hot-route', title: 'Hot Route', line: 'At the end, your lane gains 3 for every WR and TE in it.', cost: 2, does: { kind: 'boost', each: 3, pos: ['WR', 'TE'] }, aim: 'yours', ongoing: true },
  { id: 'call:goal-line-stand', title: 'Goal Line Stand', line: 'At the end, you take your lane if you are within 3.', cost: 2, does: { kind: 'stand', within: 3 }, aim: 'yours', ongoing: true },
]

const BY_ID = new Map(CALLS.map((c) => [c.id, c]))

export const callOf = (id: string): FgCall | null => BY_ID.get(id) ?? null

/** What a deck plays with until someone picks their own. */
export const DEFAULT_CALLS = ['call:film-study', 'call:blitz', 'call:max-protect']
