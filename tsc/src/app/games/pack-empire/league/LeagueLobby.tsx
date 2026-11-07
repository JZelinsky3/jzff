'use client'

// Joining a public Weekly league straight off the lobby's list. Starting a league
// and joining by code moved to LeagueSetup.tsx, which handles both League Modes.

import { useRouter } from 'next/navigation'
import { useState } from 'react'

async function post(body: Record<string, unknown>) {
  const res = await fetch('/api/games/pack-empire/league/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Something went wrong.')
  return out
}

export function JoinPublic({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        className="pe-push pe-push--sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await post({ action: 'join', id })
            router.push(`/games/pack-empire/league/${id}/`)
            router.refresh()
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not join.')
            setBusy(false)
          }
        }}
      >
        Join
      </button>
      {error && <span className="pe-note" style={{ color: '#f0b4ad' }}>{error}</span>}
    </>
  )
}
