'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setLiveSource } from './actions'

export type SourceRow = {
  id: string
  platform: string
  external_id: string
  label: string | null
  is_live: boolean
}

function sourceLabel(s: SourceRow): string {
  const base = `${s.platform.toUpperCase()} · ${s.external_id}`
  return s.label ? `${base} · ${s.label}` : base
}

export function SourcePicker({ leagueId, sources }: { leagueId: string; sources: SourceRow[] }) {
  const router = useRouter()
  const initial = sources.find((s) => s.is_live)?.id ?? ''
  const [selected, setSelected] = useState<string>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (sources.length === 0) {
    return (
      <div className="lo-empty">
        <div className="lo-empty-text">No sources yet. Add one on the Sources page first.</div>
      </div>
    )
  }

  async function onSubmit() {
    setBusy(true); setErr(null)
    const r = await setLiveSource(leagueId, selected || null)
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  }

  const dirty = selected !== initial

  return (
    <div className="lo-form-card">
      <p style={{ marginTop: 0, marginBottom: '1rem', fontSize: '.85rem', color: 'var(--cream-soft)', lineHeight: 1.6 }}>
        The weekly cron re-syncs only the live source. History sources don&apos;t change, so they stay synced-once.
      </p>
      <div className="lo-pick" style={{ marginBottom: '1.1rem' }}>
        <label className="lo-pick-row">
          <input
            type="radio"
            name="live-source"
            value=""
            checked={selected === ''}
            onChange={() => setSelected('')}
          />
          <span className="lo-pick-label muted">None (no weekly sync)</span>
        </label>
        {sources.map((s) => (
          <label key={s.id} className="lo-pick-row">
            <input
              type="radio"
              name="live-source"
              value={s.id}
              checked={selected === s.id}
              onChange={() => setSelected(s.id)}
            />
            <span className="lo-pick-label">
              {sourceLabel(s)}
              {s.is_live && <span className="lo-tag live">Live source</span>}
            </span>
          </label>
        ))}
      </div>

      {err && <p className="lo-msg-err" style={{ marginBottom: '.75rem' }}>{err}</p>}

      <button onClick={onSubmit} disabled={!dirty || busy} className="lo-btn">
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
