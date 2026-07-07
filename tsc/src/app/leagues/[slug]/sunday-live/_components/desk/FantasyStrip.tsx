'use client'

// The league's own scoreboard strip: every fantasy matchup as a mini bug,
// mirroring the NFL strip. Clicking a bug puts that game on the desk stage.

import type { SlMatchup } from '@/lib/sundayLive/types'
import { useSl } from '../SlProvider'
import { fmtPts } from '../../_lib/format'

function SideLine({ name, score, winning, final }: { name: string; score: number; winning: boolean; final: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`sl-display min-w-0 flex-1 truncate text-[12px] ${final && !winning ? 'text-sl-dim' : 'text-sl-text'}`}>
        {name}
      </span>
      <span className={`sl-num text-[12px] ${winning ? 'text-sl-glow' : 'text-sl-dim'}`}>{fmtPts(score)}</span>
    </div>
  )
}

function MatchupBug({ m }: { m: SlMatchup }) {
  const { setPinned, setView } = useSl()
  const final = m.status === 'final'
  const aWinning = m.a.score >= m.b.score
  return (
    <button
      type="button"
      onClick={() => {
        setPinned(m.matchupId)
        setView('desk')
      }}
      className="sl-panel w-[168px] shrink-0 px-2.5 py-1.5 text-left transition-colors hover:bg-sl-panel-2"
      title="Put this game on the stage"
    >
      <SideLine name={m.a.teamName} score={m.a.score} winning={aWinning} final={final} />
      <SideLine name={m.b.teamName} score={m.b.score} winning={!aWinning} final={final} />
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className={`sl-num text-[9px] ${m.status === 'live' ? 'text-sl-live' : 'text-sl-dim'}`}>
          {m.status === 'live' ? 'LIVE' : m.status === 'pre' ? 'PREGAME' : 'FINAL'}
        </span>
        {m.status !== 'final' && (
          <span className="sl-num text-[9px] text-sl-dim">
            {m.a.playersRemaining + m.b.playersRemaining} LEFT
          </span>
        )}
      </div>
    </button>
  )
}

export function FantasyStrip() {
  const { frame } = useSl()
  if (frame.matchups.length === 0) return null
  return (
    <div className="sl-scroll flex gap-2 overflow-x-auto pb-1" aria-label="League scoreboard">
      {frame.matchups.map((m) => (
        <MatchupBug key={m.matchupId} m={m} />
      ))}
    </div>
  )
}
