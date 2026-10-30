'use client'

import Link from 'next/link'
import { useState } from 'react'
import styles from '@/components/account/play.module.css'

/** The one button on an invite page: say yes, and you're friends. */
export function AcceptInvite({ token, name }: { token: string; name: string }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/friends/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite', token }),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Could not add them. Try again.')
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add them. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className={styles.nameForm}>
        <p className={styles.nameHint}>
          You and <b>{name}</b> are friends now. Their records sit next to yours, and you can send each other
          Pack Empire challenges.
        </p>
        <div className={styles.nameButtons}>
          <Link href="/games/pack-empire/profile/" className={styles.btn}>
            Your friends
          </Link>
          <Link href="/games/pack-empire/" className={styles.btnGhost}>
            Pack Empire
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.nameForm}>
      <div className={styles.nameButtons}>
        <button type="button" className={styles.btn} onClick={accept} disabled={busy}>
          {busy ? 'Adding' : `Add ${name}`}
        </button>
        <Link href="/account/" className={styles.btnQuiet}>
          Not now
        </Link>
      </div>
      {error && <p className={styles.err}>{error}</p>}
    </div>
  )
}
