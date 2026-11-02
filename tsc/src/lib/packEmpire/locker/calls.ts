// Play calls: the cards in a Field General deck that aren't men. Plain data, so a
// deck, the browser and the engine can all read the same list.
//
// You don't pull these. Every player has the whole playbook, and a deck picks a few
// of them to shuffle in on top of its men, which keeps packs and the pool as they
// are. A call is paid for out of the drive's cap room, like a man, and what it does
// lives in `does`, so the engine only has to know the kinds below.

export type CallEffect =
  /** Draw this many more for next drive. */
  | { kind: 'draw'; n: number }
  /** This much more cap room next drive. */
  | { kind: 'cap'; n: number }
  /** This many points in the lane you aim it at, or in `lane` if it names one. */
  | { kind: 'lane'; n: number; lane?: 0 | 1 | 2 }
  /** This many points in every lane. */
  | { kind: 'every'; n: number }
  /** Takes this many off their lane for every man they have in it. */
  | { kind: 'blitz'; each: number }
  /** Counts as meeting this drive's goal. */
  | { kind: 'goal' }
  /** They can't play in the lane you aim it at next drive. */
  | { kind: 'close' }
  /** All your unspent cap room carries, what came in with it too. */
  | { kind: 'keep' }

export type FgCall = {
  id: string
  title: string
  line: string
  cost: number
  does: CallEffect
  /** Whether you point it at a lane. */
  aimed?: boolean
  lastDriveOnly?: boolean
}

export const CALL_PREFIX = 'call:'

export const CALLS: FgCall[] = [
  { id: 'call:film-study', title: 'Film Study', line: 'Draw 2 cards.', cost: 1, does: { kind: 'draw', n: 2 } },
  { id: 'call:timeout', title: 'Timeout', line: '+3 cap room next drive.', cost: 1, does: { kind: 'cap', n: 3 } },
  { id: 'call:flea-flicker', title: 'Flea Flicker', line: '+5 in a lane.', cost: 2, does: { kind: 'lane', n: 5 }, aimed: true },
  { id: 'call:blitz', title: 'Blitz', line: 'Their lane loses 2 for every man in it.', cost: 2, does: { kind: 'blitz', each: 2 }, aimed: true },
  { id: 'call:game-plan', title: 'Game Plan', line: 'You meet this drive\'s goal.', cost: 1, does: { kind: 'goal' } },
  { id: 'call:hard-count', title: 'Hard Count', line: 'They can\'t play in a lane next drive.', cost: 2, does: { kind: 'close' }, aimed: true },
  { id: 'call:spread', title: 'Spread Offense', line: '+2 in every lane.', cost: 3, does: { kind: 'every', n: 2 } },
  { id: 'call:hail-mary', title: 'Hail Mary', line: '+9 Deep. Last drive only.', cost: 3, does: { kind: 'lane', n: 9, lane: 2 }, lastDriveOnly: true },
  { id: 'call:spike-it', title: 'Spike It', line: 'Keep all your unspent cap for next drive.', cost: 0, does: { kind: 'keep' } },
]

const BY_ID = new Map(CALLS.map((c) => [c.id, c]))

export const callOf = (id: string): FgCall | null => BY_ID.get(id) ?? null

/** What a deck plays with until someone picks their own. */
export const DEFAULT_CALLS = ['call:film-study', 'call:flea-flicker', 'call:blitz']
