'use client'

import { useState } from 'react'
import type { Player } from '@/lib/packEmpire/rules'
import { PackCard } from '../../cards'
import { FacesProvider } from '../../faces'

export type Look = { key: string; label: string; note: string; img: string | null; breaks?: boolean }

export function CantonPhotos({ men }: { men: { player: Player; looks: Look[] }[] }) {
  const [at, setAt] = useState(0)
  const man = men[at]
  return (
    <div className="cxp">
      <h1 className="cxp-title">Canton Photos</h1>
      <p className="cxp-sub">Five ways a Canton card could wear its man. One player at a time, so the cards run live.</p>
      <div className="cxp-men" role="tablist">
        {men.map((m, i) => (
          <button key={m.player.id} type="button" role="tab" aria-selected={i === at} className={i === at ? 'on' : ''} onClick={() => setAt(i)}>
            {m.player.name} {m.player.year}
          </button>
        ))}
      </div>
      <div className="cxp-row">
        {man.looks.map((l) => (
          <figure key={l.key} className={`cxp-look${l.breaks ? ' cxp-break' : ''}`}>
            <FacesProvider faces={l.img ? { [man.player.id]: l.img } : {}}>
              <PackCard player={man.player} revealed />
            </FacesProvider>
            <figcaption>
              <b>{l.label}</b>
              <span>{l.note}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
