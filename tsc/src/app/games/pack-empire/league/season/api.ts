// One call to /api/games/pack-empire/season for every Season page: an action in,
// the whole view back (and the cards, when it opened a pack).

import type { Player } from '@/lib/packEmpire/rules'
import type { SeasonView } from '@/lib/packEmpire/season'

export type SeasonOut = { view: SeasonView | null; cards?: Player[] }

export async function seasonPost(body: Record<string, unknown>): Promise<SeasonOut> {
  const res = await fetch('/api/games/pack-empire/season/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Something went wrong.')
  return { view: (out.view as SeasonView | null) ?? null, cards: out.cards as Player[] | undefined }
}

export const seasonHref = (league: string, page = '') => `/games/pack-empire/league/season/${league}/${page ? `${page}/` : ''}`

export const gameHref = (league: string, team: string, phase: string, week: number) =>
  `/games/pack-empire/league/season/${league}/game/?t=${team}&p=${phase}&w=${week}`
