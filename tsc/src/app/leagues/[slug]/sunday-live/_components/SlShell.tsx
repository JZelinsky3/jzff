// Page chrome — every Sunday Live page renders inside this.
// Server component; the live board (HubBoard) is the only client surface.

import { SlMasthead } from './SlMasthead'
import type { SlMeta } from '@/lib/sundayLive/access'

export function SlShell({
  meta,
  liveQuality,
  children,
  wide = true,
}: {
  meta: SlMeta
  liveQuality?: 'live' | 'best' | 'stale'
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="sl-root">
      <SlMasthead meta={meta} liveQuality={liveQuality} />
      <main
        className={`relative z-[1] mx-auto px-3 pb-40 pt-4 sm:px-6 ${wide ? 'max-w-[1500px]' : 'max-w-5xl'}`}
      >
        {children}
      </main>
    </div>
  )
}
