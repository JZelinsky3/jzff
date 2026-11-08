'use client'

// The line under an open Season pack: your starters, position by position, so a
// card can be held up against who it would replace.

import { surname, type Player } from '@/lib/packEmpire/rules'
import { startersByPos } from './compare'

export function TeamPeek({ lineup }: { lineup: (Player | null)[] }) {
  return (
    <div className="pe-sn-peek" aria-label="Your starters">
      <b>Your starters</b>
      {startersByPos(lineup).map((g) => (
        <span key={g.pos}>
          <i>{g.pos}</i>
          {g.men.length ? g.men.map((m) => `${surname(m.name)} ${m.score.toLocaleString()}`).join(' · ') : 'none yet'}
        </span>
      ))}
    </div>
  )
}
