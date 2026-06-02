'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setGotw } from './actions'

export type GotwMatchup = {
  id: string
  label: string
  managerA: string
  managerB: string
}

export type GotwWeek = {
  week: number
  matchups: GotwMatchup[]
}

// Multi-week GOTW setup. Lets the commish pre-pick a Game of the Week for any
// week in the live season, with a running tally showing how many GOTWs each
// manager has been featured in. Tally updates optimistically as they choose
// (one click flips two managers — both sides of the matchup).
export function GotwPicker({
  leagueId,
  seasonId,
  defaultWeek,
  weeks,
  currentGotw,
  managers,
}: {
  leagueId: string
  seasonId: string
  defaultWeek: number | null
  weeks: GotwWeek[]
  currentGotw: Record<string, string>
  managers: string[]
}) {
  const router = useRouter()
  const fallbackWeek = weeks[0]?.week ?? 1
  const [activeWeek, setActiveWeek] = useState<number>(defaultWeek ?? fallbackWeek)
  const [picks, setPicks] = useState<Record<string, string>>(currentGotw)
  const [busy, setBusy] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const active = weeks.find((w) => w.week === activeWeek)
  const selected = picks[String(activeWeek)] ?? ''

  // Tally derived from picks + matchup roster. One GOTW = +1 for each of the
  // two managers in the chosen matchup.
  const tally = useMemo(() => {
    const counts = new Map<string, number>()
    for (const name of managers) counts.set(name, 0)
    for (const w of weeks) {
      const id = picks[String(w.week)]
      if (!id) continue
      const m = w.matchups.find((x) => x.id === id)
      if (!m) continue
      counts.set(m.managerA, (counts.get(m.managerA) ?? 0) + 1)
      counts.set(m.managerB, (counts.get(m.managerB) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [picks, weeks, managers])

  function onSelect(matchupId: string) {
    setPicks((p) => {
      const next = { ...p }
      if (matchupId) next[String(activeWeek)] = matchupId
      else delete next[String(activeWeek)]
      return next
    })
  }

  async function onSave() {
    if (!active) return
    setBusy(activeWeek); setErr(null)
    const r = await setGotw(leagueId, seasonId, activeWeek, picks[String(activeWeek)] ?? null)
    setBusy(null)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  }

  const dirty = (picks[String(activeWeek)] ?? '') !== (currentGotw[String(activeWeek)] ?? '')

  if (weeks.length === 0) {
    return (
      <div className="dc-empty">
        <div className="dc-empty-text">No matchups on file yet — sync the season first.</div>
      </div>
    )
  }

  return (
    <div className="dc-gotw">
      <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
        <div className="dc-field" style={{ marginBottom: '1rem' }}>
          <label className="dc-label">Week</label>
          <select
            className="dc-select"
            value={activeWeek}
            onChange={(e) => setActiveWeek(Number(e.target.value))}
          >
            {weeks.map((w) => {
              const saved = currentGotw[String(w.week)]
              return (
                <option key={w.week} value={w.week}>
                  Week {w.week}{saved ? '  ★ set' : ''}
                </option>
              )
            })}
          </select>
        </div>

        {active && active.matchups.length === 0 ? (
          <div className="dc-empty">
            <div className="dc-empty-text">No matchups on file for Week {activeWeek}.</div>
          </div>
        ) : (
          <div className="dc-stack" style={{ gap: '.4rem', marginBottom: '1rem' }}>
            <label style={{ display: 'flex', gap: '.6rem', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                name="gotw"
                value=""
                checked={selected === ''}
                onChange={() => onSelect('')}
                style={{ transform: 'scale(1.15)' }}
              />
              <span style={{ fontFamily: 'var(--serif)', fontSize: '.95rem', opacity: 0.75 }}>
                No Game of the Week
              </span>
            </label>
            {active?.matchups.map((m) => (
              <label key={m.id} style={{ display: 'flex', gap: '.6rem', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="gotw"
                  value={m.id}
                  checked={selected === m.id}
                  onChange={() => onSelect(m.id)}
                  style={{ transform: 'scale(1.15)' }}
                />
                <span style={{ fontFamily: 'var(--serif)', fontSize: '1rem' }}>
                  {m.label}
                  {m.id === (currentGotw[String(activeWeek)] ?? '') && (
                    <span
                      className="text-mono text-cream-mute"
                      style={{ marginLeft: '.6rem', fontSize: '.55rem', letterSpacing: '.18em', textTransform: 'uppercase' }}
                    >
                      Saved
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}

        {err && <p className="dc-form-error" style={{ marginBottom: '.75rem' }}>{err}</p>}

        <button onClick={onSave} disabled={!dirty || busy != null} className="dc-btn">
          {busy === activeWeek ? 'Saving…' : `Save Week ${activeWeek}`}
        </button>
      </div>

      <aside className="card" style={{ padding: '1.25rem 1.5rem' }}>
        <div
          style={{
            fontFamily: 'var(--mono)', fontSize: '.6rem',
            letterSpacing: '.22em', textTransform: 'uppercase',
            color: 'var(--gold)', marginBottom: '.85rem',
          }}
        >
          GOTW tally · season-to-date
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '.35rem' }}>
          {tally.map(([name, n]) => (
            <li
              key={name}
              style={{
                display: 'flex', justifyContent: 'space-between',
                fontFamily: 'var(--serif)', fontSize: '.95rem',
                color: n > 0 ? 'var(--cream)' : 'var(--cream-mute)',
                padding: '.25rem 0',
                borderBottom: '1px dotted var(--ink-line)',
              }}
            >
              <span>{name}</span>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '.85rem',
                color: n > 0 ? 'var(--gold)' : 'var(--cream-mute)',
              }}>{n}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
