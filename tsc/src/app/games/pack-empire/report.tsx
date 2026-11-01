'use client'

// A finished lineup, read properly: the formation with its chemistry drawn on it,
// the ledger beside it, and on a blind run, every pack you opened against what
// was in it. Empire Builder's recap and a Versus seat both end here.

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
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

type Line = { x: number; y: number; length: number; angle: number; kind: string; bond: number }

/** Where a slot's card sits inside `box`. */
export function slotCentre(box: HTMLElement, slot: number): { x: number; y: number } | null {
  const card = box.querySelector(`[data-pe-slot="${slot}"] .pe-fsl`)
  if (!card) return null
  const a = box.getBoundingClientRect()
  const r = card.getBoundingClientRect()
  return { x: r.left + r.width / 2 - a.left, y: r.top + r.height / 2 - a.top }
}

/** A bond's two slots. A stored bond names cards, not slots. */
export function bondSlots(b: ChemBond, lineup: (Player | null)[]): [number, number] | null {
  const a = lineup.findIndex((p) => p?.id === b.a)
  const z = lineup.findIndex((p) => p?.id === b.b)
  return a < 0 || z < 0 ? null : [a, z]
}

/**
 * The bonds as lines between the cards, the way a squad screen draws its links.
 * They run under the cards, so what shows is the stretch between them. Colour says
 * what kind and so does the line itself: double for real teammates, dashed for rivals.
 * Measured off the cards, so they follow the field at any width. `count` draws the
 * first few (the final reveal does them one at a time).
 */
export function ChemLinks({
  bonds,
  lineup,
  count,
  hot = null,
}: {
  bonds: ChemBond[]
  lineup: (Player | null)[]
  count?: number
  hot?: number | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<Line[]>([])

  useLayoutEffect(() => {
    const box = ref.current?.parentElement
    if (!box) return
    const measure = () => {
      const next: Line[] = []
      bonds.forEach((b, bond) => {
        const pair = bondSlots(b, lineup)
        const from = pair && slotCentre(box, pair[0])
        const to = pair && slotCentre(box, pair[1])
        if (!from || !to) return
        const dx = to.x - from.x
        const dy = to.y - from.y
        next.push({
          x: from.x,
          y: from.y,
          length: Math.hypot(dx, dy),
          angle: (Math.atan2(dy, dx) * 180) / Math.PI,
          kind: bondKind(b),
          bond,
        })
      })
      setLines(next)
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(box)
    return () => watch.disconnect()
  }, [bonds, lineup])

  return (
    <div ref={ref} className="pe-links" aria-hidden data-hot={hot != null ? '' : undefined}>
      {lines
        .filter((l) => count == null || l.bond < count)
        .map((l) => (
          <span
            key={l.bond}
            className="pe-link"
            data-kind={l.kind}
            data-hot={hot === l.bond ? '' : undefined}
            style={{ left: l.x, top: l.y, width: l.length, transform: `rotate(${l.angle}deg)` }}
          >
            <i />
          </span>
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
        <div className="pe-turf pe-rep-turf">
          <ChemLinks bonds={showing.chem.bonds} lineup={showing.lineup} hot={hot} />
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
          <Bonds chem={showing.chem} lineup={showing.lineup} hot={hot} onHot={setHot} />
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
