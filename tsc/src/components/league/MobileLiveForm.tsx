'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setLiveSeason } from '@/app/league/[slug]/live/actions'

export type SeasonOption = { id: string; year: number; is_live: boolean }

export function MobileLiveForm({
  leagueId,
  seasons,
  weekOverride,
  seasonStartDate,
  resolvedWeek,
}: {
  leagueId: string
  seasons: SeasonOption[]
  weekOverride: number | null
  seasonStartDate: string | null
  resolvedWeek: number | null
}) {
  const router = useRouter()
  const initialSeason = seasons.find((s) => s.is_live)?.id ?? ''
  const initialWeek = weekOverride != null ? String(weekOverride) : ''
  const initialDate = seasonStartDate ?? ''
  const [selected, setSelected] = useState(initialSeason)
  const [week, setWeek] = useState(initialWeek)
  const [startDate, setStartDate] = useState(initialDate)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (seasons.length === 0) {
    return <div className="mliv-card-empty">No seasons yet. Sync a source first.</div>
  }

  async function onSubmit() {
    setBusy(true); setErr(null)
    const weekNum = selected && week.trim() ? Number(week) : null
    if (selected && weekNum != null && (!Number.isInteger(weekNum) || weekNum < 1 || weekNum > 25)) {
      setBusy(false); setErr('Week must be 1–25.')
      return
    }
    const date = selected && startDate.trim() ? startDate : null
    const r = await setLiveSeason(leagueId, selected || null, weekNum, date)
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  }

  const dirty = selected !== initialSeason || week !== initialWeek || startDate !== initialDate
  const selectedYear = seasons.find((s) => s.id === selected)?.year

  return (
    <div className="mlf">
      <div className="mlf-picker">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mlf-select"
        >
          <option value="">Off-season (no live)</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.year}{s.is_live ? ' ★' : ''}
            </option>
          ))}
        </select>
        {selectedYear && (
          <span className="mlf-selected-label">{selectedYear}</span>
        )}
      </div>

      {selected && (
        <div className="mlf-fields">
          <div className="mlf-field">
            <label className="mlf-field-label">Season starts</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mlf-input"
            />
            <span className="mlf-field-hint">Week auto-advances from this date</span>
          </div>
          <div className="mlf-field">
            <label className="mlf-field-label">Week override</label>
            <input
              type="number"
              min={1}
              max={25}
              value={week}
              onChange={(e) => setWeek(e.target.value)}
              placeholder="auto"
              className="mlf-input mlf-input-short"
            />
            <span className="mlf-field-hint">
              {resolvedWeek != null ? `Resolving to Week ${resolvedWeek}` : 'Leave blank for auto'}
            </span>
          </div>
        </div>
      )}

      {err && <p className="dc-form-error" style={{ margin: '.5rem 0 0', fontSize: '.68rem' }}>{err}</p>}

      <button onClick={onSubmit} disabled={!dirty || busy} className="mlf-save">
        {busy ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}
