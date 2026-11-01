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
  ['canton', 'qb-lamar-jackson-2019'],
]

/** A real QB pack for the full pull. Canton sits fourth, so a few cards flip first. */
const PACK: [LabCard['tier'], string][] = [
  ['common', 'qb-drew-brees-2017'],
  ['rare', 'qb-russell-wilson-2019'],
  ['common', 'qb-gardner-minshew-2019'],
  ['canton', 'qb-lamar-jackson-2019'],
  ['dynasty', 'qb-justin-herbert-2021'],
]

const dealt = (list: [LabCard['tier'], string][]) => list.map(([tier, id]) => ({ tier, player: playerById(id) as Player }))

/** How a Canton reads in the binder. Example numbers: each card keeps its own count. */
const BINDER: [string, [number, number]][] = [
  ['qb-lamar-jackson-2019', [5, 6]],
  ['rb-marshall-faulk-2000', [1, 2]],
  ['te-travis-kelce-2020', [3, 11]],
]

export default function CardLabPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <main className={`pe-theme ${peFonts}`}>
      <CardLab cards={dealt(CARDS)} pack={dealt(PACK)} binder={BINDER.map(([id, serial]) => ({ tier: 'canton', player: playerById(id) as Player, serial }))} />
    </main>
  )
}
