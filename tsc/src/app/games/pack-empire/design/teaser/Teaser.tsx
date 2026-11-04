'use client'

// The teaser itself: a fixed frame that plays one beat after another and loops.
// Each beat mounts fresh, so its CSS animations start from zero, and moves on
// at marks it sets for itself (useSteps) rather than re-rendering every frame:
// a PackCard is too heavy to redraw sixty times a second.
//
// Every mark reads the reel's own clock, which stops while paused, and the
// frame pauses its CSS animations with it, so a pause holds the picture exactly.
//
// Space or click plays and pauses, the arrows step a beat, R restarts, H hides
// the controls. Stepping while paused plays that beat through and holds on its
// last frame. Record the frame, not the page: it's 1280x720 (or 540x960 on
// ?ar=916), so zoom the browser in for a bigger capture and everything scales.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { SLOT_COUNT, tierFor, type Chemistry, type Player } from '@/lib/packEmpire/rules'
import { BOND_LABEL, CaptainMark, Field, Ladder, PackCard, bondKind } from '../../cards'
import { ChemLinks } from '../../report'
import { RipBurst } from '../../rip'

export type TeaserData = {
  lineup: Player[]
  chem: Chemistry
  total: number
  rip: Player[]
  vsA: Player
  vsB: Player
  blind: Player
  range: Player
  wall: Player[]
  packs: { captain: string; wild: string; rb: string; wr: string; te: string }
}

/** The reel's clock: ms played so far, not counting time spent paused. */
type Clock = { paused: boolean; now: () => number }
const ClockContext = createContext<Clock>({ paused: false, now: () => performance.now() })

/** Marks in ms from the moment a beat mounts; returns how many have passed. */
function useSteps(marks: number[]): number {
  const { paused, now } = useContext(ClockContext)
  const [t0] = useState(now)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (paused) return
    const at = now() - t0
    const ids = marks.map((m, i) => window.setTimeout(() => setN((c) => Math.max(c, i + 1)), Math.max(0, m - at)))
    return () => ids.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused])
  return n
}

/** A number counting up from `from` to `to` over `ms`, starting after `delay`. */
function useCount(to: number, ms: number, delay = 0, from = 0): number {
  const { paused, now } = useContext(ClockContext)
  const [t0] = useState(now)
  const [v, setV] = useState(from)
  useEffect(() => {
    if (paused) return
    let raf = 0
    const tick = () => {
      const p = Math.min(1, Math.max(0, (now() - t0 - delay) / ms))
      setV(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, ms, delay, from, paused, now, t0])
  return v
}

const k = (n: number) => n.toLocaleString('en-US')

/** The words on a beat: a small line, the name, then what it is. `lead` opens
    the description in full ink, so the pitch reads before the detail. A kick or
    a description that changes mid-beat rises again; the name stays put. */
function Caption({ kick, line, lead, sub, tone }: { kick: string; line: React.ReactNode; lead?: string; sub?: string; tone?: string }) {
  return (
    <div className="tz-cap" style={tone ? ({ '--tone': tone } as React.CSSProperties) : undefined}>
      <span key={kick} className="tz-kick">
        {kick}
      </span>
      <span className="tz-line">{line}</span>
      {(lead || sub) && (
        <span key={`${lead}${sub}`} className="tz-sub">
          {lead && <b>{lead}</b>} {sub}
        </span>
      )}
    </div>
  )
}

// ── The beats ─────────────────────────────────────────────────

function Intro() {
  const step = useSteps([500, 1300, 1900, 2500])
  return (
    <div className="tz-beat tz-intro">
      <div className="tz-intro-glow" />
      <h1 className="tz-logo">
        <span className="tz-logo-a">Pack</span> <span className="tz-logo-b pe-em">Empire.</span>
      </h1>
      <div className="tz-intro-words">
        {step >= 1 && <span>Eleven packs.</span>}
        {step >= 2 && <span>Five cards each.</span>}
        {step >= 3 && <span className="hot">Keep one.</span>}
      </div>
    </div>
  )
}

const EMPTY: (Player | null)[] = Array(SLOT_COUNT).fill(null)

function Captain() {
  const step = useSteps([1100, 1700])
  return (
    <div className="tz-beat tz-split">
      <Caption kick="Step one" line={<>Pick a <em>captain.</em></>} sub="Its pack deals off the captain table: five times the immortals." />
      <div className="pe-turf tz-turf">
        <Field
          lineup={EMPTY}
          view={(i) => ({
            clickable: false,
            captain: step >= 1 && i === 0,
            capHint: step < 1,
            glow: step >= 1 && i === 0 ? 'cap' : null,
            dim: step >= 2 && i !== 0,
          })}
        />
        {step >= 1 && (
          <div className="tz-capstamp">
            <CaptainMark inline /> Captain
          </div>
        )}
      </div>
    </div>
  )
}

/** The rip, then keep one: the pack tears, five come out face down with air
    between them and the pack, turn over one at a time, and one is kept. */
function Rip({ cards, art }: { cards: Player[]; art: string }) {
  const step = useSteps([700, 1150, 1700, 2050, 2400, 2750, 3250, 4600, 5200])
  // 1 tear  2 cards out  3-7 flips (the immortal last)  8 keep  9 the rest go
  const order = [0, 4, 1, 3, 2]
  const keep = 2
  const flipped = (i: number) => step >= 3 + order.indexOf(i)
  const kicker = step >= 8 ? 'Step three' : 'Step two'
  return (
    <div className="tz-beat tz-split">
      {step < 8 ? (
        <Caption kick={kicker} line={<>Rip it <em>open.</em></>} sub="Five cards in every pack. Six rarities, Common to Canton." />
      ) : (
        <Caption kick={kicker} line={<>Keep <em>one.</em></>} sub="The other four go back. Choose well." />
      )}
      <div className="tz-rip" data-step={step}>
        <div className="tz-pack" data-torn={step >= 1 ? '' : undefined} data-gone={step >= 2 ? '' : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="tz-pack-body" src={art} alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="tz-pack-strip" src={art} alt="" />
          {step >= 1 && (
            <div className="tz-burst">
              <RipBurst rarity="immortal" />
            </div>
          )}
        </div>
        {step >= 2 &&
          cards.map((c, i) => (
            <div
              key={c.id}
              className="tz-fan-card"
              data-kept={step >= 8 && i === keep ? '' : undefined}
              data-gone={step >= 9 && i !== keep ? '' : undefined}
              style={{ '--i': i - 2, '--d': `${Math.abs(i - 2) * 60}ms` } as React.CSSProperties}
            >
              <div className="tz-fan-in">
                <PackCard player={c} revealed={flipped(i)} picked={step >= 8 && i === keep} rejected={step >= 8 && i !== keep} burst={flipped(i) && i === keep} index={0} disabled />
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

function Chem({ lineup, chem }: { lineup: Player[]; chem: Chemistry }) {
  const bonds = chem.bonds
  const step = useSteps(bonds.map((_, i) => 700 + i * Math.min(260, 2400 / Math.max(1, bonds.length))))
  const shown = bonds.slice(0, step).reduce((s, b) => s + b.points, 0)
  const kinds = new Set(bonds.map(bondKind))
  return (
    <div className="tz-beat tz-split">
      <div className="tz-cap-col">
        <Caption kick="Step four" line={<>Chemistry <em>counts.</em></>} sub="Real teammates, the same franchise, old rivals. Every bond moves the score." />
        <div className="tz-chem-total" data-neg={shown < 0 ? '' : undefined}>
          {shown >= 0 ? '+' : '−'}
          {k(Math.abs(shown))}
          <small>Chemistry</small>
        </div>
        <div className="tz-chem-key pe-rep-key">
          {(['real', 'same', 'rival'] as const)
            .filter((x) => kinds.has(x))
            .map((x) => (
              <span key={x} data-kind={x}>
                <i />
                {BOND_LABEL[x]}
              </span>
            ))}
        </div>
      </div>
      <div className="pe-turf tz-turf tz-turf--full">
        {/* Mounted with the first bond, once the beat has stopped scaling in:
            the links measure the cards once, and a measure mid-zoom set every
            ring a few pixels low and wide. */}
        {step >= 1 && <ChemLinks bonds={bonds} lineup={lineup} count={step} />}
        <Field lineup={lineup} view={(i) => ({ clickable: false, captain: i === 0 })} />
      </div>
    </div>
  )
}

const BATTLES = [
  { title: 'Most Touchdowns', you: 61, them: 54 },
  { title: 'Most Rings', you: 4, them: 6 },
  { title: 'Division Stack', you: 5, them: 3 },
]

/** The Battles table, Versus's second half. */
function BattleBoard() {
  const step = useSteps([500, 1100, 1700, 2500])
  const won = BATTLES.filter((b) => b.you > b.them).length
  return (
    <div className="tz-battles">
      <div className="tz-bt-head">
        <span>Category</span>
        <span>You</span>
        <span>Them</span>
        <span />
      </div>
      {BATTLES.map((b, i) =>
        step > i ? (
          <div key={b.title} className="tz-bt-row" data-win={b.you > b.them ? '' : undefined}>
            <span className="tz-bt-name">{b.title}</span>
            <b>{b.you}</b>
            <b className="them">{b.them}</b>
            <span className="tz-bt-prize">{b.you > b.them ? '+1,500' : 'Lost'}</span>
          </div>
        ) : null
      )}
      {step >= 4 && (
        <div className="tz-bt-total">
          <span>Battles</span>
          <b>+{k(won * 1500)}</b>
        </div>
      )}
    </div>
  )
}

function Mystery({ art }: { art: string }) {
  return (
    <div className="tz-beat tz-split">
      <Caption
        kick="Empire Builder"
        line={<>Mystery <em>Packs.</em></>}
        lead="You never know what's inside."
        sub="Eleven packs, five random positions each. Plan for what you still need."
        tone="#a99cf5"
      />
      <div className="tz-mys">
        {[-2, -1, 0, 1, 2].map((n) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={n} src={art} alt="" className="tz-mys-pack" style={{ '--n': n } as React.CSSProperties} />
        ))}
      </div>
    </div>
  )
}

function BallKnower({ blind, range, real }: { blind: Player; range: Player; real: Player }) {
  const step = useSteps([1300])
  return (
    <div className="tz-beat tz-split">
      <Caption
        kick="Hard mode"
        line={<>Ball <em>Knower.</em></>}
        lead="Know ball?"
        sub="Just a name and a season. No value, no team. You remember the rest."
        tone="#4fc3b0"
      />
      <div className="tz-bk">
        <div className="tz-bk-card tz-bk-side">
          <PackCard player={range} revealed index={0} still disabled />
        </div>
        <div className="tz-bk-card">
          <PackCard player={step >= 1 ? real : blind} revealed index={0} burst={step >= 1} disabled />
        </div>
      </div>
    </div>
  )
}

/** The two cards face off and the totals count up. Versus's first half. */
function Faceoff({ a, b }: { a: Player; b: Player }) {
  const you = useCount(24040, 1400, 300)
  const them = useCount(22950, 1400, 300)
  const step = useSteps([1800])
  return (
    <div className="tz-vs">
      <div className="tz-vs-side" data-win={step >= 1 ? '' : undefined}>
        <div className="tz-vs-card">
          <PackCard player={a} revealed index={0} still disabled />
        </div>
        <span className="tz-vs-name">You</span>
        <b>{k(you)}</b>
      </div>
      <span className="tz-vs-mid">vs</span>
      <div className="tz-vs-side">
        <div className="tz-vs-card">
          <PackCard player={b} revealed index={0} still disabled />
        </div>
        <span className="tz-vs-name">Friend</span>
        <b>{k(them)}</b>
      </div>
    </div>
  )
}

/** One beat for the mode, in two halves: the name stays up while the head to
    head gives way to the Battles. `half` is when the second half starts. */
function Versus({ a, b, half }: { a: Player; b: Player; half: number }) {
  const step = useSteps([half])
  return (
    <div className="tz-beat tz-split">
      {step < 1 ? (
        <Caption
          kick="Two players"
          line={<>Versus <em>Challenge.</em></>}
          lead="Same packs. Head to head."
          sub="Send a friend the link. The best offense wins."
          tone="#e2725b"
        />
      ) : (
        <Caption
          kick="Two players · Even"
          line={<>Versus <em>Challenge.</em></>}
          lead="Win the Battles."
          sub="Three head-to-head categories, named before the first pack."
          tone="#e2725b"
        />
      )}
      {step < 1 ? <Faceoff a={a} b={b} /> : <BattleBoard />}
    </div>
  )
}

function Mega({ wall }: { wall: Player[] }) {
  const step = useSteps(wall.map((_, i) => 250 + i * 140))
  const order = [5, 2, 9, 0, 11, 6, 3, 8, 1, 10, 4, 7]
  return (
    <div className="tz-beat tz-split">
      <Caption
        kick="Live"
        line={<>Mega <em>Draft.</em></>}
        lead="A live snake draft."
        sub="Every card on one table. Take it before they do."
        tone="#5fb3e8"
      />
      <div className="tz-mega">
        {wall.map((c, i) => (
          <div key={c.id} className="tz-mega-card">
            <PackCard player={c} revealed={step > order.indexOf(i)} index={0} still disabled />
          </div>
        ))}
      </div>
    </div>
  )
}

const TABLE = [
  { name: 'You', pts: [21480, 23120, 24040], up: true },
  { name: 'Marcus', pts: [22950, 22100, 23310] },
  { name: 'Jordan', pts: [20210, 21800, 21420] },
  { name: 'Devin', pts: [19980, 18640, 20115] },
  { name: 'Tyler', pts: [17260, 19020, 18890] },
]

function League() {
  const step = useSteps([900, 1700])
  const rows = [...TABLE].sort((x, y) => y.pts.slice(0, step + 1).reduce((s, n) => s + n, 0) - x.pts.slice(0, step + 1).reduce((s, n) => s + n, 0))
  const top = Math.max(...TABLE.map((r) => r.pts.reduce((s, n) => s + n, 0)))
  return (
    <div className="tz-beat tz-split">
      <Caption
        kick="4 to 12 players"
        line={<>League <em>Mode.</em></>}
        lead="Eight weeks. One champion."
        sub="Win a week, open a better pack. Then a Gauntlet, then a Final."
        tone="#b48cf0"
      />
      <div className="tz-league">
        <div className="tz-lg-head">
          <span>Week {step + 1}</span>
          <span>Total</span>
        </div>
        {TABLE.map((r) => {
          const sum = r.pts.slice(0, step + 1).reduce((s, n) => s + n, 0)
          const at = rows.indexOf(r)
          return (
            <div key={r.name} className="tz-lg-row" data-you={r.up ? '' : undefined} style={{ '--at': at } as React.CSSProperties}>
              <span className="tz-lg-rank">{at + 1}</span>
              <span className="tz-lg-name">{r.name}</span>
              <span className="tz-lg-bar">
                <i style={{ width: `${(sum / top) * 100}%` }} />
              </span>
              <b>{k(sum)}</b>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Climb({ total }: { total: number }) {
  const shown = useCount(total, 2600, 300)
  const tier = tierFor(shown)
  const landed = shown === total
  return (
    <div className="tz-beat tz-split">
      <div className="tz-cap-col">
        <Caption kick="The board" line={<>Climb the <em>ladder.</em></>} sub="Every run goes on the board. Past 30,000 is nearly impossible." />
        <div className="tz-climb-score" style={{ '--tc': tier.color } as React.CSSProperties} data-landed={landed ? '' : undefined}>
          <small key={tier.label}>{tier.label}</small>
          <b>{k(shown)}</b>
        </div>
      </div>
      <div className="tz-ladder">
        <Ladder score={shown} climb landed={landed} />
      </div>
    </div>
  )
}

function Outro({ art }: { art: string[] }) {
  return (
    <div className="tz-beat tz-outro">
      <div className="tz-intro-glow" />
      <div className="tz-outro-packs">
        {art.map((a, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={a} src={a} alt="" style={{ '--n': i - (art.length - 1) / 2 } as React.CSSProperties} />
        ))}
      </div>
      <h1 className="tz-logo tz-logo--end">
        Pack <span className="pe-em">Empire.</span>
      </h1>
      <p className="tz-outro-line">Free to play. No account needed.</p>
      <p className="tz-outro-url">thesundaychronicle.app/games/pack-empire</p>
    </div>
  )
}

// ── The reel ──────────────────────────────────────────────────

/** Every beat holds its finished picture this long before the next one. */
const HOLD = 1300

/** Versus plays the head to head, holds it, then the Battles. */
const VS_HALF = 2700 + HOLD

type Beat = { name: string; ms: number; tag?: false; el: () => React.ReactNode }

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

export function Teaser({ data, vertical }: { data: TeaserData; vertical: boolean }) {
  const beats: Beat[] = (
    [
      { name: 'Intro', ms: 3300, tag: false, el: () => <Intro /> },
      { name: 'Captain', ms: 3300, el: () => <Captain /> },
      { name: 'The rip', ms: 6400, el: () => <Rip cards={data.rip} art={data.packs.captain} /> },
      { name: 'Chemistry', ms: 4400, el: () => <Chem lineup={data.lineup} chem={data.chem} /> },
      { name: 'Mystery Packs', ms: 2400, el: () => <Mystery art={data.packs.wild} /> },
      { name: 'Ball Knower', ms: 2900, el: () => <BallKnower blind={data.blind} range={data.range} real={data.wall[2]} /> },
      { name: 'Versus Challenge', ms: VS_HALF + 3700, el: () => <Versus a={data.vsA} b={data.vsB} half={VS_HALF} /> },
      { name: 'Mega Draft', ms: 2800, el: () => <Mega wall={data.wall} /> },
      { name: 'League Mode', ms: 2900, el: () => <League /> },
      { name: 'The board', ms: 3900, el: () => <Climb total={data.total} /> },
      { name: 'Outro', ms: 4600, tag: false, el: () => <Outro art={[data.packs.rb, data.packs.wr, data.packs.captain, data.packs.te, data.packs.wild]} /> },
    ] as Beat[]
  ).map((b) => ({ ...b, ms: b.ms + HOLD }))
  const [at, setAt] = useState(-1)
  const [run, setRun] = useState(0)
  const [paused, setPaused] = useState(false)
  const [chrome, setChrome] = useState(true)

  // The clock: time played before `since`, and when play last resumed.
  const clock = useRef({ played: 0, since: 0, paused: false })
  const now = useCallback(() => {
    const c = clock.current
    return c.played + (c.paused ? 0 : performance.now() - c.since)
  }, [])
  const hold = useCallback((p: boolean) => {
    const c = clock.current
    if (p === c.paused) return
    if (p) c.played += performance.now() - c.since
    else c.since = performance.now()
    c.paused = p
    setPaused(p)
  }, [])
  const ctx = useMemo(() => ({ paused, now }), [paused, now])

  const beatStart = useRef(0)
  // Set by a step taken while paused: play that beat through, then pause on its end.
  const holdAtEnd = useRef(false)

  const start = useCallback(() => {
    holdAtEnd.current = false
    hold(false)
    setRun((r) => r + 1)
    setAt(0)
  }, [hold])

  const go = useCallback(
    (i: number) => {
      if (clock.current.paused) {
        holdAtEnd.current = true
        hold(false)
      }
      setRun((r) => r + 1)
      setAt(i)
    },
    [hold]
  )

  const toggle = useCallback(() => {
    if (at < 0) return start()
    holdAtEnd.current = false
    hold(!clock.current.paused)
  }, [at, hold, start])

  useEffect(() => {
    if (at >= 0) beatStart.current = now()
  }, [at, run, now])

  useEffect(() => {
    if (at < 0 || paused) return
    const left = beats[at].ms - (now() - beatStart.current)
    const id = window.setTimeout(() => {
      if (holdAtEnd.current) {
        holdAtEnd.current = false
        hold(true)
      } else setAt((n) => (n + 1) % beats.length)
    }, Math.max(0, left))
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, run, paused])

  useEffect(() => {
    const n = beats.length
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'ArrowRight') go(at < 0 ? 0 : (at + 1) % n)
      else if (e.key === 'ArrowLeft') go(at < 0 ? 0 : (at - 1 + n) % n)
      else if (e.key === 'r' || e.key === 'R') start()
      else if (e.key === 'h' || e.key === 'H') setChrome((c) => !c)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [at, beats.length, go, start, toggle])

  const showTag = at >= 0 && beats[at].tag !== false
  const n = beats.length

  return (
    <ClockContext.Provider value={ctx}>
      <div className="tz-room">
        <div className={`tz-frame${vertical ? ' tz-frame--v' : ''}`} data-paused={paused ? '' : undefined} onClick={toggle}>
          <div className="tz-bg" aria-hidden />
          {at < 0 ? (
            <div className="tz-beat tz-ready">
              <h1 className="tz-logo">
                Pack <span className="pe-em">Empire.</span>
              </h1>
              <p>Click or press space to play</p>
            </div>
          ) : (
            <div key={`${run}-${at}`} className="tz-scene">
              {beats[at].el()}
            </div>
          )}
          <div className="tz-tag" data-on={showTag ? '' : undefined} aria-hidden>
            <span className="tz-tag-name">
              Pack <em>Empire.</em>
            </span>
            <span className="tz-tag-by">The Sunday Chronicle</span>
          </div>
          <div className="tz-grain" aria-hidden />
        </div>
        {chrome && (
          <>
            {/* Mouse-down keeps focus off the buttons, so Space stays play and pause. */}
            <div className="tz-ctl" onMouseDown={(e) => e.preventDefault()}>
              <button type="button" className="tz-ctl-btn" onClick={start} aria-label="Restart" title="Restart (R)">
                <Icon d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" />
              </button>
              <button type="button" className="tz-ctl-btn" onClick={() => go(at < 0 ? 0 : (at - 1 + n) % n)} aria-label="Previous beat" title="Previous (Left arrow)">
                <Icon d="M7 6v12M18 6.5l-8 5.5 8 5.5z" />
              </button>
              <button type="button" className="tz-ctl-btn tz-ctl-play" onClick={toggle} aria-label={paused || at < 0 ? 'Play' : 'Pause'} title="Play or pause (Space)">
                <Icon d={paused || at < 0 ? 'M8.5 5.5v13l10-6.5z' : 'M9 5.5v13M15 5.5v13'} />
              </button>
              <button type="button" className="tz-ctl-btn" onClick={() => go(at < 0 ? 0 : (at + 1) % n)} aria-label="Next beat" title="Next (Right arrow)">
                <Icon d="M17 6v12M6 6.5l8 5.5-8 5.5z" />
              </button>
              <div className="tz-ctl-beats">
                {beats.map((b, i) => (
                  <button key={b.name} type="button" className="tz-ctl-dot" data-on={i === at ? '' : undefined} onClick={() => go(i)} aria-label={b.name} title={b.name} />
                ))}
              </div>
              <span className="tz-ctl-name">
                {at < 0 ? 'Ready' : `${String(at + 1).padStart(2, '0')} / ${n} · ${beats[at].name}`}
                {paused && <b> · Paused</b>}
              </span>
            </div>
            <p className="tz-hint">
              Space or click plays and pauses · arrows step a beat · R restarts · H hides this ·{' '}
              {vertical ? <a href="?">16:9</a> : <a href="?ar=916">9:16 vertical</a>} · zoom the browser for a bigger capture
            </p>
          </>
        )}
      </div>
    </ClockContext.Provider>
  )
}
