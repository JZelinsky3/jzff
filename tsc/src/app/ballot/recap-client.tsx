'use client'

import { useEffect, useState } from 'react'
import { BoardCard, ManagerCard } from './recap-card'
import type { ManagerRecap } from '@/lib/winBallot'

const anchor = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/**
 * The recap, one card at a time.
 *
 * Twelve cards stacked is a scroll nobody finishes, so the page works the way
 * the room does: pick a name, read that card. The board is the other view,
 * and its rows are the other way in.
 *
 * The name rides in the hash, so a card can still be linked to on its own
 * (/ballot/<token>/recap#charlie) without the page being a list.
 */
export function RecapClient({
  recaps, ballotCount,
}: {
  recaps: ManagerRecap[]
  ballotCount: number
}) {
  const [mode, setMode] = useState<'one' | 'all'>('one')
  const [who, setWho] = useState(recaps[0]?.manager.name ?? '')

  // The hash is read after mount rather than on the server, which never sees
  // it. A hash that names nobody just leaves the top of the board selected.
  useEffect(() => {
    const fromHash = () => {
      const tag = window.location.hash.slice(1)
      const hit = recaps.find((r) => anchor(r.manager.name) === tag)
      if (hit) { setWho(hit.manager.name); setMode('one') }
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [recaps])

  function pick(name: string) {
    setWho(name)
    setMode('one')
    // replaceState rather than a hash assignment: the address updates so the
    // card stays linkable, without stacking twelve entries in the back button.
    window.history.replaceState(null, '', `#${anchor(name)}`)
  }

  // The board is untouched: its rows are still plain anchors, and the hash
  // listener above turns a click into the one card it names.

  const recap = recaps.find((r) => r.manager.name === who) ?? recaps[0]
  if (!recap) return null

  return (
    <>
      <div className="mr-modes">
        <button
          type="button"
          className={`mr-mode${mode === 'one' ? ' is-on' : ''}`}
          onClick={() => setMode('one')}
        >
          One manager
        </button>
        <button
          type="button"
          className={`mr-mode${mode === 'all' ? ' is-on' : ''}`}
          onClick={() => setMode('all')}
        >
          The board
        </button>
      </div>

      {mode === 'all' ? (
        <BoardCard recaps={recaps} ballotCount={ballotCount} href={(n) => `#${anchor(n)}`} />
      ) : (
        <>
          <div className="mr-picker">
            {recaps.map((r) => (
              <button
                key={r.manager.name}
                type="button"
                className={`mr-pick${r.manager.name === who ? ' is-on' : ''}`}
                onClick={() => pick(r.manager.name)}
              >
                {r.manager.name}
              </button>
            ))}
          </div>
          <ManagerCard recap={recap} />
        </>
      )}
    </>
  )
}
