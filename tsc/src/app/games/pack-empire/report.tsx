'use client'

// A finished lineup, read properly: the formation with its chemistry drawn on it,
// the ledger beside it, and on a blind run, every pack you opened against what
// was in it. Empire Builder's recap and a Versus seat both end here.

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  FORMATION,
  RARITY_LOOK,
  SLOTS,
  chemistryFor,
  draftGrade,
  lineupScore,
  surname,
  type ChemBond,
  type Chemistry,
  type MissCard,
  type Missed,
  type Player,
} from '@/lib/packEmpire/rules'
import { BOND_LABEL, Bonds, Check, Face, Field, FilledSlot, bondKind } from './cards'

type Point = { x: number; y: number }
type Box = { l: number; t: number; r: number; b: number }
type Kind = ReturnType<typeof bondKind>
type Link = { bond: number; kind: Kind; slots: [number, number]; d: string; ends: [Point, Point] }
type Ring = Box & { slot: number; kind: Kind; bonds: number[] }

const centre = (b: Box): Point => ({ x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 })

/** Where a slot's card sits inside `box`. */
function slotBox(box: HTMLElement, slot: number): Box | null {
  const card = box.querySelector(`[data-pe-slot="${slot}"] .pe-fsl`)
  if (!card) return null
  const a = box.getBoundingClientRect()
  const r = card.getBoundingClientRect()
  return { l: r.left - a.left, t: r.top - a.top, r: r.right - a.left, b: r.bottom - a.top }
}

/** The middle of a slot's card inside `box`. */
export function slotCentre(box: HTMLElement, slot: number): Point | null {
  const b = slotBox(box, slot)
  return b && centre(b)
}

/** A bond's two slots. A stored bond names cards, not slots. */
export function bondSlots(b: ChemBond, lineup: (Player | null)[]): [number, number] | null {
  const a = lineup.findIndex((p) => p?.id === b.a)
  const z = lineup.findIndex((p) => p?.id === b.b)
  return a < 0 || z < 0 ? null : [a, z]
}

/** Where a line from the middle of a card towards `to` crosses its edge. */
function edgePoint(card: Box, to: Point): Point {
  const from = centre(card)
  const dx = to.x - from.x
  const dy = to.y - from.y
  const fit = Math.min(dx ? (card.r - from.x) / Math.abs(dx) : Infinity, dy ? (card.b - from.y) / Math.abs(dy) : Infinity)
  return { x: from.x + dx * fit, y: from.y + dy * fit }
}

/** The three rows of the formation, front to back. */
const ROWS: readonly (readonly number[])[] = [FORMATION.line, [...FORMATION.wrLeft, ...FORMATION.wrRight], FORMATION.backfield]
const rowOf = (slot: number) => ROWS.findIndex((row) => row.includes(slot))

type Bracket = { bond: number; slots: [number, number]; left: Box; right: Box; x1: number; x2: number; lane: number }

/**
 * Two cards on one row are too close for a line between them to show (a guard and
 * his center are 6px apart on a phone), so they get a bracket over the top. Each
 * one has its own lane, wider ones above narrower ones, and a card's legs fan out
 * along its top edge, nearest neighbour outermost, so no two ever run together.
 * The space over a row is measured, so a bracket stops short of the labels above.
 */
function bracketPaths(box: HTMLElement, list: Bracket[]): Map<number, Pick<Link, 'd' | 'ends'>> {
  const out = new Map<number, Pick<Link, 'd' | 'ends'>>()
  const near = (a: Bracket, b: Bracket) => a.right.l - a.left.l - (b.right.l - b.left.l)
  const FAN = 0.12

  for (const card of new Set(list.flatMap((p) => p.slots))) {
    const rightward = list.filter((p) => p.slots[0] === card).sort(near)
    const leftward = list.filter((p) => p.slots[1] === card).sort(near)
    rightward.forEach((p, rank) => (p.x1 = p.left.l + (p.left.r - p.left.l) * (0.86 - rank * FAN)))
    leftward.forEach((p, rank) => (p.x2 = p.right.l + (p.right.r - p.right.l) * (0.14 + rank * FAN)))
  }

  ROWS.forEach((row, n) => {
    const here = list.filter((p) => row.includes(p.slots[0])).sort((a, b) => a.x2 - a.x1 - (b.x2 - b.x1))
    if (here.length === 0) return
    const lanes: Bracket[][] = []
    for (const p of here) {
      const clear = (q: Bracket) => p.x2 < q.x1 - 4 || p.x1 > q.x2 + 4
      let lane = lanes.findIndex((taken) => taken.every(clear))
      if (lane < 0) lane = lanes.push([]) - 1
      lanes[lane].push(p)
      p.lane = lane
    }

    const height = here[0].left.b - here[0].left.t
    const top = Math.min(...here.flatMap((p) => [p.left.t, p.right.t]))
    const above = n > 0 ? box.querySelector(`[data-pe-slot="${ROWS[n - 1][0]}"]`)?.getBoundingClientRect() : null
    const space = above ? top + box.getBoundingClientRect().top - above.bottom : top
    const room = n === 0 ? Math.max(space - 4, height * 0.12) : Math.max(space * 0.85, 6)
    const first = Math.min(height * 0.07, room * 0.45)
    const step = lanes.length > 1 ? Math.min(height * 0.045, (room - first) / (lanes.length - 1)) : 0

    for (const p of here) {
      const y = top - first - p.lane * step
      const r = Math.min(height * 0.05, (p.x2 - p.x1) / 2)
      out.set(p.bond, {
        d: `M${p.x1} ${p.left.t}V${y + r}Q${p.x1} ${y} ${p.x1 + r} ${y}H${p.x2 - r}Q${p.x2} ${y} ${p.x2} ${y + r}V${p.right.t}`,
        ends: [
          { x: p.x1, y: p.left.t },
          { x: p.x2, y: p.right.t },
        ],
      })
    }
  })
  return out
}

/** The kind a card's border wears when it's in more than one. */
const RING_ORDER: Kind[] = ['real', 'same', 'rival']

/**
 * The bonds on the field: a border round every card in one, and a line between
 * each pair that sits over the cards and ends at their edges, so you can always
 * see who goes with who. Colour says what kind and so does the line itself: double
 * for real teammates, dashed for rivals. Measured off the cards, so it follows the
 * field at any width. `count` draws the first few (the final reveal does them one
 * at a time). `hot` picks one bond out and `focus` one card's bonds, and either way
 * the rest drop back.
 */
export function ChemLinks({
  bonds,
  lineup,
  count,
  hot = null,
  focus = null,
}: {
  bonds: ChemBond[]
  lineup: (Player | null)[]
  count?: number
  hot?: number | null
  focus?: number | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [links, setLinks] = useState<Link[]>([])
  const [rings, setRings] = useState<Ring[]>([])

  useLayoutEffect(() => {
    const box = ref.current?.parentElement
    if (!box) return
    const measure = () => {
      const placed: { bond: number; slots: [number, number]; from: Box; to: Box }[] = []
      const round = new Map<number, Ring>()
      bonds.forEach((b, bond) => {
        const pair = bondSlots(b, lineup)
        const from = pair && slotBox(box, pair[0])
        const to = pair && slotBox(box, pair[1])
        if (!pair || !from || !to) return
        placed.push({ bond, slots: pair, from, to })
        for (const [slot, card] of [
          [pair[0], from],
          [pair[1], to],
        ] as const) {
          const ring = round.get(slot) ?? { ...card, slot, kind: bondKind(b), bonds: [] }
          ring.bonds.push(bond)
          round.set(slot, ring)
        }
      })
      for (const ring of round.values()) {
        const kinds = ring.bonds.map((n) => bondKind(bonds[n]))
        ring.kind = RING_ORDER.find((k) => kinds.includes(k)) ?? ring.kind
      }

      const brackets = placed
        .filter((p) => rowOf(p.slots[0]) === rowOf(p.slots[1]))
        .map(({ bond, slots, from, to }): Bracket => {
          const flip = from.l > to.l
          return { bond, slots: flip ? [slots[1], slots[0]] : slots, left: flip ? to : from, right: flip ? from : to, x1: 0, x2: 0, lane: 0 }
        })
      const paths = bracketPaths(box, brackets)
      setLinks(
        placed.map(({ bond, slots, from, to }) => {
          const kind = bondKind(bonds[bond])
          const over = paths.get(bond)
          if (over) return { bond, kind, slots, ...over }
          const p = edgePoint(from, centre(to))
          const q = edgePoint(to, centre(from))
          return { bond, kind, slots, d: `M${p.x} ${p.y}L${q.x} ${q.y}`, ends: [p, q] }
        })
      )
      setRings([...round.values()])
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(box)
    return () => watch.disconnect()
  }, [bonds, lineup])

  const drawn = (bond: number) => count == null || bond < count
  const lit = (l: Link) => l.bond === hot || (focus != null && l.slots.includes(focus))
  const litBonds = links.filter(lit).map((l) => l.bond)

  return (
    <div ref={ref} className="pe-links" aria-hidden data-hot={hot != null || focus != null ? '' : undefined}>
      {rings
        .filter((r) => r.bonds.some(drawn))
        .map((r) => (
          <span
            key={r.slot}
            className="pe-cring"
            data-kind={r.kind}
            data-hot={r.bonds.some((b) => litBonds.includes(b)) ? '' : undefined}
            style={{ left: r.l, top: r.t, width: r.r - r.l, height: r.b - r.t }}
          />
        ))}
      {links
        .filter((l) => drawn(l.bond))
        .map((l) => (
          <svg key={l.bond} className="pe-clink" data-kind={l.kind} data-hot={lit(l) ? '' : undefined}>
            <path className="case" d={l.d} />
            <path className="line" d={l.d} />
            {l.kind === 'real' && <path className="core" d={l.d} />}
            {l.ends.map((e, i) => (
              <circle key={i} className="end" cx={e.x} cy={e.y} r="3.5" />
            ))}
          </svg>
        ))}
    </div>
  )
}

/** What each card's bonds net, for the tag under it. */
export function chemByCard(chem: Chemistry | null): Map<string, number> {
  const net = new Map<string, number>()
  for (const b of chem?.bonds ?? []) {
    net.set(b.a, (net.get(b.a) ?? 0) + b.points)
    net.set(b.b, (net.get(b.b) ?? 0) + b.points)
  }
  return net
}

const asPlayer = (c: MissCard): Player => ({ ...c, accolades: [] })

function signed(n: number) {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}`
}

/** The formation and its chemistry, with the perfect eleven a tap away. */
export function DraftReport({
  lineup,
  chem,
  captain,
  missed,
  ladder,
  sheet,
  counted,
}: {
  lineup: Player[]
  chem: Chemistry
  captain: number | null
  missed?: Missed | null
  /** Under the ledger, where a run has no final reveal to climb it. */
  ladder?: React.ReactNode
  /** The lineup as a list, beside the ledger under the field. */
  sheet?: React.ReactNode
  /** The Daily: its rule moves the card total, so the ledger takes it as given. */
  counted?: { cards: number; rule: number | null; total: number }
}) {
  const [view, setView] = useState<'yours' | 'perfect'>('yours')
  const [hot, setHot] = useState<number | null>(null)
  const [focus, setFocus] = useState<number | null>(null)

  // The perfect eleven goes in the slots their packs were opened for, so the
  // two formations line up card for card.
  const perfect = useMemo(() => {
    if (!missed?.rows) return null
    const eleven: Player[] = []
    for (const row of missed.rows) {
      const card = row.cards.find((c) => c.id === row.perfect)
      if (card) eleven[row.slot] = asPlayer(card)
    }
    return { lineup: eleven, chem: chemistryFor(eleven, true) }
  }, [missed])

  const showing = view === 'perfect' && perfect ? perfect : { lineup, chem }
  const net = useMemo(() => chemByCard(showing.chem), [showing.chem])
  const cards = counted?.cards ?? lineupScore(showing.lineup)
  const pick = (v: 'yours' | 'perfect') => {
    setView(v)
    setHot(null)
    setFocus(null)
  }
  const pickBond = (bond: number | null) => {
    setHot(bond)
    setFocus(null)
  }
  // A card's bonds on their own, off a tap on the card; a tap anywhere else, or on
  // the same card, puts them all back.
  const tapField = (e: React.MouseEvent) => {
    const at = (e.target as Element).closest('[data-pe-slot]')?.getAttribute('data-pe-slot')
    const slot = at == null ? null : Number(at)
    const held = slot != null && showing.chem.bonds.some((b) => bondSlots(b, showing.lineup)?.includes(slot))
    setFocus(held && slot !== focus ? slot : null)
    setHot(null)
  }

  return (
    <section className={`pe-rep${sheet ? ' pe-rep--sheet' : ''}`} aria-label="Your lineup">
      <div className="pe-rep-pitch">
        {perfect && (
          <div className="pe-rep-tabs" role="tablist" aria-label="Lineup">
            <button type="button" role="tab" aria-selected={view === 'yours'} onClick={() => pick('yours')}>
              Your Eleven
            </button>
            <button type="button" role="tab" aria-selected={view === 'perfect'} onClick={() => pick('perfect')}>
              Perfect Eleven
            </button>
          </div>
        )}
        <div className="pe-turf pe-rep-turf" onClick={tapField}>
          <ChemLinks bonds={showing.chem.bonds} lineup={showing.lineup} hot={hot} focus={focus} />
          <Field
            lineup={showing.lineup}
            view={(i) => ({
              clickable: false,
              captain: i === captain,
              chem: net.get(showing.lineup[i]?.id ?? '') ?? null,
              flag: view === 'perfect' && showing.lineup[i]?.id === lineup[i]?.id ? { text: 'Yours', color: '#7be0a2' } : null,
            })}
          />
        </div>
        <div className="pe-rep-key" aria-hidden>
          {(['real', 'same', 'rival'] as const).map((k) => (
            <span key={k} data-kind={k}>
              <i />
              {BOND_LABEL[k]}
            </span>
          ))}
          {showing.chem.bonds.length > 0 && <span className="pe-rep-tip">Tap a card for just its bonds</span>}
        </div>
      </div>

      {sheet}
      <div className="pe-rep-side">
        <div className="pe-ledger">
          <div className="pe-ledger-head">
            <div className="pe-kicker">Chemistry</div>
            <div className={`pe-ledger-net${showing.chem.total < 0 ? ' down' : ''}`}>{signed(showing.chem.total)}</div>
          </div>
          <dl className="pe-ledger-sum">
            <div>
              <dt>Cards</dt>
              <dd>{cards.toLocaleString()}</dd>
            </div>
            {counted?.rule != null && (
              <div>
                <dt>Rule</dt>
                <dd>{signed(counted.rule)}</dd>
              </div>
            )}
            <div>
              <dt>Synergy</dt>
              <dd>{signed(showing.chem.synergy)}</dd>
            </div>
            <div>
              <dt>Rivalry</dt>
              <dd>{signed(showing.chem.rivalry)}</dd>
            </div>
            <div className="total">
              <dt>Total</dt>
              <dd>{(counted?.total ?? cards + showing.chem.total).toLocaleString()}</dd>
            </div>
          </dl>
          <Bonds chem={showing.chem} lineup={showing.lineup} hot={hot} onHot={pickBond} />
        </div>
        {ladder}
      </div>
    </section>
  )
}

const label = (c: MissCard) => (c.year ? `${c.name} ${c.year}` : c.name)

/** Whole thousands that clear the best card on the board. */
function scaleTop(rows: Missed['rows']): number {
  const most = Math.max(...rows.flatMap((r) => r.cards.map((c) => c.score)))
  return Math.max(3000, Math.ceil(most / 1000) * 1000)
}

/** One pack on the value scale: a dot a card, a ring on yours, and the stretch
    between yours and the best card is what it cost. */
function Strip({ cards, kept, top }: { cards: MissCard[]; kept: MissCard; top: number }) {
  const at = (n: number) => `${(n / top) * 100}%`
  const best = cards[0]
  return (
    <span className="pe-strip-plot" aria-hidden>
      {best.score > kept.score && (
        <i className="pe-sp-gap" style={{ left: at(kept.score), width: at(best.score - kept.score) }} />
      )}
      {[...cards].reverse().map((c) => (
        <i
          key={c.id}
          className={`pe-sp-dot${c.id === kept.id ? ' mine' : ''}`}
          data-tip={`${label(c)}, ${c.score.toLocaleString()}`}
          style={{ left: at(c.score), '--dot': RARITY_LOOK[c.rarity].color } as React.CSSProperties}
        />
      ))}
    </span>
  )
}

/** Every pack you opened, in order, against what was in it. */
export function PackBoard({ missed, battled = false }: { missed: Missed; battled?: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  // A game finished before the board existed has the old, shorter record.
  if (!missed.rows) return null
  const { rows, hit, packs, score, perfect } = missed
  const gapOf = (r: Missed['rows'][number]) => r.cards[0].score - (r.cards.find((c) => c.id === r.kept)?.score ?? 0)
  const left = perfect != null ? perfect - score : rows.reduce((sum, r) => sum + gapOf(r), 0)
  const share = perfect != null ? (perfect > 0 ? Math.min(1, score / perfect) : 0) : hit / packs
  const grade = perfect != null ? draftGrade(score, perfect) : null
  const top = scaleTop(rows)
  const step = top > 4000 ? 2000 : 1000
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step)

  return (
    <section className="pe-pb" aria-label="Pack By Pack">
      <header className="pe-pb-head">
        <div className="pe-pb-grade" data-g={grade?.[0] ?? 'A'}>
          <span>{grade ? 'Draft Grade' : 'Best Card Taken'}</span>
          <b>{grade ?? `${hit}/${packs}`}</b>
        </div>
        <div className="pe-pb-sum">
          <div className="pe-kicker">Pack By Pack</div>
          <p className="pe-pb-line">
            {perfect != null ? (
              <>
                <b>{Math.round(share * 100)}%</b> of a perfect draft
              </>
            ) : (
              <>
                <b>{left.toLocaleString()}</b> left in the packs
              </>
            )}
          </p>
          <div className="pe-pb-meter" aria-hidden>
            <i style={{ transform: `scaleX(${share})` }} />
          </div>
          <dl className="pe-pb-stats">
            {perfect != null && (
              <div>
                <dt>Best Card Taken</dt>
                <dd>
                  {hit} of {packs}
                </dd>
              </div>
            )}
            <div>
              <dt>{perfect != null ? 'Your Draft' : 'Your Cards'}</dt>
              <dd>{score.toLocaleString()}</dd>
            </div>
            {perfect != null ? (
              <div>
                <dt>Perfect Draft</dt>
                <dd>{perfect.toLocaleString()}</dd>
              </div>
            ) : (
              <div>
                <dt>Best Of Each Pack</dt>
                <dd>{(score + left).toLocaleString()}</dd>
              </div>
            )}
            {perfect != null && (
              <div>
                <dt>Left On The Table</dt>
                <dd>{left.toLocaleString()}</dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      <div className="pe-pb-table">
        <div className="pe-pb-axis" aria-hidden>
          <span />
          <span className="pe-pb-scale">
            {ticks.map((t) => (
              <i key={t} style={{ left: `${(t / top) * 100}%` }}>
                {t === 0 ? '0' : `${t / 1000}K`}
              </i>
            ))}
          </span>
          <span />
        </div>
        {rows.map((row, n) => {
          const kept = row.cards.find((c) => c.id === row.kept) ?? row.cards[0]
          const best = row.cards[0]
          const gap = best.score - kept.score
          const expanded = open === n
          return (
            <div key={row.slot} className={`pe-pb-item${expanded ? ' open' : ''}`}>
              <button type="button" className="pe-pb-row" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : n)}>
                <span className="pe-pb-who">
                  <span className="pe-pb-pos">{row.label ?? SLOTS[row.slot].short}</span>
                  <Face player={kept} />
                  <span className="pe-pb-name">
                    <b>{surname(kept.name)}</b>
                    <small>
                      {kept.year} · {kept.score.toLocaleString()}
                      {row.note ? ` · ${row.note}` : ''}
                    </small>
                  </span>
                </span>
                <span className="pe-pb-track">
                  {ticks.map((t) => (
                    <i key={t} className="pe-pb-grid" style={{ left: `${(t / top) * 100}%` }} />
                  ))}
                  <Strip cards={row.cards} kept={kept} top={top} />
                </span>
                <span className={`pe-pb-verdict${gap > 0 ? ' miss' : ''}`}>
                  {gap > 0 ? (
                    <>
                      <b>−{gap.toLocaleString()}</b>
                      <small>{surname(best.name)}</small>
                    </>
                  ) : (
                    <>
                      <Check className="pe-pb-check" />
                      <small>Best Card</small>
                    </>
                  )}
                </span>
              </button>
              {expanded && (
                <div className="pe-pb-pack">
                  {row.cards.map((c) => (
                    <FilledSlot
                      key={c.id}
                      player={asPlayer(c)}
                      flag={c.id === row.kept ? { text: 'Yours', color: '#e8a84b' } : null}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="pe-note pe-pb-note">
        Each dot is a card in that pack, ringed if you kept it.
        {perfect != null && ` Perfect is the best eleven in the packs you opened, chemistry included${battled ? ', before Battles' : ''}.`} Tap a
        pack to see all five.
      </p>
    </section>
  )
}
