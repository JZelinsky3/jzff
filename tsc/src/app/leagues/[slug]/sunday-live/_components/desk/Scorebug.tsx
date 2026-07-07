'use client'

// The score bug. One component, three sizes, so the stage, the rundown, and
// the surf channels all read as the same broadcast graphic.

import type { SlMatchup, SlSide } from '@/lib/sundayLive/types'
import { useSl } from '../SlProvider'
import { fmtPts } from '../../_lib/format'

type Size = 'stage' | 'row' | 'channel'

export function Avatar({ side, px }: { side: SlSide; px: number }) {
  if (!side.avatarUrl) {
    return (
      <span
        className="sl-display flex items-center justify-center rounded bg-sl-panel-2 text-sl-dim"
        style={{ width: px, height: px, fontSize: px * 0.45 }}
        aria-hidden
      >
        {side.teamName.slice(0, 1)}
      </span>
    )
  }
  // Sleeper CDN avatars; plain img keeps remotePatterns config out of scope.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={side.avatarUrl}
      alt=""
      width={px}
      height={px}
      className="rounded object-cover"
      style={{ width: px, height: px }}
    />
  )
}

function SideLine({
  side,
  winning,
  size,
}: {
  side: SlSide
  winning: boolean
  size: Size
}) {
  const { scoreDelta } = useSl()
  const bumped = (scoreDelta.get(side.rosterId) ?? 0) > 0
  const big = size !== 'row'

  return (
    <div className="flex items-center gap-3">
      <Avatar side={side} px={big ? (size === 'channel' ? 44 : 34) : 22} />
      <div className="min-w-0 flex-1">
        <div
          className={`sl-display truncate leading-tight ${
            big ? (size === 'channel' ? 'text-2xl' : 'text-lg') : 'text-[13.5px]'
          } ${winning ? 'text-sl-text' : 'text-sl-mute'}`}
        >
          {side.teamName}
        </div>
        {big && <div className="truncate text-[11px] text-sl-dim">{side.ownerName}</div>}
      </div>
      {big && (
        <div className="text-right">
          <div className="sl-num text-[10px] text-sl-dim">
            proj {fmtPts(side.projected)} · {side.playersRemaining} left
          </div>
        </div>
      )}
      {/* Key on the value: a change remounts the span and replays the bump. */}
      <span
        key={side.score}
        className={`sl-num text-right leading-none ${
          big ? (size === 'channel' ? 'text-5xl' : 'text-3xl') : 'text-[16px]'
        } ${winning ? 'text-sl-text' : 'text-sl-dim'} ${bumped ? 'sl-bump' : ''}`}
        style={{ minWidth: big ? (size === 'channel' ? 130 : 92) : 56 }}
      >
        {fmtPts(side.score)}
      </span>
    </div>
  )
}

export function Scorebug({ matchup, size }: { matchup: SlMatchup; size: Size }) {
  const aWinning = matchup.a.score >= matchup.b.score
  return (
    <div className={size === 'row' ? 'space-y-0.5' : 'space-y-2'}>
      <SideLine side={matchup.a} winning={aWinning} size={size} />
      <SideLine side={matchup.b} winning={!aWinning} size={size} />
    </div>
  )
}
