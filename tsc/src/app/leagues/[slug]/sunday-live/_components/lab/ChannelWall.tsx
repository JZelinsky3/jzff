'use client'

// CONCEPT: the rundown as a wall of CRT sets, RedZone-control-room style.
// Every matchup is a television: bezel, scanlines, phosphor numerals, a live
// set flickers faintly. Replaces the list-style rundown with something you
// scan the way you scan a bank of screens.

import type { SlLeague, SlMatchup, SlSide } from '@/lib/sundayLive/types'
import { Avatar } from '../desk/Scorebug'
import { PlayerPips } from '../desk/PlayerPips'
import { fmtPct, fmtPts } from '../../_lib/format'

function SetSide({ side, winning }: { side: SlSide; winning: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar side={side} px={28} />
      <span className="min-w-0 flex-1">
        <span
          className={`sl-display block truncate text-[15px] leading-tight ${
            winning ? 'text-sl-text' : 'text-sl-mute'
          }`}
        >
          {side.teamName}
        </span>
        <PlayerPips
          total={side.players.filter((p) => p.isStarter).length}
          left={side.playersRemaining}
        />
      </span>
      <span
        key={side.score}
        className={`sl-num text-[24px] leading-none ${winning ? 'sl-phosphor' : 'text-sl-dim'}`}
      >
        {fmtPts(side.score)}
      </span>
    </div>
  )
}

function Set({ m, channel }: { m: SlMatchup; channel: number }) {
  const live = m.status === 'live'
  const aWinning = m.a.score >= m.b.score

  return (
    <div className={`sl-crt ${live ? 'sl-crt-live' : ''}`}>
      <div className="relative z-10 p-4 pt-3">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="sl-num text-[10px] tracking-[0.2em] text-sl-dim">
            CH {String(channel).padStart(2, '0')}
          </span>
          {live ? (
            <span className="flex items-center gap-1.5">
              <span className="sl-live-dot" style={{ width: 6, height: 6 }} />
              <span className="sl-num text-[10px] font-bold text-sl-live">ON AIR</span>
            </span>
          ) : (
            <span className="sl-num text-[10px] text-sl-dim">
              {m.status === 'final' ? 'SIGN OFF' : 'UP NEXT'}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <SetSide side={m.a} winning={aWinning} />
          <SetSide side={m.b} winning={!aWinning} />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="sl-num w-9 shrink-0 text-[10px] text-sl-glow">{fmtPct(m.a.wp)}</span>
          <div className="flex h-1 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-gradient-to-r from-sl-electric to-sl-glow"
              style={{ width: `${Math.round(m.a.wp * 100)}%` }}
            />
            <div className="flex-1 bg-sl-navy" />
          </div>
          <span className="sl-num w-9 shrink-0 text-right text-[10px] text-sl-dim">
            {fmtPct(1 - m.a.wp)}
          </span>
        </div>
      </div>
    </div>
  )
}

export function ChannelWall({ frame }: { frame: SlLeague }) {
  const channelById = new Map<number, number>()
  ;[...frame.matchups]
    .sort((a, b) => a.matchupId - b.matchupId)
    .forEach((m, i) => channelById.set(m.matchupId, i + 1))

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {frame.matchups.map((m) => (
        <Set key={m.matchupId} m={m} channel={channelById.get(m.matchupId) ?? 0} />
      ))}
    </div>
  )
}
