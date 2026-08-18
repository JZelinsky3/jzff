'use client'

import { useMemo, useState } from 'react'
import {
  QUESTIONS, ROSTER, VEINS, bandFor, roomSplit, sortedRows, standings, tableFor, veinLabel,
  type RunRecord, type StatTable,
} from '@/lib/milkExam'
import { readRuns, submitRun } from './actions'

const Tick = () => (
  <svg viewBox="0 0 12 12" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 6.3 4.4 9.2 10.5 2.8" />
  </svg>
)
const Cross = () => (
  <svg viewBox="0 0 12 12" fill="none" strokeWidth="2.2" strokeLinecap="round">
    <path d="M2.6 2.6 9.4 9.4M9.4 2.6 2.6 9.4" />
  </svg>
)

type Phase = 'claim' | 'play' | 'done'

export function GameDeck({
  token,
  leagueId,
  played,
  runs: initialRuns,
}: {
  token: string
  leagueId: string
  played: string[]
  runs: RunRecord[]
}) {
  const [phase, setPhase] = useState<Phase>('claim')
  const [name, setName] = useState<string | null>(null)
  const [i, setI] = useState(0)
  // Committed answers, one per question index. Nothing here is a score: the
  // total comes back from the server on submit, which is the only place
  // allowed to decide it.
  const [picks, setPicks] = useState<Record<string, string>>({})
  // Highlighted but not yet committed. Kept separate from `picks` so a tap can
  // be changed, which is the whole point of the confirm step.
  const [pending, setPending] = useState<string | null>(null)
  const [runs, setRuns] = useState<RunRecord[]>(initialRuns)
  const [score, setScore] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  const q = QUESTIONS[i]
  const committed = picks[String(i)]
  const answered = committed !== undefined
  const last = i === QUESTIONS.length - 1
  const allAnswered = QUESTIONS.every((_, n) => picks[String(n)] !== undefined)

  const board = useMemo(() => standings(runs), [runs])

  function goto(n: number) {
    setI(n)
    setPending(null)
    setErr('')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  function commit() {
    if (!pending || answered) return
    setPicks((p) => ({ ...p, [String(i)]: pending }))
    setPending(null)
  }

  async function file() {
    if (!name || !allAnswered) return
    setBusy(true)
    setErr('')
    const res = await submitRun(token, name, picks)
    setBusy(false)
    if (!res.ok) { setErr(res.error); return }
    setScore(res.score)
    setRuns(await readRuns(leagueId))
    setPhase('done')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  async function copyScore() {
    const band = bandFor(score)
    const grid = QUESTIONS.map((qq, n) => (picks[String(n)] === qq.answer ? 'O' : 'X')).join('')
    const text = `THE MILK EXAM\n${score}/${QUESTIONS.length}  ${band.name}\n${grid.slice(0, 10)}\n${grid.slice(10)}`
    try { await navigator.clipboard.writeText(text) } catch { /* blocked; the label still confirms */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  /* ---------------------------------------------------------- claim a name */
  if (phase === 'claim') {
    return (
      <div className="mx-shell">
        <Top right="Twenty questions" />
        {/* One line. The masthead already says how many questions there are,
            so an eyebrow saying it again is the third place on one screen. */}
        <div className="mx-stack">
          <h1>The<br />Milk Exam</h1>
          <p>Seven years of this league, and none of it is about last season.</p>
        </div>
        <div className="mx-stack" style={{ gap: 12 }}>
          <span className="mx-k is-dim">Who are you</span>
          <div className="mx-sheet">
            <div className="mx-sheet-hd">
              <span>Twelve managers</span>
              <span>{ROSTER.length - played.length} still to sit it</span>
            </div>
            <div className="mx-names">
              {ROSTER.map((n) => {
                const gone = played.includes(n)
                return (
                  <button
                    key={n}
                    type="button"
                    className="mx-name"
                    aria-pressed={name === n}
                    disabled={gone}
                    onClick={() => setName(n)}
                  >
                    <span className="mx-box">{name === n && <Tick />}</span>
                    <span className="mx-nm-txt">{n}</span>
                    {gone && <span className="mx-done">in</span>}
                  </button>
                )
              })}
            </div>
          </div>
          <span className="mx-err">
            {played.length === ROSTER.length ? 'Everyone has played.' : ''}
          </span>
          <button
            type="button"
            className="mx-go"
            disabled={!name}
            onClick={() => { setPhase('play'); window.scrollTo({ top: 0, behavior: 'instant' }) }}
          >
            {name ? `Start as ${name}` : 'Pick your name'}
          </button>
        </div>
        {board.length > 0 && (
          <div className="mx-stack" style={{ gap: 10 }}>
            <span className="mx-k is-dim">Already in</span>
            <Board board={board} me={name} />
          </div>
        )}
      </div>
    )
  }

  /* ------------------------------------------------------------ the result */
  if (phase === 'done') {
    const band = bandFor(score)
    return (
      <div className="mx-shell">
        <Top right={name ?? ''} />
        <div className="mx-stack" style={{ gap: 14 }}>
          <span className="mx-k">{band.name}</span>
          <div className="mx-score">
            <span className="mx-big">{score}</span>
            <span className="mx-of">of {QUESTIONS.length}</span>
          </div>
          <p>{band.line}</p>
        </div>

        <div className="mx-splits">
          {VEINS.map((v) => {
            const idx = QUESTIONS.map((qq, n) => (qq.vein === v ? n : -1)).filter((n) => n >= 0)
            const got = idx.filter((n) => picks[String(n)] === QUESTIONS[n].answer).length
            return (
              <div key={v}>
                <span className="mx-v">{got}<span>/{idx.length}</span></span>
                <span className="mx-l">{veinLabel(v)}</span>
              </div>
            )
          })}
        </div>

        <div className="mx-stack" style={{ gap: 10 }}>
          <span className="mx-k is-dim">The league</span>
          <Board board={board} me={name} />
        </div>

        <div className="mx-stack" style={{ gap: 10 }}>
          <span className="mx-k is-dim">Every answer</span>
          <div className="mx-review">
            {QUESTIONS.map((qq, n) => (
              <ReviewRow
                key={n}
                index={n}
                mine={picks[String(n)]}
                room={roomSplit(runs, n)}
                you={name}
              />
            ))}
          </div>
        </div>

        <div className="mx-foot">
          <button type="button" className="mx-ghost" onClick={copyScore}>Copy my score</button>
          {copied && <span className="mx-said">Copied</span>}
        </div>
      </div>
    )
  }

  /* ----------------------------------------------------------- playing it */
  return (
    <div className="mx-shell">
      <Top right={`Question ${i + 1} of ${QUESTIONS.length}`} />

      <div className="mx-rail">
        {QUESTIONS.map((qq, n) => {
          const done = picks[String(n)] !== undefined
          const hit = picks[String(n)] === QUESTIONS[n].answer
          const cls = n === i && !done ? 'is-now' : done ? (hit ? 'is-hit' : 'is-miss') : ''
          return (
            <span key={n} className={`mx-seg${n < i ? ' is-done' : ''}`}>
              <i className={cls} />
              {n < QUESTIONS.length - 1 && <span className="mx-rl" />}
            </span>
          )
        })}
      </div>

      <div className="mx-stage mx-stack">
        <span className="mx-ghostnum" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
        <div className="mx-qhead">
          <span className="mx-n">{String(i + 1).padStart(2, '0')}</span>
          <span className="mx-tag">{veinLabel(q.vein)}</span>
        </div>
        <h2>{q.q}</h2>
        <span className="mx-source">{q.source}</span>
      </div>

      <div className="mx-opts">
        {q.options.map((opt) => {
          let cls = 'mx-opt'
          if (answered) {
            if (opt === q.answer) cls += ' is-right'
            else if (opt === committed) cls += ' is-wrong'
            else cls += ' is-faded'
          } else if (opt === pending) {
            cls += ' is-pick'
          }
          return (
            <button
              key={opt}
              type="button"
              className={cls}
              disabled={answered}
              aria-pressed={!answered && opt === pending}
              onClick={() => setPending(opt)}
            >
              <span className="mx-mk">
                {answered && opt === q.answer && <Tick />}
                {answered && opt === committed && opt !== q.answer && <Cross />}
              </span>
              <span>{opt}</span>
            </button>
          )
        })}
      </div>

      {/* Nothing is committed until this is pressed. A mis-tap on a phone used
          to score the question instantly, which is a bad way to lose one. */}
      {!answered && (
        <div className="mx-nav">
          {i > 0 && (
            <button type="button" className="mx-back" onClick={() => goto(i - 1)}>Back</button>
          )}
          <button type="button" className="mx-go" disabled={!pending} onClick={commit}>
            {pending ? 'Confirm' : 'Pick a name'}
          </button>
        </div>
      )}

      {answered && (
        <div className="mx-ans">
          <span className={`mx-verdict ${committed === q.answer ? 'is-y' : 'is-n'}`}>
            {committed === q.answer ? 'Correct' : 'Not him'}
          </span>
          <p>
            <b>{q.answer}.</b>{' '}
            <span dangerouslySetInnerHTML={{ __html: q.why }} />
          </p>
          <Twelve
            index={i}
            you={name}
            mask={q.pairedWith !== undefined && picks[String(q.pairedWith)] === undefined ? q.mask : undefined}
          />
          <span className="mx-err">{err}</span>
          <div className="mx-nav">
            {i > 0 && (
              <button type="button" className="mx-back" onClick={() => goto(i - 1)}>Back</button>
            )}
            {last ? (
              <button type="button" className="mx-go" disabled={busy || !allAnswered} onClick={file}>
                {busy ? 'Filing' : 'See the score'}
              </button>
            ) : (
              <button type="button" className="mx-go" onClick={() => goto(i + 1)}>Next</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Top({ right }: { right: string }) {
  return (
    <div className="mx-top">
      <span className="mx-lg">PA Milk Society</span>
      <span className="mx-rt">{right}</span>
    </div>
  )
}

function Board({
  board, me,
}: {
  board: { pos: number; name: string; score: number }[]
  me: string | null
}) {
  return (
    <div className="mx-board">
      {board.length === 0 ? (
        <div className="mx-waiting">Nobody has played yet</div>
      ) : (
        board.map((r) => (
          <div key={r.name} className={`mx-brow${r.name === me ? ' is-me' : ''}`}>
            <span className="mx-pos">{r.pos}</span>
            <span className="mx-nm">{r.name}</span>
            <span className="mx-sc">{r.score}</span>
          </div>
        ))
      )}
    </div>
  )
}

/** The whole league on one question's measure, opened on request. */
function Twelve({
  index, you, mask,
}: {
  index: number
  you: string | null
  /** Names held back because a later question is the other end of this stat. */
  mask?: string[]
}) {
  const [open, setOpen] = useState(false)
  const t = tableFor(index)
  if (!t) return null
  const rows = sortedRows(t)
  const held = mask ?? []
  // Your own figure is never held back: it is your number, and you are not the
  // answer to anything.
  const mine = you && !held.includes(you) ? rows.find((r) => r[0] === you) : undefined

  return (
    <div className="mx-twelve">
      <button
        type="button"
        className={`mx-more${open ? ' is-open' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span className="mx-more-l">
          <span className="mx-more-k">{open ? 'Hide all twelve' : 'All twelve'}</span>
          <span className="mx-more-sub">
            {t.label}{t.sort === 'rec' ? ' · by win rate' : ''}
          </span>
        </span>
        {mine && (
          <span className="mx-more-r">
            <span className="mx-more-you">You</span>
            <span className="mx-more-v">{mine[1]}</span>
          </span>
        )}
      </button>
      {open && <TwelveTable table={t} rows={rows} you={you} index={index} held={held} />}
    </div>
  )
}

function TwelveTable({
  table, rows, you, index, held,
}: {
  table: StatTable
  rows: [string, string, number][]
  you: string | null
  index: number
  held: string[]
}) {
  const answer = QUESTIONS[index].answer
  return (
    <div className="mx-table">
      <div className="mx-thead">
        <span>{table.label}</span>
      </div>
      {rows.map((r, n) => {
        // Only tag an end when it is genuinely on its own out there. Two men
        // tied at the top and "best" on one of them is just wrong.
        const tiedTop = rows.length > 1 && r[2] === rows[0][2] && rows[1][2] === rows[0][2]
        const tiedBot = rows.length > 1 && r[2] === rows[rows.length - 1][2]
          && rows[rows.length - 2][2] === rows[rows.length - 1][2]
        const hidden = held.includes(r[0])
        const tag = hidden ? ''
          : n === 0 && !tiedTop ? table.topTag
          : n === rows.length - 1 && !tiedBot ? table.botTag
          : ''
        return (
          <div
            key={r[0]}
            className={`mx-trow${r[0] === answer ? ' is-answer' : ''}${r[0] === you ? ' is-you' : ''}${hidden ? ' is-held' : ''}`}
          >
            <span className="mx-tn">{r[0]}</span>
            {r[0] === you && <span className="mx-you">you</span>}
            {tag && <span className="mx-tt">{tag}</span>}
            {table.subs?.[r[0]] && <span className="mx-sub">{table.subs[r[0]]}</span>}
            {/* A record table is ordered on win rate, not on wins and not on
                losses, and "21-4 above 17-3" is only obvious once the rate is
                on the row. Kept subtle: the record is the fact, the rate is
                why it sits where it does. */}
            {!hidden && table.sort === 'rec' && <span className="mx-tp">{Math.round(r[2] * 100)}%</span>}
            {hidden ? <span className="mx-hold" aria-label="held back" /> : <span className="mx-tv">{r[1]}</span>}
          </div>
        )
      })}
      {held.length > 0 && (
        <div className="mx-held-note">
          {held.length === 1 ? 'One figure is' : `${held.length} figures are`} held back until a later question
        </div>
      )}
    </div>
  )
}

/** One line of the full review, with its own openable twelve. */
function ReviewRow({
  index, mine, room, you,
}: {
  index: number
  mine: string | undefined
  room: { got: number; of: number } | null
  you: string | null
}) {
  const q = QUESTIONS[index]
  const ok = mine === q.answer
  return (
    <div className={`mx-row${ok ? '' : ' is-no'}`}>
      <span className="mx-st">{ok ? <Tick /> : <Cross />}</span>
      <span className="mx-bd">
        <span className="mx-q">
          <span className="mx-qn">{String(index + 1).padStart(2, '0')}</span>
          {q.q}
        </span>
        <span className="mx-a">
          {q.answer}
          {!ok && <em> you said {mine}</em>}
        </span>
        <span className="mx-why" dangerouslySetInnerHTML={{ __html: q.why }} />
        {room && <span className="mx-room">{room.got} of {room.of} got it</span>}
        <Twelve index={index} you={you} />
      </span>
    </div>
  )
}
