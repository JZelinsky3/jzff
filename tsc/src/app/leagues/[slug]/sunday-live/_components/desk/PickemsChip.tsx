'use client'

// The pick'ems presence on a featured game, in the pick'ems rose:
// - PickemsChip: a small badge for the card header. Reads the count and the
//   league's pick ("8-4 CAT"), flips to "SWEATING" when the majority pick is
//   in trouble (upset brewing or a heavy favorite losing).
// - ConsensusMark: a rose diamond pinned under the win-probability bar at the
//   league's consensus percentage, so crowd expectation and live reality sit
//   on the same axis. Full ballots (names, best pickers) live on The Ballot.

import type { SlMatchup } from '@/lib/sundayLive/types'

function voteSplit(m: SlMatchup): { aV: number; bV: number } | null {
  const pk = m.pickems
  if (!pk || pk.totalVotes === 0) return null
  const aV = pk.votersA?.length ?? Math.round((pk.pctA / 100) * pk.totalVotes)
  return { aV, bV: pk.totalVotes - aV }
}

export function PickemsChip({ m }: { m: SlMatchup }) {
  const pk = m.pickems
  const split = voteSplit(m)
  if (!pk || !split) return null
  const { aV, bV } = split
  const fav = aV >= bV ? m.a.ownerName : m.b.ownerName
  const inTrouble = pk.variant === 'upset-alert' || pk.variant === 'consensus-cold'
  const label =
    aV === bV
      ? `SPLIT ${aV}-${bV}`
      : `${Math.max(aV, bV)}-${Math.min(aV, bV)} ${inTrouble ? 'SWEATING' : fav.toUpperCase()}`
  return (
    <span
      className="sl-chip"
      style={{
        color: 'var(--sl-pick)',
        borderColor: 'color-mix(in srgb, var(--sl-pick) 45%, transparent)',
        background: 'color-mix(in srgb, var(--sl-pick) 10%, transparent)',
      }}
      title={`Pick'ems: ${aV} took ${m.a.ownerName}, ${bV} took ${m.b.ownerName}`}
    >
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
        <rect x="2" y="2" width="6" height="6" rx="1" transform="rotate(45 5 5)" fill="var(--sl-pick)" />
      </svg>
      {label}
    </span>
  )
}

export function ConsensusMark({ m }: { m: SlMatchup }) {
  const pk = m.pickems
  const split = voteSplit(m)
  if (!pk || !split) return null
  const fav = pk.pctA >= 50 ? m.a.ownerName : m.b.ownerName
  const pct = Math.round(pk.pctA >= 50 ? pk.pctA : 100 - pk.pctA)
  return (
    <span
      className="absolute -bottom-[5px] -translate-x-1/2"
      style={{ left: `${Math.min(97, Math.max(3, pk.pctA))}%` }}
      title={`The league's line: ${pct}% took ${fav}`}
    >
      <span
        className="block h-[6px] w-[6px] rotate-45 rounded-[1px]"
        style={{ background: 'var(--sl-pick)' }}
      />
    </span>
  )
}
