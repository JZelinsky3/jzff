'use client'

// Watching a Season game (Joey, 2026-11-07: see the drives, the touchdowns, the
// stops, the big plays). Every snap the sim played (seasonSim drivePlays) comes
// up in order: the scorebug, the field with the ball and the line to gain, the
// call, and a moment for anything big. It plays itself at a pace you can speed
// up, skip a drive, or jump to the final. Nothing here decides anything: the
// game was over before it started, so a refresh or a skip changes nothing.

import { useEffect, useMemo, useRef, useState } from 'react'
import { surname } from '@/lib/packEmpire/rules'
import { PLAN_LOOK, type GamePlan } from '@/lib/packEmpire/seasonRules'
import type { Cast } from '@/lib/packEmpire/season'
import type { Drive, Play } from '@/lib/packEmpire/seasonSim'

type Props = {
  drives: Drive[]
  cast: Cast
  team: string
  defense: string
  line: number | null
  opponent?: string | null
  oppPoints?: number | null
  plan: GamePlan
  clicked: boolean | null
  onDone: () => void
}

type Step = { drive: number; play: Play; last: boolean }

const ORD = ['', '1st', '2nd', '3rd', '4th']

const spot = (at: number) => (at < 50 ? `Own ${at}` : at === 50 ? 'Midfield' : `Opp ${100 - at}`)

function describe(p: Play, name: (id?: string) => string): string {
  if (p.k === 'kick') return `${p.yds}-yard field goal is ${p.good ? 'good' : 'no good'}.`
  if (p.k === 'punt') return 'They punt it away.'
  if (p.k === 'sack') return `${name(p.by)} is sacked for a loss of ${-p.yds}.`
  if (p.k === 'run') {
    if (p.lost === 'fum') return `${name(p.by)} fumbles. The defense has it.`
    if (p.td) return `${name(p.by)} runs it in from ${p.yds} out. Touchdown.`
    const gain = p.yds > 0 ? `${name(p.by)} runs for ${p.yds}.` : p.yds === 0 ? `${name(p.by)} is stuffed for no gain.` : `${name(p.by)} is dropped for a loss of ${-p.yds}.`
    return p.lost === 'downs' ? `${gain} Short on fourth down.` : gain
  }
  if (p.lost === 'int') return `${name(p.by)} is picked off looking for ${name(p.to)}.`
  if (p.c) return `${name(p.by)} ${p.deep ? 'goes deep to' : 'to'} ${name(p.to)}, ${p.yds} yards${p.td ? '. Touchdown.' : '.'}`
  return `${name(p.by)} ${p.deep ? 'goes deep, ' : ''}incomplete for ${name(p.to)}.${p.lost === 'downs' ? ' Turnover on downs.' : ''}`
}

const big = (p: Play) => !!p.td || !!p.lost || (p.k !== 'kick' && p.yds >= 20)

/** How long a snap stays up at 1x. Big ones hold. */
const holdFor = (s: Step) => (s.play.td || s.play.lost ? 2100 : big(s.play) ? 1600 : s.last ? 1300 : 850)

const SPEEDS = [1, 2, 4] as const

export function GameCast({ drives, cast, team, defense, line, opponent, oppPoints, plan, clicked, onDone }: Props) {
  const steps = useMemo<Step[]>(() => drives.flatMap((d, i) => (d.plays ?? []).map((play, k, all) => ({ drive: i, play, last: k === all.length - 1 }))), [drives])
  const [at, setAt] = useState(-1)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)
  const done = at >= steps.length - 1
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!playing || done) return
    // Kickoff holds a beat for the game plan to land.
    const wait = at < 0 ? 1800 : holdFor(steps[at])
    timer.current = window.setTimeout(() => setAt((n) => Math.min(steps.length - 1, n + 1)), wait / speed)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [at, playing, speed, done, steps])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone()
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying((x) => !x)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  const name = (id?: string) => (id && cast[id] ? surname(cast[id].name) : 'The offense')
  const cur = at >= 0 ? steps[at] : null
  const driveNo = cur ? cur.drive : 0
  // Points on the board: every drive whose last snap has played.
  const score = drives.reduce((n, d, i) => {
    const lastIdx = steps.findIndex((s) => s.drive === i && s.last)
    return n + (lastIdx >= 0 && lastIdx <= at ? d.points : 0)
  }, 0)
  const p = cur?.play ?? null
  const after = p ? Math.max(0, Math.min(100, p.at + (p.k === 'kick' || p.k === 'punt' ? 0 : p.yds))) : (drives[0]?.plays?.[0]?.at ?? 25)
  const lineToGain = p && p.k !== 'kick' && p.k !== 'punt' ? Math.min(100, p.at + p.dist) : null
  const ot = !!(cur && drives[cur.drive]?.ot)
  const final = done ? drives.reduce((n, d) => n + d.points, 0) : null
  const won = final == null ? null : line != null ? final > line : oppPoints != null ? final > oppPoints : null
  const recent = steps.slice(Math.max(0, at - 3), at).reverse()

  const nextDrive = () => {
    const i = steps.findIndex((s, k) => k > at && s.drive > driveNo)
    setAt(i < 0 ? steps.length - 1 : i - 1)
    setPlaying(true)
  }

  return (
    <div className="pe-gc" role="dialog" aria-label={`${team} against ${defense}`}>
      <div className="pe-gc-in">
        <header className="pe-gc-bug">
          <div className="pe-gc-side">
            <small>{team}</small>
            <b key={score} className="pe-gc-score">
              {score}
            </b>
          </div>
          <div className="pe-gc-mid">
            <span>{done ? 'Final' : ot ? 'Overtime' : `Drive ${Math.min(driveNo + 1, 11)} of 11`}</span>
            {plan !== 'balanced' ? (
              <em data-click={at >= 0 ? String(clicked) : undefined}>
                {PLAN_LOOK[plan].name}
                {at >= 0 ? (clicked ? ' · Working' : ' · Not working') : ''}
              </em>
            ) : (
              <em>Balanced</em>
            )}
          </div>
          <div className="pe-gc-side pe-gc-side--them">
            <small>{line != null ? defense : (opponent ?? defense)}</small>
            <b>{line != null ? line : oppPoints != null ? oppPoints : '?'}</b>
            <i>{line != null ? 'to beat' : oppPoints != null ? 'they scored' : 'not played yet'}</i>
          </div>
        </header>

        <div className="pe-gc-field" aria-hidden>
          <span className="pe-gc-ez" />
          <span className="pe-gc-ez pe-gc-ez--them" />
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((y) => (
            <span key={y} className="pe-gc-yl" style={{ left: `${y}%` }}>
              <i>{y <= 50 ? y : 100 - y}</i>
            </span>
          ))}
          {lineToGain != null && lineToGain < 100 && (
            <span className="pe-gc-mark pe-gc-mark--gain" style={{ transform: `translateX(${lineToGain}%)` }}>
              <i />
            </span>
          )}
          {p && (
            <span className="pe-gc-mark pe-gc-mark--los" style={{ transform: `translateX(${p.at}%)` }}>
              <i />
            </span>
          )}
          <span className="pe-gc-mark pe-gc-mark--ball" style={{ transform: `translateX(${after}%)` }}>
            <i />
          </span>
        </div>

        <div className="pe-gc-call" key={at} data-big={p && big(p) ? (p.td ? 'td' : p.lost ? 'lost' : 'big') : undefined}>
          {p ? (
            <>
              <small>
                {p.k === 'kick' || p.k === 'punt' ? `4th & ${p.dist}` : `${ORD[p.down]} & ${p.at + p.dist >= 100 ? 'Goal' : p.dist}`} · {spot(p.at)}
              </small>
              <p>{describe(p, name)}</p>
              {p.td ? <b className="pe-gc-flash">Touchdown</b> : p.lost ? <b className="pe-gc-flash pe-gc-flash--lost">Turnover</b> : big(p) ? <b className="pe-gc-flash pe-gc-flash--big">Big Play</b> : null}
            </>
          ) : (
            <>
              <small>Kickoff</small>
              <p>
                {plan === 'balanced' ? 'A balanced game plan: take what they give.' : `The call: ${PLAN_LOOK[plan].name}. ${clicked ? 'It looks right from the first snap.' : 'They look ready for it.'}`}
              </p>
            </>
          )}
        </div>

        {done && (
          <div className="pe-gc-final" data-won={won == null ? undefined : String(won)}>
            <b>{final}</b>
            <span>{won == null ? 'Final' : won ? 'Win' : 'Loss'}</span>
            <small>{line != null ? `${final! > line ? 'Beat' : 'Missed'} ${line}` : oppPoints != null ? `${opponent ?? 'They'} scored ${oppPoints}` : 'Waiting on the other team'}</small>
          </div>
        )}

        <ol className="pe-gc-log">
          {recent.map((s, i) => (
            <li key={`${at}-${i}`}>{describe(s.play, name)}</li>
          ))}
        </ol>

        <div className="pe-gc-drives" aria-label="Drives so far">
          {drives.map((d, i) => {
            const lastIdx = steps.findIndex((s) => s.drive === i && s.last)
            const shown = lastIdx >= 0 && lastIdx <= at
            return <i key={i} data-end={shown ? d.end : undefined} data-now={i === driveNo && !done ? 'true' : undefined} />
          })}
        </div>

        <div className="pe-gc-ctl">
          {done ? (
            <button type="button" className="pe-push" onClick={onDone}>
              Done
            </button>
          ) : (
            <>
              <button type="button" className="pe-act pe-act--sm" onClick={() => setPlaying((x) => !x)}>
                {playing ? 'Pause' : 'Play'}
              </button>
              <button type="button" className="pe-act pe-act--sm" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}>
                Speed {speed}x
              </button>
              <button type="button" className="pe-act pe-act--sm" onClick={nextDrive}>
                Next Drive
              </button>
              <button type="button" className="pe-act pe-act--sm" onClick={() => setAt(steps.length - 1)}>
                Skip To Final
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
