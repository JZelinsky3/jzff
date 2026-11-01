// The binder. SERVER ONLY.
//
// Every card a signed-in player has pulled, counted. "Pulled" means KEPT: one
// card per pack goes in the binder, the one you took, and the four you passed
// on don't (Joey: finishing it should be hard, not a prize for whoever opens
// the most packs). A card is a season, so a man's row runs from his most
// valuable card down, and each card keeps its own count, yours and the whole
// site's. Mega Draft boards aren't packs and never file here, and neither does
// the Daily: everyone opens the same packs that day, so its pulls say nothing
// about what anyone found (0089 stops counting the Daily rows already filed).
//
// Nothing here trusts the browser. A pack is recorded only after the server
// has dealt it itself: a run re-dealt on its way to the board (which is also
// how a run played signed out reaches the binder, once it's claimed), a
// Versus lineup re-dealt on submit, a League pick checked against its pack.
// The table keys on (user, deal, slot), so the same pack recorded twice
// counts once. See 0083_pack_empire_binder.sql and 0084.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  PACK_SIZE,
  POOL_KEYS,
  SOLO_BOOSTED,
  SOLO_WEIGHTS,
  personOf,
  RARITIES,
  type Player,
  type PoolKey,
  type Rarity,
  type Weights,
} from './rules'
import { POOL, POOL_SIZE, POOL_VERSION, VAULTED, cardWeight, playerById } from './pool'
import { parseSoloPicks, replaySolo, type SoloPick } from './solo'

export type BinderSource = 'solo' | 'versus' | 'league'

export type BinderPack = { deal: string; slot: number; cards: string[]; kept: string | null }

/**
 * Record packs and return the kept ids this player had never kept before.
 * Never throws: the binder is a side effect of playing, and a run that posted
 * must not fail because its packs didn't file.
 */
export async function recordPacks(userId: string, source: BinderSource, packs: BinderPack[]): Promise<string[]> {
  if (packs.length === 0) return []
  try {
    const { data, error } = await createAdminClient().rpc('pe_binder_file', {
      p_user: userId,
      p_source: source,
      p_pool: POOL_VERSION,
      p_packs: packs,
    })
    if (error) return []
    await stampCantons(userId, packs)
    return (data as string[] | null) ?? []
  } catch {
    return []
  }
}

/**
 * A kept Canton takes the next number of that card, for good: the 5th one ever is 5
 * forever, and only the total climbs. Filing the same pack twice does nothing, so a
 * re-filed run can't take a second number.
 */
async function stampCantons(userId: string, packs: BinderPack[]): Promise<void> {
  const stamps = packs.flatMap((p) => (p.kept && playerById(p.kept)?.rarity === 'canton' ? [{ card: p.kept, deal: p.deal, slot: p.slot }] : []))
  if (stamps.length) await createAdminClient().rpc('pe_canton_stamp', { p_user: userId, p_stamps: stamps })
}

/** An Empire Builder or Versus run: re-dealt here, all eleven packs filed. */
export async function recordSoloRun(
  userId: string,
  source: 'solo' | 'versus',
  seed: string,
  picks: SoloPick[]
): Promise<string[]> {
  const run = replaySolo(seed, picks)
  if (!run.ok) return []
  return recordPacks(
    userId,
    source,
    run.packs.map((p) => ({ deal: `solo:${seed}`, slot: p.slot, cards: p.cards.map((c) => c.id), kept: p.kept }))
  )
}

/** Runs one visit to the binder files at most, catching up on the past. */
const SYNC_LIMIT = 30

/**
 * Board runs that never reached the binder: everything posted before it
 * existed, and anything whose filing failed on the way. A run that no longer
 * replays (it was dealt from an older pool) is skipped; it can't be filed
 * without knowing what was in its packs.
 */
export async function syncBinder(userId: string): Promise<void> {
  try {
    const db = createAdminClient()
    const [{ data: runs }, { data: filed }] = await Promise.all([
      db
        .from('game_runs')
        .select('seed, detail')
        .eq('user_id', userId)
        .eq('game', 'pack-empire')
        .order('created_at', { ascending: false })
        .limit(200),
      // Every filed run has a pack in slot 0, so one row per run.
      db.from('pe_binder_packs').select('deal').eq('user_id', userId).eq('slot', 0).like('deal', 'solo:%'),
    ])
    const have = new Set((filed ?? []).map((r) => (r as { deal: string }).deal))
    const todo = (runs ?? [])
      .map((r) => r as { seed: string; detail: { picks?: unknown } | null })
      .filter((r) => !have.has(`solo:${r.seed}`))
      .slice(0, SYNC_LIMIT)
    for (const r of todo) {
      const picks = parseSoloPicks(r.detail?.picks)
      if (picks) await recordSoloRun(userId, 'solo', r.seed, picks)
    }
  } catch {
    // The binder still shows what it has.
  }
}

// ============================================================
// The view
// ============================================================

/** How a card stands with everyone: times kept across the site, and the odds
    of it being in an ordinary pack of its position. The odds are the game's own
    so they mean the same on day one as in a year; a share of the packs kept so
    far would swing wildly while the player base is small. A vaulted card is in
    no pack, so its oneIn is 0. */
export type SiteCount = { pulls: number; oneIn: number }

/** A version the player has pulled: the whole card, and its counts. */
export type BinderOwned = Player & {
  pulls: number
  firstAt: string
  site: SiteCount
  /** A Canton's number, and how many of that card have been pulled by anyone. */
  serial?: [number, number]
}

/** A version they haven't: enough to show what they're chasing, no more. */
export type BinderMissing = Pick<Player, 'id' | 'name' | 'pos' | 'year' | 'club' | 'rarity'> & {
  pulls: 0
  site: SiteCount
}

export type BinderCard = BinderOwned | BinderMissing

export function isOwned(c: BinderCard): c is BinderOwned {
  return c.pulls > 0
}

export type BinderMan = {
  pid: string
  name: string
  /** His best card's position: the tab he sits under. */
  pos: PoolKey
  /** Most valuable card first. */
  cards: BinderCard[]
}

export type BinderTotals = {
  cards: number
  owned: number
  men: number
  menOwned: number
  /** Packs filed: one card kept out of each. */
  pulls: number
  byRarity: Record<Rarity, { owned: number; of: number }>
  byPos: Record<PoolKey, { owned: number; of: number }>
}

export type BinderView = {
  men: BinderMan[]
  /** Vaulted cards this binder holds. Out of the packs and out of the totals:
      nobody can chase one, so it can't count against finishing the set. */
  vaulted: BinderMan[]
  totals: BinderTotals
}

type Count = { card_id: string; pulls: number; first_at: string }
type Site = { card_id: string; pulls: number }

async function counts(userId: string): Promise<Map<string, Count>> {
  const { data } = await createAdminClient().rpc('pe_binder_kept', { p_user: userId })
  return new Map(((data as Count[] | null) ?? []).map((c) => [c.card_id, c]))
}

async function siteCounts(): Promise<Map<string, Site>> {
  const { data } = await createAdminClient().rpc('pe_binder_site')
  return new Map(((data as Site[] | null) ?? []).map((c) => [c.card_id, c]))
}

/** Just the totals, for the Pack Empire front page. */
export async function binderTotals(userId: string): Promise<BinderTotals> {
  return build(await counts(userId), new Map()).totals
}

export async function loadBinder(userId: string): Promise<BinderView> {
  await syncBinder(userId)
  const [mine, site, serials] = await Promise.all([counts(userId), siteCounts(), cantonSerials(userId)])
  return build(mine, site, serials)
}

/** This player's lowest number of each Canton, over that card's running total. */
async function cantonSerials(userId: string): Promise<Map<string, [number, number]>> {
  const { data } = await createAdminClient().from('pe_canton_serials').select('card_id, serial, user_id')
  const rows = (data as { card_id: string; serial: number; user_id: string | null }[] | null) ?? []
  const total = new Map<string, number>()
  const yours = new Map<string, number>()
  for (const r of rows) {
    total.set(r.card_id, Math.max(total.get(r.card_id) ?? 0, r.serial))
    if (r.user_id === userId) yours.set(r.card_id, Math.min(yours.get(r.card_id) ?? r.serial, r.serial))
  }
  return new Map([...yours].map(([id, n]) => [id, [n, total.get(id) ?? n]]))
}

/** Every card in the game face up, for the complete binder. Each is filed as
    held so it arrives whole; `pulls` means nothing here, `site` is the count. */
export async function loadCompleteBinder(): Promise<BinderView> {
  const all = [...POOL_KEYS.flatMap((k) => POOL[k]), ...VAULTED].map((p) => [p.id, { card_id: p.id, pulls: 1, first_at: '' }] as const)
  return build(new Map(all), await siteCounts())
}

/** 1 in how many ordinary packs of its position hold this one card. A pack is
    four draws off the base table and one off the boosted one. Per card, not per
    rarity, because immortals have levels. */
function oneInByCard(pool: Player[]): Map<string, number> {
  const total = (table: Weights) => pool.reduce((sum, p) => sum + cardWeight(p, table), 0) || 1
  const base = total(SOLO_WEIGHTS.normal)
  const boosted = total(SOLO_BOOSTED.normal)
  return new Map(
    pool.map((p) => {
      const miss =
        Math.pow(1 - cardWeight(p, SOLO_WEIGHTS.normal) / base, PACK_SIZE - 1) *
        (1 - cardWeight(p, SOLO_BOOSTED.normal) / boosted)
      return [p.id, Math.round(1 / (1 - miss))]
    })
  )
}

function build(have: Map<string, Count>, site: Map<string, Site>, serials: Map<string, [number, number]> = new Map()): BinderView {
  const byRarity = Object.fromEntries(RARITIES.map((r) => [r, { owned: 0, of: 0 }])) as BinderTotals['byRarity']
  const byPos = Object.fromEntries(POOL_KEYS.map((k) => [k, { owned: 0, of: 0 }])) as BinderTotals['byPos']
  const men = new Map<string, BinderMan>()
  let owned = 0
  let pulls = 0

  for (const k of POOL_KEYS) {
    const oneIn = oneInByCard(POOL[k])
    for (const p of POOL[k]) {
      const siteCount: SiteCount = { pulls: site.get(p.id)?.pulls ?? 0, oneIn: oneIn.get(p.id) ?? 0 }
      const c = have.get(p.id)
      const card: BinderCard = c
        ? { ...p, pulls: c.pulls, firstAt: c.first_at, site: siteCount, serial: serials.get(p.id) }
        : {
            id: p.id,
            name: p.name,
            pos: p.pos,
            year: p.year,
            club: p.club,
            rarity: p.rarity,
            pulls: 0,
            site: siteCount,
          }
      byRarity[p.rarity].of++
      byPos[p.pos].of++
      if (c) {
        owned++
        pulls += c.pulls
        byRarity[p.rarity].owned++
        byPos[p.pos].owned++
      }
      const pid = personOf(p)
      const man = men.get(pid) ?? { pid, name: p.name, pos: p.pos, cards: [] }
      man.cards.push(card)
      men.set(pid, man)
    }
  }

  // Most valuable first. A missing card has no score on it, so order off the
  // pool's own numbers.
  const score = new Map(POOL_KEYS.flatMap((k) => POOL[k].map((p) => [p.id, p.score] as const)))
  const list = [...men.values()]
  for (const m of list) {
    m.cards.sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0))
    m.pos = m.cards[0].pos
  }
  list.sort((a, b) => (score.get(b.cards[0].id) ?? 0) - (score.get(a.cards[0].id) ?? 0))

  const vaulted = new Map<string, BinderMan>()
  for (const p of VAULTED) {
    const c = have.get(p.id)
    if (!c) continue
    const pid = personOf(p)
    const man = vaulted.get(pid) ?? { pid, name: p.name, pos: p.pos, cards: [] }
    man.cards.push({ ...p, pulls: c.pulls, firstAt: c.first_at, site: { pulls: site.get(p.id)?.pulls ?? 0, oneIn: 0 } })
    vaulted.set(pid, man)
  }

  return {
    men: list,
    vaulted: [...vaulted.values()],
    totals: {
      cards: POOL_SIZE,
      owned,
      men: list.length,
      menOwned: list.filter((m) => m.cards.some(isOwned)).length,
      pulls,
      byRarity,
      byPos,
    },
  }
}
