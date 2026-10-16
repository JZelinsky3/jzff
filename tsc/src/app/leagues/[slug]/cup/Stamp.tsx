'use client'

// One Cup stamp, drawn as a rubber stamp would print it on the cream paper:
// a double border, the stamp's name, a big centre (the year it was earned),
// a caption. The shape says which set it's from (round seal for picks,
// rectangular postmark for teams, oval for the ones for laughs), the ink
// says how big it is (brass for the top honours). Mostly lettering, so no
// icon set to clash with the paper.
//
// The ink is broken up by a little noise so it reads as printed, not drawn;
// a stamp not earned yet is a faint dashed outline with no ink.

import { useId } from 'react'
import type { StampDef, StampInk } from '@/lib/cup/stamps'

const INK: Record<StampInk, string> = {
  red: '#b23a26',
  green: '#1f5a43',
  brass: '#8f6a26',
  slate: '#4d5563',
}
const FADED = '#b9ab86'

// A stamp is never pressed quite straight. Deterministic, so a reload
// doesn't shuffle the book.
function tilt(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return ((Math.abs(h) % 13) - 6) * 1.1
}

// Fit a name across `room` units in the condensed face.
function fit(text: string, room: number, max: number): number {
  return Math.min(max, room / (text.length * 0.56))
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

export function Stamp({
  def,
  center,
  caption,
  size = 84,
  faded = false,
  seed = '',
  className,
  style,
}: {
  def: StampDef
  // The big middle: the year, usually. Null draws a star (the catalogue).
  center: string | null
  caption: string
  size?: number
  faded?: boolean
  seed?: string
  className?: string
  style?: React.CSSProperties
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const ink = faded ? FADED : INK[def.ink]
  const name = def.name.toUpperCase()
  const cap = caption.toUpperCase()
  const num: React.CSSProperties = { fontFamily: 'var(--cp-num)', fontWeight: 700 }
  const lab: React.CSSProperties = { fontFamily: 'var(--cp-num)', fontWeight: 600, letterSpacing: '0.06em' }
  const rot = tilt(def.id + seed)
  const dash = faded ? '3.5 2.5' : undefined

  let body: React.ReactNode
  if (def.set === 'pick') {
    body = (
      <>
        <defs>
          <path id={`t${uid}`} d="M 18 50 A 32 32 0 0 1 82 50" />
          <path id={`b${uid}`} d="M 12.5 50 A 37.5 37.5 0 0 0 87.5 50" />
        </defs>
        <circle cx="50" cy="50" r="46" strokeWidth="3.4" strokeDasharray={dash} />
        <circle cx="50" cy="50" r="40.5" strokeWidth="1.2" />
        <text fill={ink} stroke="none" style={{ ...lab, fontSize: fit(name, 96, 10.5) }}>
          <textPath href={`#t${uid}`} startOffset="50%" textAnchor="middle">
            {name}
          </textPath>
        </text>
        <text fill={ink} stroke="none" style={{ ...lab, fontSize: fit(cap, 70, 7.5) }}>
          <textPath href={`#b${uid}`} startOffset="50%" textAnchor="middle">
            {cap}
          </textPath>
        </text>
        <Star cx={14.5} cy={50} r={2.6} color={ink} />
        <Star cx={85.5} cy={50} r={2.6} color={ink} />
        {center ? (
          <text x="50" y="57.5" textAnchor="middle" fill={ink} stroke="none" style={{ ...num, fontSize: 21 }}>
            {center}
          </text>
        ) : (
          <Star cx={50} cy={51} r={10} color={ink} />
        )}
      </>
    )
  } else if (def.set === 'team') {
    body = (
      <>
        <rect x="4" y="19" width="92" height="62" rx="3" strokeWidth="3.4" strokeDasharray={dash} />
        <rect x="9.5" y="24.5" width="81" height="51" rx="1.5" strokeWidth="1.2" />
        <text x="50" y="36.5" textAnchor="middle" fill={ink} stroke="none" style={{ ...lab, fontSize: fit(name, 74, 10.5) }}>
          {name}
        </text>
        <line x1="15" x2="85" y1="41" y2="41" strokeWidth="0.9" />
        {center ? (
          <text x="50" y="60" textAnchor="middle" fill={ink} stroke="none" style={{ ...num, fontSize: 20 }}>
            {center}
          </text>
        ) : (
          <Star cx={50} cy={53.5} r={8.5} color={ink} />
        )}
        <line x1="15" x2="85" y1="64.5" y2="64.5" strokeWidth="0.9" />
        <text x="50" y="72.5" textAnchor="middle" fill={ink} stroke="none" style={{ ...lab, fontSize: fit(cap, 70, 7) }}>
          {cap}
        </text>
      </>
    )
  } else {
    body = (
      <>
        <ellipse cx="50" cy="50" rx="47" ry="35" strokeWidth="3.2" strokeDasharray={dash} />
        <ellipse cx="50" cy="50" rx="41.5" ry="29.5" strokeWidth="1.1" />
        <text x="50" y="40" textAnchor="middle" fill={ink} stroke="none" style={{ ...lab, fontSize: fit(name, 62, 10) }}>
          {name}
        </text>
        {center ? (
          <text x="50" y="59" textAnchor="middle" fill={ink} stroke="none" style={{ ...num, fontSize: 17 }}>
            {center}
          </text>
        ) : (
          <Star cx={50} cy={53} r={7.5} color={ink} />
        )}
        <text x="50" y="69.5" textAnchor="middle" fill={ink} stroke="none" style={{ ...lab, fontSize: fit(cap, 46, 6.5) }}>
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
      aria-label={faded ? `${def.name}, not earned yet` : def.name}
    >
      {faded ? null : (
        <defs>
          <filter id={`f${uid}`} x="-6%" y="-6%" width="112%" height="112%">
            <feTurbulence type="fractalNoise" baseFrequency="0.38" numOctaves="2" seed={(Math.abs(rot * 10) | 0) + 1} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.2 0 0 0 2.62" result="m" />
            <feComposite in="d" in2="m" operator="in" />
          </filter>
        </defs>
      )}
      <g transform={`rotate(${rot} 50 50)`} fill="none" stroke={ink} filter={faded ? undefined : `url(#f${uid})`} opacity={faded ? 0.9 : 0.92}>
        {body}
      </g>
    </svg>
  )
}
