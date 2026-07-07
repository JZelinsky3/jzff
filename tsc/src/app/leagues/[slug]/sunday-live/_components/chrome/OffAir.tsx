'use client'

// Off-air panel: idle weeks and the offseason. Never a blank desk; the test
// pattern plus demo links keep the page alive and previewable.

import { useSl } from '../SlProvider'
import type { Demo } from '../../_lib/useSlPoll'

export function OffAir() {
  const { frame, setDemo } = useSl()
  const lastSeason = frame.league.year > 2020 ? frame.league.year - 1 : frame.league.year

  const startDemo = (demo: Demo) => {
    setDemo(demo)
    const url = new URL(window.location.href)
    url.searchParams.set('demoWeek', `${demo.year}-${demo.week}`)
    url.searchParams.set('progress', String(demo.progress))
    window.history.replaceState(null, '', url)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <div className="sl-offair-bars mb-8 h-20 w-full max-w-md rounded" />
      <p className="sl-kicker mb-2">NO GAMES ON THE SLATE</p>
      <h1 className="sl-display mb-3 text-4xl text-sl-text">WE ARE OFF AIR</h1>
      <p className="mb-8 max-w-md text-sm text-sl-mute">
        The broadcast goes live on Sundays during the season. Until then you can
        replay a past week and scrub through the afternoon.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => startDemo({ year: lastSeason, week: 8, progress: 0.55 })}
          className="sl-display rounded border border-sl-electric bg-sl-electric/15 px-4 py-2 text-sm text-sl-text transition-colors hover:bg-sl-electric/30"
        >
          Replay a Sunday
        </button>
        <button
          type="button"
          onClick={() => startDemo({ year: lastSeason, week: 8, progress: 0 })}
          className="sl-display rounded border border-sl-line px-4 py-2 text-sm text-sl-mute transition-colors hover:text-sl-text"
        >
          Pregame view
        </button>
      </div>
    </div>
  )
}
