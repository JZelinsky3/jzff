// Sunday Live network layout.
//
// Owns the broadcast frame: loads the Vintage Booth stylesheet, the serif
// display font (scoped to this route only via the CSS variable on .sl-root),
// and wraps every sunday-live/** route in .sl-root so the theme never leaks
// into the newspaper site. DM Serif Display is the same family the Chronicle
// uses, deliberately: the booth is a broadcast wing of the paper.

import type { Metadata } from 'next'
import { Archivo, DM_Serif_Display } from 'next/font/google'
import { loadSlMeta } from '@/lib/sundayLive/access'
import '@/styles/sunday-live.css'

const display = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-sl-display',
  display: 'swap',
})

// Scoreboard numerals: a squared broadcast grotesque with tabular figures.
const numerals = Archivo({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-sl-num',
  display: 'swap',
})

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params
  const meta = await loadSlMeta(slug)
  const name = meta?.name ?? 'The Sunday Chronicle'
  return {
    title: `Sunday Live · ${name}`,
    description: `The live game-day broadcast for ${name}: every matchup, storylines, top performers, and the bottom ticker on one screen.`,
    openGraph: {
      title: `Sunday Live · ${name}`,
      description: `The live game-day broadcast for ${name}.`,
      type: 'website',
    },
  }
}

export default function SundayLiveLayout({ children }: { children: React.ReactNode }) {
  return <div className={`sl-root ${display.variable} ${numerals.variable}`}>{children}</div>
}
