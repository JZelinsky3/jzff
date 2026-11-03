'use client'

// Two packs that are always in the commissioner's binder: one holds a Canton, one an
// Immortal, so a change to the pull, the walkouts or the cards can be seen on the real
// stage at any time. Dealt here from what the page sends, a fresh pack every open,
// and nothing is filed: no binder, no serial, no board.

import { useState } from 'react'
import { PACK_ART, SLOTS, type Player, type PoolKey } from '@/lib/packEmpire/rules'
import { PackStage, usePackStage } from '../../stage'

export type TestDeck = { top: Record<'canton' | 'immortal', Player[]>; fill: Record<PoolKey, Player[]> }

type Kind = 'canton' | 'immortal'

const LABEL: Record<Kind, string> = { canton: 'Canton Pack', immortal: 'Immortal Pack' }

function any<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

/** The big card, then four others at its position from other men, in a random order. */
function dealTest(deck: TestDeck, kind: Kind): { cards: Player[]; pool: PoolKey } {
  const star = any(deck.top[kind])
  const pool = star.pos as PoolKey
  const men = new Set([star.pid])
  const rest: Player[] = []
  for (const c of [...deck.fill[pool]].sort(() => Math.random() - 0.5)) {
    if (rest.length === 4) break
    if (men.has(c.pid)) continue
    men.add(c.pid)
    rest.push(c)
  }
  const cards = [...rest]
  cards.splice(Math.floor(Math.random() * (cards.length + 1)), 0, star)
  return { cards, pool }
}

export function TestPacks({ deck }: { deck: TestDeck }) {
  const { stage, open, tear, rip, reveal, revealAll, skip, dismiss } = usePackStage()
  const [opening, setOpening] = useState<{ kind: Kind; pool: PoolKey } | null>(null)

  const start = (kind: Kind) => {
    const { cards, pool } = dealTest(deck, kind)
    setOpening({ kind, pool })
    const slot = Math.max(0, SLOTS.findIndex((s) => s.pool === pool))
    open(slot, async () => cards)
  }

  const done = () => {
    dismiss()
    setOpening(null)
  }

  return (
    <div className="pe-bd-test">
      <span className="pe-bd-test-label">Test packs</span>
      {(['canton', 'immortal'] as Kind[]).map((k) => (
        <button key={k} type="button" className="pe-act" onClick={() => start(k)} disabled={!deck.top[k].length}>
          {LABEL[k]}
        </button>
      ))}
      {stage && opening && (
        <PackStage
          stage={stage}
          onCard={reveal}
          onRevealAll={revealAll}
          onDismiss={done}
          onTear={tear}
          onRip={rip}
          onSkip={skip}
          own={{ art: PACK_ART[opening.pool], first: 'Test', rest: LABEL[opening.kind], done: 'Close', onDone: done }}
        />
      )}
    </div>
  )
}
