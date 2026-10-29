'use client'

// The stage: one pack, opened.
//
// The original opened a pack into a panel underneath the field and scrolled
// the page down to it, which on a phone meant losing the field every time and
// scrolling back up to open the next one. Here the pack opens OVER the table
// instead: the cards deal in, you flip them, you keep one, and the stage
// clears to show it standing in its slot. Every mode opens packs through
// this, so the flip, the pick and the immortal flash behave the same
// everywhere.
//
// Opening a pack is a commitment, exactly as it was: there is no close
// button. The pack is dealt server-side and re-deals identically, so leaving
// and coming back finds the same five cards waiting.

import { useCallback, useEffect, useRef, useState } from 'react'
import { PACK_ART, SLOTS, type Player } from '@/lib/packEmpire/rules'
import { Bolt, PackCard } from './cards'

export type StageState = {
  slot: number
  /** Null while the pack is being dealt. */
  cards: Player[] | null
  revealed: boolean[]
  pickedId: string | null
  error: string | null
  leaving: boolean
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** `initial` puts a pack that was already open (a League pack left open
    before a refresh) straight back on the stage. */
export function usePackStage(initial: StageState | null = null) {
  const [stage, setStage] = useState<StageState | null>(initial)
  const [flash, setFlash] = useState(false)
  const busy = useRef(false)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const t = timers.current
    return () => t.forEach((id) => window.clearTimeout(id))
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  const flashImmortal = useCallback(() => {
    setFlash(true)
    later(() => setFlash(false), 2400)
  }, [later])

  // Nothing behind the stage should scroll while a pack is open.
  useEffect(() => {
    if (!stage) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [stage])

  const open = useCallback(
    async (slot: number, deal: () => Promise<Player[]>) => {
      if (busy.current) return
      busy.current = true
      setStage({ slot, cards: null, revealed: [], pickedId: null, error: null, leaving: false })
      try {
        // A floor on the shake, so a fast server still reads as a pack being
        // torn open rather than a list appearing.
        const [cards] = await Promise.all([deal(), wait(560)])
        setStage((s) => (s && s.slot === slot ? { ...s, cards, revealed: cards.map(() => false) } : s))
        if (cards.some((c) => c.rarity === 'immortal')) later(flashImmortal, 300)
      } catch (e) {
        setStage((s) =>
          s ? { ...s, error: e instanceof Error ? e.message : 'The pack would not open.' } : s
        )
      } finally {
        busy.current = false
      }
    },
    [flashImmortal, later]
  )

  const flip = useCallback((slot: number, i: number) => {
    setStage((cur) => {
      if (!cur || cur.slot !== slot || cur.revealed[i]) return cur
      const revealed = [...cur.revealed]
      revealed[i] = true
      return { ...cur, revealed }
    })
  }, [])

  const reveal = useCallback(
    (i: number) => {
      if (!stage?.cards || stage.revealed[i]) return
      flip(stage.slot, i)
      if (stage.cards[i]?.rarity === 'immortal') later(flashImmortal, 200)
    },
    [stage, flip, flashImmortal, later]
  )

  const revealAll = useCallback(() => {
    if (!stage?.cards) return
    const slot = stage.slot
    let n = 0
    stage.revealed.forEach((r, i) => {
      if (!r) later(() => flip(slot, i), n++ * 130)
    })
  }, [stage, flip, later])

  /**
   * Keep card i. `commit` writes the pick wherever this mode keeps it; if it
   * throws (a League pick the server refused), the card goes back on the
   * table with the reason above it instead of quietly vanishing.
   */
  const pick = useCallback(
    async (i: number, commit: (card: Player) => Promise<void> | void) => {
      const s = stage
      if (!s || !s.cards || s.pickedId || busy.current) return
      const card = s.cards[i]
      busy.current = true
      setStage({ ...s, pickedId: card.id, error: null })
      try {
        await Promise.all([commit(card), wait(650)])
        setStage((cur) => (cur ? { ...cur, leaving: true } : cur))
        await wait(280)
        setStage(null)
      } catch (e) {
        setStage((cur) =>
          cur ? { ...cur, pickedId: null, error: e instanceof Error ? e.message : 'That pick did not save.' } : cur
        )
      } finally {
        busy.current = false
      }
    },
    [stage]
  )

  const dismiss = useCallback(() => setStage(null), [])

  return { stage, flash, open, reveal, revealAll, pick, dismiss }
}

export type PackTag = { text: string; color?: string } | null

export function PackStage({
  stage,
  tag,
  onCard,
  onRevealAll,
  onDismiss,
  chemFor,
}: {
  stage: StageState
  tag?: PackTag
  onCard: (i: number) => void
  onRevealAll: () => void
  /** Only offered when the pack failed to deal: there is nothing to lose. */
  onDismiss: () => void
  chemFor?: (p: Player) => number | null
}) {
  const def = SLOTS[stage.slot]
  const cards = stage.cards
  const hidden = stage.revealed.filter((r) => !r).length
  const shown = stage.revealed.length - hidden

  let status = 'Tearing it open'
  if (stage.error) status = stage.error
  else if (cards && stage.pickedId) status = 'Signed'
  else if (cards && shown > 0) status = `${shown} of ${cards.length} revealed · tap one to keep him`
  else if (cards) status = 'Tap a card to flip it, or reveal them all'

  return (
    <div className={`pe-stage${stage.leaving ? ' leaving' : ''}`} role="dialog" aria-modal="true" aria-label={`${def.label} pack`}>
      <div className="pe-stage-head">
        {tag && (
          <div className="pe-stage-tag" style={tag.color ? ({ '--tag': tag.color } as React.CSSProperties) : undefined}>
            <Bolt className="pe-bolt" />
            {tag.text}
          </div>
        )}
        <div className="pe-stage-pos">
          {def.label.split(' ')[0]} <em>{def.label.split(' ').slice(1).join(' ')}</em>
        </div>
        <div className="pe-stage-status" aria-live="polite">
          {status}
        </div>
      </div>

      {!cards && !stage.error && (
        <div className="pe-stage-loading">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PACK_ART[def.pool]} alt="" />
        </div>
      )}

      {cards && (
        <div className="pe-stage-cards">
          {cards.map((card, i) => {
            const isPick = stage.pickedId === card.id
            const isRej = !!stage.pickedId && !isPick
            return (
              <PackCard
                key={card.id}
                player={card}
                index={i}
                revealed={stage.revealed[i]}
                picked={isPick}
                rejected={isRej}
                selectable={!stage.pickedId}
                chem={stage.revealed[i] && chemFor ? chemFor(card) : null}
                onClick={stage.pickedId ? undefined : () => onCard(i)}
              />
            )
          })}
        </div>
      )}

      <div className="pe-stage-foot">
        {cards && !stage.pickedId && hidden > 0 && (
          <button type="button" className="pe-btn pe-btn--ghost" onClick={onRevealAll}>
            Reveal all {hidden}
          </button>
        )}
        {!cards && stage.error && (
          <button type="button" className="pe-btn pe-btn--quiet" onClick={onDismiss}>
            Back to the table
          </button>
        )}
      </div>
    </div>
  )
}

export function ImmortalFlash() {
  return (
    <div className="pe-imm-flash" aria-hidden>
      <div className="pe-imm-text">IMMORTAL PULL</div>
    </div>
  )
}

/** The running total under the masthead. */
export function ScoreStrip({
  score,
  filled,
  tier,
  extra,
}: {
  score: number
  filled: number
  tier: { label: string; color: string }
  extra?: { value: React.ReactNode; label: string }
}) {
  return (
    <div className="pe-strip">
      <div className="pe-strip-cell">
        <div className="pe-strip-val" style={{ color: tier.color }}>
          {score.toLocaleString()}
        </div>
        <div className="pe-strip-lbl">Accolades</div>
      </div>
      <div className="pe-strip-cell">
        <div className="pe-strip-val">
          {filled}
          <small>/{SLOTS.length}</small>
        </div>
        <div className="pe-strip-lbl">Signed</div>
      </div>
      {extra && (
        <div className="pe-strip-cell">
          <div className="pe-strip-val">{extra.value}</div>
          <div className="pe-strip-lbl">{extra.label}</div>
        </div>
      )}
      <div className="pe-strip-cell">
        <div className="pe-strip-tier" style={{ color: tier.color }}>
          {tier.label}
        </div>
        <div className="pe-strip-lbl">Tier</div>
      </div>
      <div className="pe-strip-bar">
        <div className="pe-strip-fill" style={{ width: `${(filled / SLOTS.length) * 100}%` }} />
      </div>
    </div>
  )
}

/** Measures whichever masthead the page wears (the desktop nav or the phone
    bar) so the strip can stick directly underneath it. */
export function useStripOffset() {
  useEffect(() => {
    const head = document.querySelector<HTMLElement>('[data-game-bar], nav.nav')
    const set = () => {
      const h = head ? Math.round(head.getBoundingClientRect().height) : 0
      document.documentElement.style.setProperty('--pe-strip-top', `${h + 8}px`)
    }
    set()
    window.addEventListener('resize', set)
    return () => window.removeEventListener('resize', set)
  }, [])
}
