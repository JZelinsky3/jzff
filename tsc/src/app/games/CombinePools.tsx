'use client'

// Builds a combined wheel out of two or more of the viewer's leagues.
//
// The pool param takes a comma-separated slug list, so this control is only
// ever assembling a URL — there is no state to keep and nothing to submit.
// It lives on the Games Page rather than on the play page for the same
// reason the league chips do: choosing who is in the drum is a decision you
// make before you start, not one to fiddle with mid-spin.

import { useState } from 'react'
import Link from 'next/link'
import type { GamePool } from './pools'
import styles from './games.module.css'

export function CombinePools({ pools, max }: { pools: GamePool[]; max: number }) {
  const [picked, setPicked] = useState<string[]>([])

  const toggle = (id: string) => {
    setPicked((prev) =>
      prev.includes(id)
        ? prev.filter((p) => p !== id)
        : prev.length >= max
          ? prev
          : [...prev, id]
    )
  }

  const ready = picked.length >= 2
  // Sorted so the same mixture is always the same link, which is what makes
  // it one cache entry and one seed space on the server.
  const href = `/games/roulette/?pool=${encodeURIComponent([...picked].sort().join(','))}`
  const full = picked.length >= max

  return (
    <div className={styles.combine}>
      <div className={styles.combineHead}>
        <span className={styles.combineTitle}>Combine leagues</span>
        <span className={styles.combineHint}>
          {full
            ? `${max} is the limit`
            : ready
              ? `${picked.length} in the drum`
              : 'Pick two or more'}
        </span>
      </div>

      <p className={styles.combineBody}>
        One wheel dealt from every season of every league you tick. Spins land
        on their managers and yours in the same run.
      </p>

      <div className={styles.combineChips}>
        {pools.map((p) => {
          const on = picked.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              aria-pressed={on}
              // A league you can't add yet still reads as available rather
              // than broken; it just doesn't respond until you drop one.
              className={on ? styles.combineChipOn : styles.combineChip}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {ready ? (
        <Link href={href} className={styles.combineGo}>
          Play {picked.length} leagues
        </Link>
      ) : (
        <span className={styles.combineGoOff}>Play combined</span>
      )}
    </div>
  )
}
