'use client'

// One starter line: slot, full name, game situation chip, delta, points.
// Desktop has the room, so nothing is abbreviated. The delta column shows
// points vs projection, except right after a player scores: then it flashes
// what they just added (replaced, not accumulated, on the next score). The
// situation chip is where the broadcast feel lives: ON FIELD glows, RZ
// pulses, FINAL dims the row.

import type { SlPlayer } from '@/lib/sundayLive/types'
import { teamColor } from '../../_lib/teamColors'
import { fmtDelta, fmtPts } from '../../_lib/format'

function SituationChip({ p }: { p: SlPlayer }) {
  const g = p.game
  if (!g) return <span className="sl-num text-[11px] text-sl-dim">--</span>
  if (g.state === 'final') return <span className="sl-num text-[11px] text-sl-dim">FINAL</span>
  if (g.state === 'pre') {
    return <span className="sl-num text-[11px] text-sl-dim">{g.quarterClock ?? 'PRE'}</span>
  }
  if (g.inRedZone) {
    return <span className="sl-num text-[11px] font-bold text-sl-live">RED ZONE</span>
  }
  if (g.onField) {
    return <span className="sl-num text-[11px] font-bold text-sl-glow">ON FIELD</span>
  }
  return <span className="sl-num text-[11px] text-sl-mute">{g.quarterClock ?? 'LIVE'}</span>
}

// The slot cell doubles as the players-remaining pip: gold while the game is
// still to come, cream while it's being played, the usual dull ink once it's
// final (or there's no game to play).
function SlotCell({ p }: { p: SlPlayer }) {
  const g = p.game
  const state: 'pre' | 'live' | 'done' = !g || g.state === 'final' ? 'done' : g.state === 'pre' ? 'pre' : 'live'
  return (
    <span
      className={`sl-num flex h-[18px] w-9 shrink-0 items-center justify-center rounded-[2px] text-[9px] font-bold uppercase leading-none ${
        state === 'pre'
          ? 'bg-sl-glow text-sl-void shadow-[0_0_5px_rgba(232,199,120,0.4)]'
          : state === 'live'
            ? ''
            : 'text-sl-mute'
      }`}
      style={state === 'live' ? { background: 'var(--sl-cream)', color: 'var(--sl-void)' } : undefined}
    >
      {p.slot ?? p.position ?? ''}
    </span>
  )
}

export function StarterRow({ p, recent }: { p: SlPlayer; recent?: number }) {
  const done = p.game?.state === 'final'
  const injured = p.injuryStatus && /^(out|ir|pup|sus)/i.test(p.injuryStatus)
  const delta = p.points - p.projected
  const justScored = recent != null && recent > 0

  return (
    <div
      className={`flex items-center gap-2 border-b border-sl-line/50 px-3 py-1.5 last:border-b-0 ${
        p.game?.inRedZone ? 'sl-redzone' : ''
      } ${done ? 'opacity-60' : ''}`}
    >
      <SlotCell p={p} />
      <span
        className="h-3.5 w-0.5 shrink-0 rounded"
        style={{ background: teamColor(p.team) }}
        aria-hidden
      />
      <span className={`sl-display min-w-0 flex-1 truncate text-[15px] ${injured ? 'text-sl-down line-through' : 'text-sl-text'}`}>
        {p.name}
        <span className="ml-2 font-sans text-[11px] font-medium text-sl-dim">
          {p.team ?? 'FA'}
        </span>
      </span>
      <span className="w-[72px] shrink-0 text-right">
        <SituationChip p={p} />
      </span>
      {justScored ? (
        <span
          key={p.points}
          className="sl-num sl-bump w-11 shrink-0 text-right text-[11.5px] font-bold text-sl-glow"
          title="Just scored"
        >
          +{fmtPts(recent)}
        </span>
      ) : (
        <span
          className={`sl-num w-11 shrink-0 text-right text-[11px] ${delta >= 0 ? 'text-sl-up' : 'text-sl-down'}`}
          title="Points vs projection"
        >
          {fmtDelta(delta)}
        </span>
      )}
      <span key={p.points} className={`sl-num w-14 shrink-0 text-right text-[15.5px] text-sl-text ${p.points > 0 ? '' : 'text-sl-dim'}`}>
        {fmtPts(p.points)}
      </span>
    </div>
  )
}
