// Re-scoring a submitted run, server-side.
//
// The client posts the seed it played and the CHOICES it made. It never
// posts a score. This module re-deals that seed through the same dealer the
// game itself used, replays the choices against it, and derives the number
// that goes on the board. Every game is deterministic from its seed
// specifically so this is possible — that was designed in from Roulette
// onward, before there was any leaderboard to need it.
//
// What this does NOT defend against, stated plainly: Roulette hands the
// player all nine squads at once, so a determined cheat could compute the
// best lineup for their seed outside the browser and post that. Nothing
// short of dealing one spin at a time closes it, which would wreck the game.
// The unique index on (board, seed, user) at least caps it at one posted run
// per wheel, so it cannot be ground into a whole page of the board.

import { dealGame } from './deal'
import { recordFor, GAMES, type Benchmark } from './record'
import { SLOTS, REROLLS, type SlotId } from './roulette'
import type { GameId, RunDisplay } from './leaderboard'

export type VerifiedRun = {
  score: number
  rateNum: number
  rateDen: number
  display: RunDisplay
  /** Normalised choices, stored so any row can be re-verified later. */
  detail: unknown
}

export type VerifyResult =
  | ({ ok: true } & VerifiedRun)
  | { ok: false; error: string; status: number }

const round1 = (n: number) => Math.round(n * 10) / 10

// ============================================================
// Roster Roulette
// ============================================================

/**
 * One pick: the spin it came off, which player on that squad, and the slot
 * he was set in.
 *
 * The player is an INDEX into the squad's player list rather than a name or
 * an id, because `playerId` is null for anyone Sleeper has no record of and
 * names repeat. The list is ordered by `sortSquadPlayers` on both sides, so
 * the index means the same thing here as it did in the browser.
 */
type RoulettePick = { spin: number; player: number; slot: SlotId }

function parseRoulettePicks(raw: unknown): RoulettePick[] | null {
  if (!Array.isArray(raw)) return null
  const out: RoulettePick[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const { spin, player, slot } = item as Record<string, unknown>
    if (!Number.isInteger(spin) || (spin as number) < 0) return null
    if (!Number.isInteger(player) || (player as number) < 0) return null
    if (typeof slot !== 'string') return null
    out.push({ spin: spin as number, player: player as number, slot: slot as SlotId })
  }
  return out
}

async function verifyRoulette(
  poolId: string,
  seed: string,
  raw: unknown
): Promise<VerifyResult> {
  const picks = parseRoulettePicks(raw)
  if (!picks) return { ok: false, status: 400, error: 'Malformed run.' }
  if (picks.length !== SLOTS.length) {
    return { ok: false, status: 400, error: 'That run does not fill a lineup.' }
  }

  const deal = await dealGame(poolId, seed)
  if (!deal.ok) return { ok: false, status: deal.status, error: deal.error }

  // Spins are taken in order, and a skipped spin is a reroll. Requiring the
  // order to be strictly increasing is what makes the skip count meaningful:
  // without it a run could claim to have picked off spin 7 before spin 2.
  const ordered = [...picks].sort((a, b) => a.spin - b.spin)
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].spin === ordered[i - 1].spin) {
      return { ok: false, status: 400, error: 'Two picks off one spin.' }
    }
  }
  const lastSpin = ordered[ordered.length - 1].spin
  if (lastSpin >= deal.spins.length) {
    return { ok: false, status: 400, error: 'That run used a spin this wheel never dealt.' }
  }
  const rerollsUsed = lastSpin + 1 - ordered.length
  if (rerollsUsed > REROLLS) {
    return { ok: false, status: 400, error: 'That run used more rerolls than the wheel allows.' }
  }

  const usedSlots = new Set<string>()
  let ppg = 0
  let total = 0
  const detail: unknown[] = []

  for (const pick of ordered) {
    const squad = deal.spins[pick.spin]
    const def = SLOTS.find((s) => s.id === pick.slot)
    if (!def) return { ok: false, status: 400, error: 'That run used a slot the game has not got.' }
    if (usedSlots.has(def.id)) {
      return { ok: false, status: 400, error: 'That run filled one slot twice.' }
    }
    const player = squad.players[pick.player]
    if (!player) {
      return { ok: false, status: 400, error: 'That run took a player who was not on that squad.' }
    }
    if (!def.accepts.includes(player.pos)) {
      return { ok: false, status: 400, error: `A ${player.pos} cannot fill ${def.label}.` }
    }
    usedSlots.add(def.id)
    ppg += player.ppg
    total += player.fpts
    detail.push({
      slot: def.id,
      spin: pick.spin,
      player: pick.player,
      name: player.name,
      pos: player.pos,
      ppg: round1(player.ppg),
      squad: `${squad.year} ${squad.teamName?.trim() || squad.managerName}`,
    })
  }

  const benchmark: Benchmark | null = deal.benchmark
  if (!benchmark) {
    // No benchmark means no record, and a board of bare PPG across two
    // scoring profiles would be nonsense. Better to refuse the post than to
    // rank numbers that don't compare.
    return { ok: false, status: 409, error: 'This wheel is not being scored right now.' }
  }
  const wins = recordFor(ppg, benchmark)

  return {
    ok: true,
    // PPG, not wins: the record is derived from it linearly so they order
    // identically, and PPG separates two 17-0s that the record cannot.
    score: round1(ppg),
    rateNum: wins,
    rateDen: GAMES,
    display: { record: `${wins}-${GAMES - wins}`, ppg: round1(ppg) },
    detail: { picks: detail, seasonPts: Math.round(total) },
  }
}

// ============================================================
// The registry
// ============================================================

/**
 * Games are added here as their boards are wired. A game with no verifier
 * refuses the post rather than trusting the browser for a number, which is
 * the whole point of the endpoint.
 */
export async function verifyRun(
  game: GameId,
  poolId: string,
  seed: string,
  picks: unknown
): Promise<VerifyResult> {
  switch (game) {
    case 'roulette':
      return verifyRoulette(poolId, seed, picks)
    default:
      return { ok: false, status: 501, error: 'That game has no leaderboard yet.' }
  }
}
