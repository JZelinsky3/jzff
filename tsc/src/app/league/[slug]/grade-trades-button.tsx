'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Button cluster for the Trade Grader.
//   • Grade     → grades ungraded trades only (skips already-graded)
//   • Re-grade  → force=true, overwrites existing grades (use after the
//                 prompt has been tuned)
//   • Verdict   → runs the 4-week revisit on graded trades. Calls
//                 /revisit-trades with eligibleOnly=false so you can test the
//                 verdict section without waiting 4 weeks.
//
// HOW MANY is a control rather than a constant. It was pinned at 5, which
// made tuning the prompt needlessly expensive: changing one line and wanting
// to see its effect on the trade you just made meant re-grading four older
// trades you did not care about, at ~5s of Groq pacing each, and overwriting
// four good grades to inspect one.
//
// Candidates come back ordered by executed_at DESC and force mode takes the
// first N, so a batch of 1 is exactly "the most recent trade" — no extra
// server support needed for it. The cap stays small because every one of
// these is a Groq call and the route has to finish inside maxDuration.
const BATCH_SIZES = [1, 5, 10] as const

// Turn the route's raw counters into something that reads like an outcome.
//
// "Scanned 1 · graded 0" was the whole message, which is exactly what you
// see both when every trade is already graded and when every trade failed.
// The first is the normal, boring case and it looked like a failure.
//
// `scanned` counts eligible candidates, so 0 scanned means nothing even
// qualified — which since the 2026 floor usually means the league's trades
// are all older than that.
function gradeMessage(scanned: number, graded: number, force: boolean): string {
  if (scanned === 0) {
    return 'Nothing eligible — grading only covers trades from 2026 on.'
  }
  if (graded === 0) {
    return force
      ? `Nothing re-graded (${scanned} scanned).`
      : `Already graded — all ${scanned} ${scanned === 1 ? 'trade has' : 'trades have'} a grade. Use Re-grade to overwrite.`
  }
  return `Graded ${graded} of ${scanned} scanned.`
}

function verdictMessage(scanned: number, revisited: number): string {
  if (scanned === 0) {
    return 'Nothing eligible — a trade needs a grade before it can get a verdict.'
  }
  if (revisited === 0) {
    return `Already settled — all ${scanned} graded ${scanned === 1 ? 'trade has' : 'trades have'} a verdict.`
  }
  return `Verdicts written for ${revisited} of ${scanned} scanned.`
}

export function GradeTradesButton({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [showWarnings, setShowWarnings] = useState(false)
  const [lastAction, setLastAction] = useState<'grade' | 'regrade' | 'verdict' | 'refresh' | null>(null)
  const [count, setCount] = useState<number>(5)

  // "next 1" is a clumsy way to say what a batch of one actually does, and
  // the distinction matters here: it is always the most recent trade, not an
  // arbitrary one.
  const nLabel = count === 1 ? 'latest' : `next ${count}`

  async function grade(force: boolean) {
    setState('working')
    setMsg(null); setWarnings([])
    setLastAction(force ? 'regrade' : 'grade')
    try {
      const res = await fetch(`/api/leagues/${leagueId}/grade-trades/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: count, force }),
      })
      const body = await res.json()
      if (!res.ok) {
        setState('error')
        setMsg(body?.error ?? 'Grading failed')
        return
      }
      setState('done')
      setMsg(gradeMessage(body.scanned ?? 0, body.graded ?? 0, force))
      if (Array.isArray(body.warnings)) setWarnings(body.warnings)
      router.refresh()
    } catch (e) {
      setState('error')
      setMsg((e as Error).message)
    }
  }

  async function refreshValues() {
    setState('working')
    setMsg(null); setWarnings([])
    setLastAction('refresh')
    try {
      const res = await fetch(`/api/admin/refresh-player-values/`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        setState('error')
        setMsg(body?.error ?? 'Refresh failed')
        return
      }
      setState('done')
      setMsg(`Fetched ${body.fetched} · upserted ${body.upserted}`)
      if (Array.isArray(body.warnings)) setWarnings(body.warnings)
      router.refresh()
    } catch (e) {
      setState('error')
      setMsg((e as Error).message)
    }
  }

  async function verdict() {
    setState('working')
    setMsg(null); setWarnings([])
    setLastAction('verdict')
    try {
      const res = await fetch(`/api/leagues/${leagueId}/revisit-trades/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // eligibleOnly=false → revisit any graded trade regardless of age.
        // Lets you see the Verdict section populate without waiting.
        body: JSON.stringify({ limit: count, eligibleOnly: false }),
      })
      const body = await res.json()
      if (!res.ok) {
        setState('error')
        setMsg(body?.error ?? 'Verdict failed')
        return
      }
      setState('done')
      setMsg(verdictMessage(body.scanned ?? 0, body.revisited ?? 0))
      if (Array.isArray(body.warnings)) setWarnings(body.warnings)
      router.refresh()
    } catch (e) {
      setState('error')
      setMsg((e as Error).message)
    }
  }

  const busy = state === 'working'

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.5rem', maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.7rem', opacity: busy ? .5 : .75 }}>
        <span style={{ letterSpacing: '.06em', textTransform: 'uppercase' }}>How many</span>
        {BATCH_SIZES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setCount(n)}
            disabled={busy}
            aria-pressed={count === n}
            title={n === 1 ? 'Just the most recent trade' : `The ${n} most recent trades`}
            style={{
              padding: '.15rem .45rem',
              fontSize: '.7rem',
              lineHeight: 1.4,
              cursor: busy ? 'default' : 'pointer',
              background: count === n ? 'currentColor' : 'transparent',
              color: count === n ? 'var(--dc-bg, #12100e)' : 'inherit',
              border: '1px solid currentColor',
              borderRadius: '2px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button onClick={() => grade(false)} disabled={busy} className="dc-btn">
          {busy && lastAction === 'grade' ? 'Grading…' : `Grade ${nLabel}`}
        </button>
        <button onClick={() => grade(true)} disabled={busy} className="dc-btn-ghost" title="Re-grade trades that already have grades (overwrites)">
          {busy && lastAction === 'regrade' ? 'Re-grading…' : `Re-grade ${nLabel}`}
        </button>
        <button onClick={verdict} disabled={busy} className="dc-btn-ghost" title="Run the 4-week verdict on graded trades (test mode, no waiting)">
          {busy && lastAction === 'verdict' ? 'Revisiting…' : `Verdict ${nLabel}`}
        </button>
        <button onClick={refreshValues} disabled={busy} className="dc-btn-ghost" title="Pull the latest Sleeper player values into the grader. The weekly cron does this automatically; this button is for one-off testing.">
          {busy && lastAction === 'refresh' ? 'Refreshing…' : 'Refresh values'}
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
