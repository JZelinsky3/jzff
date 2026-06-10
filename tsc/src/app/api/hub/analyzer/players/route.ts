// GET /api/hub/analyzer/players?q=<text> — Trade Room player search.
// Signed-in only (the analyzer is a member feature). Resolves names against
// the cached lean Sleeper dictionary; QB/RB/WR/TE on active rosters only —
// the value engine doesn't price kickers, defenses, or retirees.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPlayersMap } from '@/lib/sleeperPlayers'

const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  if (q.length < 2) return NextResponse.json({ results: [] })

  const players = await getPlayersMap()
  type Hit = { id: string; name: string; position: string; team: string | null; rank: number }
  const hits: Hit[] = []
  for (const [id, p] of Object.entries(players)) {
    if (!p.position || !POSITIONS.has(p.position)) continue
    if (!p.team) continue // active NFL roster only
    const name = p.name.toLowerCase()
    if (!name.includes(q)) continue
    const lastName = name.split(' ').slice(-1)[0]
    const rank = name.startsWith(q) ? 0 : lastName.startsWith(q) ? 1 : 2
    hits.push({ id, name: p.name, position: p.position, team: p.team, rank })
  }
  hits.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))

  return NextResponse.json({
    results: hits.slice(0, 12).map(({ id, name, position, team }) => ({ id, name, position, team })),
  })
}
