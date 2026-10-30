'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** Opens a challenge and drops you straight into your own draft, with the
    link to send sitting above the field. With friends, each one is a button
    that opens a challenge with their seat held for them. */
export function NewChallenge({
  label = 'Start a challenge',
  friends = [],
}: {
  label?: string
  friends?: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = async (friend?: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/games/pack-empire/versus/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', friend }),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Could not open a challenge.')
      router.push(`/games/pack-empire/versus/${out.id}/`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a challenge.')
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="pe-btn" onClick={() => go()} disabled={busy}>
        {busy ? 'Opening' : label}
      </button>
      {friends.length > 0 && (
        <div style={{ marginTop: '1.1rem' }}>
          <div className="pe-note" style={{ marginBottom: '0.55rem' }}>
            Or send it to one friend
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center' }}>
            {friends.map((f) => (
              <button key={f.id} type="button" className="pe-btn pe-btn--sm pe-btn--quiet" onClick={() => go(f.id)} disabled={busy}>
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && (
        <div className="pe-error" style={{ marginTop: '0.8rem' }}>
          {error}
        </div>
      )}
    </>
  )
}
