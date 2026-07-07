'use client'

// The concept bench shell. Fetches one showcase frame from the existing data
// route (no poll, no snapshots) and lets us flip between experimental
// presentation concepts on the same data. Everything here is disposable by
// design: ideas that win get rebuilt properly on the desk.

import './lab.css'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { SlLeague } from '@/lib/sundayLive/types'
import type { SlWeekContext } from '@/lib/sundayLive/seasonContext'
import type { Demo } from '../../_lib/useSlPoll'
import { ChannelWall } from './ChannelWall'
import { CommandCenter } from '../desk/CommandCenter'
import { Teletype } from './Teletype'
import { PaletteLab } from './PaletteLab'
import { WORLDS, type WorldId } from './worlds'

export type LabConcept = 'center' | 'wall' | 'wire' | 'palettes'

const CONCEPTS: Array<{ id: LabConcept; label: string; blurb: string }> = [
  { id: 'center',   label: 'COMMAND CENTER', blurb: 'Full-page format: monitor wall left, the game big in the middle, the wire right.' },
  { id: 'wall',     label: 'CHANNEL WALL',   blurb: 'The rundown as a bank of CRT sets: a RedZone wall instead of a list.' },
  { id: 'wire',     label: 'THE TELETYPE',   blurb: 'New bulletins type themselves onto wire paper as they land.' },
  { id: 'palettes', label: 'PALETTES',       blurb: 'Night and day side by side, plus the pick\'ems mark candidates.' },
]

function writeUrl(concept: LabConcept, demo: Demo, world: WorldId) {
  const url = new URL(window.location.href)
  url.searchParams.set('concept', concept)
  url.searchParams.set('world', world)
  url.searchParams.set('demoWeek', `${demo.year}-${demo.week}`)
  url.searchParams.set('progress', String(demo.progress))
  window.history.replaceState(null, '', url)
}

export function LabApp({
  slug,
  initialDemo,
  initialConcept,
  initialWorld,
  initialFrame,
  weekContext,
}: {
  slug: string
  initialDemo: Demo
  initialConcept: LabConcept
  initialWorld: WorldId
  initialFrame: SlLeague | null
  weekContext: SlWeekContext | null
}) {
  const [concept, setConcept] = useState<LabConcept>(initialConcept)
  const [world, setWorld] = useState<WorldId>(initialWorld)
  const [demo, setDemo] = useState<Demo>(initialDemo)
  const [frame, setFrame] = useState<SlLeague | null>(initialFrame)
  const [error, setError] = useState<string | null>(null)

  // The command center's surf state lives with the bench now that the room
  // itself ships from desk/: pinning by click, else a simple 12s rotation
  // (production rides the real storyline-boosted rotation instead).
  const [watching, setWatching] = useState<number | null>(null)
  const [rotIdx, setRotIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setRotIdx((i) => i + 1), 12_000)
    return () => clearInterval(id)
  }, [])
  const ordered = frame ? [...frame.matchups].sort((a, b) => a.matchupId - b.matchupId) : []
  const ccFeatured =
    watching ?? (ordered.length > 0 ? ordered[rotIdx % ordered.length].matchupId : null)

  // First render already has the SSR frame; only refetch on scrubs (or when
  // SSR came up empty).
  const mountedRef = useRef(false)
  const hadInitialRef = useRef(initialFrame != null)

  const demoKey = `${demo.year}-${demo.week}-${demo.progress}`
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      if (hadInitialRef.current) return
    }
    const ctrl = new AbortController()
    const q = new URLSearchParams({
      demoWeek: demoKey.split('-').slice(0, 2).join('-'),
      progress: demoKey.split('-')[2],
    })
    fetch(`/leagues/${slug}/sunday-live/data/?${q}`, { signal: ctrl.signal, cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`data route ${res.status}`)
        return res.json()
      })
      .then((next: SlLeague) => {
        setFrame(next)
        setError(null)
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
    return () => ctrl.abort()
  }, [slug, demoKey])

  const active = CONCEPTS.find((c) => c.id === concept) ?? CONCEPTS[0]

  return (
    <div className="mx-auto max-w-[1840px] space-y-4 px-4 py-5">
      {/* Bench header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="sl-display text-[26px] leading-none text-sl-text">
            Sunday Live <span className="italic text-sl-gold">Lab</span>
          </div>
          <p className="mt-1 text-[12px] text-sl-dim">
            Concept bench. Nothing here ships; winners get rebuilt on the desk.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="sl-kicker">SUNDAY</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={demo.progress}
              onChange={(e) => {
                const next = { ...demo, progress: Number(e.target.value) }
                setDemo(next)
                writeUrl(concept, next, world)
              }}
              className="h-1 w-28 accent-sl-gold"
              aria-label="Sunday progress"
            />
            <span className="sl-num w-8 text-right text-[11px] text-sl-gold">
              {Math.round(demo.progress * 100)}%
            </span>
          </label>
          <a
            href={`/leagues/${slug}/sunday-live/?demoWeek=${demo.year}-${demo.week}&progress=${demo.progress}`}
            className="sl-chip transition-colors hover:text-sl-text"
          >
            BACK TO THE DESK
          </a>
        </div>
      </div>

      {/* Concept switcher */}
      <div className="flex flex-wrap items-center gap-1.5 border-y border-sl-line py-2">
        {CONCEPTS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setConcept(c.id)
              writeUrl(c.id, demo, world)
            }}
            className={`sl-kicker rounded-sm border px-3 py-1.5 transition-colors ${
              concept === c.id
                ? 'border-sl-navy/70 bg-sl-navy/35 text-sl-cream!'
                : 'border-transparent hover:bg-sl-panel-2 hover:text-sl-text!'
            }`}
            aria-current={concept === c.id ? 'page' : undefined}
          >
            {c.label}
          </button>
        ))}
        <span className="ml-2 hidden text-[11.5px] text-sl-dim md:inline">{active.blurb}</span>
        {/* World switcher: repaint the whole bench in a candidate palette. */}
        <span className="ml-auto flex items-center gap-1.5">
          <span className="sl-kicker">WORLD</span>
          {WORLDS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                setWorld(w.id)
                writeUrl(concept, demo, w.id)
              }}
              className={`sl-chip transition-colors hover:text-sl-text ${
                world === w.id ? 'border-sl-gold/60 text-sl-gold!' : ''
              }`}
              title={w.why}
            >
              {w.name.toUpperCase()}
            </button>
          ))}
        </span>
      </div>

      {/* The bench, painted in the chosen world */}
      <div
        style={{ ...(WORLDS.find((w) => w.id === world)?.vars ?? {}), background: 'var(--sl-void)' } as CSSProperties}
        className="rounded-lg p-3"
      >
        {error ? (
          <p className="py-16 text-center text-[13px] text-sl-down">Frame failed to load: {error}</p>
        ) : !frame ? (
          <p className="py-16 text-center text-[13px] text-sl-dim">Rolling tape...</p>
        ) : concept === 'wall' ? (
          <ChannelWall frame={frame} />
        ) : concept === 'wire' ? (
          <Teletype frame={frame} />
        ) : concept === 'palettes' ? (
          <PaletteLab frame={frame} />
        ) : (
          <CommandCenter
            frame={frame}
            weekContext={weekContext}
            featured={ccFeatured}
            pinned={watching != null}
            onWatch={setWatching}
            onTogglePin={() => setWatching(watching != null ? null : ccFeatured)}
            leadersHref={`/leagues/${slug}/sunday-live/?view=leaders`}
            gameHref={(id) =>
              `/leagues/${slug}/sunday-live/matchup/${id}/?demoWeek=${demo.year}-${demo.week}&progress=${demo.progress}`
            }
          />
        )}
      </div>
    </div>
  )
}
