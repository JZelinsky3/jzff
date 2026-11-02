'use client'

// A challenge, for someone who hasn't sat down yet. Taking it plays your deck in play.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Invitation } from '@/lib/packEmpire/locker/fieldGeneralMatch'
import { lockerPost } from '../../api'

export function JoinCard({ invite }: { invite: Invitation }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closed = invite.taken || invite.gone ? 'This challenge has been taken or has run out.' : invite.forOther ? 'This challenge was sent to someone else.' : null

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      await lockerPost('/field-general', { action: 'join', id: invite.id })
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through.')
      setBusy(false)
    }
  }

  return (
    <div className="fg-wait">
      <div className="fg-wait-in">
        <div className="fg-wait-kick">Field General</div>
        <h1>{invite.from} Challenged You</h1>
        <p>{closed ?? 'Your deck in play against theirs, live, with a 75-second clock on every drive.'}</p>
        {error && <p className="pe-fg-error">{error}</p>}
        {!closed && (
          <button type="button" className="pe-btn" disabled={busy} onClick={join}>
            Take The Seat
          </button>
        )}
        <Link href="/games/pack-empire/locker/field-general/" className="pe-btn pe-btn--ghost pe-btn--sm">
          Back To The Lobby
        </Link>
      </div>
    </div>
  )
}
