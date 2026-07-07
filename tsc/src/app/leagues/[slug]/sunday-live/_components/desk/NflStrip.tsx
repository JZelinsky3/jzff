'use client'

// The real-NFL strip: every game as a mini bug with clock, possession,
// red-zone flash, and a chip when this league has starters in the game.
// League-relevant games arrive first (server pre-sorts).

import type { SlNflGame } from '@/lib/sundayLive/types'
import { useSl } from '../SlProvider'
import { teamColor } from '../../_lib/teamColors'
import { fmtKickoff } from '../../_lib/format'

function TeamLine({
  abbr,
  color,
  score,
  hasBall,
  final,
  won,
}: {
  abbr: string | null
  color: string | null
  score: number
  hasBall: boolean
  final: boolean
  won: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-0.5 rounded"
        style={{ background: color ?? teamColor(abbr) }}
        aria-hidden
      />
      <span className={`sl-display text-[12px] ${final && !won ? 'text-sl-dim' : 'text-sl-text'}`}>
        {abbr ?? '--'}
      </span>
      {hasBall && <span className="text-[8px] text-sl-glow" aria-label="possession">&#9654;</span>}
      <span className={`sl-num ml-auto text-[12px] ${final && !won ? 'text-sl-dim' : 'text-sl-text'}`}>
        {score}
      </span>
    </div>
  )
}

function GameBug({ g }: { g: SlNflGame }) {
  const final = g.state === 'final'
  const starters = g.onFieldLeagueStarters.length + g.redZoneLeagueStarters.length

  return (
    <div
      className={`sl-panel w-[132px] shrink-0 px-2.5 py-1.5 ${g.isRedZone ? 'sl-redzone' : ''} ${
        g.hasLeagueStarter ? '' : 'opacity-60'
      }`}
    >
      <TeamLine
        abbr={g.awayAbbr}
        color={g.awayColor}
        score={g.awayScore}
        hasBall={g.state === 'live' && g.possessionAbbr === g.awayAbbr}
        final={final}
        won={g.awayScore >= g.homeScore}
      />
      <TeamLine
        abbr={g.homeAbbr}
        color={g.homeColor}
        score={g.homeScore}
        hasBall={g.state === 'live' && g.possessionAbbr === g.homeAbbr}
        final={final}
        won={g.homeScore >= g.awayScore}
      />
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className={`sl-num truncate text-[9px] ${g.state === 'live' ? 'text-sl-live' : 'text-sl-dim'}`}>
          {g.state === 'pre' ? (fmtKickoff(g.date) || g.short) : g.short}
        </span>
        {g.isRedZone ? (
          <span className="sl-num shrink-0 text-[8px] font-bold text-sl-live">RZ</span>
        ) : starters > 0 ? (
          <span className="sl-num shrink-0 text-[8px] text-sl-glow">{starters} ON</span>
        ) : g.broadcast ? (
          <span className="sl-num shrink-0 text-[8px] text-sl-dim">{g.broadcast.split(',')[0]}</span>
        ) : null}
      </div>
    </div>
  )
}

export function NflStrip() {
  const { frame } = useSl()
  if (frame.nflGames.length === 0) return null
  return (
    <div className="sl-scroll flex gap-2 overflow-x-auto pb-1" aria-label="NFL scoreboard">
      {frame.nflGames.map((g) => (
        <GameBug key={g.id} g={g} />
      ))}
    </div>
  )
}
