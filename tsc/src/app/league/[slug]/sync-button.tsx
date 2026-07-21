'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Sync route has maxDuration = 300 (5min). Surface that as a hard ceiling
// in the UI so the user knows when to give up vs keep waiting. The budget
// applies per source platform — multi-source leagues sync one platform per
// request so no single request has to fit the whole history under the cap.
const SYNC_BUDGET_S = 300
const PATIENCE_THRESHOLD_S = 30
const ABORT_THRESHOLD_S = SYNC_BUDGET_S + 30
// Hobby plan caps every function at 10s regardless of maxDuration. When the
// fetch rejects with TypeError past this mark, Vercel killed the connection
// even though the ingest usually finished its writes server-side — surface
// that as a "looks done, refreshing" instead of a raw network error.
const HOBBY_FUNCTION_CAP_S = 10

export function SyncButton({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState<string | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [showWarnings, setShowWarnings] = useState(false)
  const [elapsedS, setElapsedS] = useState(0)
  const startedAt = useRef<number | null>(null)
  // Each platform gets its own request and therefore its own server budget —
  // the stall/abort clock has to reset per request, not run off total elapsed.
  const chunkStartedAt = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Tick a 1s timer while syncing so the user can see something is happening
  // and we can flag a likely hang past the route's maxDuration.
  useEffect(() => {
    if (state !== 'syncing') return
    const tick = () => {
      if (startedAt.current == null) return
      setElapsedS(Math.floor((Date.now() - startedAt.current) / 1000))
      const chunkS = Math.floor((Date.now() - (chunkStartedAt.current ?? startedAt.current)) / 1000)
      if (chunkS >= ABORT_THRESHOLD_S) {
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
    setMsg(null); setWarnings([]); setPhase(null)
    startedAt.current = Date.now()
    chunkStartedAt.current = Date.now()
    setElapsedS(0)

    // One POST per source platform. A multi-source league synced in a single
    // request routinely outlives the function cap — the run dies mid-walk
    // with a raw error and only the platforms that ran first land. Chunking
    // gives every platform the full budget. If the platform listing fails
    // for any reason, fall back to the old single all-platforms request.
    let platforms: string[] = []
    try {
      const res = await fetch(`/api/leagues/${leagueId}/sync/`)
      const body = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(body?.platforms)) platforms = body.platforms
    } catch { /* fall through to single request */ }

    const totals = { seasonsIngested: 0, matchupsIngested: 0, draftsIngested: 0 }
    const allWarnings: string[] = []
    const chunks: Array<string | null> = platforms.length > 0 ? platforms : [null]
    let landed = 0

    for (let ci = 0; ci < chunks.length; ci++) {
      const platform = chunks[ci]
      if (platform && chunks.length > 1) setPhase(`Source ${ci + 1}/${chunks.length} · ${platform}`)
      chunkStartedAt.current = Date.now()

      const controller = new AbortController()
      abortRef.current = controller

      try {
        // Trailing slash matters — next.config has trailingSlash: true, so a
        // POST to /sync without the slash gets 308-redirected and the browser's
        // follow-up request hangs. Hit the canonical URL directly.
        const url = platform
          ? `/api/leagues/${leagueId}/sync/?platform=${encodeURIComponent(platform)}`
          : `/api/leagues/${leagueId}/sync/`
        const res = await fetch(url, { method: 'POST', signal: controller.signal })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          allWarnings.push(`[${platform ?? 'sync'}] ${body?.error ?? `failed (HTTP ${res.status})`}`)
          continue
        }
        landed++
        totals.seasonsIngested += body.seasonsIngested ?? 0
        totals.matchupsIngested += body.matchupsIngested ?? 0
        totals.draftsIngested += body.draftsIngested ?? 0
        if (Array.isArray(body.warnings)) allWarnings.push(...body.warnings)
      } catch (err) {
        const chunkElapsed = Math.floor((Date.now() - (chunkStartedAt.current ?? Date.now())) / 1000)
        if (err instanceof DOMException && err.name === 'AbortError') {
          allWarnings.push(`[${platform ?? 'sync'}] stalled past ${formatElapsed(ABORT_THRESHOLD_S)}. The server likely timed out. Data may still have partially landed.`)
        } else if (err instanceof TypeError && chunkElapsed >= HOBBY_FUNCTION_CAP_S - 1) {
          // Vercel killed the connection at the function cap. The ingest almost
          // always finishes its writes before the cut, so keep walking the
          // remaining platforms rather than scaring the user with a raw error.
          landed++
          allWarnings.push(`[${platform ?? 'sync'}] connection cut at ${formatElapsed(chunkElapsed)} (Vercel function cap). The ingest likely finished its writes.`)
        } else {
          allWarnings.push(`[${platform ?? 'sync'}] ${err instanceof Error ? err.message : 'network error'}`)
        }
      } finally {
        abortRef.current = null
      }
    }

    setPhase(null)
    setWarnings(allWarnings)
    if (landed === 0) {
      setState('error')
      setMsg(allWarnings[0] ?? 'Sync failed')
      return
    }
    setState('done')
    setMsg(
      `${totals.seasonsIngested} season${totals.seasonsIngested === 1 ? '' : 's'} · ${totals.matchupsIngested} matchups · ${totals.draftsIngested} draft${totals.draftsIngested === 1 ? '' : 's'} · ${formatElapsed(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000))}`
    )
    router.refresh()
  }

  const showPatience = state === 'syncing' && elapsedS >= PATIENCE_THRESHOLD_S
  const showWarning = state === 'syncing' && elapsedS >= SYNC_BUDGET_S && !phase

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.5rem', maxWidth: '100%' }}>
      <button onClick={sync} disabled={state === 'syncing'} className="dc-btn">
        {state === 'syncing'
          ? `Syncing… ${formatElapsed(elapsedS)}`
          : state === 'done'
          ? 'Sync again →'
          : 'Sync →'}
      </button>
      {state === 'syncing' && phase && (
        <p style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.12em', color: 'var(--cream-mute)', textTransform: 'uppercase', textAlign: 'right', maxWidth: '180px', lineHeight: 1.45 }}>
          {phase}
        </p>
      )}
      {state === 'syncing' && !showWarning && (
        // Width-capped + right-aligned so the hint never extends further
        // left than the button above it — wraps onto a second/third line
        // instead. Surfaces "stay on this page" immediately so the warning
        // lands before someone clicks away.
        <p style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.12em', color: 'var(--cream-mute)', textTransform: 'uppercase', textAlign: 'right', maxWidth: '180px', lineHeight: 1.45 }}>
          {showPatience
            ? 'Large ingests can take 2-5 min. Stay on this page.'
            : 'Stay on this page until it finishes.'}
        </p>
      )}
      {showWarning && (
        <p style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.12em', color: 'var(--rust)', textTransform: 'uppercase', textAlign: 'right', maxWidth: '180px', lineHeight: 1.45 }}>
          Past the server budget, will abort soon. Sources may still be updating in the background.
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
