'use client'

// Demo controls: week input + progress scrubber. Only rendered when demo mode
// is active (offseason dev / preview links). Keeps the URL in sync via
// history.replaceState so demo states stay shareable.

import { useSl } from '../SlProvider'
import type { Demo } from '../../_lib/useSlPoll'

function writeUrl(demo: Demo) {
  const url = new URL(window.location.href)
  url.searchParams.set('demoWeek', `${demo.year}-${demo.week}`)
  url.searchParams.set('progress', String(demo.progress))
  window.history.replaceState(null, '', url)
}

export function DemoBar() {
  const { frame, demo, setDemo } = useSl()
  if (!demo) return null

  const update = (next: Demo) => {
    setDemo(next)
    writeUrl(next)
  }

  return (
    <div className="flex items-center gap-1.5 rounded border border-sl-gold/30 bg-sl-gold/10 px-1.5 py-0.5">
      <span className="sl-kicker text-[8.5px]! text-sl-gold!">
        {frame.meta.showcase ? 'SHOWCASE' : 'DEMO'} {demo.year} W{demo.week}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={demo.progress}
        onChange={(e) => update({ ...demo, progress: Number(e.target.value) })}
        className="h-0.5 w-16 accent-sl-gold"
        aria-label="Sunday progress"
      />
      <span className="sl-num w-7 text-right text-[10px] text-sl-gold">
        {Math.round(demo.progress * 100)}%
      </span>
    </div>
  )
}
