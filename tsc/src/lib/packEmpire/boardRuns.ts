// What a board row knows about the run behind it. SERVER ONLY.

import { createAdminClient } from '@/lib/supabase/admin'
import { loadFaces, type FaceMap } from './faces'
import { playerById } from './pool'
import type { Player } from './rules'
import { parseSoloPicks } from './solo'

/** The best card in each run, off the picks it posted. A run from an older
    pool has ids that no longer resolve, so it just doesn't get one. */
export async function runLeaders(rows: { runId: string }[]): Promise<Map<string, Player>> {
  const out = new Map<string, Player>()
  if (rows.length === 0) return out
  const [{ data }, faces] = await Promise.all([
    createAdminClient()
      .from('game_runs')
      .select('id, detail')
      .in(
        'id',
        rows.map((r) => r.runId)
      ),
    loadFaces().catch(() => ({} as FaceMap)),
  ])
  for (const run of (data ?? []) as { id: string; detail: { picks?: unknown } | null }[]) {
    const cards = (parseSoloPicks(run.detail?.picks) ?? []).flatMap((p) => playerById(p.id) ?? [])
    const best = cards.sort((a, b) => b.score - a.score)[0]
    if (best) out.set(run.id, { ...best, img: faces[best.id] ?? best.img })
  }
  return out
}
