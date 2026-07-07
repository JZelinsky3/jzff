'use client'

// CONCEPT: color worlds. The same produced scorebug rendered under both
// palettes at once, plus the PICK'EMS MARK candidates Joey is choosing
// between. Works by overriding the --sl-* / --color-sl-* custom properties
// on each card's wrapper: every sl- class and Tailwind sl utility underneath
// re-resolves to the new world, so what you see is exactly what the whole
// desk would look like re-skinned.

import type { CSSProperties } from 'react'
import type { SlLeague, SlMatchup, SlSide } from '@/lib/sundayLive/types'
import { Avatar } from '../desk/Scorebug'
import { AvatarBanner } from '../desk/FeaturedSide'
import { fmtPct, fmtPts } from '../../_lib/format'
import { WORLDS, type World } from './worlds'

/* ── The power banner, at every notch of the ladder ──────────── */

function PowerBench({ m }: { m: SlMatchup }) {
  const ranks = [1, 3, 8, 12]
  return (
    <div className="sl-panel mt-3 overflow-hidden">
      <div className="sl-slate">
        <span className="sl-kicker text-sl-gold!">THE POWER BANNER</span>
      </div>
      <div className="flex flex-wrap items-start gap-6 px-4 py-3.5">
        {ranks.map((r) => (
          <AvatarBanner key={`a${r}`} side={m.a} power={r} px={56} />
        ))}
        {ranks.map((r) => (
          <AvatarBanner key={`b${r}`} side={m.b} power={r} px={56} />
        ))}
      </div>
    </div>
  )
}

/* ── Pick'ems mark candidates (pick one, it ships everywhere) ── */

const PICK_ICONS: Array<{ id: string; name: string; svg: React.ReactNode }> = [
  {
    id: 'ballot',
    name: 'Ballot box',
    svg: (
      <>
        <rect x="1.6" y="5" width="8.8" height="6" rx="1" />
        <rect x="4.6" y="4.2" width="2.8" height="1.2" rx="0.4" fill="var(--sl-panel)" />
        <path d="M4.4 4.6 L5.4 0.9 L8.6 1.8 L7.6 4.6 Z" opacity="0.75" />
      </>
    ),
  },
  {
    id: 'rosette',
    name: 'Rosette',
    svg: (
      <>
        <circle cx="6" cy="4.6" r="2.1" />
        <g opacity="0.75">
          <circle cx="6" cy="1.9" r="0.9" />
          <circle cx="8.3" cy="3.2" r="0.9" />
          <circle cx="8.3" cy="6" r="0.9" />
          <circle cx="6" cy="7.3" r="0.9" />
          <circle cx="3.7" cy="6" r="0.9" />
          <circle cx="3.7" cy="3.2" r="0.9" />
        </g>
        <path d="M4.6 7.6 L4 11.2 L6 9.9 L8 11.2 L7.4 7.6 Z" opacity="0.8" />
      </>
    ),
  },
  {
    id: 'checkbox',
    name: 'Checkbox',
    svg: (
      <>
        <rect x="1.4" y="1.4" width="9.2" height="9.2" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3.6 6.2 L5.3 8 L8.6 4.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: 'ticket',
    name: 'Ticket',
    svg: (
      <>
        <path d="M1.4 3 H10.6 V5 A1.4 1.4 0 0 0 10.6 7.8 V9.8 H1.4 V7.8 A1.4 1.4 0 0 0 1.4 5 Z" />
        <line x1="7.6" y1="3.4" x2="7.6" y2="9.4" stroke="var(--sl-panel)" strokeWidth="0.9" strokeDasharray="1.3 1.1" />
      </>
    ),
  },
  {
    id: 'votex',
    name: 'Vote X',
    svg: (
      <>
        <rect x="1.4" y="1.4" width="9.2" height="9.2" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 4 L8 8 M8 4 L4 8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
  },
]

function PickMarkBench() {
  return (
    <div className="sl-panel overflow-hidden">
      <div className="sl-slate">
        <span className="sl-kicker" style={{ color: 'var(--sl-pick)' }}>
          PICK&apos;EMS MARK CANDIDATES
        </span>
      </div>
      <div className="space-y-2.5 px-4 py-3.5">
        {PICK_ICONS.map((icon, i) => (
          <div key={icon.id} className="flex items-center gap-3.5">
            <span className="sl-num w-3 shrink-0 text-[11px] text-sl-dim">{i + 1}</span>
            <span className="w-20 shrink-0 text-[11px] text-sl-mute">{icon.name}</span>
            <span
              className="inline-flex items-center gap-[5px] rounded-[3px] border px-[6px] py-[3px]"
              style={{
                color: 'var(--sl-pick)',
                borderColor: 'color-mix(in srgb, var(--sl-pick) 50%, transparent)',
                background: 'color-mix(in srgb, var(--sl-pick) 10%, transparent)',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
                {icon.svg}
              </svg>
              <span className="sl-num text-[11px] font-bold leading-none">7-5 RICCI</span>
            </span>
            <svg width="22" height="22" viewBox="0 0 12 12" fill="currentColor" style={{ color: 'var(--sl-pick)' }} aria-hidden>
              {icon.svg}
            </svg>
          </div>
        ))}
      </div>
    </div>
  )
}

function BugSide({ side, winning }: { side: SlSide; winning: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar side={side} px={30} />
      <div className="min-w-0 flex-1">
        <div className={`sl-display truncate text-[16px] ${winning ? 'text-sl-text' : 'text-sl-mute'}`}>
          {side.teamName}
        </div>
        <div className="truncate text-[10.5px] text-sl-dim">{side.ownerName}</div>
      </div>
      <span className={`sl-num text-[26px] leading-none ${winning ? 'text-sl-glow' : 'text-sl-dim'}`}>
        {fmtPts(side.score)}
      </span>
    </div>
  )
}

function WorldCard({ world, m }: { world: World; m: SlMatchup }) {
  const aWinning = m.a.score >= m.b.score
  return (
    <div style={world.vars as CSSProperties}>
      <div className="rounded border border-sl-line bg-sl-void p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="sl-display text-[15px] text-sl-text">{world.name}</span>
          <span className="text-[10.5px] text-sl-dim">{world.why}</span>
        </div>
        <div className="sl-panel-raised mb-3 space-y-2.5 p-4">
          <div className="flex items-center justify-between">
            <span className="sl-kicker text-sl-electric!">FEATURED GAME</span>
            <span className="sl-chip border-sl-live/40 text-sl-live!">LIVE</span>
          </div>
          <BugSide side={m.a} winning={aWinning} />
          <BugSide side={m.b} winning={!aWinning} />
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="sl-num text-[11px] text-sl-glow">{fmtPct(m.a.wp)}</span>
              <span className="sl-kicker">WIN PROBABILITY</span>
              <span className="sl-num text-[11px] text-sl-mute">{fmtPct(1 - m.a.wp)}</span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-gradient-to-r from-sl-glow to-sl-electric"
                style={{ width: `${Math.round(m.a.wp * 100)}%` }}
              />
              <div className="w-px shrink-0" style={{ background: 'rgba(249, 243, 226, 0.9)' }} />
              <div className="sl-meter-b flex-1" />
            </div>
          </div>
        </div>
        <PickMarkBench />
        <PowerBench m={m} />
      </div>
    </div>
  )
}

export function PaletteLab({ frame }: { frame: SlLeague }) {
  const m = [...frame.matchups].sort((a, b) => b.sweatIndex - a.sweatIndex)[0]
  if (!m) return null
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {WORLDS.map((world) => (
        <WorldCard key={world.name} world={world} m={m} />
      ))}
    </div>
  )
}
