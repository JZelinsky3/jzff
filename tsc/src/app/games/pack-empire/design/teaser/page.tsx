import { readdirSync } from 'node:fs'
import path from 'node:path'
import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { maskCard } from '@/lib/packEmpire/deal'
import { POOL, cardWeight, playerById } from '@/lib/packEmpire/pool'
import { PACK_ART, RARITIES, SOLO_WEIGHTS, WILD_PACK_ART, chemistryFor, packOdds, type Player, type Rarity } from '@/lib/packEmpire/rules'
import { peFonts } from '../../fonts'
import { Teaser, type TeaserData } from './Teaser'
import './teaser.css'

// A teaser for Pack Empire, made to be screen-recorded and posted elsewhere: it
// plays itself, a beat per idea (captain, the rip, keep one, chemistry, Battles,
// the modes, the climb), built from the game's own components so it looks like
// the game because it is. Dev only, like the other labs: it 404s in production.
//
// ?ar=916 for a vertical (Reels, TikTok, Shorts) frame instead of 16:9. On a
// phone it fills the screen's width, so it can be screen-recorded there too.
//
// The dev server stutters now and then, which shows in a recording. For a clean
// take, run a local production build with PE_TEASER=1, which nothing on Vercel
// sets, at build and at start:
//   PE_TEASER=1 npx next build && PE_TEASER=1 npx next start -p 3100

export const metadata: Metadata = { title: 'Pack Empire Teaser', robots: { index: false, follow: false } }
/** The vertical frame is 540 wide; a phone told the page is that wide scales it
    to fill the screen, so the reel can be recorded on the phone itself. The
    scale is cleared, not left out: Next fills in 1, which shows it at full size. */
export async function generateViewport({ searchParams }: { searchParams: Promise<{ ar?: string }> }): Promise<Viewport> {
  const sp = await searchParams
  return sp.ar === '916'
    ? { themeColor: '#000000', width: 540, initialScale: undefined }
    : { themeColor: '#000000', width: 'device-width', initialScale: 1 }
}

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
  // A year off the rest, so one bond is Same Franchise rather than Real Teammates.
  'wr-rashee-rice-2023',
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

/** Ball Knower's three, a different rarity each: Dynasty, Canton, Immortal. */
const KNOWER = ['rb-bijan-robinson-2025', 'te-rob-gronkowski-2011', 'rb-christian-mccaffrey-2019']

/** The binder beat's page: six men, four seasons each, with how many times each
    card's been kept (0 is still face down). The two that file in are first, so
    the vertical frame, which only has room for two, shows them. */
const BINDER: [string, number][][] = [
  [['te-travis-kelce-2020', 0], ['te-travis-kelce-2022-immortal', 1], ['te-travis-kelce-2021', 0], ['te-travis-kelce-2024', 2]],
  [['rb-christian-mccaffrey-2019-canton', 0], ['rb-christian-mccaffrey-2025', 0], ['rb-christian-mccaffrey-2023', 1], ['rb-christian-mccaffrey-2017', 5]],
  [['qb-lamar-jackson-2019', 0], ['qb-lamar-jackson-2024', 0], ['qb-lamar-jackson-2022', 2], ['qb-lamar-jackson-2025', 4]],
  [['wr-tyreek-hill-2023-immortal', 1], ['wr-tyreek-hill-2020', 0], ['wr-tyreek-hill-2021', 2], ['wr-tyreek-hill-2016', 3]],
  [['qb-josh-allen-2020', 0], ['qb-josh-allen-2022', 1], ['qb-josh-allen-2025', 1], ['qb-josh-allen-2018', 3]],
  [['wr-randy-moss-2007-canton', 0], ['wr-randy-moss-2003-immortal', 0], ['wr-randy-moss-1998', 1], ['wr-randy-moss-2004', 2]],
]

/** Filed as the beat plays: a Transcendent, then the Canton. */
const BINDER_NEW = ['rb-christian-mccaffrey-2025', 'te-travis-kelce-2020']

/** How much of each rarity the binder already holds, for its summary. */
const BINDER_HAVE: Record<Rarity, number> = { common: 0.58, rare: 0.37, dynasty: 0.2, transcendent: 0.08, immortal: 0.03, canton: 0 }

const WALL = [
  'qb-patrick-mahomes-2018', 'wr-cooper-kupp-2021', 'rb-christian-mccaffrey-2019', 'te-travis-kelce-2020',
  'wr-jamarr-chase-2024', 'qb-lamar-jackson-2019', 'wr-tyreek-hill-2023', 'qb-josh-allen-2022',
  'te-rob-gronkowski-2011', 'wr-puka-nacua-2025', 'wr-justin-jefferson-2022', 'rb-bijan-robinson-2025',
]

export default function TeaserPage({ searchParams }: { searchParams: Promise<{ ar?: string }> }) {
  if (process.env.NODE_ENV === 'production' && !process.env.PE_TEASER) notFound()
  return <TeaserRoute searchParams={searchParams} />
}

async function TeaserRoute({ searchParams }: { searchParams: Promise<{ ar?: string }> }) {
  const sp = await searchParams
  const lineup = LINEUP.map(card)
  const chem = chemistryFor(lineup, true)
  // The QB pack's real odds per card, as the hub prints them, ordinary and captain.
  // Canton is held level on the captain table, so it isn't in the list.
  const normal = packOdds(POOL.QB, (p) => cardWeight(p, SOLO_WEIGHTS.normal))
  const captain = packOdds(POOL.QB, (p) => cardWeight(p, SOLO_WEIGHTS.captain))
  const fx = path.join(process.cwd(), 'public/games/pack-empire/fx')
  // The set as it really is, every card in the packs by rarity.
  const set = Object.values(POOL).flat()
  const rarities = RARITIES.map((rarity) => {
    const of = set.filter((p) => p.rarity === rarity).length
    return { rarity, of, owned: Math.round(of * BINDER_HAVE[rarity]) }
  })
  const data: TeaserData = {
    lineup,
    chem,
    // A great run, not the stacked chemistry lineup's 46,000: 25,000 is elite
    // and past 30,000 almost never happens.
    total: 25140,
    rip: RIP.map(card),
    vsA: card('wr-justin-jefferson-2022'),
    vsB: card('wr-jamarr-chase-2024'),
    knower: KNOWER.map((id) => ({ blind: maskCard(card(id), 'season'), real: card(id) })),
    wall: WALL.map(card),
    packs: { captain: PACK_ART.QB, wild: WILD_PACK_ART, rb: PACK_ART.RB, wr: PACK_ART.WR, te: PACK_ART.TE },
    odds: (['dynasty', 'transcendent', 'immortal'] as const).map((rarity) => ({ rarity, normal: normal[rarity], captain: captain[rarity] })),
    binder: {
      men: BINDER.map((row) => row.map(([id, pulls]) => ({ card: card(id), pulls }))),
      fresh: BINDER_NEW,
      rarities,
    },
    // The card effects' textures, which the CSS only asks for once a card is drawn.
    preload: readdirSync(fx)
      .filter((f) => f.endsWith('.webp'))
      .map((f) => `/games/pack-empire/fx/${f}`),
  }
  return (
    <main className={`pe-theme ${peFonts} pe-tz-page`}>
      <Teaser data={data} vertical={sp.ar === '916'} />
    </main>
  )
}
