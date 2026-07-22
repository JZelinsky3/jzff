'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setLiveSource } from '@/app/league/[slug]/live/actions'

export type SourceOption = {
  id: string
  platform: string
  external_id: string
  label: string | null
  is_live: boolean
}

export function MobileSourcePicker({
  leagueId,
  sources,
}: {
  leagueId: string
  sources: SourceOption[]
}) {
  const router = useRouter()
  const initial = sources.find((s) => s.is_live)?.id ?? ''
  const [selected, setSelected] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (sources.length === 0) {
    return <div className="mliv-card-empty">No sources yet. Add one on the Sources page first.</div>
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
    <div className="msp">
      <div
        className={`msp-option ${selected === '' ? 'active' : ''}`}
        onClick={() => setSelected('')}
      >
        <div className="msp-radio">{selected === '' && <div className="msp-radio-dot" />}</div>
        <div className="msp-option-body">
          <span className="msp-option-name">None</span>
          <span className="msp-option-desc">No weekly sync</span>
        </div>
      </div>
      {sources.map((s) => (
        <div
          key={s.id}
          className={`msp-option ${selected === s.id ? 'active' : ''} ${s.is_live ? 'current-live' : ''}`}
          onClick={() => setSelected(s.id)}
        >
          <div className="msp-radio">{selected === s.id && <div className="msp-radio-dot" />}</div>
          <div className="msp-option-body">
            <span className="msp-option-name">
              {s.label ?? s.external_id}
            </span>
            <span className="msp-option-desc">
              {s.platform.toUpperCase()} {s.label ? `· ${s.external_id}` : ''}
              {s.is_live && ' · Live'}
            </span>
          </div>
          {s.is_live && <span className="msp-live-dot" />}
        </div>
      ))}

      {err && <p className="dc-form-error" style={{ margin: '.5rem 0 0', fontSize: '.68rem' }}>{err}</p>}

      <button onClick={onSubmit} disabled={!dirty || busy} className="msp-save">
        {busy ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}
