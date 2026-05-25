'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { publishLeague, unpublishLeague } from './actions'

export function PublishButton({ leagueId, isPublished }: { leagueId: string; isPublished: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onClick() {
    setBusy(true); setErr(null)
    const result = isPublished
      ? await unpublishLeague(leagueId)
      : await publishLeague(leagueId)
    setBusy(false)
    if (!result.ok) { setErr(result.error); return }
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.4rem' }}>
      <button onClick={onClick} disabled={busy} className="dc-btn">
        {busy
          ? (isPublished ? 'Unpublishing…' : 'Publishing…')
          : (isPublished ? 'Unpublish' : 'Publish →')}
      </button>
      {err && <p className="dc-form-error" style={{ margin: 0 }}>{err}</p>}
    </div>
  )
}
