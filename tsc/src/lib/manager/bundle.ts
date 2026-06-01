// Manager Hub export bundle.
//
// Mirrors the leagues/pams bundle pattern: one cached map of file-path → value
// per chronicle, served by app/manager/[slug]/[[...path]]/route.ts. HTML files
// live on disk under src/templates/managers/ and are read by the route; the
// bundle here is JSON only — same split as lib/export/pams.ts vs leagues route.
//
// Caching strategy:
//   prod  → unstable_cache keyed by (chronicleId, slug), 1h TTL, tagged with
//           `chronicle-<id>` AND every linked `league-<id>`. League syncs
//           already revalidate league tags, so re-syncing a single linked
//           league busts this chronicle automatically.
//   dev   → in-memory devCache (same 30s TTL pattern as the leagues bundle)
//           so multi-fetch pages don't re-run the whole export per request.
//
// Bump BUNDLE_VERSION when the JSON shape changes — forces a rebuild on the
// next request instead of waiting out the TTL.

import { unstable_cache } from 'next/cache'
import { devCacheGet, devCacheSet } from '@/lib/devCache'
import { createClient } from '@/lib/supabase/server'
import { loadCareerChronicle, type CareerChronicle } from '@/lib/manager/chronicle'

const BUNDLE_VERSION = 'v2'

export type ManagerBundle = Record<string, unknown>

// Public-ish summary the Front Page hero + ticker + collage live on.
type CareerJson = {
  name: string
  subtitle: string | null
  slug: string
  yearsActive: { first: number | null; last: number | null }
  totals: CareerChronicle['totals']
  trophyCase: CareerChronicle['trophyCase']
  topRivalries: CareerChronicle['topRivalries']
  bestWins: CareerChronicle['bestWins']
  worstLosses: CareerChronicle['worstLosses']
  leagues: Array<{
    id: string
    name: string
    slug: string
    platform: string
    status: 'ready' | 'pending'
    seasons: number
    firstYear: number | null
    lastYear: number | null
    championships: number
    bestFinish: number | null
  }>
  pendingCount: number
  // Pre-baked "pull quote highlights" for the masthead — derived from totals,
  // so the template can render them without recomputing.
  highlights: string[]
}

type TimelineEntry = {
  year: number
  leagueName: string
  leagueSlug: string
  finalRank: number | null
  record: string
  champion: boolean
  runnerUp: boolean
  thirdPlace: boolean
  madePlayoffs: boolean
}

function buildHighlights(c: CareerChronicle): string[] {
  const out: string[] = []
  const t = c.totals
  if (t.championships > 0) out.push(`${t.championships}× Champion`)
  if (t.runnerUps > 0) out.push(`${t.runnerUps}× Runner-Up`)
  if (t.thirdPlaces > 0) out.push(`${t.thirdPlaces}× Third Place`)
  if (t.playoffAppearances > 0) out.push(`${t.playoffAppearances} Playoff Appearances`)
  if (t.leagues > 1) out.push(`${t.leagues}-League Veteran`)
  if (t.wins + t.losses > 0) out.push(`${(t.winPct * 100).toFixed(1)}% Lifetime`)
  return out.slice(0, 5)
}

function buildCareerJson(c: CareerChronicle): CareerJson {
  const first = c.leagues
    .map((l) => l.firstYear)
    .filter((y): y is number => y != null)
    .reduce<number | null>((a, b) => (a == null ? b : Math.min(a, b)), null)
  const last = c.leagues
    .map((l) => l.lastYear)
    .filter((y): y is number => y != null)
    .reduce<number | null>((a, b) => (a == null ? b : Math.max(a, b)), null)
  return {
    name: c.chronicle.displayName,
    subtitle: c.chronicle.subtitle,
    slug: c.chronicle.slug,
    yearsActive: { first, last },
    totals: c.totals,
    trophyCase: c.trophyCase,
    topRivalries: c.topRivalries,
    bestWins: c.bestWins,
    worstLosses: c.worstLosses,
    leagues: c.leagues.map((l) => ({
      id: l.leagueId,
      name: l.leagueName,
      slug: l.leagueSlug,
      platform: l.platform,
      status: l.status,
      seasons: l.seasonsPlayed,
      firstYear: l.firstYear,
      lastYear: l.lastYear,
      championships: l.championships,
      bestFinish: l.bestFinish,
    })),
    pendingCount: c.pendingCount,
    highlights: buildHighlights(c),
  }
}

function buildTimeline(c: CareerChronicle): TimelineEntry[] {
  const out: TimelineEntry[] = []
  for (const lg of c.leagues) {
    if (lg.status !== 'ready') continue
    for (const f of lg.finishes) {
      const wins = f.wins
      const losses = f.losses
      const ties = f.ties
      out.push({
        year: f.year,
        leagueName: lg.leagueName,
        leagueSlug: lg.leagueSlug,
        finalRank: f.rank,
        record: ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`,
        champion: f.champion,
        runnerUp: !f.champion && f.rank === 2,
        thirdPlace: !f.champion && f.rank === 3,
        madePlayoffs: f.madePlayoffs,
      })
    }
  }
  out.sort((a, b) => a.year - b.year || a.leagueName.localeCompare(b.leagueName))
  return out
}

async function buildBundleFromChronicle(c: CareerChronicle): Promise<ManagerBundle> {
  const career = buildCareerJson(c)
  const timeline = buildTimeline(c)
  const legacy = buildLegacy(c, career)
  return {
    'data/career.json': career,
    'data/timeline.json': timeline,
    'data/legacy.json': legacy,
  }
}

// ============================================================
// Issue II — Rise & Legacy
// ============================================================
// One long article structured as eras. Each era pulls together every data type
// active during that window — seasons, the drafts that fueled them, the rivals
// who showed up most — so the chapter reads as story, not stat dump.

type Era = {
  id: 'origins' | 'climb' | 'reign' | 'present' | 'middle'
  name: string
  yearRange: { first: number; last: number }
  leagues: string[]
  headline: string
  deck: string
  body: string[]
  finishes: Array<{
    year: number
    leagueName: string
    leagueSlug: string
    rank: number | null
    record: string
    champion: boolean
    runnerUp: boolean
    thirdPlace: boolean
    madePlayoffs: boolean
  }>
  titlesWon: Array<{
    year: number
    leagueName: string
    leagueSlug: string
    regRecord: string
    playoffRecord: string
    titleOpponent: string | null
    titleScoreFor: number | null
    titleScoreAgainst: number | null
  }>
  signaturePicks: Array<{
    year: number
    leagueName: string
    overall: number
    round: number
    player: string
    position: string | null
  }>
  highWeek: { year: number; leagueName: string; week: number; score: number } | null
}

type LegacyRivalry = {
  opponent: string
  games: number
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  playoffGames: number
  leagues: string[]
  narrative: string
}

type LegacyJson = {
  name: string
  yearsActive: { first: number | null; last: number | null }
  yearBand: Array<{ year: number; eraId: Era['id']; champion: boolean }>
  eras: Era[]
  rivalries: LegacyRivalry[]
  moments: {
    biggestWin: CareerChronicle['bestWins'][number] | null
    worstLoss: CareerChronicle['worstLosses'][number] | null
    longestWinStreak: CareerChronicle['streaks'][number] | null
    longestLossStreak: CareerChronicle['streaks'][number] | null
    weeklyHigh: CareerChronicle['weeklyHighs'][number] | null
    weeklyLow: CareerChronicle['weeklyLows'][number] | null
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Split the active timespan into eras. Anchor on titles when they exist
// (origins → reign → present); fall back to a thirds cut otherwise.
function buildEras(c: CareerChronicle): Era[] {
  const years = new Set<number>()
  for (const lg of c.leagues) {
    for (const f of lg.finishes) years.add(f.year)
  }
  const sorted = [...years].sort((a, b) => a - b)
  if (sorted.length === 0) return []

  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const titleYears = new Set<number>()
  for (const t of c.titleRuns) if (t.finish === 1) titleYears.add(t.year)

  type Bucket = { id: Era['id']; first: number; last: number }
  const buckets: Bucket[] = []

  if (titleYears.size > 0) {
    const titleArr = [...titleYears].sort((a, b) => a - b)
    const firstTitle = titleArr[0]!
    const lastTitle = titleArr[titleArr.length - 1]!
    if (first < firstTitle) buckets.push({ id: 'origins', first, last: firstTitle - 1 })
    buckets.push({ id: 'reign', first: firstTitle, last: lastTitle })
    if (lastTitle < last) buckets.push({ id: 'present', first: lastTitle + 1, last })
  } else {
    const span = last - first + 1
    if (span <= 2) {
      buckets.push({ id: 'origins', first, last })
    } else if (span <= 5) {
      const mid = first + Math.floor(span / 2) - 1
      buckets.push({ id: 'origins', first, last: mid })
      buckets.push({ id: 'present', first: mid + 1, last })
    } else {
      const a = first + Math.floor(span / 3) - 1
      const b = last - Math.floor(span / 3) + 1
      buckets.push({ id: 'origins', first, last: a })
      buckets.push({ id: 'middle', first: a + 1, last: b - 1 })
      buckets.push({ id: 'present', first: b, last })
    }
  }

  return buckets.map((b) => buildEra(c, b)).filter((e) => e.finishes.length > 0)
}

function buildEra(c: CareerChronicle, b: { id: Era['id']; first: number; last: number }): Era {
  const inRange = (yr: number) => yr >= b.first && yr <= b.last

  const finishes: Era['finishes'] = []
  const leagues = new Set<string>()
  for (const lg of c.leagues) {
    if (lg.status !== 'ready') continue
    for (const f of lg.finishes) {
      if (!inRange(f.year)) continue
      leagues.add(lg.leagueName)
      const ties = f.ties
      finishes.push({
        year: f.year,
        leagueName: lg.leagueName,
        leagueSlug: lg.leagueSlug,
        rank: f.rank,
        record: ties > 0 ? `${f.wins}-${f.losses}-${ties}` : `${f.wins}-${f.losses}`,
        champion: f.champion,
        runnerUp: !f.champion && f.rank === 2,
        thirdPlace: !f.champion && f.rank === 3,
        madePlayoffs: f.madePlayoffs,
      })
    }
  }
  finishes.sort((a, b2) => a.year - b2.year || a.leagueName.localeCompare(b2.leagueName))

  const titlesWon = c.titleRuns
    .filter((t) => t.finish === 1 && inRange(t.year))
    .map((t) => ({
      year: t.year,
      leagueName: t.leagueName,
      leagueSlug: t.leagueSlug,
      regRecord: t.regRecord,
      playoffRecord: t.playoffRecord,
      titleOpponent: t.titleOpponent,
      titleScoreFor: t.titleScoreFor,
      titleScoreAgainst: t.titleScoreAgainst,
    }))

  const signaturePicks = c.picks
    .filter((p) => inRange(p.year) && p.round <= 2)
    .sort((a, b2) => a.year - b2.year || a.overall - b2.overall)
    .slice(0, 5)
    .map((p) => ({
      year: p.year,
      leagueName: p.leagueName,
      overall: p.overall,
      round: p.round,
      player: p.player,
      position: p.position,
    }))

  let highWeek: Era['highWeek'] = null
  for (const w of c.weeklyHighs) {
    if (!inRange(w.year)) continue
    if (highWeek == null || w.score > highWeek.score) {
      highWeek = { year: w.year, leagueName: w.leagueName, week: w.week, score: w.score }
    }
  }

  const { headline, deck, body } = composeNarrative(b, finishes, titlesWon, signaturePicks)

  return {
    id: b.id,
    name: nameFor(b.id),
    yearRange: { first: b.first, last: b.last },
    leagues: [...leagues],
    headline,
    deck,
    body,
    finishes,
    titlesWon,
    signaturePicks,
    highWeek,
  }
}

function nameFor(id: Era['id']): string {
  switch (id) {
    case 'origins': return 'The Early Years'
    case 'climb':   return 'The Climb'
    case 'reign':   return 'The Reign'
    case 'middle':  return 'The Body of Work'
    case 'present': return 'Recent History'
  }
}

// Auto-generate the narrative paragraphs from the era's data. Sentences are
// composed deterministically — no LLM — so the wording is stable across
// renders. Edits to phrasing happen here.
function composeNarrative(
  bucket: { id: Era['id']; first: number; last: number },
  finishes: Era['finishes'],
  titles: Era['titlesWon'],
  picks: Era['signaturePicks'],
): { headline: string; deck: string; body: string[] } {
  const span = bucket.last - bucket.first + 1
  const yearLabel = bucket.first === bucket.last ? `${bucket.first}` : `${bucket.first}–${bucket.last}`
  const playoffYears = finishes.filter((f) => f.madePlayoffs).length
  const champCount = finishes.filter((f) => f.champion).length

  let headline = ''
  let deck = ''
  switch (bucket.id) {
    case 'origins':
      headline = span === 1 ? `The Rookie Season — ${yearLabel}` : `The Early Years — ${yearLabel}`
      deck = champCount > 0
        ? `A debut written in gold: ${champCount} ${champCount === 1 ? 'ring' : 'rings'} before the ink dried.`
        : playoffYears > 0
          ? `${playoffYears} playoff ${playoffYears === 1 ? 'appearance' : 'appearances'} out of the gate.`
          : 'The first chapters — finding the league, finding a system.'
      break
    case 'reign':
      headline = champCount > 1 ? `The Reign — ${champCount} Rings, ${yearLabel}` : `The Title Year — ${yearLabel}`
      deck = `Hardware in hand, the rest of the league played catch-up.`
      break
    case 'present':
      headline = `Recent Form — ${yearLabel}`
      deck = champCount > 0
        ? `Still adding hardware. ${champCount} more ${champCount === 1 ? 'ring' : 'rings'} in this stretch.`
        : playoffYears > 0
          ? `${playoffYears} playoff ${playoffYears === 1 ? 'run' : 'runs'} in the current era.`
          : `Reload mode — the game between the rings.`
      break
    case 'middle':
      headline = `The Body of Work — ${yearLabel}`
      deck = `${playoffYears} playoff trips across ${span} seasons.`
      break
    case 'climb':
      headline = `The Climb — ${yearLabel}`
      deck = `Stacking the foundation.`
      break
  }

  const body: string[] = []

  if (finishes.length > 0) {
    const lead = finishes.find((f) => f.champion) ?? finishes.find((f) => f.runnerUp) ?? finishes.find((f) => f.madePlayoffs) ?? finishes[0]
    if (lead && lead.champion) {
      body.push(
        `It opened in <strong>${lead.year}</strong> with a championship in <em>${lead.leagueName}</em> — a <strong>${lead.record}</strong> regular season that turned into the only finish that matters.`,
      )
    } else if (lead && lead.runnerUp) {
      body.push(
        `${lead.year} set the tone: a <strong>${lead.record}</strong> run that fell one game short of the ring in <em>${lead.leagueName}</em>.`,
      )
    } else if (lead) {
      body.push(
        `${lead.year} kicked it off in <em>${lead.leagueName}</em> — a <strong>${lead.record}</strong> finish at <strong>${lead.rank ? ordinal(lead.rank) : '—'}</strong>.`,
      )
    }
  }

  for (const t of titles) {
    if (t.titleOpponent && t.titleScoreFor != null && t.titleScoreAgainst != null) {
      body.push(
        `In <strong>${t.year}</strong>, the ring came in <em>${t.leagueName}</em> on the back of a <strong>${t.regRecord}</strong> regular season and a ` +
        `<strong>${t.playoffRecord}</strong> playoff run, closed out <strong>${t.titleScoreFor.toFixed(1)}–${t.titleScoreAgainst.toFixed(1)}</strong> over <em>${t.titleOpponent}</em>.`,
      )
    } else {
      body.push(
        `<strong>${t.year}</strong>: another ring in <em>${t.leagueName}</em> — <strong>${t.regRecord}</strong> regular, <strong>${t.playoffRecord}</strong> in the playoffs.`,
      )
    }
  }

  if (picks.length > 0) {
    const lines = picks
      .map((p) => `<strong>${p.year} R${p.round}.${(p.overall % 100) || p.overall}</strong> ${p.player}${p.position ? ` (${p.position})` : ''}`)
      .join(', ')
    body.push(`The board took shape early — ${lines}.`)
  }

  if (body.length === 0 && finishes.length > 0) {
    const list = finishes
      .slice(0, 4)
      .map((f) => `<strong>${f.year}</strong> ${f.record} (${f.rank ? ordinal(f.rank) : '—'})`)
      .join(' · ')
    body.push(`Across the stretch: ${list}.`)
  }

  return { headline, deck, body }
}

function buildRivalries(c: CareerChronicle): LegacyRivalry[] {
  return c.topRivalries.slice(0, 6).map((r) => {
    const decided = r.wins + r.losses
    const winPct = decided > 0 ? r.wins / decided : 0
    let narrative = ''
    if (r.games >= 10 && winPct >= 0.6) {
      narrative = `Owned ${r.opponent} across ${r.games} meetings — ${(winPct * 100).toFixed(0)}% win rate, ${r.playoffGames} of them in the playoffs.`
    } else if (r.games >= 10 && winPct <= 0.4) {
      narrative = `${r.opponent} had the number: ${r.wins}-${r.losses} across ${r.games} matchups${r.playoffGames > 0 ? `, including ${r.playoffGames} in the bracket.` : '.'}`
    } else if (r.playoffGames >= 2) {
      narrative = `A true playoff rival — ${r.playoffGames} bracket meetings inside ${r.games} total.`
    } else {
      narrative = `${r.games} meetings, ${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}.`
    }
    return {
      opponent: r.opponent,
      games: r.games,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      pointsFor: r.pointsFor,
      pointsAgainst: r.pointsAgainst,
      playoffGames: r.playoffGames,
      leagues: r.leagues,
      narrative,
    }
  })
}

function buildLegacy(c: CareerChronicle, career: CareerJson): LegacyJson {
  const eras = buildEras(c)

  const yearToEra = new Map<number, Era['id']>()
  for (const era of eras) {
    for (let y = era.yearRange.first; y <= era.yearRange.last; y++) yearToEra.set(y, era.id)
  }
  const champYears = new Set<number>()
  for (const t of c.titleRuns) if (t.finish === 1) champYears.add(t.year)
  const yearBand: LegacyJson['yearBand'] = []
  if (career.yearsActive.first != null && career.yearsActive.last != null) {
    for (let y = career.yearsActive.first; y <= career.yearsActive.last; y++) {
      const eraId = yearToEra.get(y) ?? 'middle'
      yearBand.push({ year: y, eraId, champion: champYears.has(y) })
    }
  }

  const longestWin = c.streaks.find((s) => s.kind === 'win') ?? null
  const longestLoss = c.streaks.find((s) => s.kind === 'loss') ?? null

  return {
    name: c.chronicle.displayName,
    yearsActive: career.yearsActive,
    yearBand,
    eras,
    rivalries: buildRivalries(c),
    moments: {
      biggestWin: c.bestWins[0] ?? null,
      worstLoss: c.worstLosses[0] ?? null,
      longestWinStreak: longestWin,
      longestLossStreak: longestLoss,
      weeklyHigh: c.weeklyHighs[0] ?? null,
      weeklyLow: c.weeklyLows[0] ?? null,
    },
  }
}

// Resolve chronicle + owner — the bundle is owner-gated, so we need both the
// slug (URL key) and the requesting user's id (auth gate). Returns null if the
// chronicle doesn't exist OR doesn't belong to this user.
export async function getManagerBundle(slug: string, ownerId: string): Promise<{
  chronicleId: string
  bundle: ManagerBundle
} | null> {
  const supabase = await createClient()
  const { data: chron } = await supabase
    .from('career_chronicles')
    .select('id')
    .eq('slug', slug)
    .eq('owner_id', ownerId)
    .maybeSingle<{ id: string }>()
  if (!chron) return null
  const chronicleId = chron.id

  // Pull the linked league ids first so we can tag the cache with each
  // `league-<id>` — league syncs already revalidate those tags, which means a
  // single league re-sync transparently busts this chronicle bundle too.
  const { data: links } = await supabase
    .from('career_links')
    .select('league_id')
    .eq('chronicle_id', chronicleId)
  const leagueIds: string[] = (links ?? []).map((r) => r.league_id as string).filter(Boolean)

  if (process.env.NODE_ENV !== 'production') {
    const key = `mgr-bundle|${BUNDLE_VERSION}|${chronicleId}|${slug}`
    const hit = devCacheGet(key)
    if (hit) return { chronicleId, bundle: hit as ManagerBundle }
    const c = await loadCareerChronicle(slug, ownerId)
    if (!c) return null
    const bundle = await buildBundleFromChronicle(c)
    devCacheSet(key, bundle)
    return { chronicleId, bundle }
  }

  const tags = [`chronicle-${chronicleId}`, ...leagueIds.map((id) => `league-${id}`)]
  const cached = unstable_cache(
    async () => {
      const c = await loadCareerChronicle(slug, ownerId)
      if (!c) return null
      return buildBundleFromChronicle(c)
    },
    ['mgr-bundle', BUNDLE_VERSION, chronicleId, slug],
    { tags, revalidate: 3600 },
  )
  const bundle = await cached()
  if (!bundle) return null
  return { chronicleId, bundle }
}
