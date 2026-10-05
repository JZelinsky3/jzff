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

// The base post of the day (card + link) is one of the first five; the rest
// are the text-only extras in ./extras.ts.
export type Kind =
  | 'regret' | 'history' | 'roulette' | 'recap' | 'feature'
  | 'trending' | 'drops' | 'leaders' | 'beat' | 'season' | 'targets' | 'pace' | 'bargains'
  | 'streaks' | 'busts' | 'byes' | 'nugget' | 'projections' | 'sunday'
  | 'sidebyside' | 'highs' | 'redzone' | 'namegame'
  // Retired 2026-10-05 (reply bait); kept so old rows still have a label.
  | 'question'

export const KIND_LABELS: Record<Kind, string> = {
  regret: 'Drop Regret Index',
  history: 'This Week in Fantasy History',
  roulette: 'Roster Roulette deal',
  recap: 'Weekly Recap promo',
  feature: 'Feature of the week',
  trending: 'Most added (text)',
  drops: 'Most dropped (text)',
  leaders: 'Week’s top scorers (text)',
  beat: 'Beat the projection (text)',
  season: 'Season leaders (text)',
  targets: 'Target leaders (text)',
  pace: 'Best pace (text)',
  bargains: 'Draft bargains (text)',
  streaks: 'Every game over the line (text)',
  busts: 'Draft busts (text)',
  projections: 'Top projected (text)',
  sidebyside: 'Drafted side by side (text)',
  highs: 'Best single games (text)',
  redzone: 'Red zone chances (text)',
  namegame: 'Name the player (text)',
  byes: 'Byes this week (text)',
  nugget: 'History by position (text)',
  sunday: 'Sunday’s top scorers (text)',
  question: 'Question (retired)',
}

export type Built = {
  x_text: string
  threads_text: string
  /** Null on the text-only extras. */
  link: string | null
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
 * Monday feature carries one there, as a one-link-a-week test of whether X
 * sends anyone. Every card carries the domain in its foot. Threads is free,
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

export function fmt1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1)
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${fmt1(n / 1_000_000)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  return n.toLocaleString('en-US')
}

export type Stats = Record<string, number>

/** "13 rec, 212 yds, 1 TD" style line for the history hero. */
export function statLine(pos: string | undefined, s: Stats): string {
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

export const FANTASY_POS = new Set(['QB', 'RB', 'WR', 'TE'])

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

  const lead = `the best Week ${week} ever was ${hero.name} in ${hero.year}. ${hero.line}, ${hero.value} PPR points.`
  const runnerUp = rest[0] ? ` Next best: ${toRow(rest[0]).name} in ${rest[0].year} with ${fmt1(rest[0].pts)}.` : ''
  const link = '/'
  return {
    ...texts({
      x: `This week in fantasy history: ${lead}`,
      threads: `This week in fantasy history: ${lead}${runnerUp}\n\nConnect your league and see the best week in its history.`,
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
  const lead = `${top.name} got dropped in ${scored[0].count.toLocaleString('en-US')} Sleeper leagues last week, then put up ${top.value} PPR points.`
  const [second, third] = rows.slice(1, 3)
  const link = '/'
  return {
    ...texts({
      x: `Drop Regret Index, Week ${p.week}: ${lead}`,
      threads: `Drop Regret Index, Week ${p.week}: ${lead} ${second.name} (${second.value}) and ${third.name} (${third.value}) weren't far behind.\n\nThe week's most-dropped players, ranked by what they scored right after.`,
    }, link, 'regret'),
    link,
    card: { template: 'regret', week: p.week, season: p.season, rows },
    image_path: null,
  }
}

// ── Roster Roulette deal of the week ─────────────────────────────────────
// A fixed seed per week, so everyone who opens the link gets the same teams.
//
// Copy rule (Joey): there is a popular NFL game built on spinning for teams
// and chasing an unbeaten record. Don't sound like it. No spins, wheels or
// "go undefeated". Ours is about real fantasy teams from real leagues, and
// playing it with your own league's history.
export function buildRoulette(season: number, week: number): Built {
  const seed = `WK${season}${String(week).padStart(2, '0')}`
  const link = `/games/roulette/?pool=site&seed=${seed}`
  return {
    ...texts({
      // No link on X (see texts()), so the X copy can't promise shared teams.
      x: `Roster Roulette, Week ${week}: you get handed real teams from real fantasy leagues. Take one player off each, fill your lineup, and see what record it puts up over 17 games. Free under Games at The Sunday Chronicle.`,
      threads: `Roster Roulette, Week ${week}.\n\nEach round you get a real team from a real fantasy league on our site. Take one player off it, fill your lineup, then see what record it puts up over 17 games.\n\nEveryone gets the same teams this week. Connect your league and you can play it with your own league's old teams.`,
    }, link, 'roulette'),
    link, card: null, image_path: '/api/og/games/',
  }
}

// ── Weekly Recap promo ───────────────────────────────────────────────────
const RECAP_PITCHES = [
  {
    x: 'Your fantasy league gets its own newspaper every Tuesday. Last week\'s scores, the best and worst lineup calls, and how the standings moved. 10 days free at The Sunday Chronicle.',
    threads: 'Your fantasy league gets its own newspaper every Tuesday.\n\nLast week\'s scores, the best and worst lineup calls, and how the standings moved, pulled from your league\'s own history. Anyone in the league can sign up to get it.\n\n10 days free.',
    dek: 'A paper for your league, every Tuesday.',
    points: ['Last week\u2019s scores', 'Best and worst lineup calls', 'How the standings moved', 'Anyone in the league can sign up'],
  },
  {
    x: 'Every week the group chat argues about who should have started who. The Tuesday recap settles it: every score, every bad bench call, every streak in your league. Free for 10 days at The Sunday Chronicle.',
    threads: 'Every week the group chat argues about who should have started who.\n\nThe Tuesday recap settles it. Every score, every bad bench call, every streak, checked against your league\'s whole history. It hits your inbox after Monday night.\n\n10 days free.',
    dek: 'Settles the group chat every Tuesday.',
    points: ['Every score, every week', 'The worst bench calls', 'Streaks and records in play', 'In your inbox after Monday night'],
  },
  {
    x: 'Connect your Sleeper, ESPN or Yahoo league once. You get a recap every Tuesday, an all-time record book, and every season you\'ve ever played in one place. 10 days free at The Sunday Chronicle.',
    threads: 'Connect your Sleeper, ESPN or Yahoo league once.\n\nYou get a recap every Tuesday, an all-time record book, and every season you\'ve ever played in one place.\n\n10 days free.',
    dek: 'Connect once. Read it every Tuesday.',
    points: ['Sleeper, ESPN and Yahoo', 'A recap every Tuesday', 'An all-time record book', 'Every season in one place'],
  },
]

export function buildRecapPromo(week: number): Built {
  const pitch = RECAP_PITCHES[week % RECAP_PITCHES.length]
  const link = '/'
  return {
    // Saturday, no link on X, so its X copy names the site instead.
    ...texts({ x: pitch.x, threads: pitch.threads }, link, 'recap'),
    link,
    card: { template: 'product', kicker: 'The Weekly Recap', title: 'Your League’s Chronicle.', dek: pitch.dek, points: pitch.points },
    image_path: null,
  }
}

// ── Feature of the week ──────────────────────────────────────────────────
// Rotates through the share hub's pages, whose landing pages (/see/<key>)
// and heroes are already built for strangers and run on the demo league.
//
// The pages' own decks are written for the site ("kept like exhibits"), which
// reads oddly in a feed. These say the same thing the way a fantasy account
// would. A page missing here falls back to its title and deck.
const FEATURE_COPY: Record<string, string> = {
  standings: 'Every win, loss and point your league has ever put up, in one table. Finally settle who has actually been the best.',
  records: 'Highest score ever, worst blowout, longest win streak. Every record your league has, in one place.',
  managers: 'Everyone who has ever been in your league, with their record, their titles, and how they do head to head against everyone else.',
  draft: 'Every draft your league has ever had, pick by pick. See who hit, who busted, and who keeps reaching in the first round.',
  seasons: 'Every season of your league: final standings, the playoff bracket, and who won it.',
  'all-time': 'The best season anyone in your league has had at every position, all in one lineup.',
  live: 'Power rankings, pick\'ems, records on the line and trade grades for your league, updated every week.',
  powerrank: 'Power rankings for your league every week, worked out from record, points scored and recent form.',
  pickems: 'Pick\'ems for your league: everyone picks every matchup each week, plus the high and low scorer. Nobody needs an account.',
  milestones: 'Career milestones as the managers in your league hit them, and who is close to the next one.',
  'records-watch': 'Which league records fell this season, which are on pace, and which are just out of reach.',
}

// Site names that mean nothing to a stranger in a feed.
const FEATURE_TITLE: Record<string, string> = { managers: 'Manager pages' }

export function buildFeature(week: number): Built {
  const page = SHARE_PAGES[week % SHARE_PAGES.length]
  const link = `/see/${page.key}/`
  const title = FEATURE_TITLE[page.key] ?? page.title.replace(/’/g, '\'')
  const line = FEATURE_COPY[page.key] ?? page.deck.replace(/’/g, '\'')
  return {
    ...texts({
      x: `${title}. ${line}`,
      threads: `${title}.\n\n${line}\n\nThis is our demo league. Connect yours and it fills in with your own league's history.`,
    }, link, `feature-${page.key}`, { xLink: true }),
    // The share pages list their OG paths without the trailing slash, which
    // the site answers with a 308. Threads fetches the image itself and may
    // not follow it, so hand it the final URL.
    link, card: null, image_path: page.og.replace(/^([^?]*?)\/?(\?|$)/, '$1/$2'),
  }
}
