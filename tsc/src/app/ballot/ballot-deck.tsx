'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { submitBallot } from './actions'
import { GAMES, TOTAL_WINS, DRIFT, type BallotManager, type Picks } from '@/lib/winBallot'

const TITLE = 0
const DRAFT_KEY = 'wb_draft_2026'

type Draft = { who: string; picks: Picks; idx: number }

// Read once, during the first render, rather than in an effect: restoring in
// an effect means a second render pass, and on a page that ships without SSR
// there's nothing to mismatch against.
function readDraft(roster: BallotManager[], review: number): Draft {
  const empty: Draft = { who: '', picks: {}, idx: TITLE }
  if (typeof window === 'undefined') return empty
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return empty
    const d = JSON.parse(raw) as Partial<Draft>
    const picks: Picks = {}
    if (d.picks && typeof d.picks === 'object') {
      for (const m of roster) {
        const v = d.picks[m.name]
        if (Number.isInteger(v) && v >= 0 && v <= GAMES) picks[m.name] = v
      }
    }
    const who = typeof d.who === 'string' && roster.some((m) => m.name === d.who) ? d.who : ''
    // A draft whose name the roster no longer has can't be filed from where
    // it left off, so send it back to the front rather than stranding it.
    const idx = !who ? TITLE
      : Number.isInteger(d.idx) && d.idx! >= TITLE && d.idx! <= review ? d.idx!
      : TITLE
    return { who, picks, idx }
  } catch {
    return empty
  }
}

type View = 'deck' | 'sent'
type Sheet = {
  message: string
  yes: string
  no?: string
  onYes: () => void
} | null

export function BallotDeck({
  leagueId,
  token,
  roster,
  alreadyIn,
}: {
  leagueId: string
  token: string
  roster: BallotManager[]
  alreadyIn: string[]
}) {
  const REVIEW = roster.length + 1

  const [draft] = useState(() => readDraft(roster, roster.length + 1))
  const [who, setWho] = useState(draft.who)
  const [picks, setPicks] = useState<Picks>(draft.picks)
  const [idx, setIdx] = useState(draft.idx)
  const [view, setView] = useState<View>('deck')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taken, setTaken] = useState<string[]>(alreadyIn)
  const stageRef = useRef<HTMLDivElement>(null)

  // Keep a draft on the device so a dropped connection or a closed tab
  // doesn't cost somebody twelve decisions. Cleared once the ballot lands.
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ who, picks, idx }))
    } catch { /* private mode, no draft */ }
  }, [who, picks, idx])

  useEffect(() => {
    stageRef.current?.scrollTo?.(0, 0)
    window.scrollTo(0, 0)
  }, [idx, view])

  const filled = roster.filter((m) => Number.isFinite(picks[m.name])).length
  const blanks = roster.filter((m) => !Number.isFinite(picks[m.name]))
  const sum = roster.reduce((a, m) => a + (picks[m.name] ?? 0), 0)
  const drifted = blanks.length === 0 && Math.abs(sum - TOTAL_WINS) > DRIFT

  const setWins = useCallback((name: string, raw: number) => {
    const wins = Math.max(0, Math.min(GAMES, Math.round(raw)))
    setPicks((p) => ({ ...p, [name]: wins }))
  }, [])

  async function send() {
    setBusy(true)
    setError(null)
    const result = await submitBallot({ leagueId, token, managerName: who, picks })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      // A name taken out from under them (someone else filed it) should grey
      // out on the title slide rather than just erroring again.
      if (result.error.includes('already sent')) setTaken((t) => [...new Set([...t, who])])
      return
    }
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* fine */ }
    setView('sent')
  }

  function askToSend() {
    if (!who) { setIdx(TITLE); return }
    if (blanks.length > 0) {
      setSheet({
        message: `Still no number for ${blanks.map((m) => m.name).join(', ')}.`,
        yes: 'Go there',
        onYes: () => { setSheet(null); setIdx(roster.indexOf(blanks[0]) + 1) },
      })
      return
    }
    const off = sum - TOTAL_WINS
    const warn = Math.abs(off) > DRIFT
      ? `\n\nYour board adds to ${sum}. A season only holds 84 wins, so you're ${Math.abs(off)} ${off > 0 ? 'over' : 'under'}. Send it anyway?`
      : ''
    setSheet({
      message: `Send your ballot as ${who}?\n\nThat's final. Once it's in, this name is closed.${warn}`,
      yes: 'Send it',
      no: 'Not yet',
      onYes: () => { setSheet(null); void send() },
    })
  }

  // ── Sent ──────────────────────────────────────────────────────────────
  if (view === 'sent') {
    return (
      <div className="wb">
        <div className="wb-shell">
          <div className="wb-stage">
            <div className="wb-slide wb-receipt">
              <div className="wb-stamp">In</div>
              <h2>That&apos;s {who}&apos;s ballot.</h2>
              <p>
                It landed. Nothing to send anybody, nothing else to do. Joey sees
                it the second he looks.
              </p>
              <p className="wb-fine">
                {taken.length + 1} of {roster.length} ballots are in. When they all
                land, the twelve get averaged into one line per manager, and the
                whole league comes back to take the over or the under.
              </p>
            </div>
          </div>
          <div className="wb-foot">PA Milk Society · 2026</div>
        </div>
      </div>
    )
  }

  // ── Deck ──────────────────────────────────────────────────────────────
  const onDeck = idx > TITLE
  const m = onDeck && idx <= roster.length ? roster[idx - 1] : null

  return (
    <div className="wb">
      <div className="wb-shell">
        {onDeck && (
          <div className="wb-rail">
            <div className="wb-rail-track">
              <div className="wb-rail-fill" style={{ width: `${(filled / roster.length) * 100}%` }} />
            </div>
            <div className="wb-rail-count">
              {idx === REVIEW ? `${filled} of ${roster.length}` : `${idx} of ${roster.length}`}
            </div>
          </div>
        )}

        <div className="wb-stage" ref={stageRef}>
          {idx === TITLE && (
            <TitleSlide
              roster={roster}
              taken={taken}
              who={who}
              onPick={setWho}
            />
          )}

          {m && (
            <ManagerSlide
              key={m.name}
              manager={m}
              wins={picks[m.name]}
              isSelf={m.name === who}
              index={idx}
              count={roster.length}
              onSet={(v) => setWins(m.name, v)}
            />
          )}

          {idx === REVIEW && (
            <ReviewSlide
              roster={roster}
              picks={picks}
              sum={sum}
              blanks={blanks.length}
              drifted={drifted}
              onGoto={setIdx}
            />
          )}
        </div>

        {error && (
          <div className="wb-note-red" role="alert">
            <strong>Didn&apos;t send.</strong> {error}
          </div>
        )}

        <div className="wb-nav">
          {idx > TITLE && (
            <button className="wb-btn wb-btn-back" type="button" aria-label="Back"
                    onClick={() => setIdx((i) => Math.max(TITLE, i - 1))}>
              ‹
            </button>
          )}
          <button
            className="wb-btn"
            type="button"
            disabled={nextDisabled()}
            onClick={() => (idx === REVIEW ? askToSend() : setIdx((i) => i + 1))}
          >
            {nextLabel()}
          </button>
        </div>

        {idx === TITLE && <div className="wb-foot">Records 2019 through 2025</div>}
      </div>

      {sheet && (
        <div className="wb-sheet" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null) }}>
          <div className="wb-sheet-card" role="dialog" aria-modal="true">
            <p className="wb-sheet-msg">{sheet.message}</p>
            <div className="wb-sheet-actions">
              {sheet.no && (
                <button className="wb-btn wb-btn-quiet" type="button" onClick={() => setSheet(null)}>
                  {sheet.no}
                </button>
              )}
              <button className="wb-btn" type="button" onClick={sheet.onYes}>{sheet.yes}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  function nextDisabled() {
    if (busy) return true
    if (idx === TITLE) return !who || taken.includes(who)
    if (idx === REVIEW) return blanks.length > 0 || !who
    return !Number.isFinite(picks[roster[idx - 1].name])
  }

  function nextLabel() {
    if (busy) return 'Sending…'
    if (idx === TITLE) return who ? 'Start' : 'Pick your name'
    if (idx === REVIEW) return blanks.length > 0 ? `${blanks.length} still blank` : 'Send ballot'
    return idx === roster.length ? 'Review' : 'Next'
  }
}

function TitleSlide({
  roster, taken, who, onPick,
}: {
  roster: BallotManager[]
  taken: string[]
  who: string
  onPick: (n: string) => void
}) {
  return (
    <div className="wb-slide">
      <div className="wb-card">
        <div className="wb-card-top"><span>PA Milk Society</span><span>Form W/L · 2026</span></div>
        <h1>Call all <em>twelve.</em></h1>
        <div className="wb-card-sub">Win-total ballot · 14 games</div>
      </div>

      <div className="wb-brief">
        <p>
          You&apos;ll get one manager at a time. Give every one of them a win
          total, <strong>yourself included</strong>. Nobody sees your numbers
          and you won&apos;t see theirs.
        </p>
        <p>
          When all twelve are in, they get averaged into one number per manager.
          That average becomes the line, and everybody comes back to take the
          over or the under.
        </p>
        <div className="wb-note">
          There are 84 wins in a season. Land near it and your board is honest.
        </div>
      </div>

      <div className="wb-eyebrow">Who&apos;s filing this</div>
      <div className="wb-names">
        {roster.map((m) => {
          const done = taken.includes(m.name)
          return (
            <button
              key={m.name}
              className="wb-name-btn"
              type="button"
              disabled={done}
              aria-pressed={who === m.name}
              onClick={() => onPick(m.name)}
            >
              {m.name}
              {done && <em>in</em>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ManagerSlide({
  manager, wins, isSelf, index, count, onSet,
}: {
  manager: BallotManager
  wins: number | undefined
  isSelf: boolean
  index: number
  count: number
  onSet: (v: number) => void
}) {
  const set = Number.isFinite(wins)
  const at = (v: number) => `calc(var(--wb-thumb) / 2 + (100% - var(--wb-thumb)) * ${v / GAMES})`

  return (
    <div className="wb-slide">
      <div className="wb-eyebrow">Manager {index} of {count}</div>
      <div className="wb-mgr-head">
        <h2 className="wb-mgr-name">{manager.name}</h2>
        <span className="wb-conf" data-conf={manager.conference}>{manager.conference}</span>
        {isSelf && <span className="wb-you">You</span>}
      </div>

      <div className="wb-figures">
        <div className="wb-fig">
          <span className="wb-fig-label">Best</span>
          <span className="wb-fig-val">{manager.best}<span className="wb-yr">&apos;{String(manager.bestYear).slice(2)}</span></span>
        </div>
        <div className="wb-fig">
          <span className="wb-fig-label">Worst</span>
          <span className="wb-fig-val">{manager.worst}<span className="wb-yr">&apos;{String(manager.worstYear).slice(2)}</span></span>
        </div>
        <div className="wb-fig" data-tone="avg">
          <span className="wb-fig-label">Avg wins</span>
          <span className="wb-fig-val">{manager.avgWins.toFixed(1)}</span>
        </div>
        <div className="wb-fig">
          <span className="wb-fig-label">Last year</span>
          <span className="wb-fig-val">{manager.lastRecord}</span>
        </div>
        <div className="wb-fig">
          <span className="wb-fig-label">Career</span>
          <span className="wb-fig-val">{manager.career}</span>
        </div>
        <div className="wb-fig">
          <span className="wb-fig-label">Seasons</span>
          <span className="wb-fig-val">{manager.seasons}</span>
        </div>
      </div>

      <div className="wb-ask">Their 2026 season</div>

      <div className="wb-dial" data-set={set}>
        <button
          className="wb-knob"
          type="button"
          aria-label="One fewer win"
          disabled={wins === 0}
          // The first nudge lands on the model rather than climbing from
          // zero, which is the whole point of showing one.
          onClick={() => onSet(set ? (wins as number) - 1 : Math.round(manager.model))}
        >
          –
        </button>
        <div className="wb-readout">
          <div className="wb-readout-no">{set ? wins : manager.model.toFixed(1)}</div>
          <div className="wb-readout-rec">
            {set ? `${wins}-${GAMES - (wins as number)}` : 'the model, not your call'}
          </div>
        </div>
        <button
          className="wb-knob"
          type="button"
          aria-label="One more win"
          disabled={wins === GAMES}
          onClick={() => onSet(set ? (wins as number) + 1 : Math.round(manager.model))}
        >
          +
        </button>
      </div>

      <div className="wb-scale">
        <div
          className="wb-scale-band"
          aria-hidden="true"
          style={{
            left: at(manager.worstWins),
            width: `calc((100% - var(--wb-thumb)) * ${(manager.bestWins - manager.worstWins) / GAMES})`,
          }}
        />
        <div className="wb-scale-model" aria-hidden="true" style={{ left: at(manager.model) }}>
          <span>{manager.model.toFixed(1)}</span>
        </div>
        <div className="wb-scale-track" aria-hidden="true" />
        {set && <div className="wb-scale-dot" aria-hidden="true" style={{ left: at(wins as number) }} />}
        <input
          type="range"
          min={0}
          max={GAMES}
          step={1}
          value={set ? wins : Math.round(manager.model)}
          aria-label={`Wins for ${manager.name}`}
          onChange={(e) => onSet(Number(e.target.value))}
        />
        <div className="wb-scale-ends" aria-hidden="true"><span>0</span><span>7</span><span>{GAMES}</span></div>
      </div>

      <div className="wb-key">
        <span className="wb-key-band">career range {manager.worstWins} to {manager.bestWins}</span>
        <span className="wb-key-model">model {manager.model.toFixed(1)}</span>
      </div>
    </div>
  )
}

function ReviewSlide({
  roster, picks, sum, blanks, drifted, onGoto,
}: {
  roster: BallotManager[]
  picks: Picks
  sum: number
  blanks: number
  drifted: boolean
  onGoto: (i: number) => void
}) {
  return (
    <div className="wb-slide">
      <div className="wb-eyebrow">Your board</div>
      <h2 style={{ fontFamily: 'var(--wb-serif)', fontSize: '1.7rem', margin: '.2rem 0 .1rem' }}>
        Last look before it goes.
      </h2>
      <div className="wb-review">
        {roster.map((m, i) => {
          const w = picks[m.name]
          const has = Number.isFinite(w)
          return (
            <button
              key={m.name}
              className="wb-review-row"
              type="button"
              data-blank={!has}
              onClick={() => onGoto(i + 1)}
            >
              <span className="wb-review-name">{m.name}</span>
              <span className="wb-review-rec">{has ? `${w}-${GAMES - w}` : 'tap to call this one'}</span>
              <span className="wb-review-no">{has ? w : '?'}</span>
            </button>
          )
        })}
      </div>
      {blanks > 0 && (
        <div className="wb-note-red">
          {blanks === 1 ? 'One manager has no number yet' : `${blanks} managers have no number yet`}.
          Tap the red {blanks === 1 ? 'row' : 'rows'} above to finish.
        </div>
      )}
      <div className="wb-tally" data-tone={drifted ? 'off' : ''}>
        <b>{sum}</b>
        <span>
          {blanks > 0
            ? `so far · ${blanks} still blank`
            : drifted
            ? sum > TOTAL_WINS ? 'high · 84 wins exist' : 'low · 84 wins exist'
            : 'of 84 wins allotted'}
        </span>
      </div>
    </div>
  )
}
