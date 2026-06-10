'use client'

// Event feed — 5–7 visible at a time. New items get the .is-fresh class on the
// poll *after* they first appear; we deliberately don't mark anything fresh on
// SSR or the first client render, so the hydrated tree matches the server tree
// (React 19 throws a hydration mismatch otherwise). Fresh-key state is updated
// inside an effect, never during render.

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { WireEvent } from '@/lib/sundayLive/types'
import { Since } from './Since'

const VISIBLE = 7
const FRESH_MS = 1500

const KIND_LABEL: Record<WireEvent['kind'], string> = {
  kickoff:     'KICK',
  td:          'TD',
  fg:          'FG',
  injury:      'INJ',
  inactive:    'OUT',
  'big-moment': 'BIG',
  final:       'FIN',
  note:        '·',
}

export function TheWire({ slug, events }: { slug: string; events: WireEvent[] }) {
  const seen = useRef<Set<string> | null>(null)
  const list = events.slice(0, VISIBLE)
  const [freshKeys, setFreshKeys] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    // First mount on the client: prime the seen-set with every event currently
    // visible (so the initial render doesn't flash an animation), then mark any
    // NEW keys on subsequent polls.
    if (seen.current == null) {
      seen.current = new Set(list.map((e) => e.key))
      return
    }
    const fresh = new Set<string>()
    for (const e of list) {
      if (!seen.current.has(e.key)) {
        fresh.add(e.key)
        seen.current.add(e.key)
      }
    }
    if (fresh.size === 0) return
    setFreshKeys(fresh)
    const t = setTimeout(() => setFreshKeys(new Set()), FRESH_MS)
    return () => clearTimeout(t)
    // events is the only thing that should re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  return (
    <div className="sl-card overflow-hidden rounded-md">
      <div className="flex items-center justify-between border-b border-sl-edge-soft px-3.5 py-2.5">
        <div className="sl-ff-mono text-[0.58rem] uppercase tracking-[0.26em] text-sl-ember">
          The Wire
        </div>
        <Link
          href={`/leagues/${slug}/sunday-live/wire/`}
          className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.22em] text-sl-mute hover:text-sl-ember"
        >
          Full feed →
        </Link>
      </div>
      <ol className="flex flex-col">
        {list.length === 0 && (
          <li className="px-3.5 py-6 text-center text-xs italic text-sl-mute">
            The wire is quiet — events arrive as the day unfolds.
          </li>
        )}
        {list.map((e) => (
          <li
            key={e.key}
            data-kind={e.kind}
            className={`sl-wire-row border-t border-sl-edge-soft px-3.5 py-2 first:border-t-0 ${freshKeys.has(e.key) ? 'is-fresh' : ''}`}
          >
            <div className="flex items-baseline gap-3">
              <span className="sl-ff-mono w-9 shrink-0 text-[0.55rem] uppercase tracking-[0.16em] text-sl-dim">
                {KIND_LABEL[e.kind]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-sl-cream">{e.headline}</span>
                {e.detail && <span className="mt-0.5 block text-[0.65rem] italic text-sl-mute">{e.detail}</span>}
              </span>
              <span className="sl-ff-mono shrink-0 text-[0.55rem] tracking-[0.12em] text-sl-dim">
                <Since iso={e.at} />
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
