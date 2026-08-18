'use client'

import { useMemo, useState } from 'react'
import {
  QUESTIONS, ROSTER, VEINS, bandFor, roomSplit, sortedRows, standings, tableFor, veinLabel,
  type RunRecord, type StatTable,
} from '@/lib/leftovers'
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
  leagueName,
  played,
  runs: initialRuns,
}: {
  token: string
  leagueId: string
  leagueName: string
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

  function lockIn() {
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
    const text = `THE LEFTOVERS\n${score}/${QUESTIONS.length}  ${band.name}\n${grid.slice(0, 10)}\n${grid.slice(10)}`
    try { await navigator.clipboard.writeText(text) } catch { /* blocked; the label still confirms */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  /* ---------------------------------------------------------- claim a name */
  if (phase === 'claim') {
    return (
      <div className="lo-shell">
        <Top right="Twenty questions" />
        <div className="lo-stack">
          <span className="lo-k">Twenty questions, four names each</span>
          <h1>The<br />Leftovers</h1>
          <p>
            Every number the countdown never used. None of it is about where
            anyone finished last year, and some of it will annoy you.
          </p>
          <p>
            You find out straight away on each one, you get <b>one run</b>, and
            the whole league sees what you scored.
          </p>
        </div>
        <div className="lo-stack" style={{ gap: 12 }}>
          <span className="lo-k is-dim">Who are you</span>
          <div className="lo-names">
            {ROSTER.map((n) => {
              const gone = played.includes(n)
              return (
                <button
                  key={n}
                  type="button"
                  className="lo-name"
                  aria-pressed={name === n}
                  disabled={gone}
                  title={gone ? `${n} has already played` : undefined}
                  onClick={() => setName(n)}
                >
                  {n}
                </button>
              )
            })}
          </div>
          <span className="lo-err">
            {played.length === ROSTER.length ? 'Everyone has played.' : ''}
          </span>
          <button
            type="button"
            className="lo-go"
            disabled={!name}
            onClick={() => { setPhase('play'); window.scrollTo({ top: 0, behavior: 'instant' }) }}
          >
            {name ? `Start as ${name}` : 'Pick your name'}
          </button>
        </div>
        {board.length > 0 && (
          <div className="lo-stack" style={{ gap: 10 }}>
            <span className="lo-k is-dim">Already in</span>
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
      <div className="lo-shell">
        <Top right={`${leagueName} · ${name}`} />
        <div className="lo-stack" style={{ gap: 14 }}>
          <span className="lo-k">{band.name}</span>
          <div className="lo-score">
            <span className="lo-big">{score}</span>
            <span className="lo-of">of {QUESTIONS.length}</span>
          </div>
          <p>{band.line}</p>
        </div>

        <div className="lo-splits">
          {VEINS.map((v) => {
            const idx = QUESTIONS.map((qq, n) => (qq.vein === v ? n : -1)).filter((n) => n >= 0)
            const got = idx.filter((n) => picks[String(n)] === QUESTIONS[n].answer).length
            return (
              <div key={v}>
                <span className="lo-v">{got}<span>/{idx.length}</span></span>
                <span className="lo-l">{veinLabel(v)}</span>
              </div>
            )
          })}
        </div>

        <div className="lo-stack" style={{ gap: 10 }}>
          <span className="lo-k is-dim">The league</span>
          <Board board={board} me={name} />
        </div>

        <div className="lo-stack" style={{ gap: 10 }}>
          <span className="lo-k is-dim">Every answer</span>
          <div className="lo-review">
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

        <div className="lo-foot">
          <button type="button" className="lo-ghost" onClick={copyScore}>Copy my score</button>
          {copied && <span className="lo-said">Copied</span>}
        </div>
      </div>
    )
  }

  /* ----------------------------------------------------------- playing it */
  return (
    <div className="lo-shell">
      <Top right={`Question ${i + 1} of ${QUESTIONS.length}`} />

      <div className="lo-rail">
        {QUESTIONS.map((qq, n) => {
          const done = picks[String(n)] !== undefined
          const hit = picks[String(n)] === QUESTIONS[n].answer
          const cls = n === i && !done ? 'is-now' : done ? (hit ? 'is-hit' : 'is-miss') : ''
          return (
            <span key={n} className={`lo-seg${n < i ? ' is-done' : ''}`}>
              <i className={cls} />
              {n < QUESTIONS.length - 1 && <span className="lo-rl" />}
            </span>
          )
        })}
      </div>

      <div className="lo-stage lo-stack">
        <span className="lo-ghostnum" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
        <div className="lo-qhead">
          <span className="lo-n">{String(i + 1).padStart(2, '0')}</span>
          <span className="lo-tag">{veinLabel(q.vein)}</span>
        </div>
        <h2>{q.q}</h2>
        <span className="lo-source">{q.source}</span>
      </div>

      <div className="lo-opts">
        {q.options.map((opt) => {
          let cls = 'lo-opt'
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
              <span className="lo-mk">
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
        <div className="lo-nav">
          <button type="button" className="lo-go" disabled={!pending} onClick={lockIn}>
            {pending ? `Lock in ${pending}` : 'Pick a name'}
          </button>
          {i > 0 && (
            <button type="button" className="lo-back" onClick={() => goto(i - 1)}>Back</button>
          )}
        </div>
      )}

      {answered && (
        <div className="lo-ans">
          <span className={`lo-verdict ${committed === q.answer ? 'is-y' : 'is-n'}`}>
            {committed === q.answer ? 'Correct' : 'Not him'}
          </span>
          <p>
            <b>{q.answer}.</b>{' '}
            <span dangerouslySetInnerHTML={{ __html: q.why }} />
          </p>
          <Twelve index={i} you={name} />
          <span className="lo-err">{err}</span>
          <div className="lo-nav">
            {last ? (
              <button type="button" className="lo-go" disabled={busy || !allAnswered} onClick={file}>
                {busy ? 'Filing' : 'See the score'}
              </button>
            ) : (
              <button type="button" className="lo-go" onClick={() => goto(i + 1)}>Next</button>
            )}
            {i > 0 && (
              <button type="button" className="lo-back" onClick={() => goto(i - 1)}>Back</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Top({ right }: { right: string }) {
  return (
    <div className="lo-top">
      <span className="lo-lg">PA Milk Society</span>
      <span className="lo-rt">{right}</span>
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
    <div className="lo-board">
      {board.length === 0 ? (
        <div className="lo-waiting">Nobody has played yet</div>
      ) : (
        board.map((r) => (
          <div key={r.name} className={`lo-brow${r.name === me ? ' is-me' : ''}`}>
            <span className="lo-pos">{r.pos}</span>
            <span className="lo-nm">{r.name}</span>
            <span className="lo-sc">{r.score}</span>
          </div>
        ))
      )}
    </div>
  )
}

/** The whole league on one question's measure, opened on request. */
function Twelve({ index, you }: { index: number; you: string | null }) {
  const [open, setOpen] = useState(false)
  const t = tableFor(index)
  if (!t) return null
  const rows = sortedRows(t)
  const mine = you ? rows.find((r) => r[0] === you) : undefined

  return (
    <>
      <button type="button" className="lo-more" onClick={() => setOpen(!open)}>
        {open ? 'Hide the twelve' : mine ? `All twelve · you ${mine[1]}` : 'All twelve'}
      </button>
      {open && <TwelveTable table={t} rows={rows} you={you} index={index} />}
    </>
  )
}

function TwelveTable({
  table, rows, you, index,
}: {
  table: StatTable
  rows: [string, string, number][]
  you: string | null
  index: number
}) {
  const answer = QUESTIONS[index].answer
  return (
    <div className="lo-table">
      <div className="lo-thead">
        <span>{table.label}</span>
        <span>{rows.length} shown</span>
      </div>
      {rows.map((r, n) => {
        // Only tag an end when it is genuinely on its own out there. Two men
        // tied at the top and "best" on one of them is just wrong.
        const tiedTop = rows.length > 1 && r[2] === rows[0][2] && rows[1][2] === rows[0][2]
        const tiedBot = rows.length > 1 && r[2] === rows[rows.length - 1][2]
          && rows[rows.length - 2][2] === rows[rows.length - 1][2]
        const tag = n === 0 && !tiedTop ? table.topTag
          : n === rows.length - 1 && !tiedBot ? table.botTag
          : ''
        return (
          <div
            key={r[0]}
            className={`lo-trow${r[0] === answer ? ' is-answer' : ''}${r[0] === you ? ' is-you' : ''}`}
          >
            <span className="lo-tn">{r[0]}</span>
            {r[0] === you && <span className="lo-you">you</span>}
            {tag && <span className="lo-tt">{tag}</span>}
            <span className="lo-tv">{r[1]}</span>
          </div>
        )
      })}
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
    <div className={`lo-row${ok ? '' : ' is-no'}`}>
      <span className="lo-st">{ok ? <Tick /> : <Cross />}</span>
      <span className="lo-bd">
        <span className="lo-q">{q.q}</span>
        <span className="lo-a">
          {q.answer}
          {!ok && <em> you said {mine}</em>}
        </span>
        <span className="lo-why" dangerouslySetInnerHTML={{ __html: q.why }} />
        {room && <span className="lo-room">{room.got} of {room.of} got it</span>}
        <Twelve index={index} you={you} />
      </span>
    </div>
  )
}
