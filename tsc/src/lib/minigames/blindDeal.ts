// Blind Item — building the deck, and dealing a card.
//
// Server half of the game. The rules, the scoring constants and the wire
// shapes live in ./blindItem, which is deliberately import-free so the board
// can read them in the browser without pulling any of this along.
//
// A "deck" is one league's whole draft history, one entry per manager-season,
// cached for half a day because it only changes when the league re-syncs.
// A "deal" is the eight entries one seed picks out of it.

import { promises as fs } from 'fs'
import path from 'path'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalDraftIds } from '@/lib/canonicalDraft'
import { pageAll } from './pool'
import { DEMO_POOL_ID, DEMO_POOL_LABEL } from './demoPool'
import { makeRng, newSeed, normalizeSeed } from './roulette'
import {
  ROUNDS,
  PICKS_SHOWN,
  MIN_MANAGERS,
  MIN_YEARS,
  type BlindPick,
  type BlindCard,
  type BlindDeal,
  type BlindError,
} from './blindItem'

// ============================================================
// The deck
// ============================================================

type DeckEntry = BlindCard['answer'] & {
  key: string
  picks: BlindPick[]
}

type Deck = {
  label: string
  managers: { id: string; name: string }[]
  years: number[]
  entries: DeckEntry[]
}

function normTeam(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim().toUpperCase()
  if (!t || t === 'FA' || t === 'NONE' || t === 'NULL') return null
  return t
}

async function buildLeagueDeck(slug: string): Promise<Deck | null> {
  const db = createAdminClient()

  const { data: leagueRows } = await db
    .from('leagues')
    .select('id, name')
    .eq('slug', slug)
    .eq('manager_view', false)
    .limit(1)
  const league = (leagueRows ?? [])[0] as { id: string; name: string } | undefined
  if (!league) return null

  // Completed seasons only, by the house rule: a champion is on the books.
  // Never is_live, which steers /live/ and has hidden whole finished seasons
  // before. No year clamp here — unlike Roulette this game never scores a
  // player, so it doesn't need a rank file to exist for the year and can use
  // every season the league has.
  const seasons = await pageAll<{ id: string; year: number; champion_manager_id: string | null }>(
    () =>
      db
        .from('seasons')
        .select('id, year, champion_manager_id')
        .eq('league_id', league.id)
        .not('champion_manager_id', 'is', null)
        .order('year')
  )
  if (seasons.length === 0) return null

  const seasonById = new Map(seasons.map((s) => [s.id, s]))
  const seasonIds = seasons.map((s) => s.id)

  const [managerRows, msRows, draftRows] = await Promise.all([
    pageAll<{ id: string; display_name: string }>(() =>
      db.from('managers').select('id, display_name').eq('league_id', league.id).order('display_name')
    ),
    pageAll<{
      season_id: string
      manager_id: string
      team_name: string | null
      wins: number | null
      losses: number | null
      ties: number | null
      final_rank: number | null
    }>(() =>
      db
        .from('manager_seasons')
        .select('season_id, manager_id, team_name, wins, losses, ties, final_rank')
        .in('season_id', seasonIds)
        .order('season_id')
    ),
    pageAll<{ id: string; season_id: string; external_id: string | null }>(() =>
      db
        .from('drafts')
        .select('id, season_id, external_id')
        .in('season_id', seasonIds)
        .order('id')
    ),
  ])

  if (draftRows.length === 0) return null
  const seasonByDraft = new Map(draftRows.map((d) => [d.id, d.season_id]))

  // Ordered by overall pick so the first rows out of the bucket are the first
  // eight picks the manager actually made. Every position is kept: a kicker
  // taken in round six is exactly the kind of tell this game runs on.
  const pickRows = await pageAll<{
    draft_id: string
    round: number
    pick: number
    manager_id: string | null
    player_name: string | null
    position: string | null
    nfl_team: string | null
  }>(() =>
    db
      .from('draft_picks')
      .select('draft_id, round, pick, manager_id, player_name, position, nfl_team')
      .in('draft_id', draftRows.map((d) => d.id))
      .order('pick')
  )

  // One draft per season. Reading every draft row for a season interleaved
  // pams 2019's upload with its NFL.com scrape and dealt cards reading "R1
  // Russell Wilson, R1 Todd Gurley, R2 Joe Mixon, R2 Todd Gurley" — the same
  // eight players twice over, at shifted rounds. See ./canonicalDraft for why
  // the rule is shared rather than decided here: every reader used to pick
  // its own winner and they disagreed with each other.
  const pickCount = new Map<string, number>()
  for (const row of pickRows) {
    pickCount.set(row.draft_id, (pickCount.get(row.draft_id) ?? 0) + 1)
  }
  const canonical = canonicalDraftIds(draftRows, pickCount)

  const picksByPair = new Map<string, BlindPick[]>()
  for (const row of pickRows) {
    if (!row.manager_id || !row.player_name) continue
    if (!canonical.has(row.draft_id)) continue
    const seasonId = seasonByDraft.get(row.draft_id)
    if (!seasonId) continue
    const pair = `${seasonId}|${row.manager_id}`
    let list = picksByPair.get(pair)
    if (!list) {
      list = []
      picksByPair.set(pair, list)
    }
    if (list.length >= PICKS_SHOWN) continue
    // Belt and braces on top of the one-draft-per-season rule above: a
    // player showing up twice on one card reads as a bug even when the
    // underlying rows are genuine, and this data is known to carry import
    // artifacts. Skipping the repeat lets the next real pick fill the slot.
    if (list.some((p) => p.name === row.player_name)) continue
    list.push({
      round: row.round,
      name: row.player_name,
      pos: (row.position ?? '').toUpperCase() || '—',
      nflTeam: normTeam(row.nfl_team),
    })
  }

  const entries: DeckEntry[] = []
  for (const ms of msRows) {
    const season = seasonById.get(ms.season_id)
    if (!season) continue
    const picks = picksByPair.get(`${ms.season_id}|${ms.manager_id}`)
    // A short draft card is a bad round rather than a hard one — half the
    // evidence with the same answer space.
    if (!picks || picks.length < PICKS_SHOWN) continue
    entries.push({
      key: `${ms.season_id.slice(0, 8)}-${ms.manager_id.slice(0, 8)}`,
      picks,
      managerId: ms.manager_id,
      year: season.year,
      teamName: ms.team_name,
      wins: ms.wins ?? 0,
      losses: ms.losses ?? 0,
      ties: ms.ties ?? 0,
      finalRank: ms.final_rank,
      isChampion: season.champion_manager_id === ms.manager_id,
    })
  }

  // The pills only offer managers who appear in the deck. Offering someone
  // who never has a card is a dead option that makes the board look harder
  // than it is, and offering a year with no cards does the same.
  const usedManagers = new Set(entries.map((e) => e.managerId))
  const usedYears = [...new Set(entries.map((e) => e.year))].sort((a, b) => a - b)

  return {
    label: league.name,
    managers: managerRows
      .filter((m) => usedManagers.has(m.id))
      .map((m) => ({ id: m.id, name: m.display_name })),
    years: usedYears,
    entries,
  }
}

// ── The demo deck ─────────────────────────────────────────────
//
// Same shape, off the static demo tree rather than the database, so the game
// is playable by someone who has never signed in. The demo is a rename of a
// real league, so the drafts and finishes are genuine.

const DEMO_DIR = path.join(process.cwd(), 'public', 'demo', 'data')

type DemoDraftFile = {
  year: number
  picks: Array<{
    overall_pick: number
    round: number
    player_name: string | null
    position: string | null
    nfl_team: string | null
    user_id: number
    manager_name: string | null
  }>
}

type DemoSeasonFile = {
  year: number
  standings: Array<{
    final_rank: number | null
    team_name: string | null
    owner_name: string | null
    owner_user_id: number
    wins: number | null
    losses: number | null
    ties: number | null
  }>
}

async function readDemoJson<T>(rel: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DEMO_DIR, rel), 'utf8')) as T
  } catch {
    return null
  }
}

async function buildDemoDeck(): Promise<Deck | null> {
  const dir = await readDemoJson<{ drafts: Array<{ year: number }> }>('drafts/drafts_directory.json')
  const years = (dir?.drafts ?? []).map((d) => d.year).sort((a, b) => a - b)
  if (years.length === 0) return null

  const [draftFiles, seasonFiles] = await Promise.all([
    Promise.all(years.map((y) => readDemoJson<DemoDraftFile>(`drafts/${y}.json`))),
    Promise.all(years.map((y) => readDemoJson<DemoSeasonFile>(`seasons/${y}.json`))),
  ])

  const managerName = new Map<number, string>()
  const entries: DeckEntry[] = []

  years.forEach((year, i) => {
    const draft = draftFiles[i]
    const standings = seasonFiles[i]?.standings ?? []
    if (!draft?.picks?.length) return

    const champion = standings.find((s) => s.final_rank === 1)?.owner_user_id ?? null

    const byManager = new Map<number, BlindPick[]>()
    for (const p of [...draft.picks].sort((a, b) => a.overall_pick - b.overall_pick)) {
      if (!p.player_name) continue
      if (p.manager_name && !managerName.has(p.user_id)) managerName.set(p.user_id, p.manager_name)
      let list = byManager.get(p.user_id)
      if (!list) {
        list = []
        byManager.set(p.user_id, list)
      }
      if (list.length >= PICKS_SHOWN) continue
      list.push({
        round: p.round,
        name: p.player_name,
        pos: (p.position ?? '').toUpperCase() || '—',
        nflTeam: normTeam(p.nfl_team),
      })
    }

    for (const [userId, picks] of byManager) {
      if (picks.length < PICKS_SHOWN) continue
      const standing = standings.find((s) => s.owner_user_id === userId)
      if (standing?.owner_name) managerName.set(userId, standing.owner_name)
      entries.push({
        key: `demo-${userId}-${year}`,
        picks,
        managerId: `demo-${userId}`,
        year,
        teamName: standing?.team_name ?? null,
        wins: standing?.wins ?? 0,
        losses: standing?.losses ?? 0,
        ties: standing?.ties ?? 0,
        finalRank: standing?.final_rank ?? null,
        isChampion: champion === userId,
      })
    }
  })

  const usedManagers = new Set(entries.map((e) => e.managerId))
  const managers = [...managerName.entries()]
    .map(([userId, name]) => ({ id: `demo-${userId}`, name }))
    .filter((m) => usedManagers.has(m.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    label: DEMO_POOL_LABEL,
    managers,
    years: [...new Set(entries.map((e) => e.year))].sort((a, b) => a - b),
    entries,
  }
}

// Cached for the same reason the squad index is: a deck is one league's whole
// draft history and changes only when the league re-syncs. Bump the version
// when the deck's shape or its filters change, or a half-day-old cache will
// keep dealing by rules the code no longer follows.
function loadDeck(poolId: string): Promise<Deck | null> {
  if (poolId === DEMO_POOL_ID) {
    return unstable_cache(async () => buildDemoDeck(), ['minigame-blind-deck', 'v3', 'demo'], {
      tags: ['minigame-pool'],
      revalidate: 60 * 60 * 12,
    })()
  }
  return unstable_cache(
    async () => buildLeagueDeck(poolId),
    ['minigame-blind-deck', 'v3', poolId],
    { tags: ['minigame-pool'], revalidate: 60 * 60 * 12 }
  )()
}

// ============================================================
// The deal
// ============================================================

/**
 * Picks this seed's eight cards.
 *
 * Deterministic from the seed, like the Roulette wheel, so a run can be
 * handed to someone else and played card for card.
 *
 * Variety is chosen for rather than left to chance. A shuffle alone will
 * happily deal one manager four times out of eight, and once a reader has
 * been shown the same person twice the third card stops being a puzzle: they
 * recognise the drafting more than they deduce it. So the deal takes cards
 * whose manager AND year are both new first, falls back to a new manager, and
 * only repeats a pairing when a small league leaves it no choice.
 */
function dealCards(deck: Deck, seed: string, count: number): DeckEntry[] {
  const rng = makeRng(seed)
  const pool = deck.entries.slice()

  // Partial Fisher-Yates: one seeded shuffle, walked once, with the
  // near-misses set aside in the order they came up so the fallbacks stay
  // reproducible too.
  const order: DeckEntry[] = []
  for (let i = 0; i < pool.length; i++) {
    const j = i + Math.floor(rng() * (pool.length - i))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
    order.push(pool[i])
  }

  const picked: DeckEntry[] = []
  const seenManager = new Set<string>()
  const seenYear = new Set<number>()
  const managerRepeats: DeckEntry[] = []
  const bothRepeats: DeckEntry[] = []

  for (const cand of order) {
    if (picked.length >= count) break
    const freshManager = !seenManager.has(cand.managerId)
    const freshYear = !seenYear.has(cand.year)
    if (freshManager && freshYear) {
      picked.push(cand)
      seenManager.add(cand.managerId)
      seenYear.add(cand.year)
    } else if (freshManager) {
      managerRepeats.push(cand)
    } else {
      bothRepeats.push(cand)
    }
  }

  // Second tier: a year already on the board but a manager who isn't. Only
  // reached by leagues with fewer seasons than the game has rounds, which is
  // most of them.
  for (const cand of managerRepeats) {
    if (picked.length >= count) break
    if (seenManager.has(cand.managerId)) continue
    picked.push(cand)
    seenManager.add(cand.managerId)
  }

  // Last tier: a manager already on the board. Only reached when the deck is
  // barely bigger than a game.
  for (const cand of bothRepeats) {
    if (picked.length >= count) break
    picked.push(cand)
  }

  return picked
}

export async function dealBlindItem(
  poolParam: string,
  seedParam: string | null
): Promise<BlindDeal | BlindError> {
  const poolId = (poolParam ?? '').trim().toLowerCase()
  const seed = normalizeSeed(seedParam) ?? newSeed()

  if (!poolId) {
    return { ok: false, status: 400, error: 'Pick a league to play.' }
  }
  // One league at a time. A combined deck would silently add "which league?"
  // as a third question the board never asks, and the site-wide pool would
  // ask a reader to name a stranger.
  if (poolId === 'site' || poolId.includes(',')) {
    return {
      ok: false,
      status: 400,
      error: 'Blind Item is played one league at a time. You can only place people you know.',
    }
  }
  // Shape-checked before the query so a hand-typed pool can't smuggle filter
  // syntax into PostgREST.
  if (poolId !== DEMO_POOL_ID && !/^[a-z0-9-]{1,80}$/.test(poolId)) {
    return { ok: false, status: 404, error: 'No league on this site goes by that name.' }
  }

  const deck = await loadDeck(poolId)
  if (!deck) {
    return { ok: false, status: 404, error: 'No league on this site goes by that name.' }
  }

  if (deck.years.length < MIN_YEARS || deck.managers.length < MIN_MANAGERS) {
    return {
      ok: false,
      status: 409,
      error:
        deck.entries.length === 0
          ? "This league's drafts haven't come across from its old platform, so there's nothing to redact yet."
          : 'This league needs a few more completed seasons on the books before a blind item is worth guessing.',
    }
  }
  if (deck.entries.length < ROUNDS) {
    return {
      ok: false,
      status: 409,
      error: 'Not enough complete drafts in this league to fill a card yet.',
    }
  }

  const dealt = dealCards(deck, seed, ROUNDS)
  if (dealt.length < ROUNDS) {
    return {
      ok: false,
      status: 409,
      error: 'Not enough complete drafts in this league to fill a card yet.',
    }
  }

  return {
    ok: true,
    seed,
    pool: {
      id: poolId,
      label: deck.label,
      sublabel: poolId === DEMO_POOL_ID ? 'Demo league' : 'League history',
      leagueSlug: poolId === DEMO_POOL_ID ? null : poolId,
    },
    managers: deck.managers,
    years: deck.years,
    deckSize: deck.entries.length,
    cards: dealt.map((e) => ({
      key: e.key,
      kind: 'draft' as const,
      picks: e.picks,
      answer: {
        managerId: e.managerId,
        year: e.year,
        teamName: e.teamName,
        wins: e.wins,
        losses: e.losses,
        ties: e.ties,
        finalRank: e.finalRank,
        isChampion: e.isChampion,
      },
    })),
  }
}
