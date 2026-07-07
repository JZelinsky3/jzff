'use client'

// The full leaders board. Both scoreboards ride the full desk width on top
// (NFL games, then the league's own), and the boards sit centered beneath.

import { NflStrip } from '../desk/NflStrip'
import { FantasyStrip } from '../desk/FantasyStrip'
import { Boards } from '../desk/Boards'

export function LeadersPage() {
  return (
    <div className="space-y-3 pt-3">
      <div className="mx-auto max-w-[1840px] space-y-3 px-4">
        <NflStrip />
        <FantasyStrip />
      </div>
      <div className="mx-auto max-w-[1100px] space-y-3 px-4">
        <h1 className="sl-display text-2xl text-sl-text">The Leaders Board</h1>
        <div className="h-[calc(100vh-23rem)] min-h-[420px]">
          <Boards />
        </div>
      </div>
    </div>
  )
}
