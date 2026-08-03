// /games/roulette/board?pool=<id>&kind=best|career
//
// Roster Roulette's leaderboard. Reached from the recap's one-line "4th of
// 812" and from the game's own header; a pool is required, because a board
// with no league behind it is not a board.

import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { GameBoardPage } from '../../GameBoardPage'
import { ROSTER_ROULETTE } from '../../gameDefs'
import type { BoardKind } from '@/lib/minigames/leaderboard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'The Board · Roster Roulette',
  description: 'Every run anyone has put up on this wheel, best first.',
  // A leaderboard changes every time somebody plays, so it is not a page
  // worth serving out of an index. The lobby is the stable content.
  robots: { index: false, follow: true },
}

export default async function RouletteBoard({
  searchParams,
}: {
  searchParams: Promise<{ pool?: string; kind?: string }>
}) {
  const sp = await searchParams
  const poolId = (sp.pool ?? '').trim().toLowerCase()

  // No pool means nobody has said whose board this is. The lobby is where
  // that gets chosen, so send them there rather than inventing one.
  if (!poolId) redirect(ROSTER_ROULETTE.href)

  const kind: BoardKind = sp.kind === 'career' ? 'career' : 'best'

  // GameBoardPage owns its own <main>, because the shell it hangs off it —
  // the phone's bar, the hamburger suppression — is part of the board.
  return (
    <GameBoardPage game="roulette" def={ROSTER_ROULETTE} poolId={poolId} mode={null} kind={kind} />
  )
}
