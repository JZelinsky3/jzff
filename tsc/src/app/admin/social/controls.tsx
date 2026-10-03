'use client'

import { useState, useTransition } from 'react'
import { textProblem, xLength, X_MAX, THREADS_MAX } from '@/lib/social/config'
import { checkConnections, planNext, saveTexts, sendNow, setVetoed } from './actions'

const mono: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.15em', textTransform: 'uppercase' }
const btn: React.CSSProperties = { fontSize: '.65rem', padding: '.35rem .75rem' }
const area: React.CSSProperties = {
  width: '100%', minHeight: '7.5rem', background: 'rgba(0,0,0,.25)', color: 'var(--cream)',
  border: '1px solid var(--ink-line)', padding: '.6rem .7rem', fontSize: '.85rem', lineHeight: 1.45, resize: 'vertical',
}

function Err({ msg }: { msg: string | null }) {
  return msg ? <div style={{ color: 'rgba(220,120,80,.9)', fontSize: '.72rem', marginTop: '.4rem' }}>{msg}</div> : null
}

export function PostControls({ id, status, xText, threadsText, live }: {
  id: string
  status: string
  xText: string | null
  threadsText: string | null
  live: boolean
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [armed, setArmed] = useState(false)
  const [x, setX] = useState(xText ?? '')
  const [th, setTh] = useState(threadsText ?? '')

  const open = status === 'queued' || status === 'vetoed'
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null)
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'Failed.')
      else after?.()
    })

  if (!open) return null

  if (editing) {
    const xBad = textProblem('x', x)
    const thBad = textProblem('threads', th)
    return (
      <div style={{ display: 'grid', gap: '.6rem', marginTop: '.8rem' }}>
        <label style={{ display: 'grid', gap: '.3rem' }}>
          <span style={{ ...mono, color: xBad ? 'rgba(220,120,80,.9)' : 'var(--gold)' }}>X · {xLength(x)}/{X_MAX}</span>
          <textarea value={x} onChange={(e) => setX(e.target.value)} style={area} />
        </label>
        <label style={{ display: 'grid', gap: '.3rem' }}>
          <span style={{ ...mono, color: thBad ? 'rgba(220,120,80,.9)' : 'var(--gold)' }}>Threads · {th.length}/{THREADS_MAX}</span>
          <textarea value={th} onChange={(e) => setTh(e.target.value)} style={{ ...area, minHeight: '10rem' }} />
        </label>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button type="button" className="dc-btn" style={btn} disabled={pending || !!xBad || !!thBad}
            onClick={() => run(() => saveTexts(id, x, th), () => setEditing(false))}>
            {pending ? 'Saving' : 'Save'}
          </button>
          <button type="button" className="dc-btn-ghost" style={btn} disabled={pending}
            onClick={() => { setX(xText ?? ''); setTh(threadsText ?? ''); setEditing(false) }}>
            Cancel
          </button>
        </div>
        <Err msg={error} />
      </div>
    )
  }

  return (
    <div style={{ marginTop: '.8rem' }}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        {status === 'queued' ? (
          <button type="button" className="dc-btn-ghost" style={btn} disabled={pending} onClick={() => run(() => setVetoed(id, true))}>
            Veto
          </button>
        ) : (
          <button type="button" className="dc-btn-ghost" style={btn} disabled={pending} onClick={() => run(() => setVetoed(id, false))}>
            Un-veto
          </button>
        )}
        {xText ? (
          <button type="button" className="dc-btn-ghost" style={btn} disabled={pending} onClick={() => setEditing(true)}>
            Edit copy
          </button>
        ) : null}
        {status === 'queued' && live ? (
          armed ? (
            <button type="button" className="dc-btn" style={btn} disabled={pending}
              onClick={() => run(() => sendNow(id), () => setArmed(false))}>
              {pending ? 'Sending' : 'Post it to both now'}
            </button>
          ) : (
            <button type="button" className="dc-btn-ghost" style={btn} disabled={pending} onClick={() => setArmed(true)}>
              Send now
            </button>
          )
        ) : null}
      </div>
      <Err msg={error} />
    </div>
  )
}

export function QueueTools() {
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  return (
    <div style={{ display: 'grid', gap: '.5rem', justifyItems: 'center' }}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button type="button" className="dc-btn-ghost" style={btn} disabled={pending}
          onClick={() => start(async () => {
            setNote(null)
            const r = await planNext()
            setNote(r.ok
              ? (r.results ?? []).map((p) => `${p.plan_key}: ${p.outcome}${p.detail && p.outcome !== 'planned' ? ` (${p.detail})` : ''}`).join('\n')
              : r.error ?? 'Failed.')
          })}>
          Plan next week
        </button>
        <button type="button" className="dc-btn-ghost" style={btn} disabled={pending}
          onClick={() => start(async () => {
            setNote(null)
            const r = await checkConnections()
            setNote(r.ok ? `X: ${r.x}\nThreads: ${r.threads}` : r.error ?? 'Failed.')
          })}>
          Check connections
        </button>
      </div>
      {pending ? <div style={{ ...mono, opacity: 0.6 }}>Working</div> : null}
      {note ? <pre style={{ fontSize: '.72rem', color: 'var(--cream-soft)', whiteSpace: 'pre-wrap', textAlign: 'left', margin: 0 }}>{note}</pre> : null}
    </div>
  )
}
