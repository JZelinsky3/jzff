'use client'

import Link from 'next/link'
import { useState } from 'react'

/** No account: a name puts the run on the board, an account keeps the rest. */
export function GuestName({
  error,
  onPost,
  signIn,
}: {
  error: string | null
  onPost: (name: string) => Promise<void>
  signIn: string
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy || name.trim().length < 2) return
    setBusy(true)
    await onPost(name)
    setBusy(false)
  }

  return (
    <div className="pe-recap-name">
      <div className="pe-recap-name-row">
        <input
          className="pe-input"
          placeholder="Your name"
          aria-label="Your name for the board"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button type="button" className="pe-btn" onClick={submit} disabled={busy || name.trim().length < 2}>
          {busy ? 'Posting' : 'Post'}
        </button>
      </div>
      {error && <div className="pe-error">{error}</div>}
      <p className="pe-note">
        <Link className="pe-link" href={signIn}>
          Sign in
        </Link>{' '}
        instead to save your drafts and binder.
      </p>
    </div>
  )
}
