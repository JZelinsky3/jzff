'use client'

// Season rules + eras, on the Sources page (both trees).
//
// Every season the league's sources cover, one row each, prefilled with what
// the platform reports: scoring, when the playoffs start, how many teams make
// them, and whether rounds or the final run two weeks. The commissioner fixes
// whatever is wrong (or changed that year), groups seasons into eras, then
// saves and syncs everything in one pass.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadSeasonRules, saveSeasonRules, type RuleSeason } from './rules-actions'
import { syncSource } from './actions'
import { scoringKey, scoringLabel, type Era, type SeasonRules } from '@/lib/seasonRules'

type SourceRef = { id: string; label: string }

type Flat = { ppr: string; pass_td: string; te: string; pws: string; ptc: string; rw: string; cw: string }
const FIELDS: (keyof Flat)[] = ['ppr', 'pass_td', 'te', 'pws', 'ptc', 'rw', 'cw']

const str = (v: number | null | undefined) => (v == null ? '' : String(v))
function flatOf(r: SeasonRules): Flat {
  return {
    ppr: str(r.scoring?.ppr),
    pass_td: str(r.scoring?.pass_td),
    te: r.scoring ? str(r.scoring.te_premium ?? 0) : '',
    pws: str(r.playoff_week_start),
    ptc: str(r.playoff_team_count),
    rw: str(r.playoff_round_weeks),
    cw: str(r.championship_weeks),
  }
}
function layer(detected: Flat, commish: SeasonRules): Flat {
  const c = flatOf(commish)
  const out = { ...detected }
  for (const f of FIELDS) if (c[f] !== '') out[f] = c[f]
  // A saved scoring override with no TE key means "no premium", not unknown.
  if (commish.scoring && commish.scoring.te_premium == null && c.ppr !== '') out.te = detected.te || '0'
  return out
}
const n = (v: string) => (v === '' ? null : Number(v))

// What goes to the server: only fields that differ from the platform.
function overridesOf(values: Flat, detected: Flat): SeasonRules | null {
  const diff = (f: keyof Flat) => values[f] !== '' && values[f] !== detected[f]
  const scoring = diff('ppr') || diff('pass_td') || diff('te')
    ? {
        ppr: diff('ppr') ? n(values.ppr) : null,
        pass_td: diff('pass_td') ? n(values.pass_td) : null,
        te_premium: diff('te') ? n(values.te) : null,
      }
    : null
  const out: SeasonRules = {
    playoff_week_start: diff('pws') ? n(values.pws) : null,
    playoff_team_count: diff('ptc') ? n(values.ptc) : null,
    playoff_round_weeks: diff('rw') ? n(values.rw) : null,
    championship_weeks: diff('cw') ? n(values.cw) : null,
    scoring,
  }
  return Object.values(out).some((v) => v != null) ? out : null
}
const asRules = (v: Flat): SeasonRules => ({
  playoff_week_start: n(v.pws),
  playoff_team_count: n(v.ptc),
  playoff_round_weeks: n(v.rw),
  championship_weeks: n(v.cw),
  scoring: v.ppr === '' && v.pass_td === '' ? null : { ppr: n(v.ppr), pass_td: n(v.pass_td), te_premium: n(v.te) },
})

const withCurrent = (opts: [string, string][], cur: string, fmt: (v: string) => string) =>
  cur === '' || opts.some(([v]) => v === cur) ? opts : [...opts, [cur, fmt(cur)] as [string, string]]

const OPTIONS: Record<keyof Flat, [string, string][]> = {
  ppr: [['0', 'Standard'], ['0.5', 'Half PPR'], ['1', 'Full PPR']],
  pass_td: [['4', '4 pts'], ['5', '5 pts'], ['6', '6 pts']],
  te: [['0', 'None'], ['0.5', '+0.5'], ['1', '+1']],
  pws: [10, 11, 12, 13, 14, 15, 16, 17].map((w) => [String(w), `Week ${w}`] as [string, string]),
  ptc: [2, 4, 6, 8, 10, 12].map((t) => [String(t), `${t} teams`] as [string, string]),
  rw: [['1', '1 week'], ['2', '2 weeks']],
  cw: [['1', '1 week'], ['2', '2 weeks']],
}
const FMT: Record<keyof Flat, (v: string) => string> = {
  ppr: (v) => `${v} PPR`,
  pass_td: (v) => `${v} pts`,
  te: (v) => `+${v}`,
  pws: (v) => `Week ${v}`,
  ptc: (v) => `${v} teams`,
  rw: (v) => `${v} weeks`,
  cw: (v) => `${v} weeks`,
}
const LABELS: Record<keyof Flat, string> = {
  ppr: 'Scoring',
  pass_td: 'Pass TD',
  te: 'TE premium',
  pws: 'Playoffs start',
  ptc: 'Playoff teams',
  rw: 'Each round',
  cw: 'Final',
}

type RowState = RuleSeason & { base: Flat; values: Flat }

function eraId(name: string, taken: Set<string>): string {
  const root = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'era'
  let id = root, i = 2
  while (taken.has(id)) id = `${root}-${i++}`
  return id
}
const span = (ys: number[]) => (ys.length > 1 ? `${ys[0]}–${ys[ys.length - 1]}` : `${ys[0] ?? ''}`)

export function SeasonRules({
  leagueId,
  sources,
  variant = 'desktop',
  onSynced,
}: {
  leagueId: string
  sources: SourceRef[]
  variant?: 'desktop' | 'mobile'
  // The welcome wizard's Continue waits on a finished sync.
  onSynced?: () => void
}) {
  const router = useRouter()
  const [rows, setRows] = useState<RowState[] | null>(null)
  const [eras, setEras] = useState<Era[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'saving' | 'syncing' | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [openYear, setOpenYear] = useState<number | null>(null)
  const sourceKey = sources.map((s) => s.id).join(',')

  useEffect(() => {
    let alive = true
    setRows(null)
    loadSeasonRules(leagueId).then((res) => {
      if (!alive) return
      if (!res.ok) { setLoadError(res.error); setRows([]); return }
      setLoadError(null)
      setRows(res.seasons.map((s) => {
        const base = flatOf(s.detected)
        return { ...s, base, values: layer(base, s.commish) }
      }))
      setEras(res.eras)
    })
    return () => { alive = false }
  }, [leagueId, sourceKey])

  const edited = (r: RowState, f: keyof Flat) => r.values[f] !== r.base[f] && r.values[f] !== ''
  const dirtyCount = (rows ?? []).filter((r) => FIELDS.some((f) => edited(r, f))).length

  function setField(year: number, f: keyof Flat, v: string) {
    setMsg(null)
    setRows((rs) => rs && rs.map((r) => (r.year === year ? { ...r, values: { ...r.values, [f]: v } } : r)))
  }
  function resetRow(year: number) {
    setRows((rs) => rs && rs.map((r) => (r.year === year ? { ...r, values: { ...r.base } } : r)))
  }
  // "Every season after this one played by these rules": copies the row's
  // values down, which is how a league that changed format once fills in a
  // decade in two clicks.
  function copyDown(year: number) {
    setMsg(null)
    setRows((rs) => {
      if (!rs) return rs
      const src = rs.find((r) => r.year === year)
      if (!src) return rs
      return rs.map((r) => (r.year > year ? { ...r, values: { ...src.values } } : r))
    })
  }

  function suggestEras() {
    if (!rows?.length) return
    const next: Era[] = []
    const taken = new Set<string>()
    const byScoring = new Map<string, number[]>()
    const byReg = new Map<string, number[]>()
    for (const r of rows) {
      const rules = asRules(r.values)
      const k = scoringKey(rules.scoring)
      if (k) byScoring.set(k, [...(byScoring.get(k) ?? []), r.year])
      if (rules.playoff_week_start) {
        const reg = rules.playoff_week_start - 1
        byReg.set(String(reg), [...(byReg.get(String(reg)) ?? []), r.year])
      }
    }
    if (byScoring.size > 1) {
      for (const years of byScoring.values()) {
        const r = rows.find((x) => x.year === years[0])!
        const label = scoringLabel(asRules(r.values).scoring)?.split(' · ')[0] ?? 'Scoring'
        const name = `${label} years`
        const id = eraId(name, taken); taken.add(id)
        next.push({ id, name, years })
      }
    }
    if (byReg.size > 1) {
      for (const [reg, years] of byReg) {
        const name = `${reg}-week seasons`
        const id = eraId(name, taken); taken.add(id)
        next.push({ id, name, years })
      }
    }
    if (!next.length) {
      setMsg({ ok: false, text: 'Every season shares the same scoring and schedule, so there is nothing to split. Add an era by hand instead.' })
      return
    }
    setEras((cur) => {
      const names = new Set(cur.map((e) => e.name.toLowerCase()))
      return [...cur, ...next.filter((e) => !names.has(e.name.toLowerCase()))]
    })
  }
  function addEra() {
    setEras((cur) => {
      const taken = new Set(cur.map((e) => e.id))
      return [...cur, { id: eraId(`era-${cur.length + 1}`, taken), name: '', years: [] }]
    })
  }
  function updateEra(id: string, patch: Partial<Era>) {
    setMsg(null)
    setEras((cur) => cur.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }
  function toggleEraYear(id: string, year: number) {
    setEras((cur) => cur.map((e) => {
      if (e.id !== id) return e
      const has = e.years.includes(year)
      return { ...e, years: (has ? e.years.filter((y) => y !== year) : [...e.years, year]).sort((a, b) => a - b) }
    }))
  }

  async function save(andSync: boolean) {
    if (!rows) return
    setBusy('saving'); setMsg(null)
    const rules: Record<string, SeasonRules> = {}
    for (const r of rows) {
      const o = overridesOf(r.values, r.base)
      if (o) rules[String(r.year)] = o
    }
    const cleanEras = eras.filter((e) => e.name.trim() && e.years.length)
    const res = await saveSeasonRules({ leagueId, rules, eras: cleanEras })
    if (!res.ok) { setBusy(null); setMsg({ ok: false, text: res.error }); return }
    if (!andSync || sources.length === 0) {
      setBusy(null)
      setMsg({ ok: true, text: 'Saved. Records and standings pick it up right away; sync to re-read the playoff weeks.' })
      router.refresh()
      return
    }
    setBusy('syncing')
    const failed: string[] = []
    for (let i = 0; i < sources.length; i++) {
      setProgress(`Syncing ${i + 1} of ${sources.length} · ${sources[i].label}`)
      const r = await syncSource(sources[i].id, leagueId)
      if (!r.ok) failed.push(`${sources[i].label}: ${r.error}`)
    }
    setProgress(null)
    setBusy(null)
    if (failed.length < sources.length) onSynced?.()
    setMsg(failed.length
      ? { ok: false, text: `Saved, but ${failed.length} source${failed.length === 1 ? '' : 's'} failed to sync. ${failed.join(' · ')}` }
      : { ok: true, text: `Saved and synced ${sources.length} source${sources.length === 1 ? '' : 's'}.` })
    router.refresh()
  }

  if (rows == null) {
    return <div className={variant === 'mobile' ? 'msrc-rules-empty' : 'lo-rules-empty'}>Reading every season from your sources…</div>
  }
  if (loadError) {
    return <div className={variant === 'mobile' ? 'msrc-rules-empty' : 'lo-rules-empty'}>{loadError}</div>
  }
  if (rows.length === 0) {
    return (
      <div className={variant === 'mobile' ? 'msrc-rules-empty' : 'lo-rules-empty'}>
        Attach a league first. Its seasons show up here to check before the first sync.
      </div>
    )
  }

  const unsynced = rows.filter((r) => !r.synced).length
  const platforms = [...new Set(rows.map((r) => r.source).filter(Boolean))].join(' and ')
  const intro = `${rows.length} season${rows.length === 1 ? '' : 's'}${platforms ? ` found on ${platforms}` : ''}` +
    (unsynced ? `, ${unsynced} not synced yet` : '') + '.'

  const select = (r: RowState, f: keyof Flat, cls: string) => (
    <select
      className={`${cls}${edited(r, f) ? ' edited' : ''}`}
      value={r.values[f]}
      onChange={(e) => setField(r.year, f, e.target.value)}
      disabled={busy !== null}
      aria-label={`${r.year} ${LABELS[f]}`}
    >
      {r.values[f] === '' && <option value="">Not set</option>}
      {withCurrent(OPTIONS[f], r.values[f], FMT[f]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )

  const erasBlock = (cls: string) => (
    <div className={`${cls}-eras`}>
      <div className={`${cls}-eras-head`}>
        <span className={`${cls}-eras-title`}>Eras</span>
        <span className={`${cls}-eras-note`}>
          Group seasons (Non-PPR years, 13-game seasons) and the record book can read just those years.
        </span>
      </div>
      {eras.map((e) => (
        <div key={e.id} className={`${cls}-era`}>
          <input
            className="dc-input"
            value={e.name}
            placeholder="Name this era"
            maxLength={40}
            onChange={(ev) => updateEra(e.id, { name: ev.target.value })}
            disabled={busy !== null}
          />
          <div className={`${cls}-era-years`}>
            {rows.map((r) => (
              <button
                key={r.year}
                type="button"
                className={`${cls}-chip${e.years.includes(r.year) ? ' on' : ''}`}
                onClick={() => toggleEraYear(e.id, r.year)}
                disabled={busy !== null}
              >
                {r.year}
              </button>
            ))}
          </div>
          <button type="button" className="lo-btn-quiet" onClick={() => setEras((cur) => cur.filter((x) => x.id !== e.id))} disabled={busy !== null}>
            Remove
          </button>
        </div>
      ))}
      <div className={`${cls}-era-tools`}>
        <button type="button" className="lo-btn-ghost" onClick={addEra} disabled={busy !== null}>Add an era</button>
        <button type="button" className="lo-btn-ghost" onClick={suggestEras} disabled={busy !== null}>Suggest from the rules</button>
      </div>
    </div>
  )

  const actions = (cls: string) => (
    <div className={`${cls}-actions`}>
      <button type="button" className="lo-btn" onClick={() => save(true)} disabled={busy !== null || sources.length === 0}>
        {busy === 'syncing' ? (progress ?? 'Syncing…') : busy === 'saving' ? 'Saving…' : 'Save and sync everything'}
      </button>
      <button type="button" className="lo-btn-ghost" onClick={() => save(false)} disabled={busy !== null}>
        Save only
      </button>
      <span className={`${cls}-status`}>
        {msg
          ? <span className={msg.ok ? 'ok' : 'err'}>{msg.text}</span>
          : dirtyCount > 0
            ? `${dirtyCount} season${dirtyCount === 1 ? '' : 's'} changed`
            : busy === 'syncing' ? 'Stay on this page until it finishes.' : null}
      </span>
    </div>
  )

  if (variant === 'mobile') {
    return (
      <div className="msrc-rules">
        <div className="msrc-rules-intro">{intro} Tap a season to change it. Gold marks your edits.</div>
        {rows.map((r, i) => {
          const open = openYear === r.year
          const rules = asRules(r.values)
          const changed = FIELDS.some((f) => edited(r, f))
          const summary = [
            scoringLabel(rules.scoring)?.split(' · ')[0],
            rules.playoff_week_start ? `Wk ${rules.playoff_week_start}` : null,
            rules.playoff_team_count ? `${rules.playoff_team_count} teams` : null,
            rules.championship_weeks === 2 || rules.playoff_round_weeks === 2 ? '2-wk final' : null,
          ].filter(Boolean).join(' · ')
          return (
            <div key={r.year} className={`msrc-rule${open ? ' open' : ''}${changed ? ' changed' : ''}`}>
              <button type="button" className="msrc-rule-head" onClick={() => setOpenYear(open ? null : r.year)}>
                <span className="msrc-rule-year">{r.year}</span>
                <span className="msrc-rule-sum">{summary || 'Not set'}</span>
                {!r.synced && <span className="msrc-rule-new">New</span>}
                <span className="msrc-rule-chev" aria-hidden>▾</span>
              </button>
              {open && (
                <div className="msrc-rule-body">
                  {FIELDS.map((f) => (
                    <label key={f} className="msrc-rule-field">
                      <span>{LABELS[f]}</span>
                      {select(r, f, 'dc-select')}
                    </label>
                  ))}
                  <div className="msrc-rule-tools">
                    {i < rows.length - 1 && (
                      <button type="button" className="lo-btn-quiet" onClick={() => copyDown(r.year)} disabled={busy !== null}>
                        Use for every later season
                      </button>
                    )}
                    {changed && (
                      <button type="button" className="lo-btn-quiet" onClick={() => resetRow(r.year)} disabled={busy !== null}>
                        Back to {r.source ?? 'platform'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {erasBlock('msrc-rules')}
        {actions('msrc-rules')}
      </div>
    )
  }

  return (
    <div className="lo-rules">
      <p className="lo-rules-intro">
        {intro} Each row starts from what the platform reports. Change anything that was different
        that year; your edits are marked in gold and survive every sync.
      </p>
      <div className="lo-rules-wrap">
        <table className="lo-rules-table">
          <thead>
            <tr>
              <th>Season</th>
              {FIELDS.map((f) => <th key={f}>{LABELS[f]}</th>)}
              <th aria-label="Row tools" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const changed = FIELDS.some((f) => edited(r, f))
              return (
                <tr key={r.year} className={changed ? 'changed' : undefined}>
                  <th scope="row">
                    <span className="lo-rules-year">{r.year}</span>
                    <span className="lo-rules-src">
                      {[r.source, r.teams ? `${r.teams} teams` : null, r.synced ? null : 'not synced'].filter(Boolean).join(' · ')}
                    </span>
                  </th>
                  {FIELDS.map((f) => <td key={f}>{select(r, f, 'lo-rules-select')}</td>)}
                  <td className="lo-rules-tools">
                    {i < rows.length - 1 && (
                      <button type="button" onClick={() => copyDown(r.year)} disabled={busy !== null} title="Use these rules for every later season">
                        Copy down
                      </button>
                    )}
                    {changed && (
                      <button type="button" onClick={() => resetRow(r.year)} disabled={busy !== null} title={`Back to what ${r.source ?? 'the platform'} reports`}>
                        Reset
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {erasBlock('lo-rules')}
      {actions('lo-rules')}
      {eras.some((e) => e.years.length) && (
        <p className="lo-rules-foot">
          Saved eras show up as a Years filter on the record book: {eras.filter((e) => e.name && e.years.length).map((e) => `${e.name} (${span(e.years)})`).join(', ')}.
        </p>
      )}
    </div>
  )
}
