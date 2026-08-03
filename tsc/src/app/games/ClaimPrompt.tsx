'use client'

// "Which manager are you in this league?"
//
// Asked in two places, both of which are the board about to print a name:
// in the recap, immediately after a run posts to a LEAGUE board, and on the
// league board itself. Asked in a settings page instead, nobody would ever
// see it — but asked ONLY in the recap, as it was at first, it could never
// be answered again, and the first answer is the one most likely to be a
// mistake. So the answer stays changeable wherever the question is asked.
//
// Silent about itself until it has something to say. If the pool isn't one
// league, or the viewer is signed out, or the league has no managers to
// choose from, this renders nothing rather than an empty box.

import { useEffect, useState } from 'react'
import styles from './games.module.css'

type Option = { id: string; name: string; taken: boolean }

type Loaded = {
  league: { slug: string; name: string }
  claimed: string | null
  options: Option[]
}

export function ClaimPrompt({ poolId }: { poolId: string }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Only meaningful once a claim exists: the list is folded away behind the
  // answer, because a board you have already named yourself on should read
  // as settled rather than as a question being asked again every visit.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/games/claim/?pool=${encodeURIComponent(poolId)}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const body = await res.json()
        if (cancelled || !body?.ok || !body.signedIn) return
        setData({ league: body.league, claimed: body.claimed, options: body.options })
      } catch {
        /* the board still works with the site name */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [poolId])

  if (!data || data.options.length === 0) return null

  const mine = data.claimed ? (data.options.find((o) => o.id === data.claimed) ?? null) : null

  const choose = async (id: string) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/games/claim/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool: poolId, managerId: id }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.ok) {
        // The manager just released, if this was a change, is free again;
        // the one just taken is not. Both are this account's, so neither is
        // "taken" from here — only the local claim moves.
        setData((d) => (d ? { ...d, claimed: id } : d))
        setOpen(false)
      } else setError(body?.error ?? 'Could not save that.')
    } catch {
      setError('Could not save that.')
    } finally {
      setSaving(false)
    }
  }

  const list = (
    <div className={styles.claimList}>
      {data.options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={o.id === data.claimed ? styles.claimBtnOn : styles.claimBtn}
          disabled={saving || o.taken}
          // Taken managers stay visible and disabled. A name quietly
          // missing from the list reads as a bug; "already claimed" reads
          // as somebody having got there first, which is what happened.
          title={o.taken ? 'Already claimed' : undefined}
          onClick={() => void choose(o.id)}
        >
          {o.name}
          {o.taken && <span className={styles.claimTaken}>taken</span>}
        </button>
      ))}
    </div>
  )

  if (mine) {
    return (
      <div className={styles.claim}>
        <p className={styles.claimAsk}>
          This board calls you <b>{mine.name}</b> in {data.league.name}.{' '}
          <button
            type="button"
            className={styles.claimSwitch}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Never mind' : 'Not you?'}
          </button>
        </p>
        {open && list}
        {error && <p className={styles.claimErr}>{error}</p>}
      </div>
    )
  }

  return (
    <div className={styles.claim}>
      <p className={styles.claimAsk}>
        Which manager are you in <b>{data.league.name}</b>? The board will use that name
        instead of your account&apos;s.
      </p>
      {list}
      {error && <p className={styles.claimErr}>{error}</p>}
    </div>
  )
}
