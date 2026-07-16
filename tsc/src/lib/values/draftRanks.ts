// Draft-day rankings for the Mock Room board.
//
// This is deliberately NOT the trade-value pipeline (index.ts): a mock
// draft wants each outlet's actual preseason DRAFT board, not market trade
// values, and it must never mix modes — everything here is redraft.
// Four sources, all free, all matched onto Sleeper player ids:
//
//   espn-draft        ESPN's editorial draft ranks. Public league-defaults
//                     API: kona_player_info view, draftRanksByRankType.PPR.
//   nfl-draft         NFL.com's editor draft board. HTML scrape of
//                     fantasy.nfl.com/research/rankings?statType=draftStats
//                     (paginated 25/page, same row markup platforms/nfl.ts
//                     already parses).
//   sleeper-adp       Sleeper's live ADP from their projections feed
//                     (stats.adp_ppr / adp_half_ppr / adp_2qb). Skill
//                     positions only — Sleeper publishes no K/DEF ADP.
//   fantasypros-draft FantasyPros ECR from the DRAFT cheatsheet pages.
//                     NOT the ROS page: ros-*-overall.php serves stale
//                     end-of-last-season data all offseason (December
//                     "year: 2025" ranks in July 2026 — that's how Todd
//                     Gurley ended up in a top 10). The cheatsheet payload
//                     is validated as ranking_type_name === 'draft'.
//
// Consensus = mean rank across the sources that cover a player (a player
// carried by a single outlet gets a mild penalty so one site's dart throw
// doesn't crack the top of the board).
//
// Freshness: each source is unstable_cache'd for 24h and a daily cron
// (/api/cron/refresh-draft-ranks) warms them, so the board self-updates
// through draft season without anyone visiting first.

import { unstable_cache } from 'next/cache'
import * as cheerio from 'cheerio'
import { type SleeperPlayer } from '@/lib/platforms/sleeper'
import { getPlayersNflDict } from '@/lib/sleeperPlayers'
import { nameKey, buildSleeperLookup, fetchFp } from './fantasypros'

export type DraftBoardScoring = 'ppr' | 'half'
export type DraftRankSourceId =
  | 'consensus'
  | 'espn-draft'
  | 'nfl-draft'
  | 'sleeper-adp'
  | 'fantasypros-draft'

export type DraftRankRow = {
  id: string            // Sleeper player id (team abbr for DEF)
  name: string
  pos: string           // QB | RB | WR | TE | K | DEF
  team: string | null
  rank: number          // 1-based within the source
}

export const DRAFT_RANK_SOURCES: Array<{ id: DraftRankSourceId; label: string }> = [
  { id: 'consensus', label: 'Consensus' },
  { id: 'espn-draft', label: 'ESPN' },
  { id: 'nfl-draft', label: 'NFL.com' },
  { id: 'sleeper-adp', label: 'Sleeper ADP' },
  { id: 'fantasypros-draft', label: 'FantasyPros' },
]

export function parseDraftSourceParam(raw: string | null): DraftRankSourceId {
  const ids = DRAFT_RANK_SOURCES.map((s) => s.id) as string[]
  return raw && ids.includes(raw) ? (raw as DraftRankSourceId) : 'consensus'
}

const BOARD_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

function normPos(raw: string | null | undefined): string | null {
  const p = (raw ?? '').toUpperCase()
  if (p === 'DST' || p === 'D/ST') return 'DEF'
  return BOARD_POSITIONS.has(p) ? p : null
}

// ── Sleeper-id matching ─────────────────────────────────────────
// Skill players match on nameKey(name|pos) via the shared FantasyPros
// lookup. Team defenses need their own map: sources write them as
// "Bills D/ST" (ESPN), "Denver Broncos" (NFL.com, FantasyPros) — Sleeper
// keys them by team abbr with first_name=city, last_name=nickname.
type Matcher = {
  bySkill: Map<string, string>
  byDef: Map<string, string>       // normalized city/nickname forms -> abbr
  dict: Record<string, SleeperPlayer>
}

async function buildMatcher(): Promise<Matcher> {
  const dict = await getPlayersNflDict()
  const bySkill = buildSleeperLookup(dict)
  const byDef = new Map<string, string>()
  for (const [pid, p] of Object.entries(dict)) {
    if ((p.position ?? '').toUpperCase() !== 'DEF') continue
    const city = (p.first_name ?? '').trim()
    const nick = (p.last_name ?? '').trim()
    if (nick) byDef.set(nameKey(nick, 'DEF'), pid)
    if (city && nick) byDef.set(nameKey(`${city} ${nick}`, 'DEF'), pid)
  }
  return { bySkill, byDef, dict }
}

function matchId(m: Matcher, name: string, pos: string): string | null {
  if (pos === 'DEF') {
    const cleaned = name.replace(/\b(d\/st|dst|defense|def)\b\.?/gi, '').trim()
    return m.byDef.get(nameKey(cleaned, 'DEF')) ?? null
  }
  return m.bySkill.get(nameKey(name, pos)) ?? null
}

function rowFor(m: Matcher, id: string, pos: string, rank: number, fallbackName: string, fallbackTeam?: string | null): DraftRankRow {
  const p = m.dict[id]
  const name = p?.full_name ?? (`${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || fallbackName)
  return { id, name, pos, team: p?.team ?? fallbackTeam ?? null, rank }
}

// ── ESPN ────────────────────────────────────────────────────────
const ESPN_POS: Record<number, string> = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' }

async function fetchEspnDraftRanks(year: number): Promise<DraftRankRow[]> {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leaguedefaults/3?view=kona_player_info`
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': UA,
      'X-Fantasy-Filter': JSON.stringify({
        players: { limit: 350, sortDraftRanks: { sortPriority: 100, sortAsc: true, value: 'PPR' } },
      }),
    },
  })
  if (!res.ok) throw new Error(`ESPN kona ${year} → ${res.status}`)
  const data = (await res.json()) as {
    players?: Array<{
      player?: {
        fullName?: string
        defaultPositionId?: number
        draftRanksByRankType?: Record<string, { rank?: number }>
      }
    }>
  }
  if (!Array.isArray(data.players)) throw new Error('ESPN kona: no players array')

  const m = await buildMatcher()
  const rows: DraftRankRow[] = []
  const seen = new Set<string>()
  const raw = data.players
    .map((entry) => {
      const p = entry.player
      const rank = p?.draftRanksByRankType?.PPR?.rank
      const pos = normPos(ESPN_POS[p?.defaultPositionId ?? -1] ?? null)
      if (!p?.fullName || !pos || typeof rank !== 'number' || rank < 1) return null
      return { name: p.fullName, pos, rank }
    })
    .filter((r) => r != null)
    .sort((a, b) => a.rank - b.rank)
  for (const r of raw) {
    const id = matchId(m, r.name, r.pos)
    if (!id || seen.has(id)) continue
    seen.add(id)
    rows.push(rowFor(m, id, r.pos, rows.length + 1, r.name))
  }
  if (rows.length < 50) throw new Error(`ESPN kona: matched only ${rows.length} rows`)
  return rows
}

// ── NFL.com ─────────────────────────────────────────────────────
async function fetchNflDraftRanks(): Promise<DraftRankRow[]> {
  const PAGES = 10 // 25 rows per page → top 250
  const htmls = await Promise.all(
    Array.from({ length: PAGES }, (_, i) => {
      const offset = i * 25 + 1
      const url = `https://fantasy.nfl.com/research/rankings?leagueId=0&statType=draftStats&offset=${offset}`
      return fetch(url, { cache: 'no-store', headers: { 'User-Agent': UA } }).then((r) =>
        r.ok ? r.text() : null,
      )
    }),
  )

  const m = await buildMatcher()
  const rows: DraftRankRow[] = []
  const seen = new Set<string>()
  for (const html of htmls) {
    if (!html) continue
    const $ = cheerio.load(html)
    $('a.playerName').each((_, a) => {
      const name = $(a).text().trim()
      if (!name) return
      // Same row markup the box-score parser reads: <em>POS - TEAM</em>
      // next to the name; defenses show a bare "DEF".
      const meta = $(a).closest('td').find('em').first().text().trim()
      const metaMatch = meta.match(/([A-Z/]{1,4})\s*(?:[-–]\s*([A-Z]{2,4}))?/)
      const pos = normPos(metaMatch?.[1] ?? null)
      if (!pos) return
      const id = matchId(m, name, pos)
      if (!id || seen.has(id)) return
      seen.add(id)
      rows.push(rowFor(m, id, pos, rows.length + 1, name, metaMatch?.[2] ?? null))
    })
  }
  if (rows.length < 50) throw new Error(`NFL.com draft ranks: matched only ${rows.length} rows`)
  return rows
}

// ── Sleeper ADP ─────────────────────────────────────────────────
async function fetchSleeperAdp(
  year: number,
  scoring: DraftBoardScoring,
  qbStarters: number,
): Promise<DraftRankRow[]> {
  // No K/DEF here: Sleeper's feed carries adp fields for skill positions
  // only (K/DEF rows all sit at the 999 sentinel).
  const adpKey = qbStarters >= 2 ? 'adp_2qb' : scoring === 'half' ? 'adp_half_ppr' : 'adp_ppr'
  const positions = ['QB', 'RB', 'WR', 'TE']
  const lists = await Promise.all(
    positions.map(async (pos) => {
      const url = `https://api.sleeper.com/projections/nfl/${year}?season_type=regular&position%5B%5D=${pos}`
      const res = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': UA } })
      if (!res.ok) throw new Error(`Sleeper projections ${pos} → ${res.status}`)
      return (await res.json()) as Array<{
        player_id?: string
        team?: string | null
        player?: { first_name?: string; last_name?: string; position?: string }
        stats?: Record<string, number>
      }>
    }),
  )

  const m = await buildMatcher()
  const pool: Array<{ id: string; pos: string; adp: number; name: string; team: string | null }> = []
  for (const list of lists) {
    for (const r of list) {
      const adp = r.stats?.[adpKey]
      const pos = normPos(r.player?.position)
      if (!r.player_id || !pos || typeof adp !== 'number' || adp <= 0 || adp >= 999) continue
      const name = `${r.player?.first_name ?? ''} ${r.player?.last_name ?? ''}`.trim() || r.player_id
      pool.push({ id: r.player_id, pos, adp, name, team: r.team ?? null })
    }
  }
  pool.sort((a, b) => a.adp - b.adp)
  const rows = pool.map((p, i) => rowFor(m, p.id, p.pos, i + 1, p.name, p.team))
  if (rows.length < 50) throw new Error(`Sleeper ADP: only ${rows.length} rows with ${adpKey}`)
  return rows
}

// ── FantasyPros draft cheatsheet ────────────────────────────────
async function fetchFpDraftRanks(scoring: DraftBoardScoring): Promise<DraftRankRow[]> {
  const url =
    scoring === 'half'
      ? 'https://www.fantasypros.com/nfl/rankings/half-point-ppr-cheatsheets.php'
      : 'https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php'
  const data = await fetchFp(url)
  if (data.ranking_type_name !== 'draft') {
    throw new Error(`FP cheatsheet returned ranking_type ${data.ranking_type_name ?? 'unknown'}`)
  }
  const m = await buildMatcher()
  const rows: DraftRankRow[] = []
  const seen = new Set<string>()
  const sorted = [...data.players]
    .filter((p) => typeof p.rank_ecr === 'number' && p.rank_ecr >= 1)
    .sort((a, b) => a.rank_ecr - b.rank_ecr)
  for (const p of sorted) {
    const pos = normPos(p.player_position_id)
    if (!pos || !p.player_name) continue
    const id = matchId(m, p.player_name, pos)
    if (!id || seen.has(id)) continue
    seen.add(id)
    rows.push(rowFor(m, id, pos, rows.length + 1, p.player_name, p.player_team_id ?? null))
  }
  if (rows.length < 50) throw new Error(`FP cheatsheet: matched only ${rows.length} rows`)
  return rows
}

// ── Caching ─────────────────────────────────────────────────────
const REVALIDATE = 24 * 60 * 60 // daily, warmed by the cron

function cached(
  sourceId: string,
  keyBits: Array<string | number>,
  fn: () => Promise<DraftRankRow[]>,
): Promise<DraftRankRow[]> {
  return unstable_cache(fn, ['draft-ranks', 'v1', sourceId, ...keyBits.map(String)], {
    revalidate: REVALIDATE,
  })()
}

export function getSourceRanks(
  source: Exclude<DraftRankSourceId, 'consensus'>,
  opts: { year: number; scoring: DraftBoardScoring; qbStarters: number },
): Promise<DraftRankRow[]> {
  switch (source) {
    case 'espn-draft':
      return cached('espn', [opts.year], () => fetchEspnDraftRanks(opts.year))
    case 'nfl-draft':
      return cached('nfl', [opts.year], () => fetchNflDraftRanks())
    case 'sleeper-adp':
      return cached('sleeper-adp', [opts.year, opts.scoring, opts.qbStarters], () =>
        fetchSleeperAdp(opts.year, opts.scoring, opts.qbStarters),
      )
    case 'fantasypros-draft':
      return cached('fp-draft', [opts.scoring], () => fetchFpDraftRanks(opts.scoring))
  }
}

// ── Board assembly ──────────────────────────────────────────────
export type DraftBoardPlayer = {
  id: string
  name: string
  pos: string
  team: string | null
  value: number         // rank-decayed 0..10000, for bars + recap totals
  tier: string | null   // positional bucket, e.g. WR2
  // Per-outlet overall ranks for the spread display ("ESPN 4 · NFL 9"),
  // limited to the outlets blended into this board. Keys are short
  // labels the client shows verbatim.
  rks?: Record<string, number>
}

export type DraftBoard = {
  source: DraftRankSourceId
  label: string
  players: DraftBoardPlayer[]
  sources: Array<{ id: DraftRankSourceId; label: string; ok: boolean }>
}

// Same decay the FP value source uses (rank 1 → 10000, 100 → ~1650).
function rankToValue(rank: number): number {
  return Math.max(1, Math.round(10000 * Math.exp(-(rank - 1) / 55)))
}

const SPREAD_LABELS: Partial<Record<DraftRankSourceId, string>> = {
  'espn-draft': 'ESPN',
  'nfl-draft': 'NFL',
  'sleeper-adp': 'ADP',
  'fantasypros-draft': 'FP',
}

function toBoardPlayers(
  rows: DraftRankRow[],
  cap: number,
  spread: Map<string, Record<string, number>>,
): DraftBoardPlayer[] {
  const posCount: Record<string, number> = {}
  return rows.slice(0, cap).map((r) => {
    posCount[r.pos] = (posCount[r.pos] ?? 0) + 1
    const bucket = Math.ceil(posCount[r.pos] / 12)
    return {
      id: r.id,
      name: r.name,
      pos: r.pos,
      team: r.team,
      value: rankToValue(r.rank),
      tier: bucket <= 4 ? `${r.pos}${bucket}` : null,
      rks: spread.get(r.id),
    }
  })
}

export type DraftFeedId = Exclude<DraftRankSourceId, 'consensus'>

// Mean rank across the given sources; players covered by a single outlet
// get a mild penalty so one site's dart doesn't crack the top of the board.
function blendRanks(bySource: Map<DraftRankSourceId, DraftRankRow[]>, ids: DraftFeedId[]): DraftRankRow[] {
  const agg = new Map<string, { rows: DraftRankRow[]; sum: number }>()
  for (const id of ids) {
    for (const r of bySource.get(id) ?? []) {
      const e = agg.get(r.id)
      if (e) { e.rows.push(r); e.sum += r.rank }
      else agg.set(r.id, { rows: [r], sum: r.rank })
    }
  }
  const merged = [...agg.values()].map((e) => {
    const mean = e.sum / e.rows.length
    const penalty = ids.length >= 2 && e.rows.length === 1 ? 24 : 0
    return { row: e.rows[0], score: mean + penalty }
  })
  merged.sort((a, b) => a.score - b.score)
  return merged.map((e, i) => ({ ...e.row, rank: i + 1 }))
}

export async function buildDraftBoard(opts: {
  year: number
  scoring: DraftBoardScoring
  qbStarters: number
  // The outlets to blend. Empty / omitted = all available. One id = that
  // outlet's board verbatim; two or more = consensus over just those.
  sources?: DraftFeedId[]
}): Promise<DraftBoard> {
  const ids = DRAFT_RANK_SOURCES.filter((s) => s.id !== 'consensus').map((s) => s.id as DraftFeedId)
  const settled = await Promise.allSettled(ids.map((id) => getSourceRanks(id, opts)))
  const bySource = new Map<DraftRankSourceId, DraftRankRow[]>()
  ids.forEach((id, i) => {
    const s = settled[i]
    if (s.status === 'fulfilled') bySource.set(id, s.value)
  })
  if (bySource.size === 0) throw new Error('every draft-rank source failed')

  const sources = DRAFT_RANK_SOURCES.map((s) => ({
    ...s,
    ok: s.id === 'consensus' ? bySource.size > 0 : bySource.has(s.id),
  }))

  const fulfilled = ids.filter((id) => bySource.has(id))
  let wanted = (opts.sources ?? []).filter((id) => bySource.has(id))
  if (wanted.length === 0) wanted = fulfilled

  // Full-blend consensus always exists as the K/DEF fill pool, even when
  // the requested subset skips the outlets that rank those positions.
  const fullConsensus = blendRanks(bySource, fulfilled)

  let picked: DraftRankRow[]
  let effective: DraftRankSourceId
  let label: string
  if (wanted.length === 1) {
    picked = bySource.get(wanted[0]) as DraftRankRow[]
    effective = wanted[0]
    label = DRAFT_RANK_SOURCES.find((s) => s.id === wanted[0])?.label ?? wanted[0]
  } else {
    picked = wanted.length === fulfilled.length ? fullConsensus : blendRanks(bySource, wanted)
    effective = 'consensus'
    label =
      wanted.length === fulfilled.length
        ? 'Consensus'
        : 'Consensus · ' + wanted.map((id) => SPREAD_LABELS[id] ?? id).join(' + ')
  }

  // A board without kickers or defenses (Sleeper ADP) still has to run a
  // full draft: splice the full-consensus K/DEF tail onto it.
  for (const pos of ['K', 'DEF']) {
    if (picked.some((r) => r.pos === pos)) continue
    const fill = fullConsensus.filter((r) => r.pos === pos).slice(0, 32)
    if (fill.length) picked = [...picked, ...fill.map((r, i) => ({ ...r, rank: picked.length + i + 1 }))]
  }

  // Per-outlet rank spread, attached to every player on whatever board was
  // picked — this is what feeds "goes as high as 4, as low as 18" in the UI.
  // Only the outlets actually blended into this board: a Sleeper+ESPN board
  // should not whisper NFL.com numbers on hover.
  const spread = new Map<string, Record<string, number>>()
  for (const [srcId, rows] of bySource.entries()) {
    if (!wanted.includes(srcId as DraftFeedId)) continue
    const srcLabel = SPREAD_LABELS[srcId]
    if (!srcLabel) continue
    for (const r of rows) {
      let e = spread.get(r.id)
      if (!e) spread.set(r.id, (e = {}))
      e[srcLabel] = r.rank
    }
  }

  return {
    source: effective,
    label,
    players: toBoardPlayers(picked, 340, spread),
    sources,
  }
}
