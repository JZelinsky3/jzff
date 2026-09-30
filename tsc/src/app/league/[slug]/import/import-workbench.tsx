'use client'

// The hand-entry workbench. Parsing runs in the browser so the preview is
// instant and nothing is written until the user has seen exactly what will
// land, including which manager every team name resolved to. The server
// re-parses the same text when committing; this is a display, not the source
// of truth. See ./actions.ts.
//
// Two ways to enter a stage: type it into a grid, or paste / drop a file. The
// grid is turned into the same CSV the paste box takes (gridToText), so from
// the preview onward both modes are one code path.

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  parseImport,
  matchNames,
  nameKey,
  gridToText,
  GRID_COLUMNS,
  KIND_LABELS,
  TEMPLATES,
  type GridRow,
  type ImportKind,
  type ManualKind,
  type KnownManager,
  type LeaguePerson,
  type StandingsRow,
  type DraftRow,
  type MatchupRow,
} from '@/lib/manualImport'
import { commitManualImport, removeManualImport } from './actions'
import { PodiumBoard, type PodiumSeason } from './podium-board'

type ExistingImport = {
  id: string
  seasonId: string
  year: number
  kind: ManualKind
  rowCount: number
  createdAt: string
}

const TABS: Array<{ key: ManualKind; label: string; sub: string }> = [
  { key: 'podium', label: 'Champions', sub: 'winners by year' },
  { key: 'standings', label: KIND_LABELS.standings, sub: 'records + champion' },
  { key: 'drafts', label: KIND_LABELS.drafts, sub: 'pick by pick' },
  { key: 'matchups', label: KIND_LABELS.matchups, sub: 'week by week' },
]

const TAB_HINTS: Record<ManualKind, string> = {
  podium: 'Just the winners: champion, runner-up and third place for each year. Only the champion is needed.',
  standings: 'One row per team: record, points for and against, where they finished.',
  drafts: 'One row per pick: who picked, who they took, and where in the draft.',
  matchups: 'One row per game: week, both teams, both scores.',
}

const GRID_HINTS: Record<ImportKind, string> = {
  standings: 'Finish 1 is the champion and 2 the runner-up. Seed 1 is the regular-season winner. PF and PA can stay blank.',
  drafts: 'Leave Rd and Pick blank and the picks are numbered in the order you type them.',
  matchups: 'Tick Playoff for postseason games and Title for the championship game.',
}

// Input widths by column key; anything unlisted is a narrow number cell.
const CELL_WIDTH: Record<string, string> = {
  team: '13rem',
  team_a: '12rem',
  team_b: '12rem',
  player: '13rem',
  points_for: '6rem',
  points_against: '6rem',
  score_a: '5.5rem',
  score_b: '5.5rem',
  nfl_team: '4.2rem',
}

// Stable row ids so removing a row does not shift focus onto its neighbour.
// Never rendered, and ignored by gridToText, which reads column keys only.
let rowSeq = 0
const newRow = (init: GridRow = {}): GridRow => ({ _id: `r${rowSeq++}`, ...init })
const blankRows = (n: number, init: GridRow = {}) => Array.from({ length: n }, () => newRow(init))

function initialGrid(kind: ImportKind, teamCount: number): GridRow[] {
  if (kind === 'matchups') return blankRows(Math.max(1, Math.ceil(teamCount / 2)), { week: '1' })
  return blankRows(teamCount)
}

export function ImportWorkbench({
  leagueId,
  slug,
  seasons,
  managers,
  people,
  teamCount,
  podiumSeasons,
  existing,
}: {
  leagueId: string
  slug: string
  seasons: Array<{ id: string; year: number }>
  managers: KnownManager[]
  /** One per person, labelled with their league nickname; what the pickers list. */
  people: LeaguePerson[]
  /** Teams in the latest season on file; sizes the blank grid. */
  teamCount: number
  podiumSeasons: PodiumSeason[]
  existing: ExistingImport[]
}) {
  const [tab, setTab] = useState<ManualKind>('podium')
  // The three table stages share the form below; Champions is its own board.
  const kind: ImportKind = tab === 'podium' ? 'standings' : tab
  const [year, setYear] = useState<string>(String(seasons.at(-1)?.year ?? new Date().getFullYear() - 1))
  const [mode, setMode] = useState<'type' | 'paste'>('type')
  const [text, setText] = useState('')
  // One grid per stage, so switching stages does not throw away typing.
  const [grids, setGrids] = useState<Record<ImportKind, GridRow[]>>(() => ({
    standings: initialGrid('standings', teamCount),
    drafts: initialGrid('drafts', teamCount),
    matchups: initialGrid('matchups', teamCount),
  }))
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

  const grid = grids[kind]
  const typed = useMemo(() => gridToText(kind, grid), [kind, grid])
  const source = mode === 'type' ? typed.text : text
  const parsed = useMemo(() => (source.trim() ? parseImport(kind, source) : null), [kind, source])

  // Parse issues carry text line numbers; in the grid those mean nothing, so
  // point at the grid row instead.
  const where = (line: number, rowOfLine = typed.rowOfLine) =>
    mode === 'type' ? `Row ${rowOfLine[line] ?? line}` : `Line ${line}`

  // Nicknames first: they are what the league types. Platform usernames and
  // team names follow so a paste in either still autocompletes.
  const teamOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    const names = [
      ...people.filter((p) => !p.hidden).map((p) => p.label),
      ...managers.flatMap((m) => [m.displayName, m.teamName]),
    ]
    for (const name of names) {
      if (!name || seen.has(nameKey(name))) continue
      seen.add(nameKey(name))
      out.push(name)
    }
    return out
  }, [people, managers])

  // Any of a person's accounts → the one account the pickers use for them.
  const personOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of people) for (const id of p.managerIds) map.set(id, p.id)
    return map
  }, [people])

  function updateGrid(fn: (rows: GridRow[]) => GridRow[]) {
    setGrids((prev) => ({ ...prev, [kind]: fn(prev[kind]) }))
    setResult(null)
  }
  const setCell = (id: string, key: string, value: string) =>
    updateGrid((rows) => rows.map((r) => (r._id === id ? { ...r, [key]: value } : r)))
  const removeRow = (id: string) =>
    updateGrid((rows) => (rows.length > 1 ? rows.filter((r) => r._id !== id) : [newRow(kind === 'matchups' ? { week: rows[0]?.week ?? '1' } : {})]))
  const lastWeek = () => Number(grid.at(-1)?.week) || 1
  const addGame = () => updateGrid((rows) => [...rows, newRow({ week: String(lastWeek()) })])
  const addWeek = () => updateGrid((rows) => [...rows, ...blankRows(Math.max(1, Math.ceil(teamCount / 2)), { week: String(lastWeek() + 1) })])
  const addRows = (n: number) => updateGrid((rows) => [...rows, ...blankRows(n)])
  const resetGrid = () => updateGrid(() => initialGrid(kind, teamCount))

  const matches = useMemo(() => {
    if (!parsed) return []
    return matchNames(parsed.teamNames, managers).map((m) => {
      const override = overrides[nameKey(m.name)]
      if (override) return { ...m, managerId: override === 'new' ? null : override, via: 'none' as const, override }
      return { ...m, managerId: m.managerId ? personOf.get(m.managerId) ?? m.managerId : null, override: undefined }
    })
  }, [parsed, managers, overrides, personOf])

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
    // Captured now: the grid is cleared on success, and the server's issue
    // lines still have to point at the rows as they were typed.
    const rowOfLine = typed.rowOfLine
    startTransition(async () => {
      const res = await commitManualImport({
        leagueId,
        year: Number(year),
        kind,
        text: source,
        mapping,
        note,
      })
      setResult(
        res.ok && mode === 'type'
          ? { ...res, issues: res.issues.map((i) => i.replace(/^Line (\d+):/, (_, n) => `${where(Number(n), rowOfLine)}:`)) }
          : res
      )
      if (res.ok) {
        if (mode === 'type') setGrids((prev) => ({ ...prev, [kind]: initialGrid(kind, teamCount) }))
        else setText('')
        setOverrides({})
        setNote('')
      }
    })
  }

  return (
    <div className="dc-form">
      {/* ── What kind of data ─────────────────────────────────────────── */}
      <div className="dc-field">
        <label className="dc-label">What are you entering</label>
        <div className="lo-tiles">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`lo-tile${tab === t.key ? ' on' : ''}`}
              onClick={() => { setTab(t.key); setResult(null) }}
            >
              <span className="lo-tile-name">{t.label}</span>
              <span className="lo-tile-sub">{t.sub}</span>
            </button>
          ))}
        </div>
        <span className="dc-checkbox-hint">{TAB_HINTS[tab]}</span>
      </div>

      {tab === 'podium' ? (
        <PodiumBoard
          leagueId={leagueId}
          seasons={podiumSeasons}
          people={people}
        />
      ) : (
        <>
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

        {/* ── How ───────────────────────────────────────────────────────── */}
        <div className="dc-field">
          <label className="dc-label">How</label>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={mode === 'type' ? 'lo-btn sm' : 'lo-btn-ghost sm'}
              onClick={() => { setMode('type'); setResult(null) }}
            >
              Type it in
            </button>
            <button
              type="button"
              className={mode === 'paste' ? 'lo-btn sm' : 'lo-btn-ghost sm'}
              onClick={() => { setMode('paste'); setResult(null) }}
            >
              Paste or upload
            </button>
          </div>
        </div>

        {/* ── The data: typed ───────────────────────────────────────────── */}
        {mode === 'type' && (
          <div className="dc-field">
            <label className="dc-label">{KIND_LABELS[kind]}</label>
            <datalist id="mi-teams">
              {teamOptions.map((n) => <option key={n} value={n} />)}
            </datalist>
            <div className="lo-entry">
              <table>
                <thead>
                  <tr>
                    <th aria-hidden />
                    {GRID_COLUMNS[kind].map((c) => <th key={c.key}>{c.label}</th>)}
                    <th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Placeholder pick numbers follow the parser's fallback:
                    // the order of the rows that actually have something in them.
                    let running = 0
                    return grid.map((row, i) => {
                      const filled = GRID_COLUMNS[kind].some((c) => !c.positional && (row[c.key] ?? '').trim())
                      if (filled) running++
                      return (
                        <tr key={row._id}>
                          <td className="lo-entry-no">{i + 1}</td>
                          {GRID_COLUMNS[kind].map((c) => (
                            <td key={c.key} className={c.input === 'check' ? 'lo-entry-check' : undefined}>
                              {c.input === 'check' ? (
                                <input
                                  type="checkbox"
                                  checked={row[c.key] === 'yes'}
                                  onChange={(e) => setCell(row._id, c.key, e.target.checked ? 'yes' : '')}
                                  aria-label={`${c.label}, row ${i + 1}`}
                                />
                              ) : (
                                <input
                                  className={`dc-input${c.input === 'number' ? ' mono' : ''}`}
                                  value={row[c.key] ?? ''}
                                  onChange={(e) => setCell(row._id, c.key, e.target.value)}
                                  list={c.input === 'team' ? 'mi-teams' : undefined}
                                  inputMode={c.input === 'number' ? 'decimal' : undefined}
                                  autoComplete="off"
                                  spellCheck={false}
                                  placeholder={
                                    c.key === 'pick' && filled ? String(running)
                                    : c.key === 'round' && filled ? 'auto'
                                    : c.input === 'team' ? 'Team or manager'
                                    : undefined
                                  }
                                  aria-label={`${c.label}, row ${i + 1}`}
                                  style={{ width: CELL_WIDTH[c.key] ?? '3.6rem' }}
                                />
                              )}
                            </td>
                          ))}
                          <td>
                            <button
                              type="button"
                              className="lo-entry-x"
                              onClick={() => removeRow(row._id)}
                              aria-label={`Remove row ${i + 1}`}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', marginTop: '.5rem', flexWrap: 'wrap' }}>
              {kind === 'standings' && (
                <button type="button" className="lo-btn sm" onClick={() => addRows(1)}>Add a team</button>
              )}
              {kind === 'drafts' && (
                <>
                  <button type="button" className="lo-btn sm" onClick={() => addRows(teamCount)}>Add a round</button>
                  <button type="button" className="lo-btn-ghost sm" onClick={() => addRows(1)}>Add a pick</button>
                </>
              )}
              {kind === 'matchups' && (
                <>
                  <button type="button" className="lo-btn sm" onClick={addWeek}>Add a week</button>
                  <button type="button" className="lo-btn-ghost sm" onClick={addGame}>Add a game</button>
                </>
              )}
              <button type="button" className="lo-btn-ghost sm" onClick={resetGrid}>Clear</button>
            </div>
            <span className="dc-checkbox-hint">{GRID_HINTS[kind]}</span>
          </div>
        )}

        {/* ── The data: pasted ──────────────────────────────────────────── */}
        {mode === 'paste' && (
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
        )}

        {/* ── What was read ─────────────────────────────────────────────── */}
        {parsed && (
          <div className="dc-field">
            <label className="dc-label">{mode === 'type' ? 'Check' : 'What we read'}</label>
            <p className="dc-checkbox-hint" style={{ marginTop: 0 }}>
              {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} {mode === 'type' ? 'ready' : 'understood'}
              {parsed.issues.length > 0 ? `, ${parsed.issues.length} problem${parsed.issues.length === 1 ? '' : 's'}` : ''}.
            </p>

            {parsed.issues.length > 0 && (
              <ul className="dc-form-error" style={{ margin: '.4rem 0 .8rem', paddingLeft: '1.1rem' }}>
                {parsed.issues.slice(0, 12).map((issue, i) => (
                  <li key={i}>{issue.line ? `${where(issue.line)}: ` : ''}{issue.message}</li>
                ))}
              </ul>
            )}

            {/* The grid already shows what was typed; only a paste needs the
                read-back table. */}
            {mode === 'paste' && parsed.rows.length > 0 && (
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
                      {people.filter((pp) => !pp.hidden || pp.id === value).map((pp) => (
                        <option key={pp.id} value={pp.id}>{pp.label}</option>
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
          {pending ? 'Writing…' : `${mode === 'type' ? 'Save' : 'Import'} ${parsed?.rows.length ?? 0} row${parsed?.rows.length === 1 ? '' : 's'} into ${year}`}
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

        </>
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
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [gone, setGone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (gone) return null

  function drop(deleteRows: boolean) {
    startTransition(async () => {
      const res = await removeManualImport({ leagueId, seasonId: entry.seasonId, kind: entry.kind, deleteRows })
      if (!res.ok) { setError(res.error); return }
      setGone(true)
      // The Champions board reads the same seasons; bring it up to date.
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', gap: '.8rem', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--ink-line)', paddingBottom: '.5rem' }}>
      <span className="mono" style={{ minWidth: '4rem' }}>{entry.year}</span>
      <span style={{ minWidth: '11rem' }}>{entry.kind === 'podium' ? 'Champions' : KIND_LABELS[entry.kind]}</span>
      <span className="dc-checkbox-hint" style={{ margin: 0 }}>
        {entry.rowCount} {entry.kind === 'podium' ? (entry.rowCount === 1 ? 'place' : 'places') : 'rows'}
      </span>
      <button type="button" className="lo-btn-ghost sm" disabled={pending} onClick={() => drop(false)}>
        Let syncs own it again
      </button>
      <button type="button" className="lo-btn-ghost sm" disabled={pending} onClick={() => drop(true)}>
        {entry.kind === 'podium' ? 'Clear the podium' : 'Delete these rows'}
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
