'use client'

// 6 tiles visible at once; rotates through frames every 15s.
// "View all games →" links to a dedicated sub-route (Phase 4).

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { SlNflGame } from '@/lib/sundayLive/types'

const PER_FRAME = 6
const ROTATE_MS = 15_000

export function NFLStrip({ slug, games }: { slug: string; games: SlNflGame[] }) {
  const [frame, setFrame] = useState(0)
  const [paused, setPaused] = useState(false)

  const frames = useMemo(() => {
    if (games.length === 0) return [[]]
    const out: SlNflGame[][] = []
    for (let i = 0; i < games.length; i += PER_FRAME) out.push(games.slice(i, i + PER_FRAME))
    return out
  }, [games])

  useEffect(() => {
    if (paused || frames.length <= 1) return
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [paused, frames.length])

  const current = frames[frame % Math.max(1, frames.length)] ?? []

  return (
    <div
      className="sl-card overflow-hidden rounded-md"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center justify-between border-b border-sl-edge-soft px-3.5 py-2.5">
        <div className="sl-ff-mono text-[0.58rem] uppercase tracking-[0.26em] text-sl-ember">
          NFL · this window
        </div>
        <div className="flex items-center gap-3">
          {frames.length > 1 && (
            <div className="flex items-center gap-1.5">
              {frames.map((_, i) => (
                <span
                  key={i}
                  className="block h-1 rounded-full transition-all"
                  style={{
                    width: i === frame % frames.length ? 14 : 4,
                    background: i === frame % frames.length ? 'var(--sl-ember)' : 'var(--sl-edge)',
                  }}
                />
              ))}
            </div>
          )}
          <Link
            href={`/leagues/${slug}/sunday-live/games/`}
            className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.22em] text-sl-mute hover:text-sl-ember"
          >
            All games →
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-6">
        {current.map((g) => (
          <NFLTile key={g.id} game={g} />
        ))}
        {Array.from({ length: Math.max(0, PER_FRAME - current.length) }).map((_, i) => (
          <div key={`pad-${i}`} className="aspect-square rounded-sm border border-dashed border-sl-edge-soft opacity-30" />
        ))}
      </div>
    </div>
  )
}

function NFLTile({ game }: { game: SlNflGame }) {
  const live = game.state === 'live'
  const finished = game.state === 'final'
  const hasAnnot = game.onFieldLeagueStarters.length + game.redZoneLeagueStarters.length > 0
  return (
    <div className={`relative flex flex-col gap-1 rounded-sm border bg-sl-stadium-hi/40 p-2 ${live ? 'border-sl-edge' : 'border-sl-edge-soft'}`}>
      <div className="flex items-center justify-between text-[0.55rem]">
        <span className="sl-ff-mono uppercase tracking-[0.18em] text-sl-dim">
          {live ? <><span className="sl-pip mr-1" aria-hidden />Q{game.short.match(/Q?\d/)?.[0] ?? ''}</> : finished ? 'FINAL' : game.short}
        </span>
        {hasAnnot && (
          <span className="sl-ff-mono rounded-sm border border-sl-ember/50 bg-sl-ember/10 px-1 py-0.5 text-[0.5rem] uppercase tracking-[0.18em] text-sl-ember">
            {game.redZoneLeagueStarters.length > 0 ? 'RZ' : 'ON'}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <TeamLine abbr={game.awayAbbr} score={game.awayScore} possession={game.possessionAbbr === game.awayAbbr} winning={game.awayScore > game.homeScore} />
      </div>
      <div className="flex items-center justify-between">
        <TeamLine abbr={game.homeAbbr} score={game.homeScore} possession={game.possessionAbbr === game.homeAbbr} winning={game.homeScore > game.awayScore} />
      </div>
      {hasAnnot && (
        <div className="sl-ff-mono truncate text-[0.5rem] uppercase tracking-[0.16em] text-sl-ember">
          {[...game.redZoneLeagueStarters, ...game.onFieldLeagueStarters].slice(0, 2).join(' · ')}
        </div>
      )}
    </div>
  )
}

function TeamLine({ abbr, score, possession, winning }: { abbr: string | null; score: number; possession: boolean; winning: boolean }) {
  return (
    <>
      <span className="sl-ff-mono inline-flex items-center gap-1 text-xs font-semibold text-sl-cream">
        {possession && <span className="text-sl-ember">●</span>}
        {abbr ?? '—'}
      </span>
      <span className={`sl-tnum text-lg font-semibold leading-none ${winning ? 'text-sl-ember' : 'text-sl-cream'}`}>
        {score}
      </span>
    </>
  )
}
