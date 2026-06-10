'use client'

// Full top-performers leaderboard. Tabs (same 9 scopes as the ticker), 30
// entries per scope, richer row layout.

import { useState } from 'react'
import type { SlLeague, TickerEntry, TickerScope } from '@/lib/sundayLive/types'
import { useSundayLivePoll, type Demo } from '../../_lib/useSundayLivePoll'
import { SubHeader } from './SubHeader'
import { StatusStrip } from '../StatusStrip'
import { DemoBanner } from '../DemoBanner'
import { fmtScore } from '../../_lib/format'

const TABS: { key: TickerScope; label: string }[] = [
  { key: 'all',   label: 'All' },
  { key: 'qb',    label: 'QB' },
  { key: 'rb',    label: 'RB' },
  { key: 'wr',    label: 'WR' },
  { key: 'te',    label: 'TE' },
  { key: 'k',     label: 'K' },
  { key: 'def',   label: 'DEF' },
  { key: 'bench', label: 'Bench' },
  { key: 'duds',  label: 'Duds' },
]

export function PlayersBoard({
  slug,
  initial,
  initialDemo,
}: {
  slug: string
  initial: SlLeague
  initialDemo: Demo | null
}) {
  const { league, refresh, demo, nudgeDemo, exitDemo } = useSundayLivePoll(slug, initial, initialDemo)
  const [scope, setScope] = useState<TickerScope>('all')
  const rows = league.ticker[scope]

  return (
    <>
      <StatusStrip league={league} refresh={refresh} />
      {demo && (
        <DemoBanner demo={demo} onBack={() => nudgeDemo(-0.1)} onFwd={() => nudgeDemo(0.1)} onExit={exitDemo} />
      )}

      <SubHeader
        slug={slug}
        kicker={`Leaderboard · Wk ${league.league.week}`}
        title="Top performers, position by position"
        description="Sortable across every rostered player in your league plus league-wide reach via the ticker scopes."
      />

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setScope(t.key)}
            className={`sl-ff-mono rounded-sm px-2.5 py-1.5 text-[0.58rem] uppercase tracking-[0.22em] transition-colors ${
              scope === t.key
                ? 'border border-sl-ember/40 bg-sl-ember/10 text-sl-ember'
                : 'border border-sl-edge text-sl-mute hover:text-sl-cream'
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="sl-ff-mono ml-2 text-[0.55rem] uppercase tracking-[0.18em] text-sl-dim">
          {rows.length} players
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="sl-card rounded-md px-6 py-12 text-center text-sm italic text-sl-mute">
          No players in this scope yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <PlayerRow key={r.playerId} row={r} />
          ))}
        </div>
      )}
    </>
  )
}

function PlayerRow({ row }: { row: TickerEntry }) {
  const positive = row.projDelta >= 0
  return (
    <div className="sl-card rounded-md p-3">
      <div className="flex items-baseline gap-2.5">
        <span className="sl-ff-mono w-6 shrink-0 text-right text-[0.6rem] text-sl-dim sl-tnum">{row.rank}.</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-sl-cream">{row.name}</span>
          <span className="sl-ff-mono mt-0.5 block text-[0.55rem] uppercase tracking-[0.18em] text-sl-dim">
            {row.position ?? '—'} · {row.team ?? '—'}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="sl-tnum block text-base font-semibold text-sl-ember">{fmtScore(row.points)}</span>
          <span className={`sl-ff-mono block text-[0.55rem] tracking-[0.14em] sl-tnum ${positive ? 'text-sl-green' : 'text-sl-signal'}`}>
            {positive ? '+' : ''}{row.projDelta.toFixed(1)} vs proj
          </span>
        </span>
      </div>
      {(row.startedByOwner || row.benchedByOwner || row.freeAgent) && (
        <div className="sl-ff-mono mt-2 truncate border-t border-sl-edge-soft pt-1.5 text-[0.55rem] uppercase tracking-[0.16em]">
          {row.benchedByOwner ? (
            <span className="text-sl-signal">BENCHED by {row.benchedByOwner}</span>
          ) : row.startedByOwner ? (
            <span className="text-sl-mute">started by {row.startedByOwner}</span>
          ) : (
            <span className="text-sl-violet">free agent</span>
          )}
        </div>
      )}
    </div>
  )
}
