'use client'

// The last-five form as a real design, not a sentence: five W/L/T pills
// (most recent nearest the team's edge, padded with empty cells early in the
// season) plus the scoring pace across the stretch. Same visual language as
// the live-season form sheet on the league site. One strip per team sits
// above the game notes on the featured card; FormRow composes the pair.

import type { SlSideForm } from '@/lib/sundayLive/seasonContext'
import { fmtPts } from '../../_lib/format'

// Bare letters, no cells: wins in the banner ink (brass at night, blue in
// the day world); losses, ties, and the PPG line share --sl-form-l (muted
// on the night plate, black in daylight).
function letterStyle(v: 'W' | 'L' | 'T' | null): React.CSSProperties {
  if (v === 'W') return { color: 'var(--sl-banner, var(--sl-gold))' }
  if (v === 'L' || v === 'T') return { color: 'var(--sl-form-l, var(--sl-mute))' }
  return { color: 'var(--sl-dim)' }
}

// `stacked` puts the PPG line under the letters (the featured card's side
// column); the default keeps them side by side.
export function FormStrip({
  form,
  align,
  stacked,
}: {
  form: SlSideForm
  align: 'left' | 'right'
  stacked?: boolean
}) {
  const right = align === 'right'
  // Most recent result first, padded out to five cells; the row is mirrored
  // on the right side so recent games sit nearest that team's edge.
  const cells: Array<'W' | 'L' | 'T' | null> = [...form.results].reverse().slice(0, 5)
  while (cells.length < 5) cells.push(null)
  const letters = (
    <span className={`inline-flex gap-[3px] ${right ? 'flex-row-reverse' : ''}`}>
      {cells.map((v, i) => (
        <span
          key={i}
          className="font-sans text-[10.5px] font-extrabold leading-none"
          style={letterStyle(v)}
        >
          {v ?? '·'}
        </span>
      ))}
    </span>
  )
  const ppg = (
    <span
      className="sl-num text-[10.5px] leading-none"
      style={{ color: 'var(--sl-form-l, var(--sl-mute))' }}
    >
      {fmtPts(form.ppg)} PPG
    </span>
  )
  if (stacked) {
    // A small plate: near-void navy at night (white paper felt off-theme),
    // the tan wash in daylight. It reads as a recessed well, not a sticker:
    // clearly deeper than the card behind it, an inset shadow pooling under
    // the top edge, and a faint lit lip along the bottom. Both sides read
    // the SAME direction, oldest on the left through the newest on the
    // right; mirroring only made sense when the two strips faced each other
    // across the card.
    const seq: Array<'W' | 'L' | 'T' | null> = form.results.slice(-5)
    while (seq.length < 5) seq.unshift(null)
    return (
      <span
        className={`sl-tip relative inline-flex flex-col gap-1.5 rounded-[3px] border border-sl-line px-2.5 py-2 ${right ? 'items-end' : 'items-start'}`}
        style={{
          background: 'var(--sl-form-bg, color-mix(in srgb, var(--sl-navy-2) 45%, var(--sl-void)))',
          boxShadow:
            'var(--sl-form-shadow, inset 0 1px 4px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(238, 241, 230, 0.05))',
        }}
        data-tip="Last five results and scoring pace, oldest to newest"
      >
        <span className="inline-flex gap-[3px]">
          {seq.map((v, i) => (
            <span
              key={i}
              className="font-sans text-[10.5px] font-extrabold leading-none"
              style={letterStyle(v)}
            >
              {v ?? '·'}
            </span>
          ))}
        </span>
        {ppg}
      </span>
    )
  }
  return (
    <span
      className={`sl-tip relative inline-flex items-center gap-2.5 ${right ? 'flex-row-reverse' : ''}`}
      data-tip="Last five results and scoring pace"
    >
      {letters}
      {ppg}
    </span>
  )
}

// Team A's form on the left, team B's on the right, the label holding the
// center line between them. Renders nothing until form exists (early season
// or a league without history).
export function FormRow({ formA, formB }: { formA: SlSideForm | null; formB: SlSideForm | null }) {
  if (!formA && !formB) return null
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="min-w-0">{formA && <FormStrip form={formA} align="left" />}</span>
      <span className="sl-kicker shrink-0 text-[10px]!">LAST FIVE</span>
      <span className="min-w-0">{formB && <FormStrip form={formB} align="right" />}</span>
    </div>
  )
}
