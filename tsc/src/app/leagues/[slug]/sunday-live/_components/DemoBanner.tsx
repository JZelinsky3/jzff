'use client'

// Demo-mode controls. Appears only when ?demoWeek= is on the URL.

import type { Demo } from '../_lib/useSundayLivePoll'

export function DemoBanner({
  demo,
  onBack,
  onFwd,
  onExit,
}: {
  demo: Demo
  onBack: () => void
  onFwd: () => void
  onExit: () => void
}) {
  return (
    <div
      className="sl-ff-mono mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-sl-ember px-4 py-2.5 text-[0.6rem] uppercase tracking-[0.18em] text-sl-ember"
      style={{ background: 'linear-gradient(90deg, rgba(212, 168, 73, 0.12), rgba(212, 168, 73, 0.03))' }}
    >
      <span>
        ★ Demo · Wk{' '}
        <strong className="sl-ff-serif text-base italic normal-case text-sl-cream">{demo.week}</strong> ·{' '}
        <strong className="sl-ff-serif text-base italic normal-case text-sl-cream">{demo.year}</strong> · Progress{' '}
        <strong className="sl-ff-serif text-base italic normal-case text-sl-cream">{Math.round(demo.progress * 100)}%</strong>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <button type="button" onClick={onBack} className="rounded-sm border border-sl-ember px-2 py-1 transition-colors hover:bg-sl-ember hover:text-sl-ink">−10%</button>
        <button type="button" onClick={onFwd}  className="rounded-sm border border-sl-ember px-2 py-1 transition-colors hover:bg-sl-ember hover:text-sl-ink">+10%</button>
        <button type="button" onClick={onExit} className="rounded-sm border border-sl-ember px-2 py-1 transition-colors hover:bg-sl-ember hover:text-sl-ink">Exit</button>
      </span>
    </div>
  )
}
