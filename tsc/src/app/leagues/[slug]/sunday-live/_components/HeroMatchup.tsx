'use client'

// The centerpiece of the hub — the cycling matchup spotlight. Rotates through
// every league matchup every ~10s with a short crossfade. Click anywhere on the
// card to land on the matchup booth (Phase 2 route).
//
// Layout (desktop): two manager columns flanking a center divider that grows
// toward the trailing side. Team-color watermark fades in from each side. The
// WP sparkline + Sweat Index pill + Pickems badge sit beneath the score row.

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { SlMatchup } from '@/lib/sundayLive/types'
import { fmtPct, fmtScore } from '../_lib/format'
import { teamColor } from '../_lib/teamColors'
import { WPSparkline } from './WPSparkline'
import { SweatPill } from './SweatPill'
import { PickemsBadge } from './PickemsBadge'

const ROTATE_MS = 10_000

export function HeroMatchup({
  slug,
  matchups,
  onSelect,
}: {
  slug: string
  matchups: SlMatchup[]
  onSelect?: (matchupId: number) => void
}) {
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const len = matchups.length
  const safe = len ? idx % len : 0
  const m = matchups[safe]

  useEffect(() => {
    if (paused || len <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % len), ROTATE_MS)
    return () => clearInterval(t)
  }, [paused, len])

  // Reset to first when matchups change identity (e.g. demo step).
  useEffect(() => { setIdx(0) }, [len])

  const wpPct = m ? Math.round(m.a.wp * 100) : 50

  if (!m) return null
  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Link
        href={`/leagues/${slug}/sunday-live/matchup/${m.matchupId}/`}
        className="sl-card relative block overflow-hidden rounded-md transition-colors hover:border-sl-edge"
        onClick={() => onSelect?.(m.matchupId)}
      >
        <HeroBackdrop matchup={m} />

        {/* Status row */}
        <div className="relative z-[1] flex items-center justify-between px-5 pt-4 pb-2">
          <div className="sl-ff-mono inline-flex items-center gap-2 text-[0.56rem] uppercase tracking-[0.24em]">
            {m.status === 'live' && <span className="sl-pip" aria-hidden />}
            <span className={m.status === 'live' ? 'text-sl-signal' : 'text-sl-mute'}>
              {m.status === 'live' ? 'LIVE' : m.status === 'final' ? 'FINAL' : 'PRE-GAME'}
            </span>
            <span className="text-sl-dim">·</span>
            <span className="text-sl-dim">
              {len > 1 ? `Cycling ${safe + 1} of ${len}` : 'Featured'}
            </span>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <SweatPill score={m.sweatIndex} />
            <PickemsBadge data={m.pickems} />
          </div>
        </div>

        {/* Scores */}
        <div className="relative z-[1] grid grid-cols-[1fr_auto_1fr] items-center px-5 pb-2">
          <ManagerCol side={m.a} align="left" winning={m.a.score >= m.b.score} />
          <div className="px-3 text-center">
            <div className="sl-ff-serif text-[0.65rem] italic text-sl-dim">vs.</div>
          </div>
          <ManagerCol side={m.b} align="right" winning={m.b.score > m.a.score} />
        </div>

        {/* WP row */}
        <div className="relative z-[1] px-5 pb-4 pt-3">
          <div className="mb-1 flex items-center justify-between text-[0.6rem]">
            <span className="sl-ff-mono uppercase tracking-[0.2em] text-sl-cream sl-tnum">
              WP <span className="text-sl-ember">{fmtPct(m.a.wp)}</span>
            </span>
            <div className="hidden sm:block">
              <WPSparkline points={[m.a.wp]} />
            </div>
            <span className="sl-ff-mono uppercase tracking-[0.2em] text-sl-cream sl-tnum">
              <span className="text-sl-cool">{fmtPct(m.b.wp)}</span> WP
            </span>
          </div>
          <div className="sl-wp-track">
            <div className="sl-wp-fill" style={{ width: `${wpPct}%` }} />
            <div className="sl-wp-center" />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.62rem] text-sl-mute">
            <span>
              <span className="text-sl-cream sl-tnum">{m.a.playersRemaining}</span> left ·{' '}
              <span className="text-sl-cream sl-tnum">{m.b.playersRemaining}</span> left
            </span>
            <span className="sl-ff-mono uppercase tracking-[0.2em] text-sl-ember">
              Open booth →
            </span>
          </div>
        </div>
      </Link>

      {/* Dot indicators */}
      {len > 1 && (
        <div className="mt-2.5 flex items-center justify-center gap-2">
          {matchups.map((mm, i) => (
            <button
              key={mm.matchupId}
              type="button"
              aria-label={`Matchup ${i + 1}`}
              onClick={() => { setIdx(i); setPaused(true) }}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === safe ? 20 : 6,
                background: i === safe ? 'var(--sl-ember)' : 'var(--sl-edge)',
              }}
            />
          ))}
          <span className="sl-ff-mono ml-1.5 text-[0.48rem] uppercase tracking-[0.2em] text-sl-dim">
            {paused ? 'paused' : 'auto'}
          </span>
        </div>
      )}
    </div>
  )
}

function ManagerCol({ side, align, winning }: { side: SlMatchup['a']; align: 'left' | 'right'; winning: boolean }) {
  return (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <div className="truncate text-[0.7rem] font-semibold text-sl-cream sm:text-sm">
        {side.teamName}
      </div>
      <div className="truncate text-[0.6rem] text-sl-mute sm:text-[0.65rem]">
        {side.ownerName}
      </div>
      <div className={`sl-tnum sl-ff-serif mt-1 leading-none ${winning ? 'text-sl-ember' : 'text-sl-cream'}`}
        style={{ fontSize: 'clamp(2.4rem, 6vw, 4.2rem)', fontWeight: 600, letterSpacing: '-0.02em' }}
      >
        {fmtScore(side.score)}
      </div>
      <div className="sl-ff-mono mt-1 text-[0.55rem] uppercase tracking-[0.18em] text-sl-dim sm:text-[0.6rem]">
        proj <span className="text-sl-mute sl-tnum">{fmtScore(side.projected)}</span>
      </div>
    </div>
  )
}

// Faint team-color watermark + a center momentum divider that grows toward the
// trailing side proportional to WP. Purely cosmetic.
function HeroBackdrop({ matchup }: { matchup: SlMatchup }) {
  // Derive watermark color from each side's most-prominent team.
  const colorA = useMemo(() => deriveTeamColor(matchup.a), [matchup.a])
  const colorB = useMemo(() => deriveTeamColor(matchup.b), [matchup.b])
  const wpA = matchup.a.wp
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `
            linear-gradient(90deg, ${colorA}1A 0%, transparent 30%, transparent 70%, ${colorB}1A 100%)
          `,
        }}
      />
      {/* Center divider — grows toward losing side */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 z-0 w-px"
        style={{
          left: `${Math.round(wpA * 100)}%`,
          background: 'linear-gradient(180deg, transparent 0%, rgba(212, 168, 73, 0.45) 40%, rgba(212, 168, 73, 0.45) 60%, transparent 100%)',
          transition: 'left 0.85s cubic-bezier(0.2, 0.7, 0.2, 1)',
        }}
      />
    </>
  )
}

function deriveTeamColor(side: SlMatchup['a']): string {
  // Use the team color of the highest-projected starter as a proxy.
  let bestTeam: string | null = null
  let bestProj = -Infinity
  for (const p of side.players) {
    if (!p.isStarter || !p.team) continue
    if (p.projected > bestProj) { bestProj = p.projected; bestTeam = p.team }
  }
  return teamColor(bestTeam)
}
