// Dealing a game of Roster Roulette.
//
// Shared by the page (which deals the opening wheel during SSR, so the
// board is on screen in the first paint) and by /api/games/roulette (which
// deals every wheel after that, and any wheel a shared seed link asks for).
// One implementation so a seed can never mean two different games depending
// on which door it came through.

import { createAdminClient } from '@/lib/supabase/admin'
import { loadSquadIndex, loadSquadRosters, isPlayableSquad, type Squad } from './pool'
import { SITE_PROFILE, type ScoringProfile } from './ranks'
import { loadBenchmark } from './benchmarkFile'
import type { Benchmark } from './record'
import {
  SLOTS,
  REROLLS,
  SPINS_PER_GAME,
  dealRefs,
  newSeed,
  normalizeSeed,
  sortSquadPlayers,
  type SlotDef,
} from './roulette'

export type DealtGame = {
  ok: true
  seed: string
  pool: {
    id: string
    label: string
    sublabel: string
    leagueSlug: string | null
    profile: string
    squadCount: number
  }
  slots: SlotDef[]
  rerolls: number
  spins: Squad[]
  /**
   * The seventeen opponents this run is played against. Null only if the
   * benchmark file is missing, in which case the client shows points
   * without a record rather than inventing one.
   */
  benchmark: Benchmark | null
}

export type DealError = { ok: false; error: string; status: number }

/**
 * @param viewerId Signed-in user, if any. Only consulted to let an owner
 *   play their own league before it has published an almanac.
 */
export async function dealGame(
  poolParam: string,
  seedParam: string | null,
  viewerId: string | null
): Promise<DealtGame | DealError> {
  const pool = (poolParam || 'site').trim().toLowerCase()
  const seed = normalizeSeed(seedParam) ?? newSeed()
  const isSite = pool === 'site'

  let label: string
  let sublabel: string
  let leagueSlug: string | null = null

  if (isSite) {
    label = 'The Whole Site'
    sublabel = 'Every published almanac'
  } else {
    // Slug shape is enforced before it reaches the query so a hand-typed
    // pool param can't smuggle filter syntax into PostgREST.
    if (!/^[a-z0-9-]{1,80}$/.test(pool)) {
      return { ok: false, error: 'Unknown pool', status: 404 }
    }
    const db = createAdminClient()
    const { data: league } = await db
      .from('leagues')
      .select('slug, name, owner_id, published_at')
      .eq('slug', pool)
      .maybeSingle()
    if (!league) return { ok: false, error: 'Unknown pool', status: 404 }
    if (!league.published_at && viewerId !== league.owner_id) {
      return {
        ok: false,
        error: 'That league has not published its almanac yet.',
        status: 403,
      }
    }
    label = league.name as string
    sublabel = 'League history'
    leagueSlug = league.slug as string
  }

  const index = await loadSquadIndex(isSite ? { kind: 'site' } : { kind: 'league', slug: pool })
  if (index.length < SLOTS.length) {
    return {
      ok: false,
      status: 409,
      error: isSite
        ? 'Not enough league history on the site yet to fill a wheel.'
        : 'This league needs a few more completed seasons before it can fill a wheel.',
    }
  }

  // Over-deal, then keep the playable ones in order. Squads whose roster
  // never made it across from an old platform (or who joined mid-season)
  // can't field a lineup, and there's no way to know that from the index
  // alone — so the wheel skips them here rather than dealing a dead spin.
  const candidates = dealRefs(index, seed, Math.min(index.length, SPINS_PER_GAME * 3))
  const hydrated = await loadSquadRosters(candidates)
  const byKey = new Map(hydrated.map((s) => [s.key, s]))
  const spins: Squad[] = []
  for (const ref of candidates) {
    const squad = byKey.get(ref.key)
    if (!squad || !isPlayableSquad(squad)) continue
    spins.push(sortSquadPlayers(squad))
    if (spins.length === SPINS_PER_GAME) break
  }

  if (spins.length < SLOTS.length) {
    return {
      ok: false,
      status: 409,
      error: 'Not enough complete rosters in this pool to fill a wheel yet.',
    }
  }

  const profile: ScoringProfile = isSite ? SITE_PROFILE : spins[0].profile

  return {
    ok: true,
    seed,
    pool: {
      id: isSite ? 'site' : pool,
      label,
      sublabel,
      leagueSlug,
      profile,
      squadCount: index.length,
    },
    slots: SLOTS,
    rerolls: REROLLS,
    spins,
    benchmark: await loadBenchmark(profile),
  }
}
