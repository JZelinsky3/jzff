'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateRivalry, deleteRivalry } from './actions'

export type FeudManager = { id: string; name: string }

export type Feud = {
  id: string
  name: string | null
  managerAId: string
  managerBId: string
  aName: string
  bName: string
}

// One rivalry on the ledger. Reads as a fight card; clicking Edit swaps the
// row in place for a small form so a typo or a wrong manager can be fixed
// without deleting and re-forging the whole thing.
export function FeudRow({
  feud,
  index,
  leagueId,
  slug,
  managers,
}: {
  feud: Feud
  index: number
  leagueId: string
  slug: string
  managers: FeudManager[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [a, setA] = useState(feud.managerAId)
  const [b, setB] = useState(feud.managerBId)
  const [name, setName] = useState(feud.name ?? '')
  const [busy, setBusy] = useState<'saving' | 'deleting' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  function cancel() {
    setA(feud.managerAId)
    setB(feud.managerBId)
    setName(feud.name ?? '')
    setErr(null)
    setEditing(false)
  }

  async function save() {
    if (!name.trim()) { setErr('Give the feud a name.'); return }
    if (a === b) { setErr('Pick two different managers.'); return }
    setBusy('saving'); setErr(null)
    const r = await updateRivalry({ rivalryId: feud.id, leagueId, managerA: a, managerB: b, name: name.trim() })
    setBusy(null)
    if (!r.ok) { setErr(r.error); return }
    setEditing(false)
    router.refresh()
  }

  async function remove() {
    if (!confirm(`Delete "${feud.name ?? 'this rivalry'}"? This can't be undone.`)) return
    setBusy('deleting'); setErr(null)
    await deleteRivalry(feud.id, slug)
    setBusy(null)
    router.refresh()
  }

  if (editing) {
    return (
      <div className="lo-feud is-editing">
        <span className="lo-feud-no" aria-hidden>{index + 1}</span>
        <div style={{ minWidth: 0 }}>
          <div className="dc-field" style={{ marginBottom: '.7rem' }}>
            <label className="dc-label">Rivalry name</label>
            <input
              className="dc-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Snake Draft Bowl"
            />
          </div>
          <div className="dc-grid-2">
            <div className="dc-field">
              <label className="dc-label">Manager A</label>
              <select className="dc-select" value={a} onChange={(e) => setA(e.target.value)}>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="dc-field">
              <label className="dc-label">Manager B</label>
              <select className="dc-select" value={b} onChange={(e) => setB(e.target.value)}>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          {err && <p className="lo-msg-err" style={{ marginTop: '.7rem' }}>{err}</p>}
          <div style={{ display: 'flex', gap: '.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button type="button" className="lo-btn sm" onClick={save} disabled={busy !== null}>
              {busy === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" className="lo-btn-ghost sm" onClick={cancel} disabled={busy !== null}>
              Cancel
            </button>
          </div>
        </div>
        <div className="lo-feud-actions" />
      </div>
    )
  }

  return (
    <div className="lo-feud">
      <span className="lo-feud-no" aria-hidden>{index + 1}</span>
      <div style={{ minWidth: 0 }}>
        <div className="lo-feud-name">{feud.name}</div>
        <div className="lo-feud-pair">
          <span className="side">{feud.aName}</span>
          <span className="rule" aria-hidden />
          <span className="vs">vs</span>
          <span className="rule r" aria-hidden />
          <span className="side">{feud.bName}</span>
        </div>
      </div>
      {/* Ruled off from the bout line so Delete isn't sitting flush against
          the second manager's name. */}
      <div className="lo-feud-actions">
        <button type="button" className="lo-btn-ghost xs" onClick={() => setEditing(true)} disabled={busy !== null}>
          Edit
        </button>
        <button type="button" className="lo-btn-quiet" onClick={remove} disabled={busy !== null}>
          {busy === 'deleting' ? '…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
