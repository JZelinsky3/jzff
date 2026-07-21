'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FeudRow, type Feud, type FeudManager } from './feud-row'
import { createRivalryInline } from './actions'

// The Feuds chapter as it reads inside the book: the ledger of existing
// rivalries plus an inline forge, so nothing has to leave the page. Both
// creating and editing commit immediately, which is why this chapter
// never registers unsaved state with the book.
export function FeudBoard({
  leagueId,
  slug,
  managers,
  feuds,
}: {
  leagueId: string
  slug: string
  managers: FeudManager[]
  feuds: Feud[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [name, setName] = useState('')
  const [autoName, setAutoName] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function forge() {
    if (!a || !b) { setErr('Pick two managers.'); return }
    if (a === b) { setErr('Pick two different managers.'); return }
    setBusy(true); setErr(null)
    const r = await createRivalryInline({
      leagueId,
      managerA: a,
      managerB: b,
      name: autoName ? undefined : (name.trim() || undefined),
      autoName,
    })
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    setA(''); setB(''); setName(''); setOpen(false)
    router.refresh()
  }

  return (
    <>
      {feuds.length === 0 ? (
        <div className="lo-empty">
          <div className="lo-empty-title">No rivalries yet.</div>
          <div className="lo-empty-text">Pair two managers and immortalize the grudge.</div>
        </div>
      ) : (
        <div className="lo-feud-list">
          {feuds.map((f, i) => (
            <FeudRow
              key={f.id}
              feud={f}
              index={i}
              leagueId={leagueId}
              slug={slug}
              managers={managers}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: '1.4rem' }}>
        {!open ? (
          <button type="button" className="lo-btn sm" onClick={() => setOpen(true)}>
            + Forge a rivalry
          </button>
        ) : (
          <div className="lo-form-card">
            <div className="dc-form">
              <div className="dc-grid-2">
                <div className="dc-field">
                  <label className="dc-label">Manager A</label>
                  <select className="dc-select" value={a} onChange={(e) => setA(e.target.value)}>
                    <option value="">Pick one…</option>
                    {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="dc-field">
                  <label className="dc-label">Manager B</label>
                  <select className="dc-select" value={b} onChange={(e) => setB(e.target.value)}>
                    <option value="">Pick one…</option>
                    {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>

              <label className="dc-checkbox-row">
                <input type="checkbox" checked={autoName} onChange={(e) => setAutoName(e.target.checked)} />
                <span>
                  Auto-name this rivalry
                  <span className="dc-checkbox-hint">We&apos;ll pick a title from a curated bank.</span>
                </span>
              </label>

              {!autoName && (
                <div className="dc-field">
                  <label className="dc-label">Rivalry name</label>
                  <input
                    className="dc-input"
                    placeholder="The Snake Draft Bowl"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}

              {err && <p className="lo-msg-err">{err}</p>}

              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
                <button type="button" className="lo-btn sm" onClick={forge} disabled={busy || !a || !b}>
                  {busy ? 'Forging…' : 'Forge the rivalry'}
                </button>
                <button
                  type="button"
                  className="lo-btn-ghost sm"
                  onClick={() => { setOpen(false); setErr(null) }}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
