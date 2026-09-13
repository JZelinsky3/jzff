'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Button cluster for the Trade Grader.
//
// Two of these spend AI calls and one does not, and that was the confusing
// part: "Re-letter" read like it might be the AI writing new letters. Every
// label now says what it touches, and the legend under the row spells out
// which ones cost tokens.
//   • Grade        → AI. Write-up + letters, for trades with no grade yet.
//   • Re-grade     → AI. A NEW write-up AND new letters, overwriting both.
//   • Letters only → no AI. Recomputes the letters from the player values and
//                    leaves the write-up exactly as it is. Use it when the
//                    paragraph reads well and only the letters are off; a
//                    re-grade would throw away good copy to move one notch.
//   • Verdict      → AI. The 4-week revisit on graded trades, with
//                    eligibleOnly=false so it can be tested without waiting.
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

function letterMessage(scanned: number, graded: number): string {
  if (scanned === 0) {
    return 'Nothing eligible — grading only covers trades from 2026 on.'
  }
  if (graded === 0) {
    return `No letters changed (${scanned} scanned).`
  }
  return `New letters on ${graded} of ${scanned}. Write-ups untouched, no AI call.`
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

type EditableTrade = {
  id: string
  week: number | null
  executed_at: string | null
  season_year: number | null
  summary: string
  hand_edited: boolean
  managers: string[]
}

// Edit one write-up by hand.
//
// Before this, fixing a single clause meant re-grading the trade: an AI call
// that throws away the whole paragraph and returns a different one, to change
// a sentence that was nearly right. The write-up is just a column, so it can
// simply be edited.
function WriteUpEditor({ leagueId, count }: { leagueId: string; count: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [trades, setTrades] = useState<EditableTrade[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function load() {
    setNote(null)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/trade-summary/?limit=${Math.max(count, 5)}`)
      const body = await res.json()
      if (!res.ok) { setNote(body?.error ?? 'Could not load write-ups'); return }
      setTrades(body.trades ?? [])
      setDrafts(Object.fromEntries((body.trades ?? []).map((t: EditableTrade) => [t.id, t.summary])))
    } catch (e) {
      setNote((e as Error).message)
    }
  }

  async function save(tradeId: string) {
    setSaving(tradeId)
    setNote(null)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/trade-summary/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeId, summary: drafts[tradeId] ?? '' }),
      })
      const body = await res.json()
      if (!res.ok) { setNote(body?.error ?? 'Save failed'); return }
      // The server strips em dashes, so the saved text can differ from what
      // was typed. Show what actually landed rather than what was sent.
      setDrafts((d) => ({ ...d, [tradeId]: body.summary }))
      setTrades((ts) => (ts ?? []).map((t) => (
        t.id === tradeId ? { ...t, summary: body.summary, hand_edited: true } : t
      )))
      setNote('Saved. The letters were not touched.')
      router.refresh()
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div style={{ width: '100%', textAlign: 'right' }}>
      <button
        type="button"
        className="dc-btn-ghost"
        style={{ fontSize: '.7rem', padding: '.2rem .5rem' }}
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next && trades === null) load()
        }}
      >
        {open ? 'Close write-up editor' : 'Edit a write-up by hand'}
      </button>

      {open && (
        <div style={{ marginTop: '.5rem', textAlign: 'left', maxWidth: '38rem', marginLeft: 'auto' }}>
          {note && <p className="dc-form-ok" style={{ margin: '0 0 .4rem' }}>{note}</p>}
          {trades === null && <p style={{ fontSize: '.72rem', opacity: .6, margin: 0 }}>Loading…</p>}
          {trades !== null && trades.length === 0 && (
            <p style={{ fontSize: '.72rem', opacity: .6, margin: 0 }}>No trades to edit yet.</p>
          )}
          {(trades ?? []).map((t) => {
            const dirty = (drafts[t.id] ?? '') !== t.summary
            const when = t.executed_at
              ? new Date(t.executed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : ''
            return (
              <div key={t.id} style={{ marginBottom: '.75rem', paddingBottom: '.75rem', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                <div style={{ fontSize: '.68rem', opacity: .7, marginBottom: '.25rem', letterSpacing: '.04em' }}>
                  {[when, t.week ? `W${t.week}` : null, t.season_year, t.managers.join(' / ')]
                    .filter(Boolean).join(' · ')}
                  {t.hand_edited ? ' · edited by hand' : ''}
                </div>
                <textarea
                  value={drafts[t.id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                  rows={4}
                  style={{
                    width: '100%', fontSize: '.75rem', lineHeight: 1.5, padding: '.4rem',
                    background: 'transparent', color: 'inherit',
                    border: '1px solid rgba(255,255,255,.18)', borderRadius: '2px',
                    fontFamily: 'inherit', resize: 'vertical',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.25rem' }}>
                  <span style={{ fontSize: '.65rem', opacity: .5 }}>
                    {(drafts[t.id] ?? '').length} / 1500
                  </span>
                  <button
                    type="button"
                    className="dc-btn-ghost"
                    style={{ fontSize: '.7rem', padding: '.15rem .5rem' }}
                    disabled={!dirty || saving === t.id}
                    onClick={() => save(t.id)}
                  >
                    {saving === t.id ? 'Saving…' : dirty ? 'Save' : 'Saved'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function GradeTradesButton({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [showWarnings, setShowWarnings] = useState(false)
  const [lastAction, setLastAction] = useState<'grade' | 'regrade' | 'letters' | 'verdict' | 'refresh' | null>(null)
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

  // Letters only: same route, no model call behind it.
  async function reletter() {
    setState('working')
    setMsg(null); setWarnings([])
    setLastAction('letters')
    try {
      const res = await fetch(`/api/leagues/${leagueId}/grade-trades/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: count, lettersOnly: true }),
      })
      const body = await res.json()
      if (!res.ok) {
        setState('error')
        setMsg(body?.error ?? 'Re-letter failed')
        return
      }
      setState('done')
      setMsg(letterMessage(body.scanned ?? 0, body.graded ?? 0))
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
        <button onClick={() => grade(false)} disabled={busy} className="dc-btn" title="AI: writes the write-up and the letters for trades that have no grade yet. Skips anything already graded.">
          {busy && lastAction === 'grade' ? 'Grading…' : `Grade ${nLabel}`}
        </button>
        <button onClick={() => grade(true)} disabled={busy} className="dc-btn-ghost" title="AI: a brand new write-up AND new letters, overwriting both. Use after tuning the prompt.">
          {busy && lastAction === 'regrade' ? 'Re-grading…' : `Re-grade ${nLabel}`}
        </button>
        <button onClick={reletter} disabled={busy} className="dc-btn-ghost" title="No AI: recomputes only the letter grades from the player values. The write-up is left exactly as it is.">
          {busy && lastAction === 'letters' ? 'Working…' : `Letters only ${nLabel}`}
        </button>
        <button onClick={verdict} disabled={busy} className="dc-btn-ghost" title="Run the 4-week verdict on graded trades (test mode, no waiting)">
          {busy && lastAction === 'verdict' ? 'Revisiting…' : `Verdict ${nLabel}`}
        </button>
        <button onClick={refreshValues} disabled={busy} className="dc-btn-ghost" title="Pull the latest Sleeper player values into the grader. The weekly cron does this automatically; this button is for one-off testing.">
          {busy && lastAction === 'refresh' ? 'Refreshing…' : 'Refresh values'}
        </button>
      </div>
      {/* Which buttons cost an AI call, in the layout rather than in a
          tooltip: the difference between "Re-grade" and "Letters only" is the
          whole point of having both, and it should not need a hover. */}
      <p style={{ margin: 0, fontSize: '.68rem', opacity: .6, textAlign: 'right', maxWidth: '30rem', lineHeight: 1.5 }}>
        Grade and Re-grade both call the AI and write a new write-up plus new letters.
        Letters only recomputes the letters from the player values and leaves the write-up alone.
      </p>
      <WriteUpEditor leagueId={leagueId} count={count} />
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
