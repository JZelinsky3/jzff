'use client'

// The sealed pack, and tearing it.
//
// Drag across the top and the strip peels away under your finger; let go past
// halfway (or just tap) and it tears off. On a Mac trackpad a two-finger
// swipe across the pack does the same: that gesture arrives as scroll
// events, not a drag, so the wheel peels the strip too and tears it once it
// passes halfway.
//
// The light comes up out of the torn top edge of the pack, the colour of the
// best card inside, and bigger and brighter the better that card is. The pack
// already knows, because the deal is fetched while it sits sealed. If the deal
// is still in flight when the strip comes off, the open pack shakes until it
// lands. Then RipBurst goes off from the same edge as the cards come out.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { RARITY_LOOK, RARITIES } from '@/lib/packEmpire/rules'

/** How long the strip takes to come off. */
const RIP_MS = 460

/** Then the open pack holds, by tier, so the light gets its moment. */
const HOLD_MS = [40, 90, 220, 340, 340]

/** Past this much of a drag, letting go finishes the tear. */
const COMMIT_AT = 0.5

/** Sparks off the tear, by tier (common up to immortal). */
const SPARKS = [6, 10, 16, 22, 30]

export function SealedPack({
  art,
  glow,
  tier,
  ready,
  onTorn,
}: {
  art: string
  /** The light inside: the best rarity's colour once the cards are in. */
  glow: string
  /** That rarity's index, common up: sets the size of the light. */
  tier: number
  /** The deal has come back. */
  ready: boolean
  onTorn: () => void
}) {
  const [phase, setPhase] = useState<'sealed' | 'ripping' | 'open'>('sealed')
  const [pull, setPull] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; w: number; id: number } | null>(null)
  const moved = useRef(false)
  const packRef = useRef<HTMLButtonElement>(null)
  const wheel = useRef({ acc: 0, timer: 0 })

  useEffect(() => {
    if (phase !== 'ripping') return
    const t = window.setTimeout(() => {
      setPhase('open')
      onTorn()
    }, RIP_MS + (HOLD_MS[tier] ?? 0))
    return () => window.clearTimeout(t)
  }, [phase, onTorn, tier])

  const rip = () => {
    if (phase !== 'sealed') return
    setDragging(false)
    setPull(1)
    setPhase('ripping')
  }

  // The trackpad. A native listener, because React's wheel handler is
  // passive and can't stop a sideways swipe from going Back a page.
  useEffect(() => {
    const el = packRef.current
    if (!el || phase !== 'sealed') return
    const w = wheel.current
    const on = (e: WheelEvent) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (!d) return
      e.preventDefault()
      const width = el.getBoundingClientRect().width || 172
      w.acc = Math.min(1, w.acc + Math.abs(d) / (width * 1.6))
      setDragging(true)
      setPull(w.acc)
      window.clearTimeout(w.timer)
      if (w.acc >= COMMIT_AT) {
        // The same as rip(): this listener only exists while it's sealed.
        w.acc = 0
        setDragging(false)
        setPull(1)
        setPhase('ripping')
        return
      }
      // Stopped short: spring back, like a drag let go too early.
      w.timer = window.setTimeout(() => {
        w.acc = 0
        setDragging(false)
        setPull(0)
      }, 220)
    }
    el.addEventListener('wheel', on, { passive: false })
    return () => {
      el.removeEventListener('wheel', on)
      window.clearTimeout(w.timer)
    }
  }, [phase])

  const down = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (phase !== 'sealed') return
    const r = e.currentTarget.getBoundingClientRect()
    start.current = { x: e.clientX, w: r.width, id: e.pointerId }
    moved.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = start.current
    if (!s || s.id !== e.pointerId || phase !== 'sealed') return
    const dx = Math.abs(e.clientX - s.x)
    if (dx > 6) {
      moved.current = true
      setDragging(true)
    }
    setPull(Math.min(1, dx / (s.w * 0.8)))
  }

  const up = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    start.current = null
    setDragging(false)
    // A tap tears it too. A drag that stopped short springs back.
    if (!moved.current || pull >= COMMIT_AT) rip()
    else setPull(0)
  }

  const cls = ['pe-rip', phase, dragging ? 'dragging' : '', phase === 'open' && !ready ? 'waiting' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} data-tier={tier} style={{ '--pull': pull, '--glow': glow } as React.CSSProperties}>
      <button
        ref={packRef}
        type="button"
        className="pe-rip-pack"
        aria-label="Rip the pack open"
        disabled={phase !== 'sealed'}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          start.current = null
          setDragging(false)
          setPull(0)
        }}
        onClick={(e) => {
          // Pointer taps are handled on pointerup; this is the keyboard.
          if (e.detail === 0) rip()
        }}
      >
        <span className="pe-mouth" aria-hidden>
          <i className="pe-mouth-halo" />
        </span>
        <span className="pe-rip-body" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art} alt="" draggable={false} />
        </span>
        <span className="pe-rip-strip" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art} alt="" draggable={false} />
        </span>
        <span className="pe-rip-seam" aria-hidden />
      </button>
    </div>
  )
}

/**
 * The pack going off, from its torn edge, as the cards come out. Every tier
 * gets the bloom and sparks thrown up out of the opening, in its colour; rare
 * and up add a flash over the whole table; dynasty and up a shake. Plays once
 * and leaves nothing behind (every layer ends transparent), so it can stay
 * mounted under the cards.
 */
export function RipBurst({ rarity }: { rarity: (typeof RARITIES)[number] }) {
  const tier = RARITIES.indexOf(rarity)
  const look = RARITY_LOOK[rarity]
  const ref = useRef<HTMLDivElement>(null)

  // The flash is fixed to the screen, so it needs to know where "here" is.
  useLayoutEffect(() => {
    const el = ref.current
    const r = el?.getBoundingClientRect()
    if (!el || !r) return
    el.style.setProperty('--bx', `${r.left + r.width / 2}px`)
    el.style.setProperty('--by', `${r.top + r.height / 2}px`)
  }, [])

  return (
    <div
      ref={ref}
      className="pe-boom"
      data-tier={tier}
      aria-hidden
      style={{ '--glow': look.color, '--glow-soft': look.glow } as React.CSSProperties}
    >
      {tier >= 1 && <span className="pe-boom-flash" />}
      <span className="pe-boom-bloom" />
      <span className="pe-boom-core" />
      {Array.from({ length: SPARKS[tier] ?? 6 }, (_, i) => (
        <span
          key={i}
          className="pe-boom-spark"
          style={
            {
              // A fan up out of the opening: the golden ratio so they never
              // clump, a little longer reach on every third.
              '--a': `${((i * 0.618) % 1) * 130 - 65}deg`,
              '--d': `${130 + tier * 55 + (i % 3) * 40}px`,
              '--s': `${(i % 5) * 24}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

/** The empty wrapper falling away as the cards come out of it, its torn edge
    still lit. */
export function SpentPack({ art, tier, glow }: { art: string; tier: number; glow: string }) {
  return (
    <div className="pe-rip-spent" data-tier={tier} aria-hidden style={{ '--glow': glow } as React.CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art} alt="" draggable={false} />
    </div>
  )
}
