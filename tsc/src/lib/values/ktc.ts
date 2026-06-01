// KeepTradeCut ValueSource — Phase 4.
//
// KTC publishes no documented public API. Community scrapers exist (pyktc,
// node-ktc, several proxies) but their endpoints come and go. Rather than
// hardcode an undocumented URL that will eventually rot, this source is
// configuration-driven:
//
//   1. Set KTC_VALUES_URL in the env to point at a working KTC JSON feed
//      (your own scraper, a community proxy, or a static snapshot).
//   2. The feed must return an array of:
//        { name, position, team?, value, age?, tier? }
//      OR the raw KTC site shape:
//        { playerName, position, oneQBValues: { value }, ... }
//      Both are parsed.
//
// Without the env var the source is a no-op (empty map) and the orchestrator
// falls through to FantasyCalc / Sleeper-derived. That's intentional — we'd
// rather ship gracefully than fake values.
//
// Player IDs: KTC doesn't publish Sleeper IDs, so we match by normalizing
// names against the cached Sleeper /players/nfl dictionary and disambiguating
// by position.

import { unstable_cache } from 'next/cache'
import { sleeper, type SleeperPlayer } from '@/lib/platforms/sleeper'
import type { LeagueValuationContext, PlayerValue, ValueSource } from './types'

type RawKTC =
  | { name: string; position?: string; team?: string; value: number; age?: number | null; tier?: string | null }
  | { playerName: string; position?: string; team?: string; oneQBValues?: { value?: number }; superflexValues?: { value?: number }; age?: number | null; tier?: string | null }

export function isKtcConfigured(): boolean {
  return Boolean(process.env.KTC_VALUES_URL?.trim())
}

async function loadPlayersDict(): Promise<Record<string, SleeperPlayer>> {
  const cached = unstable_cache(
    async () => (await sleeper.playersNfl()) ?? {},
    ['sleeper-players-nfl', 'v1'],
    { revalidate: 6 * 60 * 60 },
  )
  return cached()
}

function nameKey(name: string, position?: string | null): string {
  const stripped = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // diacritics
    .replace(/[.'`’]/g, '')            // punctuation
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
    // First write wins — the active player tends to come earlier in the dict
    // than long-retired homonyms, but this is not guaranteed; if values for
    // the wrong player surface, the fix is to disambiguate further by team.
    if (!out.has(key)) out.set(key, pid)
  }
  return out
}

function extractValue(raw: RawKTC, superflex: boolean): { name: string; position: string; team: string | null; value: number; age: number | null; tier: string | null } | null {
  const r = raw as Record<string, unknown>
  const name = (r['name'] ?? r['playerName']) as string | undefined
  if (!name) return null
  const position = String(r['position'] ?? '').toUpperCase() || '—'
  const team = (r['team'] as string | undefined) ?? null
  const age = (r['age'] as number | null | undefined) ?? null
  const tier = (r['tier'] as string | null | undefined) ?? null

  let value: number | undefined
  if (typeof r['value'] === 'number') value = r['value']
  if (value == null) {
    const sf = (r['superflexValues'] as { value?: number } | undefined)?.value
    const single = (r['oneQBValues'] as { value?: number } | undefined)?.value
    value = superflex ? (sf ?? single) : (single ?? sf)
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return { name, position, team, value: Math.round(value), age, tier }
}

async function fetchKtc(): Promise<RawKTC[]> {
  const url = process.env.KTC_VALUES_URL!.trim()
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'TSC-ManagerHub/1.0 (+https://thesunday.chronicle)' },
  })
  if (!res.ok) throw new Error(`KTC ${url} → ${res.status}`)
  const json = await res.json()
  if (!Array.isArray(json)) throw new Error('KTC feed returned non-array')
  return json as RawKTC[]
}

function cachedKtc(): Promise<RawKTC[]> {
  return unstable_cache(
    fetchKtc,
    ['ktc-values', 'v1'],
    { revalidate: 12 * 60 * 60 },
  )()
}

export const ktcDynastySource: ValueSource = {
  id: 'ktc-dynasty',
  async valueAll(ctx: LeagueValuationContext): Promise<Map<string, PlayerValue>> {
    if (!isKtcConfigured()) return new Map()
    let entries: RawKTC[]
    try {
      entries = await cachedKtc()
    } catch {
      return new Map()
    }
    const players = await loadPlayersDict()
    const lookup = buildSleeperLookup(players)
    const superflex = ctx.qbStarters >= 2

    const out = new Map<string, PlayerValue>()
    for (const raw of entries) {
      const parsed = extractValue(raw, superflex)
      if (!parsed) continue
      const key = nameKey(parsed.name, parsed.position)
      const sid = lookup.get(key)
      if (!sid) continue
      const sleeperRow = players[sid]
      out.set(sid, {
        playerId: sid,
        name: parsed.name,
        position: parsed.position,
        team: parsed.team ?? sleeperRow?.team ?? null,
        value: parsed.value,
        tier: parsed.tier,
        age: parsed.age ?? sleeperRow?.age ?? null,
        yearsExp: sleeperRow?.years_exp ?? null,
        source: 'ktc-dynasty',
      })
    }
    return out
  },
}
