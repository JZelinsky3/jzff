// Power Pulse — top 5 by current power ranking, each with their live result
// this week. Reuses the existing getPowerRankings engine (paid-feature, same
// gate as Sunday Live so always available here). Silent no-op on miss.

import { getPowerRankings } from '@/lib/powerRankings'
import type { PowerPulseRow, SlMatchup } from './types'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export async function buildPowerPulse(
  slug: string,
  matchups: SlMatchup[],
): Promise<PowerPulseRow[]> {
  const pr = await getPowerRankings(slug).catch(() => null)
  if (!pr || pr.status !== 'ok' || pr.weeks.length === 0) return []
  const latest = pr.weeks[pr.weeks.length - 1]

  // Live-result lookup keyed by normalized team name.
  type Result = 'leading' | 'trailing' | 'tied'
  const byName = new Map<string, Result>()
  for (const m of matchups) {
    const result = (score: number, other: number): Result =>
      score > other ? 'leading' : score < other ? 'trailing' : 'tied'
    byName.set(norm(m.a.teamName), result(m.a.score, m.b.score))
    byName.set(norm(m.b.teamName), result(m.b.score, m.a.score))
  }

  return latest.overall.slice(0, 5).map((t) => ({
    rank: t.rank,
    teamName: t.team_name,
    ownerName: t.manager,
    liveResult: byName.get(norm(t.team_name)) ?? null,
    wins: t.wins,
    losses: t.losses,
  }))
}
