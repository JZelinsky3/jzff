// UDFA lock screen (server component). Free-tier leagues see the pitch, not
// the broadcast; the route never does platform work for locked viewers.

import Link from 'next/link'
import type { SlMeta } from '@/lib/sundayLive/access'

export function LockedGate({ meta }: { meta: SlMeta }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <p className="sl-kicker mb-2">SUNDAY LIVE</p>
      <h1 className="sl-display mb-3 text-4xl text-sl-text">
        THE {meta.name.toUpperCase()} BROADCAST IS A MEMBER FEATURE
      </h1>
      <p className="mb-8 max-w-md text-sm text-sl-mute">
        Live scores, win probability, storylines, and the bottom ticker for every
        Sunday of the season. Upgrade the league to switch the network on.
      </p>
      <div className="flex items-center gap-3">
        <Link
          href="/pricing/"
          className="sl-display rounded border border-sl-electric bg-sl-electric/15 px-4 py-2 text-sm text-sl-text transition-colors hover:bg-sl-electric/30"
        >
          See plans
        </Link>
        <Link
          href={`/leagues/${meta.slug}/`}
          className="sl-display rounded border border-sl-line px-4 py-2 text-sm text-sl-mute transition-colors hover:text-sl-text"
        >
          Back to the almanac
        </Link>
      </div>
    </div>
  )
}
