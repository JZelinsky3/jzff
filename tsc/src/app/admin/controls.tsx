'use client'

import { useState, useTransition } from 'react'
import { grantComp, revokeComp } from './actions'

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
