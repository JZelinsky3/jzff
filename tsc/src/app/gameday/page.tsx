import type { Metadata, Viewport } from 'next'
import { GamedayLanding } from './GamedayLanding'

// Demo landing concept ("The Drive") for side-by-side comparison with the
// live homepage at /. Not linked from anywhere and kept out of search.
export const metadata: Metadata = {
  title: 'The Sunday Chronicle · Gameday',
  description:
    'Twelve seasons of bad beats, robberies, and dynasties. Finally written down. The Sunday Chronicle is the record book your fantasy league never kept.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function GamedayPage() {
  return <GamedayLanding />
}
