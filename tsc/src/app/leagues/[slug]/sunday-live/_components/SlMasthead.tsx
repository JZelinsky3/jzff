// Sticky top chrome — league name + week + LIVE pip + live-quality pill.
// Deliberately minimal; the hero matchup *is* the page banner.

import Link from 'next/link'
import type { SlMeta } from '@/lib/sundayLive/access'

const QUALITY_LABEL: Record<'live' | 'best' | 'stale', string> = {
  live: 'LIVE',
  best: 'BEST EFFORT',
  stale: 'LAST SYNC',
}

export function SlMasthead({
  meta,
  liveQuality = 'live',
}: {
  meta: SlMeta
  liveQuality?: 'live' | 'best' | 'stale'
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-sl-edge-soft bg-sl-ink/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-3 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/leagues/${meta.slug}/`}
            className="sl-ff-mono shrink-0 text-[0.6rem] uppercase tracking-[0.22em] text-sl-mute hover:text-sl-ember"
          >
            ← Almanac
          </Link>
          <div className="hidden h-4 w-px bg-sl-edge-soft sm:block" />
          <div className="min-w-0">
            <div className="sl-ff-mono text-[0.58rem] uppercase tracking-[0.28em] text-sl-ember">
              Sunday <span className="text-sl-cream">Live.</span>
            </div>
            <div className="truncate text-sm font-semibold text-sl-cream sm:text-base">{meta.name}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-sl-edge bg-white/[0.02] px-2 py-1">
            {liveQuality === 'live' && <span className="sl-pip" aria-hidden />}
            <span className="sl-ff-mono text-[0.56rem] uppercase tracking-[0.22em] text-sl-cream">
              {QUALITY_LABEL[liveQuality]}
            </span>
          </span>
        </div>
      </div>
    </header>
  )
}
