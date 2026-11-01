'use client'

// The cards, the packs and the field.
//
// Markup is the original's, class for class, so the original card CSS and
// every rarity effect fire exactly as they did. The only changes are the ones
// the site makes everywhere: no emoji (the card back's football and the
// captain's lightning bolt are drawn), and real buttons where something is
// tappable.

import { memo, useState } from 'react'
import {
  FORMATION,
  PACK_ART,
  RARITY_LOOK,
  SLOTS,
  TIERS,
  seasonLabel,
  surname,
  pearlLogo,
  teamLogo,
  tierFor,
  type BlindFace,
  type Chemistry,
  type Player,
  type Rarity,
} from '@/lib/packEmpire/rules'
import { useFace } from './faces'

// ============================================================
// Glyphs
// ============================================================

/** A star of `points` points on a 24 box. `drop` moves it down: an odd star has
    one point up and two lower feet, so centred on its hub it reads high. */
function starPath(points: number, outer: number, inner: number, drop = 0): string {
  const step = Math.PI / points
  const at = Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner
    const a = i * step - Math.PI / 2
    return `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + drop + r * Math.sin(a)).toFixed(2)}`
  })
  return `M${at.join('L')}z`
}

/**
 * The gem beside a rarity's name, more points and more cuts the rarer it gets:
 * a diamond, a cut hexagon, a star, an eight-point star, a twelve-point burst
 * with a jewel set in it. Drawn rather than clipped so it keeps its shape at
 * 11px and survives the gradient text on the top two rarities.
 */
const GEM: Record<Rarity, { d: string; cut?: string; fill: string }> = {
  common: { d: 'M12 3.5 20.5 12 12 20.5 3.5 12z', fill: '#c87840' },
  rare: { d: 'M12 1.8 20.8 6.9v10.2L12 22.2l-8.8-5.1V6.9z', cut: 'M12 7.4 16 9.7v4.6l-4 2.3-4-2.3V9.7z', fill: '#42c0f8' },
  dynasty: { d: starPath(5, 11.6, 5, 1.1), cut: starPath(5, 4.2, 1.9, 1.1), fill: '#ffd700' },
  transcendent: { d: starPath(8, 11.8, 4.8), cut: starPath(4, 4.6, 1.7), fill: '#ff90ff' },
  immortal: { d: starPath(12, 12, 6.8), cut: starPath(6, 5, 2.5), fill: '#80ffb8' },
  canton: { d: 'M12 .8C13.6 6.7 17.3 10.4 23.2 12 17.3 13.6 13.6 17.3 12 23.2 10.4 17.3 6.7 13.6.8 12 6.7 10.4 10.4 6.7 12 .8Z', fill: '#f4dfa4' },
}

export function RarityGem({ rarity, className = '' }: { rarity: Rarity; className?: string }) {
  const g = GEM[rarity]
  return (
    <svg className={`pe-gem ${className}`.trim()} viewBox="0 0 24 24" aria-hidden>
      <path d={g.d} fill={g.fill} fillRule="evenodd" />
      {g.cut && <path d={g.cut} fill="rgba(0, 0, 0, 0.42)" />}
    </svg>
  )
}

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
 * Foil Stock. Each rarity is a material (foil.css), and from Dynasty up the card has
 * a border nothing below it has: racing gold light, then electricity, then fire.
 * Every element here is a running animation moved by transform or opacity only, so
 * only mount what's on show: a face-down card has no art effects, a card in the air
 * has none at all, and a card on the field keeps only the light round its edge. The
 * strips are <img>s so they cost the file's size, not the card's size times the
 * phone's pixel density.
 */
const FX = '/games/pack-empire/fx'

/** Behind the card, seen through its frame. */
const CardEdge = memo(function CardEdge({ rarity, field = false }: { rarity: Rarity; field?: boolean }) {
  if (rarity === 'common' || rarity === 'rare') return null
  if (rarity === 'canton') {
    // An eclipse: the card is the moon, white light streaming off it, and a band of
    // colour running round that the way light splits through a diamond.
    return (
      <>
        {!field && (
          <>
            <span className="pf-aura" aria-hidden />
            <span className="pf-prism" aria-hidden>
              <i />
            </span>
            <span className="pf-corona" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${FX}/card-corona.webp`} alt="" />
            </span>
          </>
        )}
        <span className="pf-orbit" aria-hidden />
      </>
    )
  }
  const top = rarity !== 'dynasty'
  return (
    <>
      {top && !field && <span className="pf-aura" aria-hidden />}
      {rarity === 'immortal' && !field && (
        <span className="pf-fire" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${FX}/card-fire-immortal.webp`} alt="" />
        </span>
      )}
      <span className="pf-orbit" aria-hidden>
        <i />
        {top && !field && <i />}
      </span>
    </>
  )
})

/** Over the card's edge. */
const CardRim = memo(function CardRim({ rarity, revealed }: { rarity: Rarity; revealed: boolean }) {
  if (rarity === 'canton') {
    // A ring: diamonds set in the frame, a wave of light through them, a few flaring
    // at a time. Front only, the back has a rim of its own.
    if (!revealed) return null
    return (
      <>
        <span className="pf-pave" aria-hidden />
        <span className="pf-pave-run" aria-hidden>
          <i />
        </span>
        <span className="pf-glint" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${FX}/card-glint.webp`} alt="" />
        </span>
      </>
    )
  }
  if (rarity === 'transcendent') {
    return (
      <span className="pf-fire" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${FX}/card-arcs.webp`} alt="" />
      </span>
    )
  }
  if (rarity === 'dynasty') {
    return (
      <span className="pf-corners" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
    )
  }
  return null
})

/** In the art, behind the man. */
const CardArt = memo(function CardArt({ rarity }: { rarity: Rarity }) {
  if (rarity === 'canton') {
    return (
      <>
        <span className="pf-holo" aria-hidden />
        <span className="pf-surge" aria-hidden>
          <i />
        </span>
        <span className="pf-rays" aria-hidden>
          <i />
        </span>
      </>
    )
  }
  if (rarity === 'transcendent') {
    return (
      <>
        <span className="pf-stars" aria-hidden>
          <i />
        </span>
        <span className="pf-shoot" aria-hidden>
          <i />
          <i />
        </span>
      </>
    )
  }
  if (rarity === 'immortal') {
    return (
      <>
        <span className="pf-surge" aria-hidden>
          <i />
        </span>
        <span className="pf-smoke" aria-hidden>
          <i />
        </span>
      </>
    )
  }
  return null
})

/** Over the whole front. Common and Rare stay still: the sheen starts at Dynasty. */
const CardShine = memo(function CardShine({ rarity }: { rarity: Rarity }) {
  if (rarity === 'common' || rarity === 'rare') return null
  return (
    <>
      <span className="pf-sheen" aria-hidden>
        <i />
      </span>
      {rarity === 'immortal' ? (
        <span className="pf-embers" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : (
        <span className="pf-sparks" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
    </>
  )
})

// ============================================================
// A card from a pack
// ============================================================

function Headshot({ player, className, eager = false }: { player: Player; className: string; eager?: boolean }) {
  // A photo that won't load gets the drawn portrait, same as no photo at all.
  const [broken, setBroken] = useState<string | null>(null)
  const img = useFace(player)
  if (!img || broken === img) return <Portrait className={className} />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={img}
      alt=""
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setBroken(img)}
    />
  )
}

/** Orbitron's digits at 100px. A 1 is under half a 0, so 2011 would sit a
    quarter narrower than 2020 and read as a smaller year. */
const DIGIT_WIDTH: Record<string, number> = { 1: 39, 4: 73, 7: 66 }

/** How far to scale a year, in height and again in width, so every year
    spans the card the way a 2020 does. Half in each, because all of it in
    height would make 2011 a third taller than 2020. */
function yearFit(year: number): number {
  let width = 0
  for (const d of String(year)) width += DIGIT_WIDTH[d] ?? 83
  return Math.round(Math.sqrt(332 / width) * 1000) / 1000
}

/** The season, big and hollow behind the man: what makes a card a year.
    Always all four digits: it spans the card so the man only covers the middle. */
function YearMark({ player, className }: { player: Player; className: string }) {
  if (!player.year) return null
  return (
    <div className={className} style={{ '--yf': yearFit(player.year) } as React.CSSProperties} aria-hidden>
      {player.year}
    </div>
  )
}

/** The Range gauge's full scale: a rough read, so anything past it just fills the bar. */
const GAUGE_TOP = 5600

/** What a blind card prints where its value would be. */
export function blindValue(blind: BlindFace): string {
  if (blind.level === 'season') return '?,???'
  return `${(blind.lo ?? 0).toLocaleString()}-${(blind.hi ?? 0).toLocaleString()}`
}

/** A lineup's range, up in the strip. A full one runs to 38,000 and the cell
    is 90px wide on a phone, so past 10,000 it goes to thousands. */
export function blindTotal(lo: number, hi: number): string {
  if (hi < 10000) return blindValue({ level: 'range', lo, hi })
  return `${Math.round(lo / 1000)}k-${Math.round(hi / 1000)}k`
}

/** A blind card wears no rarity at all, front or back. */
const BLIND_LOOK = {
  color: '#d8d0c0',
  glow: 'rgba(255, 248, 234, 0.34)',
  art: 'linear-gradient(155deg, #1b2029 0%, #2c3545 60%, #3b4658 100%)',
  shimmer: '#8d8473',
}

/** Ball Knower is the harder of the two, so it's the darker one: black and
    brass, like a file you weren't meant to see. Every card in it looks the
    same, so nothing here can be a tell. */
const SEASON_LOOK = {
  ...BLIND_LOOK,
  color: '#e8c98a',
  glow: 'rgba(232, 201, 138, 0.3)',
  art: 'linear-gradient(155deg, #0c0c0e 0%, #17161a 62%, #262219 100%)',
}

function blindLook(blind: BlindFace) {
  return blind.level === 'season' ? SEASON_LOOK : BLIND_LOOK
}

// ── The stat box ───────────────────────────────────────────────
// Accolades are stored as sentences ("4,643 yds · 45 TD · 6 INT"), the shape
// every lineup banked before now carries too, so the card splits them here
// rather than the pool growing a second copy: a number and its label is a
// cell, and a line with no numbers in it (a lineman's honors) is a row of
// chips, short enough that two of them share a line. Cells share the row, so a
// long line wraps into its cells instead of running off the edge of the card.

type StatCell = { v: string; l: string } | { t: string }

const STAT_LABEL: Record<string, string> = {
  'a game': 'PPG',
  'in scoring': 'Scoring',
  'rush yds': 'Rush',
  'pass yds': 'Pass',
}

const HONOR_LABEL: Record<string, string> = {
  'First-Team All-Pro': '1st-Team AP',
  'Second-Team All-Pro': '2nd-Team AP',
}

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
              {cells.map((c, k) => {
                const text = 't' in c ? c.t : ''
                return <span key={k}>{HONOR_LABEL[text] ?? text}</span>
              })}
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

/** Lean a card: x and y run 0 to 1 across it. Written straight to the two
    elements that move. A custom property on the card would be inherited by
    every effect inside it and re-style all of them on every frame. */
export function leanCard(card: Element, x: number, y: number) {
  const tilt = card.querySelector<HTMLElement>('.pe-tilt')
  const glare = card.querySelector<HTMLElement>('.pe-glare')
  if (tilt) tilt.style.transform = `rotateX(${(0.5 - y) * 18}deg) rotateY(${(x - 0.5) * 22}deg)`
  glare?.style.setProperty('--pe-gx', `${x * 100}%`)
  glare?.style.setProperty('--pe-gy', `${y * 100}%`)
}

function straightenCard(card: Element) {
  card.querySelector<HTMLElement>('.pe-tilt')?.style.removeProperty('transform')
  const glare = card.querySelector<HTMLElement>('.pe-glare')
  glare?.style.removeProperty('--pe-gx')
  glare?.style.removeProperty('--pe-gy')
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
        leanCard(el, x, y)
      })
    )
  },
  onPointerLeave(e: React.PointerEvent<HTMLElement>) {
    const el = e.currentTarget
    cancelAnimationFrame(tiltFrame.get(el) ?? 0)
    delete el.dataset.tilt
    straightenCard(el)
  },
}

/** The logo beside the name takes room from it, so a long name shrinks to
    fit: each gets the largest size its letters allow, estimated off their
    widths in Barlow Condensed capitals (M and W run wide; I, J, spaces and
    punctuation narrow). Calibrated against every name in the pool at phone
    size, on the thickest frame; re-measure if the pool gains a much longer one. */
function nameFit(name: string): number {
  let width = 0
  for (const ch of name.toUpperCase()) width += 'MW'.includes(ch) ? 0.62 : "IJ.' -".includes(ch) ? 0.27 : 0.47
  return Math.round(Math.min(0.9, 4.72 / width) * 1000) / 1000
}

/**
 * Face down until revealed, then flipped. The front is Foil Stock (foil.css): a
 * frame and a material for each rarity, laid out so the three things you choose on
 * read at a glance: the position tab and rarity on their own bar across the top, the
 * SEASON across the man's chest, then below him his name, his value, his team's logo
 * and the stat box that earned it.
 *
 * Face down, the back gives a little away: a rare's edge catches the light,
 * a dynasty breathes gold, and the two at the top shake and leak colour.
 */
export function PackCard({
  player,
  revealed,
  picked = false,
  rejected = false,
  kept = false,
  selectable = false,
  charging = false,
  burst = false,
  still = false,
  index = 0,
  chem = null,
  chip = null,
  blocked = null,
  serial = null,
  onClick,
  disabled = false,
  label,
}: {
  player: Player
  revealed: boolean
  picked?: boolean
  rejected?: boolean
  /** A blind pack that's turned over: the card you kept, still hidden. */
  kept?: boolean
  selectable?: boolean
  /** Mid-walkout: lifted over the veil, shaking. */
  charging?: boolean
  /** The walkout's flip: a ring of light off the card. */
  burst?: boolean
  /** In the air: the card without its effects, which only cost frames there. */
  still?: boolean
  /** Deal order, for the staggered entrance. */
  index?: number
  /** League packs and the hard modes: what this card would add to the team's
      chemistry. */
  chem?: number | null
  /** The Daily: what the day's rule does to this card, where its face shows it. */
  chip?: string | null
  /** A card you can't take right now, and why: no slot left, or over the cap.
      Still there to look at. */
  blocked?: string | null
  /** A Canton in the binder: the number you pulled, of how many there are now. */
  serial?: [number, number] | null
  onClick?: () => void
  /** Stop taking taps without dropping the button. Swapping the element for
      a div remounts the card and replays the deal-in under the closing stage. */
  disabled?: boolean
  label?: string
}) {
  const blind = player.blind
  const rc = blind ? blindLook(blind) : RARITY_LOOK[player.rarity]
  const logo = !player.team ? null : player.rarity === 'canton' ? pearlLogo(player) : teamLogo(player)
  const cls = [
    'pe-card',
    revealed ? 'rev' : '',
    picked ? 'picked' : '',
    rejected ? 'rejected' : '',
    kept ? 'kept' : '',
    revealed && selectable && !blocked ? 'selectable' : '',
    charging ? 'charging' : '',
    blocked && revealed ? 'blocked' : '',
    still ? 'still' : '',
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
      data-r={blind ? 'blind' : player.rarity}
      data-level={blind?.level}
      data-pe-card={player.id}
      {...TILT}
      {...(onClick
        ? {
            type: 'button' as const,
            disabled,
            'aria-label': label ?? (kept ? 'Next pack' : revealed ? `Take ${player.name}` : 'Reveal this card'),
          }
        : {})}
    >
      <div className="pe-tilt">
        <div className="pe-ci">
          {!still && !blind && <CardEdge rarity={player.rarity} />}
          <div className="pe-card-back">
            <div className="pe-back-in">
              <span className="pe-back-line" aria-hidden />
              <Football />
              <div className="pe-back-label">TAP TO REVEAL</div>
            </div>
            {player.rarity === 'canton' && !revealed && !blind && !still && (
              <span className="pf-blaze" aria-hidden>
                {/* eslint-disable @next/next/no-img-element */}
                <img src={`${FX}/card-molten.webp`} alt="" />
                <img src={`${FX}/card-molten.webp`} alt="" />
                {/* eslint-enable @next/next/no-img-element */}
                <b>TAP TO REVEAL</b>
              </span>
            )}
          </div>
          <div className="pe-card-front">
            <div className="pe-cf-in">
            <div className="pe-cf-topbar">
              <div className="pe-cf-pos">{player.pos}</div>
              {blocked && revealed ? (
                <div className="pe-cf-noslot">{blocked}</div>
              ) : blind ? (
                <div className="pe-cf-rlab pe-cf-rlab--hidden">
                  <svg className="pe-gem" viewBox="0 0 24 24" aria-hidden>
                    <path d="M12 3.5 20.5 12 12 20.5 3.5 12z" fill="none" stroke="currentColor" strokeWidth="2.4" />
                  </svg>
                  {kept ? 'Kept' : 'Hidden'}
                </div>
              ) : (
                <div className={`pe-cf-rlab ${player.rarity}`}>
                  <RarityGem rarity={player.rarity} />
                  {RARITY_LOOK[player.rarity].label}
                </div>
              )}
            </div>
            <div className="pe-cf-art" style={blind ? { background: rc.art } : undefined}>
              {revealed && !still && !blind && <CardArt rarity={player.rarity} />}
              {/* Only mounted on the front once it turns. The pack's faces are
                  already cached by then (see preloadFaces), so this is instant
                  but can never be seen through the back. */}
              <YearMark player={player} className="pe-cf-year" />
              {revealed && !still && !blind && (player.rarity === 'transcendent' || player.rarity === 'canton') && (
                <Headshot player={player} className="pe-cf-rim" eager />
              )}
              {revealed && <Headshot player={player} className="pe-cf-img" eager />}
              {!player.year && <div className="pe-cf-initial">{player.name.charAt(0)}</div>}
              {chem != null && chem !== 0 && (
                <span className={`pe-cf-chem ${chem > 0 ? 'up' : 'down'}`}>
                  {chem > 0 ? '+' : ''}
                  {chem}
                </span>
              )}
              {chip && <span className="pe-cf-rule">{chip}</span>}
              {player.salary != null && <span className="pe-cf-salary">${player.salary}M</span>}
              {serial && (
                <span className="pe-cf-serial">
                  <b>{serial[0]}</b>/{serial[1]}
                </span>
              )}
              {player.year ? (
                <div className="pe-cf-season">
                  <b>{player.year}</b>
                </div>
              ) : null}
            </div>
            <div className="pe-cf-body">
              <div className="pe-cf-id">
                <div className="pe-cf-id-main">
                  <div className="pe-cf-name" style={{ '--nf': nameFit(player.name) } as React.CSSProperties}>
                    {player.name}
                  </div>
                  {blind ? (
                    <div className="pe-cf-score-row">
                      <div className={`pe-cf-score pe-cf-score--${blind.level}`}>{blindValue(blind)}</div>
                    </div>
                  ) : (
                    <div className="pe-cf-score-row">
                      <div className="pe-cf-score" data-v={player.score.toLocaleString()}>
                        {player.score.toLocaleString()}
                      </div>
                      <div className="pe-cf-ovr">OVR</div>
                    </div>
                  )}
                </div>
                {revealed && logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="pe-cf-logo" src={logo} alt={player.team} draggable={false} />
                )}
              </div>
              {blind?.level === 'range' && (
                <div className="pe-cf-gauge" aria-hidden>
                  <i
                    style={{
                      left: `${Math.min((blind.lo ?? 0) / GAUGE_TOP, 1) * 100}%`,
                      width: `${(Math.min((blind.hi ?? 0) / GAUGE_TOP, 1) - Math.min((blind.lo ?? 0) / GAUGE_TOP, 1)) * 100}%`,
                    }}
                  />
                </div>
              )}
              {blind ? (
                <div className="pe-cf-blindnote">{blind.level === 'range' ? (player.club ?? player.team) : 'Season only'}</div>
              ) : (
                <StatBox accolades={player.accolades} />
              )}
            </div>
            {revealed && !still && !blind && <CardShine rarity={player.rarity} />}
            <div className="pe-glare" aria-hidden />
            </div>
          </div>
          {!still && !blind && <CardRim rarity={player.rarity} revealed={revealed} />}
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
  /** The Daily: a blank card for the position, not a pack. Nothing here opens,
      so nothing here should look like it does. */
  empty?: boolean
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
  const blind = player.blind
  const rc = blind ? blindLook(blind) : RARITY_LOOK[player.rarity]
  return (
    <div
      className={`pe-fsl has-p${landing ? ` ${landing}` : ''}`}
      style={{ '--rc': rc.color, '--rg': rc.glow, '--art': rc.art } as React.CSSProperties}
      data-r={blind ? 'blind' : player.rarity}
      data-level={blind?.level}
    >
      {!blind && <CardEdge rarity={player.rarity} field />}
      <div className="pe-filled-card">
        <div className="pe-fc-topbar">
          <div className="pe-fc-pos-badge">
            {player.pos}
          </div>
          {!blind && (
            <div className={`pe-fc-rar-badge ${player.rarity}`}>
              {RARITY_LOOK[player.rarity].label}
            </div>
          )}
        </div>
        <div className="pe-fc-art" style={blind ? { background: rc.art } : undefined}>
          <YearMark player={player} className="pe-fc-year" />
          <Headshot player={player} className="pe-fc-img" />
          {!player.year && <div className="pe-fc-initial">{player.name.charAt(0)}</div>}
          {player.salary != null && <span className="pe-fc-salary">${player.salary}M</span>}
        </div>
        <div className="pe-fc-info">
          <div className="pe-fc-name">
            {surname(player.name)}
          </div>
          <div className={`pe-fc-score${blind ? ' blind' : ''}`}>
            {blind ? blindValue(blind) : player.score.toLocaleString()}
          </div>
          <div className="pe-fc-team-tag">{blind?.level === 'season' ? player.year : seasonLabel(player)}</div>
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
  } else if (view.empty) {
    const cls = ['pe-blank', view.clickable ? 'clickable' : '', view.captain ? 'is-cap' : ''].filter(Boolean).join(' ')
    const inner = (
      <>
        <span className="pe-blank-pos">{def.short}</span>
        <Portrait className="pe-blank-man" />
        {view.captain ? <CaptainMark /> : view.capHint ? <CaptainMark ghost /> : null}
      </>
    )
    body = view.clickable ? (
      <button type="button" className={cls} onClick={() => onSlot?.(index)} aria-label={`${def.label}, make captain`}>
        {inner}
      </button>
    ) : (
      <div className={cls}>{inner}</div>
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
      <div className={`pe-slot-label${view.tone ? ` ${view.tone}` : view.captain ? ' cap' : ''}${view.empty && !player ? ' blank' : ''}`}>
        {def.short}
      </div>
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
  counted,
  captain = null,
}: {
  name: React.ReactNode
  lineup: (Player | null)[]
  total?: number
  totalColor?: string
  sub?: React.ReactNode
  /** The Daily: what each slot counted for once the rule had its say. */
  counted?: number[]
  captain?: number | null
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
        const value = counted?.[i] ?? p.score
        return (
          <div key={s.key} className="pe-line" style={{ '--rc': rc.color, '--rart': rc.art } as React.CSSProperties}>
            <span className="pe-line-pos">{s.short}</span>
            <span className="pe-line-face">
              <Headshot player={p} className="" />
            </span>
            <span className="pe-line-name">
              {p.name}
              <small>
                {rc.label}
                {p.year ? ` · ${p.year}` : ''}
                {captain === i ? ' · Captain' : ''}
              </small>
            </span>
            <span className="pe-line-score">
              {value.toLocaleString()}
              {value !== p.score && <small>{p.score.toLocaleString()}</small>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Every bond in a lineup, good and bad, with what each one paid. */
export function Bonds({ chem, empty = 'No chemistry either way.' }: { chem: Chemistry; empty?: string }) {
  if (!chem.bonds.length) return <p className="pe-note">{empty}</p>
  return (
    <div className="pe-chem">
      {chem.bonds.map((b, i) => (
        <div key={i} className={`pe-bond ${b.type}`}>
          <span>
            {surname(b.aName)} and {surname(b.bName)}
            <small>{b.reason}</small>
          </span>
          <b>
            {b.points > 0 ? '+' : '−'}
            {Math.abs(b.points).toLocaleString()}
          </b>
        </div>
      ))}
    </div>
  )
}
