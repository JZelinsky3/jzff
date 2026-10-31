import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { playerById } from '@/lib/packEmpire/pool'
import type { Player } from '@/lib/packEmpire/rules'
import { peFonts } from '../../fonts'
import { CardLab, type LabCard } from './CardLab'
import './card-lab.css'

// Card design examples, for Joey to look at. Dev only: nothing here is the game,
// and it can't be reached in production even if it gets committed. Real cards and
// real photos, so a concept is judged on what it would really look like. Effects
// follow the game's perf rules: transform and opacity only.

export const metadata: Metadata = { title: 'Card Lab', robots: { index: false, follow: false } }
export const viewport: Viewport = { themeColor: '#0c0b0a', width: 'device-width', initialScale: 1 }

const CARDS: [LabCard['tier'], string][] = [
  ['common', 'wr-terrell-owens-2009'],
  ['rare', 'wr-brandon-marshall-2013'],
  ['dynasty', 'wr-steve-smith-2005'],
  ['transcendent', 'wr-josh-gordon-2013'],
  ['immortal', 'qb-patrick-mahomes-2018'],
  ['pantheon', 'qb-lamar-jackson-2019'],
]

export default function CardLabPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const cards = CARDS.map(([tier, id]) => ({ tier, player: playerById(id) as Player }))
  return (
    <main className={`pe-theme ${peFonts}`}>
      <CardLab cards={cards} />
    </main>
  )
}
