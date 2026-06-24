'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { publishLeague } from './setup/actions'

// Publish CTA that lives INSIDE the almanac billboard while a league is
// unpublished. Replaces the "View site ↗" link (which would go to a
// placeholder anyway) with the actual action the user needs to take.
// Once published, the billboard becomes a link again and this component
// is not rendered.
export function BillboardPublishCta({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onClick(e: React.MouseEvent) {
    // The button is inside the billboard container — without stopping
    // propagation a future wrapper click handler could fire.
    e.preventDefault()
    e.stopPropagation()
    setBusy(true); setErr(null)
    const r = await publishLeague(leagueId)
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        className="almanac-billboard-cta almanac-billboard-publish"
        onClick={onClick}
        disabled={busy}
      >
        {busy ? 'Publishing…' : 'Publish almanac →'}
      </button>
      {err && (
        <p className="dc-form-error" style={{ marginTop: '.5rem' }}>{err}</p>
      )}
    </>
  )
}
