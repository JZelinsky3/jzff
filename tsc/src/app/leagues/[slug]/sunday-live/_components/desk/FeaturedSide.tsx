'use client'

// One team's half of a featured game, shared by the desk stage, the lab's
// command center, and the game room hero. Layout per Joey (2026-07-04):
// the avatar wears the power rank as a banner (gold ring, pennant tail
// hanging beneath with the rank inked in it); owner and record on one line
// under the team name; the pick'ems ticket under that. Players-remaining
// moved into the box score itself (the slot cell lights by game state), so
// the card carries no pip row. The league's pick'ems favorite wears a
// starred seal beside its team name, which survives the final so you can
// always check the crowd against the result.

import type { SlLeague, SlMatchup, SlSide } from '@/lib/sundayLive/types'
import type { SlSideForm, SlWeekContext } from '@/lib/sundayLive/seasonContext'
import { Avatar } from './Scorebug'
import { FormStrip } from './FormStrip'

// Entering-week standings by rosterId (win pct, then wins, then PF: the same
// tiebreak the scenario machine uses), for the small rank beside team names.
export function standingsRanks(frame: SlLeague, wc: SlWeekContext | null): Map<number, number> {
  if (!wc) return new Map()
  const rows: Array<{ rosterId: number; w: number; l: number; t: number; pf: number }> = []
  for (const m of frame.matchups) {
    const c = wc.matchups[m.matchupId]
    if (!c) continue
    for (const [s, rec, pf] of [
      [m.a, c.recordA, c.pfA],
      [m.b, c.recordB, c.pfB],
    ] as const) {
      const p = (rec ?? '').split('-').map(Number)
      if (p.length < 2 || p.some(Number.isNaN)) continue
      rows.push({ rosterId: s.rosterId, w: p[0], l: p[1], t: p[2] ?? 0, pf: pf ?? 0 })
    }
  }
  const pct = (r: (typeof rows)[number]) => (r.w + r.t * 0.5) / Math.max(1, r.w + r.l + r.t)
  rows.sort((x, y) => pct(y) - pct(x) || y.w - x.w || y.pf - x.pf)
  return new Map(rows.map((r, i) => [r.rosterId, i + 1]))
}

function ordinal(n: number): string {
  const rem10 = n % 10
  const rem100 = n % 100
  if (rem10 === 1 && rem100 !== 11) return `${n}st`
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`
  return `${n}th`
}

// Exact per-side counts when the voter lists rode along, else derived.
export function voteCounts(m: SlMatchup): { a: number; b: number } | null {
  const pk = m.pickems
  if (!pk || pk.totalVotes === 0) return null
  const a = pk.votersA?.length ?? Math.round((pk.pctA / 100) * pk.totalVotes)
  return { a, b: pk.totalVotes - a }
}

export function pickedSide(m: SlMatchup): 'A' | 'B' | null {
  const v = voteCounts(m)
  if (!v || v.a === v.b) return null
  return v.a > v.b ? 'A' : 'B'
}

function TicketIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="M1.4 3 H10.6 V5 A1.4 1.4 0 0 0 10.6 7.8 V9.8 H1.4 V7.8 A1.4 1.4 0 0 0 1.4 5 Z" />
      <line x1="7.6" y1="3.4" x2="7.6" y2="9.4" stroke="var(--sl-panel)" strokeWidth="0.9" strokeDasharray="1.3 1.1" />
    </svg>
  )
}

// The ballots this side holds: a paper ticket, cream stock with blue ink
// (inverse of a filled chip, per Joey). The favorite's prints solid blue.
const VOTE_PAPER = '#f4eede'
const VOTE_INK = 'var(--sl-navy)'

export function VoteTicket({ votes, picked, ownerName }: { votes: number; picked: boolean; ownerName: string }) {
  return (
    <span
      className="sl-tip relative inline-flex items-center gap-[4px] rounded-[3px] border px-[6px] py-[3px]"
      style={
        picked
          ? { background: VOTE_INK, borderColor: VOTE_INK, color: VOTE_PAPER }
          : {
              background: VOTE_PAPER,
              borderColor: `color-mix(in srgb, ${VOTE_INK} 45%, ${VOTE_PAPER})`,
              color: VOTE_INK,
            }
      }
      data-tip={`${votes} pick'em ${votes === 1 ? 'ballot' : 'ballots'} on ${ownerName}${picked ? ", the league's pick" : ''}`}
    >
      <TicketIcon />
      <span className="sl-num text-[11px] font-bold leading-none">{votes}</span>
    </span>
  )
}

// The league's pick, a starred seal on the avatar's OUTER top corner (team
// A wears it top-left, team B top-right), riding above the power banner.
function PickSeal({ right }: { right?: boolean }) {
  return (
    <span
      className={`sl-tip absolute -top-1.5 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full ${right ? '-right-1.5' : '-left-1.5'}`}
      style={{
        background: VOTE_INK,
        boxShadow: `0 0 0 2px ${VOTE_PAPER}`,
        color: VOTE_PAPER,
      }}
      data-tip="The league's pick"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
        <path d="M6 0.8 L7.5 4.1 L11.1 4.5 L8.4 6.9 L9.2 10.5 L6 8.6 L2.8 10.5 L3.6 6.9 L0.9 4.5 L4.5 4.1 Z" />
      </svg>
    </span>
  )
}

// Rank as a roman numeral: the banner reads like an engraved plate, and the
// league maxes out around XII so nothing runs unreasonably wide.
export function toRoman(n: number): string {
  const map: Array<[number, string]> = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  let left = Math.max(1, Math.round(n))
  while (left > 0) {
    for (const [v, s] of map) {
      if (left >= v) {
        out += s
        left -= v
        break
      }
    }
  }
  return out
}

// The avatar wearing its rank: one continuous banner. The frame around the
// picture and the pennant tail below are a single clipped shape (top-lit
// gradient, cream keyline hugging the avatar, engraved outline, soft glow),
// with the rank in roman numerals, cream on the banner color, flanked by
// cream diamonds. The banner color is themeable: gold by default, and the
// day world repaints it almanac blue via --sl-banner. Teams without a
// ranking just show the plain avatar. `display` overrides the tail text.
const BANNER = 'var(--sl-banner, var(--sl-gold))'
const BANNER_INK = '#fdf8ea'

export function AvatarBanner({
  side,
  power,
  px,
  display,
}: {
  side: SlSide
  power: number | null
  px: number
  display?: string
}) {
  if (power == null) return <Avatar side={side} px={px} />
  const frame = 4.5
  const w = px + frame * 2
  // The straight sides run a full frame's worth past the avatar before the
  // point begins, so the band under the picture holds its thickness into
  // the corners instead of pinching to nothing.
  const rectH = px + frame * 2
  const tailH = Math.max(22, Math.round(px * 0.3))
  const h = rectH + tailH
  return (
    <span
      className="sl-tip relative inline-flex flex-col items-center"
      style={{
        width: w,
        height: h,
        filter: `drop-shadow(0 2px 5px color-mix(in srgb, ${BANNER} 20%, transparent))`,
      }}
      data-tip={`Power ranking: No. ${power}`}
    >
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${BANNER} 0%, ${BANNER} 55%, color-mix(in srgb, ${BANNER} 82%, var(--sl-void)) 100%)`,
          clipPath: `polygon(0 0, ${w}px 0, ${w}px ${rectH}px, ${w / 2}px ${h}px, 0 ${rectH}px)`,
        }}
      />
      {/* Engraved hairline tracing the whole banner just inside its edge */}
      <svg aria-hidden className="absolute inset-0" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <polygon
          points={`1.2,1.2 ${w - 1.2},1.2 ${w - 1.2},${rectH - 0.5} ${w / 2},${h - 1.8} 1.2,${rectH - 0.5}`}
          fill="none"
          stroke="rgba(255, 248, 224, 0.55)"
          strokeWidth="1"
        />
      </svg>
      {/* Whisper-thin cream keyline as the innermost layer */}
      <span
        className="relative rounded-[3px]"
        style={{ marginTop: frame, boxShadow: `0 0 0 1px color-mix(in srgb, ${BANNER_INK} 75%, transparent)` }}
      >
        <Avatar side={side} px={px} />
      </span>
      <span className="relative flex flex-1 items-center gap-[5px]" style={{ paddingBottom: Math.round(tailH * 0.3) }}>
        <span aria-hidden className="h-[3px] w-[3px] rotate-45" style={{ background: BANNER_INK }} />
        <span
          className="sl-display text-[13px] leading-none tracking-[0.04em]"
          style={{
            color: BANNER_INK,
            textShadow: '0 1px 1px rgba(30, 24, 8, 0.55)',
            // DM Serif capitals run thin at this size; a whisper of stroke
            // gives the numerals the same weight as the banner.
            WebkitTextStroke: `0.4px ${BANNER_INK}`,
          }}
        >
          {display ?? toRoman(power)}
        </span>
        <span aria-hidden className="h-[3px] w-[3px] rotate-45" style={{ background: BANNER_INK }} />
      </span>
    </span>
  )
}

export function FeaturedSide({
  side,
  dim,
  record,
  power,
  votes,
  picked,
  form,
  standing,
  right,
  avatarPx = 76,
  namePx = 24,
}: {
  side: SlSide
  // Only a decided game dims its loser; while live both sides read equal.
  dim: boolean
  record: string | null
  power: number | null
  votes: number | null
  picked: boolean
  form: SlSideForm | null
  // Entering-week standings position, worn small beside the team name.
  standing?: number | null
  right?: boolean
  avatarPx?: number
  namePx?: number
}) {
  const standingMark =
    standing != null ? (
      <span
        className="sl-tip relative sl-num align-middle text-[10px] font-semibold leading-none text-sl-dim"
        data-tip={`${ordinal(standing)} in the standings`}
      >
        {ordinal(standing)}
      </span>
    ) : null
  return (
    <div className={right ? 'text-right' : 'text-left'}>
      {/* The name is the marquee line: full side width above the avatar so
          long names rarely wrap and never shrink. Standing sits on the
          outer edge. */}
      <div
        className={`sl-display line-clamp-2 leading-[1.12] ${dim ? 'text-sl-mute' : ''}`}
        style={{
          fontSize: namePx,
          // Headings go ink-navy in the day world, cream at night.
          color: dim ? undefined : 'var(--sl-heading, var(--sl-text))',
        }}
      >
        {!right && standingMark && <>{standingMark} </>}
        {side.teamName}
        {right && standingMark && <> {standingMark}</>}
      </div>
      <div className={`mt-2.5 flex items-start gap-3.5 ${right ? 'flex-row-reverse' : ''}`}>
        <span className="relative shrink-0">
          <AvatarBanner side={side} power={power} px={avatarPx} />
          {picked && <PickSeal right={right} />}
        </span>
        <div className="min-w-0 flex-1">
          {/* Record rides the outer flank: name-then-record on team A,
              record-then-name on team B. */}
          <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 ${right ? 'justify-end' : ''}`}>
            {right && record && (
              <span className="sl-num text-[13px] leading-none text-sl-text">{record}</span>
            )}
            <span className="truncate text-[12px] text-sl-mute">{side.ownerName}</span>
            {!right && record && (
              <span className="sl-num text-[13px] leading-none text-sl-text">{record}</span>
            )}
          </div>
          {form && (
            <div className={`mt-1 flex ${right ? 'justify-end' : ''}`}>
              <FormStrip form={form} align={right ? 'right' : 'left'} stacked />
            </div>
          )}
          {votes != null && (
            <div className={`mt-2.5 flex ${right ? 'justify-end' : ''}`}>
              <VoteTicket votes={votes} picked={picked} ownerName={side.ownerName} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
