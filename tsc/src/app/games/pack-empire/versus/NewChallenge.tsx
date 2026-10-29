'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** Opens a challenge and drops you straight into your own draft, with the
    link to send sitting above the field. */
export function NewChallenge({ label = 'Start a challenge' }: { label?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/games/pack-empire/versus/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
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
      <button type="button" className="pe-btn" onClick={go} disabled={busy}>
        {busy ? 'Opening' : label}
      </button>
      {error && (
        <div className="pe-error" style={{ marginTop: '0.8rem' }}>
          {error}
        </div>
      )}
    </>
  )
}
