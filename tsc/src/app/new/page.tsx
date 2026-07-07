import type { Metadata, Viewport } from 'next'
import { NewLanding } from './NewLanding'

// Broadsheet-front-page landing candidate, for side-by-side comparison with
// the live homepage at / (and the /gameday concept). Kept out of search.
export const metadata: Metadata = {
  title: 'The Sunday Chronicle · The record book for your fantasy league',
  description:
    'The Sunday Chronicle connects to Sleeper, ESPN, Yahoo, or NFL.com and turns every season your league has played into a living almanac: records, rivalries, drafts, and live Sundays.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function NewLandingPage() {
  return <NewLanding />
}
