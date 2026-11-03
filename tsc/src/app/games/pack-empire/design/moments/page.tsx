import { readFileSync } from 'fs'
import path from 'path'
import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { peFonts } from '../../fonts'
import { MomentLab, type Moment } from './MomentLab'
import '../cards/card-lab.css'
import './moment-lab.css'

// Game + streak card designs, for Joey to look at. Dev only, like the card lab: it
// 404s in production and nothing here is in the game. The cards are real
// candidates off scripts/pack-empire-pool/moments (python3 moments/moments.py),
// mostly men who have no season card yet: new faces are the point.

export const metadata: Metadata = { title: 'Moments Lab', robots: { index: false, follow: false } }
export const viewport: Viewport = { themeColor: '#0c0b0a', width: 'device-width', initialScale: 1 }

/** One of each tier per kind, then a spread from the first draft. */
const GAMES = ['g-te-tucker-kraft-2025-w08', 'g-wr-gabe-davis-2021-w20', 'g-rb-doug-martin-2012-w09']
const STREAKS = ['s-wr-doug-baldwin-2015-w12', 's-rb-larry-johnson-2005-w14', 's-qb-justin-fields-2022-w07']
const MORE = [
  'g-qb-colin-kaepernick-2012-w19',
  'g-rb-clinton-portis-2003-w14',
  'g-wr-will-fuller-2019-w05',
  'g-rb-jahvid-best-2010-w02',
  's-rb-devonta-freeman-2015-w03',
  's-wr-dwayne-bowe-2010-w09',
  'g-qb-nick-foles-2013-w09',
  's-te-kyle-pitts-2025-w13',
]

export default function MomentLabPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const file = path.join(process.cwd(), 'scripts/pack-empire-pool/moments/candidates.json')
  const all: { games: Moment[]; streaks: Moment[] } = JSON.parse(readFileSync(file, 'utf8'))
  const byId = new Map([...all.games, ...all.streaks].map((c) => [c.id, c]))
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((c): c is Moment => !!c)
  return (
    <main className={`pe-theme ${peFonts}`}>
      <MomentLab games={pick(GAMES)} streaks={pick(STREAKS)} more={pick(MORE)} />
    </main>
  )
}
