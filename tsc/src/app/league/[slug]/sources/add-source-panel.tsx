'use client'

import { useEffect, useRef, useState } from 'react'
import { AddSourceForm } from './add-source-form'

// Wraps AddSourceForm in a collapsible panel. Closed by default — clicking
// the button expands the form. On successful submit, snap the panel shut
// and scroll the user back up to §01 so they can see the new source in
// the ledger.
export function AddSourcePanel({
  leagueId,
  slug,
  yahooConnected,
}: {
  leagueId: string
  slug: string
  yahooConnected: boolean
}) {
  const [open, setOpen] = useState(false)
  const formMountRef = useRef<HTMLDivElement>(null)

  // Watch the form's success-state UI element (the `.dc-form-ok` paragraph
  // the inner form renders) and react when it appears. Lets us reuse the
  // existing useActionState-based form without adding a duplicate callback
  // prop / refactoring the action signature.
  useEffect(() => {
    if (!open) return
    const root = formMountRef.current
    if (!root) return
    const obs = new MutationObserver(() => {
      const ok = root.querySelector('.dc-form-ok')
      if (ok) {
        setOpen(false)
        // Bring focus back to the ledger so the new row is in view.
        const target = document.getElementById('sources-ledger')
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        else window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    })
    obs.observe(root, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [open])

  if (!open) {
    return (
      <div style={{ marginTop: '.25rem' }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="dc-btn"
        >
          + Add a source
        </button>
      </div>
    )
  }

  return (
    <div ref={formMountRef}>
      <p style={{ color: 'var(--cream-soft)', fontSize: '.92rem', lineHeight: 1.6, maxWidth: '60ch', marginBottom: '1.5rem' }}>
        Toggle <span className="text-gold">walk-history</span> on to follow Sleeper&apos;s{' '}
        <code style={{ background: 'var(--ink-soft)', padding: '.1rem .35rem', borderRadius: '2px', fontSize: '.85em' }}>previous_league_id</code>{' '}
        chain back from this ID. Off means only that one season is imported.
      </p>
      <div className="card" style={{ paddingBottom: '2rem' }}>
        <AddSourceForm leagueId={leagueId} slug={slug} yahooConnected={yahooConnected} />
      </div>
      <div style={{ marginTop: '.75rem' }}>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--cream-soft)',
            fontFamily: 'var(--mono)',
            fontSize: '.72rem',
            letterSpacing: '.15em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            padding: '.25rem 0',
          }}
        >
          ← Cancel
        </button>
      </div>
    </div>
  )
}
