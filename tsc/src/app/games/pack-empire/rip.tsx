'use client'

// The sealed pack, and tearing it.
//
// Drag across the top and the strip peels away under your finger; let go past
// halfway (or just tap) and it tears off. The light that leaks out of the
// opening is the colour of the best card inside, which the pack already knows
// because the deal is fetched while it sits sealed. If the deal is still in
// flight when the strip comes off, the open pack shakes until it lands.

import { useEffect, useRef, useState } from 'react'

/** How long the strip takes to come off before the stage is told. */
const RIP_MS = 460

/** Past this much of a drag, letting go finishes the tear. */
const COMMIT_AT = 0.5

export function SealedPack({
  art,
  glow,
  ready,
  onTorn,
}: {
  art: string
  /** The light inside: the best rarity's colour once the cards are in. */
  glow: string
  /** The deal has come back. */
  ready: boolean
  onTorn: () => void
}) {
  const [phase, setPhase] = useState<'sealed' | 'ripping' | 'open'>('sealed')
  const [pull, setPull] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; w: number; id: number } | null>(null)
  const moved = useRef(false)

  useEffect(() => {
    if (phase !== 'ripping') return
    const t = window.setTimeout(() => {
      setPhase('open')
      onTorn()
    }, RIP_MS)
    return () => window.clearTimeout(t)
  }, [phase, onTorn])

  const rip = () => {
    if (phase !== 'sealed') return
    setDragging(false)
    setPull(1)
    setPhase('ripping')
  }

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
    <div className={cls} style={{ '--pull': pull, '--glow': glow } as React.CSSProperties}>
      <button
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
        <span className="pe-rip-light" aria-hidden />
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

/** The empty wrapper falling away as the cards come out of it. */
export function SpentPack({ art }: { art: string }) {
  return (
    <div className="pe-rip-spent" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art} alt="" draggable={false} />
    </div>
  )
}
