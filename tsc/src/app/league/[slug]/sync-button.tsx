'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Sync route has maxDuration = 300 (5min). Surface that as a hard ceiling
// in the UI so the user knows when to give up vs keep waiting.
const SYNC_BUDGET_S = 300
const PATIENCE_THRESHOLD_S = 30
const ABORT_THRESHOLD_S = SYNC_BUDGET_S + 30

export function SyncButton({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [showWarnings, setShowWarnings] = useState(false)
  const [elapsedS, setElapsedS] = useState(0)
  const startedAt = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Tick a 1s timer while syncing so the user can see something is happening
  // and we can flag a likely hang past the route's maxDuration.
  useEffect(() => {
    if (state !== 'syncing') return
    const tick = () => {
      if (startedAt.current == null) return
      const s = Math.floor((Date.now() - startedAt.current) / 1000)
      setElapsedS(s)
      if (s >= ABORT_THRESHOLD_S) {
        // We're well past the server's max duration — Vercel has killed the
        // function and the connection is hanging. Force-abort the fetch so the
        // user gets feedback instead of an infinite spinner.
        abortRef.current?.abort()
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [state])

  async function sync() {
    setState('syncing')
    setMsg(null); setWarnings([])
    startedAt.current = Date.now()
    setElapsedS(0)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Trailing slash matters — next.config has trailingSlash: true, so a
      // POST to /sync without the slash gets 308-redirected and the browser's
      // follow-up request hangs. Hit the canonical URL directly.
      const res = await fetch(`/api/leagues/${leagueId}/sync/`, { method: 'POST', signal: controller.signal })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setState('error')
        setMsg(body?.error ?? `Sync failed (HTTP ${res.status})`)
        return
      }
      setState('done')
      setMsg(
        `${body.seasonsIngested} season${body.seasonsIngested === 1 ? '' : 's'} · ${body.matchupsIngested} matchups · ${body.draftsIngested} draft${body.draftsIngested === 1 ? '' : 's'} · ${formatElapsed(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000))}`
      )
      if (Array.isArray(body.warnings)) setWarnings(body.warnings)
      router.refresh()
    } catch (err) {
      setState('error')
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMsg(`Sync stalled past ${formatElapsed(ABORT_THRESHOLD_S)}. The server likely timed out. Data may still have partially landed — refresh to check.`)
      } else {
        setMsg(err instanceof Error ? err.message : 'Sync failed — network error')
      }
    } finally {
      abortRef.current = null
    }
  }

  const showPatience = state === 'syncing' && elapsedS >= PATIENCE_THRESHOLD_S
  const showWarning = state === 'syncing' && elapsedS >= SYNC_BUDGET_S

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.5rem', maxWidth: '100%' }}>
      <button onClick={sync} disabled={state === 'syncing'} className="dc-btn">
        {state === 'syncing'
          ? `Syncing… ${formatElapsed(elapsedS)}`
          : state === 'done'
          ? 'Sync again →'
          : 'Sync from sources →'}
      </button>
      {showPatience && !showWarning && (
        <p style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.12em', color: 'var(--cream-mute)', textTransform: 'uppercase' }}>
          Large ingests can take 2–5 minutes — hang tight.
        </p>
      )}
      {showWarning && (
        <p style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.12em', color: 'var(--rust)', textTransform: 'uppercase' }}>
          Past the server budget — will abort soon. Sources may still be updating in the background.
        </p>
      )}
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

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
