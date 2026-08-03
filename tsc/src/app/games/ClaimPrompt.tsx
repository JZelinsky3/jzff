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
// Signed-out players get the same question. The answer can't be written
// then: a claim belongs to an account, and one keyed to a browser would let
// anybody take any name in a league they have never been in. So it is kept
// on the device alongside their banked runs and written the moment there is
// an account, which is the same bargain the runs themselves get.
//
// Silent about itself until it has something to say. If the pool isn't one
// league, or the league has no managers to choose from, this renders nothing
// rather than an empty box.

import { useEffect, useState } from 'react'
import { bankClaim, readPendingClaims } from './runBank'
import styles from './games.module.css'

type Option = { id: string; name: string; taken: boolean }

type Loaded = {
  signedIn: boolean
  league: { slug: string; name: string }
  claimed: string | null
  options: Option[]
}

export function ClaimPrompt({ poolId }: { poolId: string }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Only meaningful once an answer exists: the list is folded away behind it,
  // because a board you have already named yourself on should read as settled
  // rather than as a question being asked again every visit.
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
        if (cancelled || !body?.ok) return
        // Signed out, the answer lives on this device until there's an
        // account, so a pick made a minute ago still shows as made.
        const pending = body.signedIn
          ? null
          : (readPendingClaims().find((c) => c.pool === poolId)?.managerId ?? null)
        setData({
          signedIn: !!body.signedIn,
          league: body.league,
          claimed: body.claimed ?? pending,
          options: body.options,
        })
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
    // No account yet: keep it here and let the sign-in carry it over. Written
    // before anything else so a player who never comes back still has it on
    // the device that played the runs.
    if (!data.signedIn) {
      bankClaim(poolId, id)
      setData((d) => (d ? { ...d, claimed: id } : d))
      setOpen(false)
      return
    }

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

  const signInHref = `/login?mode=signup&next=${encodeURIComponent(
    typeof window === 'undefined' ? '/games/' : window.location.pathname + window.location.search
  )}`

  if (mine) {
    return (
      // Sized to the sentence while it is only a sentence, back to the full
      // panel once the list of names is under it.
      <div className={open ? styles.claim : styles.claimSettled}>
        <p className={styles.claimAsk}>
          {data.signedIn ? (
            <>
              This board calls you <b>{mine.name}</b> in {data.league.name}.{' '}
            </>
          ) : (
            <>
              Saved on this device. <a href={signInHref}>Make an account</a> and the board
              calls you <b>{mine.name}</b>, with the runs you have already played.{' '}
            </>
          )}
          <button type="button" className={styles.claimSwitch} onClick={() => setOpen((v) => !v)}>
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
