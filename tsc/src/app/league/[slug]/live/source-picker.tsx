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
  return s.label ? `${base} — ${s.label}` : base
}

export function SourcePicker({ leagueId, sources }: { leagueId: string; sources: SourceRow[] }) {
  const router = useRouter()
  const initial = sources.find((s) => s.is_live)?.id ?? ''
  const [selected, setSelected] = useState<string>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (sources.length === 0) {
    return (
      <div className="dc-empty">
        <div className="dc-empty-text">No sources yet — add one on the Sources page first.</div>
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
    <div className="card" style={{ padding: '1rem 1.25rem' }}>
      <p style={{ marginTop: 0, marginBottom: '.85rem', fontSize: '.82rem', opacity: 0.65 }}>
        The weekly cron re-syncs only the live source. History sources don&apos;t change, so they stay synced-once.
      </p>
      <div className="dc-stack" style={{ gap: '.4rem', marginBottom: '1rem' }}>
        <label style={{ display: 'flex', gap: '.6rem', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="radio"
            name="live-source"
            value=""
            checked={selected === ''}
            onChange={() => setSelected('')}
            style={{ transform: 'scale(1.15)' }}
          />
          <span style={{ fontFamily: 'var(--serif)', fontSize: '.95rem', opacity: 0.75 }}>
            None — no weekly sync
          </span>
        </label>
        {sources.map((s) => (
          <label key={s.id} style={{ display: 'flex', gap: '.6rem', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="radio"
              name="live-source"
              value={s.id}
              checked={selected === s.id}
              onChange={() => setSelected(s.id)}
              style={{ transform: 'scale(1.15)' }}
            />
            <span style={{ fontFamily: 'var(--serif)', fontSize: '1rem' }}>
              {sourceLabel(s)}
              {s.is_live && (
                <span
                  className="text-mono text-cream-mute"
                  style={{ marginLeft: '.6rem', fontSize: '.55rem', letterSpacing: '.18em', textTransform: 'uppercase' }}
                >
                  Live source
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      {err && <p className="dc-form-error" style={{ marginBottom: '.75rem' }}>{err}</p>}

      <button onClick={onSubmit} disabled={!dirty || busy} className="dc-btn">
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
