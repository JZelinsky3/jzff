'use client'

// Your games in a mode's lobby, in three piles, because they're three
// different questions. Waiting On You goes at the top of the page: a challenge
// sent to you, or a game where the next move is yours. In Progress is what's out
// there waiting on someone else. Finished is the record.
//
// A finished game reads as a win or a loss at a glance: its Final and your own
// number go green or red, and the other side's number stays as it is. The list
// stops at SHOWN games and the older finals fold into a drawer, closed.
//
// Rows are shared by Versus and Mega Draft, and so is DeleteGame, which the
// rooms use too.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { GameRow } from './gameRows'

const SHOWN = 8

const WIN = '#68a878'
const LOSS = '#d2544a'
const TIE = '#8d8473'

function resultOf(r: GameRow): 'win' | 'loss' | 'tie' | null {
  if (!r.done || r.yours == null || r.theirs == null) return null
  return r.yours === r.theirs ? 'tie' : r.yours > r.theirs ? 'win' : 'loss'
}

/** Two taps, like removing a friend: the first asks, the second deletes. */
export function DeleteGame({
  api,
  id,
  seatKey = null,
  label = 'Delete',
  onGone,
}: {
  api: string
  id: string
  /** A signed-out host's seat key. */
  seatKey?: string | null
  label?: string
  onGone: () => void
}) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id, key: seatKey }),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Could not delete it.')
      onGone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete it.')
      setArmed(false)
      setBusy(false)
    }
  }

  if (error) return <span className="pe-del-err">{error}</span>

  if (!armed) {
    return (
      <button type="button" className="pe-del" onClick={() => setArmed(true)}>
        {label}
      </button>
    )
  }

  return (
    <span className="pe-del-ask">
      <span>Delete it for good?</span>
      <button type="button" className="pe-del on" disabled={busy} onClick={remove}>
        {busy ? 'Deleting' : 'Delete'}
      </button>
      <button type="button" className="pe-del" disabled={busy} onClick={() => setArmed(false)}>
        Keep
      </button>
    </span>
  )
}

function Row({ row, api, onGone }: { row: GameRow; api: string; onGone: () => void }) {
  const result = resultOf(row)
  const color = result === 'win' ? WIN : result === 'loss' ? LOSS : result === 'tie' ? TIE : row.status.color
  const both = row.yours != null && row.theirs != null
  // Nothing to print yet: on a game waiting on you, that's the call to play.
  const you = row.yours?.toLocaleString() ?? (row.onYou ? 'Play' : '·')
  const link = (
    <Link href={row.href} className="pe-row">
      <span style={{ minWidth: 0 }}>
        <span className="pe-row-name">vs {row.opponent}</span>
        <span className="pe-row-sub">
          <span className="pe-status" style={{ '--st': color } as React.CSSProperties}>
            {row.status.label}
          </span>
          {row.code ? ` · ${row.code}` : ''}
          {row.format ? ` · ${row.format}` : ''}
        </span>
      </span>
      <span className="pe-row-side">
        <span style={result && result !== 'tie' ? { color } : undefined}>{you}</span>
        {both ? ` · ${row.theirs!.toLocaleString()}` : ''}
      </span>
    </Link>
  )
  if (!row.canDelete) return link
  return (
    <div className="pe-row-item">
      {link}
      <div className="pe-row-tools">
        <DeleteGame api={api} id={row.id} onGone={onGone} />
      </div>
    </div>
  )
}

export function GameList({ rows: start, api }: { rows: GameRow[]; api: string }) {
  const router = useRouter()
  const [rows, setRows] = useState(start)

  const gone = (id: string) => {
    setRows((list) => list.filter((r) => r.id !== id))
    router.refresh()
  }

  const shown = rows.filter((r, i) => i < SHOWN || !r.done)
  const older = rows.filter((r, i) => i >= SHOWN && r.done)
  if (rows.length === 0) return null
  const row = (r: GameRow) => <Row key={r.id} row={r} api={api} onGone={() => gone(r.id)} />

  return (
    <div className="pe-row-list">
      {shown.map(row)}
      {older.length > 0 && (
        <details className="pe-row-more">
          <summary>
            {older.length} older {older.length === 1 ? 'game' : 'games'}
          </summary>
          {older.map(row)}
        </details>
      )}
    </div>
  )
}
