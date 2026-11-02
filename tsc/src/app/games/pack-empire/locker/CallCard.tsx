'use client'

// A play call: the card in a deck that isn't a player. The same size and cost hex as a
// LockerCard, on chalkboard rather than foil, so a hand reads at a glance. What's drawn
// on the board says what kind of thing it does, and the colour says who it's aimed at:
// teal builds your side, red goes after theirs, amber is tempo, and blue draws cards.

import type { FgCall } from '@/lib/packEmpire/locker/calls'

type Kind = 'offense' | 'defense' | 'tempo' | 'draw'

/** A route on a whiteboard: the plays that score. */
const ROUTE = (
  <>
    <circle cx="11" cy="26" r="3.400" />
    <path d="M26 22.500l5 5m0-5-5 5" />
    <circle cx="46" cy="26" r="3.400" />
    <path d="M11 21c0-8 8-8 13-11" strokeDasharray="2 3" />
    <path d="M46 21V9c0-2-1-3-3-3H34" />
    <path d="m37 3-3.500 3 3.500 3" />
  </>
)

const ART: Record<string, { kind: Kind; art: React.ReactNode }> = {
  'call:film-study': {
    kind: 'draw',
    art: (
      <>
        <rect x="10" y="6" width="40" height="22" rx="2" />
        <path d="M10 11h40M10 23h40M15 6v5M22 6v5M29 6v5M36 6v5M43 6v5M15 23v5M22 23v5M29 23v5M36 23v5M43 23v5" />
        <path d="M27 13.500v7l6-3.500z" fill="currentColor" stroke="none" />
      </>
    ),
  },
  'call:ice-the-kicker': {
    kind: 'defense',
    art: (
      <>
        <path d="M17 31V21M8 21h18M8 21V5M26 21V5" />
        <path d="M45 7v20M36.300 12l17.400 10M36.300 22l17.400-10" />
        <path d="m42 9 3 3 3-3M42 25l3-3 3 3" />
      </>
    ),
  },
  'call:game-plan': {
    kind: 'offense',
    art: (
      <>
        <rect x="18" y="6" width="24" height="26" rx="2" />
        <path d="M25 6V3h10v3" />
        <path d="m23 13 4 4m0-4-4 4" />
        <circle cx="35" cy="15" r="2.400" />
        <path d="M23 25c4 0 7-2 8-6M29 19h2.400v2.400" />
      </>
    ),
  },
  'call:spike-it': {
    kind: 'tempo',
    art: (
      <>
        <ellipse cx="30" cy="13" rx="6" ry="10" />
        <path d="M30 8v10M27.800 11h4.400M27.800 15h4.400" />
        <path d="M12 31h36M19 28l-4-4M41 28l4-4M23 27l-2-4M37 27l2-4" />
      </>
    ),
  },
  'call:hard-count': {
    kind: 'defense',
    art: (
      <>
        <circle cx="30" cy="17" r="12" />
        <path d="m21.500 8.500 17 17" />
        <path d="M8 6v22M52 6v22" strokeDasharray="3 3" />
      </>
    ),
  },
  'call:audible': {
    kind: 'tempo',
    art: (
      <>
        <path d="M10 12h36" />
        <path d="m41 7 5 5-5 5" />
        <path d="M50 24H14" />
        <path d="m19 19-5 5 5 5" />
      </>
    ),
  },
  'call:turnover': {
    kind: 'defense',
    art: (
      <>
        <path d="M18 17c5-8 19-8 24 0-5 8-19 8-24 0Z" />
        <path d="M26 17h8M28 15.200v3.600M30 15.200v3.600M32 15.200v3.600" />
        <path d="M8 12C13 4 24 2 33 5" />
        <path d="m29 1 4 4-5 2" />
        <path d="M52 22c-5 8-16 10-25 7" />
        <path d="m31 33-4-4 5-2" />
      </>
    ),
  },
  'call:blitz': {
    kind: 'defense',
    art: (
      <>
        <path d="m9 4 4 4m0-4-4 4M28 3l4 4m0-4-4 4M47 4l4 4m0-4-4 4" />
        <path d="M13 11 25 23M30 10v13M47 11 35 23" />
        <path d="M25 18v5h-5M26.500 20l3.500 3.500 3.500-3.500M35 18v5h5" />
        <circle cx="30" cy="29" r="3.200" />
      </>
    ),
  },
  'call:goal-line-stand': {
    kind: 'offense',
    art: (
      <>
        <path d="M4 16h52" strokeDasharray="5 3" />
        <circle cx="13" cy="24" r="3.200" />
        <circle cx="30" cy="24" r="3.200" />
        <circle cx="47" cy="24" r="3.200" />
        <path d="M30 2v9" />
        <path d="m26 7 4 4 4-4" />
      </>
    ),
  },
}

export function CallCard({ call, state, onClick, label }: { call: FgCall; state?: 'off'; onClick?: () => void; label?: string }) {
  const look = ART[call.id]
  const inner = (
    <>
      <span className="pe-lkc-in">
        <span className="pe-lkc-top">
          <span className="pe-lkc-pos">Play</span>
          {call.ongoing && <span className="pe-lkc-year">Stays</span>}
        </span>
        <span className="pe-lkc-board" aria-hidden>
          <svg viewBox="0 0 60 34" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinecap="round" strokeLinejoin="round">
            {look?.art ?? ROUTE}
          </svg>
        </span>
        <span className="pe-lkc-call">
          <b>{call.title}</b>
          <span>{call.line}</span>
        </span>
      </span>
      <span className="pe-lkc-cost">{call.cost}</span>
    </>
  )
  const props = { className: 'pe-lkc', 'data-r': 'call', 'data-kind': look?.kind ?? 'offense', 'data-state': state }
  return onClick ? (
    <button type="button" {...props} onClick={onClick} aria-label={label ?? `${call.title}, costs ${call.cost}. ${call.line}`}>
      {inner}
    </button>
  ) : (
    <div {...props}>{inner}</div>
  )
}
