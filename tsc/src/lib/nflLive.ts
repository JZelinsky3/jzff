// Real NFL data — ESPN's public site API (no auth, no key). Powers the Sunday
// Live "NFL Games" board and the "Player News & Inactives" page. Normalized into
// lean shapes so the UI never touches ESPN's verbose payloads, and cached in the
// Next data cache (short TTL for live scores, longer for news).
//
//   scoreboard: site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
//   news:       site.api.espn.com/apis/site/v2/sports/football/nfl/news

import { unstable_cache } from 'next/cache'

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
const NEWS = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news'

// ── Team abbreviation canonicalization ───────────────────────────────────────
// Sleeper and ESPN mostly agree, but a handful differ. Map both vocabularies to
// one canonical key so roster ↔ game cross-referencing lines up.
const TEAM_ALIASES: Record<string, string> = {
  WSH: 'WAS', WAS: 'WAS',
  JAC: 'JAX', JAX: 'JAX',
  LA: 'LAR', LAR: 'LAR', STL: 'LAR',
  LV: 'LV', OAK: 'LV',
  LAC: 'LAC', SD: 'LAC',
  ARZ: 'ARI', ARI: 'ARI',
}
export function normTeam(abbr: string | null | undefined): string | null {
  if (!abbr) return null
  const up = abbr.toUpperCase()
  return TEAM_ALIASES[up] ?? up
}

export type NflTeamSide = {
  abbr: string | null
  name: string
  short: string
  logo: string | null
  color: string | null
  score: number
  homeAway: 'home' | 'away'
  record: string | null
}

export type NflGame = {
  id: string
  state: 'pre' | 'in' | 'post'
  completed: boolean
  shortDetail: string
  detail: string
  clock: string
  period: number
  date: string
  home: NflTeamSide
  away: NflTeamSide
  possessionAbbr: string | null
  isRedZone: boolean
  lastPlay: string | null
  downDistance: string | null
  broadcast: string | null
}

export type NflScoreboard = { week: number | null; season: number | null; games: NflGame[]; fetchedAt: string }

type RawCompetitor = {
  id?: string
  homeAway?: string
  score?: string | number
  team?: { abbreviation?: string; displayName?: string; shortDisplayName?: string; logo?: string; color?: string }
  records?: Array<{ type?: string; summary?: string }>
}

function side(c: RawCompetitor | undefined, fallback: 'home' | 'away'): NflTeamSide {
  const t = c?.team ?? {}
  const rec = c?.records?.find((r) => r.type === 'total') ?? c?.records?.[0]
  return {
    abbr: normTeam(t.abbreviation),
    name: t.displayName ?? t.shortDisplayName ?? '—',
    short: t.shortDisplayName ?? t.abbreviation ?? '—',
    logo: t.logo ?? null,
    color: t.color ? `#${t.color.replace(/^#/, '')}` : null,
    score: Number(c?.score ?? 0) || 0,
    homeAway: (c?.homeAway as 'home' | 'away') ?? fallback,
    record: rec?.summary ?? null,
  }
}

function normalizeGame(ev: Record<string, unknown>): NflGame | null {
  const comps = (ev.competitions as Array<Record<string, unknown>> | undefined) ?? []
  const comp = comps[0]
  if (!comp) return null
  const competitors = (comp.competitors as RawCompetitor[] | undefined) ?? []
  const home = competitors.find((c) => c.homeAway === 'home') ?? competitors[0]
  const away = competitors.find((c) => c.homeAway === 'away') ?? competitors[1]

  const status = (comp.status as Record<string, unknown> | undefined) ?? (ev.status as Record<string, unknown> | undefined) ?? {}
  const type = (status.type as Record<string, unknown> | undefined) ?? {}
  const situation = (comp.situation as Record<string, unknown> | undefined) ?? {}

  // Possession is a team id — resolve to its abbreviation.
  let possessionAbbr: string | null = null
  const possId = situation.possession as string | undefined
  if (possId) {
    const owner = competitors.find((c) => c.id === possId)
    possessionAbbr = normTeam(owner?.team?.abbreviation)
  }

  const broadcasts = (comp.broadcasts as Array<{ names?: string[] }> | undefined) ?? []
  const broadcast = broadcasts[0]?.names?.join(', ') || null

  return {
    id: String(ev.id ?? comp.id ?? ''),
    state: ((type.state as string) ?? 'pre') as 'pre' | 'in' | 'post',
    completed: !!type.completed,
    shortDetail: (type.shortDetail as string) ?? '',
    detail: (type.detail as string) ?? '',
    clock: (status.displayClock as string) ?? '',
    period: (status.period as number) ?? 0,
    date: (ev.date as string) ?? '',
    home: side(home, 'home'),
    away: side(away, 'away'),
    possessionAbbr,
    isRedZone: !!situation.isRedZone,
    lastPlay: ((situation.lastPlay as Record<string, unknown> | undefined)?.text as string) ?? null,
    downDistance: (situation.downDistanceText as string) ?? null,
    broadcast,
  }
}

async function fetchScoreboardRaw(): Promise<NflScoreboard> {
  const res = await fetch(SCOREBOARD, { cache: 'no-store' })
  if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`)
  const json = (await res.json()) as Record<string, unknown>
  const events = (json.events as Array<Record<string, unknown>> | undefined) ?? []
  const games = events.map(normalizeGame).filter((g): g is NflGame => g != null)
  // Live first, then upcoming by kickoff, then finals.
  const rank = (g: NflGame) => (g.state === 'in' ? 0 : g.state === 'pre' ? 1 : 2)
  games.sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date))
  return {
    week: ((json.week as Record<string, unknown> | undefined)?.number as number) ?? null,
    season: ((json.season as Record<string, unknown> | undefined)?.year as number) ?? null,
    games,
    fetchedAt: new Date().toISOString(),
  }
}

export const fetchScoreboard = unstable_cache(fetchScoreboardRaw, ['nfl-scoreboard', 'v1'], {
  revalidate: 20,
  tags: ['nfl-scoreboard'],
})

// ── News ─────────────────────────────────────────────────────────────────────
export type NflArticle = {
  id: string
  headline: string
  description: string
  published: string
  image: string | null
  link: string | null
  athletes: string[]
  teams: string[]
  premium: boolean
}

type RawCategory = {
  type?: string
  description?: string
  athlete?: { description?: string }
  team?: { description?: string; abbreviation?: string }
}

function normalizeArticle(a: Record<string, unknown>, i: number): NflArticle {
  const images = (a.images as Array<{ url?: string }> | undefined) ?? []
  const links = a.links as { web?: { href?: string }; mobile?: { href?: string } } | undefined
  const cats = (a.categories as RawCategory[] | undefined) ?? []
  const athletes: string[] = []
  const teams: string[] = []
  for (const c of cats) {
    if (c.type === 'athlete' && c.athlete?.description) athletes.push(c.athlete.description)
    if (c.type === 'team' && (c.team?.description || c.team?.abbreviation)) {
      teams.push(c.team.description ?? c.team.abbreviation!)
    }
  }
  return {
    id: String((a.id as string | number | undefined) ?? `${a.published ?? ''}-${i}`),
    headline: (a.headline as string) ?? '',
    description: (a.description as string) ?? '',
    published: (a.published as string) ?? '',
    image: images[0]?.url ?? null,
    link: links?.web?.href ?? links?.mobile?.href ?? null,
    athletes,
    teams,
    premium: !!a.premium,
  }
}

async function fetchNewsRaw(): Promise<{ articles: NflArticle[]; fetchedAt: string }> {
  const res = await fetch(NEWS, { cache: 'no-store' })
  if (!res.ok) throw new Error(`ESPN news ${res.status}`)
  const json = (await res.json()) as Record<string, unknown>
  const raw = (json.articles as Array<Record<string, unknown>> | undefined) ?? []
  return { articles: raw.map(normalizeArticle), fetchedAt: new Date().toISOString() }
}

export const fetchNflNews = unstable_cache(fetchNewsRaw, ['nfl-news', 'v1'], {
  revalidate: 300,
  tags: ['nfl-news'],
})
