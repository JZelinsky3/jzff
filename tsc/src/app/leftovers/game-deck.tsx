'use client'

import { useMemo, useState } from 'react'
import {
  QUESTIONS, ROSTER, VEINS, bandFor, roomSplit, standings, veinLabel,
  type RunRecord,
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
  // Answer per question index. The score is never held here: it comes back
  // from the server on submit, which is the only place allowed to decide it.
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [locked, setLocked] = useState(false)
  const [runs, setRuns] = useState<RunRecord[]>(initialRuns)
  const [score, setScore] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  const q = QUESTIONS[i]
  const chosen = picks[String(i)]
  const last = i === QUESTIONS.length - 1

  const board = useMemo(() => standings(runs), [runs])

  function choose(pick: string) {
    if (locked) return
    setLocked(true)
    setPicks((p) => ({ ...p, [String(i)]: pick }))
  }

  async function advance() {
    if (!last) {
      setI(i + 1)
      setLocked(false)
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }
    if (!name) return
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

  /* ---------- claim a name ---------- */
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
          <span className="lo-err">{played.length === ROSTER.length ? 'Everyone has played.' : ''}</span>
          <button
            type="button"
            className="lo-go"
            disabled={!name}
            onClick={() => { setPhase('play'); window.scrollTo({ top: 0, behavior: 'instant' }) }}
          >
            {name ? `Start as ${name}` : 'Pick your name'}
          </button>
        </div>
        {board.length > 0 && <Board board={board} me={name} />}
      </div>
    )
  }

  /* ---------- the result ---------- */
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
          <Board board={board} me={name} bare />
        </div>

        <div className="lo-stack" style={{ gap: 10 }}>
          <span className="lo-k is-dim">Every answer</span>
          <div className="lo-review">
            {QUESTIONS.map((qq, n) => {
              const mine = picks[String(n)]
              const ok = mine === qq.answer
              const room = roomSplit(runs, n)
              return (
                <div key={n} className={`lo-row${ok ? '' : ' is-no'}`}>
                  <span className="lo-st">{ok ? <Tick /> : <Cross />}</span>
                  <span className="lo-bd">
                    <span className="lo-q">{qq.q}</span>
                    <span className="lo-a">
                      {qq.answer}
                      {!ok && <em> you said {mine}</em>}
                    </span>
                    <span className="lo-why" dangerouslySetInnerHTML={{ __html: qq.why }} />
                    {room && <span className="lo-room">{room.got} of {room.of} got it</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="lo-foot">
          <button type="button" className="lo-ghost" onClick={copyScore}>Copy my score</button>
          {copied && <span className="lo-said">Copied</span>}
        </div>
      </div>
    )
  }

  /* ---------- playing ---------- */
  return (
    <div className="lo-shell">
      <Top right={`Question ${i + 1} of ${QUESTIONS.length}`} />
      <div className="lo-rail">
        {QUESTIONS.map((qq, n) => {
          const done = n < i || (n === i && locked)
          const hit = picks[String(n)] === QUESTIONS[n].answer
          const cls = n === i && !locked ? 'is-now' : done ? (hit ? 'is-hit' : 'is-miss') : ''
          return (
            <span key={n} className={`lo-seg${n < i ? ' is-done' : ''}`}>
              <i className={cls} />
              {n < QUESTIONS.length - 1 && <span className="lo-rl" />}
            </span>
          )
        })}
      </div>

      <div className="lo-qhead">
        <span className="lo-n">{String(i + 1).padStart(2, '0')}</span>
        <span className="lo-tag">{veinLabel(q.vein)}</span>
      </div>
      <h2>{q.q}</h2>

      <div className="lo-opts">
        {q.options.map((opt) => {
          let cls = 'lo-opt'
          if (locked) {
            if (opt === q.answer) cls += ' is-right'
            else if (opt === chosen) cls += ' is-wrong'
            else cls += ' is-faded'
          }
          return (
            <button key={opt} type="button" className={cls} disabled={locked} onClick={() => choose(opt)}>
              <span className="lo-mk">
                {locked && opt === q.answer && <Tick />}
                {locked && opt === chosen && opt !== q.answer && <Cross />}
              </span>
              <span>{opt}</span>
            </button>
          )
        })}
      </div>

      {locked && (
        <div className="lo-ans">
          <span className={`lo-verdict ${chosen === q.answer ? 'is-y' : 'is-n'}`}>
            {chosen === q.answer ? 'Correct' : 'Not him'}
          </span>
          <p>
            <b>{q.answer}.</b>{' '}
            <span dangerouslySetInnerHTML={{ __html: q.why }} />
          </p>
          <span className="lo-err">{err}</span>
          <button type="button" className="lo-go" disabled={busy} onClick={advance}>
            {busy ? 'Filing' : last ? 'See the score' : 'Next'}
          </button>
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
  board,
  me,
  bare,
}: {
  board: { pos: number; name: string; score: number }[]
  me: string | null
  bare?: boolean
}) {
  const rows = (
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
  if (bare) return rows
  return (
    <div className="lo-stack" style={{ gap: 10 }}>
      <span className="lo-k is-dim">Already in</span>
      {rows}
    </div>
  )
}
