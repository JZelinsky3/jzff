'use client'

// One producer line. The left rule is colored by category so the feed scans
// like a rundown sheet: game beats are electric, player beats glow, revenge
// runs hot, history is gold, league politics are green.

import type { Storyline, StorylineCategory } from '@/lib/sundayLive/types'
import { useSl } from '../SlProvider'

const CATEGORY_COLOR: Record<StorylineCategory, string> = {
  game: 'var(--sl-electric)',
  player: 'var(--sl-glow)',
  revenge: 'var(--sl-live)',
  history: 'var(--sl-gold)',
  league: 'var(--sl-up)',
}

function kindLabel(kind: string): string {
  return kind.replace(/-/g, ' ').toUpperCase()
}

export function StorylineCard({ s }: { s: Storyline }) {
  const { newStorylineIds, feature } = useSl()
  const isNew = newStorylineIds.has(s.id)
  const color = CATEGORY_COLOR[s.category]
  const clickable = s.refs.matchupId != null

  const body = (
    <>
      <div className="mb-0.5 flex items-center gap-2">
        <span className="sl-kicker" style={{ color }}>
          {kindLabel(s.kind)}
        </span>
        {isNew && (
          <span className="sl-chip border-sl-glow/50 px-1.5! py-0! text-[9px]! text-sl-glow!">NEW</span>
        )}
      </div>
      <p className="sl-display text-[15px] leading-snug text-sl-text">{s.headline}</p>
      {s.subline && <p className="mt-0.5 text-[11px] text-sl-mute">{s.subline}</p>}
    </>
  )

  const ruleStyle = { boxShadow: `inset 3px 0 0 ${color}` }

  if (!clickable) {
    return (
      <div className="border-b border-sl-line/50 px-3 py-2 last:border-b-0" style={ruleStyle}>
        {body}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => feature(s.refs.matchupId!)}
      className="block w-full border-b border-sl-line/50 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-sl-panel-2"
      style={ruleStyle}
      title="Put this game on the stage"
    >
      {body}
    </button>
  )
}
