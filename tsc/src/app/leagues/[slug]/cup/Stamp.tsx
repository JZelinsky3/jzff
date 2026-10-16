'use client'

// One Cup stamp, printed the way a rubber stamp prints on the cream paper.
//
// The outline says which set it's from (round seal for picks, rectangular
// postmark for teams, oval for the ones for laughs). Inside, every stamp is
// carved differently (Joey, 2026-10-16: "not all same design"): its own
// emblem, its own edge (double ring, beads, sunburst, rope; plain,
// perforated, notched ticket, riveted plaque) and its own layout (name
// round the rim, a ribbon across the middle, a big figure, or the emblem
// beside the name).
//
// The colour is the tier: bronze, silver or gold foil, by how many times
// it's been earned (stampTier). Not earned yet: a faint dashed outline with
// the emblem ghosted, so the book shows what's still to collect.

import { useId } from 'react'
import type { StampDef, StampId, StampTier } from '@/lib/cup/stamps'

// Three stops each: dark edge, the sheen across the middle, dark edge.
const FOIL: Record<StampTier, [string, string, string]> = {
  bronze: ['#6b3d1b', '#b97f4b', '#7a4520'],
  silver: ['#4a535d', '#a9b3bc', '#55606b'],
  gold: ['#7a560c', '#d4aa42', '#86620e'],
}
const FADED = '#bcae88'
// Cut-outs (a number inside a medal, the words on a ribbon) are the paper.
const PAPER = '#f5eedb'

type Ring = 'double' | 'beaded' | 'sun' | 'rope' | 'post' | 'perf' | 'ticket' | 'plaque' | 'oval' | 'ovalDash' | 'ovalStars'
type Layout = 'arc' | 'big' | 'band' | 'stack' | 'side'

const LOOK: Record<StampId, { ring: Ring; layout: Layout; big?: string }> = {
  'every-game': { ring: 'beaded', layout: 'arc' },
  'perfect-round': { ring: 'double', layout: 'big', big: '100%' },
  'called-upset': { ring: 'sun', layout: 'band' },
  'against-crowd': { ring: 'rope', layout: 'arc' },
  'called-it': { ring: 'sun', layout: 'arc' },
  'perfect-cup': { ring: 'double', layout: 'band' },
  'challenge-winner': { ring: 'beaded', layout: 'band' },
  champion: { ring: 'plaque', layout: 'side' },
  finalist: { ring: 'post', layout: 'stack' },
  'giant-killer': { ring: 'perf', layout: 'side' },
  cinderella: { ring: 'ticket', layout: 'stack' },
  'cup-high': { ring: 'post', layout: 'side' },
  'close-shave': { ring: 'perf', layout: 'stack' },
  double: { ring: 'plaque', layout: 'stack' },
  repeat: { ring: 'ticket', layout: 'side' },
  'bye-and-out': { ring: 'oval', layout: 'stack' },
  traitor: { ring: 'ovalDash', layout: 'side' },
  jinxed: { ring: 'ovalStars', layout: 'stack' },
}

function Star({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`)
  }
  return <polygon points={pts.join(' ')} fill={color} stroke="none" />
}

function Trophy({ ink, hollow = false }: { ink: string; hollow?: boolean }) {
  const f = hollow ? 'none' : ink
  return (
    <>
      <path d="M6.5 3.5 H17.5 V7 C17.5 10.8 15.2 13.4 12 13.4 C8.8 13.4 6.5 10.8 6.5 7 Z" fill={f} strokeWidth={hollow ? 1.5 : 0} />
      <path d="M6.6 5.2 C3 5.2 3 10.2 7.6 11 M17.4 5.2 C21 5.2 21 10.2 16.4 11" strokeWidth="1.5" />
      <path d="M11 13.4 H13 V16.5 H11 Z" fill={ink} stroke="none" />
      <path d="M8.2 16.5 H15.8 L16.8 18.8 H7.2 Z" fill={f} strokeWidth={hollow ? 1.3 : 0} />
      <path d="M6 18.8 H18 V21.4 H6 Z" fill={ink} stroke="none" />
    </>
  )
}

// Each emblem in a 24 x 24 box, carved for one ink.
function Emblem({ id, ink }: { id: StampId; ink: string }) {
  switch (id) {
    case 'every-game': // a full tally
      return <path d="M6 5 V19 M9.5 5 V19 M13 5 V19 M16.5 5 V19 M3.5 16.2 L20.5 7.6" strokeWidth="2" strokeLinecap="round" />
    case 'perfect-round':
      return null
    case 'called-upset': // the line that shoots up
      return <path d="M3 19 L9 12.8 L12.6 16 L20 7.2 M14.6 7 H20.2 V12.6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    case 'against-crowd': // the one apart from the pack
      return (
        <>
          {[6.5, 11.5, 16.5].flatMap((y) => [4.5, 8.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" fill={ink} stroke="none" />))}
          <path d="M12.6 4.5 V19.5" strokeWidth="1" strokeDasharray="1.6 1.6" />
          <circle cx="18" cy="11.5" r="3.4" fill={ink} stroke="none" />
        </>
      )
    case 'called-it': // a crystal ball
      return (
        <>
          <circle cx="12" cy="10" r="7" strokeWidth="2" />
          <path d="M8.4 8.4 A4.2 4.2 0 0 1 11.2 5.6" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M7 21.5 L9 16.8 H15 L17 21.5 Z" fill={ink} stroke="none" />
        </>
      )
    case 'perfect-cup': // the whole bracket, ending in a star
      return (
        <>
          <path d="M3 4.5 H8 V9.5 H3 M8 7 H12 V17 H8 M3 14.5 H8 V19.5 H3 M12 12 H15.5" strokeWidth="1.7" strokeLinejoin="round" />
          <Star cx={19.5} cy={12} r={3.8} color={ink} />
        </>
      )
    case 'challenge-winner': // a first-place medal
      return (
        <>
          <path d="M8.6 12 L6 22 L9 20.2 L11 22.6 L11.6 13.4 Z M15.4 12 L18 22 L15 20.2 L13 22.6 L12.4 13.4 Z" fill={ink} stroke="none" />
          <circle cx="12" cy="8.6" r="6.4" fill={ink} stroke="none" />
          <text x="12" y="11.6" textAnchor="middle" fill={PAPER} stroke="none" style={{ fontFamily: 'var(--cp-num)', fontWeight: 700, fontSize: 9 }}>
            1
          </text>
        </>
      )
    case 'champion':
      return (
        <>
          <Trophy ink={ink} />
          <Star cx={2.6} cy={3.4} r={1.9} color={ink} />
          <Star cx={21.4} cy={3.4} r={1.9} color={ink} />
        </>
      )
    case 'finalist':
      return <Trophy ink={ink} hollow />
    case 'giant-killer': // a slingshot and its stone
      return (
        <>
          <path d="M9 21.5 V14 M9 14 L5 5 M9 14 L13 5" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 5 Q9 9.5 13 5" strokeWidth="1" />
          <circle cx="19" cy="6.2" r="2.7" fill={ink} stroke="none" />
          <path d="M14.6 10 L16.2 8.9" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )
    case 'cinderella': // a minute to midnight
      return (
        <>
          <circle cx="12" cy="12" r="9" strokeWidth="2" />
          <path d="M12 4.6 V6.4 M19.4 12 H17.6 M12 19.4 V17.6 M4.6 12 H6.4" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M12 12 V6.6" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M12 12 L11.1 4.9" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="1.3" fill={ink} stroke="none" />
        </>
      )
    case 'cup-high': // the summit, flag planted
      return (
        <>
          <path d="M2 21 L9 9.5 L12.6 15 L15.6 10.8 L22 21 Z" fill={ink} stroke="none" />
          <path d="M9 9.5 V2.8" strokeWidth="1.4" />
          <path d="M9 2.8 L14.2 4.5 L9 6.2 Z" fill={ink} stroke="none" />
        </>
      )
    case 'close-shave': // a straight razor
      return (
        <>
          <path d="M2.5 8.2 H15.8 L18.2 11.2 L15.8 14.2 H2.5 Z" fill={ink} stroke="none" />
          <path d="M3.5 12.6 H15" stroke={PAPER} strokeWidth="0.9" />
          <path d="M17.4 11.6 L21.6 19.2" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )
    case 'double': // two cups
      return (
        <>
          <g transform="translate(-1.5 2) scale(0.62)">
            <Trophy ink={ink} />
          </g>
          <g transform="translate(10 2) scale(0.62)">
            <Trophy ink={ink} />
          </g>
        </>
      )
    case 'repeat': // round again
      return (
        <path
          d="M4.6 12 A7.4 7.4 0 0 1 17.6 7.2 M18.6 3.2 V7.8 H14 M19.4 12 A7.4 7.4 0 0 1 6.4 16.8 M5.4 20.8 V16.2 H10"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'bye-and-out': // slept through it
      return (
        <path d="M3.5 9 H11 L3.5 17.5 H11 M13 5.5 H17.6 L13 10.8 H17.6 M18.6 13 H21.6 L18.6 16.6 H21.6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )
    case 'traitor': // a dagger
      return (
        <>
          <path d="M12 1.8 L14.1 13 H9.9 Z" fill={ink} stroke="none" />
          <path d="M6.8 13.2 H17.2" strokeWidth="2.3" strokeLinecap="round" />
          <path d="M12 13.2 V19.2" strokeWidth="2.7" />
          <circle cx="12" cy="20.8" r="1.7" fill={ink} stroke="none" />
        </>
      )
    case 'jinxed': // a black cat
      return (
        <>
          <path d="M6.6 22 C5.6 16 7.8 12.4 12 12.4 C16.2 12.4 18.4 16 17.4 22 Z" fill={ink} stroke="none" />
          <circle cx="12" cy="9.2" r="3.7" fill={ink} stroke="none" />
          <path d="M8.7 7.6 L9.2 3.8 L11.2 6.3 Z M15.3 7.6 L14.8 3.8 L12.8 6.3 Z" fill={ink} stroke="none" />
          <path d="M17.2 20.8 C21.4 19.8 21.6 14.6 18.4 13.6" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="10.6" cy="9.2" r="0.75" fill={PAPER} stroke="none" />
          <circle cx="13.4" cy="9.2" r="0.75" fill={PAPER} stroke="none" />
        </>
      )
  }
}

// A stamp is never pressed quite straight. Deterministic, so a reload
// doesn't shuffle the book.
function tilt(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return ((Math.abs(h) % 13) - 6) * 1.1
}

// Fit a line across `room` units in the condensed face.
function fit(text: string, room: number, max: number): number {
  return Math.min(max, room / (text.length * 0.56))
}

// A name over two lines, split near the middle, for the side layouts.
function twoLines(name: string): string[] {
  const words = name.split(' ')
  if (words.length < 2) return [name]
  let best = 1
  let gap = Infinity
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length)
    if (d < gap) {
      gap = d
      best = i
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')]
}

function ring(kind: Ring, dash: string | undefined, ink: string) {
  switch (kind) {
    case 'double':
      return (
        <>
          <circle cx="50" cy="50" r="46" strokeWidth="3.4" strokeDasharray={dash} />
          <circle cx="50" cy="50" r="40.5" strokeWidth="1.2" />
        </>
      )
    case 'beaded':
      return (
        <>
          <circle cx="50" cy="50" r="46.6" strokeWidth="1.6" strokeDasharray={dash} />
          {Array.from({ length: 44 }, (_, i) => {
            const a = (i / 44) * Math.PI * 2
            // Rounded like the other rings: the server and the browser can
            // disagree on a sine's last digit, which is a hydration mismatch.
            return <circle key={i} cx={(50 + 43.2 * Math.cos(a)).toFixed(2)} cy={(50 + 43.2 * Math.sin(a)).toFixed(2)} r="1.05" fill={ink} stroke="none" />
          })}
          <circle cx="50" cy="50" r="39.8" strokeWidth="1.1" />
        </>
      )
    case 'sun': {
      const pts: string[] = []
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2
        const r = i % 2 ? 44.6 : 48
        pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`)
      }
      return (
        <>
          <polygon points={pts.join(' ')} strokeWidth="1.5" strokeLinejoin="round" strokeDasharray={dash} />
          <circle cx="50" cy="50" r="40.5" strokeWidth="2.2" />
        </>
      )
    }
    case 'rope':
      return (
        <>
          <circle cx="50" cy="50" r="46" strokeWidth="3.6" strokeDasharray={dash ?? '2.2 1.6'} />
          <circle cx="50" cy="50" r="40.5" strokeWidth="1.2" />
        </>
      )
    case 'post':
      return (
        <>
          <rect x="4" y="19" width="92" height="62" rx="3" strokeWidth="3.4" strokeDasharray={dash} />
          <rect x="9.5" y="24.5" width="81" height="51" rx="1.5" strokeWidth="1.2" />
        </>
      )
    case 'perf':
      return (
        <>
          <rect x="5" y="20" width="90" height="60" strokeWidth="3.4" strokeDasharray="0.1 3.4" strokeLinecap="round" />
          <rect x="9.5" y="24.5" width="81" height="51" strokeWidth="1.8" strokeDasharray={dash} />
        </>
      )
    case 'ticket':
      return (
        <>
          <path d="M9 19 H91 A5 5 0 0 0 96 24 V76 A5 5 0 0 0 91 81 H9 A5 5 0 0 0 4 76 V24 A5 5 0 0 0 9 19 Z" strokeWidth="3" strokeDasharray={dash} />
          <rect x="10" y="25" width="80" height="50" rx="1" strokeWidth="1" strokeDasharray="3 2" />
        </>
      )
    case 'plaque':
      return (
        <>
          <rect x="4" y="19" width="92" height="62" rx="9" strokeWidth="2.8" strokeDasharray={dash} />
          <rect x="9" y="24" width="82" height="52" rx="5.5" strokeWidth="1.2" />
          {[
            [14.5, 29.5],
            [85.5, 29.5],
            [14.5, 70.5],
            [85.5, 70.5],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill={ink} stroke="none" />
          ))}
        </>
      )
    case 'oval':
      return (
        <>
          <ellipse cx="50" cy="50" rx="47" ry="35" strokeWidth="3.2" strokeDasharray={dash} />
          <ellipse cx="50" cy="50" rx="41.5" ry="29.5" strokeWidth="1.1" />
        </>
      )
    case 'ovalDash':
      return (
        <>
          <ellipse cx="50" cy="50" rx="47" ry="35" strokeWidth="2.6" strokeDasharray={dash ?? '6 3'} />
          <ellipse cx="50" cy="50" rx="41.5" ry="29.5" strokeWidth="1.6" />
        </>
      )
    case 'ovalStars':
      return (
        <>
          <ellipse cx="50" cy="50" rx="47" ry="35" strokeWidth="2.2" strokeDasharray={dash} />
          <ellipse cx="50" cy="50" rx="42.5" ry="30.5" strokeWidth="1" />
          <Star cx={15} cy={50} r={3} color={ink} />
          <Star cx={85} cy={50} r={3} color={ink} />
        </>
      )
  }
}

export function Stamp({
  def,
  tier,
  caption,
  year = null,
  size = 84,
  seed = '',
  className,
  style,
}: {
  def: StampDef
  // Null: not earned yet, drawn as a faint outline.
  tier: StampTier | null
  // The Cup's name, printed on the stamp, with the year when there is one.
  caption: string
  year?: number | null
  size?: number
  seed?: string
  className?: string
  style?: React.CSSProperties
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const faded = tier == null
  const ink = faded ? FADED : `url(#g${uid})`
  const look = LOOK[def.id]
  const name = def.name.toUpperCase()
  const cap = (year ? `${caption} · ${year}` : caption).toUpperCase()
  const num: React.CSSProperties = { fontFamily: 'var(--cp-num)', fontWeight: 700 }
  const lab: React.CSSProperties = { fontFamily: 'var(--cp-num)', fontWeight: 600, letterSpacing: '0.06em' }
  const rot = tilt(def.id + seed)
  const dash = faded ? '3.5 2.5' : undefined
  const emblem = (x: number, y: number, k: number) => (
    <g transform={`translate(${x} ${y}) scale(${k})`} opacity={faded ? 0.75 : 1}>
      <Emblem id={def.id} ink={ink} />
    </g>
  )

  let body: React.ReactNode
  if (def.set === 'pick') {
    const arcs = (
      <defs>
        <path id={`t${uid}`} d="M 18 50 A 32 32 0 0 1 82 50" />
        <path id={`b${uid}`} d="M 12.5 50 A 37.5 37.5 0 0 0 87.5 50" />
      </defs>
    )
    if (look.layout === 'band') {
      // Emblem up top, the name on a ribbon across the middle, the caption
      // underneath.
      body = (
        <>
          {ring(look.ring, dash, ink)}
          {emblem(37, 16, 1.08)}
          <path d="M3 47 H97 L92.5 55.5 L97 64 H3 L7.5 55.5 Z" fill={faded ? 'none' : ink} strokeWidth={faded ? 1.2 : 0} />
          <text x="50" y="59.4" textAnchor="middle" fill={faded ? FADED : PAPER} stroke="none" style={{ ...lab, fontSize: fit(name, 76, 10.5) }}>
            {name}
          </text>
          <text x="50" y="76" textAnchor="middle" fill={ink} stroke="none" style={{ ...lab, fontSize: fit(cap, 46, 6.8) }}>
            {cap}
          </text>
        </>
      )
    } else {
      body = (
        <>
          {arcs}
          {ring(look.ring, dash, ink)}
          <text fill={ink} stroke="none" style={{ ...lab, fontSize: fit(name, 96, 10.5) }}>
            <textPath href={`#t${uid}`} startOffset="50%" textAnchor="middle">
              {name}
            </textPath>
          </text>
          <text fill={ink} stroke="none" style={{ ...lab, fontSize: fit(cap, 76, 7.2) }}>
            <textPath href={`#b${uid}`} startOffset="50%" textAnchor="middle">
              {cap}
            </textPath>
          </text>
          <Star cx={14.5} cy={50} r={2.4} color={ink} />
          <Star cx={85.5} cy={50} r={2.4} color={ink} />
          {look.layout === 'big' ? (
            <>
              <text x="50" y="58.5" textAnchor="middle" fill={ink} stroke="none" style={{ ...num, fontSize: 25 }}>
                {look.big}
              </text>
              <path d="M30 64 H70" strokeWidth="1" />
            </>
          ) : (
            emblem(34.5, 34.5, 1.3)
          )}
        </>
      )
    }
  } else if (def.set === 'team') {
    if (look.layout === 'side') {
      // Emblem in its own panel on the left, the name stacked on the right.
      const lines = twoLines(name)
      const fs = Math.min(...lines.map((l) => fit(l, 40, 11)))
      const top = lines.length === 1 ? 52 : 46.5
      body = (
        <>
          {ring(look.ring, dash, ink)}
          {emblem(13.5, 35, 1.27)}
          <path d="M47 31 V69" strokeWidth="1" />
          {lines.map((l, i) => (
            <text key={l} x="69" y={top + i * (fs + 1.5)} textAnchor="middle" fill={ink} stroke="none" style={{ ...lab, fontSize: fs }}>
              {l}
            </text>
          ))}
          <text x="69" y="67" textAnchor="middle" fill={ink} stroke="none" style={{ ...lab, fontSize: fit(cap, 38, 6.2) }}>
            {cap}
          </text>
        </>
      )
    } else {
      body = (
        <>
          {ring(look.ring, dash, ink)}
          <text x="50" y="34.6" textAnchor="middle" fill={ink} stroke="none" style={{ ...lab, fontSize: fit(name, 70, 9.5) }}>
            {name}
          </text>
          <path d="M16 38 H84" strokeWidth="0.9" />
          {emblem(37.5, 39.2, 1.04)}
          <path d="M16 65.6 H84" strokeWidth="0.9" />
          <text x="50" y="72.6" textAnchor="middle" fill={ink} stroke="none" style={{ ...lab, fontSize: fit(cap, 66, 6.2) }}>
            {cap}
          </text>
        </>
      )
    }
  } else if (look.layout === 'side') {
    const lines = twoLines(name)
    const fs = Math.min(...lines.map((l) => fit(l, 36, 11)))
    body = (
      <>
        {ring(look.ring, dash, ink)}
        {emblem(14, 35.5, 1.2)}
        {lines.map((l, i) => (
          <text key={l} x="64" y={(lines.length === 1 ? 52 : 47) + i * (fs + 1.5)} textAnchor="middle" fill={ink} stroke="none" style={{ ...lab, fontSize: fs }}>
            {l}
          </text>
        ))}
        <text x="64" y="64" textAnchor="middle" fill={ink} stroke="none" style={{ ...lab, fontSize: fit(cap, 34, 5.8) }}>
          {cap}
        </text>
      </>
    )
  } else {
    body = (
      <>
        {ring(look.ring, dash, ink)}
        <text x="50" y="33" textAnchor="middle" fill={ink} stroke="none" style={{ ...lab, fontSize: fit(name, 50, 9.5) }}>
          {name}
        </text>
        {emblem(38.5, 36, 0.96)}
        <text x="50" y="69.5" textAnchor="middle" fill={ink} stroke="none" style={{ ...lab, fontSize: fit(cap, 48, 6) }}>
          {cap}
        </text>
      </>
    )
  }

  return (
    <svg
      className={className}
      style={{ mixBlendMode: faded ? undefined : 'multiply', ...style }}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={faded ? `${def.name}, not earned yet` : `${def.name}, ${tier}`}
    >
      {faded ? null : (
        <defs>
          <linearGradient id={`g${uid}`} gradientUnits="userSpaceOnUse" x1="10" y1="8" x2="90" y2="92">
            <stop offset="0" stopColor={FOIL[tier][0]} />
            <stop offset="0.5" stopColor={FOIL[tier][1]} />
            <stop offset="1" stopColor={FOIL[tier][2]} />
          </linearGradient>
          <filter id={`f${uid}`} x="-6%" y="-6%" width="112%" height="112%">
            <feTurbulence type="fractalNoise" baseFrequency="0.38" numOctaves="2" seed={(Math.abs(rot * 10) | 0) + 1} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.2 0 0 0 2.62" result="m" />
            <feComposite in="d" in2="m" operator="in" />
          </filter>
        </defs>
      )}
      <g transform={`rotate(${rot} 50 50)`} fill="none" stroke={ink} filter={faded ? undefined : `url(#f${uid})`} opacity={faded ? 0.9 : 0.95}>
        {body}
      </g>
    </svg>
  )
}
