'use client'

// The (i) on a pack: exactly what's in it, off the same table that deals it.

import { useState } from 'react'
import { packOddsOf, type PackDef } from '@/lib/packEmpire/locker/rules'
import { RARITIES, RARITY_LOOK } from '@/lib/packEmpire/rules'

const pct = (n: number) => (n === 0 ? '-' : n >= 10 ? `${n.toFixed(0)}%` : n >= 1 ? `${n.toFixed(1)}%` : `${n.toFixed(2)}%`)

export function PackOdds({ pack }: { pack: PackDef }) {
  const [open, setOpen] = useState(false)
  const odds = packOddsOf(pack)
  if (!odds) return null
  return (
    <>
      <button type="button" className="pe-odds-i" onClick={() => setOpen(true)} aria-label={`Odds for ${pack.label}`}>
        i
      </button>
      {open && (
        <div className="pe-odds" role="dialog" aria-modal="true" aria-label={`Odds for ${pack.label}`} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="pe-odds-in">
            <div className="pe-kicker">★ The Odds ★</div>
            <h2>{pack.label}</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">Rarity</th>
                  <th scope="col">First {pack.size - 1} Cards</th>
                  {odds.last && <th scope="col">Last Card</th>}
                </tr>
              </thead>
              <tbody>
                {[...RARITIES].reverse().map((r) => (
                  <tr key={r}>
                    <th scope="row" style={{ color: RARITY_LOOK[r].color }}>
                      {RARITY_LOOK[r].label}
                    </th>
                    <td>{pct(odds.table[r])}</td>
                    {odds.last && <td>{pct(odds.last[r])}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <p>Per card. {pack.match ? 'If a division has no card at a rarity, that card drops one rarity. ' : ''}A card you already own is half as likely as one you do not, inside its rarity.</p>
            <button type="button" className="pe-btn pe-btn--sm" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
