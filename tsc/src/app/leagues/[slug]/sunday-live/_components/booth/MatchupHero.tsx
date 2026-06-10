'use client'

// Frozen big matchup card for the booth — same visual language as the hub's
// HeroMatchup but doesn't cycle, doesn't link out. Larger scores, fuller WP
// row, both pickems badge + sweat pill always shown.

import type { SlMatchup } from '@/lib/sundayLive/types'
import { fmtPct, fmtScore } from '../../_lib/format'
import { WPSparkline } from '../WPSparkline'
import { SweatPill } from '../SweatPill'
import { PickemsBadge } from '../PickemsBadge'

export function MatchupHero({ matchup }: { matchup: SlMatchup }) {
  const wpPct = Math.round(matchup.a.wp * 100)
  return (
    <div className="sl-card relative overflow-hidden rounded-md">
      <div className="relative z-[1] flex items-center justify-between px-5 pt-4 pb-2">
        <div className="sl-ff-mono inline-flex items-center gap-2 text-[0.58rem] uppercase tracking-[0.24em]">
          {matchup.status === 'live' && <span className="sl-pip" aria-hidden />}
          <span className={matchup.status === 'live' ? 'text-sl-signal' : 'text-sl-mute'}>
            {matchup.status === 'live' ? 'LIVE' : matchup.status === 'final' ? 'FINAL' : 'PRE-GAME'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SweatPill score={matchup.sweatIndex} />
          <PickemsBadge data={matchup.pickems} />
        </div>
      </div>

      <div className="relative z-[1] grid grid-cols-[1fr_auto_1fr] items-center px-5 pb-3">
        <Side side={matchup.a} align="left" winning={matchup.a.score >= matchup.b.score} />
        <div className="px-3 text-center">
          <div className="sl-ff-serif text-sm italic text-sl-dim">vs.</div>
        </div>
        <Side side={matchup.b} align="right" winning={matchup.b.score > matchup.a.score} />
      </div>

      <div className="relative z-[1] px-5 pb-5 pt-2">
        <div className="mb-1.5 flex items-center justify-between text-[0.62rem]">
          <span className="sl-ff-mono uppercase tracking-[0.2em] text-sl-cream sl-tnum">
            WP <span className="text-sl-ember">{fmtPct(matchup.a.wp)}</span>
          </span>
          <div className="hidden sm:block">
            <WPSparkline points={[matchup.a.wp]} />
          </div>
          <span className="sl-ff-mono uppercase tracking-[0.2em] text-sl-cream sl-tnum">
            <span className="text-sl-cool">{fmtPct(matchup.b.wp)}</span> WP
          </span>
        </div>
        <div className="sl-wp-track">
          <div className="sl-wp-fill" style={{ width: `${wpPct}%` }} />
          <div className="sl-wp-center" />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[0.62rem] text-sl-mute">
          <span>
            <span className="text-sl-cream sl-tnum">{matchup.a.playersRemaining}</span> remaining ·{' '}
            <span className="text-sl-cream sl-tnum">{matchup.b.playersRemaining}</span> remaining
          </span>
          <span>
            margin <span className="text-sl-cream sl-tnum">{Math.abs(matchup.a.score - matchup.b.score).toFixed(1)}</span>
          </span>
        </div>
      </div>
    </div>
  )
}

function Side({ side, align, winning }: { side: SlMatchup['a']; align: 'left' | 'right'; winning: boolean }) {
  return (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <div className="truncate text-sm font-semibold text-sl-cream sm:text-base">{side.teamName}</div>
      <div className="truncate text-[0.62rem] text-sl-mute sm:text-[0.7rem]">{side.ownerName}</div>
      <div
        className={`sl-tnum sl-ff-serif mt-1 leading-none ${winning ? 'text-sl-ember' : 'text-sl-cream'}`}
        style={{ fontSize: 'clamp(2.8rem, 7vw, 5rem)', fontWeight: 600, letterSpacing: '-0.02em' }}
      >
        {fmtScore(side.score)}
      </div>
      <div className="sl-ff-mono mt-1 text-[0.6rem] uppercase tracking-[0.18em] text-sl-dim">
        proj <span className="text-sl-mute sl-tnum">{fmtScore(side.projected)}</span>
      </div>
    </div>
  )
}
