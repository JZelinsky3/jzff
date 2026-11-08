'use client'

// The box score's Watch It: the game's snaps in the broadcast (GameCast). Only
// games played since the sim kept its snaps have them.

import { useState } from 'react'
import type { GamePlan } from '@/lib/packEmpire/seasonRules'
import type { Cast } from '@/lib/packEmpire/season'
import type { Drive } from '@/lib/packEmpire/seasonSim'
import { GameCast } from './GameCast'

export function ReplayLauncher(props: {
  drives: Drive[]
  cast: Cast
  team: string
  defense: string
  line: number | null
  opponent: string | null
  oppPoints: number | null
  plan: GamePlan
  clicked: boolean | null
}) {
  const [on, setOn] = useState(false)
  return (
    <>
      <button type="button" className="pe-act pe-act--sm" onClick={() => setOn(true)}>
        Watch It
      </button>
      {on && <GameCast {...props} onDone={() => setOn(false)} />}
    </>
  )
}
