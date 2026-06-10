// News + inactives loader. Joins ESPN's NFL news feed with the league's rosters
// so headlines about YOUR players are flagged (and attributed to their manager),
// and builds an injury/inactive report straight from Sleeper's per-player
// injury_status. This is the "do I need to check my fantasy app?" page.

import { fetchNflNews, type NflArticle } from '@/lib/nflLive'
import { loadLeagueRosters } from '@/lib/leagueRosters'

export type RosteredMatch = { name: string; ownerName: string; position: string | null }
export type NewsItem = NflArticle & { rostered: RosteredMatch[] }

export type InjuryItem = {
  name: string
  position: string | null
  team: string | null
  ownerName: string
  teamName: string
  status: string
  isStarter: boolean
}

export type NewsFeed =
  | { ok: true; supported: boolean; articles: NewsItem[]; injuries: InjuryItem[]; fetchedAt: string }
  | { ok: false; reason: string }

const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

// Severity ordering for the injury report (worst first).
const INJ_RANK: Record<string, number> = { out: 0, ir: 0, pup: 0, sus: 0, doubtful: 1, questionable: 2 }
const injRank = (s: string) => {
  const u = s.toLowerCase()
  for (const [k, v] of Object.entries(INJ_RANK)) if (u.startsWith(k)) return v
  return 3
}
const isReportable = (s: string | null): boolean => {
  if (!s) return false
  const u = s.toLowerCase()
  return u !== 'healthy' && u !== 'active' && u !== 'na'
}

export async function loadNewsFeed(slug: string): Promise<NewsFeed> {
  let news
  try {
    news = await fetchNflNews()
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'NFL news unavailable' }
  }
  const rosters = await loadLeagueRosters(slug)
  const supported = rosters.ok && rosters.supported

  // Index rostered players by normalized name for headline attribution, and
  // collect the injury report in one pass.
  const byName = new Map<string, RosteredMatch>()
  const injuries: InjuryItem[] = []
  if (rosters.ok && rosters.supported) {
    for (const t of rosters.teams) {
      for (const p of t.players) {
        byName.set(normName(p.name), { name: p.name, ownerName: t.ownerName, position: p.position })
        if (isReportable(p.injuryStatus)) {
          injuries.push({
            name: p.name,
            position: p.position,
            team: p.team,
            ownerName: t.ownerName,
            teamName: t.teamName,
            status: p.injuryStatus!,
            isStarter: p.isStarter,
          })
        }
      }
    }
  }
  injuries.sort((a, b) => injRank(a.status) - injRank(b.status) || Number(b.isStarter) - Number(a.isStarter))

  const articles: NewsItem[] = news.articles.map((a) => {
    const rostered: RosteredMatch[] = []
    const seen = new Set<string>()
    for (const athlete of a.athletes) {
      const hit = byName.get(normName(athlete))
      if (hit && !seen.has(hit.name)) {
        seen.add(hit.name)
        rostered.push(hit)
      }
    }
    return { ...a, rostered }
  })

  // League-relevant news floats to the top, otherwise newest-first.
  articles.sort((x, y) => y.rostered.length - x.rostered.length || y.published.localeCompare(x.published))

  return { ok: true, supported, articles, injuries, fetchedAt: news.fetchedAt }
}
