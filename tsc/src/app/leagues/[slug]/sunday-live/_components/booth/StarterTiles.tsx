'use client'

// Both teams' full lineups, side-by-side. Each starter renders as a tile with
// live points, projection, game state, and ON FIELD / RED ZONE / OUT tags.

import type { SlMatchup, SlPlayer, SlSide } from '@/lib/sundayLive/types'
import { fmtScore, initials } from '../../_lib/format'

export function StarterTiles({ matchup }: { matchup: SlMatchup }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SideColumn side={matchup.a} label="Home" />
      <SideColumn side={matchup.b} label="Away" />
    </div>
  )
}

function SideColumn({ side, label }: { side: SlSide; label: string }) {
  const starters = side.players.filter((p) => p.isStarter)
  return (
    <div className="sl-card overflow-hidden rounded-md">
      <div className="flex items-center justify-between border-b border-sl-edge-soft px-4 py-2.5">
        <div className="min-w-0">
          <div className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.24em] text-sl-dim">
            {label}
          </div>
          <div className="truncate text-sm font-semibold text-sl-cream">{side.teamName}</div>
        </div>
        <div className="sl-tnum sl-ff-serif text-2xl italic text-sl-ember">
          {fmtScore(side.score)}
        </div>
      </div>
      <ul className="flex flex-col">
        {starters.map((p, i) => (
          <li key={`${p.playerId}-${i}`} className="border-t border-sl-edge-soft first:border-t-0">
            <StarterRow p={p} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function StarterRow({ p }: { p: SlPlayer }) {
  const out = isOut(p.injuryStatus)
  const onField = p.game?.onField
  const inRZ = p.game?.inRedZone
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sl-stadium-hi text-[0.65rem] font-semibold text-sl-cream">
        {initials(p.name)}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-sl-cream">{p.name}</span>
          {out && (
            <span className="sl-ff-mono shrink-0 rounded-sm border border-sl-signal/40 bg-sl-signal/10 px-1 py-0.5 text-[0.5rem] uppercase tracking-[0.18em] text-sl-signal">
              {p.injuryStatus}
            </span>
          )}
          {inRZ && (
            <span className="sl-ff-mono shrink-0 rounded-sm border border-sl-ember/40 bg-sl-ember/10 px-1 py-0.5 text-[0.5rem] uppercase tracking-[0.18em] text-sl-ember">
              RZ
            </span>
          )}
          {onField && !inRZ && (
            <span className="sl-ff-mono shrink-0 rounded-sm border border-sl-cool/40 bg-sl-cool/10 px-1 py-0.5 text-[0.5rem] uppercase tracking-[0.18em] text-sl-cool">
              ON
            </span>
          )}
        </div>
        <div className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.18em] text-sl-dim">
          {p.slot} · {p.position} · {p.team ?? '—'} · {gameStateLabel(p)}
        </div>
      </div>
      <div className="text-right">
        <div className="sl-tnum text-base font-semibold text-sl-cream">{fmtScore(p.points)}</div>
        <div className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.18em] text-sl-dim">
          proj <span className="sl-tnum">{fmtScore(p.projected)}</span>
        </div>
      </div>
    </div>
  )
}

function isOut(s: string | null): boolean {
  if (!s) return false
  const u = s.toLowerCase()
  return u.startsWith('out') || u === 'ir' || u === 'pup' || u.startsWith('sus')
}

function gameStateLabel(p: SlPlayer): string {
  if (!p.game) return 'no game'
  if (p.game.state === 'pre') return 'pre-game'
  if (p.game.state === 'final') return 'final'
  return p.game.quarterClock ?? 'live'
}
