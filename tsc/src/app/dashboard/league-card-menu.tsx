'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteLeague } from './actions'

// Small kebab menu floating in the top-right of each league card. Opens a
// dropdown with a Delete action that requires the user to type the league
// name in a prompt before firing.
export function LeagueCardMenu({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Stop the card's Link click from firing when we interact with the menu.
  function stop(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation()
    e.preventDefault()
  }

  async function onDelete(e: React.MouseEvent) {
    stop(e)
    setErr(null)
    const typed = window.prompt(
      `Type the league name to permanently delete it and every season, manager, matchup, and rivalry attached to it. This can't be undone.\n\nLeague name: ${leagueName}`
    )
    if (typed == null) { setOpen(false); return }
    setBusy(true)
    const result = await deleteLeague({ leagueId, confirmName: typed })
    setBusy(false)
    if (!result.ok) { setErr(result.error); return }
    setOpen(false)
    router.refresh()
  }

  return (
    <div
      ref={ref}
      onClick={stop}
      onKeyDown={stop}
      style={{ position: 'absolute', bottom: '.6rem', right: '.6rem', zIndex: 2 }}
    >
      <button
        type="button"
        onClick={(e) => { stop(e); setOpen((v) => !v) }}
        aria-label="Open league menu"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          background: 'rgba(0,0,0,.35)',
          border: '1px solid rgba(255,255,255,.12)',
          color: 'var(--cream)',
          width: '1.85rem',
          height: '1.85rem',
          borderRadius: '50%',
          cursor: 'pointer',
          fontSize: '1.1rem',
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          style={{
            // Sitting at the bottom-right of the card, the panel opens upward
            // (bottom of panel anchored above the trigger) so it doesn't get
            // clipped at the card edge.
            position: 'absolute',
            bottom: 'calc(100% + .3rem)',
            right: 0,
            minWidth: '12rem',
            background: 'var(--ink, #15151a)',
            border: '1px solid var(--ink-line, rgba(255,255,255,.12))',
            borderRadius: '4px',
            boxShadow: '0 12px 32px rgba(0,0,0,.45)',
            padding: '.35rem',
            zIndex: 50,
          }}
        >
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="dc-menu-link"
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '.5rem .65rem',
              borderRadius: '3px',
              background: 'transparent',
              border: 'none',
              cursor: busy ? 'wait' : 'pointer',
              color: 'var(--fire, #d65a3c)',
              font: 'inherit',
              fontFamily: 'var(--serif)',
              fontSize: '.9rem',
            }}
          >
            {busy ? 'Deleting…' : 'Delete league…'}
          </button>
          {err && (
            <div className="dc-form-error" style={{ padding: '.35rem .65rem', fontSize: '.7rem', margin: 0 }}>
              {err}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
