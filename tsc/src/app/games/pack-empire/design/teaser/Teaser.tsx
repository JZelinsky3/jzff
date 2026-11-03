'use client'

// The teaser itself: a fixed frame that plays one beat after another and loops.
// Each beat mounts fresh, so its CSS animations start from zero, and moves on
// at marks it sets for itself (useSteps) rather than re-rendering every frame:
// a PackCard is too heavy to redraw sixty times a second.
//
// Space or click starts it and restarts it; H hides the hint. Record the frame,
// not the page: it's 1280x720 (or 540x960 on ?ar=916), so zoom the browser in
// for a bigger capture and everything scales with it.

import { useCallback, useEffect, useRef, useState } from 'react'
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

/** Marks in ms from the moment a beat mounts; returns how many have passed. */
function useSteps(marks: number[]): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const ids = marks.map((m, i) => window.setTimeout(() => setN(i + 1), m))
    return () => ids.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return n
}

/** A number counting up from `from` to `to` over `ms`, starting after `delay`. */
function useCount(to: number, ms: number, delay = 0, from = 0): number {
  const [v, setV] = useState(from)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now() + delay
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / ms))
      setV(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, ms, delay, from])
  return v
}

const k = (n: number) => n.toLocaleString('en-US')

/** The words on a beat: a small line over a big one. */
function Caption({ kick, line, sub, tone }: { kick: string; line: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <div className="tz-cap" style={tone ? ({ '--tone': tone } as React.CSSProperties) : undefined}>
      <span className="tz-kick">{kick}</span>
      <span className="tz-line">{line}</span>
      {sub && <span className="tz-sub">{sub}</span>}
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
        <ChemLinks bonds={bonds} lineup={lineup} count={step} />
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

function Battles() {
  const step = useSteps([500, 1100, 1700, 2500])
  const won = BATTLES.filter((b) => b.you > b.them).length
  return (
    <div className="tz-beat tz-split">
      <Caption kick="Versus · Even" line={<>Win the <em>Battles.</em></>} sub="Three head-to-head categories, named before the first pack." tone="#e2725b" />
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
    </div>
  )
}

function Mystery({ art }: { art: string }) {
  return (
    <div className="tz-beat tz-split">
      <Caption kick="Mode · Mystery" line={<>Mystery <em>packs.</em></>} sub="Eleven packs, five random positions each. Plan for what you still need." tone="#a99cf5" />
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
      <Caption kick="Mode · Ball Knower" line={<>Know <em>ball?</em></>} sub="No numbers. A year and a team. You remember the rest." tone="#4fc3b0" />
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

function Versus({ a, b }: { a: Player; b: Player }) {
  const you = useCount(24040, 1400, 300)
  const them = useCount(22950, 1400, 300)
  const step = useSteps([1800])
  return (
    <div className="tz-beat tz-split">
      <Caption kick="Mode · Versus" line={<>Same packs. <em>Head to head.</em></>} sub="Send a friend the link. Best offense wins." tone="#e2725b" />
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
    </div>
  )
}

function Mega({ wall }: { wall: Player[] }) {
  const step = useSteps(wall.map((_, i) => 250 + i * 140))
  const order = [5, 2, 9, 0, 11, 6, 3, 8, 1, 10, 4, 7]
  return (
    <div className="tz-beat tz-split">
      <Caption kick="Mode · Mega Draft" line={<>A live <em>snake draft.</em></>} sub="Every card on one table. Take it before they do." tone="#5fb3e8" />
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
      <Caption kick="Mode · League" line={<>Eight weeks. <em>One champion.</em></>} sub="Win a week, open a better pack. Then a Gauntlet, then a Final." tone="#b48cf0" />
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
        <Caption kick="The board" line={<>Climb the <em>ladder.</em></>} sub="Every run goes on the board. Today's best, all-time best." />
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

export function Teaser({ data, vertical }: { data: TeaserData; vertical: boolean }) {
  const beats: { ms: number; el: () => React.ReactNode }[] = [
    { ms: 3300, el: () => <Intro /> },
    { ms: 3300, el: () => <Captain /> },
    { ms: 6400, el: () => <Rip cards={data.rip} art={data.packs.captain} /> },
    { ms: 4400, el: () => <Chem lineup={data.lineup} chem={data.chem} /> },
    { ms: 3700, el: () => <Battles /> },
    { ms: 2400, el: () => <Mystery art={data.packs.wild} /> },
    { ms: 2900, el: () => <BallKnower blind={data.blind} range={data.range} real={data.wall[2]} /> },
    { ms: 2700, el: () => <Versus a={data.vsA} b={data.vsB} /> },
    { ms: 2800, el: () => <Mega wall={data.wall} /> },
    { ms: 2900, el: () => <League /> },
    { ms: 3900, el: () => <Climb total={data.total} /> },
    { ms: 4600, el: () => <Outro art={[data.packs.rb, data.packs.wr, data.packs.captain, data.packs.te, data.packs.wild]} /> },
  ]
  const [at, setAt] = useState(-1)
  const [run, setRun] = useState(0)
  const [hint, setHint] = useState(true)
  const timer = useRef(0)

  const start = useCallback(() => {
    setRun((r) => r + 1)
    setAt(0)
  }, [])

  useEffect(() => {
    if (at < 0) return
    timer.current = window.setTimeout(() => setAt((n) => (n + 1) % beats.length), beats[at].ms)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, run])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        start()
      }
      if (e.key === 'h' || e.key === 'H') setHint((h) => !h)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [start])

  return (
    <div className="tz-room">
      <div className={`tz-frame${vertical ? ' tz-frame--v' : ''}`} onClick={start}>
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
        <div className="tz-grain" aria-hidden />
      </div>
      {hint && (
        <p className="tz-hint">
          Space or click restarts · H hides this · {vertical ? <a href="?">16:9</a> : <a href="?ar=916">9:16 vertical</a>} · zoom the browser
          for a bigger capture
        </p>
      )}
    </div>
  )
}
