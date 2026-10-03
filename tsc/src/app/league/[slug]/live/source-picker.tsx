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
  // Live, but it can't sync this NFL year. Listed only so it can be swapped.
  stale?: boolean
}

function sourceLabel(s: SourceRow): string {
  const base = `${s.platform.toUpperCase()} · ${s.external_id}`
  return s.label ? `${base} · ${s.label}` : base
}

export function SourcePicker({
  leagueId,
  sources,
  pastSources = [],
  year,
}: {
  leagueId: string
  // Sources that can sync this NFL year (plus whatever is live now). See
  // lib/liveChoices.
  sources: SourceRow[]
  // The rest. Site admins only.
  pastSources?: SourceRow[]
  year: number
}) {
  const router = useRouter()
  const initial = [...sources, ...pastSources].find((s) => s.is_live)?.id ?? ''
  const [selected, setSelected] = useState<string>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pastOpen] = useState(() => pastSources.some((s) => s.id === initial))

  if (sources.length === 0 && pastSources.length === 0) {
    return (
      <div className="lo-empty">
        <div className="lo-empty-text">
          None of your sources can sync {year}. Add this year&apos;s league on the Sources page.
        </div>
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

  const radio = (s: SourceRow) => (
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
        {s.stale && <span className="lo-tag">Can&apos;t sync {year}</span>}
      </span>
    </label>
  )

  return (
    <div className="lo-form-card">
      <p style={{ marginTop: 0, marginBottom: '1rem', fontSize: '.85rem', color: 'var(--cream-soft)', lineHeight: 1.6 }}>
        The weekly cron re-syncs only the live source. Listed here: the sources that can sync {year}.
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
        {sources.map(radio)}
        {sources.every((s) => s.stale) && (
          <div className="lo-pick-note">None of your sources can sync {year} yet. Add this year&apos;s league on the Sources page.</div>
        )}
        {pastSources.length > 0 && (
          <details className="lo-pick-more" open={pastOpen}>
            <summary>Other sources · site admin</summary>
            {pastSources.map(radio)}
          </details>
        )}
      </div>

      {err && <p className="lo-msg-err" style={{ marginBottom: '.75rem' }}>{err}</p>}

      <button onClick={onSubmit} disabled={!dirty || busy} className="lo-btn">
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
