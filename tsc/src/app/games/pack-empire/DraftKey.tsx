'use client'

// The key to the table: how a run works, what the captain does, what each
// rarity means, how to read a card, and the ladder with your total on it.
//
// Wide screens get it as a column beside the field. Anything narrower (a
// phone, the Versus room's narrow table) gets an (i) on the field that opens
// the same thing as a bottom sheet, the way the PAMS power rankings show their
// formula: a handle, a title, tap outside or drag down to close.
//
// The sheet is portalled up to the page's <main>: the field is its own
// stacking context (it isolates its painted lines), and a fixed sheet left
// inside it would sit under the sticky score strip.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RARITIES, RARITY_FLOOR, RARITY_LOOK, type Rarity } from '@/lib/packEmpire/rules'
import { CaptainMark, Ladder } from './cards'

const MEANS: Record<Rarity, string> = {
  immortal: 'One of the best seasons ever at the position',
  transcendent: 'An all-time great season',
  dynasty: 'An elite year',
  rare: 'A starter’s year',
  common: 'The rest',
}

function floor(r: Rarity): string {
  return r === 'common' ? `Under ${RARITY_FLOOR.rare.toLocaleString()}` : `${RARITY_FLOOR[r].toLocaleString()}+`
}

function KeyBody({ score }: { score: number }) {
  return (
    <>
      <section className="pe-key-sec">
        <h3 className="pe-key-h">How It Works</h3>
        <ol className="pe-key-steps">
          <li>Pick a captain. That pack deals off the captain table.</li>
          <li>Open all eleven packs, in any order.</li>
          <li>Keep one card from each. Their values add up.</li>
          <li>Your total sets your rung on the ladder.</li>
        </ol>
      </section>

      <section className="pe-key-sec">
        <h3 className="pe-key-h">The Captain</h3>
        <p className="pe-key-cap">
          <CaptainMark inline />
          <span>Its pack draws far more dynasty-and-up cards, and five times the immortals.</span>
        </p>
      </section>

      <section className="pe-key-sec">
        <h3 className="pe-key-h">Rarities</h3>
        <ul className="pe-key-rar">
          {[...RARITIES].reverse().map((r) => (
            <li key={r} style={{ '--rc': RARITY_LOOK[r].color } as React.CSSProperties}>
              <span className="pe-key-dot" />
              <span className="pe-key-rname">{RARITY_LOOK[r].label}</span>
              <span className="pe-key-rfloor">{floor(r)}</span>
              <span className="pe-key-rmeans">{MEANS[r]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="pe-key-sec">
        <h3 className="pe-key-h">Reading A Card</h3>
        <p className="pe-key-p">
          Every card is one player&apos;s season. The big number is what it adds to your total; under it are
          his stat line and his fantasy points that year.
        </p>
      </section>

      <section className="pe-key-sec">
        <h3 className="pe-key-h">The Ladder</h3>
        <Ladder score={score} />
      </section>
    </>
  )
}

/** The column beside the field, on screens wide enough for one. */
export function KeyAside({ score }: { score: number }) {
  return (
    <aside className="pe-key" aria-label="How it works">
      <div className="pe-kicker">★ The key ★</div>
      <KeyBody score={score} />
    </aside>
  )
}

/** The (i) on the field, and the sheet it opens. */
export function KeyButton({ score }: { score: number }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="pe-key-btn" onClick={() => setOpen(true)} aria-label="How it works">
        i
      </button>
      {open &&
        createPortal(
          <KeySheet score={score} onClose={() => setOpen(false)} />,
          document.querySelector('main.pe-theme') ?? document.body
        )}
    </>
  )
}

function KeySheet({ score, onClose }: { score: number; onClose: () => void }) {
  const [shown, setShown] = useState(false)
  const [drag, setDrag] = useState(0)
  const start = useRef<number | null>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true))
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', key)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function close() {
    setShown(false)
    window.setTimeout(onClose, 220)
  }

  // Drag the handle down to dismiss; let go short of the line and it springs back.
  const onDown = (e: React.PointerEvent) => {
    start.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (start.current == null) return
    setDrag(Math.max(0, e.clientY - start.current))
  }
  const onUp = () => {
    if (start.current == null) return
    start.current = null
    if (drag > 90) close()
    setDrag(0)
  }

  return (
    <div className={`pe-ksheet-bg${shown ? ' on' : ''}`} onClick={close}>
      <div
        className={`pe-ksheet${shown ? ' on' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="How it works"
        onClick={(e) => e.stopPropagation()}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
      >
        <div className="pe-ksheet-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className="pe-ksheet-handle" aria-hidden />
          <div className="pe-ksheet-title">How It Works</div>
          <button type="button" className="pe-ksheet-x" onClick={close} aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="pe-ksheet-body">
          <KeyBody score={score} />
        </div>
      </div>
    </div>
  )
}
