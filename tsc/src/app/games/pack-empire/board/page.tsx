// /games/pack-empire/board?kind=best|career
//
// One board for the whole site: everybody opens packs from the same pool, so
// there is no league to choose and any ?pool= on the way in (the board rail
// carries one across from other games) is ignored.

import type { Metadata, Viewport } from 'next'
import type { BoardKind } from '@/lib/minigames/leaderboard'
import { GameBoardPage } from '../../GameBoardPage'
import { PACK_EMPIRE } from '../../gameDefs'
import { peFonts } from '../fonts'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#141311',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: 'The Board · Pack Empire',
  description: 'The best offenses anyone has opened, every pack re-dealt and checked.',
  robots: { index: false, follow: true },
}

export default async function PackEmpireBoard({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>
}) {
  const sp = await searchParams
  const kind: BoardKind = sp.kind === 'career' ? 'career' : 'best'

  return (
    <GameBoardPage
      game="pack-empire"
      def={PACK_EMPIRE}
      poolId="site"
      mode="offense"
      kind={kind}
      themeClass={`pe-theme ${peFonts}`}
      play="/games/pack-empire/play/"
    />
  )
}
