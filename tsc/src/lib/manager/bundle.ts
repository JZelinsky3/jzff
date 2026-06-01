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

const BUNDLE_VERSION = 'v7'

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
  // Editorial copy — lede paragraph + per-section intros. Generated server-side
  // from chronicle data so the template can render them without recomputing.
  intro: string
  sectionIntros: {
    numbers: string
    trophies: string
    timeline: string
  }
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
    intro: composeFrontIntro(c, first, last),
    sectionIntros: composeFrontSectionIntros(c),
  }
}

function composeFrontIntro(c: CareerChronicle, first: number | null, last: number | null): string {
  const t = c.totals
  const range = first != null && last != null
    ? (first === last ? `${first}` : `${first}–${last}`)
    : 'on the calendar'
  if (t.championships > 0) {
    return `${t.leagues} ${t.leagues === 1 ? 'league' : 'leagues'}, ${t.seasonsPlayed} seasons, ${t.championships} ${t.championships === 1 ? 'ring' : 'rings'} — the bound front matter of a career running ${range}. ` +
      `The Grand Chronicle is the cover page; Issues II–VI weave the rest of the story.`
  }
  if (t.playoffAppearances > 0) {
    return `${t.leagues} ${t.leagues === 1 ? 'league' : 'leagues'}, ${t.seasonsPlayed} seasons, ${t.playoffAppearances} playoff ${t.playoffAppearances === 1 ? 'appearance' : 'appearances'} across ${range}. ` +
      `Still chasing the first ring — the Grand Chronicle is the front matter, the rest of the books carry the receipts.`
  }
  return `${t.leagues} ${t.leagues === 1 ? 'league' : 'leagues'}, ${t.seasonsPlayed} seasons, running ${range}. ` +
    `Early chapters of a chronicle still being written. Issues II–VI fill in the story.`
}

function composeFrontSectionIntros(c: CareerChronicle): CareerJson['sectionIntros'] {
  const t = c.totals
  return {
    numbers:
      `Eight tiles, eight totals. Every regular-season point, every championship-bracket game, ` +
      `every ring in the case — rolled up across ${t.leagues || 'all'} ${t.leagues === 1 ? 'league' : 'leagues'} into ` +
      `one cumulative read. Consolation games sit out by design (the almanac rule).`,
    trophies: t.championships + t.runnerUps + t.thirdPlaces > 0
      ? `Hardware, year by year. Gold for champion, rust for runner-up, steel for bronze. ` +
        `Each piece links back to the season that earned it.`
      : `No podium finishes on file yet — when the first one lands, this is where it gets cataloged.`,
    timeline:
      `Every active season, side by side. Champion years glow gold, runners and bronze get their ` +
      `own borders, missed-bracket years run dashed. Click any tile for the full per-year deep ` +
      `dive (mixes draft + roster + h2h + extremes for that year).`,
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
  const dynasty = buildDynasty(c)
  const seasons = buildSeasonsHub(c)
  const vault = buildVault(c)
  const warRoom = buildWarRoom(c)
  const wire = buildWire(c)
  // Bundle keys match the leagues pattern: NO `data/` prefix. The catch-all
  // route's resolveRequest() strips the `data/` segment from URLs before
  // looking up the bundle, so /manager/<slug>/data/career.json → 'career.json'.
  const out: ManagerBundle = {
    'career.json': career,
    'timeline.json': timeline,
    'legacy.json': legacy,
    'dynasty.json': dynasty,
    'seasons.json': seasons,
    'vault.json': vault,
    'war-room.json': warRoom,
    'war-room/wire.json': wire,
  }
  for (const yr of seasons.years) {
    out[`seasons/${yr}.json`] = buildSeasonDeepDive(c, yr)
  }
  return out
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

// ============================================================
// Issue III — The Dynasty Files
// ============================================================
// Per-league dynasty arc: how the franchise has grown across years, the draft
// anchors that built it, hardware count. KTC portfolio + trade analyzer come
// in a later phase — sections render as "Coming Soon" until that data lands.

type DynastyAnchor = {
  year: number
  round: number
  overall: number
  player: string
  position: string | null
}

type DynastyLeague = {
  id: string
  name: string
  slug: string
  platform: string
  firstYear: number | null
  lastYear: number | null
  yearsActive: number
  championships: number
  runnerUps: number
  thirdPlaces: number
  bestFinish: number | null
  playoffAppearances: number
  totalPicks: number
  // Top draft anchors — earliest-round picks made over the league's history.
  anchors: DynastyAnchor[]
  // Season ledger keyed by year, summarized for the per-league timeline.
  arc: Array<{ year: number; rank: number | null; record: string; champion: boolean }>
}

type DynastyJson = {
  name: string
  totalLeagues: number
  totalChampionships: number
  // Per-league entries, ordered by championships desc then years active desc.
  leagues: DynastyLeague[]
  // Marker for sections rendered as "coming soon" until KTC + trade data wire in.
  upcoming: {
    portfolioChart: { enabled: boolean; reason: string }
    tradeAnalyzer: { enabled: boolean; reason: string }
    ktcValueLine: { enabled: boolean; reason: string }
  }
}

function buildDynasty(c: CareerChronicle): DynastyJson {
  const leagues: DynastyLeague[] = c.leagues
    .filter((l) => l.status === 'ready')
    .map((lg) => {
      const myPicks = c.picks.filter((p) => p.leagueSlug === lg.leagueSlug)
      const anchors: DynastyAnchor[] = myPicks
        .filter((p) => p.round <= 3)
        .sort((a, b) => a.year - b.year || a.overall - b.overall)
        .slice(0, 12)
        .map((p) => ({
          year: p.year,
          round: p.round,
          overall: p.overall,
          player: p.player,
          position: p.position,
        }))

      const arc = lg.finishes.map((f) => {
        const ties = f.ties
        return {
          year: f.year,
          rank: f.rank,
          record: ties > 0 ? `${f.wins}-${f.losses}-${ties}` : `${f.wins}-${f.losses}`,
          champion: f.champion,
        }
      }).sort((a, b) => a.year - b.year)

      return {
        id: lg.leagueId,
        name: lg.leagueName,
        slug: lg.leagueSlug,
        platform: lg.platform,
        firstYear: lg.firstYear,
        lastYear: lg.lastYear,
        yearsActive: lg.seasonsPlayed,
        championships: lg.championships,
        runnerUps: lg.runnerUps,
        thirdPlaces: lg.thirdPlaces,
        bestFinish: lg.bestFinish,
        playoffAppearances: lg.playoffAppearances,
        totalPicks: myPicks.length,
        anchors,
        arc,
      }
    })
    .sort((a, b) => b.championships - a.championships || b.yearsActive - a.yearsActive)

  return {
    name: c.chronicle.displayName,
    totalLeagues: leagues.length,
    totalChampionships: leagues.reduce((s, l) => s + l.championships, 0),
    leagues,
    upcoming: {
      portfolioChart: { enabled: false, reason: 'KTC valuation history is not yet wired into the chronicle bundle.' },
      tradeAnalyzer: { enabled: false, reason: 'Cross-league trade history pipeline ships in Phase 6.' },
      ktcValueLine: { enabled: false, reason: 'Per-player KTC time series will live here once ingest lands.' },
    },
  }
}

// ============================================================
// Issue IV — Seasons of Glory & Heartbreak
// ============================================================
// Thematic groupings (Dominance / Near Misses / Rebuilds / Multi-League) plus
// a per-year deep-dive sub-page that mixes finish + draft + rivals + extremes.

type SeasonTheme = 'dominance' | 'near-miss' | 'rebuild'

type SeasonEntry = {
  year: number
  leagueName: string
  leagueSlug: string
  rank: number | null
  record: string
  champion: boolean
  runnerUp: boolean
  thirdPlace: boolean
  madePlayoffs: boolean
  theme: SeasonTheme
}

type SeasonsHubJson = {
  name: string
  years: number[]          // distinct years across all leagues, ascending
  byYear: Array<{ year: number; entries: SeasonEntry[]; multiLeague: boolean }>
  themes: {
    dominance: SeasonEntry[]
    nearMiss: SeasonEntry[]
    rebuild: SeasonEntry[]
    multiLeague: Array<{ year: number; leagues: SeasonEntry[] }>
  }
  counts: { total: number; dominance: number; nearMiss: number; rebuild: number; multiLeague: number }
}

function classifySeason(
  f: CareerChronicle['leagues'][number]['finishes'][number],
): SeasonTheme {
  if (f.champion || f.rank === 2 || f.rank === 3) return 'dominance'
  if (f.madePlayoffs) return 'near-miss'
  return 'rebuild'
}

function buildSeasonsHub(c: CareerChronicle): SeasonsHubJson {
  const all: SeasonEntry[] = []
  for (const lg of c.leagues) {
    if (lg.status !== 'ready') continue
    for (const f of lg.finishes) {
      all.push({
        year: f.year,
        leagueName: lg.leagueName,
        leagueSlug: lg.leagueSlug,
        rank: f.rank,
        record: f.ties > 0 ? `${f.wins}-${f.losses}-${f.ties}` : `${f.wins}-${f.losses}`,
        champion: f.champion,
        runnerUp: !f.champion && f.rank === 2,
        thirdPlace: !f.champion && f.rank === 3,
        madePlayoffs: f.madePlayoffs,
        theme: classifySeason(f),
      })
    }
  }
  all.sort((a, b) => b.year - a.year || a.leagueName.localeCompare(b.leagueName))

  // Group by year for the timeline view.
  const byYearMap = new Map<number, SeasonEntry[]>()
  for (const s of all) {
    const arr = byYearMap.get(s.year) ?? []
    arr.push(s)
    byYearMap.set(s.year, arr)
  }
  const byYear = [...byYearMap.entries()]
    .map(([year, entries]) => ({ year, entries, multiLeague: entries.length >= 2 }))
    .sort((a, b) => b.year - a.year)

  const dominance = all.filter((s) => s.theme === 'dominance')
  const nearMiss = all.filter((s) => s.theme === 'near-miss')
  const rebuild = all.filter((s) => s.theme === 'rebuild')
  const multiLeague = byYear
    .filter((y) => y.multiLeague)
    .map((y) => ({ year: y.year, leagues: y.entries }))

  const years = [...byYearMap.keys()].sort((a, b) => a - b)

  return {
    name: c.chronicle.displayName,
    years,
    byYear,
    themes: { dominance, nearMiss, rebuild, multiLeague },
    counts: {
      total: all.length,
      dominance: dominance.length,
      nearMiss: nearMiss.length,
      rebuild: rebuild.length,
      multiLeague: multiLeague.length,
    },
  }
}

// ────────────────────────────────────────────────
// Per-year deep dive
// ────────────────────────────────────────────────

type SeasonLeagueDeepDive = {
  leagueName: string
  leagueSlug: string
  platform: string
  rank: number | null
  record: string
  champion: boolean
  runnerUp: boolean
  thirdPlace: boolean
  madePlayoffs: boolean
  theme: SeasonTheme
  // Mixed-data per-season:
  draftPicks: Array<{
    overall: number
    round: number
    roundPick: number
    player: string
    position: string | null
    nflTeam: string | null
  }>
  rivalsContext: Array<{
    opponent: string
    leagueRecord: string  // career-vs-this-opponent in this league (not per-year)
    totalGames: number
    playoffGames: number
  }>
  titleNote: {
    opponent: string | null
    scoreFor: number | null
    scoreAgainst: number | null
  } | null
  weekly: {
    highScore: number | null
    highWeek: number | null
    lowScore: number | null
  }
}

type SeasonDeepDive = {
  year: number
  managerName: string
  leagues: SeasonLeagueDeepDive[]
  multiLeague: boolean
  champCount: number
  combinedRecord: string
  // Cross-league summary blurb.
  headline: string
  deck: string
}

function buildSeasonDeepDive(c: CareerChronicle, year: number): SeasonDeepDive {
  const leagues: SeasonLeagueDeepDive[] = []
  let wins = 0, losses = 0, ties = 0, champs = 0

  for (const lg of c.leagues) {
    if (lg.status !== 'ready') continue
    const f = lg.finishes.find((x) => x.year === year)
    if (!f) continue

    const draftPicks = c.picks
      .filter((p) => p.leagueSlug === lg.leagueSlug && p.year === year)
      .sort((a, b) => a.overall - b.overall)
      .map((p) => ({
        overall: p.overall,
        round: p.round,
        roundPick: p.roundPick,
        player: p.player,
        position: p.position,
        nflTeam: p.nflTeam,
      }))

    const rivalsContext = c.h2hPerLeague
      .filter((r) => r.leagueSlug === lg.leagueSlug)
      .slice(0, 6)
      .map((r) => ({
        opponent: r.opponent,
        leagueRecord: r.totalRecord,
        totalGames: r.totalGames,
        playoffGames: 0,
      }))

    const tr = c.titleRuns.find((t) => t.year === year && t.leagueSlug === lg.leagueSlug && t.finish === 1)
    const titleNote = tr ? {
      opponent: tr.titleOpponent,
      scoreFor: tr.titleScoreFor,
      scoreAgainst: tr.titleScoreAgainst,
    } : null

    const briefs = c.seasonBriefs.find((s) => s.year === year && s.leagueSlug === lg.leagueSlug)
    const weekly = {
      highScore: briefs?.highWeekScore ?? null,
      highWeek: briefs?.highWeek ?? null,
      lowScore: briefs?.lowWeekScore ?? null,
    }

    wins += f.wins
    losses += f.losses
    ties += f.ties
    if (f.champion) champs += 1

    leagues.push({
      leagueName: lg.leagueName,
      leagueSlug: lg.leagueSlug,
      platform: lg.platform,
      rank: f.rank,
      record: f.ties > 0 ? `${f.wins}-${f.losses}-${f.ties}` : `${f.wins}-${f.losses}`,
      champion: f.champion,
      runnerUp: !f.champion && f.rank === 2,
      thirdPlace: !f.champion && f.rank === 3,
      madePlayoffs: f.madePlayoffs,
      theme: classifySeason(f),
      draftPicks,
      rivalsContext,
      titleNote,
      weekly,
    })
  }

  const multiLeague = leagues.length >= 2
  const combinedRecord = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`

  // Compose a headline + deck for the year masthead.
  let headline = `${year} Season`
  let deck = ''
  if (champs > 0 && multiLeague) {
    headline = `${year} — ${champs}× Champion`
    deck = `${champs} ring${champs === 1 ? '' : 's'} across ${leagues.length} leagues. The year of the double crown${champs === 2 ? '' : '+'}.`
  } else if (champs > 0) {
    headline = `${year} — Champion`
    deck = `Hardware. ${combinedRecord} on the road to a ring.`
  } else if (multiLeague) {
    headline = `${year} — Multi-League Mayhem`
    deck = `Active in ${leagues.length} leagues simultaneously. A ${combinedRecord} combined.`
  } else if (leagues.length > 0) {
    const l = leagues[0]!
    if (l.runnerUp) {
      headline = `${year} — Runner-Up`
      deck = `${l.record} in ${l.leagueName}, one game short.`
    } else if (l.madePlayoffs) {
      headline = `${year} — Playoff Run`
      deck = `${l.record} in ${l.leagueName}, ${l.rank ? ordinal(l.rank) : '—'} place finish.`
    } else {
      headline = `${year} — The Rebuild`
      deck = `${l.record} in ${l.leagueName}.`
    }
  }

  return {
    year,
    managerName: c.chronicle.displayName,
    leagues,
    multiLeague,
    champCount: champs,
    combinedRecord,
    headline,
    deck,
  }
}

// ============================================================
// Issue V — The Record Vault
// ============================================================
// Personal record book + draft pedigree (faux Hall of Fame from picks) +
// Records Watch placeholder for in-season tracking. Editorial copy is built
// into the data so the template can quote it directly — keeps the page
// reading like a feature, not a stat dump.

type VaultRecord = {
  label: string
  value: string
  context: string  // a sentence of color: when, against whom, why it matters
  meta: string     // small mono caption — league, year, week
  flavor?: 'gold' | 'rust' | 'steel' | 'cream'
}

type VaultJson = {
  name: string
  intro: string            // editor's lede — what the vault is
  totalRecords: number
  // Career headline records — the 6-8 numbers that define the chronicle.
  headlines: VaultRecord[]
  // Single-game vault — the loudest individual games.
  singleGame: {
    intro: string
    items: VaultRecord[]
  }
  // The Streak Files.
  streaks: {
    intro: string
    items: VaultRecord[]
  }
  // Draft Pedigree — most-drafted players + earliest picks. Stand-in for HoF
  // until per-player tenure tracking lands.
  pedigree: {
    intro: string
    repeatPicks: Array<{ player: string; position: string | null; times: number; years: number[]; leagues: string[] }>
    earliestPicks: Array<{ year: number; leagueName: string; round: number; overall: number; player: string; position: string | null }>
  }
  // Watch — Coming Soon until current-season pipeline lands.
  watch: {
    enabled: boolean
    intro: string
    note: string
  }
}

function fmtPts(n: number | null | undefined): string {
  if (n == null) return '—'
  return (Math.round(n * 10) / 10).toFixed(1)
}

function buildVault(c: CareerChronicle): VaultJson {
  const t = c.totals
  const yrFirst = Math.min(...c.leagues.map((l) => l.firstYear ?? 9999))
  const yrLast = Math.max(...c.leagues.map((l) => l.lastYear ?? 0))
  const yrRange = (yrFirst === 9999 || yrLast === 0)
    ? '—'
    : (yrFirst === yrLast ? `${yrFirst}` : `${yrFirst}–${yrLast}`)

  // ─── Headline records ───────────────────────────────────────────
  const decided = t.wins + t.losses
  const ppg = t.seasonsPlayed > 0 ? t.pointsFor / Math.max(1, t.seasonsPlayed * 14) : 0
  const headlines: VaultRecord[] = []
  headlines.push({
    label: 'Total Points',
    value: Math.round(t.pointsFor).toLocaleString('en-US'),
    context: `Across ${t.seasonsPlayed} seasons and ${t.leagues} ${t.leagues === 1 ? 'league' : 'leagues'} — every regular-season point you've banked, cumulative.`,
    meta: `${yrRange} · all leagues`,
    flavor: 'gold',
  })
  headlines.push({
    label: 'Lifetime Record',
    value: t.ties ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`,
    context: decided > 0
      ? `A ${(t.winPct * 100).toFixed(1)}% win rate across ${decided} decisions. Consolation games are excluded — only championship-bracket playoff games count.`
      : 'No decided games on record yet.',
    meta: `${yrRange} · regular + playoff`,
    flavor: 'cream',
  })
  if (t.championships > 0) {
    headlines.push({
      label: 'Championships',
      value: String(t.championships),
      context: `Banked hardware. ${t.runnerUps} runner-up finish${t.runnerUps === 1 ? '' : 'es'} and ${t.thirdPlaces} bronze on top of that — ${t.championships + t.runnerUps + t.thirdPlaces} podium appearance${t.championships + t.runnerUps + t.thirdPlaces === 1 ? '' : 's'} total.`,
      meta: `Trophy case · ${yrRange}`,
      flavor: 'gold',
    })
  }
  headlines.push({
    label: 'Playoff Apps',
    value: String(t.playoffAppearances),
    context: t.playoffAppearances > 0
      ? `Punched ${t.playoffAppearances} brackets and went ${t.playoffWins}-${t.playoffLosses} in championship-bracket games — that's the rule the almanac uses (no consolation noise).`
      : `Still chasing the first bracket appearance.`,
    meta: `${t.playoffWins}-${t.playoffLosses} in bracket games`,
    flavor: 'steel',
  })
  headlines.push({
    label: 'Avg PPG (est.)',
    value: fmtPts(ppg),
    context: `Rough scoring rate, assuming a ~14-week regular season per league. Useful as a heuristic, not a hard record.`,
    meta: `${t.seasonsPlayed} seasons sampled`,
    flavor: 'cream',
  })
  if (t.runnerUps > 0 || t.thirdPlaces > 0) {
    headlines.push({
      label: 'Podium Finishes',
      value: String(t.runnerUps + t.thirdPlaces + t.championships),
      context: `Champion, runner-up, or bronze. The seasons that ended on a podium — the close calls + the closers.`,
      meta: `${t.championships} 1st · ${t.runnerUps} 2nd · ${t.thirdPlaces} 3rd`,
      flavor: 'gold',
    })
  }

  // ─── Single game vault ──────────────────────────────────────────
  const sg: VaultRecord[] = []
  const big = c.bestWins[0]
  if (big) {
    sg.push({
      label: 'Biggest Win',
      value: `${fmtPts(big.score)} – ${fmtPts(big.oppScore)}`,
      context: `A +${fmtPts(big.margin)} margin over ${big.opponent}${big.isPlayoff ? ' in the playoffs' : ''}. Among the loudest single-game blowouts on file.`,
      meta: `${big.leagueName} · ${big.year} · Wk ${big.week}`,
      flavor: 'gold',
    })
  }
  const wl = c.worstLosses[0]
  if (wl) {
    sg.push({
      label: 'Worst Loss',
      value: `${fmtPts(wl.score)} – ${fmtPts(wl.oppScore)}`,
      context: `A ${fmtPts(wl.margin)} margin against ${wl.opponent}${wl.isPlayoff ? ' in the playoffs' : ''}. The kind of week that haunts a chronicle.`,
      meta: `${wl.leagueName} · ${wl.year} · Wk ${wl.week}`,
      flavor: 'rust',
    })
  }
  const hi = c.weeklyHighs[0]
  if (hi) {
    sg.push({
      label: 'Highest Week',
      value: fmtPts(hi.score),
      context: `Franchise-tier scoring. The number that other managers in ${hi.leagueName} still bring up.`,
      meta: `${hi.leagueName} · ${hi.year}${hi.week ? ` · Wk ${hi.week}` : ''}`,
      flavor: 'gold',
    })
  }
  const lo = c.weeklyLows[0]
  if (lo) {
    sg.push({
      label: 'Lowest Week',
      value: fmtPts(lo.score),
      context: `The number you'd rather forget. Every team has one — this is yours.`,
      meta: `${lo.leagueName} · ${lo.year}`,
      flavor: 'rust',
    })
  }
  // Add second-best blowout when we have enough data, for variety.
  const big2 = c.bestWins[1]
  if (big2) {
    sg.push({
      label: 'Second-Biggest',
      value: `${fmtPts(big2.score)} – ${fmtPts(big2.oppScore)}`,
      context: `Margin +${fmtPts(big2.margin)} over ${big2.opponent}. Receipts on receipts.`,
      meta: `${big2.leagueName} · ${big2.year} · Wk ${big2.week}`,
      flavor: 'cream',
    })
  }

  // ─── Streaks ────────────────────────────────────────────────────
  const wks: VaultRecord[] = []
  const winStreak = c.streaks.find((s) => s.kind === 'win')
  if (winStreak) {
    wks.push({
      label: 'Longest Win Streak',
      value: `${winStreak.length} W`,
      context: `${winStreak.length} games on the bounce — when ${winStreak.leagueName} couldn't find an answer.`,
      meta: `${winStreak.leagueName} · ${winStreak.when}`,
      flavor: 'gold',
    })
  }
  const lossStreak = c.streaks.find((s) => s.kind === 'loss')
  if (lossStreak) {
    wks.push({
      label: 'Longest Losing Streak',
      value: `${lossStreak.length} L`,
      context: `${lossStreak.length} straight defeats — the kind of skid the rebuild years are made of.`,
      meta: `${lossStreak.leagueName} · ${lossStreak.when}`,
      flavor: 'rust',
    })
  }

  // ─── Pedigree (HoF stand-in) ────────────────────────────────────
  type Bucket = { player: string; position: string | null; years: Set<number>; leagues: Set<string>; times: number }
  const byPlayer = new Map<string, Bucket>()
  for (const p of c.picks) {
    const key = p.player.trim().toLowerCase()
    if (!key) continue
    const cur = byPlayer.get(key) ?? { player: p.player, position: p.position, years: new Set<number>(), leagues: new Set<string>(), times: 0 }
    cur.years.add(p.year)
    cur.leagues.add(p.leagueName)
    cur.times += 1
    if (!cur.position && p.position) cur.position = p.position
    byPlayer.set(key, cur)
  }
  const repeatPicks = [...byPlayer.values()]
    .filter((b) => b.times >= 2)
    .sort((a, b) => b.times - a.times || a.player.localeCompare(b.player))
    .slice(0, 12)
    .map((b) => ({
      player: b.player,
      position: b.position,
      times: b.times,
      years: [...b.years].sort((a, b2) => a - b2),
      leagues: [...b.leagues],
    }))

  const earliestPicks = [...c.picks]
    .sort((a, b) => a.overall - b.overall || a.year - b.year)
    .slice(0, 10)
    .map((p) => ({
      year: p.year,
      leagueName: p.leagueName,
      round: p.round,
      overall: p.overall,
      player: p.player,
      position: p.position,
    }))

  return {
    name: c.chronicle.displayName,
    intro:
      `Everything that holds a place in the books. Career totals on top, the loudest single ` +
      `games below that, the streaks that defined the rebuilds and the runs, and the players ` +
      `who kept showing up on draft day. The Vault doesn't move — but new entries get filed every Sunday.`,
    totalRecords: headlines.length + sg.length + wks.length,
    headlines,
    singleGame: {
      intro:
        `Eight games, give or take. The blowouts. The collapses. The weeks where a lineup ` +
        `caught fire or fell apart and the league couldn't stop talking about it.`,
      items: sg,
    },
    streaks: {
      intro:
        `Momentum, in numbers. Win streaks are the seasons that built the trophy case. ` +
        `Loss streaks are the seasons that built whatever came after.`,
      items: wks,
    },
    pedigree: {
      intro:
        `The closest thing this chronicle has to a Hall of Fame: players drafted across ` +
        `multiple years and leagues — the names you keep coming back to — and the earliest ` +
        `picks on file, the franchise cornerstones laid round-one and round-two.`,
      repeatPicks,
      earliestPicks,
    },
    watch: {
      enabled: false,
      intro:
        `Records aren't just historic — some are live. Active streaks, points pace, win-rate ` +
        `windows you're currently inside. The Watch lights up once the in-season pipeline lands.`,
      note: 'Live records tracking ships with Phase 6 (The War Room).',
    },
  }
}

// ============================================================
// Issue VI — The War Room
// ============================================================
// Working tools — Player Desk, The Scout, Trade Desk. The hub here is editorial
// + a status read on each desk. The actual tool UIs still live as React routes
// (desk, scout, trade-builder) and will get the new design in a follow-up pass.

type DeskTile = {
  id: 'desk' | 'scout' | 'trade-desk'
  name: string
  kicker: string
  oneLiner: string
  body: string  // a paragraph of what this desk does
  href: string
  status: 'live' | 'sleeper-only' | 'beta'
  metrics: Array<{ label: string; value: string }>
}

type WarRoomJson = {
  name: string
  intro: string
  desks: DeskTile[]
  // Cross-desk summary line on what's active right now.
  callout: {
    leaguesLinked: number
    sleeperLeagues: number
    pendingLeagues: number
    note: string
  }
  // Editorial closer at the end of the page.
  closer: string
}

function buildWarRoom(c: CareerChronicle): WarRoomJson {
  const sleeperLeagues = c.leagues.filter((l) => l.platform === 'sleeper' && l.status === 'ready').length
  const otherLeagues = c.leagues.filter((l) => l.platform !== 'sleeper' && l.status === 'ready').length
  const pending = c.leagues.filter((l) => l.status === 'pending').length

  const slug = c.chronicle.slug
  const desks: DeskTile[] = [
    {
      id: 'desk',
      name: 'The Player Desk',
      kicker: 'Rosters & The Wire',
      oneLiner: 'Every active roster, side by side.',
      body:
        `Live rosters across every Sleeper league you've linked. Filter by position, scan ` +
        `the wire for free agents worth picking up, check who's on whose taxi. ESPN and ` +
        `Yahoo leagues show as "unsupported" until those live feeds land.`,
      href: `/manager/${slug}/desk`,
      status: 'sleeper-only',
      metrics: [
        { label: 'Sleeper leagues', value: String(sleeperLeagues) },
        { label: 'Other platforms', value: String(otherLeagues) },
      ],
    },
    {
      id: 'scout',
      name: 'The Scout',
      kicker: 'Needs & Targets',
      oneLiner: 'Position scarcity, scored against the league.',
      body:
        `Per-league position needs (where you're thin, where you're stacked) plus trade ` +
        `recommendations built from KTC values and the league's roster slot template. ` +
        `Designed to be a starting point for the Trade Desk, not the final word.`,
      href: `/manager/${slug}/scout`,
      status: 'sleeper-only',
      metrics: [
        { label: 'Sleeper leagues', value: String(sleeperLeagues) },
      ],
    },
    {
      id: 'trade-desk',
      name: 'The Trade Desk',
      kicker: 'Builder & Verdicts',
      oneLiner: 'Build a trade. Get a verdict.',
      body:
        `Pick a counterparty roster, drop players on each side, and the value engine grades ` +
        `the swap by tier and scarcity. Verdicts read like Sunday-paper takes — not just ` +
        `"Side A wins."`,
      href: `/manager/${slug}/trade-builder`,
      status: 'sleeper-only',
      metrics: [
        { label: 'Available counterparties', value: String(Math.max(0, sleeperLeagues * 11)) },
      ],
    },
  ]

  let note = ''
  if (sleeperLeagues > 0 && otherLeagues === 0 && pending === 0) {
    note = `${sleeperLeagues} Sleeper ${sleeperLeagues === 1 ? 'league' : 'leagues'} wired in. Every desk is live.`
  } else if (sleeperLeagues > 0 && otherLeagues > 0) {
    note = `${sleeperLeagues} Sleeper ${sleeperLeagues === 1 ? 'league' : 'leagues'} live. ${otherLeagues} non-Sleeper ${otherLeagues === 1 ? 'league' : 'leagues'} read-only for now.`
  } else if (sleeperLeagues === 0 && otherLeagues > 0) {
    note = `No Sleeper leagues linked — the desks won't have live data until at least one Sleeper league is added.`
  } else {
    note = `No leagues ready yet. Add one to wake the desks up.`
  }
  if (pending > 0) note += ` ${pending} ${pending === 1 ? 'league is' : 'leagues are'} mid-sync.`

  return {
    name: c.chronicle.displayName,
    intro:
      `Welcome to the working side of the chronicle. Issues I–V are the archive — what was. ` +
      `The War Room is what is: live rosters, position scouting, trade verdicts, and the in-` +
      `season Wire. Stop here when it's Sunday night and you've got a decision to make.`,
    desks,
    callout: {
      leaguesLinked: sleeperLeagues + otherLeagues,
      sleeperLeagues,
      pendingLeagues: pending,
      note,
    },
    closer:
      `The desks here still wear the old chapter design — they're being repainted in this ` +
      `volume's editorial style. Functionally they're the same tools the chronicle has shipped ` +
      `since launch. New copy on a familiar floor.`,
  }
}

// ────────────────────────────────────────────────
// Live Wire — sub-page at /war-room/wire
// ────────────────────────────────────────────────
// Pulls historic-side data from the chronicle (active rivalries / recent form
// / streaks heading into the season) and labels live-side blocks (this week's
// matchups, records currently being chased) as Coming Soon until the in-season
// pipeline lands.

type WireRecentForm = {
  leagueName: string
  leagueSlug: string
  lastYear: number | null
  lastRank: number | null
  lastRecord: string | null
  outlook: string  // editorial sentence
}

type WireJson = {
  name: string
  intro: string
  recentForm: {
    intro: string
    items: WireRecentForm[]
  }
  records: {
    intro: string
    chasing: Array<{ label: string; value: string; context: string }>
    live: { enabled: false; intro: string; note: string }
  }
  matchups: {
    enabled: false
    intro: string
    note: string
  }
}

function buildWire(c: CareerChronicle): WireJson {
  const recentForm: WireRecentForm[] = c.leagues
    .filter((l) => l.status === 'ready')
    .map((lg) => {
      const last = lg.finishes[lg.finishes.length - 1] ?? null
      const lastYear = last?.year ?? null
      const lastRank = last?.rank ?? null
      const lastRecord = last
        ? last.ties > 0 ? `${last.wins}-${last.losses}-${last.ties}` : `${last.wins}-${last.losses}`
        : null
      let outlook = ''
      if (last?.champion) {
        outlook = `Reigning champion in ${lg.leagueName}. The target is on the back this year.`
      } else if (last?.rank === 2) {
        outlook = `One game from the ring last time out. Built a contender — needs the close.`
      } else if (last?.madePlayoffs) {
        outlook = `Punched the bracket last year. The roster shape suggests another run is on the table.`
      } else if (last) {
        outlook = `Missed the bracket last season. Reload cycle — anchors stay, role players turn over.`
      } else {
        outlook = `No prior season on file. Fresh ink.`
      }
      return {
        leagueName: lg.leagueName,
        leagueSlug: lg.leagueSlug,
        lastYear,
        lastRank,
        lastRecord,
        outlook,
      }
    })

  // Records-chasing — historic-derived heuristics (no live data yet). We point
  // at the marquee numbers from the Vault and label them as the bar to clear.
  const t = c.totals
  const winStreak = c.streaks.find((s) => s.kind === 'win')
  const chasing: Array<{ label: string; value: string; context: string }> = []
  if (winStreak) {
    chasing.push({
      label: 'Win-Streak Mark',
      value: `${winStreak.length} W`,
      context: `Currently the line to beat. Any active streak that runs longer files into the Vault.`,
    })
  }
  if (t.championships > 0) {
    chasing.push({
      label: 'Championship Count',
      value: `${t.championships}`,
      context: `${t.championships} ring${t.championships === 1 ? '' : 's'} on file. Another would tie or pass the current mark.`,
    })
  }
  chasing.push({
    label: 'Lifetime Points',
    value: Math.round(t.pointsFor).toLocaleString('en-US'),
    context: `Every regular-season point clocked in. Compounding — this only goes up.`,
  })

  return {
    name: c.chronicle.displayName,
    intro:
      `The Wire is the live ledger — what's happening this week, this season, right now. ` +
      `Outlooks per league lean on last year's finish until the in-season pipeline lands; ` +
      `matchups and records-watch go live the moment that data is flowing.`,
    recentForm: {
      intro:
        `Read each league's recent form like a beat reporter sketching expectations: champion ` +
        `defends, runner-up closes, missed-bracket reloads. Outlooks are derived from last year ` +
        `only — they'll deepen as the in-season pipeline fills in.`,
      items: recentForm,
    },
    records: {
      intro:
        `Records-chasing is the historical bar plus a live tracker (the latter coming with the ` +
        `in-season pipeline). For now: the marquee numbers from the Vault, with a note on what ` +
        `it'd take to push them.`,
      chasing,
      live: {
        enabled: false,
        intro:
          `Live mode tracks active streaks and pace against historical highs. Goes live once ` +
          `weekly results stream in.`,
        note: 'Ships in a follow-up to Phase 6.',
      },
    },
    matchups: {
      enabled: false,
      intro:
        `This-week's matchups across every Sleeper league. Score progressions, win probability, ` +
        `who's currently outscoring whom across rosters.`,
      note: 'Live matchups feed lights up alongside the desk port.',
    },
  }
}
