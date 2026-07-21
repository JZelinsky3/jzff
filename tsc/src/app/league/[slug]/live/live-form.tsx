'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChapterEdits } from '@/app/league/[slug]/chapter-book'
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

// The Tuesday after Labor Day, as YYYY-MM-DD.
//
// Anchoring on a Tuesday rather than the opening game is deliberate:
// resolveCurrentWeek counts forward in 7-day steps from this date, so
// whatever weekday it lands on is the day the week rolls over. Fantasy
// weeks turn over after Monday Night Football, so Tuesday is correct.
// It also makes the default robust to the opener moving between
// Wednesday and Thursday, since both share the same preceding Tuesday.
//
// Built in UTC because the stored value is a bare date and
// resolveCurrentWeek reads it with Date.parse, which treats YYYY-MM-DD
// as UTC midnight. Doing this in local time drifts a day either side.
function nflWeekOneTuesday(year: number): string {
  const d = new Date(Date.UTC(year, 8, 1)) // September 1
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1) // Labor Day
  d.setUTCDate(d.getUTCDate() + 1) // the Tuesday after it
  return d.toISOString().slice(0, 10)
}

function prettyDate(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return iso
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
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

  async function onSubmit(): Promise<boolean> {
    setBusy(true); setErr(null)
    const weekNum = selected && week.trim() ? Number(week) : null
    if (selected && weekNum != null && (!Number.isInteger(weekNum) || weekNum < 1 || weekNum > 25)) {
      setBusy(false); setErr('Week override must be a whole number between 1 and 25.')
      return false
    }
    const date = selected && startDate.trim() ? startDate : null
    const r = await setLiveSeason(leagueId, selected || null, weekNum, date)
    setBusy(false)
    if (!r.ok) { setErr(r.error); return false }
    router.refresh()
    return true
  }

  // Offered for whichever season is currently selected, so the default
  // tracks the year you're marking live rather than today's date.
  const selectedYear = seasons.find((s) => s.id === selected)?.year ?? null
  const suggestedStart = selectedYear != null ? nflWeekOneTuesday(selectedYear) : null

  const dirty = selected !== initialSeason || week !== initialWeek || startDate !== initialDate

  // Registered before the empty-state early return so the hook order is
  // stable across renders.
  useChapterEdits('season', dirty, onSubmit)

  if (seasons.length === 0) {
    return (
      <div className="lo-empty"><div className="lo-empty-text">No seasons yet. Sync a source first.</div></div>
    )
  }

  return (
    <div className="lo-form-card">
      <div className="lo-pick" style={{ marginBottom: '1.1rem' }}>
        <label className="lo-pick-row">
          <input
            type="radio"
            name="live"
            value=""
            checked={selected === ''}
            onChange={() => setSelected('')}
          />
          <span className="lo-pick-label muted">Off-season (no live)</span>
        </label>
        {seasons.map((s) => (
          <label key={s.id} className="lo-pick-row">
            <input
              type="radio"
              name="live"
              value={s.id}
              checked={selected === s.id}
              onChange={() => setSelected(s.id)}
            />
            <span className="lo-pick-label">
              {s.year}
              {s.is_live && <span className="lo-tag live">Currently live</span>}
            </span>
          </label>
        ))}
      </div>

      {selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem', marginBottom: '1.1rem', paddingTop: '.2rem' }}>
          <label style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="text-mono" style={{ ...labelStyle, minWidth: '7rem' }}>Week 1 begins</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ ...inputStyle, width: '11rem' }}
            />
            {suggestedStart && suggestedStart !== startDate && (
              <button
                type="button"
                className="lo-btn-ghost xs"
                onClick={() => setStartDate(suggestedStart)}
              >
                Use {prettyDate(suggestedStart)}
              </button>
            )}
            <span style={{ fontSize: '.75rem', opacity: 0.5, flexBasis: '100%' }}>
              Not your draft date. This is the day fantasy Week 1 opens, and it
              is what makes the current week advance on its own, one per 7 days.
              Pick the Tuesday before the season&apos;s first game, so the week
              rolls over after Monday night. Leave it blank and there is no
              current week at all unless you pin one below.
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

      {err && <p className="lo-msg-err" style={{ marginBottom: '.75rem' }}>{err}</p>}

      <button onClick={onSubmit} disabled={!dirty || busy} className="lo-btn">
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
