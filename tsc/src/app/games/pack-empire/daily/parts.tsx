// The Daily's shared pieces: a day's date as a reader wants it, and a top-five
// board with the lineups folded under each name.

import { DIFFICULTY_LOOK, SLOTS } from '@/lib/packEmpire/rules'
import type { DailyBoard, DailyRow } from '@/lib/packEmpire/daily'
import { Bonds, CaptainMark, LineupSheet } from '../cards'

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
}

/** "Friday, October 30th". */
export function longDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
  return `${weekday}, ${month} ${ordinal(d.getUTCDate())}`
}

/** "Oct 30". */
export function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function Row({ row }: { row: DailyRow }) {
  // Shown even while the lineup is hidden: nothing to copy, but it does get
  // you wondering whether everyone else knows something about tight ends.
  const pos = row.captain != null ? SLOTS[row.captain]?.pool : null
  const head = (
    <>
      <span className="pe-dtop-rank">{row.rank}</span>
      <span className="pe-dtop-name">
        {row.name}
        {row.you && <em>You</em>}
      </span>
      <span className="pe-dtop-cap" aria-label={pos ? `${pos} captain` : undefined}>
        {pos && (
          <>
            <CaptainMark inline />
            {pos}
          </>
        )}
      </span>
      <span className="pe-dtop-score">{row.score.toLocaleString()}</span>
    </>
  )
  if (!row.detail) return <div className="pe-dtop-row">{head}</div>
  return (
    <details className="pe-dtop-more">
      <summary className="pe-dtop-row">{head}</summary>
      <div className="pe-dtop-open">
        <LineupSheet name={row.name} lineup={row.detail.lineup} total={row.score} counted={row.detail.counted} captain={row.captain} />
        <div className="pe-kicker" style={{ marginTop: '0.9rem' }}>
          Chemistry
        </div>
        <Bonds chem={row.detail.chem} lineup={row.detail.lineup} />
      </div>
    </details>
  )
}

/** One version's top five, plus your own run if it missed the cut. */
export function DailyTop({ board, empty }: { board: DailyBoard; empty: string }) {
  const pinned = board.you && !board.rows.some((r) => r.you) ? board.you : null
  return (
    <div className="pe-dtop">
      <div className="pe-dtop-head">
        <span>{DIFFICULTY_LOOK[board.version].label}</span>
        <em>
          {board.entrants.toLocaleString()} {board.entrants === 1 ? 'lineup' : 'lineups'}
        </em>
      </div>
      {board.rows.length === 0 ? (
        <p className="pe-note pe-dtop-empty">{empty}</p>
      ) : (
        board.rows.map((r) => <Row key={`${r.rank}-${r.name}`} row={r} />)
      )}
      {pinned && (
        <>
          <div className="pe-dtop-gap" aria-hidden />
          <Row row={pinned} />
        </>
      )}
      {board.locked && board.rows.length > 0 && <p className="pe-note pe-dtop-empty">Finish this one to see their lineups.</p>}
    </div>
  )
}
