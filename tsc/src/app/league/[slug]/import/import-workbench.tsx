'use client'

// The hand-entry workbench. Parsing runs in the browser so the preview is
// instant and nothing is written until the user has seen exactly what will
// land, including which manager every team name resolved to. The server
// re-parses the same text when committing; this is a display, not the source
// of truth. See ./actions.ts.

import { useMemo, useRef, useState, useTransition } from 'react'
import {
  parseImport,
  matchNames,
  nameKey,
  KIND_LABELS,
  TEMPLATES,
  type ImportKind,
  type KnownManager,
  type StandingsRow,
  type DraftRow,
  type MatchupRow,
} from '@/lib/manualImport'
import { commitManualImport, removeManualImport } from './actions'

type ExistingImport = {
  id: string
  seasonId: string
  year: number
  kind: ImportKind
  rowCount: number
  createdAt: string
}

const KIND_HINTS: Record<ImportKind, string> = {
  standings: 'One row per team: record, points for and against, where they finished.',
  drafts: 'One row per pick: who picked, who they took, and where in the draft.',
  matchups: 'One row per game: week, both teams, both scores.',
}

export function ImportWorkbench({
  leagueId,
  slug,
  seasons,
  managers,
  existing,
}: {
  leagueId: string
  slug: string
  seasons: Array<{ id: string; year: number }>
  managers: KnownManager[]
  existing: ExistingImport[]
}) {
  const [kind, setKind] = useState<ImportKind>('standings')
  const [year, setYear] = useState<string>(String(seasons.at(-1)?.year ?? new Date().getFullYear() - 1))
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  // nameKey → manager id or 'new'. Only holds the user's explicit choices;
  // automatic matches are recomputed from the text every render.
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [result, setResult] = useState<
    | { ok: true; written: number; managersCreated: number; issues: string[] }
    | { ok: false; error: string }
    | null
  >(null)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const parsed = useMemo(() => (text.trim() ? parseImport(kind, text) : null), [kind, text])

  const matches = useMemo(() => {
    if (!parsed) return []
    return matchNames(parsed.teamNames, managers).map((m) => {
      const override = overrides[nameKey(m.name)]
      return override ? { ...m, managerId: override === 'new' ? null : override, via: 'none' as const, override } : { ...m, override: undefined }
    })
  }, [parsed, managers, overrides])

  // Every name needs an answer before anything can be written: an existing
  // manager, or an explicit "add as a new manager".
  const unresolved = matches.filter((m) => !m.managerId && overrides[nameKey(m.name)] !== 'new')
  const canSubmit = !!parsed && parsed.rows.length > 0 && unresolved.length === 0 && !pending

  function readFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => setText(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  function submit() {
    if (!parsed) return
    const mapping: Record<string, string> = {}
    for (const m of matches) {
      const key = nameKey(m.name)
      mapping[key] = overrides[key] ?? m.managerId ?? 'new'
    }
    startTransition(async () => {
      const res = await commitManualImport({
        leagueId,
        year: Number(year),
        kind,
        text,
        mapping,
        note,
      })
      setResult(res)
      if (res.ok) { setText(''); setOverrides({}); setNote('') }
    })
  }

  return (
    <div className="dc-form">
      {/* ── What kind of data ─────────────────────────────────────────── */}
      <div className="dc-field">
        <label className="dc-label">What are you entering</label>
        <div className="lo-tiles">
          {(['standings', 'drafts', 'matchups'] as ImportKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`lo-tile${kind === k ? ' on' : ''}`}
              onClick={() => { setKind(k); setResult(null) }}
            >
              <span className="lo-tile-name">{KIND_LABELS[k]}</span>
              <span className="lo-tile-sub">{k === 'standings' ? 'records + points' : k === 'drafts' ? 'pick by pick' : 'week by week'}</span>
            </button>
          ))}
        </div>
        <span className="dc-checkbox-hint">{KIND_HINTS[kind]}</span>
      </div>

      {/* ── Which season ──────────────────────────────────────────────── */}
      <div className="dc-field">
        <label className="dc-label" htmlFor="mi-year">Season</label>
        <input
          id="mi-year"
          className="dc-input mono"
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          inputMode="numeric"
          list="mi-years"
          style={{ maxWidth: '10rem' }}
        />
        <datalist id="mi-years">
          {seasons.map((s) => <option key={s.id} value={s.year} />)}
        </datalist>
        <span className="dc-checkbox-hint">
          {seasons.some((s) => String(s.year) === year)
            ? 'This season already exists; entering data replaces this stage of it.'
            : 'No season on file for that year yet. It will be created.'}
        </span>
      </div>

      {/* ── The data ──────────────────────────────────────────────────── */}
      <div className="dc-field">
        <label className="dc-label" htmlFor="mi-text">Paste rows, or drop a file</label>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const file = e.dataTransfer.files?.[0]
            if (file) readFile(file)
          }}
          style={{
            border: `1px dashed ${dragging ? 'var(--accent)' : 'var(--ink-line)'}`,
            padding: '.5rem',
            background: dragging ? 'var(--accent-wash)' : 'transparent',
          }}
        >
          <textarea
            id="mi-text"
            className="dc-input mono"
            value={text}
            onChange={(e) => { setText(e.target.value); setResult(null) }}
            rows={10}
            spellCheck={false}
            placeholder={TEMPLATES[kind]}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', marginTop: '.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="lo-btn sm" onClick={() => fileRef.current?.click()}>
            Choose a file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f) }}
          />
          <button type="button" className="lo-btn-ghost sm" onClick={() => { setText(TEMPLATES[kind]); setResult(null) }}>
            Fill in the example
          </button>
          {text && (
            <button type="button" className="lo-btn-ghost sm" onClick={() => { setText(''); setOverrides({}); setResult(null) }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── What was read ─────────────────────────────────────────────── */}
      {parsed && (
        <div className="dc-field">
          <label className="dc-label">What we read</label>
          <p className="dc-checkbox-hint" style={{ marginTop: 0 }}>
            {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} understood
            {parsed.issues.length > 0 ? `, ${parsed.issues.length} problem${parsed.issues.length === 1 ? '' : 's'}` : ''}.
          </p>

          {parsed.issues.length > 0 && (
            <ul className="dc-form-error" style={{ margin: '.4rem 0 .8rem', paddingLeft: '1.1rem' }}>
              {parsed.issues.slice(0, 12).map((issue, i) => (
                <li key={i}>{issue.line ? `Line ${issue.line}: ` : ''}{issue.message}</li>
              ))}
            </ul>
          )}

          {parsed.rows.length > 0 && (
            <div style={{ overflowX: 'auto', maxHeight: '18rem', overflowY: 'auto', border: '1px solid var(--ink-line)' }}>
              <PreviewTable parsed={parsed} />
            </div>
          )}
        </div>
      )}

      {/* ── Name mapping ──────────────────────────────────────────────── */}
      {matches.length > 0 && (
        <div className="dc-field">
          <label className="dc-label">Who each team is</label>
          {unresolved.length > 0 && (
            <p className="dc-form-error" style={{ margin: '.2rem 0 .6rem' }}>
              {unresolved.length} name{unresolved.length === 1 ? '' : 's'} still need an answer.
            </p>
          )}
          <div style={{ display: 'grid', gap: '.4rem' }}>
            {matches.map((m) => {
              const key = nameKey(m.name)
              const value = overrides[key] ?? m.managerId ?? ''
              return (
                <div key={key} style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="mono" style={{ minWidth: '14rem' }}>{m.name}</span>
                  <select
                    className="dc-select"
                    value={value}
                    onChange={(e) => setOverrides((prev) => ({ ...prev, [key]: e.target.value }))}
                    style={{ maxWidth: '20rem' }}
                  >
                    <option value="">Pick a manager</option>
                    {managers.map((mg) => (
                      <option key={mg.id} value={mg.id}>
                        {mg.displayName}{mg.teamName ? ` (${mg.teamName})` : ''}
                      </option>
                    ))}
                    <option value="new">Add as a new manager</option>
                  </select>
                  {!overrides[key] && m.managerId && (
                    <span className="dc-checkbox-hint" style={{ margin: 0 }}>
                      matched on {m.via === 'team' ? 'team name' : m.via === 'display' ? 'manager name' : 'a past team name'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Commit ────────────────────────────────────────────────────── */}
      <div className="dc-field">
        <label className="dc-label" htmlFor="mi-note">Where did this come from (optional)</label>
        <input
          id="mi-note"
          className="dc-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Old league email, screenshots, the commissioner's spreadsheet"
        />
      </div>

      <button type="button" className="lo-btn" disabled={!canSubmit} onClick={submit}>
        {pending ? 'Writing…' : `Import ${parsed?.rows.length ?? 0} row${parsed?.rows.length === 1 ? '' : 's'} into ${year}`}
      </button>

      {result && (
        result.ok ? (
          <div className="lo-note" style={{ marginTop: '1rem' }}>
            <div className="lo-note-head"><span className="pin">✦</span> Imported</div>
            <div className="lo-note-body">
              {result.written} row{result.written === 1 ? '' : 's'} written
              {result.managersCreated > 0 ? `, ${result.managersCreated} new manager${result.managersCreated === 1 ? '' : 's'} added` : ''}.
              {' '}<a href={`/league/${slug}`}>Open the league</a>.
              {result.issues.length > 0 && (
                <ul style={{ margin: '.6rem 0 0', paddingLeft: '1.1rem' }}>
                  {result.issues.slice(0, 8).map((issue, i) => <li key={i}>{issue}</li>)}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <p className="dc-form-error" style={{ marginTop: '1rem' }}>{result.error}</p>
        )
      )}

      {/* ── What has already been entered ─────────────────────────────── */}
      {existing.length > 0 && (
        <div style={{ marginTop: '2.4rem' }}>
          <div className="lo-folio">
            <span className="lo-folio-no">02</span>
            <span className="lo-folio-title">Entered by hand</span>
            <span className="lo-folio-meta">{existing.length} on file</span>
          </div>
          <div style={{ display: 'grid', gap: '.5rem', marginTop: '.8rem' }}>
            {[...existing].sort((a, b) => b.year - a.year).map((e) => (
              <ExistingRow key={e.id} leagueId={leagueId} entry={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ExistingRow({ leagueId, entry }: { leagueId: string; entry: ExistingImport }) {
  const [pending, startTransition] = useTransition()
  const [gone, setGone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (gone) return null

  function drop(deleteRows: boolean) {
    startTransition(async () => {
      const res = await removeManualImport({ leagueId, seasonId: entry.seasonId, kind: entry.kind, deleteRows })
      if (res.ok) setGone(true)
      else setError(res.error)
    })
  }

  return (
    <div style={{ display: 'flex', gap: '.8rem', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--ink-line)', paddingBottom: '.5rem' }}>
      <span className="mono" style={{ minWidth: '4rem' }}>{entry.year}</span>
      <span style={{ minWidth: '11rem' }}>{KIND_LABELS[entry.kind]}</span>
      <span className="dc-checkbox-hint" style={{ margin: 0 }}>{entry.rowCount} rows</span>
      <button type="button" className="lo-btn-ghost sm" disabled={pending} onClick={() => drop(false)}>
        Let syncs own it again
      </button>
      <button type="button" className="lo-btn-ghost sm" disabled={pending} onClick={() => drop(true)}>
        Delete these rows
      </button>
      {error && <span className="dc-form-error">{error}</span>}
    </div>
  )
}

function PreviewTable({ parsed }: { parsed: NonNullable<ReturnType<typeof parseImport>> }) {
  const cellStyle: React.CSSProperties = { padding: '.25rem .5rem', whiteSpace: 'nowrap', borderBottom: '1px solid var(--ink-line-soft, var(--ink-line))' }

  if (parsed.kind === 'standings') {
    const rows = parsed.rows as StandingsRow[]
    return (
      <table className="mono" style={{ fontSize: '.78rem', borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['Team', 'W', 'L', 'T', 'PF', 'PA', 'Finish', 'Seed'].map((h) => <th key={h} style={{ ...cellStyle, textAlign: 'left' }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 60).map((r, i) => (
            <tr key={i}>
              <td style={cellStyle}>{r.team}</td>
              <td style={cellStyle}>{r.wins}</td>
              <td style={cellStyle}>{r.losses}</td>
              <td style={cellStyle}>{r.ties}</td>
              <td style={cellStyle}>{r.pointsFor ?? '—'}</td>
              <td style={cellStyle}>{r.pointsAgainst ?? '—'}</td>
              <td style={cellStyle}>{r.finalRank ?? '—'}</td>
              <td style={cellStyle}>{r.regularRank ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (parsed.kind === 'drafts') {
    const rows = parsed.rows as DraftRow[]
    return (
      <table className="mono" style={{ fontSize: '.78rem', borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['Rd', 'Pick', 'Team', 'Player', 'Pos', 'NFL'].map((h) => <th key={h} style={{ ...cellStyle, textAlign: 'left' }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 60).map((r, i) => (
            <tr key={i}>
              <td style={cellStyle}>{r.round}</td>
              <td style={cellStyle}>{r.pick}</td>
              <td style={cellStyle}>{r.team}</td>
              <td style={cellStyle}>{r.player}</td>
              <td style={cellStyle}>{r.position ?? '—'}</td>
              <td style={cellStyle}>{r.nflTeam ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  const rows = parsed.rows as MatchupRow[]
  return (
    <table className="mono" style={{ fontSize: '.78rem', borderCollapse: 'collapse', width: '100%' }}>
      <thead><tr>{['Wk', 'Team', 'Score', 'Team', 'Score', 'Playoff'].map((h, i) => <th key={i} style={{ ...cellStyle, textAlign: 'left' }}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.slice(0, 60).map((r, i) => (
          <tr key={i}>
            <td style={cellStyle}>{r.week}</td>
            <td style={cellStyle}>{r.teamA}</td>
            <td style={cellStyle}>{r.scoreA ?? '—'}</td>
            <td style={cellStyle}>{r.teamB}</td>
            <td style={cellStyle}>{r.scoreB ?? '—'}</td>
            <td style={cellStyle}>{r.isChampionship ? 'title' : r.isPlayoff ? 'yes' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
