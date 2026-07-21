// ESPN redraft ValueSource — ESPN's own PPR draft ranking (live).
//
// ESPN's public fantasy games endpoint returns every player with ESPN's
// projection-derived PPR draft rank on each row (draftRanksByRankType.PPR.rank):
//   https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/<year>/players?view=kona_player_info
// No auth or league needed; a realistic UA + the X-Fantasy-Filter header is
// enough. We deliberately use ESPN's draft RANK rather than its projected
// points: leagueless, appliedTotal (points) is only populated for ~40 players,
// whereas the PPR draft rank covers ~850 skill players with clean ordering.
// ESPN's ranking is a distinct signal from FantasyCalc (trade market),
// FantasyPros ECR (expert consensus), and FF Calculator (crowd ADP).
//
// The catch: the /players collection ignores the filter's `limit`, so the
// response is ~38MB (all ~11k players). That's far over unstable_cache's 2MB
// entry limit, so — exactly like the 16MB Sleeper dict (see sleeperPlayers.ts)
// — we fetch it live, reduce it to a compact per-Sleeper-id value Map, and
// cache THAT in module memory (12h TTL, shared in-flight promise). The 38MB
// only lives transiently during parse; nothing large is ever persisted.
//
// Rank → value uses the same decay FantasyPros uses for ECR; the consensus
// orchestrator then per-position quantile-rescales it onto FantasyCalc's
// frame, so the absolute scale is normalized before blending. Like ADP, a
// draft ranking is a preseason-anchored signal, so its consensus weight sits
// below the sources that reprice weekly in season (FantasyCalc, FantasyPros
// ROS).
//
// Escape hatch: set ESPN_PROJECTIONS_URL to a compact JSON feed
// ([{ name, position, value }]) — a stored snapshot or a league-scoped
// kona_player_info URL with real projected points — to bypass the big scrape.

import { type SleeperPlayer } from '@/lib/platforms/sleeper'
import { getPlayersNflDict } from '@/lib/sleeperPlayers'
import { applyNameAliases } from './nameAliases'
import type { LeagueValuationContext, PlayerValue, ValueSource } from './types'

// Always available — the public projection scrape needs no key. The env var
// only switches to a custom feed.
export function isEspnConfigured(): boolean {
  return true
}

// ESPN defaultPositionId → our position code. Skip K (5) / D/ST (16).
const ESPN_POS: Record<number, string> = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE' }

type EspnDraftRank = { rank?: number }
type EspnPlayerRow = {
  id?: number
  fullName?: string
  defaultPositionId?: number
  proTeamId?: number
  draftRanksByRankType?: { PPR?: EspnDraftRank; STANDARD?: EspnDraftRank }
}
// Override-feed row: a compact hand/snapshot shape.
type EspnOverrideRow = { name?: string; fullName?: string; position?: string; value?: number }

function espnUrl(year: number): string {
  return `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/players?view=kona_player_info`
}

function nameKey(name: string, position?: string | null): string {
  const stripped = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .replace(/[.'`’]/g, '') // punctuation
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return `${stripped}|${(position ?? '').toUpperCase()}`
}

function buildSleeperLookup(players: Record<string, SleeperPlayer>): Map<string, string> {
  const out = new Map<string, string>()
  for (const [pid, p] of Object.entries(players)) {
    const full = p.full_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
    if (!full) continue
    const key = nameKey(full, p.position ?? '')
    if (!out.has(key)) out.set(key, pid)
  }
  applyNameAliases(out, nameKey)
  return out
}

// ESPN's PPR draft rank (STANDARD as fallback). Ignore absent / sentinel
// ranks (0 or the huge default ESPN uses for unranked players).
function draftRank(row: EspnPlayerRow): number | null {
  const dr = row.draftRanksByRankType
  const rank = dr?.PPR?.rank ?? dr?.STANDARD?.rank
  if (typeof rank !== 'number' || rank < 1 || rank >= 2000) return null
  return rank
}

// Rank → value. Same exponential decay FantasyPros uses for ECR rank so the
// pre-rescale shape roughly mirrors the market. rank 1 → 10000, 50 → ~4061,
// 100 → ~1647, 200 → ~272.
function rankToValue(rank: number): number {
  return Math.max(0, Math.round(10000 * Math.exp(-(rank - 1) / 55)))
}

// ── Compact value map, cached in module memory ──────────────────────────────
// Keyed by Sleeper id → { position, value(projected pts), team, name }. The
// projection doesn't vary by league mode/scoring (appliedTotal is PPR), so a
// single cached map serves every valuation; the consensus rescale handles the
// per-league framing.
type EspnCompact = Map<string, { name: string; position: string; team: string | null; value: number }>

const CACHE_TTL_MS = 12 * 60 * 60 * 1000
let cached: { at: number; promise: Promise<EspnCompact> } | null = null

function getEspnCompact(): Promise<EspnCompact> {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.promise
  const promise = buildEspnCompact()
  // Never cache a rejection — the next caller retries.
  promise.catch(() => {
    if (cached?.promise === promise) cached = null
  })
  cached = { at: now, promise }
  return promise
}

async function buildEspnCompact(): Promise<EspnCompact> {
  const players = await getPlayersNflDict()
  const lookup = buildSleeperLookup(players)
  const out: EspnCompact = new Map()

  const overrideUrl = process.env.ESPN_PROJECTIONS_URL?.trim()
  if (overrideUrl) {
    const res = await fetch(overrideUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'TSC-ManagerHub/1.0 (+https://thesunday.chronicle)' },
    })
    if (!res.ok) throw new Error(`ESPN override ${overrideUrl} → ${res.status}`)
    const json = (await res.json()) as EspnOverrideRow[]
    if (!Array.isArray(json)) throw new Error('ESPN override returned non-array')
    for (const r of json) {
      const name = r.name ?? r.fullName
      const position = String(r.position ?? '').toUpperCase()
      if (!name || !['QB', 'RB', 'WR', 'TE'].includes(position)) continue
      if (typeof r.value !== 'number' || r.value <= 0) continue
      const sid = lookup.get(nameKey(name, position))
      if (!sid) continue
      const sleeperRow = players[sid]
      out.set(sid, { name, position, team: sleeperRow?.team ?? null, value: r.value })
    }
    return out
  }

  // Public scrape: ~38MB. Fetch, reduce, discard.
  const year = new Date().getFullYear()
  const res = await fetch(espnUrl(year), {
    cache: 'no-store',
    // ~38MB body; cap the fetch so a slow/hung ESPN never drags the whole
    // consensus valuation past the route's serverless budget. On timeout the
    // source returns empty and consensus falls back to the other providers.
    signal: AbortSignal.timeout(18_000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      // Requests the projection stat splits on each row. `limit` is ignored by
      // this collection endpoint (hence the big body), but the filter still
      // shapes which stat splits come back.
      'X-Fantasy-Filter': JSON.stringify({ players: { filterStatsForSplitTypeIds: { value: [0] } } }),
    },
  })
  if (!res.ok) throw new Error(`ESPN ${espnUrl(year)} → ${res.status}`)
  const rows = (await res.json()) as EspnPlayerRow[]
  if (!Array.isArray(rows)) throw new Error('ESPN players response did not parse to an array')

  for (const row of rows) {
    const position = ESPN_POS[row.defaultPositionId ?? -1]
    if (!position) continue
    const rank = draftRank(row)
    if (rank == null) continue
    const name = row.fullName
    if (!name) continue
    const sid = lookup.get(nameKey(name, position))
    if (!sid) continue
    const sleeperRow = players[sid]
    out.set(sid, { name, position, team: sleeperRow?.team ?? null, value: rankToValue(rank) })
  }
  return out
}

export const espnRosSource: ValueSource = {
  id: 'espn-ros',
  async valueAll(ctx: LeagueValuationContext): Promise<Map<string, PlayerValue>> {
    void ctx
    let compact: EspnCompact
    try {
      compact = await getEspnCompact()
    } catch {
      // Failure → empty so consensus falls back to the other redraft sources.
      return new Map()
    }
    const players = await getPlayersNflDict()
    const out = new Map<string, PlayerValue>()
    for (const [sid, c] of compact) {
      const sleeperRow = players[sid]
      out.set(sid, {
        playerId: sid,
        name: c.name,
        position: c.position,
        team: c.team,
        value: c.value,
        tier: null,
        age: sleeperRow?.age ?? null,
        yearsExp: sleeperRow?.years_exp ?? null,
        source: 'espn-ros',
      })
    }
    return out
  },
}
