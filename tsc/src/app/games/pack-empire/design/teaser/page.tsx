import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { maskCard } from '@/lib/packEmpire/deal'
import { playerById } from '@/lib/packEmpire/pool'
import { PACK_ART, WILD_PACK_ART, chemistryFor, type Player } from '@/lib/packEmpire/rules'
import { peFonts } from '../../fonts'
import { Teaser, type TeaserData } from './Teaser'
import './teaser.css'

// A teaser for Pack Empire, made to be screen-recorded and posted elsewhere: it
// plays itself, a beat per idea (captain, the rip, keep one, chemistry, Battles,
// the modes, the climb), built from the game's own components so it looks like
// the game because it is. Dev only, like the other labs: it 404s in production.
//
// ?ar=916 for a vertical (Reels, TikTok, Shorts) frame instead of 16:9.

export const metadata: Metadata = { title: 'Pack Empire Teaser', robots: { index: false, follow: false } }
export const viewport: Viewport = { themeColor: '#000000', width: 'device-width', initialScale: 1 }

const card = (id: string) => {
  const p = playerById(id)
  if (!p) throw new Error(`No card ${id}`)
  return p as Player
}

/** The eleven the chemistry beat builds: a Chiefs core, so the bonds light up. */
const LINEUP = [
  'qb-patrick-mahomes-2022-immortal',
  'rb-christian-mccaffrey-2019-canton',
  'wr-tyreek-hill-2023-immortal',
  'wr-juju-smith-schuster-2022',
  'wr-randy-moss-2007-canton',
  'te-travis-kelce-2022-immortal',
  'ot-orlando-brown-2022',
  'og-joe-thuney-2022',
  'c-creed-humphrey-2022',
  'og-john-hannah-1976',
  'ot-trent-williams-2023-immortal',
]

/** Five out of the captain pack, the immortal in the middle. */
const RIP = ['qb-josh-allen-2022', 'qb-lamar-jackson-2019', 'qb-patrick-mahomes-2018', 'qb-tom-brady-2007', 'qb-aaron-rodgers-2020']

const WALL = [
  'qb-patrick-mahomes-2018', 'wr-cooper-kupp-2021', 'rb-christian-mccaffrey-2019', 'te-travis-kelce-2020',
  'wr-jamarr-chase-2024', 'qb-lamar-jackson-2019', 'wr-tyreek-hill-2023', 'qb-josh-allen-2022',
  'te-rob-gronkowski-2011', 'wr-puka-nacua-2025', 'wr-justin-jefferson-2022', 'rb-bijan-robinson-2025',
]

export default function TeaserPage({ searchParams }: { searchParams: Promise<{ ar?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  return <TeaserRoute searchParams={searchParams} />
}

async function TeaserRoute({ searchParams }: { searchParams: Promise<{ ar?: string }> }) {
  const sp = await searchParams
  const lineup = LINEUP.map(card)
  const chem = chemistryFor(lineup, true)
  const data: TeaserData = {
    lineup,
    chem,
    // A great run, not the stacked chemistry lineup's 46,000: 25,000 is elite
    // and past 30,000 almost never happens.
    total: 25140,
    rip: RIP.map(card),
    vsA: card('wr-justin-jefferson-2022'),
    vsB: card('wr-jamarr-chase-2024'),
    blind: maskCard(card('rb-christian-mccaffrey-2019'), 'season'),
    range: maskCard(card('te-travis-kelce-2020'), 'range'),
    wall: WALL.map(card),
    packs: { captain: PACK_ART.QB, wild: WILD_PACK_ART, rb: PACK_ART.RB, wr: PACK_ART.WR, te: PACK_ART.TE },
  }
  return (
    <main className={`pe-theme ${peFonts} pe-tz-page`}>
      <Teaser data={data} vertical={sp.ar === '916'} />
    </main>
  )
}
