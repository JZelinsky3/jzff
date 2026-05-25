'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setGotw } from './actions'

export type GotwMatchup = { id: string; label: string }

export function GotwPicker({
  leagueId,
  seasonId,
  week,
  matchups,
  currentGotwId,
}: {
  leagueId: string
  seasonId: string
  week: number
  matchups: GotwMatchup[]
  currentGotwId: string | null
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string>(currentGotwId ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (matchups.length === 0) {
    return (
      <div className="dc-empty">
        <div className="dc-empty-text">No matchups on file for Week {week} — sync the season first.</div>
      </div>
    )
  }

  async function onSubmit() {
    setBusy(true); setErr(null)
    const r = await setGotw(leagueId, seasonId, week, selected || null)
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  }

  const dirty = selected !== (currentGotwId ?? '')

  return (
    <div className="card" style={{ padding: '1rem 1.25rem' }}>
      <div className="dc-stack" style={{ gap: '.4rem', marginBottom: '1rem' }}>
        <label style={{ display: 'flex', gap: '.6rem', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="radio"
            name="gotw"
            value=""
            checked={selected === ''}
            onChange={() => setSelected('')}
            style={{ transform: 'scale(1.15)' }}
          />
          <span style={{ fontFamily: 'var(--serif)', fontSize: '.95rem', opacity: 0.75 }}>
            No Game of the Week
          </span>
        </label>
        {matchups.map((m) => (
          <label key={m.id} style={{ display: 'flex', gap: '.6rem', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="radio"
              name="gotw"
              value={m.id}
              checked={selected === m.id}
              onChange={() => setSelected(m.id)}
              style={{ transform: 'scale(1.15)' }}
            />
            <span style={{ fontFamily: 'var(--serif)', fontSize: '1rem' }}>
              {m.label}
              {m.id === currentGotwId && (
                <span
                  className="text-mono text-cream-mute"
                  style={{ marginLeft: '.6rem', fontSize: '.55rem', letterSpacing: '.18em', textTransform: 'uppercase' }}
                >
                  Current GOTW
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
