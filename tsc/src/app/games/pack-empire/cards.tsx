'use client'

// The cards, the packs and the field.
//
// Markup is the original's, class for class, so the original card CSS and
// every rarity effect fire exactly as they did. The only changes are the ones
// the site makes everywhere: no emoji (the card back's football and the
// captain's lightning bolt are drawn), and real buttons where something is
// tappable.

import { useState } from 'react'
import {
  FORMATION,
  PACK_ART,
  RARITY_LOOK,
  SLOTS,
  TIERS,
  seasonLabel,
  surname,
  tierFor,
  type Player,
  type Rarity,
} from '@/lib/packEmpire/rules'

// ============================================================
// Glyphs
// ============================================================

/**
 * The captain's patch: a gold-rimmed shield with a C, pinned to the corner of
 * the captain's pack and then his card. The shadow sits on the outer span
 * because a filter on the clipped element would be clipped with it.
 */
export function CaptainMark({ ghost = false, inline = false }: { ghost?: boolean; inline?: boolean }) {
  return (
    <span
      className={`pe-capmark${ghost ? ' ghost' : ''}${inline ? ' inline' : ''}`}
      role={ghost ? undefined : 'img'}
      aria-label={ghost ? undefined : 'Captain'}
      aria-hidden={ghost || undefined}
    >
      <span className="pe-capmark-shield">
        {/* Drawn, not typed: a serif C sits wherever its font's spacing puts
            it, which at 18px was visibly low. This is centred on the shield's
            visual middle (a little above halfway, the point being at the
            bottom) at every size. */}
        <svg className="pe-capmark-c" viewBox="0 0 24 27.36" aria-hidden>
          <path d="M15.68 8.32A5.2 5.2 0 1 0 15.68 15.68" />
        </svg>
      </span>
    </span>
  )
}

/** Drawn in where there's no photo: head, neck and pads, in the card's
    rarity, so a man without a headshot still reads as a player. */
function Portrait({ className }: { className: string }) {
  return (
    <svg className={`${className} pe-portrait`} viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet" aria-hidden>
      <path d="M50 12c-10.5 0-18 8-18 19.5 0 12.2 7.6 23.5 18 23.5s18-11.3 18-23.5C68 20 60.5 12 50 12z" />
      <path d="M43 52h14v12H43z" />
      <path d="M6 100c1.5-15 9-26 22-31l9-3.5c3.5 4 8 6 13 6s9.5-2 13-6l9 3.5c13 5 20.5 16 22 31z" />
    </svg>
  )
}

export function Bolt({ className = 'pe-bolt' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13.6 2 4.8 13.4h5.9L9.5 22l8.8-11.6h-6z" />
    </svg>
  )
}

export function LockGlyph({ className = 'pe-bolt' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
      <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
    </svg>
  )
}

export function Check({ className = 'pe-rung-mark' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  )
}

function Football() {
  return (
    <svg
      className="pe-back-icon"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M9.5 38.5c-4-12 2-27 18-30.5 6-1.3 10.2-.6 11 .5.8 1.1 1.4 5.3.1 11.3-3.5 16-18.5 22-30.5 18-.2-.1-.3-.2-.4-.4-.1-.1-.2-.3-.2-.4z" />
      <path d="M17 31 31 17" />
      <path d="M21.2 24.6l2.2 2.2M24.4 21.4l2.2 2.2M27.6 18.2l2.2 2.2" />
    </svg>
  )
}

// ============================================================
// Rarity effects
// ============================================================

/**
 * `outer` sits behind the card (the spinning borders and the immortal's
 * halo); `inner` sits inside the art. Structure unchanged from the original,
 * down to the number of children: the CSS addresses them with nth-child.
 */
export function RarityEffects({ rarity, position = 'inner' }: { rarity: Rarity; position?: 'outer' | 'inner' }) {
  if (position === 'outer') {
    return (
      <>
        {rarity === 'rare' && (
          <div className="pe-ra-spin-wrap">
            <div className="pe-ra-spin-arc" />
            <div className="pe-ra-spin-inner" />
          </div>
        )}
        {rarity === 'dynasty' && (
          <div className="pe-ep-dual-wrap">
            <div className="pe-ep-dual-arc1" />
            <div className="pe-ep-dual-arc2" />
            <div className="pe-ep-dual-inner" />
          </div>
        )}
        {rarity === 'transcendent' && (
          <div className="pe-le-plasma-wrap">
            <div className="pe-le-plasma-arc1" />
            <div className="pe-le-plasma-arc2" />
            <div className="pe-le-plasma-inner" />
          </div>
        )}
        {rarity === 'immortal' && (
          <>
            <div className="pe-imm-glow-1" />
            <div className="pe-imm-glow-2" />
            <div className="pe-imm-glow-3" />
            <div className="pe-imm-glow-4" />
            <div className="pe-imm-corner-arcs">
              <svg viewBox="0 0 125 183" xmlns="http://www.w3.org/2000/svg">
                <path className="pe-imm-arc-glow a1" d="M -6,34 Q -6,-6 34,-6" />
                <path className="pe-imm-arc-line a1" d="M -6,34 Q -6,-6 34,-6" />
                <path className="pe-imm-arc-glow a2" d="M 91,-6 Q 131,-6 131,34" />
                <path className="pe-imm-arc-line a2" d="M 91,-6 Q 131,-6 131,34" />
                <path className="pe-imm-arc-glow a3" d="M 131,149 Q 131,189 91,189" />
                <path className="pe-imm-arc-line a3" d="M 131,149 Q 131,189 91,189" />
                <path className="pe-imm-arc-glow a4" d="M 34,189 Q -6,189 -6,149" />
                <path className="pe-imm-arc-line a4" d="M 34,189 Q -6,189 -6,149" />
              </svg>
            </div>
            <div className="pe-imm-plasma-wrap">
              <div className="pe-imm-plasma-arc1" />
              <div className="pe-imm-plasma-arc2" />
              <div className="pe-imm-plasma-arc3" />
              <div className="pe-imm-plasma-inner" />
            </div>
          </>
        )}
      </>
    )
  }

  return (
    <>
      {rarity === 'common' && (
        <>
          <div className="pe-cm-scan" />
          <div className="pe-cm-corner tl" />
          <div className="pe-cm-corner tr" />
          <div className="pe-cm-corner bl" />
          <div className="pe-cm-corner br" />
          <div className="pe-cm-heat">
            <div className="pe-cm-heat-wave" />
            <div className="pe-cm-heat-wave" />
            <div className="pe-cm-heat-wave" />
            <div className="pe-cm-heat-wave" />
          </div>
          <div className="pe-cm-geo">
            <div className="pe-cm-geo-line" />
            <div className="pe-cm-geo-line" />
            <div className="pe-cm-geo-line" />
            <div className="pe-cm-geo-line" />
          </div>
          <div className="pe-cm-scratch-layer">
            <div className="pe-cm-scratch" />
            <div className="pe-cm-scratch" />
            <div className="pe-cm-scratch" />
          </div>
          <div className="pe-cm-ember-layer">
            <div className="pe-cm-ember" />
            <div className="pe-cm-ember" />
            <div className="pe-cm-ember" />
            <div className="pe-cm-ember" />
            <div className="pe-cm-ember" />
          </div>
          <div className="pe-cm-bottom-glow" />
        </>
      )}
      {rarity === 'rare' && (
        <>
          <div className="pe-ra-depth-vig" />
          <div className="pe-ra-center-glow" />
          <div className="pe-ra-pulse-layer">
            <div className="pe-ra-pulse-ring" />
            <div className="pe-ra-pulse-ring" />
            <div className="pe-ra-pulse-ring" />
          </div>
          <div className="pe-ra-crackle-layer">
            <div className="pe-ra-crackle">
              <svg width="100%" height="100%" viewBox="0 0 125 183">
                <polyline className="pe-ra-crackle-path" points="0,18 12,20 8,28 22,24 16,34" />
                <polyline className="pe-ra-crackle-path" points="113,88 121,84 117,94 125,90" />
              </svg>
            </div>
            <div className="pe-ra-crackle">
              <svg width="100%" height="100%" viewBox="0 0 125 183">
                <polyline className="pe-ra-crackle-path" points="0,62 12,58 8,68 20,64 14,76" />
                <polyline className="pe-ra-crackle-path" points="109,14 119,18 115,28 123,22" />
              </svg>
            </div>
            <div className="pe-ra-crackle">
              <svg width="100%" height="100%" viewBox="0 0 125 183">
                <polyline className="pe-ra-crackle-path" points="2,108 14,104 10,114 24,108" />
                <polyline className="pe-ra-crackle-path" points="105,50 115,46 111,58 121,52 117,64" />
              </svg>
            </div>
          </div>
        </>
      )}
      {rarity === 'dynasty' && (
        <>
          <div className="pe-ep-burst">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
              <g transform="translate(100,100)">
                <line x1="0" y1="-95" x2="0" y2="95" stroke="rgba(255,215,0,.35)" strokeWidth=".8" />
                <line x1="-95" y1="0" x2="95" y2="0" stroke="rgba(255,215,0,.35)" strokeWidth=".8" />
                <line x1="-67" y1="-67" x2="67" y2="67" stroke="rgba(255,215,0,.25)" strokeWidth=".8" />
                <line x1="67" y1="-67" x2="-67" y2="67" stroke="rgba(255,215,0,.25)" strokeWidth=".8" />
                <line x1="-36" y1="-90" x2="36" y2="90" stroke="rgba(255,215,0,.18)" strokeWidth=".6" />
                <line x1="36" y1="-90" x2="-36" y2="90" stroke="rgba(255,215,0,.18)" strokeWidth=".6" />
                <line x1="-90" y1="-36" x2="90" y2="36" stroke="rgba(255,215,0,.18)" strokeWidth=".6" />
                <line x1="90" y1="-36" x2="-90" y2="36" stroke="rgba(255,215,0,.18)" strokeWidth=".6" />
              </g>
            </svg>
          </div>
          <div className="pe-ep-sparkle-layer">
            <div className="pe-ep-sparkle" />
            <div className="pe-ep-sparkle" />
            <div className="pe-ep-sparkle" />
            <div className="pe-ep-sparkle" />
            <div className="pe-ep-sparkle" />
            <div className="pe-ep-sparkle" />
            <div className="pe-ep-sparkle" />
          </div>
          <div className="pe-ep-foil" />
          <div className="pe-ep-shine" />
        </>
      )}
      {rarity === 'transcendent' && (
        <>
          <div className="pe-le-aurora">
            <div className="pe-le-aurora-band" />
            <div className="pe-le-aurora-band" />
            <div className="pe-le-aurora-band" />
            <div className="pe-le-aurora-band" />
          </div>
          <div className="pe-le-orb-layer">
            <div className="pe-le-orb" />
            <div className="pe-le-orb" />
            <div className="pe-le-orb" />
            <div className="pe-le-orb" />
            <div className="pe-le-orb" />
          </div>
          <div className="pe-le-holo" />
          <div className="pe-le-depth-rings">
            <div className="pe-le-depth-ring" />
            <div className="pe-le-depth-ring" />
            <div className="pe-le-depth-ring" />
          </div>
          <div className="pe-le-bolt-layer">
            <svg className="pe-le-bolt b1" viewBox="0 0 125 183">
              <polyline className="pe-le-bolt-glow" points="8,2 20,28 10,27 26,58 14,56 32,98" />
              <polyline className="pe-le-bolt-mid" points="8,2 20,28 10,27 26,58 14,56 32,98" />
              <polyline className="pe-le-bolt-core" points="8,2 20,28 10,27 26,58 14,56 32,98" />
              <polyline className="pe-le-bolt-branch" points="26,58 40,68 34,82" />
            </svg>
            <svg className="pe-le-bolt b2" viewBox="0 0 125 183">
              <polyline className="pe-le-bolt-glow" points="36,0 50,30 38,28 56,62 42,60 62,110" />
              <polyline className="pe-le-bolt-mid" points="36,0 50,30 38,28 56,62 42,60 62,110" />
              <polyline className="pe-le-bolt-core" points="36,0 50,30 38,28 56,62 42,60 62,110" />
              <polyline className="pe-le-bolt-branch" points="56,62 70,74 62,90" />
            </svg>
            <svg className="pe-le-bolt b3" viewBox="0 0 125 183">
              <polyline className="pe-le-bolt-glow" points="62,0 76,28 63,26 84,60 68,58 92,108 74,106 88,150" />
              <polyline className="pe-le-bolt-mid" points="62,0 76,28 63,26 84,60 68,58 92,108 74,106 88,150" />
              <polyline className="pe-le-bolt-core" points="62,0 76,28 63,26 84,60 68,58 92,108 74,106 88,150" />
              <polyline className="pe-le-bolt-branch" points="84,60 100,74 90,90" />
            </svg>
            <svg className="pe-le-bolt b4" viewBox="0 0 125 183">
              <polyline className="pe-le-bolt-glow" points="88,2 100,30 88,28 106,62 92,60 112,104" />
              <polyline className="pe-le-bolt-mid" points="88,2 100,30 88,28 106,62 92,60 112,104" />
              <polyline className="pe-le-bolt-core" points="88,2 100,30 88,28 106,62 92,60 112,104" />
              <polyline className="pe-le-bolt-branch" points="106,62 118,76 110,92" />
            </svg>
            <svg className="pe-le-bolt b5" viewBox="0 0 125 183">
              <polyline className="pe-le-bolt-glow" points="116,10 108,36 118,34 104,68 116,66 96,118" />
              <polyline className="pe-le-bolt-mid" points="116,10 108,36 118,34 104,68 116,66 96,118" />
              <polyline className="pe-le-bolt-core" points="116,10 108,36 118,34 104,68 116,66 96,118" />
            </svg>
            <svg className="pe-le-bolt b6" viewBox="0 0 125 183">
              <polyline className="pe-le-bolt-glow" points="22,15 10,44 22,42 6,78 20,76 2,130" />
              <polyline className="pe-le-bolt-mid" points="22,15 10,44 22,42 6,78 20,76 2,130" />
              <polyline className="pe-le-bolt-core" points="22,15 10,44 22,42 6,78 20,76 2,130" />
            </svg>
          </div>
          <div className="pe-le-tear-layer">
            <div className="pe-le-tear">
              <div className="pe-le-tear-inner" />
            </div>
            <div className="pe-le-tear">
              <div className="pe-le-tear-inner" />
            </div>
            <div className="pe-le-tear">
              <div className="pe-le-tear-inner" />
            </div>
          </div>
          <div className="pe-le-whiteout w1" />
          <div className="pe-le-whiteout w2" />
          <div className="pe-le-whiteout w3" />
        </>
      )}
      {rarity === 'immortal' && (
        <>
          <div className="pe-imm-slab-layer">
            <div className="pe-imm-slab" />
            <div className="pe-imm-slab" />
            <div className="pe-imm-slab" />
            <div className="pe-imm-slab" />
            <div className="pe-imm-slab" />
          </div>
          <div className="pe-imm-aurora">
            <div className="pe-imm-aurora-band" />
            <div className="pe-imm-aurora-band" />
            <div className="pe-imm-aurora-band" />
            <div className="pe-imm-aurora-band" />
          </div>
          <div className="pe-imm-rings">
            <div className="pe-imm-ring" />
            <div className="pe-imm-ring" />
            <div className="pe-imm-ring" />
          </div>
          <div className="pe-imm-orb-layer">
            <div className="pe-imm-orb" />
            <div className="pe-imm-orb" />
            <div className="pe-imm-orb" />
            <div className="pe-imm-orb" />
            <div className="pe-imm-orb" />
            <div className="pe-imm-orb" />
          </div>
          <div className="pe-imm-holo" />
          <div className="pe-imm-foil" />
          <div className="pe-imm-shock">
            <div className="pe-imm-shock-ring" />
            <div className="pe-imm-shock-ring" />
            <div className="pe-imm-shock-ring" />
            <div className="pe-imm-shock-ring" />
            <div className="pe-imm-shock-core" />
          </div>
          <div className="pe-imm-spark-layer">
            <div className="pe-imm-spark" />
            <div className="pe-imm-spark" />
            <div className="pe-imm-spark" />
            <div className="pe-imm-spark" />
            <div className="pe-imm-spark" />
            <div className="pe-imm-spark" />
            <div className="pe-imm-spark" />
            <div className="pe-imm-spark" />
          </div>
          <div className="pe-imm-tear-layer">
            <div className="pe-imm-tear">
              <div className="pe-imm-tear-inner" />
            </div>
            <div className="pe-imm-tear">
              <div className="pe-imm-tear-inner" />
            </div>
            <div className="pe-imm-tear">
              <div className="pe-imm-tear-inner" />
            </div>
          </div>
          <div className="pe-imm-shine" />
          <div className="pe-imm-shock-flash" />
          <div className="pe-imm-inner-border" />
        </>
      )}
    </>
  )
}

// ============================================================
// A card from a pack
// ============================================================

function Headshot({ player, className, eager = false }: { player: Player; className: string; eager?: boolean }) {
  // A photo that won't load gets the drawn portrait, same as no photo at all.
  const [broken, setBroken] = useState<string | null>(null)
  if (!player.img || broken === player.img) return <Portrait className={className} />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={player.img}
      alt=""
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setBroken(player.img)}
    />
  )
}

/** The season, big and hollow behind the man: what makes a card a year. */
function YearMark({ player, className, short = false }: { player: Player; className: string; short?: boolean }) {
  if (!player.year) return null
  return (
    <div className={className} aria-hidden>
      {short ? `'${String(player.year).slice(2)}` : player.year}
    </div>
  )
}

// ── The stat box ───────────────────────────────────────────────
// Accolades are stored as sentences ("4,643 yds · 45 TD · 6 INT"), the shape
// every lineup banked before now carries too, so the card splits them here
// rather than the pool growing a second copy: a number and its label is a
// cell, and a line with no numbers in it (a lineman's honors) is a row of
// chips. Cells share the row, so a long line wraps into its cells instead of
// running off the edge of the card.

type StatCell = { v: string; l: string } | { t: string }

const STAT_LABEL: Record<string, string> = { 'a game': 'PPG', 'in scoring': 'Scoring', 'rush yds': 'Rush yds' }

function statCells(line: string): StatCell[] {
  return line.split(' · ').map((part) => {
    const m = /^([\d,.]+(?:st|nd|rd|th)?)\s+(.+)$/.exec(part.trim())
    return m ? { v: m[1], l: STAT_LABEL[m[2]] ?? m[2] } : { t: part.trim() }
  })
}

function StatBox({ accolades }: { accolades: string[] }) {
  const lines = accolades.slice(0, 2)
  if (lines.length === 0) return null
  return (
    <div className="pe-cf-stats">
      {lines.map((line, j) => {
        const cells = statCells(line)
        if (cells.every((c) => 't' in c)) {
          return (
            <div key={j} className="pe-cf-honors">
              {cells.map((c, k) => (
                <span key={k}>{'t' in c ? c.t : ''}</span>
              ))}
            </div>
          )
        }
        return (
          <div key={j} className="pe-cf-statrow">
            {cells.map((c, k) =>
              't' in c ? (
                <span key={k} className="pe-cf-cell txt">
                  {c.t}
                </span>
              ) : (
                <span key={k} className="pe-cf-cell">
                  <b>{c.v}</b>
                  <i>{c.l}</i>
                </span>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Mouse only: the card leans toward the pointer and the shine follows it.
    Written straight to the element's style, so a pointermove never renders.
    The pending frame is kept per element, not per render, so a re-render
    mid-hover can't leave a frame behind that tilts the card after it's left. */
const tiltFrame = new WeakMap<Element, number>()

const TILT = {
  onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType !== 'mouse') return
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
    cancelAnimationFrame(tiltFrame.get(el) ?? 0)
    tiltFrame.set(
      el,
      requestAnimationFrame(() => {
        el.dataset.tilt = '1'
        el.style.setProperty('--pe-tx', `${(x - 0.5) * 22}deg`)
        el.style.setProperty('--pe-ty', `${(0.5 - y) * 18}deg`)
        el.style.setProperty('--pe-gx', `${x * 100}%`)
        el.style.setProperty('--pe-gy', `${y * 100}%`)
      })
    )
  },
  onPointerLeave(e: React.PointerEvent<HTMLElement>) {
    const el = e.currentTarget
    cancelAnimationFrame(tiltFrame.get(el) ?? 0)
    delete el.dataset.tilt
    for (const p of ['--pe-tx', '--pe-ty', '--pe-gx', '--pe-gy']) el.style.removeProperty(p)
  },
}

/**
 * Face down until revealed, then flipped. The front is the original card's
 * stock (11px corners, Orbitron numbers, Barlow names, every rarity effect),
 * laid out so the three things you choose on read at a glance: the position
 * tab and rarity across the top, the SEASON on a ribbon under the man, then
 * his name, his value and the stat box that earned it.
 *
 * Face down, the back gives a little away: a rare's edge catches the light,
 * a dynasty breathes gold, and the two at the top shake and leak colour.
 */
export function PackCard({
  player,
  revealed,
  picked = false,
  rejected = false,
  selectable = false,
  charging = false,
  burst = false,
  index = 0,
  chem = null,
  onClick,
  disabled = false,
  label,
}: {
  player: Player
  revealed: boolean
  picked?: boolean
  rejected?: boolean
  selectable?: boolean
  /** Mid-walkout: lifted over the veil, shaking. */
  charging?: boolean
  /** The walkout's flip: a ring of light off the card. */
  burst?: boolean
  /** Deal order, for the staggered entrance. */
  index?: number
  /** League packs: what this card would add to the team's chemistry. */
  chem?: number | null
  onClick?: () => void
  /** Stop taking taps without dropping the button. Swapping the element for
      a div remounts the card and replays the deal-in under the closing stage. */
  disabled?: boolean
  label?: string
}) {
  const rc = RARITY_LOOK[player.rarity]
  const cls = [
    'pe-card',
    revealed ? 'rev' : '',
    picked ? 'picked' : '',
    rejected ? 'rejected' : '',
    revealed && selectable ? 'selectable' : '',
    charging ? 'charging' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const style = {
    '--rc': rc.color,
    '--rg': rc.glow,
    '--art': rc.art,
    '--sh': rc.shimmer,
    '--i': index,
  } as React.CSSProperties

  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      className={cls}
      style={style}
      onClick={onClick}
      data-r={player.rarity}
      data-pe-card={player.id}
      {...TILT}
      {...(onClick
        ? {
            type: 'button' as const,
            disabled,
            'aria-label': label ?? (revealed ? `Take ${player.name}` : 'Reveal this card'),
          }
        : {})}
    >
      <div className="pe-tilt">
        <div className="pe-ci">
          <RarityEffects rarity={player.rarity} position="outer" />
          <div className="pe-card-back">
            <div className="pe-back-grid" />
            <Football />
            <div className="pe-back-label">TAP TO REVEAL</div>
          </div>
          <div className="pe-card-front">
            <div className="pe-cf-topbar">
              <div className="pe-cf-pos">{player.pos}</div>
              <div className={`pe-cf-rlab ${player.rarity}`}>{rc.label}</div>
            </div>
            <div className="pe-cf-art" style={{ background: rc.art }}>
              <RarityEffects rarity={player.rarity} position="inner" />
              {/* Only mounted on the front once it turns. The pack's faces are
                  already cached by then (see preloadFaces), so this is instant
                  but can never be seen through the back. */}
              <YearMark player={player} className="pe-cf-year" />
              {revealed && <Headshot player={player} className="pe-cf-img" eager />}
              {!player.year && <div className="pe-cf-initial">{player.name.charAt(0)}</div>}
              {chem != null && chem !== 0 && (
                <span className={`pe-cf-chem ${chem > 0 ? 'up' : 'down'}`}>
                  {chem > 0 ? '+' : ''}
                  {chem}
                </span>
              )}
            </div>
            <div className="pe-cf-season">
              {player.year ? <b>{player.year}</b> : null}
              <span className={(player.club ?? player.team).length > 16 ? 'long' : undefined}>
                {player.club ?? player.team}
              </span>
            </div>
            <div className="pe-cf-body">
              <div className={`pe-cf-name${player.name.length > 16 ? ' long' : ''}`}>{player.name}</div>
              <div className="pe-cf-score-row">
                <div className="pe-cf-score">{player.score.toLocaleString()}</div>
                <div className="pe-cf-ovr">OVR</div>
              </div>
              <StatBox accolades={player.accolades} />
            </div>
            <div className="pe-glare" aria-hidden />
          </div>
        </div>
      </div>
      {burst && <span className="pe-burst" aria-hidden />}
    </Tag>
  )
}

// ============================================================
// The field
// ============================================================

export type SlotView = {
  /** Can the slot be tapped right now (to set a captain, or to open). */
  clickable: boolean
  /** The pack currently on the stage. */
  opening?: boolean
  /** Grey the pack out: a slot that can't be opened in this state. */
  dim?: boolean
  /** Over the pack: CAPTAIN, BOOST. */
  badge?: { text: string; color?: string } | null
  /** Over a filled card: LOCKED. */
  flag?: { text: string; color?: string } | null
  /** The captain's slot: the patch on its pack, then on its card. */
  captain?: boolean
  /** Choosing a captain: a faint patch on the pack under the pointer. */
  capHint?: boolean
  /** Pulsing outline on the pack. */
  glow?: 'cap' | 'boost' | null
  /** Tint the label under the slot. */
  tone?: 'cap' | 'locked' | 'boosted' | null
}

function FilledSlot({
  player,
  flag,
  captain = false,
  landing,
}: {
  player: Player
  flag?: SlotView['flag']
  captain?: boolean
  /** Hidden while its card is still flying down; pops when it lands. */
  landing?: 'incoming' | 'landed' | null
}) {
  const rc = RARITY_LOOK[player.rarity]
  return (
    <div
      className={`pe-fsl has-p${landing ? ` ${landing}` : ''}`}
      style={{ '--rc': rc.color, '--rg': rc.glow, '--art': rc.art } as React.CSSProperties}
    >
      <RarityEffects rarity={player.rarity} position="outer" />
      <div className="pe-filled-card">
        <div className="pe-fc-topbar">
          <div className="pe-fc-pos-badge" style={{ background: rc.color }}>
            {player.pos}
          </div>
          <div className="pe-fc-rar-badge" style={{ color: rc.color }}>
            {rc.short}
          </div>
        </div>
        <div className="pe-fc-art" style={{ background: rc.art }}>
          <div className="pe-fc-field-lines" />
          <RarityEffects rarity={player.rarity} position="inner" />
          <YearMark player={player} className="pe-fc-year" short />
          <Headshot player={player} className="pe-fc-img" />
          {!player.year && <div className="pe-fc-initial">{player.name.charAt(0)}</div>}
        </div>
        <div className="pe-fc-info">
          <div className="pe-fc-name" style={{ color: rc.color }}>
            {surname(player.name)}
          </div>
          <div className="pe-fc-score">{player.score.toLocaleString()}</div>
          <div className="pe-fc-team-tag">{seasonLabel(player)}</div>
        </div>
        <div className="pe-fc-shine" />
      </div>
      {flag && (
        <div className="pe-fc-flag" style={{ '--flag': flag.color } as React.CSSProperties}>
          {flag.text}
        </div>
      )}
      {captain && <CaptainMark />}
    </div>
  )
}

function Slot({
  index,
  player,
  view,
  onSlot,
  landing,
}: {
  index: number
  player: Player | null
  view: SlotView
  onSlot?: (index: number) => void
  landing?: 'incoming' | 'landed' | null
}) {
  const def = SLOTS[index]
  const isHB = index === 1

  let body: React.ReactNode
  if (player) {
    body = <FilledSlot player={player} flag={view.flag} captain={view.captain} landing={landing} />
  } else if (view.opening) {
    body = (
      <div className="pe-fsl active">
        <div className="pe-fsl-locked">
          <div className="pe-fsl-pos-small">{def.short}</div>
          <div className="pe-fsl-opening">OPENING</div>
        </div>
      </div>
    )
  } else {
    const cls = [
      'pe-pack-wrap',
      view.clickable ? 'clickable' : '',
      view.dim ? 'dim' : '',
      view.glow === 'cap' || view.captain ? 'is-cap' : view.glow === 'boost' ? 'is-boost' : '',
      view.capHint && !view.captain ? 'cap-hint' : '',
    ]
      .filter(Boolean)
      .join(' ')
    body = (
      <button
        type="button"
        className={cls}
        disabled={!view.clickable}
        onClick={() => view.clickable && onSlot?.(index)}
        aria-label={`${def.label} pack${view.captain ? ', your captain' : ''}`}
        style={view.badge?.color ? ({ '--boost': view.badge.color } as React.CSSProperties) : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PACK_ART[def.pool]} alt="" className="pe-pack-img" draggable={false} />
        {view.badge && (
          <span className="pe-pack-badge" style={view.badge.color ? { color: view.badge.color } : undefined}>
            {view.badge.text}
          </span>
        )}
        {view.captain ? <CaptainMark /> : view.capHint ? <CaptainMark ghost /> : null}
      </button>
    )
  }

  return (
    <div className={`pe-slot-outer${isHB ? ' hb-back' : ''}`} data-pe-slot={index}>
      {body}
      <div className={`pe-slot-label${view.tone ? ` ${view.tone}` : view.captain ? ' cap' : ''}`}>{def.short}</div>
    </div>
  )
}

/**
 * The formation: the line across the top, receivers split wide, quarterback
 * and back underneath, which is the original's shape.
 */
export function Field({
  lineup,
  view,
  onSlot,
  landing,
}: {
  lineup: (Player | null)[]
  view: (index: number) => SlotView
  onSlot?: (index: number) => void
  /** The slot a kept card is flying to, from usePackStage. */
  landing?: { slot: number; phase: 'incoming' | 'landed' } | null
}) {
  const slot = (i: number) => (
    <Slot
      key={SLOTS[i].key}
      index={i}
      player={lineup[i]}
      view={view(i)}
      onSlot={onSlot}
      landing={landing?.slot === i ? landing.phase : null}
    />
  )
  return (
    <div className="pe-field">
      <div className="pe-form-row">{FORMATION.line.map(slot)}</div>
      <div className="pe-skill-spread">
        <div className="pe-skill-side">{FORMATION.wrLeft.map(slot)}</div>
        <div className="pe-skill-side">{FORMATION.wrRight.map(slot)}</div>
      </div>
      <div className="pe-form-row">{FORMATION.backfield.map(slot)}</div>
    </div>
  )
}

// ============================================================
// The ladder
// ============================================================

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

/** The eight rungs, top first. `score` marks every rung it reached and
    highlights the one it landed on; pass -1 to show the ladder bare.
    `climb` is the recap's version: fed a score that's counting up, each rung
    flashes as it's passed, and `landed` stamps the one it stops on. */
export function Ladder({ score, climb = false, landed = false }: { score: number; climb?: boolean; landed?: boolean }) {
  const here = score >= 0 ? tierFor(score) : null
  return (
    <div className={`pe-ladder${climb ? ' climb' : ''}${landed ? ' landed' : ''}`}>
      {TIERS.map((t, i) => {
        const reached = score >= t.min
        return (
          <div
            key={t.label}
            className={`pe-rung${reached ? ' reached' : ''}${t === here ? ' here' : ''}`}
            style={{ '--tc': t.color } as React.CSSProperties}
          >
            <span className="pe-rung-no">{ROMAN[i]}</span>
            <span className="pe-rung-name">{t.label}</span>
            <span className="pe-rung-min">{t.min.toLocaleString()}+</span>
            {reached ? <Check /> : <span className="pe-rung-mark" />}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// A lineup as a list
// ============================================================

/** The results tables and every place a lineup has to be read rather than
    admired: one row per slot, face, name, rarity, score. */
export function LineupSheet({
  name,
  lineup,
  total,
  totalColor,
  sub,
}: {
  name: React.ReactNode
  lineup: (Player | null)[]
  total?: number
  totalColor?: string
  sub?: React.ReactNode
}) {
  return (
    <div className="pe-sheet">
      <div className="pe-sheet-head">
        <span style={{ minWidth: 0 }}>
          <span className="pe-sheet-name">{name}</span>
          {sub && <span className="pe-row-sub">{sub}</span>}
        </span>
        {total != null && (
          <span className="pe-sheet-total" style={totalColor ? { color: totalColor } : undefined}>
            {total.toLocaleString()}
          </span>
        )}
      </div>
      {SLOTS.map((s, i) => {
        const p = lineup[i]
        if (!p) {
          return (
            <div key={s.key} className="pe-line empty">
              <span className="pe-line-pos">{s.short}</span>
              <span className="pe-line-face" />
              <span className="pe-line-name">Empty</span>
              <span className="pe-line-score">·</span>
            </div>
          )
        }
        const rc = RARITY_LOOK[p.rarity]
        return (
          <div key={s.key} className="pe-line" style={{ '--rc': rc.color, '--rart': rc.art } as React.CSSProperties}>
            <span className="pe-line-pos">{s.short}</span>
            <span className="pe-line-face">
              <Headshot player={p} className="" />
            </span>
            <span className="pe-line-name">
              {p.name}
              <small>{rc.label}</small>
            </span>
            <span className="pe-line-score">{p.score.toLocaleString()}</span>
          </div>
        )
      })}
    </div>
  )
}
