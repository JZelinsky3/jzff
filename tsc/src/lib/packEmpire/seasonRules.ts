// League Mode's Season variation: the numbers and words the pages and the server
// share. Import-free (types aside), so a client component can read it without
// pulling in the card stats the sim runs on.

import { RARITY_LOOK } from './rules'

/** Wild packs opened after the eleven on Draft Day, one card kept from each. */
export const BENCH_PACKS = 3
/** A bench holds this many. A full bench lets one go to keep a new card. */
export const BENCH_MAX = 6

export const SEASON_SIZES = [4, 6, 8, 10, 12]

/** Any number of teams from two up to the whole league can make it (Joey). */
export function seasonPlayoffOptions(teams: number): number[] {
  return Array.from({ length: Math.max(0, teams - 1) }, (_, i) => i + 2)
}

export function defaultPlayoffs(teams: number): number {
  return teams >= 12 ? 6 : Math.max(2, Math.floor(teams / 2))
}

/** The pack a game pays, by how it went: every game pays one, so a slow start
    still gets better (season-sim.ts: paying winners only, or paying too well,
    left nobody coming back from 0-2). */
export type RewardTier = 'league' | 'starter' | 'rising'

/** Clear the line by this many and the pack is a step better. */
export const BIG_WIN = 10

export function rewardFor(points: number, line: number): RewardTier {
  if (points >= line + BIG_WIN) return 'rising'
  if (points >= line) return 'starter'
  return 'league'
}

export const REWARD_LOOK: Record<RewardTier, { label: string; color: string; line: string }> = {
  league: { label: 'League Pack', color: RARITY_LOOK.rare.color, line: 'A loss still pays a pack.' },
  starter: { label: 'Starter Pack', color: '#42c0f8', line: 'For clearing the line.' },
  rising: { label: 'Rising Pack', color: '#ffd700', line: `For clearing it by ${BIG_WIN} or more.` },
}

/** Rounds a bracket of n teams takes: byes fill it to a power of two. */
export function playoffRounds(n: number): number {
  return n <= 1 ? 0 : Math.ceil(Math.log2(n))
}

export function roundName(round: number, rounds: number): string {
  const left = rounds - round
  if (left === 0) return 'The Final'
  if (left === 1) return 'Semifinals'
  if (left === 2) return 'Quarterfinals'
  return `Round ${round}`
}

/** Seeds in bracket order for a field filled out to `size` (a power of two):
    1 meets the lowest, and 1 and 2 can only meet in the Final. */
export function bracketOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const n = order.length * 2
    order = order.flatMap((s) => [s, n + 1 - s])
  }
  return order
}
