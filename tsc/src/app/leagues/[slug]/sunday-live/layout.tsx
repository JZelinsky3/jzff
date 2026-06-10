// Sunday Live companion — thin layout.
// Loads the companion stylesheet (so every sunday-live/** route shares the
// design tokens + keyframes) and sets default metadata. The visible chrome
// (masthead) is supplied by <SlShell>, which the pages render — not this
// layout — so future deep routes can opt out of the broadcast frame.

import type { Metadata } from 'next'
import { loadSlMeta } from '@/lib/sundayLive/access'
import '@/styles/sunday-live.css'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params
  const meta = await loadSlMeta(slug)
  const name = meta?.name ?? 'The Sunday Chronicle'
  return {
    title: `Sunday Live · ${name}`,
    description: `Live Sunday companion for ${name} — every matchup, NFL games, news, and the wire on one broadcast.`,
    openGraph: {
      title: `Sunday Live · ${name}`,
      description: `The complete live Sunday companion for ${name}.`,
      type: 'website',
    },
  }
}

export default function SundayLiveLayout({ children }: { children: React.ReactNode }) {
  return children
}
