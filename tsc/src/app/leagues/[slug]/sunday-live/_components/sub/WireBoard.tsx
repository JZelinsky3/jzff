'use client'

// Full event feed with filter chips. Same row styling as TheWire on the hub
// but unbounded length + filterable.

import { useMemo, useState } from 'react'
import type { SlLeague, WireEvent } from '@/lib/sundayLive/types'
import { useSundayLivePoll, type Demo } from '../../_lib/useSundayLivePoll'
import { SubHeader } from './SubHeader'
import { StatusStrip } from '../StatusStrip'
import { DemoBanner } from '../DemoBanner'
import { Since } from '../Since'

type Filter = 'all' | 'league' | 'nfl' | 'injury' | 'big'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'league',  label: 'My league' },
  { key: 'nfl',     label: 'NFL-wide' },
  { key: 'injury',  label: 'Injuries' },
  { key: 'big',     label: 'Big Moments' },
]

const KIND_LABEL: Record<WireEvent['kind'], string> = {
  kickoff:    'KICK',
  td:         'TD',
  fg:         'FG',
  injury:     'INJ',
  inactive:   'OUT',
  'big-moment': 'BIG',
  final:      'FIN',
  note:       '·',
}

export function WireBoard({
  slug,
  initial,
  initialDemo,
}: {
  slug: string
  initial: SlLeague
  initialDemo: Demo | null
}) {
  const { league, refresh, demo, nudgeDemo, exitDemo } = useSundayLivePoll(slug, initial, initialDemo)
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = useMemo(() => {
    let list = league.wire
    if (filter === 'league') list = list.filter((e) => e.affiliation === 'league')
    if (filter === 'nfl')    list = list.filter((e) => e.affiliation === 'nfl')
    if (filter === 'injury') list = list.filter((e) => e.kind === 'injury' || e.kind === 'inactive')
    if (filter === 'big')    list = list.filter((e) => e.kind === 'big-moment')
    return list
  }, [league.wire, filter])

  return (
    <>
      <StatusStrip league={league} refresh={refresh} />
      {demo && (
        <DemoBanner demo={demo} onBack={() => nudgeDemo(-0.1)} onFwd={() => nudgeDemo(0.1)} onExit={exitDemo} />
      )}

      <SubHeader
        slug={slug}
        kicker={`The Wire · Wk ${league.league.week}`}
        title="Every event from the broadcast"
        description="Kickoffs, scoring plays, injuries, inactives, and Big Moments — full feed, newest first."
      />

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`sl-ff-mono rounded-sm px-2.5 py-1.5 text-[0.58rem] uppercase tracking-[0.22em] transition-colors ${
              filter === f.key
                ? 'border border-sl-ember/40 bg-sl-ember/10 text-sl-ember'
                : 'border border-sl-edge text-sl-mute hover:text-sl-cream'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="sl-ff-mono ml-2 text-[0.55rem] uppercase tracking-[0.18em] text-sl-dim">
          {filtered.length} events
        </span>
      </div>

      <div className="sl-card overflow-hidden rounded-md">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm italic text-sl-mute">
            The wire is quiet for this filter.
          </div>
        ) : (
          <ol>
            {filtered.map((e) => (
              <li
                key={e.key}
                data-kind={e.kind}
                className="sl-wire-row border-t border-sl-edge-soft px-4 py-2.5 first:border-t-0"
              >
                <div className="flex items-baseline gap-3">
                  <span className="sl-ff-mono w-9 shrink-0 text-[0.55rem] uppercase tracking-[0.16em] text-sl-dim">
                    {KIND_LABEL[e.kind]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-sl-cream">{e.headline}</span>
                    {e.detail && <span className="mt-0.5 block text-xs italic text-sl-mute">{e.detail}</span>}
                  </span>
                  <span className="sl-ff-mono shrink-0 text-[0.55rem] tracking-[0.12em] text-sl-dim">
                    <Since iso={e.at} />
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  )
}
