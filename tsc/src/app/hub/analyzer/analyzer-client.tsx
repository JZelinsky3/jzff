'use client'

// Trade Room client: the analyzer studio (player search, settings, optional
// roster mode, analyze + publish) and the board's vote bars. All math runs
// server-side (/api/hub/analyzer); this file is pure UI state.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HubSpinner } from '../spinner'

type Player = { id: string; name: string; position: string; team: string | null }

type SideResult = {
  assets: { id: string; name: string; position: string; team: string | null; value: number }[]
  total: number
  grade: string
  verdict: string
  starterBefore: number | null
  starterAfter: number | null
}
type Analysis = {
  mode: string
  qbStarters: number
  teamCount: number
  usesRosters: boolean
  deltaPct: number
  valuationLabel: string
  sideA: SideResult
  sideB: SideResult
}

type Slots = { QB: number; RB: number; WR: number; TE: number; FLEX: number; SF: number }
const DEFAULT_SLOTS: Slots = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SF: 0 }

// ── Player search (debounced, dropdown) ──────────────────────────────────
function PlayerSearch({
  placeholder,
  exclude,
  onPick,
}: {
  placeholder: string
  exclude: Set<string>
  onPick: (p: Player) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const seqRef = seq
    const timerRef = timer
    return () => {
      seqRef.current++
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setQ(value)
    if (timer.current) clearTimeout(timer.current)
    const query = value.trim()
    const mySeq = ++seq.current
    if (query.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/hub/analyzer/players?q=${encodeURIComponent(query)}`)
        const json = await res.json()
        if (seq.current === mySeq) setResults(json.results ?? [])
      } catch {
        if (seq.current === mySeq) setResults([])
      } finally {
        if (seq.current === mySeq) setLoading(false)
      }
    }, 250)
  }

  const visible = focused && (results.length > 0 || loading) && q.trim().length >= 2

  return (
    <div className="hub-tr-search">
      <input
        className="hub-input"
        value={q}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      {loading && (
        <span className="hub-tr-search-spin">
          <HubSpinner size={20} />
        </span>
      )}
      {visible && (
        <div className="hub-tr-search-drop">
          {results
            .filter((r) => !exclude.has(r.id))
            .map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(r)
                  setQ('')
                  setResults([])
                }}
              >
                <span className="hub-tr-pos">{r.position}</span>
                {r.name}
                <span className="hub-tr-team">{r.team ?? ''}</span>
              </button>
            ))}
          {!loading && results.filter((r) => !exclude.has(r.id)).length === 0 && (
            <div className="hub-tr-search-none">No active QB/RB/WR/TE by that name.</div>
          )}
        </div>
      )}
    </div>
  )
}

function Chip({
  p,
  onRemove,
  sending,
  onToggle,
}: {
  p: Player
  onRemove?: () => void
  sending?: boolean
  onToggle?: () => void
}) {
  return (
    <button
      type="button"
      className={`hub-tr-chip${sending ? ' sending' : ''}${onToggle ? ' togglable' : ''}`}
      onClick={onToggle}
      title={onToggle ? (sending ? 'Click to keep (not send)' : 'Click to send in the trade') : undefined}
    >
      <span className="hub-tr-pos">{p.position}</span>
      {p.name}
      {sending && <span className="hub-tr-chip-flag">sends</span>}
      {onRemove && (
        <span
          className="hub-tr-chip-x"
          role="button"
          aria-label={`Remove ${p.name}`}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          ✕
        </span>
      )}
    </button>
  )
}

// ── The studio ────────────────────────────────────────────────────────────
export function AnalyzerStudio() {
  const router = useRouter()
  const [mode, setMode] = useState<'redraft' | 'keeper' | 'dynasty'>('redraft')
  const [qbStarters, setQbStarters] = useState<1 | 2>(1)
  const [teamCount, setTeamCount] = useState(12)
  const [rosterMode, setRosterMode] = useState(false)
  const [slots, setSlots] = useState<Slots>(DEFAULT_SLOTS)

  const [sideA, setSideA] = useState<Player[]>([])
  const [sideB, setSideB] = useState<Player[]>([])
  const [rosterA, setRosterA] = useState<Player[]>([])
  const [rosterB, setRosterB] = useState<Player[]>([])
  const [sendingA, setSendingA] = useState<Set<string>>(new Set())
  const [sendingB, setSendingB] = useState<Set<string>>(new Set())

  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effSideA = rosterMode ? rosterA.filter((p) => sendingA.has(p.id)) : sideA
  const effSideB = rosterMode ? rosterB.filter((p) => sendingB.has(p.id)) : sideB
  const ready = effSideA.length > 0 && effSideB.length > 0
  const allIds = new Set([
    ...effSideA.map((p) => p.id),
    ...effSideB.map((p) => p.id),
    ...rosterA.map((p) => p.id),
    ...rosterB.map((p) => p.id),
  ])

  function buildBody() {
    return {
      settings: { mode, qbStarters, teamCount },
      sideA: effSideA.map((p) => p.id),
      sideB: effSideB.map((p) => p.id),
      ...(rosterMode
        ? {
            rosterA: rosterA.map((p) => p.id),
            rosterB: rosterB.map((p) => p.id),
            slots,
          }
        : {}),
    }
  }

  async function analyze() {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    setPublished(false)
    try {
      const res = await fetch('/api/hub/analyzer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Analysis failed — try again.')
        setAnalysis(null)
      } else {
        setAnalysis(json.analysis)
      }
    } catch {
      setError('Network hiccup — try again.')
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    if (!analysis || publishing || published) return
    setPublishing(true)
    setError(null)
    try {
      const res = await fetch('/api/hub/analyzer/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Publish failed — try again.')
      } else {
        setPublished(true)
        router.refresh()
      }
    } catch {
      setError('Network hiccup — try again.')
    } finally {
      setPublishing(false)
    }
  }

  const toggleSend = (side: 'a' | 'b', id: string) => {
    const set = side === 'a' ? new Set(sendingA) : new Set(sendingB)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    if (side === 'a') setSendingA(set)
    else setSendingB(set)
    setAnalysis(null)
  }

  const slotKeys: (keyof Slots)[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SF']

  return (
    <div className="hub-tr-studio">
      {/* ── Settings rail ── */}
      <div className="hub-tr-settings">
        <label className="hub-tr-set">
          <span>League type</span>
          <select className="hub-input" value={mode} onChange={(e) => { setMode(e.target.value as typeof mode); setAnalysis(null) }}>
            <option value="redraft">Redraft</option>
            <option value="keeper">Keeper</option>
            <option value="dynasty">Dynasty</option>
          </select>
        </label>
        <label className="hub-tr-set">
          <span>Lineup</span>
          <select className="hub-input" value={qbStarters} onChange={(e) => { setQbStarters(Number(e.target.value) as 1 | 2); setAnalysis(null) }}>
            <option value={1}>1 QB</option>
            <option value={2}>Superflex / 2QB</option>
          </select>
        </label>
        <label className="hub-tr-set">
          <span>Teams</span>
          <select className="hub-input" value={teamCount} onChange={(e) => { setTeamCount(Number(e.target.value)); setAnalysis(null) }}>
            {[8, 10, 12, 14, 16].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`hub-btn-ghost hub-tr-roster-toggle${rosterMode ? ' on' : ''}`}
          onClick={() => {
            setRosterMode((r) => !r)
            setAnalysis(null)
            setPublished(false)
          }}
        >
          {rosterMode ? '✓ Roster mode' : '+ Add full rosters'}
        </button>
      </div>

      {rosterMode && (
        <div className="hub-tr-slots">
          <span className="hub-tr-slots-lbl">Starting slots</span>
          {slotKeys.map((k) => (
            <label key={k} className="hub-tr-slot">
              <span>{k}</span>
              <select
                className="hub-input"
                value={slots[k]}
                onChange={(e) => {
                  setSlots({ ...slots, [k]: Number(e.target.value) })
                  setAnalysis(null)
                }}
              >
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {/* ── The two sides ── */}
      <div className="hub-tr-sides">
        {(['a', 'b'] as const).map((side) => {
          const label = side === 'a' ? 'Side A' : 'Side B'
          const sidePlayers = side === 'a' ? sideA : sideB
          const setSide = side === 'a' ? setSideA : setSideB
          const roster = side === 'a' ? rosterA : rosterB
          const setRoster = side === 'a' ? setRosterA : setRosterB
          const sending = side === 'a' ? sendingA : sendingB

          return (
            <div key={side} className="hub-tr-side">
              <div className="hub-tr-side-head">
                <span className="hub-tr-side-name">{label}</span>
                <span className="hub-tr-side-sub">{rosterMode ? 'full roster · click players to send' : 'sends'}</span>
              </div>

              {rosterMode ? (
                <>
                  <PlayerSearch
                    placeholder={`Add to ${label}'s roster…`}
                    exclude={allIds}
                    onPick={(p) => {
                      setRoster([...roster, p])
                      setAnalysis(null)
                    }}
                  />
                  <div className="hub-tr-chips">
                    {roster.map((p) => (
                      <Chip
                        key={p.id}
                        p={p}
                        sending={sending.has(p.id)}
                        onToggle={() => toggleSend(side, p.id)}
                        onRemove={() => {
                          setRoster(roster.filter((x) => x.id !== p.id))
                          const set = new Set(sending)
                          set.delete(p.id)
                          if (side === 'a') setSendingA(set)
                          else setSendingB(set)
                          setAnalysis(null)
                        }}
                      />
                    ))}
                    {roster.length === 0 && <div className="hub-tr-empty">Build the roster, then click the players this side sends.</div>}
                  </div>
                </>
              ) : (
                <>
                  <PlayerSearch
                    placeholder={`${label} sends…`}
                    exclude={allIds}
                    onPick={(p) => {
                      setSide([...sidePlayers, p])
                      setAnalysis(null)
                    }}
                  />
                  <div className="hub-tr-chips">
                    {sidePlayers.map((p) => (
                      <Chip
                        key={p.id}
                        p={p}
                        onRemove={() => {
                          setSide(sidePlayers.filter((x) => x.id !== p.id))
                          setAnalysis(null)
                        }}
                      />
                    ))}
                    {sidePlayers.length === 0 && <div className="hub-tr-empty">Search a player to start the package.</div>}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="hub-tr-actions">
        <button type="button" className="hub-btn" onClick={analyze} disabled={!ready || busy}>
          {busy ? 'Weighing…' : 'Analyze the trade →'}
        </button>
        {analysis && !published && (
          <button type="button" className="hub-btn-ghost" onClick={publish} disabled={publishing}>
            {publishing ? 'Posting…' : 'Post to the board'}
          </button>
        )}
        {published && <span className="hub-promo-msg ok">Posted — it&apos;s on the docket below.</span>}
        {error && <span className="hub-promo-msg err">{error}</span>}
      </div>

      {/* ── Result ── */}
      {analysis && (
        <div className="hub-tr-result">
          <div className="hub-tr-callout">
            <div className="hub-tr-callout-kicker">{analysis.valuationLabel} · {analysis.usesRosters ? 'starting-lineup impact' : 'raw asset value'}</div>
            <div className="hub-tr-callout-line">
              {Math.abs(analysis.deltaPct) < 0.03
                ? 'Dead even. Shake hands.'
                : `${analysis.deltaPct > 0 ? 'Side A' : 'Side B'} wins this swap${Math.abs(analysis.deltaPct) >= 0.15 ? ' — comfortably' : ''}.`}
            </div>
          </div>
          <div className="hub-tr-result-grid">
            {([['Side A', analysis.sideA, analysis.sideB], ['Side B', analysis.sideB, analysis.sideA]] as const).map(
              ([name, mine, theirs]) => (
                <div key={name} className="hub-tr-report">
                  <div className="hub-tr-report-head">
                    <span className="hub-tr-side-name">{name}</span>
                    <span className={`hub-tr-grade g-${mine.grade.replace('+', 'p').replace('-', 'm')}`}>{mine.grade}</span>
                  </div>
                  <p className="hub-tr-verdict">{mine.verdict}</p>
                  {mine.starterBefore !== null && (
                    <div className="hub-tr-starters">
                      Lineup {mine.starterBefore.toLocaleString()} → <strong>{(mine.starterAfter ?? 0).toLocaleString()}</strong>
                    </div>
                  )}
                  <div className="hub-tr-flow">
                    <div className="hub-tr-flow-col">
                      <span className="hub-tr-flow-lbl">Sends · {mine.total.toLocaleString()}</span>
                      {mine.assets.map((a) => (
                        <div key={a.id} className="hub-tr-row">
                          <span className="hub-tr-pos">{a.position}</span>
                          <span className="hub-tr-row-name">{a.name}</span>
                          <span className="hub-tr-row-val">{a.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <div className="hub-tr-flow-col">
                      <span className="hub-tr-flow-lbl">Gets · {theirs.total.toLocaleString()}</span>
                      {theirs.assets.map((a) => (
                        <div key={a.id} className="hub-tr-row">
                          <span className="hub-tr-pos">{a.position}</span>
                          <span className="hub-tr-row-name">{a.name}</span>
                          <span className="hub-tr-row-val">{a.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Board vote bar ────────────────────────────────────────────────────────
export function VoteBar({
  tradeId,
  initialCounts,
  initialMine,
  signedIn,
}: {
  tradeId: string
  initialCounts: { a: number; fair: number; b: number }
  initialMine: 'a' | 'fair' | 'b' | null
  signedIn: boolean
}) {
  const [counts, setCounts] = useState(initialCounts)
  const [mine, setMine] = useState(initialMine)
  const [busy, setBusy] = useState(false)

  async function cast(vote: 'a' | 'fair' | 'b') {
    if (!signedIn || busy) return
    const next = mine === vote ? null : vote
    const prevMine = mine
    const prevCounts = counts
    const c = { ...counts }
    if (prevMine) c[prevMine] = Math.max(0, c[prevMine] - 1)
    if (next) c[next] += 1
    setMine(next)
    setCounts(c)
    setBusy(true)
    try {
      const res = await fetch('/api/hub/analyzer/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeId, vote: next }),
      })
      if (!res.ok) {
        setMine(prevMine)
        setCounts(prevCounts)
      }
    } catch {
      setMine(prevMine)
      setCounts(prevCounts)
    } finally {
      setBusy(false)
    }
  }

  const total = counts.a + counts.fair + counts.b
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  return (
    <div className="hub-tr-votes" title={signedIn ? undefined : 'Sign in to vote'}>
      {(
        [
          ['a', 'Side A'],
          ['fair', 'Fair'],
          ['b', 'Side B'],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={`hub-tr-vote${mine === key ? ' on' : ''}`}
          onClick={() => cast(key)}
          disabled={!signedIn}
          aria-pressed={mine === key}
        >
          <span className="hub-tr-vote-lbl">{label}</span>
          <span className="hub-tr-vote-n">{total > 0 ? `${pct(counts[key])}%` : '—'}</span>
        </button>
      ))}
      <span className="hub-tr-vote-total">{total} {total === 1 ? 'vote' : 'votes'}</span>
    </div>
  )
}
