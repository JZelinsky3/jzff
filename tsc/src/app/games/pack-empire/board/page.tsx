// /games/pack-empire/board?kind=best|career
//
// One board for the whole site: everybody opens packs from the same pool, so
// there is no league to choose and any ?pool= on the way in (the board rail
// carries one across from other games) is ignored. One per difficulty, never
// merged: a blind 13,000 isn't an open 13,000.

import type { Metadata, Viewport } from 'next'
import { peMeta } from '@/lib/packEmpire/meta'
import type { BoardKind } from '@/lib/minigames/leaderboard'
import { DIFFICULTIES, DIFFICULTY_LOOK, isDifficulty } from '@/lib/packEmpire/rules'
import { GameBoardPage } from '../../GameBoardPage'
import { PACK_EMPIRE } from '../../gameDefs'
import { PeDock } from '../chrome'
import { peFonts } from '../fonts'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#141311',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = peMeta({
  title: 'The Board · Pack Empire',
  description: 'The best offenses anyone has opened, every pack re-dealt and checked.',
  card: { c: 'board' },
  alt: 'The Pack Empire board',
  robots: { index: false, follow: true },
})

export default async function PackEmpireBoard({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; diff?: string }>
}) {
  const sp = await searchParams
  const kind: BoardKind = sp.kind === 'career' ? 'career' : 'best'
  const diff = isDifficulty(sp.diff) ? sp.diff : 'open'
  const query = (d: typeof diff) => (d === 'open' ? '' : `diff=${d}`)

  return (
    <GameBoardPage
      game="pack-empire"
      def={PACK_EMPIRE}
      poolId="site"
      mode={DIFFICULTY_LOOK[diff].mode}
      kind={kind}
      themeClass={`pe-theme ${peFonts}`}
      play={`/games/pack-empire/play/${diff === 'open' ? '' : `?diff=${diff}`}`}
      tabQuery={query(diff)}
      modeTabs={DIFFICULTIES.map((d) => ({
        kind: d,
        label: DIFFICULTY_LOOK[d].label,
        href: `/games/pack-empire/board/?${[query(d), kind === 'career' ? 'kind=career' : ''].filter(Boolean).join('&')}`,
      }))}
      activeMode={diff}
      dock={(signedIn) => <PeDock signedIn={signedIn} />}
    />
  )
}
