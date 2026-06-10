// Frame storage for Sunday Live.
//
// One row per (league_id, year, week, taken_at). Writes are debounced so we
// don't store 120 identical frames during a final-state Sunday. Reads are used
// for: WP sparkline reconstruction (the line chart on the hero card), Big
// Moments diffing (compareLatest), and the Sunday Live Archive permalink.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SlLeague } from './types'

export type FrameMeta = {
  takenAt: string
  payload: SlLeague
}

// Minimum spacing between persisted frames during the live window.
const MIN_GAP_MS = 60 * 1000

export async function readLatestFrame(
  leagueId: string,
  year: number,
  week: number,
): Promise<FrameMeta | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('sunday_live_frames')
    .select('taken_at, payload')
    .eq('league_id', leagueId)
    .eq('year', year)
    .eq('week', week)
    .order('taken_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return { takenAt: data.taken_at as string, payload: data.payload as SlLeague }
}

export async function readFrameHistory(
  leagueId: string,
  year: number,
  week: number,
  limit = 120,
): Promise<FrameMeta[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('sunday_live_frames')
    .select('taken_at, payload')
    .eq('league_id', leagueId)
    .eq('year', year)
    .eq('week', week)
    .order('taken_at', { ascending: true })
    .limit(limit)
  return (data ?? []).map((r) => ({ takenAt: r.taken_at as string, payload: r.payload as SlLeague }))
}

export async function writeFrame(
  leagueId: string,
  year: number,
  week: number,
  payload: SlLeague,
): Promise<void> {
  const last = await readLatestFrame(leagueId, year, week)
  if (last) {
    const gap = Date.now() - Date.parse(last.takenAt)
    if (gap < MIN_GAP_MS) return
  }
  const db = createAdminClient()
  await db.from('sunday_live_frames').insert({
    league_id: leagueId,
    year,
    week,
    taken_at: new Date().toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  })
}
