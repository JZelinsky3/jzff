'use client'

// The key to the table: how a run works, what the captain does, what each
// rarity means, how to read a card, and the ladder with your total on it.
//
// Wide screens get it as a column beside the field, the same height as the
// field. It never takes width from the field: below the width where both fit
// at full size it becomes a "How it works" button above the field (off the
// turf, away from the packs) that opens the same thing as a bottom sheet, the
// way the PAMS power rankings show their formula: a handle, a title, tap
// outside or drag down to close.
//
// The sheet is portalled up to the page's <main>: the field is its own
// stacking context (it isolates its painted lines), and a fixed sheet left
// inside it would sit under the sticky score strip.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CAP_LINES,
  CHEM_LINES,
  DAILY_PACK_SECONDS,
  RARITIES,
  RARITY_FLOOR,
  RARITY_LOOK,
  SALARY_CAP,
  isBlind,
  type Difficulty,
  type Rarity,
} from '@/lib/packEmpire/rules'
import { BATTLE_BONUS, battlesFrom } from '@/lib/packEmpire/battles'
import { CaptainMark, Ladder, RarityGem } from './cards'

/** Which table the key is sitting beside: it describes the game in front of
    you, and on a blind draft it can't print a score it doesn't have. */
export type KeyFlavor = { difficulty: Difficulty; even: boolean; daily?: boolean; salaryCap?: boolean; battles?: string[] | null }

const OPEN: KeyFlavor = { difficulty: 'open', even: false }

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

function KeyBody({ score, flavor }: { score: number; flavor: KeyFlavor }) {
  const blind = isBlind(flavor.difficulty)
  const capped = flavor.difficulty === 'cap' || !!flavor.salaryCap
  const chem = blind || flavor.even || capped
  return (
    <>
      <section className="pe-key-sec">
        <h3 className="pe-key-h">How It Works</h3>
        {flavor.daily ? (
          <ol className="pe-key-steps">
            <li>Everyone gets these packs, in this order, once a day.</li>
            <li>Each pack mixes five positions. Keep one you have a slot for.</li>
            <li>You get {DAILY_PACK_SECONDS} seconds a pack. Run out and the first card that fits signs.</li>
            <li>If nothing fits, one card is swapped for a reserve.</li>
            <li>The rule of the day changes what counts.</li>
          </ol>
        ) : flavor.even ? (
          <ol className="pe-key-steps">
            <li>You and your opponent open the same eleven packs.</li>
            <li>There is no captain.</li>
            <li>Keep one card from each. Values plus chemistry is your total.</li>
            {flavor.battles?.length ? <li>Three Battles pay out once you&apos;re both in.</li> : null}
          </ol>
        ) : (
          <ol className="pe-key-steps">
            <li>Pick a captain. That pack deals off the captain table.</li>
            <li>Open all eleven packs, in any order.</li>
            <li>Keep one card from each. Their values add up.</li>
            <li>Your total sets your rung on the ladder.</li>
          </ol>
        )}
      </section>

      {!!flavor.battles?.length && (
        <section className="pe-key-sec">
          <h3 className="pe-key-h">The Battles</h3>
          <p className="pe-key-p">
            Beat your opponent on one and it&apos;s worth {BATTLE_BONUS.toLocaleString()}. You don&apos;t need the best
            number, just a better one than theirs. A tie pays nobody.
          </p>
          <ul className="pe-key-steps pe-key-steps--plain">
            {battlesFrom(flavor.battles).map((b) => (
              <li key={b.id}>
                <span>
                  <b>{b.title}.</b> {b.line}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {flavor.difficulty === 'range' && (
        <section className="pe-key-sec">
          <h3 className="pe-key-h">Reading A Range</h3>
          <p className="pe-key-p">
            The real value is somewhere inside the range, and rarely in the middle.{' '}
            {flavor.daily ? 'Some ranges are tight and some barely tell you anything. ' : ''}Rarity and stats stay hidden until
            your lineup is locked.
          </p>
        </section>
      )}
      {flavor.difficulty === 'season' && (
        <section className="pe-key-sec">
          <h3 className="pe-key-h">Ball Knower</h3>
          <p className="pe-key-p">
            A name and a season. You have to know what he did that year and who he played for. Everything turns over when
            your lineup is locked.
          </p>
        </section>
      )}

      {capped && (
        <section className="pe-key-sec">
          <h3 className="pe-key-h">The Salary Cap</h3>
          <ul className="pe-key-steps pe-key-steps--plain">
            <li>You get ${flavor.even || flavor.daily ? SALARY_CAP.shared : SALARY_CAP.own}M for all eleven.</li>
            {CAP_LINES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {chem && (
        <section className="pe-key-sec">
          <h3 className="pe-key-h">Chemistry</h3>
          <ul className="pe-key-steps pe-key-steps--plain">
            {CHEM_LINES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {!flavor.even && !flavor.daily && (
        <section className="pe-key-sec">
          <h3 className="pe-key-h">The Captain</h3>
          <p className="pe-key-cap">
            <CaptainMark inline />
            <span>Its pack draws far more dynasty-and-up cards, and five times the immortals.</span>
          </p>
        </section>
      )}

      <section className="pe-key-sec">
        <h3 className="pe-key-h">Rarities</h3>
        <ul className="pe-key-rar">
          {[...RARITIES].reverse().map((r) => (
            <li key={r} style={{ '--rc': RARITY_LOOK[r].color } as React.CSSProperties}>
              <RarityGem rarity={r} className="pe-key-gem" />
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

      {!flavor.daily && !flavor.even && (
        <section className="pe-key-sec">
          <h3 className="pe-key-h">The Ladder</h3>
          <Ladder score={blind ? -1 : score} />
        </section>
      )}
    </>
  )
}

/** The column beside the field, on screens wide enough for one. */
export function KeyAside({ score, flavor = OPEN }: { score: number; flavor?: KeyFlavor }) {
  return (
    <div className="pe-key-col">
      <aside className="pe-key" aria-label="How it works">
        <div className="pe-key-title">The Key</div>
        <KeyBody score={score} flavor={flavor} />
      </aside>
    </div>
  )
}

/** The button above the field, and the sheet it opens. */
export function KeyButton({ score, flavor = OPEN }: { score: number; flavor?: KeyFlavor }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="pe-key-btn" onClick={() => setOpen(true)}>
        <span className="pe-key-btn-i" aria-hidden>
          i
        </span>
        How it works
      </button>
      {open &&
        createPortal(
          <KeySheet score={score} flavor={flavor} onClose={() => setOpen(false)} />,
          document.querySelector('main.pe-theme') ?? document.body
        )}
    </>
  )
}

function KeySheet({ score, flavor, onClose }: { score: number; flavor: KeyFlavor; onClose: () => void }) {
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
        aria-label="The key"
        onClick={(e) => e.stopPropagation()}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
      >
        <div className="pe-ksheet-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className="pe-ksheet-handle" aria-hidden />
          <div className="pe-ksheet-title">The Key</div>
          <button type="button" className="pe-ksheet-x" onClick={close} aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="pe-ksheet-body">
          <KeyBody score={score} flavor={flavor} />
        </div>
      </div>
    </div>
  )
}
