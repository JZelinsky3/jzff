'use client'

// Your Season eleven in formation, the bench beside it, and subs (Joey,
// 2026-11-07: a lineup, not a list). A sub is two taps, a bench card then the
// starter he replaces or the other way round, or a drag on a mouse. A bench card
// only goes in at his own position: any receiver spot, either tackle, either
// guard. Two sizes:
//   mini  the league page: a chip a man, his face, name, value and kind
//   full  the lineup page: the cards themselves on the turf, the bench on the
//         sideline, and letting a bench card go
// Every man's arrow is the next defense: built to stop him, or soft on him.
//
// Trade Up (Joey, 2026-11-07): three bench cards of one rarity for a pack of
// three at the next rarity up, keep one (season.ts tradeUp), so cards down the
// rarities don't just sit.

import { useState } from 'react'
import { FORMATION, RARITIES, RARITY_LOOK, SLOTS, surname, type Player } from '@/lib/packEmpire/rules'
import { BENCH_MAX } from '@/lib/packEmpire/seasonRules'
import type { CardStyle, MySeason, SeasonView } from '@/lib/packEmpire/season'
import { Face, FilledSlot } from '../../cards'
import { seasonPost } from './api'

type Pick = { kind: 'bench'; id: string } | { kind: 'slot'; slot: number }

type Props = {
  leagueId: string
  me: MySeason
  size: 'mini' | 'full'
  onView: (v: SeasonView) => void
  onError?: (message: string | null) => void
}

export function VsMark({ vs }: { vs: CardStyle['vs'] | undefined }) {
  if (!vs) return null
  return (
    <svg className="pe-sn-lu-vs" data-vs={vs > 0 ? 'up' : 'down'} viewBox="0 0 10 10" aria-label={vs > 0 ? 'Soft spot for him' : 'Built to stop him'}>
      <path d={vs > 0 ? 'M2 6.5 5 3.5 8 6.5' : 'M2 3.5 5 6.5 8 3.5'} />
    </svg>
  )
}

const TRADE_IN = 3
const TRADE_OUT_WORD = 'three'

export function SeasonLineup({ leagueId, me, size, onView, onError }: Props) {
  const [sel, setSel] = useState<Pick | null>(null)
  const [busy, setBusy] = useState(false)
  const [trading, setTrading] = useState(false)
  const [offer, setOffer] = useState<string[]>([])
  const offered = offer.flatMap((id) => me.bench.find((p) => p.id === id) ?? [])
  const offerRarity = offered[0]?.rarity ?? null
  const up = offerRarity ? RARITIES[RARITIES.indexOf(offerRarity) + 1] : null
  // A trade needs three of one rarity below Immortal, and no pack already waiting.
  const tradeable = (p: Player) => p.rarity !== 'immortal' && p.rarity !== 'canton' && (!offerRarity || p.rarity === offerRarity)
  const canTrade = !me.pending && me.bench.filter((p) => p.rarity !== 'immortal' && p.rarity !== 'canton').length >= TRADE_IN

  const benchCard = sel?.kind === 'bench' ? (me.bench.find((p) => p.id === sel.id) ?? null) : null
  const slotFits = (slot: number) => !!benchCard && SLOTS[slot].pool === benchCard.pos
  const benchFits = (p: Player) => sel?.kind === 'slot' && SLOTS[sel.slot].pool === p.pos

  const call = async (body: Record<string, unknown>) => {
    setBusy(true)
    onError?.(null)
    try {
      const { view } = await seasonPost({ id: leagueId, ...body })
      if (view) onView(view)
      setSel(null)
      setTrading(false)
      setOffer([])
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const swap = (benchId: string, slot: number) => call({ action: 'sub', bench: benchId, slot })

  const tapSlot = (slot: number) => {
    if (busy || trading) return
    if (benchCard && slotFits(slot)) return void swap(benchCard.id, slot)
    setSel(sel?.kind === 'slot' && sel.slot === slot ? null : { kind: 'slot', slot })
  }

  const tapBench = (p: Player) => {
    if (busy) return
    if (trading) {
      if (offer.includes(p.id)) setOffer(offer.filter((x) => x !== p.id))
      else if (tradeable(p) && offer.length < TRADE_IN) setOffer([...offer, p.id])
      return
    }
    if (sel?.kind === 'slot' && benchFits(p)) return void swap(p.id, sel.slot)
    setSel(sel?.kind === 'bench' && sel.id === p.id ? null : { kind: 'bench', id: p.id })
  }

  // A drag is the same two taps: picking it up selects it, dropping it on a fit swaps.
  const dragProps = (pick: Pick) => ({
    draggable: !busy,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', pick.kind === 'bench' ? pick.id : String(pick.slot))
      setSel(pick)
    },
  })
  const dropProps = (fits: boolean, run: () => void) => ({
    onDragOver: (e: React.DragEvent) => {
      if (fits) e.preventDefault()
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      if (fits) run()
    },
  })

  const stateOf = (on: boolean, fits: boolean): 'on' | 'fit' | 'dim' | undefined => (on ? 'on' : fits ? 'fit' : sel ? 'dim' : undefined)

  const starter = (slot: number) => {
    const p = me.lineup[slot]
    if (!p) return null
    const on = sel?.kind === 'slot' && sel.slot === slot
    const fits = slotFits(slot)
    const st = me.styles[p.id]
    const common = {
      type: 'button' as const,
      'data-state': stateOf(on, fits),
      disabled: busy,
      onClick: () => tapSlot(slot),
      ...dragProps({ kind: 'slot', slot }),
      ...dropProps(fits, () => benchCard && swap(benchCard.id, slot)),
    }
    if (size === 'mini') {
      return (
        <button key={SLOTS[slot].key} className="pe-sn-lu-chip" style={{ '--rc': RARITY_LOOK[p.rarity].color } as React.CSSProperties} aria-label={`${SLOTS[slot].label}: ${p.name}`} {...common}>
          <Chip p={p} pos={SLOTS[slot].short} st={st} />
        </button>
      )
    }
    return (
      <div key={SLOTS[slot].key} className={`pe-slot-outer${slot === 1 ? ' hb-back' : ''}`}>
        <button className="pe-sn-lu-card" aria-label={`${SLOTS[slot].label}: ${p.name}`} {...common}>
          <span key={p.id} className="pe-sn-lu-in">
            <FilledSlot player={p} />
          </span>
        </button>
        <span className="pe-sn-lu-tagline" data-vs={st?.vs || undefined}>
          {st?.tag}
          <VsMark vs={st?.vs} />
        </span>
      </div>
    )
  }

  const benchMan = (p: Player) => {
    const on = trading ? offer.includes(p.id) : sel?.kind === 'bench' && sel.id === p.id
    const fits = trading ? !on && tradeable(p) && offer.length < TRADE_IN : benchFits(p)
    const st = me.styles[p.id]
    const common = {
      type: 'button' as const,
      'data-state': trading ? (on ? 'on' : fits ? 'fit' : 'dim') : stateOf(on, fits),
      disabled: busy,
      onClick: () => tapBench(p),
      ...(trading ? {} : dragProps({ kind: 'bench', id: p.id })),
      ...(trading ? {} : dropProps(fits, () => sel?.kind === 'slot' && swap(p.id, sel.slot))),
    }
    if (size === 'mini') {
      return (
        <span key={p.id} className="pe-sn-lu-benchspot">
          <button className="pe-sn-lu-chip pe-sn-lu-chip--bench" style={{ '--rc': RARITY_LOOK[p.rarity].color } as React.CSSProperties} aria-label={`Bench: ${p.name}`} {...common}>
            <Chip p={p} pos={p.pos} st={st} />
          </button>
          {on && !trading && (
            <button type="button" className="pe-sn-lu-letgo" disabled={busy} onClick={() => call({ action: 'release', bench: p.id })}>
              Let Go
            </button>
          )}
        </span>
      )
    }
    return (
      <div key={p.id} className="pe-sn-lu-benchman">
        <button className="pe-sn-lu-card" aria-label={`Bench: ${p.name}`} {...common}>
          <span key={p.id} className="pe-sn-lu-in">
            <FilledSlot player={p} />
          </span>
        </button>
        <span className="pe-sn-lu-tagline" data-vs={st?.vs || undefined}>
          {st?.tag}
          <VsMark vs={st?.vs} />
        </span>
        {on && !trading && (
          <button type="button" className="pe-act pe-act--sm" disabled={busy} onClick={() => call({ action: 'release', bench: p.id })}>
            Let Go
          </button>
        )}
      </div>
    )
  }

  const hint = (() => {
    if (busy) return 'Making the change.'
    if (trading) {
      if (!offerRarity) return `Trade Up: pick ${TRADE_IN} bench players of the same rarity for a pack of ${TRADE_OUT_WORD} one rarity up. Keep one.`
      return `${offer.length} of ${TRADE_IN} ${RARITY_LOOK[offerRarity].label}s picked${up ? ` for a ${RARITY_LOOK[up].label} pack` : ''}.`
    }
    if (benchCard) {
      const spots = [...new Set(SLOTS.filter((s) => s.pool === benchCard.pos).map((s) => s.short))].join(' or ')
      return `${surname(benchCard.name)} plays ${spots}. Tap the starter he replaces.`
    }
    if (sel?.kind === 'slot') {
      const p = me.lineup[sel.slot]
      const any = me.bench.some((b) => b.pos === SLOTS[sel.slot].pool)
      return any ? `Tap a bench player to put in for ${surname(p?.name ?? '')}.` : `Nobody on your bench plays ${SLOTS[sel.slot].short}.`
    }
    return me.bench.length ? 'Tap a bench player, then the starter he replaces. Or drag one onto the other.' : 'Every game pays a pack. The card you keep sits here, ready to sub in.'
  })()

  const row = (slots: readonly number[]) => slots.map(starter)

  const tradeBar = (
    <div className="pe-sn-lu-trade">
      {trading ? (
        <>
          <button
            type="button"
            className="pe-push pe-push--sm"
            disabled={busy || offer.length !== TRADE_IN || !up}
            onClick={() => call({ action: 'trade', cards: offer })}
          >
            {offer.length === TRADE_IN && up ? `Trade For A ${RARITY_LOOK[up].label} Pack` : `Pick ${TRADE_IN - offer.length} More`}
          </button>
          <button type="button" className="pe-act pe-act--sm" onClick={() => (setTrading(false), setOffer([]))}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className="pe-act pe-act--sm" disabled={!canTrade || busy} onClick={() => (setTrading(true), setSel(null))} title={canTrade ? undefined : `Takes ${TRADE_IN} bench players of one rarity`}>
          Trade Up
        </button>
      )}
    </div>
  )

  if (size === 'mini') {
    return (
      <div className="pe-sn-lu pe-sn-lu--mini">
        <div className="pe-sn-lu-field">
          <div className="pe-sn-lu-row">{row(FORMATION.line)}</div>
          <div className="pe-sn-lu-row pe-sn-lu-row--skill">
            <span>{row(FORMATION.wrLeft)}</span>
            <span>{row(FORMATION.wrRight)}</span>
          </div>
          <div className="pe-sn-lu-row">{row(FORMATION.backfield)}</div>
        </div>
        <div className="pe-sn-lu-bench">
          <div className="pe-sn-lu-benchhead">
            <b>Bench</b>
            <small>
              {me.bench.length} of {BENCH_MAX}
            </small>
            {tradeBar}
          </div>
          <div className="pe-sn-lu-benchrow">{me.bench.map(benchMan)}</div>
        </div>
        <p className="pe-sn-lu-hint" aria-live="polite">
          {hint}
        </p>
      </div>
    )
  }

  return (
    <div className="pe-sn-lu pe-sn-lu--full">
      <p className="pe-sn-lu-hint" aria-live="polite">
        {hint}
      </p>
      <div className="pe-turf pe-sn-lu-turf">
        <div className="pe-field">
          <div className="pe-form-row">{row(FORMATION.line)}</div>
          <div className="pe-skill-spread">
            <div className="pe-skill-side">{row(FORMATION.wrLeft)}</div>
            <div className="pe-skill-side">{row(FORMATION.wrRight)}</div>
          </div>
          <div className="pe-form-row">{row(FORMATION.backfield)}</div>
        </div>
      </div>
      <section className="pe-sn-lu-sideline">
        <div className="pe-sn-lu-benchhead">
          <b>The Sideline</b>
          <small>
            Bench · {me.bench.length} of {BENCH_MAX}
          </small>
          {tradeBar}
        </div>
        {me.bench.length ? (
          <div className="pe-sn-lu-benchrow">{me.bench.map(benchMan)}</div>
        ) : (
          <p className="pe-note">Nobody yet. Every game pays a pack, and the card you keep lands here.</p>
        )}
      </section>
    </div>
  )
}

function Chip({ p, pos, st }: { p: Player; pos: string; st: CardStyle | undefined }) {
  return (
    <span key={p.id} className="pe-sn-lu-in pe-sn-lu-chipin">
      <span className="pe-sn-lu-pos">{pos}</span>
      <VsMark vs={st?.vs} />
      <Face player={p} />
      <span className="pe-sn-lu-name">{surname(p.name)}</span>
      <span className="pe-sn-lu-val">{p.score.toLocaleString()}</span>
      <span className="pe-sn-lu-tag">{st?.tag}</span>
    </span>
  )
}
