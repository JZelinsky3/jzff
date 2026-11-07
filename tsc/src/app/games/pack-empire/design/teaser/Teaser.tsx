'use client'

// The teaser itself: a fixed frame that plays one beat after another and loops.
// Each beat mounts fresh, so its CSS animations start from zero, and moves on
// at marks it sets for itself (useSteps) rather than re-rendering every frame:
// a PackCard is too heavy to redraw sixty times a second.
//
// Every mark reads the reel's own clock, which stops while paused, and the
// frame pauses its CSS animations with it, so a pause holds the picture exactly.
// Play waits on the ready screen until every picture the reel shows has been
// fetched and decoded (useWarm), so the first loop runs as clean as the rest.
//
// Space or click plays and pauses, the arrows step a beat, R restarts, H hides
// the controls. Stepping while paused plays that beat through and holds on its
// last frame. Record the frame, not the page: it's 1280x720 (or 540x960 on
// ?ar=916), so zoom the browser in for a bigger capture and everything scales.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { PACK_ART, RARITY_LOOK, SLOT_COUNT, WILD_PACK_ART, pearlLogo, teamLogo, tierFor, type Chemistry, type Player, type Rarity } from '@/lib/packEmpire/rules'
import type { BinderCard } from '@/lib/packEmpire/binder'
import { Tile } from '../../binder/Binder'
import { BOND_LABEL, Field, Ladder, PackCard, bondKind } from '../../cards'
import { useFaces } from '../../faces'
import { ChemLinks } from '../../report'
import { RipBurst } from '../../rip'

export type TeaserData = {
  lineup: Player[]
  chem: Chemistry
  total: number
  rip: Player[]
  vsA: Player
  vsB: Player
  /** Ball Knower's three: each as the mode deals it, then what it really was. */
  knower: { blind: Player; real: Player }[]
  wall: Player[]
  packs: { captain: string; wild: string; rb: string; wr: string; te: string }
  /** The captain pack's odds per card against an ordinary pack's. */
  odds: { rarity: Rarity; normal: number; captain: number }[]
  /** A page of the binder: each man's seasons and how often each was kept, the
      two that file in during the beat, and the set's summary by rarity. */
  binder: {
    men: { card: Player; pulls: number }[][]
    fresh: string[]
    rarities: { rarity: Rarity; of: number; owned: number }[]
  }
  /** Pictures only the CSS asks for, warmed with everything else before play. */
  preload: string[]
}

/** Every picture the reel will show: faces, logos, pack art, the backdrop. */
function reelImages(data: TeaserData, faces: Record<string, string | undefined>): string[] {
  const cards = [
    ...data.lineup,
    ...data.rip,
    data.vsA,
    data.vsB,
    ...data.knower.map((c) => c.real),
    ...data.wall,
    ...data.binder.men.flat().map((c) => c.card),
  ]
  const urls = new Set<string>(data.preload)
  for (const p of cards) {
    for (const u of [faces[p.id] ?? p.img, teamLogo(p), pearlLogo(p)]) if (u) urls.add(u)
  }
  for (const u of [...Object.values(PACK_ART), WILD_PACK_ART]) urls.add(u)
  urls.add('/games/pack-empire/teaser/stadium-wide.webp')
  urls.add('/games/pack-empire/teaser/stadium-tall.webp')
  return [...urls]
}

/** Fetches and decodes every picture before the first play, so no beat stalls
    on one the first time it shows. Holds the images so the browser keeps them. */
function useWarm(urls: string[]): number {
  const [done, setDone] = useState(0)
  const held = useRef<HTMLImageElement[]>([])
  useEffect(() => {
    let live = true
    // One slow picture can't hold the reel: each gets six seconds, then counts.
    held.current = urls.map((src) => {
      const img = new Image()
      img.src = src
      Promise.race([img.decode(), new Promise((r) => window.setTimeout(r, 6000))])
        .catch(() => {})
        .finally(() => live && setDone((n) => n + 1))
      return img
    })
    return () => {
      live = false
    }
  }, [urls])
  return done
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
  const step = useSteps([500, 1300, 1900])
  return (
    <div className="tz-beat tz-intro">
      <div className="tz-intro-glow" />
      <h1 className="tz-logo">
        <span className="tz-logo-a">Pack</span> <span className="tz-logo-b pe-em">Empire.</span>
      </h1>
      <div className="tz-intro-words">
        {step >= 1 && <span>Open packs.</span>}
        {step >= 2 && <span>Collect new cards.</span>}
        {step >= 3 && <span className="hot">Build the best lineup.</span>}
      </div>
    </div>
  )
}

const EMPTY: (Player | null)[] = Array(SLOT_COUNT).fill(null)

/** The hub's rounding: tiny odds keep a decimal so they don't read as nothing. */
const pct = (n: number) => `${n < 0.001 ? (n * 100).toFixed(2) : n < 0.1 ? (n * 100).toFixed(1) : Math.round(n * 100)}%`

/** When the captain's odds start to climb, and how long each row takes. */
const ODDS_AT = 1500
const ODDS_MS = 700

/** One rarity's chance, counting from an ordinary pack's up to the captain's,
    its bar filling from the same share to full. */
function OddsRow({ rarity, normal, captain, i }: TeaserData['odds'][number] & { i: number }) {
  const at = ODDS_AT + i * 120
  // Counted in hundredths of a percent, so the small ones move too.
  const shown = useCount(Math.round(captain * 1e4), ODDS_MS, at, Math.round(normal * 1e4)) / 1e4
  const up = useSteps([at + ODDS_MS]) >= 1
  const style = {
    '--rc': RARITY_LOOK[rarity].color,
    '--from': normal / captain,
    '--d': `${at}ms`,
  } as React.CSSProperties
  return (
    <div className="tz-odds-row" style={style} data-up={up ? '' : undefined}>
      <span className="tz-odds-name">{RARITY_LOOK[rarity].label}</span>
      <span className="tz-odds-bar">
        <i />
      </span>
      <b>{pct(shown)}</b>
      <span className="tz-odds-x">{Math.round(captain / normal)}×</span>
    </div>
  )
}

function Captain({ odds }: { odds: TeaserData['odds'] }) {
  const step = useSteps([1100, 1700])
  // 1 the captain's picked, and its odds climb  2 the rest of the field drops back
  return (
    <div className="tz-beat tz-split">
      <div className="tz-cap-col">
        <Caption kick="Step one" line={<>Pick a <em>captain.</em></>} sub="Your captain's pack gets better odds, so you're more likely to pull a rarer card." />
        <div className="tz-odds">
          <div className="tz-odds-head">
            <span>{step >= 1 ? 'QB captain pack' : 'Ordinary QB pack'}</span>
            <span>Chance per card</span>
          </div>
          {odds.map((o, i) => (
            <OddsRow key={o.rarity} {...o} i={i} />
          ))}
        </div>
      </div>
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
  const step = useSteps(bonds.map((_, i) => 700 + i * Math.min(360, 3400 / Math.max(1, bonds.length))))
  const shown = bonds.slice(0, step).reduce((s, b) => s + b.points, 0)
  const kinds = new Set(bonds.map(bondKind))
  // The key sits under the total on 16:9 and under the field on 9:16; the CSS
  // shows one of the two.
  const key = (where: 'side' | 'below') => (
    <div className={`tz-chem-key tz-chem-key--${where} pe-rep-key`}>
      {(['real', 'same', 'rival'] as const)
        .filter((x) => kinds.has(x))
        .map((x) => (
          <span key={x} data-kind={x}>
            <i />
            {BOND_LABEL[x]}
          </span>
        ))}
    </div>
  )
  return (
    <div className="tz-beat tz-split">
      <div className="tz-cap-col">
        <Caption kick="Step four" line={<>Chemistry <em>counts.</em></>} sub="Real teammates, the same franchise, old rivals. Every bond moves the score." />
        <div className="tz-chem-total" data-neg={shown < 0 ? '' : undefined}>
          {shown >= 0 ? '+' : '−'}
          {k(Math.abs(shown))}
          <small>Chemistry</small>
        </div>
        {key('side')}
      </div>
      <div className="pe-turf tz-turf tz-turf--full">
        {/* Mounted with the first bond, once the beat has stopped scaling in:
            the links measure the cards once, and a measure mid-zoom set every
            ring a few pixels low and wide. */}
        {step >= 1 && <ChemLinks bonds={bonds} lineup={lineup} count={step} />}
        <Field lineup={lineup} view={(i) => ({ clickable: false, captain: i === 0 })} />
      </div>
      {key('below')}
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
        lead="Plan your lineup."
        sub="You never know who shows up next. Fill a spot too early and a better card might come out later."
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

/** Ball Knower, played the way the site plays it: a tap takes the middle card
    (Yours, and the other two drop back), then the pack turns over, the two you
    passed first and the one you took last. */
const BK_TAP = 950
const BK_PICK = 1100
const BK_KEEP = 1
/** When each card starts to turn. */
const BK_TURN = [1700, 2600, 2150]
const BK_HALF = 180

function BallKnower({ cards }: { cards: { blind: Player; real: Player }[] }) {
  // Two marks a card: it starts to turn, then its face swaps while it's edge-on.
  const marks = [BK_TAP, BK_PICK, ...BK_TURN.flatMap((t) => [t, t + BK_HALF])].sort((a, b) => a - b)
  const step = useSteps(marks)
  const passed = (ms: number) => step > marks.indexOf(ms)
  const picked = passed(BK_PICK)
  return (
    <div className="tz-beat tz-split">
      <Caption
        kick="Hard mode"
        line={<>Ball <em>Knower.</em></>}
        lead="Know ball?"
        sub="Just a name and a season. No value, no team. Pick the right one."
        tone="#4fc3b0"
      />
      <div className="tz-bk">
        {cards.map((c, i) => {
          const turned = passed(BK_TURN[i] + BK_HALF)
          const mine = i === BK_KEEP
          return (
            <div
              key={c.real.id}
              className="tz-bk-card"
              style={{ '--k': i } as React.CSSProperties}
              data-passed={picked && !mine && !turned ? '' : undefined}
            >
              <div className="tz-bk-flip" data-turn={passed(BK_TURN[i]) ? '' : undefined}>
                <PackCard player={turned ? c.real : c.blind} revealed index={0} kept={picked && mine} burst={turned} disabled />
              </div>
              {mine && passed(BK_TAP) && <span className="tz-tap" aria-hidden />}
            </div>
          )
        })}
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
        <span className="tz-vs-name">Opponent</span>
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
          lead="Challenge a friend or play the CPU."
          sub="Classic, Mystery or Even, on any difficulty. Draft your team and go head to head."
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
        lead="One season. One champion."
        sub="Open packs every week, lock in your best players and keep improving your team to take home the trophy."
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
  const shown = useCount(total, 3000, 300)
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

/** A card as the binder holds it: the whole card once it's been kept, only what
    it's chasing while it's still face down. */
function binderCard(card: Player, pulls: number): BinderCard {
  const site = { pulls: 0, oneIn: 0 }
  return pulls > 0
    ? { ...card, pulls, firstAt: '', site }
    : { id: card.id, name: card.name, pos: card.pos, year: card.year, club: card.club, rarity: card.rarity, pulls: 0, site }
}

/** When each new card starts to turn over into the binder. */
const BD_FILE = [1500, 2500]
const BD_HALF = 180

/** The binder: a page of it, six men and their seasons, then two cards you kept
    file in, a Transcendent and then a Canton, and the counts go up. */
function BinderBeat({ binder }: { binder: TeaserData['binder'] }) {
  const marks = BD_FILE.flatMap((t) => [t, t + BD_HALF])
  const step = useSteps(marks)
  const passed = (ms: number) => step > marks.indexOf(ms)
  const at = (id: string) => binder.fresh.indexOf(id)
  const turning = (id: string) => at(id) >= 0 && passed(BD_FILE[at(id)])
  const filed = (id: string) => at(id) >= 0 && passed(BD_FILE[at(id)] + BD_HALF)
  const fresh = binder.men.flat().filter((c) => filed(c.card.id)).map((c) => c.card)
  const owned = binder.rarities.reduce((s, r) => s + r.owned, 0) + fresh.length
  const total = binder.rarities.reduce((s, r) => s + r.of, 0)
  return (
    <div className="tz-beat tz-split">
      <div className="tz-cap-col">
        <Caption kick="The collection" line={<>Fill the <em>binder.</em></>} lead="Every card you keep goes in." sub="Every season of every player, Common to Canton. Finish the set." />
        <div className="tz-bd-sum">
          <div className="pe-bd-sum-num">
            <span key={owned} className={fresh.length ? 'tz-bd-num' : undefined}>
              {k(owned)}
            </span>
            <span>/{k(total)}</span>
          </div>
          <div className="pe-note">Cards collected</div>
          <div className="pe-bd-rar">
            {[...binder.rarities].reverse().map((r) => {
              const n = r.owned + fresh.filter((p) => p.rarity === r.rarity).length
              return (
                <div
                  key={r.rarity}
                  className="pe-bd-rar-row"
                  data-up={n > r.owned ? '' : undefined}
                  style={{ '--rc': RARITY_LOOK[r.rarity].color } as React.CSSProperties}
                >
                  <span className="pe-bd-rar-name">{RARITY_LOOK[r.rarity].label}</span>
                  <span className="pe-bd-rar-bar">
                    <span style={{ width: `${(100 * n) / r.of}%` }} />
                  </span>
                  <span className="pe-bd-rar-n">
                    {n}
                    <em>/{r.of}</em>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="tz-bd">
        {binder.men.map((row, m) => {
          const have = row.filter((c) => c.pulls > 0 || filed(c.card.id)).length
          return (
            <div key={row[0].card.id} className="pe-bd-man" style={{ '--m': m } as React.CSSProperties}>
              <div className="pe-bd-man-head">
                <span className="pe-bd-man-pos">{row[0].card.pos}</span>
                <span className="pe-bd-man-name">{row[0].card.name}</span>
                <span className="pe-bd-man-meta">
                  {have}/{row.length}
                </span>
              </div>
              <div className="pe-bd-strip">
                {row.map((c) => (
                  <div key={c.card.id} className="tz-bd-cell" data-turn={turning(c.card.id) ? '' : undefined}>
                    <Tile card={binderCard(c.card, filed(c.card.id) ? 1 : c.pulls)} onClick={() => {}} />
                    {filed(c.card.id) && <span className="tz-bd-new">New</span>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
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
const HOLD = 700

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
      { name: 'Intro', ms: 2600, tag: false, el: () => <Intro /> },
      { name: 'Captain', ms: 3200, el: () => <Captain odds={data.odds} /> },
      { name: 'The rip', ms: 6400, el: () => <Rip cards={data.rip} art={data.packs.captain} /> },
      { name: 'Chemistry', ms: 5300, el: () => <Chem lineup={data.lineup} chem={data.chem} /> },
      { name: 'Mystery Packs', ms: 2400, el: () => <Mystery art={data.packs.wild} /> },
      { name: 'Ball Knower', ms: 3800, el: () => <BallKnower cards={data.knower} /> },
      { name: 'Versus Challenge', ms: VS_HALF + 3700, el: () => <Versus a={data.vsA} b={data.vsB} half={VS_HALF} /> },
      { name: 'Mega Draft', ms: 2800, el: () => <Mega wall={data.wall} /> },
      { name: 'League Mode', ms: 2900, el: () => <League /> },
      { name: 'The board', ms: 4300, el: () => <Climb total={data.total} /> },
      { name: 'The binder', ms: 3800, el: () => <BinderBeat binder={data.binder} /> },
      { name: 'Outro', ms: 4600, tag: false, el: () => <Outro art={[data.packs.rb, data.packs.wr, data.packs.captain, data.packs.te, data.packs.wild]} /> },
    ] as Beat[]
  ).map((b) => ({ ...b, ms: b.ms + HOLD }))
  const [at, setAt] = useState(-1)
  const [run, setRun] = useState(0)
  const [paused, setPaused] = useState(false)
  const [chrome, setChrome] = useState(true)

  // Play waits until every picture is in, or 20 seconds if one never answers.
  const faces = useFaces()
  const images = useMemo(() => reelImages(data, faces), [data, faces])
  const warmed = useWarm(images)
  const [late, setLate] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setLate(true), 20000)
    return () => clearTimeout(id)
  }, [])
  const ready = late || warmed >= images.length

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
    if (!ready) return
    holdAtEnd.current = false
    hold(false)
    setRun((r) => r + 1)
    setAt(0)
  }, [hold, ready])

  const go = useCallback(
    (i: number) => {
      if (!ready) return
      if (clock.current.paused) {
        holdAtEnd.current = true
        hold(false)
      }
      setRun((r) => r + 1)
      setAt(i)
    },
    [hold, ready]
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
              <p>{ready ? 'Click or press space to play' : `Loading ${warmed} of ${images.length}`}</p>
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
