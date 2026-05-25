'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SyncButton({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [showWarnings, setShowWarnings] = useState(false)

  async function sync() {
    setState('syncing')
    setMsg(null); setWarnings([])
    const res = await fetch(`/api/leagues/${leagueId}/sync`, { method: 'POST' })
    const body = await res.json()
    if (!res.ok) {
      setState('error')
      setMsg(body?.error ?? 'Sync failed')
      return
    }
    setState('done')
    setMsg(
      `${body.seasonsIngested} season${body.seasonsIngested === 1 ? '' : 's'} · ${body.matchupsIngested} matchups · ${body.draftsIngested} draft${body.draftsIngested === 1 ? '' : 's'}`
    )
    if (Array.isArray(body.warnings)) setWarnings(body.warnings)
    router.refresh()
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.5rem', maxWidth: '100%' }}>
      <button onClick={sync} disabled={state === 'syncing'} className="dc-btn">
        {state === 'syncing' ? 'Syncing…' : state === 'done' ? 'Sync again →' : 'Sync from sources →'}
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
