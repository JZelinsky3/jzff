// /games/multiverse/board?pool=<id>&kind=best|career
//
// The Multiverse Draft's leaderboard. Reached from the recap's one-line
// "4th of 812" and from the game's own lobby; a pool is required, because a
// board with no league behind it is not a board.
//
// Rows sort on one packed number: wins first, then win rate, then points a
// game (see rankScore in multiverse.ts). Win rate only separates runs that
// played a different number of games, which is exactly what the postseason
// produces — a 9-5 that lost its quarter-final is 9-6, and should not outrank
// a 9-5 that never got there on wins alone.

import { redirect } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import { GameBoardPage } from '../../GameBoardPage'
import { MULTIVERSE_DRAFT } from '../../gameDefs'
import type { BoardKind } from '@/lib/minigames/leaderboard'

export const dynamic = 'force-dynamic'

// Safari tints its toolbar from <meta name="theme-color">, and this game
// re-skins the whole page rather than a component inside it — a navy bar and
// a navy home indicator either side of a teal board is the same mismatch the
// Clubhouse fixed for its own dock. Same move here: the browser chrome takes
// the board's ink, so the screen reads as one piece top to bottom.
export const viewport: Viewport = {
  themeColor: '#061414',
  // Re-declared from the root layout on purpose — don't rely on viewport
  // merge semantics for the field that keeps phones on a real viewport.
  width: 'device-width',
  initialScale: 1,
}


export const metadata: Metadata = {
  title: 'The Board · The Multiverse Draft',
  description: 'Every season anyone has drafted out of this league, best record first.',
  // A leaderboard changes every time somebody plays, so it is not a page
  // worth serving out of an index. The lobby is the stable content.
  robots: { index: false, follow: true },
}

export default async function MultiverseBoard({
  searchParams,
}: {
  searchParams: Promise<{ pool?: string; kind?: string }>
}) {
  const sp = await searchParams
  const poolId = (sp.pool ?? '').trim().toLowerCase()

  if (!poolId) redirect(MULTIVERSE_DRAFT.href)

  const kind: BoardKind = sp.kind === 'career' ? 'career' : 'best'

  return (
    <GameBoardPage
      game="multiverse"
      def={MULTIVERSE_DRAFT}
      poolId={poolId}
      mode={null}
      kind={kind}
    />
  )
}
