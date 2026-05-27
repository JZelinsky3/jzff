'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Two-button cluster for the Trade Grader.
//   • Grade next 10  → grades ungraded trades only (skips already-graded)
//   • Re-grade next 10 → force=true, overwrites existing grades (use after
//                        the prompt has been tuned)
// Calls the admin endpoint in batches of 10 so a single click doesn't blow
// the Vercel timeout on a long backfill.

export function GradeTradesButton({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'grading' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [showWarnings, setShowWarnings] = useState(false)
  const [lastAction, setLastAction] = useState<'grade' | 'regrade' | null>(null)

  async function grade(force: boolean) {
    setState('grading')
    setMsg(null); setWarnings([])
    setLastAction(force ? 'regrade' : 'grade')
    try {
      const res = await fetch(`/api/leagues/${leagueId}/grade-trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10, force }),
      })
      const body = await res.json()
      if (!res.ok) {
        setState('error')
        setMsg(body?.error ?? 'Grading failed')
        return
      }
      setState('done')
      setMsg(`Scanned ${body.scanned} · graded ${body.graded}`)
      if (Array.isArray(body.warnings)) setWarnings(body.warnings)
      router.refresh()
    } catch (e) {
      setState('error')
      setMsg((e as Error).message)
    }
  }

  const busy = state === 'grading'

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.5rem', maxWidth: '100%' }}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button onClick={() => grade(false)} disabled={busy} className="dc-btn">
          {busy && lastAction === 'grade' ? 'Grading…' : 'Grade next 10 →'}
        </button>
        <button onClick={() => grade(true)} disabled={busy} className="dc-btn-ghost" title="Re-grade trades that already have grades (overwrites)">
          {busy && lastAction === 'regrade' ? 'Re-grading…' : 'Re-grade next 10'}
        </button>
      </div>
      {msg && (
        <p className={state === 'error' ? 'dc-form-error' : 'dc-form-ok'} style={{ margin: 0 }}>
          {msg}
        </p>
      )}
      {warnings.length > 0 && (
        <div style={{ textAlign: 'right' }}>
          <button
            onClick={() => setShowWarnings((v) => !v)}
            className="dc-btn-ghost"
            style={{ fontSize: '.7rem', padding: '.2rem .5rem' }}
          >
            {showWarnings ? 'Hide' : 'Show'} {warnings.length} warning{warnings.length === 1 ? '' : 's'}
          </button>
          {showWarnings && (
            <ul style={{ marginTop: '.4rem', padding: '.5rem .75rem', background: 'rgba(255,140,90,.08)', border: '1px solid rgba(255,140,90,.25)', borderRadius: '2px', fontSize: '.72rem', listStyle: 'none', textAlign: 'left', maxWidth: '32rem' }}>
              {warnings.map((w, i) => (
                <li key={i} style={{ marginBottom: '.2rem' }}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
