// What gets posted. Each builder turns public data into a post: the text for
// each platform, the card the image route draws, and the link.
//
// Public data only. Joey's rule for anything that leaves the site is no real
// league, manager or team names, so every builder here reads either Sleeper's
// league-agnostic NFL endpoints or the demo league.
//
// House style for the copy: no emojis, no em dashes, no arrows, plain words.

import { fetchWeekStats } from '@/lib/playerStats'
import { getPlayersNflDict } from '@/lib/sleeperPlayers'
import { SHARE_PAGES } from '@/lib/sharePages'
import { taggedLink, textProblem, type Platform } from './config'

export type Kind = 'regret' | 'history' | 'roulette' | 'recap' | 'feature'

export const KIND_LABELS: Record<Kind, string> = {
  regret: 'Drop Regret Index',
  history: 'This Week in Fantasy History',
  roulette: 'Roster Roulette deal',
  recap: 'Weekly Recap promo',
  feature: 'Feature of the week',
}

export type Built = {
  x_text: string
  threads_text: string
  link: string
  /** Null when the post reuses an existing OG route via image_path. */
  card: Card | null
  image_path: string | null
}

export type Row = { name: string; meta: string; value: string; note?: string }

export type Card =
  | { template: 'history'; week: number; hero: Row & { year: number; line: string }; rows: (Row & { year: number })[] }
  | { template: 'regret'; week: number; season: number; rows: Row[] }
  | { template: 'product'; kicker: string; title: string; dek: string; points: string[] }

/**
 * Both platform texts from one body. The link goes last, tagged per platform.
 *
 * The X copy has no link unless `xLink: true`. X charges per post and a post
 * with a link costs about thirteen times one without, so for now only the
 * Monday recap promo carries one there, as a one-link-a-week test of whether
 * X sends anyone. Every card carries the domain in its foot. Threads is free,
 * so it always links.
 */
function texts(body: { x: string; threads: string }, link: string, campaign: string, opts: { xLink?: boolean } = {}) {
  const join = (p: Platform, t: string) => `${t}\n\n${taggedLink(link, p, campaign)}`
  const out = {
    x_text: opts.xLink ? join('x', body.x) : body.x,
    threads_text: join('threads', body.threads),
  }
  const bad = textProblem('x', out.x_text) ?? textProblem('threads', out.threads_text)
  if (bad) throw new Error(`built copy is ${bad}`)
  return out
}

function fmt1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1)
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${fmt1(n / 1_000_000)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  return n.toLocaleString('en-US')
}

type Stats = Record<string, number>

/** "13 rec, 212 yds, 1 TD" style line for the history hero. */
function statLine(pos: string | undefined, s: Stats): string {
  const parts: string[] = []
  if (pos === 'QB' || (s.pass_yd ?? 0) > 100) {
    parts.push(`${Math.round(s.pass_yd ?? 0)} pass yds`, `${s.pass_td ?? 0} pass TD`)
    if ((s.rush_yd ?? 0) >= 20) parts.push(`${Math.round(s.rush_yd!)} rush yds`)
    if (s.rush_td) parts.push(`${s.rush_td} rush TD`)
    return parts.join(', ')
  }
  if ((s.rush_yd ?? 0) >= (s.rec_yd ?? 0)) {
    parts.push(`${Math.round(s.rush_yd ?? 0)} rush yds`)
    if (s.rec) parts.push(`${s.rec} rec, ${Math.round(s.rec_yd ?? 0)} yds`)
  } else {
    parts.push(`${s.rec ?? 0} rec`, `${Math.round(s.rec_yd ?? 0)} yds`)
    if ((s.rush_yd ?? 0) >= 20) parts.push(`${Math.round(s.rush_yd!)} rush yds`)
  }
  const tds = (s.rush_td ?? 0) + (s.rec_td ?? 0)
  if (tds) parts.push(`${tds} TD`)
  return parts.join(', ')
}

const FANTASY_POS = new Set(['QB', 'RB', 'WR', 'TE'])

// ── This Week in Fantasy History ─────────────────────────────────────────
// The best PPR games ever played in this week of the season, one per year at
// most so a single season can't take the whole list.
export async function buildHistory(week: number, lastSeason: number): Promise<Built> {
  const players = await getPlayersNflDict()
  const years = Array.from({ length: lastSeason - 2009 + 1 }, (_, i) => 2009 + i)
  const perYear = await Promise.all(years.map(async (year) => {
    const stats = await fetchWeekStats(year, week).catch(() => ({}))
    let best: { id: string; pts: number; s: Stats } | null = null
    for (const [id, s] of Object.entries(stats as Record<string, Stats>)) {
      const pts = s.pts_ppr ?? 0
      if (!FANTASY_POS.has(players[id]?.position ?? '')) continue
      if (!best || pts > best.pts) best = { id, pts, s }
    }
    return best ? { year, ...best } : null
  }))
  const ranked = perYear.filter((r): r is NonNullable<typeof r> => !!r && !!players[r.id]?.full_name)
    .sort((a, b) => b.pts - a.pts)
  if (ranked.length < 5) throw new Error(`only ${ranked.length} seasons of week ${week} stats`)

  const toRow = (r: (typeof ranked)[number]) => ({
    name: players[r.id].full_name!,
    meta: `${players[r.id].position} · ${r.year}`,
    value: fmt1(r.pts),
    year: r.year,
  })
  const [top, ...rest] = ranked
  const hero = { ...toRow(top), line: statLine(players[top.id].position, top.s) }
  const card: Card = { template: 'history', week, hero, rows: rest.slice(0, 5).map(toRow) }

  const lead = `The best fantasy game ever played in a Week ${week}: ${hero.name}, ${hero.year}. ${hero.value} PPR points (${hero.line}).`
  const runnerUp = rest[0] ? ` Next best: ${toRow(rest[0]).name}, ${rest[0].year}, ${fmt1(rest[0].pts)}.` : ''
  const link = '/'
  return {
    ...texts({
      x: `This Week in Fantasy History. ${lead}`,
      threads: `This Week in Fantasy History.\n\n${lead}${runnerUp}\n\nEvery league has its own version of this list. Ours keeps it for you.`,
    }, link, 'history'),
    link, card, image_path: null,
  }
}

// ── The Drop Regret Index ────────────────────────────────────────────────
// Planned on Saturday with the week's most-dropped players captured then,
// built on Tuesday once Monday night is final.
export type RegretParams = { season: number; week: number; drops: { player_id: string; count: number }[] }

export async function snapshotDrops(): Promise<RegretParams['drops']> {
  const res = await fetch('https://api.sleeper.app/v1/players/nfl/trending/drop?lookback_hours=96&limit=60', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sleeper trending drops ${res.status}`)
  return ((await res.json()) as { player_id: string; count: number }[]).map((d) => ({ player_id: d.player_id, count: d.count }))
}

export async function buildRegret(p: RegretParams): Promise<Built | null> {
  const [players, stats] = await Promise.all([getPlayersNflDict(), fetchWeekStats(p.season, p.week)])
  const scored = p.drops
    .map((d) => ({ ...d, player: players[d.player_id], pts: (stats as Record<string, Stats>)[d.player_id]?.pts_ppr ?? 0 }))
    .filter((d) => d.player?.full_name && FANTASY_POS.has(d.player.position ?? '') && d.pts > 0)
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 6)
  // A quiet week has no regret worth posting. The publisher expires it.
  if (scored.filter((d) => d.pts >= 12).length < 3) return null

  const rows: Row[] = scored.map((d) => ({
    name: d.player.full_name!,
    meta: [d.player.position, d.player.team].filter(Boolean).join(' · '),
    value: fmt1(d.pts),
    note: `dropped ${compact(d.count)}`,
  }))
  const top = rows[0]
  const lead = `${top.name} was dropped ${scored[0].count.toLocaleString('en-US')} times on Sleeper last week, then scored ${top.value} PPR.`
  const link = '/'
  return {
    ...texts({
      x: `The Drop Regret Index, Week ${p.week}. ${lead}`,
      threads: `The Drop Regret Index, Week ${p.week}.\n\n${lead} ${rows.slice(1, 3).map((r) => `${r.name}: ${r.value}.`).join(' ')}\n\nThe most-dropped players of the week, ranked by what they did after you let them go.`,
    }, link, 'regret'),
    link,
    card: { template: 'regret', week: p.week, season: p.season, rows },
    image_path: null,
  }
}

// ── Roster Roulette deal of the week ─────────────────────────────────────
// A fixed seed per week, so everyone who opens the link plays the same wheel.
export function buildRoulette(season: number, week: number): Built {
  const seed = `WK${season}${String(week).padStart(2, '0')}`
  const link = `/games/roulette/?pool=site&seed=${seed}`
  return {
    ...texts({
      // No link on X (see texts()), so the X copy can't promise a shared wheel.
      x: `Roster Roulette, Week ${week}. Seven spins of real fantasy rosters, one lineup, one season to see how it holds up. Free to play under Games at The Sunday Chronicle.`,
      threads: `Roster Roulette, Week ${week}.\n\nSeven spins of real fantasy rosters, build one lineup, and see how it does over a season. Everyone who opens this link gets the same wheel, so reply with your record.`,
    }, link, 'roulette'),
    link, card: null, image_path: '/api/og/games/',
  }
}

// ── Weekly Recap promo ───────────────────────────────────────────────────
const RECAP_PITCHES = [
  {
    x: 'Every Tuesday your league can get its own newspaper: last week\'s results, the best and worst lineup calls, and where the standings moved. 10 days free.',
    threads: 'Every Tuesday your league can get its own newspaper.\n\nLast week\'s results, the best and worst lineup calls, and where the standings moved, written up from your league\'s own history. Anyone in the league can sign up to get it.\n\n10 days free.',
    dek: 'A paper for your league, every Tuesday.',
    points: ['Last week’s results', 'Best and worst lineup calls', 'Where the standings moved', 'Anyone in the league can subscribe'],
  },
  {
    x: 'Your group chat argues about last week. Your league\'s Tuesday paper settles it: every score, every bench mistake, every streak, from the league\'s own records.',
    threads: 'Your group chat argues about last week. The Tuesday paper settles it.\n\nEvery score, every bench mistake, every streak, checked against your league\'s whole history. It lands in your inbox after Monday night.\n\n10 days free.',
    dek: 'The argument, settled every Tuesday.',
    points: ['Every score, every week', 'Bench mistakes, named', 'Streaks and records on the line', 'In your inbox after Monday night'],
  },
  {
    x: 'Sleeper, ESPN or Yahoo: connect your league once and it gets a weekly paper, an all-time record book and a full history of every season. 10 days free.',
    threads: 'Connect your league once. Sleeper, ESPN or Yahoo.\n\nIt gets a weekly paper every Tuesday, an all-time record book, and every season you have ever played, bound and kept.\n\n10 days free.',
    dek: 'Connect once. Read it every Tuesday.',
    points: ['Sleeper, ESPN and Yahoo', 'A paper every Tuesday', 'An all-time record book', 'Every season, bound and kept'],
  },
]

export function buildRecapPromo(week: number): Built {
  const pitch = RECAP_PITCHES[week % RECAP_PITCHES.length]
  const link = '/'
  return {
    ...texts({ x: pitch.x, threads: pitch.threads }, link, 'recap', { xLink: true }),
    link,
    card: { template: 'product', kicker: 'The Weekly Recap', title: 'Your League’s Chronicle.', dek: pitch.dek, points: pitch.points },
    image_path: null,
  }
}

// ── Feature of the week ──────────────────────────────────────────────────
// Rotates through the share hub's pages, whose landing pages (/see/<key>)
// and heroes are already built for strangers and run on the demo league.
export function buildFeature(week: number): Built {
  const page = SHARE_PAGES[week % SHARE_PAGES.length]
  const link = `/see/${page.key}/`
  const title = page.title.replace(/’/g, '\'')
  const deck = page.deck.replace(/’/g, '\'')
  return {
    ...texts({
      x: `${title}. ${deck}`,
      threads: `${title}.\n\n${deck}\n\nThis one is from our demo league. Yours gets built from its own history the day you connect it.`,
    }, link, `feature-${page.key}`),
    link, card: null, image_path: page.og,
  }
}
