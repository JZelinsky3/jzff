// Which league to play on.
//
// Third design, and the last two are worth recording so they don't come back.
// It started as a rail of prose boxes, which on a page whose whole job is
// games read like a settings screen. It became small vertical playing cards
// with corner marks and a tilt — game-flavoured, but tiny, and speaking a
// visual language nothing else on the page spoke.
//
// It is now the SAME CARD the hub uses to pick a game: monogram plate on the
// left, name and stat line on the right, accent spine and hairline on hover.
// Two screens of one two-step flow should not be two different design
// languages, and the shape is already proven at exactly this width.
//
// The pick is made on the things that actually differ between two leagues —
// how much history is in there, and whose — so the stat line is completed
// seasons and the years they span, and the plate carries the monogram because
// that is what identifies a league at a glance.
//
// Shared by the desktop lobby and the phone's; only the grid changes.

import Link from 'next/link'
import type { GamePool } from './pools'
import s from './deck.module.css'

/** The house's own cards: the site-wide pool and the demo league. Same shape
    as a league card so the choice is one list, marked apart because they are
    not yours and shouldn't sit in the row that is. */
export type HousePool = {
  id: string
  label: string
  monogram: string
  note: string
  statTop: string
  statBottom: string
}

function Card({
  href,
  monogram,
  label,
  note,
  statTop,
  statBottom,
  house,
}: {
  href: string
  monogram: string
  label: string
  note: string
  statTop: string
  statBottom: string
  house?: boolean
}) {
  return (
    <Link href={href} className={house ? `${s.card} ${s.house}` : s.card}>
      <span className={s.plate}>
        <span className={s.plateText}>{monogram}</span>
      </span>

      <span className={s.body}>
        <span className={s.name}>{label}</span>
        <span className={s.note}>{note}</span>
        <span className={s.stats}>
          <span className={s.stat}>
            <span className={s.statNum}>{statTop}</span>
            <span className={s.statLabel}>{statBottom}</span>
          </span>
          <span className={s.deal}>Deal</span>
        </span>
      </span>
    </Link>
  )
}

export function LeagueDeck({
  pools,
  href,
}: {
  pools: GamePool[]
  /** Builds the play link for a pool id. */
  href: (id: string) => string
}) {
  return (
    <div className={s.deck}>
      {pools.map((p) => (
        <Card
          key={p.id}
          href={href(p.id)}
          monogram={p.monogram}
          label={p.label}
          note={p.note}
          statTop={p.seasons > 0 ? String(p.seasons) : '—'}
          statBottom={
            p.seasons === 0
              ? 'no finished seasons'
              : p.firstYear && p.lastYear && p.firstYear !== p.lastYear
                ? `seasons · ${p.firstYear}–${p.lastYear}`
                : `season · ${p.lastYear ?? ''}`
          }
        />
      ))}
    </div>
  )
}

export function HouseDeck({ pools, href }: { pools: HousePool[]; href: (id: string) => string }) {
  return (
    <div className={s.deck}>
      {pools.map((p) => (
        <Card
          key={p.id}
          href={href(p.id)}
          monogram={p.monogram}
          label={p.label}
          note={p.note}
          statTop={p.statTop}
          statBottom={p.statBottom}
          house
        />
      ))}
    </div>
  )
}
