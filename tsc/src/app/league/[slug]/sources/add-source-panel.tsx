'use client'

import { useEffect, useRef, useState } from 'react'
import { AddSourceForm, type SourcePrefill } from './add-source-form'

// Wraps AddSourceForm in a collapsible panel. Closed by default — clicking
// the button expands the form. On successful submit, snap the panel shut
// and scroll the user back up to §01 so they can see the new source in
// the ledger. Also drives the "Extend" flow: SourceRow can call open()
// with a prefill so the form arrives pre-loaded with that league's
// platform + ID, ready for the next stretch of years.
export function AddSourcePanel({
  leagueId,
  slug,
  yahooConnected,
  prefill,
  onOpenChange,
}: {
  leagueId: string
  slug: string
  yahooConnected: boolean
  // Controlled from the parent (Extend button on a source card) — set to
  // open the panel pre-loaded for that source's league.
  prefill?: SourcePrefill | null
  onOpenChange?: (open: boolean) => void
}) {
  // The workbench remounts this component (key={prefillKey}) on every
  // Extend click, so the initial-state read below is enough to pick up a
  // fresh prefill without an effect setting state after the fact.
  const [open, setOpen] = useState(!!prefill)
  const formMountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (prefill) formMountRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [prefill])

  function close() {
    setOpen(false)
    onOpenChange?.(false)
  }

  function handleSuccess() {
    setOpen(false)
    onOpenChange?.(false)
    const target = document.getElementById('sources-ledger')
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => { setOpen(true); onOpenChange?.(true) }}
          className="lo-btn"
        >
          + Add a source
        </button>
      </div>
    )
  }

  return (
    <div ref={formMountRef}>
      <div className="lo-form-card">
        <AddSourceForm
          leagueId={leagueId}
          slug={slug}
          yahooConnected={yahooConnected}
          prefill={prefill}
          onSuccess={handleSuccess}
        />
      </div>
      <div style={{ marginTop: '.75rem' }}>
        <button type="button" onClick={close} className="lo-btn-quiet">
          Cancel
        </button>
      </div>
    </div>
  )
}
