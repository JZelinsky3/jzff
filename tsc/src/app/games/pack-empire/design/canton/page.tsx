import { readFileSync } from 'fs'
import path from 'path'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { playerById } from '@/lib/packEmpire/pool'
import type { Player } from '@/lib/packEmpire/rules'
import { peFonts } from '../../fonts'
import { CantonPhotos, type Look } from './CantonPhotos'
import './canton-photos.css'

// Canton photo ideas, for Joey to look at. Dev only, like the card lab: it 404s in
// production. Real Canton cards with each treatment baked onto the man's real photo
// (img/, made off his NFL headshot), so it's judged as it would really look.

export const metadata: Metadata = { title: 'Canton Photos', robots: { index: false, follow: false } }

const IDS = ['rb-marshall-faulk-2000', 'qb-patrick-mahomes-2018-canton', 'wr-cooper-kupp-2021', 'te-travis-kelce-2020']

function baked(id: string, look: string): string {
  const file = path.join(process.cwd(), 'src/app/games/pack-empire/design/canton/img', `${id}-${look}.webp`)
  return `data:image/webp;base64,${readFileSync(file).toString('base64')}`
}

export default function CantonPhotosPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const men = IDS.map((id) => {
    const player = playerById(id) as Player
    const looks: Look[] = [
      { key: 'today', label: 'Today', note: 'The headshot as it is.', img: null },
      { key: 'bronze', label: 'Bronze Bust', note: 'His photo cast in gold-bronze, like the busts in Canton, with a rim of gold light.', img: baked(id, 'bronze') },
      { key: 'break', label: 'Bust + Breaks The Frame', note: 'The same bust, standing taller, his head rising over the top bar.', img: baked(id, 'bronze'), breaks: true },
      { key: 'engraved', label: 'Gold Engraving', note: 'Fine engraved lines in gold ink, like a commemorative coin or stamp.', img: baked(id, 'engraved') },
      { key: 'relief', label: 'Gold Relief', note: 'Sculpted out of the gold itself: he rises off the plate like a medallion or a Hall of Fame plaque, lit as raised metal, with the plate shaded round him.', img: baked(id, 'relief') },
    ]
    return { player, looks }
  })
  return (
    <main className={`pe-theme ${peFonts}`}>
      <CantonPhotos men={men} />
    </main>
  )
}
