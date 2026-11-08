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

/** A win is more than the line: a game that lands on it goes to overtime first
    (seasonSim), so it never ends level. */
export const beatsLine = (points: number, line: number) => points > line

export function rewardFor(points: number, line: number): RewardTier {
  if (points >= line + BIG_WIN) return 'rising'
  if (beatsLine(points, line)) return 'starter'
  return 'league'
}

export const REWARD_LOOK: Record<RewardTier, { label: string; color: string; line: string }> = {
  league: { label: 'League Pack', color: RARITY_LOOK.rare.color, line: 'A loss still pays a pack.' },
  starter: { label: 'Starter Pack', color: '#42c0f8', line: 'A win pays a Starter Pack.' },
  rising: { label: 'Rising Pack', color: '#ffd700', line: `A win by ${BIG_WIN} or more pays a Rising Pack.` },
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

// ============================================================
// Game plans: the call before each game
// ============================================================

/**
 * What you focus on this game (Joey, 2026-11-07: "lets focus on x this game";
 * it might not work, and it works more often with the players for it). A focus
 * leans the play calling its way and rolls once before kickoff: it clicks, and
 * that part of the offense takes off, or it doesn't, and you've leaned into a
 * wall. How often it clicks depends on how many of your starters fit it and on
 * whether this defense gives that up. Balanced never rolls: steady, no ceiling.
 */
export type GamePlan = 'balanced' | 'ground' | 'quick' | 'air' | 'finish'

export const GAME_PLANS: GamePlan[] = ['balanced', 'ground', 'quick', 'air', 'finish']

export const PLAN_LOOK: Record<GamePlan, { name: string; short: string; line: string }> = {
  balanced: { name: 'Balanced', short: 'Balanced', line: 'Take what they give. No roll, no swing.' },
  ground: { name: 'Pound The Rock', short: 'Run It', line: 'Lean on the run. Bell Cows and Road Graders make it work.' },
  quick: { name: 'Quick Game', short: 'Quick', line: 'Short, fast throws. Surgeons and Possession receivers make it work.' },
  air: { name: 'Air It Out', short: 'Deep', line: 'Shots downfield. Gunslingers and Deep Threats make it work.' },
  finish: { name: 'Finish Drives', short: 'Red Zone', line: 'Touchdowns, not field goals. Goal Line Backs and Red Zone Targets make it work.' },
}

/** Every archetype in a few letters, for the game card's matchup marks. */
export const ARCH_ABBR: Record<string, string> = {
  Gunslinger: 'GUN',
  Surgeon: 'SRG',
  'Dual Threat': 'DUAL',
  'Bell Cow': 'COW',
  'Receiving Back': 'RCV',
  'Goal Line Back': 'GLB',
  'Deep Threat': 'DPT',
  Possession: 'POS',
  'Red Zone Target': 'RZT',
  'Seam Stretcher': 'SEAM',
  'Safety Valve': 'SFV',
  'Blocking TE': 'BLK',
  'Road Grader': 'GRD',
  'Pass Protector': 'PRO',
  Anchor: 'ANC',
}

/**
 * Draft Day's grade, off the eleven's card value against every draft in
 * sim/season-sim.ts (the biggest card in every pack): A+ the top 5%, A the
 * next 10, B the next 20, C the middle 30, D the next 20, F the bottom 15.
 */
export const DRAFT_GRADES: { grade: string; min: number; line: string }[] = [
  { grade: 'A+', min: 21900, line: 'A haul. Better than 95% of drafts.' },
  { grade: 'A', min: 20100, line: 'A great draft. Better than 85% of them.' },
  { grade: 'B', min: 18700, line: 'A good draft. Better than most.' },
  { grade: 'C', min: 17200, line: 'Right in the middle of the pack.' },
  { grade: 'D', min: 16100, line: 'The packs ran cold. Your bench will matter.' },
  { grade: 'F', min: 0, line: 'A rough day. Every game pack is a chance to fix it.' },
]

export function draftGrade(value: number): { grade: string; line: string } {
  return DRAFT_GRADES.find((g) => value >= g.min) ?? DRAFT_GRADES[DRAFT_GRADES.length - 1]
}

// ============================================================
// A game's pack: a focus before it's opened
// ============================================================

/** Before opening a game's pack you can point it at a play style or a position
    (Joey, 2026-11-07: one or the other, never both). Two or three of its five
    cards then fit; the rest are any position. */
export type PackStyle = 'run' | 'short' | 'deep' | 'redZone'
export const FOCUS_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C'] as const
export type FocusPos = (typeof FOCUS_POSITIONS)[number]
export type PackFocus = { kind: 'style'; style: PackStyle } | { kind: 'pos'; pos: FocusPos }

export const STYLE_LOOK: Record<PackStyle, { name: string; plan: GamePlan }> = {
  run: { name: 'Run Game', plan: 'ground' },
  short: { name: 'Short Passes', plan: 'quick' },
  deep: { name: 'Deep Passes', plan: 'air' },
  redZone: { name: 'Red Zone', plan: 'finish' },
}

export function cleanFocus(raw: unknown): PackFocus | null {
  const f = raw as Partial<{ kind: string; style: string; pos: string }> | null
  if (f?.kind === 'style' && f.style && f.style in STYLE_LOOK) return { kind: 'style', style: f.style as PackStyle }
  if (f?.kind === 'pos' && (FOCUS_POSITIONS as readonly string[]).includes(f.pos ?? '')) return { kind: 'pos', pos: f.pos as FocusPos }
  return null
}

// ============================================================
// The offseason: keepers and the Standings Pack
// ============================================================

/**
 * Keepers carry over into the next season (Joey, 2026-11-07: one to three). A
 * budget, not a count: an Immortal (or a Canton) takes all three points, a
 * Transcendent two, anyone else one. So it's one superstar, a star and a
 * starter, or three good players: a real choice, not "keep two".
 */
export const KEEPER_BUDGET = 3
export const keeperCost = (rarity: string): number => (rarity === 'immortal' || rarity === 'canton' ? 3 : rarity === 'transcendent' ? 2 : 1)
/** A man can be kept two seasons running; after that he goes back in the pool. */
export const KEEP_YEARS = 2

export type StandingsTier = 'standard_pack' | 'rising_pack' | 'prime_pack' | 'elite_drop'

/**
 * The Standings Pack a finish buys for next season's Draft Day, worst finish
 * best pack (Joey: finishing well still gets a better pack than an ordinary
 * one). Top third a Starter Pack, the middle a Rising Pack, the bottom third a
 * Prime Pack, the bottom sixth (last place at least) an Elite Drop.
 */
export function standingsTierFor(rank: number, teams: number): StandingsTier {
  if (rank > teams - Math.max(1, Math.floor(teams / 6))) return 'elite_drop'
  if (rank > (teams * 2) / 3) return 'prime_pack'
  if (rank > teams / 3) return 'rising_pack'
  return 'standard_pack'
}
