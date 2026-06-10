'use client'

// Tiny status row beneath the masthead — week, phase, sync indicator. Time
// rendering deferred to <Since> so SSR + first client render match.

import type { SlLeague } from '@/lib/sundayLive/types'
import type { RefreshState } from '../_lib/useSundayLivePoll'
import { Since } from './Since'

const PHASE_LABEL: Record<SlLeague['league']['phase'], string> = {
  'pre-kickoff': 'PRE-KICKOFF',
  'live': 'LIVE',
  'finished': 'FINAL',
  'idle': 'IDLE',
}

const REFRESH_LABEL: Record<RefreshState, string> = {
  live: 'live',
  updating: 'updating…',
  retrying: 'retrying…',
  demo: 'demo',
  idle: 'idle',
}

export function StatusStrip({
  league,
  refresh,
}: {
  league: SlLeague
  refresh: RefreshState
}) {
  return (
    <div className="sl-ff-mono mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-sl-edge-soft pb-3 text-[0.58rem] uppercase tracking-[0.22em] text-sl-mute">
      <div className="flex items-center gap-3">
        <span>Wk {league.league.week} · {league.league.year}</span>
        <span className="text-sl-dim">·</span>
        <span className="text-sl-cream">{PHASE_LABEL[league.league.phase]}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sl-dim">Sync <Since iso={league.meta.fetchedAt} /></span>
        <span className="text-sl-dim">·</span>
        <span className={refresh === 'retrying' ? 'text-sl-signal' : 'text-sl-cream'}>
          {REFRESH_LABEL[refresh]}
        </span>
      </div>
    </div>
  )
}
