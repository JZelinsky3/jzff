'use client'

// Canton, the top of the game, one in many thousands of packs. It gets two moments
// nothing else has: the Canton Pull as the pack comes open, which is how you find
// out, and the Hall when you tap the card. Both are full-screen, both run on
// transform and opacity alone, and a tap skips either.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CANTON_CARDS, TEAM_COLORS, teamLogo, type Player } from '@/lib/packEmpire/rules'

const FX = '/games/pack-empire/fx'

/** Everything the two moments draw, fetched as soon as a Canton is dealt, so the
    doors never open on a picture still loading. */
export const CANTON_ART = ['card-rays', 'card-door', 'card-hall-wall', 'card-hall-floor', 'card-hall-ceiling', 'card-hall-portal', 'card-banner', 'card-molten', 'card-corona', 'card-halo', 'card-pave', 'card-glint'].map((f) => `${FX}/${f}.webp`)

/** How long the Canton Pull runs. Immortal's banner is 2.3s. */
const CANTON_PULL_MS = 3450

/** When the screen is fully white, so the pack can become the cards unseen. */
const CANTON_WHITE_MS = 1120

/** How long the Hall runs, in ms. Until then a tap skips ahead, not out. */
const ENSHRINED_MS = 8700

/** Gold falling once the card has landed. Fixed values, so no two pieces match. */
const CONFETTI = Array.from({ length: 22 }, (_, i) => ({
  '--x': `${(i * 37 + 3) % 100}%`,
  '--w': `${((i * 41) % 34) / 10}s`,
  '--d': `${3.6 + ((i * 7) % 5) * 0.5}s`,
  '--s': `${0.7 + ((i * 3) % 4) * 0.22}`,
})) as React.CSSProperties[]

function Gems({ far }: { far: number }) {
  return (
    <span className="cx-gems">
      {Array.from({ length: 28 }, (_, i) => (
        <i key={i} style={{ '--a': `${i * (360 / 28)}deg`, '--far': `${far + ((i * 11) % 26)}vmin` } as React.CSSProperties} />
      ))}
    </span>
  )
}

/**
 * The first reveal: this is where you learn there's a Canton in the pack, so it's an
 * event, not a banner. The tear cuts the room to black with only the pack left,
 * shaking harder, while a beam builds out of its mouth. Then the screen whites out,
 * the light takes the pack, and CANTON slams in a letter at a time with a hit on
 * each. Under the white the cards go down, so when it clears they're all laid out,
 * ready to flip. Hangs off --at, the moment of the flash.
 */
export function CantonPull({ onWhite, onDone }: { onWhite: () => void; onDone: () => void }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const white = window.setTimeout(onWhite, CANTON_WHITE_MS)
    const done = window.setTimeout(onDone, CANTON_PULL_MS)
    return () => {
      window.clearTimeout(white)
      window.clearTimeout(done)
    }
  }, [onWhite, onDone])
  // The light starts at the mouth of the pack, wherever the pack sits.
  useLayoutEffect(() => {
    const pack = document.querySelector('.pe-rip-pack')?.getBoundingClientRect()
    if (!pack || !ref.current) return
    ref.current.style.setProperty('--px', `${pack.left + pack.width / 2}px`)
    ref.current.style.setProperty('--py', `${pack.top + pack.height * 0.1}px`)
  }, [])
  return (
    <>
      <button type="button" className="cp-veil" onClick={onDone} aria-label="Canton pull. Show the cards" />
      <span className="cp" ref={ref} aria-hidden>
        <span className="cp-beam" />
        <span className="cx-rays cp-rays">
          {/* eslint-disable @next/next/no-img-element */}
          <img src={`${FX}/card-rays.webp`} alt="" />
          <img src={`${FX}/card-rays.webp`} alt="" />
          {/* eslint-enable @next/next/no-img-element */}
        </span>
        <span className="cp-sparks">
          {CONFETTI.map((style, i) => (
            <i key={i} style={style} />
          ))}
        </span>
        <span className="cx-ring" />
        <span className="cx-ring cx-ring--2" />
        <span className="cx-ring cx-ring--3" />
        <span className="cx-ring cp-ring-last" />
        <Gems far={40} />
        <span className="cp-lockup">
          <span className="cp-word">
            {'Canton'.split('').map((ch, i) => (
              <b key={i} style={{ '--i': i } as React.CSSProperties}>
                {ch}
              </b>
            ))}
          </span>
          <span className="cp-pull">Pull</span>
        </span>
        <span className="cp-flash" />
      </span>
    </>
  )
}

/**
 * The reveal, nothing shared with any other tier: the doors of the Hall. Black, then
 * bronze doors lit through the gap, three heartbeats, and they swing open on a blaze
 * of light. Your eyes adjust and you're walking down the Hall: the camera turns to
 * his team on the left wall, then the year on the right, like a FIFA walkout, with no
 * card yet. It swings back to the doorway at the far end, and there he is, facing
 * you, the card already face up, resolving out of the light as you walk in. A burst,
 * a thud, and gold falling in the Hall. Everything keys off --at, the moment of the
 * burst, so skipping is one variable.
 */
export function Enshrinement({ player, onClose, children }: { player: Player; onClose: () => void; children: React.ReactNode }) {
  const [skipped, setSkipped] = useState(false)
  const begun = useRef(0)
  useEffect(() => {
    begun.current = performance.now()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const tap = () => {
    if (skipped || performance.now() - begun.current > ENSHRINED_MS) onClose()
    else setSkipped(true)
  }
  const club = player.club ?? player.team
  // The logos are today's. On an old club's banner, the name alone is the honest one.
  const logo = club === player.team ? teamLogo(player) : null
  const [one, two] = TEAM_COLORS[player.team] ?? ['#3a2c10', '#8a6412']
  const colours = { '--c1': one, '--c2': two } as React.CSSProperties
  return (
    <button type="button" className="cx-stage" data-skipped={skipped || undefined} onClick={tap} aria-label="Canton pull. Tap to continue">
      <span className="cx-hall" aria-hidden>
        <span className="cx-world">
          {/* eslint-disable @next/next/no-img-element */}
          <img className="cx-wall cx-wall--l" src={`${FX}/card-hall-wall.webp`} alt="" />
          <img className="cx-wall cx-wall--r" src={`${FX}/card-hall-wall.webp`} alt="" />
          <img className="cx-floor" src={`${FX}/card-hall-floor.webp`} alt="" />
          <img className="cx-ceiling" src={`${FX}/card-hall-ceiling.webp`} alt="" />
          <span className="cx-end" />
          <img className="cx-portal" src={`${FX}/card-hall-portal.webp`} alt="" />
          <span className="cx-glow" />
          <span className="cx-sign cx-sign--team" style={colours}>
            <span className="cx-cloth" />
            <img className="cx-drape" src={`${FX}/card-banner.webp`} alt="" />
            <span className="cx-print">
              {logo && <img className="cx-crest" src={logo} alt="" draggable={false} />}
              <b>{club}</b>
            </span>
          </span>
          <span className="cx-sign cx-sign--year" style={colours}>
            <span className="cx-cloth" />
            <img className="cx-drape" src={`${FX}/card-banner.webp`} alt="" />
            <span className="cx-print">
              <strong>{player.year}</strong>
              <b>Season</b>
            </span>
          </span>
          {/* eslint-enable @next/next/no-img-element */}
        </span>
        <span className="cx-haze" />
      </span>
      <span className="cx-sky" aria-hidden />
      <span className="cx-dusk" aria-hidden />
      <span className="cx-rays" aria-hidden>
        {/* eslint-disable @next/next/no-img-element */}
        <img src={`${FX}/card-rays.webp`} alt="" />
        <img src={`${FX}/card-rays.webp`} alt="" />
        {/* eslint-enable @next/next/no-img-element */}
      </span>
      <span className="cx-gold" aria-hidden>
        {CONFETTI.map((style, i) => (
          <i key={i} style={style} />
        ))}
      </span>
      <span className="cx-door cx-door--l" aria-hidden>
        <i />
      </span>
      <span className="cx-door cx-door--r" aria-hidden>
        <i />
      </span>
      <span className="cx-seam" aria-hidden />
      <span className="cx-ring" aria-hidden />
      <span className="cx-ring cx-ring--2" aria-hidden />
      <span className="cx-ring cx-ring--3" aria-hidden />
      <span className="cx-ring cx-thud" aria-hidden />
      <span aria-hidden>
        <Gems far={34} />
      </span>
      <span className="cx-land">
        <span className="cx-fly">
          {children}
          <span className="cx-resolve" aria-hidden />
        </span>
      </span>
      <span className="cx-title">
        {'Canton'.split('').map((ch, i) => (
          <b key={i} style={{ '--i': i } as React.CSSProperties}>
            {ch}
          </b>
        ))}
      </span>
      <span className="cx-sub">1 of {CANTON_CARDS} in the game</span>
      <span className="cx-flash" aria-hidden />
    </button>
  )
}
