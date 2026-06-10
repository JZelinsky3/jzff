// Paywall screen for UDFA leagues. Same shell, just no broadcast inside.

import Link from 'next/link'
import { SlShell } from './SlShell'
import type { SlMeta } from '@/lib/sundayLive/access'

export function SlLocked({ meta }: { meta: SlMeta }) {
  return (
    <SlShell meta={meta} wide={false}>
      <div className="sl-card mx-auto mt-12 max-w-xl px-8 py-12 text-center">
        <div className="sl-ff-mono mb-3 text-[0.6rem] uppercase tracking-[0.28em] text-sl-ember">
          ★ Paid Feature
        </div>
        <h1 className="sl-ff-serif mb-4 text-4xl italic leading-tight text-sl-cream">
          Sunday <em className="not-italic text-sl-signal">Live.</em>
        </h1>
        <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-sl-mute">
          Every matchup, live win probability, the wire, and a story-of-the-day moments reel —
          the page your league pins open from kickoff to the late window.
        </p>
        <Link
          href="/pricing"
          className="sl-ff-mono inline-block rounded-sm border border-sl-ember px-5 py-2.5 text-[0.65rem] uppercase tracking-[0.22em] text-sl-ember transition-colors hover:bg-sl-ember hover:text-sl-ink"
        >
          See plans →
        </Link>
      </div>
    </SlShell>
  )
}
