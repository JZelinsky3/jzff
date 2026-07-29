'use client'

import { useState, useTransition } from 'react'
import { grantComp, revokeComp } from './actions'

// Client-side pager for the admin tables. Rows come in server-rendered
// (newest first); we just slice how many are visible. "Less" can shrink
// below the initial count, down to `min`.
export function PagedRows({ rows, cols, initial = 15, step = 15, min = 5 }: {
  rows: React.ReactNode[]
  cols: number
  initial?: number
  step?: number
  min?: number
}) {
  const [count, setCount] = useState(initial)
  const floor = Math.min(min, rows.length)
  const shown = Math.max(floor, Math.min(count, rows.length))
  const canMore = shown < rows.length
  const canLess = shown > floor
  return (
    <tbody>
      {rows.slice(0, shown)}
      {(canMore || canLess) && (
        <tr style={{ borderTop: '1px solid var(--ink-line)' }}>
          <td colSpan={cols} style={{ padding: '.5rem .8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.15em', textTransform: 'uppercase', opacity: 0.55 }}>
                Showing {shown} of {rows.length}
              </span>
              {canMore && (
                <button type="button" className="dc-btn-ghost" style={{ fontSize: '.65rem', padding: '.3rem .7rem' }}
                  onClick={() => setCount(Math.min(shown + step, rows.length))}>
                  More
                </button>
              )}
              {canLess && (
                <button type="button" className="dc-btn-ghost" style={{ fontSize: '.65rem', padding: '.3rem .7rem' }}
                  onClick={() => setCount(Math.max(shown - step, floor))}>
                  Less
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </tbody>
  )
}

export function GrantCompButton({ userId }: { userId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        className="dc-btn-ghost"
        style={{ fontSize: '.65rem', padding: '.35rem .7rem' }}
        disabled={pending}
        onClick={() => {
          const note = window.prompt('Note for this comp (optional):') ?? ''
          start(async () => {
            setError(null)
            const res = await grantComp(userId, note || undefined)
            if (!res.ok) setError(res.error ?? 'Failed.')
          })
        }}
      >
        {pending ? '…' : 'Grant comp'}
      </button>
      {error && <div style={{ color: 'rgba(220,120,80,.85)', fontSize: '.65rem', marginTop: '.2rem' }}>{error}</div>}
    </>
  )
}

export function RevokeCompButton({ userId }: { userId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        className="dc-btn-ghost"
        style={{ fontSize: '.65rem', padding: '.35rem .7rem' }}
        disabled={pending}
        onClick={() => {
          if (!window.confirm('Revoke this user\'s comp access?')) return
          start(async () => {
            setError(null)
            const res = await revokeComp(userId)
            if (!res.ok) setError(res.error ?? 'Failed.')
          })
        }}
      >
        {pending ? '…' : 'Revoke'}
      </button>
      {error && <div style={{ color: 'rgba(220,120,80,.85)', fontSize: '.65rem', marginTop: '.2rem' }}>{error}</div>}
    </>
  )
}
