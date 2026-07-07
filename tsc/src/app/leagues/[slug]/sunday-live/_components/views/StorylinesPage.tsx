'use client'

// The full storyline sheet: every line the producers are running. Same frame,
// same poll as the desk — switching views only swaps the DOM. The NFL strip
// runs the full desk width; the sheet itself sits centered beneath it.

import { NflStrip } from '../desk/NflStrip'
import { StorylineFeed } from '../desk/StorylineFeed'
import { useSl } from '../SlProvider'

export function StorylinesPage() {
  const { frame } = useSl()
  const counts = new Map<string, number>()
  for (const s of frame.storylines) counts.set(s.category, (counts.get(s.category) ?? 0) + 1)

  return (
    <div className="space-y-3 pt-3">
      <div className="mx-auto max-w-[1840px] px-4">
        <NflStrip />
      </div>
      <div className="mx-auto max-w-[1100px] space-y-3 px-4">
        <div className="flex items-baseline justify-between">
          <h1 className="sl-display text-2xl text-sl-text">The Storyline Sheet</h1>
          <span className="sl-kicker">
            {frame.storylines.length} RUNNING
            {counts.size > 0 && ` · ${[...counts.entries()].map(([c, n]) => `${n} ${c}`.toUpperCase()).join(' · ')}`}
          </span>
        </div>
        <StorylineFeed />
      </div>
    </div>
  )
}
