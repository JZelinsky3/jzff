'use client'

// Champions by year. Every season on file gets a row with its champion,
// runner-up and third place, so a commissioner can see at a glance which
// years have no winner and fill them in. Only the champion is required; the
// other two stay blank when nobody remembers. New years (before the league
// was on any platform) are added at the bottom. See savePodium in ./actions.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { LeaguePerson } from '@/lib/manualImport'
import { savePodium, type PodiumPick } from './actions'

export type PodiumSeason = {
  year: number
  champion: string | null
  runnerUp: string | null
  third: string | null
  /** The season being played now: no champion yet, and not a gap. */
  live: boolean
  /** Standings are on file, so this year already has a full table. */
  hasStandings: boolean
  /** A person set this podium; syncs leave it alone. */
  handEntered: boolean
}

// A select value: a manager id, '' for unknown, or 'new' to type a name.
type Choice = { value: string; newName: string }
const fromId = (id: string | null): Choice => ({ value: id ?? '', newName: '' })
const toPick = (c: Choice): PodiumPick =>
  c.value === 'new' ? (c.newName.trim() ? { newName: c.newName.trim() } : null)
  : c.value ? { managerId: c.value }
  : null

const PLACES = [
  { key: 'champion', label: 'Champion' },
  { key: 'runnerUp', label: 'Runner-up' },
  { key: 'third', label: 'Third' },
] as const
type PlaceKey = (typeof PLACES)[number]['key']

export function PodiumBoard({
  leagueId,
  seasons,
  people,
}: {
  leagueId: string
  seasons: PodiumSeason[]
  /** One per person, labelled with the name the league uses for them. */
  people: LeaguePerson[]
}) {
  // A season can name any of a person's accounts; the pickers hold one per
  // person, so read every stored id as that person's picker id.
  const personOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of people) for (const id of p.managerIds) map.set(id, p.id)
    return map
  }, [people])

  // Years added on this page that are not saved yet. Once saved they arrive
  // back from the server as ordinary seasons.
  const [added, setAdded] = useState<number[]>([])
  const [newYear, setNewYear] = useState('')
  const [yearError, setYearError] = useState<string | null>(null)

  const known = useMemo(() => new Set(seasons.map((s) => s.year)), [seasons])
  const rows: PodiumSeason[] = useMemo(() => {
    const drafts = added
      .filter((y) => !known.has(y))
      .map((year) => ({ year, champion: null, runnerUp: null, third: null, live: false, hasStandings: false, handEntered: false }))
    const asPerson = (id: string | null) => (id ? personOf.get(id) ?? id : null)
    return [...seasons, ...drafts]
      .map((s) => ({ ...s, champion: asPerson(s.champion), runnerUp: asPerson(s.runnerUp), third: asPerson(s.third) }))
      .sort((a, b) => b.year - a.year)
  }, [seasons, added, known, personOf])

  const finished = seasons.filter((s) => !s.live)
  const missing = finished.filter((s) => !s.champion).length
  const earliest = rows.length > 0 ? rows[rows.length - 1].year : new Date().getFullYear() - 1

  function addYear() {
    const y = Number(newYear || earliest - 1)
    if (!Number.isInteger(y) || y < 1980 || y > 2100) { setYearError('Pick a year between 1980 and 2100.'); return }
    if (known.has(y) || added.includes(y)) { setYearError(`${y} is already on the list.`); return }
    setAdded((prev) => [...prev, y])
    setNewYear('')
    setYearError(null)
  }

  return (
    <div className="dc-field">
      <p className="dc-checkbox-hint" style={{ marginTop: 0 }}>
        {seasons.length === 0
          ? 'No seasons on file yet. Add a year below to start the list.'
          : missing === 0
          ? `All ${finished.length} finished seasons have a champion.`
          : `${missing} of ${finished.length} finished seasons have no champion on file.`}
      </p>

      <div className="lo-entry">
        <table>
          <thead>
            <tr>
              <th style={{ paddingLeft: '.6rem' }}>Year</th>
              {PLACES.map((p) => <th key={p.key}>{p.label}</th>)}
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              // Keyed on the stored podium too, so a change made elsewhere on
              // the page (clearing it below) resets the row to what is saved.
              <PodiumRow
                key={`${s.year}|${s.champion}|${s.runnerUp}|${s.third}|${s.handEntered}`}
                leagueId={leagueId}
                season={s}
                people={people}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', marginTop: '.6rem', flexWrap: 'wrap' }}>
        <input
          className="dc-input mono"
          value={newYear}
          onChange={(e) => { setNewYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4)); setYearError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') addYear() }}
          inputMode="numeric"
          placeholder={String(earliest - 1)}
          aria-label="Year to add"
          style={{ width: '6.5rem', padding: '.55rem .7rem' }}
        />
        <button type="button" className="lo-btn-ghost sm" onClick={addYear}>Add a year</button>
        {yearError && <span className="dc-form-error">{yearError}</span>}
      </div>
      <span className="dc-checkbox-hint">
        Only the champion is needed. Leave runner-up or third blank if nobody
        remembers. A year with a champion counts in the record book, title
        counts and the season archive, even with no standings.
      </span>
    </div>
  )
}

function PodiumRow({
  leagueId,
  season,
  people,
}: {
  leagueId: string
  season: PodiumSeason
  people: LeaguePerson[]
}) {
  const router = useRouter()
  const [saved, setSaved] = useState({ champion: season.champion, runnerUp: season.runnerUp, third: season.third })
  const [choices, setChoices] = useState<Record<PlaceKey, Choice>>({
    champion: fromId(season.champion),
    runnerUp: fromId(season.runnerUp),
    third: fromId(season.third),
  })
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const dirty = PLACES.some((p) => choices[p.key].value !== (saved[p.key] ?? ''))
  const hasChampion = !!toPick(choices.champion)
  const set = (key: PlaceKey, next: Partial<Choice>) => {
    setChoices((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }))
    setStatus(null)
  }

  function save() {
    startTransition(async () => {
      const res = await savePodium({
        leagueId,
        year: season.year,
        champion: toPick(choices.champion),
        runnerUp: toPick(choices.runnerUp),
        third: toPick(choices.third),
      })
      if (!res.ok) { setStatus({ ok: false, text: res.error }); return }
      setSaved(res.ids)
      setChoices({ champion: fromId(res.ids.champion), runnerUp: fromId(res.ids.runnerUp), third: fromId(res.ids.third) })
      setStatus({ ok: true, text: 'Saved' })
      // New managers and the "Entered by hand" list both come from the server.
      router.refresh()
    })
  }

  const note =
    status ? status.text
    : !saved.champion && season.live ? 'In progress'
    : !saved.champion ? 'No champion'
    : season.handEntered ? 'Entered by hand'
    : season.hasStandings ? 'From standings'
    : null

  return (
    <tr>
      <td className="mono" style={{ paddingLeft: '.6rem', whiteSpace: 'nowrap', color: saved.champion || season.live ? undefined : 'var(--accent)' }}>
        {season.year}
      </td>
      {PLACES.map((p) => (
        <td key={p.key}>
          <div style={{ display: 'grid', gap: '.25rem' }}>
            <select
              className="dc-select"
              value={choices[p.key].value}
              onChange={(e) => set(p.key, { value: e.target.value })}
              aria-label={`${season.year} ${p.label}`}
              style={{ width: '12.5rem', padding: '.45rem 2rem .45rem .55rem', fontSize: '.84rem', backgroundPosition: 'right .6rem center' }}
            >
              <option value="">{p.key === 'champion' ? 'Pick the champion' : 'Unknown'}</option>
              {/* Hidden profiles (test accounts) stay out unless this year already names one. */}
              {people.filter((m) => !m.hidden || m.id === choices[p.key].value).map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
              <option value="new">Someone not listed</option>
            </select>
            {choices[p.key].value === 'new' && (
              <input
                className="dc-input"
                value={choices[p.key].newName}
                onChange={(e) => set(p.key, { newName: e.target.value })}
                placeholder="Their name"
                aria-label={`${season.year} ${p.label} name`}
                style={{ width: '12.5rem', padding: '.45rem .55rem', fontSize: '.84rem' }}
              />
            )}
          </div>
        </td>
      ))}
      <td style={{ whiteSpace: 'nowrap', paddingRight: '.6rem' }}>
        {dirty ? (
          <button type="button" className="lo-btn sm" disabled={pending || !hasChampion} onClick={save}>
            {pending ? 'Saving' : 'Save'}
          </button>
        ) : (
          note && (
            <span
              className="dc-checkbox-hint"
              style={{ margin: 0, color: status && !status.ok ? '#d08a76' : !saved.champion && !season.live ? 'var(--accent)' : undefined }}
            >
              {note}
            </span>
          )
        )}
        {dirty && status && !status.ok && (
          <div className="dc-form-error" style={{ marginTop: '.3rem', whiteSpace: 'normal', maxWidth: '14rem' }}>{status.text}</div>
        )}
      </td>
    </tr>
  )
}
