'use client'

import { useEffect, useRef, useState } from 'react'
import { submitVote } from './actions'
import {
  GAMES, PROPS, RIVALRIES, missingFromVote, rivalryKey, voteSize,
  type BallotManager, type LockedBoard, type Side, type VoteCard,
} from '@/lib/winBallot'

const DRAFT_KEY = 'wb_vote_2026'
const VOTED_KEY = 'wb_voted_2026'

// Stages, in the order the card walks them.
const TITLE = 0
const LINES = 1
const PROPS_STAGE = 2
const RIVALRY = 3
const REVIEW = 4

type Draft = { who: string; card: VoteCard; stage: number }

const EMPTY_CARD: VoteCard = { lines: {}, props: {}, rivalry: {} }

// Read during the first render rather than in an effect. The page ships
// without SSR, so there is nothing to mismatch against, and restoring in an
// effect would cost a second pass.
function readDraft(roster: BallotManager[]): Draft {
  const empty: Draft = { who: '', card: EMPTY_CARD, stage: TITLE }
  if (typeof window === 'undefined') return empty
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return empty
    const d = JSON.parse(raw) as Partial<Draft>
    const who = typeof d.who === 'string' && roster.some((m) => m.name === d.who) ? d.who : ''
    const card: VoteCard = { lines: {}, props: {}, rivalry: {} }
    for (const m of roster) {
      const v = d.card?.lines?.[m.name]
      // A side saved on the voter's own line predates a name change and is
      // dropped rather than carried into a card that can't hold it.
      if (m.name !== who && (v === 'over' || v === 'under')) card.lines[m.name] = v
    }
    for (const p of PROPS) {
      const v = d.card?.props?.[p.key]
      if (typeof v === 'string' && v) card.props[p.key] = v
    }
    for (const pair of RIVALRIES) {
      const key = rivalryKey(pair)
      const v = d.card?.rivalry?.[key]
      if (typeof v === 'string' && pair.includes(v)) card.rivalry[key] = v
    }
    const stage = !who ? TITLE
      : Number.isInteger(d.stage) && d.stage! >= TITLE && d.stage! <= REVIEW ? d.stage!
      : TITLE
    return { who, card, stage }
  } catch {
    return empty
  }
}

type Sheet = { message: string; yes: string; no?: string; onYes: () => void } | null

export function VoteDeck({
  leagueId, token, roster, board, alreadyVoted,
}: {
  leagueId: string
  token: string
  roster: BallotManager[]
  board: LockedBoard
  alreadyVoted: string[]
}) {
  const [draft] = useState(() => readDraft(roster))
  const [who, setWho] = useState(draft.who)
  const [card, setCard] = useState<VoteCard>(draft.card)
  const [stage, setStage] = useState(draft.stage)
  const [sent, setSent] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taken, setTaken] = useState<string[]>(alreadyVoted)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ who, card, stage })) } catch { /* private mode */ }
  }, [who, card, stage])

  useEffect(() => {
    stageRef.current?.scrollTo?.(0, 0)
    window.scrollTo(0, 0)
  }, [stage, sent])

  const others = roster.filter((m) => m.name !== who)
  const missing = missingFromVote(roster, who, card)
  const owed = voteSize(roster)
  const made = owed - missing.lines.length - missing.props.length - missing.rivalry.length

  function setSide(name: string, side: Side) {
    setCard((c) => ({ ...c, lines: { ...c.lines, [name]: side } }))
  }
  function setProp(key: string, answer: string) {
    setCard((c) => ({ ...c, props: { ...c.props, [key]: answer } }))
  }
  function setGame(key: string, winner: string) {
    setCard((c) => ({ ...c, rivalry: { ...c.rivalry, [key]: winner } }))
  }

  // Changing your name mid-card would leave a side sitting on your own line,
  // which the server refuses. Drop it as the name changes.
  function pickName(name: string) {
    setWho(name)
    setCard((c) => {
      if (!(name in c.lines)) return c
      const lines = { ...c.lines }
      delete lines[name]
      return { ...c, lines }
    })
  }

  async function send() {
    setBusy(true)
    setError(null)
    const result = await submitVote({ leagueId, token, managerName: who, card })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      if (result.error.includes('already voted')) setTaken((t) => [...new Set([...t, who])])
      return
    }
    try {
      localStorage.removeItem(DRAFT_KEY)
      localStorage.setItem(VOTED_KEY, who)
    } catch { /* fine */ }
    setSent(true)
  }

  function askToSend() {
    if (!who) { setStage(TITLE); return }
    const short = missing.lines.length + missing.props.length + missing.rivalry.length
    if (short > 0) {
      setSheet({
        message: `${short} call${short === 1 ? ' is' : 's are'} still blank.`,
        yes: 'Go there',
        onYes: () => {
          setSheet(null)
          setStage(missing.lines.length ? LINES : missing.props.length ? PROPS_STAGE : RIVALRY)
        },
      })
      return
    }
    setSheet({
      message: `Send your card as ${who}?\n\nThat's final. Once it's in, this name is closed.`,
      yes: 'Send it',
      no: 'Not yet',
      onYes: () => { setSheet(null); void send() },
    })
  }

  // ── Sent ──────────────────────────────────────────────────────────────
  if (sent) {
    return (
      <div className="wb">
        <div className="wb-shell">
          <div className="wb-stage">
            <div className="wb-slide wb-receipt">
              <div className="wb-stamp">In</div>
              <h2>That&apos;s {who}&apos;s card.</h2>
              <p>
                Locked in. Nothing to send anybody, nothing else to do.
              </p>
              <p className="wb-fine">
                {taken.length + 1} of {roster.length} cards are in. Nobody sees a
                single pick, yours included, until Joey opens the room. When he
                does, this same link turns into the board.
              </p>
            </div>
          </div>
          <div className="wb-foot">PA Milk Society · 2026</div>
        </div>
      </div>
    )
  }

  // ── Card ──────────────────────────────────────────────────────────────
  return (
    <div className="wb">
      <div className="wb-shell">
        {stage > TITLE && (
          <div className="wb-rail">
            <div className="wb-rail-track">
              <div className="wb-rail-fill" style={{ width: `${(made / owed) * 100}%` }} />
            </div>
            <div className="wb-rail-count">{made} of {owed}</div>
          </div>
        )}

        <div className="wb-stage" ref={stageRef}>
          {stage === TITLE && (
            <TitleSlide
              roster={roster}
              board={board}
              taken={taken}
              who={who}
              onPick={pickName}
            />
          )}

          {stage === LINES && (
            <div className="wb-slide">
              <div className="wb-eyebrow">The lines · over or under</div>
              <h2 className="wb-stage-title">Eleven calls.</h2>
              <p className="wb-stage-note">
                The room set these off the ballots. Your own line isn&apos;t here,
                and nothing lands on a whole number, so nothing pushes.
              </p>
              <div className="wb-lines">
                {others.map((m) => (
                  <LineRow
                    key={m.name}
                    manager={m}
                    line={board.lines[m.name] ?? 0}
                    side={card.lines[m.name]}
                    onSide={(s) => setSide(m.name, s)}
                  />
                ))}
              </div>
            </div>
          )}

          {stage === PROPS_STAGE && (
            <div className="wb-slide">
              <div className="wb-eyebrow">The props · four calls</div>
              <h2 className="wb-stage-title">Name names.</h2>
              <p className="wb-stage-note">
                All four settle themselves off the finished season, so nobody has
                to argue about it in January.
              </p>
              {PROPS.map((p) => (
                <div key={p.key} className="wb-prop">
                  <div className="wb-prop-ask">{p.ask}</div>
                  <div className="wb-prop-note">{p.note}</div>
                  {p.kind === 'conference' ? (
                    <div className="wb-conf-pick">
                      {(['Whole', 'Skim'] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="wb-conf-btn"
                          data-conf={c}
                          aria-pressed={card.props[p.key] === c}
                          onClick={() => setProp(p.key, c)}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="wb-names">
                      {roster.map((m) => (
                        <button
                          key={m.name}
                          type="button"
                          className="wb-name-btn"
                          aria-pressed={card.props[p.key] === m.name}
                          onClick={() => setProp(p.key, m.name)}
                        >
                          {m.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {stage === RIVALRY && (
            <div className="wb-slide">
              <div className="wb-eyebrow">Rivalry week · six games</div>
              <h2 className="wb-stage-title">Pick the six.</h2>
              <p className="wb-stage-note">
                Everybody plays their rival. Call all six, your own included.
              </p>
              <div className="wb-games">
                {RIVALRIES.map((pair) => {
                  const key = rivalryKey(pair)
                  const picked = card.rivalry[key]
                  return (
                    <div key={key} className="wb-game" data-mine={pair.includes(who)}>
                      {pair.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className="wb-game-side"
                          aria-pressed={picked === name}
                          onClick={() => setGame(key, name)}
                        >
                          <span className="wb-game-name">{name}</span>
                          <span className="wb-game-line">
                            {(board.lines[name] ?? 0).toFixed(1)}
                          </span>
                        </button>
                      ))}
                      <span className="wb-game-v" aria-hidden="true">v</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {stage === REVIEW && (
            <ReviewSlide
              roster={roster}
              who={who}
              board={board}
              card={card}
              missing={missing}
              onGoto={setStage}
            />
          )}
        </div>

        {error && (
          <div className="wb-note-red" role="alert">
            <strong>Didn&apos;t send.</strong> {error}
          </div>
        )}

        <div className="wb-nav">
          {stage > TITLE && (
            <button className="wb-btn wb-btn-back" type="button" aria-label="Back"
                    onClick={() => setStage((s) => Math.max(TITLE, s - 1))}>
              ‹
            </button>
          )}
          <button
            className="wb-btn"
            type="button"
            disabled={nextDisabled()}
            onClick={() => (stage === REVIEW ? askToSend() : setStage((s) => s + 1))}
          >
            {nextLabel()}
          </button>
        </div>

        {stage === TITLE && (
          <div className="wb-foot">
            Lines set by {board.ballotCount} ballot{board.ballotCount === 1 ? '' : 's'}
          </div>
        )}
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
    if (stage === TITLE) return !who || taken.includes(who)
    if (stage === REVIEW) return !who || made < owed
    return false
  }

  function nextLabel() {
    if (busy) return 'Sending…'
    if (stage === TITLE) return who ? 'Start' : 'Pick your name'
    if (stage === LINES) return missing.lines.length ? `${missing.lines.length} line${missing.lines.length === 1 ? '' : 's'} left` : 'Props'
    if (stage === PROPS_STAGE) return missing.props.length ? `${missing.props.length} prop${missing.props.length === 1 ? '' : 's'} left` : 'Rivalry week'
    if (stage === RIVALRY) return missing.rivalry.length ? `${missing.rivalry.length} game${missing.rivalry.length === 1 ? '' : 's'} left` : 'Review'
    return made < owed ? `${owed - made} still blank` : 'Send card'
  }
}

function TitleSlide({
  roster, board, taken, who, onPick,
}: {
  roster: BallotManager[]
  board: LockedBoard
  taken: string[]
  who: string
  onPick: (n: string) => void
}) {
  const top = [...roster]
    .map((m) => ({ name: m.name, line: board.lines[m.name] ?? 0 }))
    .sort((a, b) => b.line - a.line)

  return (
    <div className="wb-slide">
      <div className="wb-card">
        <div className="wb-card-top"><span>PA Milk Society</span><span>Form O/U · 2026</span></div>
        <h1>The board is <em>up.</em></h1>
        <div className="wb-card-sub">Over/under · 14 games</div>
      </div>

      <div className="wb-brief">
        <p>
          Every ballot got averaged into one number per manager. Those are the
          lines, and they don&apos;t move again.
        </p>
        <p>
          Take a side on all of them but your own, call four props, and pick
          rivalry week. <strong>Nobody sees a pick</strong> until Joey opens the
          room.
        </p>
        <div className="wb-note">
          {board.basis === 'outsiders'
            ? 'Nobody helped set their own number: a manager’s line is the other eleven ballots only.'
            : 'Every ballot counts toward every line, including a manager’s own.'}
        </div>
      </div>

      <div className="wb-eyebrow">The lines</div>
      <div className="wb-peek">
        {top.map((l) => (
          <span key={l.name} className="wb-peek-cell">
            {l.name} <b>{l.line.toFixed(1)}</b>
          </span>
        ))}
      </div>

      <div className="wb-eyebrow" style={{ marginTop: '1.2rem' }}>Who&apos;s voting</div>
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

function LineRow({
  manager, line, side, onSide,
}: {
  manager: BallotManager
  line: number
  side: Side | undefined
  onSide: (s: Side) => void
}) {
  return (
    <div className="wb-line" data-set={!!side}>
      <div className="wb-line-head">
        <div>
          <div className="wb-line-name">{manager.name}</div>
          <div className="wb-line-sub">
            <span className="wb-conf-mark" data-conf={manager.conference}>{manager.conference}</span>
            {' · '}avg {manager.avgWins.toFixed(1)}
            {' · '}last year {manager.lastRecord}
          </div>
        </div>
        <div className="wb-line-no">{line.toFixed(1)}</div>
      </div>
      <div className="wb-sides">
        {(['over', 'under'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className="wb-side"
            data-side={s}
            aria-pressed={side === s}
            aria-label={`${manager.name} ${s} ${line.toFixed(1)}`}
            onClick={() => onSide(s)}
          >
            {s === 'over' ? 'Over' : 'Under'}
            <span>{s === 'over'
              ? `${Math.ceil(line)}+ wins`
              : `${Math.floor(line)} or fewer`}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ReviewSlide({
  roster, who, board, card, missing, onGoto,
}: {
  roster: BallotManager[]
  who: string
  board: LockedBoard
  card: VoteCard
  missing: ReturnType<typeof missingFromVote>
  onGoto: (s: number) => void
}) {
  const others = roster.filter((m) => m.name !== who)
  const overs = others.filter((m) => card.lines[m.name] === 'over').length
  const unders = others.filter((m) => card.lines[m.name] === 'under').length

  return (
    <div className="wb-slide">
      <div className="wb-eyebrow">Your card</div>
      <h2 className="wb-stage-title">Last look before it goes.</h2>

      <div className="wb-review">
        {others.map((m) => {
          const s = card.lines[m.name]
          return (
            <button
              key={m.name}
              className="wb-review-row"
              type="button"
              data-blank={!s}
              onClick={() => onGoto(LINES)}
            >
              <span className="wb-review-name">{m.name}</span>
              <span className="wb-review-rec">{(board.lines[m.name] ?? 0).toFixed(1)}</span>
              <span className="wb-review-no wb-review-side" data-side={s ?? ''}>
                {s ? (s === 'over' ? 'O' : 'U') : '?'}
              </span>
            </button>
          )
        })}
      </div>

      <div className="wb-eyebrow" style={{ marginTop: '1.3rem' }}>Props</div>
      <div className="wb-review">
        {PROPS.map((p) => (
          <button
            key={p.key}
            className="wb-review-row"
            type="button"
            data-blank={!card.props[p.key]}
            onClick={() => onGoto(PROPS_STAGE)}
          >
            <span className="wb-review-name">{p.ask}</span>
            <span className="wb-review-answer">{card.props[p.key] || 'tap to call it'}</span>
          </button>
        ))}
      </div>

      <div className="wb-eyebrow" style={{ marginTop: '1.3rem' }}>Rivalry week</div>
      <div className="wb-review">
        {RIVALRIES.map((pair) => {
          const key = rivalryKey(pair)
          const w = card.rivalry[key]
          return (
            <button
              key={key}
              className="wb-review-row"
              type="button"
              data-blank={!w}
              onClick={() => onGoto(RIVALRY)}
            >
              <span className="wb-review-name">{pair[0]} v {pair[1]}</span>
              <span className="wb-review-answer">{w || 'tap to call it'}</span>
            </button>
          )
        })}
      </div>

      {missing.lines.length + missing.props.length + missing.rivalry.length > 0 ? (
        <div className="wb-note-red">
          Tap the red rows above to finish.
        </div>
      ) : (
        <div className="wb-tally">
          <b>{overs}–{unders}</b>
          <span>overs to unders on {others.length} lines · {GAMES}-game season</span>
        </div>
      )}
    </div>
  )
}
