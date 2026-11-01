// A run on a board: the top five on the front page and every row of the board.

import type { BestRow } from '@/lib/minigames/leaderboard'
import { RARITY_LOOK, type Player } from '@/lib/packEmpire/rules'
import { when } from '../BoardTable'
import { TierBadge } from './TierBadge'

export const runScore = (r: BestRow) => Number(r.display.accolades ?? r.score)

export function RunRow({
  row,
  led,
  face = false,
  dated = false,
  mine = false,
}: {
  row: BestRow
  led?: Player
  /** Holds a place for the face even on a run whose card no longer resolves. */
  face?: boolean
  dated?: boolean
  mine?: boolean
}) {
  return (
    <div
      className={`pe-top-row${face ? ' pe-top-row--card' : ''}${mine ? ' mine' : ''}`}
      style={led ? ({ '--rc': RARITY_LOOK[led.rarity].color } as React.CSSProperties) : undefined}
    >
      <span className="pe-top-rank">{row.rank}</span>
      {face && (
        <span className="pe-top-face" aria-hidden>
          {led?.img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={led.img} alt="" loading="lazy" />
          ) : (
            (row.name.trim()[0] ?? '?').toUpperCase()
          )}
        </span>
      )}
      <span className="pe-top-who">
        <span className="pe-top-name">{row.name}</span>
        {led && (
          <span className="pe-top-led">
            Led by <b>{led.name}</b>
            {led.year ? ` ${led.year}` : ''}
          </span>
        )}
        {dated && <span className="pe-top-date">{when(row.at)}</span>}
      </span>
      <span className="pe-top-run">
        <span className="pe-top-score">{runScore(row).toLocaleString()}</span>
        <TierBadge score={row.score} />
      </span>
    </div>
  )
}

export function BoardTop({ rows, leaders }: { rows: BestRow[]; leaders?: Map<string, Player> }) {
  if (rows.length === 0) {
    return <p className="pe-empty">Nothing on the board yet. The first finished run takes the top spot.</p>
  }
  return (
    <div className="pe-top">
      {rows.map((r) => (
        <RunRow key={r.runId} row={r} led={leaders?.get(r.runId)} face={!!leaders} />
      ))}
    </div>
  )
}
