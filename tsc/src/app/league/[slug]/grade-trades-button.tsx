'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Backfill button for the Trade Grader. Calls the admin endpoint in batches
// of 10 so a single click doesn't blow the Vercel timeout on a long backfill.
// On success, shows the latest run's scanned/graded counts + any warnings.

export function GradeTradesButton({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'grading' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [showWarnings, setShowWarnings] = useState(false)

  async function grade() {
    setState('grading')
    setMsg(null); setWarnings([])
    try {
      const res = await fetch(`/api/leagues/${leagueId}/grade-trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10 }),
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

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.5rem', maxWidth: '100%' }}>
      <button onClick={grade} disabled={state === 'grading'} className="dc-btn">
        {state === 'grading' ? 'Grading…' : state === 'done' ? 'Grade more →' : 'Grade next 10 trades →'}
      </button>
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
