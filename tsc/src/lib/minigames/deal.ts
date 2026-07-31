// Dealing a game of Roster Roulette.
//
// Shared by the page (which deals the opening wheel during SSR, so the
// board is on screen in the first paint) and by /api/games/roulette (which
// deals every wheel after that, and any wheel a shared seed link asks for).
// One implementation so a seed can never mean two different games depending
// on which door it came through.

import { createAdminClient } from '@/lib/supabase/admin'
import { loadSquadIndex, loadSquadRosters, isPlayableSquad, type Squad } from './pool'
import { loadDemoSquads, DEMO_POOL_ID, DEMO_POOL_LABEL } from './demoPool'
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

export async function dealGame(
  poolParam: string,
  seedParam: string | null
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
  } else if (pool === DEMO_POOL_ID) {
    // The demo wheel needs no league, no account and no database: its
    // squads come off the static demo tree. Handled before the lookup
    // below because there is no `demo` row in `leagues` to find.
    const squads = await loadDemoSquads()
    if (squads.length < SPINS_PER_GAME) {
      return { ok: false, status: 409, error: 'The demo wheel is not available right now.' }
    }
    const picked = dealRefs(squads, seed, Math.min(squads.length, SPINS_PER_GAME * 2))
    const byKey = new Map(squads.map((sq) => [sq.key, sq]))
    const demoSpins: Squad[] = []
    for (const ref of picked) {
      const squad = byKey.get(ref.key)
      if (!squad) continue
      demoSpins.push(sortSquadPlayers(squad))
      if (demoSpins.length === SPINS_PER_GAME) break
    }
    if (demoSpins.length < SPINS_PER_GAME) {
      return { ok: false, status: 409, error: 'The demo wheel is not available right now.' }
    }
    return {
      ok: true,
      seed,
      pool: {
        id: DEMO_POOL_ID,
        label: DEMO_POOL_LABEL,
        sublabel: 'Demo league',
        leagueSlug: null,
        profile: demoSpins[0].profile,
        squadCount: squads.length,
      },
      slots: SLOTS,
      rerolls: REROLLS,
      spins: demoSpins,
      benchmark: await loadBenchmark(demoSpins[0].profile),
    }
  } else {
    // Slug shape is enforced before it reaches the query so a hand-typed
    // pool param can't smuggle filter syntax into PostgREST.
    if (!/^[a-z0-9-]{1,80}$/.test(pool)) {
      return { ok: false, error: 'No league on this site goes by that name.', status: 404 }
    }
    // A league wheel is playable by anyone holding its slug, signed in or
    // not, published almanac or not. A wheel gets shared into a group chat
    // and has to work for every person in it — a friend who bounced off a
    // sign-in wall, or got silently handed the site-wide wheel instead of
    // the league they were sent, has simply not played the game.
    //
    // The trade this makes, deliberately: an UNPUBLISHED almanac's manager
    // names, team names and rosters become reachable by anyone who knows or
    // guesses its slug, through the game if not through /leagues. Nothing
    // here is a secret worth a login, but it is more open than the almanac
    // itself. The wheel is still the only door — it never lists a league it
    // wasn't asked for, so the Games Page shows a stranger's league to
    // nobody.
    const db = createAdminClient()
    const { data: league } = await db
      .from('leagues')
      .select('slug, name')
      .eq('slug', pool)
      .maybeSingle()
    if (!league) return { ok: false, error: 'No league on this site goes by that name.', status: 404 }
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
  //
  // About 93% of squads are playable, so a first pass of 14 clears nine
  // almost every time. It used to over-deal 27 flat, which meant hauling
  // three times the roster rows on every single wheel to cover a case that
  // rarely happens. Topping up is deterministic: dealRefs returns a seeded
  // prefix, so asking for more yields the same first 14 plus the next ones.
  let spins: Squad[] = []
  for (const take of [14, SPINS_PER_GAME * 4]) {
    const candidates = dealRefs(index, seed, Math.min(index.length, take))
    const hydrated = await loadSquadRosters(candidates)
    const byKey = new Map(hydrated.map((s) => [s.key, s]))
    spins = []
    for (const ref of candidates) {
      const squad = byKey.get(ref.key)
      if (!squad || !isPlayableSquad(squad)) continue
      spins.push(sortSquadPlayers(squad))
      if (spins.length === SPINS_PER_GAME) break
    }
    if (spins.length === SPINS_PER_GAME) break
    // Short — widen and redo from scratch. Rare enough that the wasted first
    // pass costs less than over-fetching on every wheel would.
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
