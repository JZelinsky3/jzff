'use client'

// Trade Room client: the analyzer studio (player search, settings, optional
// roster mode, analyze + publish) and the board's vote bars. All math runs
// server-side (/api/hub/analyzer); this file is pure UI state.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
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

// Position-ordered display: QBs first, then RB/WR/TE — applied to roster
// and side chip lists as soon as players are added.
const POS_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3 }
function sortByPosition<T extends { position: string; name: string }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9) || a.name.localeCompare(b.name)
  )
}

// Sleeper CDN headshot — same source the league Analyzer/Finder use.
// Hides itself if the CDN has no photo (picks, obscure ids).
export function Headshot({ id, size = 26 }: { id: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="hub-tr-mug"
      src={`https://sleepercdn.com/content/nfl/players/thumb/${encodeURIComponent(id)}.jpg`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={(e) => {
        ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
      }}
    />
  )
}

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
                <Headshot id={r.id} size={24} />
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
      <Headshot id={p.id} size={22} />
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
        setError(json.error ?? 'Analysis failed. Try again.')
        setAnalysis(null)
      } else {
        setAnalysis(json.analysis)
      }
    } catch {
      setError('Network hiccup. Try again.')
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
        setError(json.error ?? 'Publish failed. Try again.')
      } else {
        setPublished(true)
        router.refresh()
      }
    } catch {
      setError('Network hiccup. Try again.')
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
          const label = side === 'a' ? 'You' : 'They'
          const sidePlayers = side === 'a' ? sideA : sideB
          const setSide = side === 'a' ? setSideA : setSideB
          const roster = side === 'a' ? rosterA : rosterB
          const setRoster = side === 'a' ? setRosterA : setRosterB
          const sending = side === 'a' ? sendingA : sendingB

          return (
            <div key={side} className="hub-tr-side">
              <div className="hub-tr-side-head">
                <span className="hub-tr-side-name">{label}</span>
                <span className="hub-tr-side-sub">{rosterMode ? 'full roster · click players to send' : 'send'}</span>
              </div>

              {rosterMode ? (
                <>
                  <PlayerSearch
                    placeholder={side === 'a' ? 'Add to your roster…' : 'Add to their roster…'}
                    exclude={allIds}
                    onPick={(p) => {
                      setRoster([...roster, p])
                      setAnalysis(null)
                    }}
                  />
                  <div className="hub-tr-chips">
                    {sortByPosition(roster).map((p) => (
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
                    placeholder={side === 'a' ? 'You send…' : 'They send…'}
                    exclude={allIds}
                    onPick={(p) => {
                      setSide([...sidePlayers, p])
                      setAnalysis(null)
                    }}
                  />
                  <div className="hub-tr-chips">
                    {sortByPosition(sidePlayers).map((p) => (
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
        {published && <span className="hub-promo-msg ok">Posted. It&apos;s on the docket below.</span>}
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
                : `${analysis.deltaPct > 0 ? 'You win' : 'They win'} this swap by ${(Math.abs(analysis.deltaPct) * 100).toFixed(1)}%${Math.abs(analysis.deltaPct) >= 0.15 ? ', comfortably' : ''}.`}
            </div>
            <div className="hub-tr-scale">
              {analysis.usesRosters
                ? 'Grades = change in your optimal starting lineup · B ±3% · B+ +3% · A− +8% · A +15% · A+ +25%'
                : 'Grades = raw value received vs sent · B ±2% · B+ +2% · A− +5% · A +12% · A+ +18%'}
            </div>
          </div>
          {/* One report, not two mirrored cards: both managers' grades and
              reads sit up top, then each package is shown once (what you
              send / what you get) instead of repeating them flipped. */}
          <div className="hub-tr-report">
            <div className="hub-tr-reads">
              {([['You', analysis.sideA], ['They', analysis.sideB]] as const).map(([name, s]) => (
                <div key={name} className="hub-tr-read">
                  <span className={`hub-tr-grade g-${s.grade.replace('+', 'p').replace('-', 'm')}`}>{s.grade}</span>
                  <div className="hub-tr-read-body">
                    <span className="hub-tr-read-name">{name}</span>
                    <p className="hub-tr-verdict">{s.verdict}</p>
                    {s.starterBefore !== null && (
                      <div className="hub-tr-starters">
                        Lineup {s.starterBefore.toLocaleString()} → <strong>{(s.starterAfter ?? 0).toLocaleString()}</strong>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="hub-tr-flow">
              {([['You send', analysis.sideA], ['You get', analysis.sideB]] as const).map(([label, s]) => (
                <div key={label} className="hub-tr-flow-col">
                  <span className="hub-tr-flow-lbl">{label} · {s.total.toLocaleString()}</span>
                  {s.assets.map((a) => (
                    <div key={a.id} className="hub-tr-row">
                      <Headshot id={a.id} size={22} />
                      <span className="hub-tr-pos">{a.position}</span>
                      <span className="hub-tr-row-name">{a.name}</span>
                      <span className="hub-tr-row-val">{a.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Board ballot — the Rumor Mill's signature pill switch ────────────────
// Left end signs the deal (signature, green), right end shreds it
// (scissors, red). Click an end to vote, click again to retract.

const SIGN_ICON = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m21 17-2.156-1.868A.5.5 0 0 0 18 15.5v.5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1c0-2.545-3.991-3.97-8.5-4a1 1 0 0 0 0 5c4.153 0 4.745-11.295 5.708-13.5a2.5 2.5 0 1 1 3.31 3.284" />
    <path d="M3 21h18" />
  </svg>
)
const SHRED_ICON = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
)

export function Ballot({
  tradeId,
  initialCounts,
  initialMine,
  signedIn,
}: {
  tradeId: string
  initialCounts: { sign: number; shred: number }
  initialMine: 'sign' | 'shred' | null
  signedIn: boolean
}) {
  const [counts, setCounts] = useState(initialCounts)
  const [mine, setMine] = useState(initialMine)
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState(false)

  // Signed-out taps don't cast — they open the sign-in prompt instead.
  function onSide(vote: 'sign' | 'shred') {
    if (!signedIn) { setPrompt(true); return }
    cast(vote)
  }

  async function cast(vote: 'sign' | 'shred') {
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

  return (
    <div className="hub-ballot-row">
      <div className="hub-ballot">
        <button
          type="button"
          className="hub-ballot-side sign"
          aria-pressed={mine === 'sign'}
          aria-label={signedIn ? "Sign it: you'd do this deal" : 'Sign in to vote'}
          title={signedIn ? "Sign it: you'd do this deal" : 'Sign in to vote'}
          onClick={() => onSide('sign')}
        >
          {SIGN_ICON}
          <span className="hub-ballot-n">{counts.sign}</span>
        </button>
        <span className="hub-ballot-divider" aria-hidden />
        <button
          type="button"
          className="hub-ballot-side shred"
          aria-pressed={mine === 'shred'}
          aria-label={signedIn ? 'Shred it: into the bin' : 'Sign in to vote'}
          title={signedIn ? 'Shred it: into the bin' : 'Sign in to vote'}
          onClick={() => onSide('shred')}
        >
          {SHRED_ICON}
          <span className="hub-ballot-n">{counts.shred}</span>
        </button>
      </div>
      {prompt && <SignInToVote onClose={() => setPrompt(false)} />}
    </div>
  )
}

// Sign-in prompt shown when a signed-out reader taps a vote button.
// Portaled to document.body — the ballot lives inside a .hub-reveal
// (transformed), which would otherwise trap a position: fixed overlay.
function SignInToVote({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div
      className="hub-vote-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hub-vote-title"
      onClick={onClose}
    >
      <div className="hub-vote-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="hub-vote-close" aria-label="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <div className="hub-vote-eyebrow">★ The docket</div>
        <h3 className="hub-vote-title" id="hub-vote-title">Sign in to vote.</h3>
        <p className="hub-vote-body">
          Signing and shredding trades is for members. It&apos;s free to join, and the
          whole analyzer comes with it.
        </p>
        <div className="hub-vote-actions">
          <Link href="/login?from=%2Fhub%2Fanalyzer" className="hub-btn">Sign in</Link>
          <Link href="/login?mode=signup&from=%2Fhub%2Fanalyzer" className="hub-btn-ghost">Join the Chronicle</Link>
        </div>
      </div>
    </div>,
    document.body,
  )
}
