// Big Moment detection — diff successive frames for WP swings ≥ 12%.
//
// Called from load.ts after a new frame is built. Reads the previous frame from
// snapshots, compares each matchup's WP, classifies the swing into a tier, and
// attributes a cause from the wire events that arrived between the two frames.

import type { Moment, MomentTier, SlLeague, WireEvent } from './types'
import type { FrameMeta } from './snapshots'

const WAVE = 0.12
const SURGE = 0.20
const QUAKE = 0.35

function tierFor(delta: number): MomentTier | null {
  const abs = Math.abs(delta)
  if (abs >= QUAKE) return 'earthquake'
  if (abs >= SURGE) return 'surge'
  if (abs >= WAVE) return 'wave'
  return null
}

function captionFor(tier: MomentTier, deltaA: number): string {
  // Italic-serif broadcast caption. Keep these short and varied — they live
  // on the Big Moments card.
  const surge = deltaA > 0 ? 'the surge that broke the dam' : 'the crack that let it in'
  const quake = deltaA > 0 ? 'the moment the room went silent' : 'the moment doubt arrived'
  const wave  = deltaA > 0 ? 'the swing that mattered' : 'the swing that hurt'
  switch (tier) {
    case 'earthquake': return quake
    case 'surge':      return surge
    case 'wave':       return wave
  }
}

export function detectMoments(
  next: SlLeague,
  prev: FrameMeta | null,
  freshWire: WireEvent[],
): Moment[] {
  if (!prev) return next.moments // first frame — preserve whatever was already there
  const out: Moment[] = [...next.moments]
  const prevWPs = new Map<number, number>()
  for (const m of prev.payload.matchups) prevWPs.set(m.matchupId, m.a.wp)
  for (const m of next.matchups) {
    const before = prevWPs.get(m.matchupId)
    if (before == null) continue
    const after = m.a.wp
    const delta = after - before
    const tier = tierFor(delta)
    if (!tier) continue
    const at = next.meta.fetchedAt
    const id = `${m.matchupId}-${at}`
    // Dedupe across reloads.
    if (out.some((x) => x.id === id)) continue
    // Attribute cause: the first TD/FG in the wire between frames affecting
    // this matchup's players, falling back to a generic note.
    const cause = guessCause(freshWire) ?? 'shift in projected output'
    out.push({
      id,
      matchupId: m.matchupId,
      at,
      tier,
      wpBefore: before,
      wpAfter: after,
      side: delta > 0 ? 'a' : 'b',
      cause,
      caption: captionFor(tier, delta),
    })
  }
  // Latest first, cap at 30 to keep payload bounded.
  out.sort((a, b) => b.at.localeCompare(a.at))
  return out.slice(0, 30)
}

function guessCause(freshWire: WireEvent[]): string | null {
  for (const e of freshWire) {
    if (e.kind === 'td' || e.kind === 'fg') return e.headline
  }
  return null
}
