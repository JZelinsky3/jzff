'use client'

// Network bar. The wordmark sits center-stage like a program cover, with the
// league and week set beneath it; the production credit holds the left edge
// and the status instruments hold the right. This is the one strip that is
// always on screen in every mode.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSl, type SlView } from '../SlProvider'
import { StatusTray } from './StatusTray'
import { DemoBar } from './DemoBar'

const SECTIONS: Array<{ id: SlView; label: string }> = [
  { id: 'desk', label: 'THE DESK' },
  { id: 'storylines', label: 'STORYLINES' },
  { id: 'scenarios', label: 'SCENARIOS' },
  { id: 'ballot', label: 'THE BALLOT' },
  { id: 'leaders', label: 'LEADERS' },
  { id: 'news', label: 'NEWS' },
]

function phaseLabel(phase: string): { text: string; live: boolean } {
  switch (phase) {
    case 'live':        return { text: 'LIVE', live: true }
    case 'pre-kickoff': return { text: 'PREGAME', live: false }
    case 'finished':    return { text: 'FINAL', live: false }
    default:            return { text: 'OFF AIR', live: false }
  }
}

function Clock() {
  const [now, setNow] = useState<string>('')
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/New_York',
        }),
      )
    tick()
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [])
  return <span className="sl-num text-xs text-sl-mute">{now ? `${now} ET` : ''}</span>
}

export function Masthead() {
  const { frame, demo, view, setView } = useSl()
  const { name, week, phase, liveQuality, slug } = { ...frame.league }
  const p = phaseLabel(phase)

  return (
    <header className="sticky top-0 z-40 border-b border-sl-line bg-sl-studio/95 backdrop-blur">
      <div className="mx-auto grid max-w-[1840px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 pt-2.5 pb-1">
        {/* Production credit */}
        <div className="min-w-0">
          <span className="sl-display hidden text-[12px] italic text-sl-dim sm:block">
            a Sunday Chronicle production
          </span>
        </div>

        {/* Wordmark + league + week, centered like a program cover */}
        <div className="text-center">
          <div className="sl-display text-[34px] leading-none text-sl-text">
            Sunday <span className="italic text-sl-gold">Live</span>
          </div>
          <div className="mt-1.5 flex items-center justify-center gap-2.5">
            <Link
              href={`/leagues/${slug}/`}
              className="sl-display max-w-[420px] truncate text-[13px] text-sl-mute transition-colors hover:text-sl-text"
              title="Back to the league site"
            >
              {name}
            </Link>
            <span className="text-sl-dim" aria-hidden>·</span>
            <span className="sl-kicker text-sl-cream!">WEEK {week}</span>
          </div>
        </div>

        {/* Phase + quality + clock */}
        <div className="flex items-center justify-end gap-3">
          {demo && <DemoBar />}
          {liveQuality !== 'live' && (
            <span className="sl-chip hidden lg:inline-flex" title="Data feed quality">
              {liveQuality === 'best' ? 'BEST EFFORT' : 'LAST SYNC'}
            </span>
          )}
          <span
            className={`sl-display flex items-center gap-2 text-sm ${p.live ? 'text-sl-live' : 'text-sl-mute'}`}
          >
            {p.live && <span className="sl-live-dot" />}
            {p.text}
          </span>
          <Clock />
          <StatusTray />
        </div>
      </div>

      {/* Section tabs: same app, same poll — switching just swaps the view. */}
      <nav className="mx-auto flex max-w-[1840px] items-center justify-center gap-1.5 px-4 pb-2" aria-label="Broadcast sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setView(s.id)}
            className={`sl-kicker rounded-sm border px-3.5 py-1.5 transition-colors ${
              view === s.id
                ? 'border-sl-navy/70 bg-sl-navy/35 text-sl-cream!'
                : 'border-transparent hover:bg-sl-panel-2 hover:text-sl-text!'
            }`}
            aria-current={view === s.id ? 'page' : undefined}
          >
            {s.label}
          </button>
        ))}
      </nav>
    </header>
  )
}
