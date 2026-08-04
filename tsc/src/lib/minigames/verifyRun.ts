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
import { dealMultiverse } from './multiverseDeal'
import {
  SLOTS as MV_SLOTS,
  WEEKS as MV_WEEKS,
  PLAYOFF_LINE as MV_PLAYOFF_LINE,
  PLAYOFF_ROUNDS as MV_PLAYOFF_ROUNDS,
  PLAYOFF_ROUND_NAMES as MV_PLAYOFF_ROUND_NAMES,
  weekScore as mvWeekScore,
  playoffScore as mvPlayoffScore,
  playoffField as mvPlayoffField,
  rankScore as mvRankScore,
  type MvCard,
} from './multiverse'
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
// The Multiverse Draft
// ============================================================

/**
 * A submitted season: which card was taken in each round, and how many
 * postseason games were played.
 *
 * Cards are INDEXES into that round's five, and slots are not posted at all,
 * because slot assignment is not a choice — the board fills the most
 * restrictive open slot a card fits and this replays that same rule. Anything
 * a player cannot decide should not be in the payload, or it becomes another
 * thing a forged run gets to lie about.
 */
type MultiversePicks = { cards: number[]; playoffs: number }

function parseMultiversePicks(raw: unknown): MultiversePicks | null {
  if (!raw || typeof raw !== 'object') return null
  const { cards, playoffs } = raw as Record<string, unknown>
  if (!Array.isArray(cards)) return null
  if (!Number.isInteger(playoffs) || (playoffs as number) < 0) return null
  const out: number[] = []
  for (const c of cards) {
    if (!Number.isInteger(c) || (c as number) < 0) return null
    out.push(c as number)
  }
  return { cards: out, playoffs: playoffs as number }
}

async function verifyMultiverse(
  poolId: string,
  seed: string,
  raw: unknown
): Promise<VerifyResult> {
  const picks = parseMultiversePicks(raw)
  if (!picks) return { ok: false, status: 400, error: 'Malformed run.' }

  const deal = await dealMultiverse(poolId, seed)
  if (!deal.ok) return { ok: false, status: deal.status, error: deal.error }

  if (picks.cards.length !== deal.rounds.length) {
    return { ok: false, status: 400, error: 'That run does not fill a roster.' }
  }

  // Replay the draft under the board's own rules.
  const roster: (MvCard | null)[] = MV_SLOTS.map(() => null)
  for (let r = 0; r < picks.cards.length; r++) {
    const card = deal.rounds[r].cards[picks.cards[r]]
    if (!card) return { ok: false, status: 400, error: 'That run took a card off a round that never dealt it.' }
    const open = MV_SLOTS.map((_, i) => i).filter((i) => roster[i] === null)
    const legal = open.filter((i) => MV_SLOTS[i].accepts.includes(card.pos))
    if (legal.length === 0) {
      return { ok: false, status: 400, error: `A ${card.pos} had no slot left to fill.` }
    }
    legal.sort((a, b) => MV_SLOTS[a].accepts.length - MV_SLOTS[b].accepts.length)
    roster[legal[0]] = card
  }

  let wins = 0
  let pointsFor = 0
  let pointsAgainst = 0
  for (let w = 0; w < MV_WEEKS; w++) {
    const mine = mvWeekScore(roster, deal.rolls, w)
    pointsFor += mine
    pointsAgainst += deal.schedule[w].score
    if (mine > deal.schedule[w].score) wins++
  }
  // Snapshotted before January, because the seeding rule is about the
  // fourteen weeks and pointsFor keeps accumulating below.
  const regularFor = pointsFor

  // The postseason is single elimination, so the number of games played is
  // derived rather than trusted: a run cannot claim to have played on after
  // losing, and cannot claim to have stopped early to protect a rate.
  const madeIt = wins >= MV_PLAYOFF_LINE
  let poWins = 0
  let poGames = 0
  if (madeIt) {
    // The same three the board played: which quarter-final a run drew is
    // decided by its record AND its scoring, so the verifier has to read that
    // rule rather than the first entry in a list. See playoffField.
    const field = mvPlayoffField(deal.playoffs, wins, regularFor, pointsAgainst)
    for (let r = 0; r < MV_PLAYOFF_ROUNDS; r++) {
      const mine = mvPlayoffScore(roster, deal.playoffs.rolls, r, deal.playoffs.keep)
      poGames++
      pointsFor += mine
      if (mine <= field[r].score) break
      poWins++
    }
  }
  if (picks.playoffs !== poGames) {
    return { ok: false, status: 400, error: 'That run does not match the postseason its record earned.' }
  }

  const totalWins = wins + poWins
  const totalGames = MV_WEEKS + poGames
  const ppg = pointsFor / totalGames

  const roundName = !madeIt
    ? undefined
    : poWins >= MV_PLAYOFF_ROUNDS
      ? 'Won it'
      : `Out in the ${MV_PLAYOFF_ROUND_NAMES[poWins].toLowerCase()}`

  return {
    ok: true,
    // Wins first, then win rate, then scoring — packed into one integer
    // because the board sorts on one column. See rankScore.
    score: mvRankScore(totalWins, totalGames, ppg),
    rateNum: totalWins,
    rateDen: totalGames,
    display: {
      record: `${totalWins}-${totalGames - totalWins}`,
      ppg: round1(ppg),
      round: roundName,
    },
    detail: {
      cards: picks.cards,
      roster: roster.map((c, slot) =>
        c
          ? {
              slot: MV_SLOTS[slot].id,
              name: c.name,
              pos: c.pos,
              years: c.timelines.map((t) => t.year),
              mean: round1(c.mean),
            }
          : null
      ),
      regular: `${wins}-${MV_WEEKS - wins}`,
      playoffs: madeIt ? `${poWins}-${poGames - poWins}` : null,
    },
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
    case 'multiverse':
      return verifyMultiverse(poolId, seed, picks)
    default:
      return { ok: false, status: 501, error: 'That game has no leaderboard yet.' }
  }
}
