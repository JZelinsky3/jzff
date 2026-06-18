'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setLiveSeason } from './actions'

export type SeasonRow = {
  id: string
  year: number
  is_live: boolean
}

const inputStyle: React.CSSProperties = {
  padding: '.3rem .5rem',
  background: 'var(--ink-soft, rgba(0,0,0,.2))',
  border: '1px solid var(--ink-line, rgba(255,255,255,.15))',
  borderRadius: '3px',
  color: 'var(--cream)',
  fontFamily: 'var(--mono)',
}
const labelStyle: React.CSSProperties = {
  fontSize: '.6rem',
  letterSpacing: '.18em',
  textTransform: 'uppercase',
  opacity: 0.7,
}

export function LiveSeasonForm({
  leagueId,
  seasons,
  weekOverride,
  seasonStartDate,
  resolvedWeek,
}: {
  leagueId: string
  seasons: SeasonRow[]
  weekOverride: number | null
  seasonStartDate: string | null
  resolvedWeek: number | null
}) {
  const router = useRouter()
  const initialSeason = seasons.find((s) => s.is_live)?.id ?? ''
  const initialWeek = weekOverride != null ? String(weekOverride) : ''
  const initialDate = seasonStartDate ?? ''
  const [selected, setSelected] = useState<string>(initialSeason)
  const [week, setWeek] = useState<string>(initialWeek)
  const [startDate, setStartDate] = useState<string>(initialDate)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (seasons.length === 0) {
    return (
      <div className="dc-empty"><div className="dc-empty-text">No seasons yet — sync a source first.</div></div>
    )
  }

  async function onSubmit() {
    setBusy(true); setErr(null)
    const weekNum = selected && week.trim() ? Number(week) : null
    if (selected && weekNum != null && (!Number.isInteger(weekNum) || weekNum < 1 || weekNum > 25)) {
      setBusy(false); setErr('Week override must be a whole number between 1 and 25.')
      return
    }
    const date = selected && startDate.trim() ? startDate : null
    const r = await setLiveSeason(leagueId, selected || null, weekNum, date)
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  }

  const dirty = selected !== initialSeason || week !== initialWeek || startDate !== initialDate

  return (
    <div className="card" style={{ padding: '1rem 1.25rem' }}>
      <div className="dc-stack" style={{ gap: '.4rem', marginBottom: '1rem' }}>
        <label style={{ display: 'flex', gap: '.6rem', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="radio"
            name="live"
            value=""
            checked={selected === ''}
            onChange={() => setSelected('')}
            style={{ transform: 'scale(1.15)' }}
          />
          <span style={{ fontFamily: 'var(--serif)', fontSize: '.95rem', opacity: 0.75 }}>
            Off-season (no live)
          </span>
        </label>
        {seasons.map((s) => (
          <label key={s.id} style={{ display: 'flex', gap: '.6rem', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="radio"
              name="live"
              value={s.id}
              checked={selected === s.id}
              onChange={() => setSelected(s.id)}
              style={{ transform: 'scale(1.15)' }}
            />
            <span style={{ fontFamily: 'var(--serif)', fontSize: '1rem' }}>
              {s.year}
              {s.is_live && (
                <span
                  className="text-mono text-cream-mute"
                  style={{ marginLeft: '.6rem', fontSize: '.55rem', letterSpacing: '.18em', textTransform: 'uppercase' }}
                >
                  Currently live
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      {selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem', marginBottom: '1rem' }}>
          <label style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="text-mono" style={{ ...labelStyle, minWidth: '7rem' }}>Season starts</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ ...inputStyle, width: '11rem' }}
            />
            <span style={{ fontSize: '.75rem', opacity: 0.5 }}>
              When your league&apos;s Week 1 opens — the week auto-advances 1 per 7 days from here
            </span>
          </label>
          <label style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="text-mono" style={{ ...labelStyle, minWidth: '7rem' }}>Week override</span>
            <input
              type="number"
              min={1}
              max={25}
              value={week}
              onChange={(e) => setWeek(e.target.value)}
              placeholder="auto"
              style={{ ...inputStyle, width: '5rem' }}
            />
            <span style={{ fontSize: '.75rem', opacity: 0.5 }}>
              Leave blank to auto-advance · fill to pin a specific week
              {resolvedWeek != null && <> · now resolving to <strong>Week {resolvedWeek}</strong></>}
            </span>
          </label>
        </div>
      )}

      {err && <p className="dc-form-error" style={{ marginBottom: '.75rem' }}>{err}</p>}

      <button onClick={onSubmit} disabled={!dirty || busy} className="dc-btn">
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
