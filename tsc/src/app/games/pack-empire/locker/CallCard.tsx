'use client'

// A play call: the card in a deck that isn't a man. The same size and cost hex as a
// LockerCard, on chalkboard rather than foil, so a hand reads at a glance.

import type { FgCall } from '@/lib/packEmpire/locker/calls'

export function CallCard({ call, state, onClick, label }: { call: FgCall; state?: 'off'; onClick?: () => void; label?: string }) {
  const inner = (
    <>
      <span className="pe-lkc-in">
        <span className="pe-lkc-top">
          <span className="pe-lkc-pos">Play</span>
          {call.ongoing && <span className="pe-lkc-year">Stays</span>}
        </span>
        <span className="pe-lkc-board" aria-hidden>
          <svg viewBox="0 0 60 34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="26" r="3.4" />
            <path d="M26 22.500l5 5m0-5-5 5" />
            <circle cx="46" cy="26" r="3.4" />
            <path d="M11 21c0-8 8-8 13-11" strokeDasharray="2 3" />
            <path d="M46 21V9c0-2-1-3-3-3H34" />
            <path d="m37 3-3.500 3 3.500 3" />
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
  const props = { className: 'pe-lkc', 'data-r': 'call', 'data-state': state }
  return onClick ? (
    <button type="button" {...props} onClick={onClick} aria-label={label ?? `${call.title}, costs ${call.cost}. ${call.line}`}>
      {inner}
    </button>
  ) : (
    <div {...props}>{inner}</div>
  )
}
