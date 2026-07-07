'use client'

// Players-remaining pips: one cell per starter, lit while their game is still
// to come, dark once it's played out. Two flavors:
// - plain (total/left counts): tiny cells for tight cards like the wall
// - labeled (players list): each cell carries the player's position (QB, RB,
//   WR, TE, K, DEF) and the exact starters still to play light up, so the
//   row reads "which positions are left", not just how many
// Right-aligned sides mirror so team blocks stay symmetrical.

import type { SlPlayer } from '@/lib/sundayLive/types'

// The cells mirror the league's lineup settings: dedicated slots read as
// their position, true flex slots (FLEX, SUPER_FLEX, W/R/T, RB/WR ...) read
// FLX/SFX so members know that spot itself is changeable. A plain WR slot is
// NOT flex: only FLEX-family labels and slashed multi-position slots count.
function posLabel(p: SlPlayer): string {
  const slot = (p.slot ?? '').toUpperCase()
  if (slot.includes('SUPER')) return 'SFX'
  const isDst = slot === 'DEF' || slot === 'DST' || slot === 'D/ST'
  if (!isDst && (slot.includes('FLEX') || (slot.includes('/') && !slot.includes('ST')))) return 'FLX'
  const s = (p.position ?? slot ?? '?').toUpperCase()
  if (s === 'PK') return 'K'
  if (s === 'DST' || s === 'D/ST' || s === 'DEF') return 'DEF'
  if (s.length > 3) return s.slice(0, 3)
  return s
}

// Still to play = the player's NFL game hasn't finished. No game at all
// (bye, free agent slot) counts as done: nothing left to sweat.
function stillToPlay(p: SlPlayer): boolean {
  return p.game != null && p.game.state !== 'final'
}

export function PlayerPips({
  total = 0,
  left = 0,
  players,
  align = 'left',
}: {
  total?: number
  left?: number
  players?: SlPlayer[]
  align?: 'left' | 'right'
}) {
  if (players && players.length > 0) {
    const remaining = players.filter(stillToPlay).length
    return (
      <span
        className={`inline-flex flex-wrap items-center gap-[3px] ${align === 'right' ? 'flex-row-reverse' : ''}`}
        title={`${remaining} of ${players.length} still to play`}
        role="img"
        aria-label={`${remaining} of ${players.length} players still to play`}
      >
        {players.map((p) => {
          const lit = stillToPlay(p)
          return (
            <span
              key={p.playerId}
              className={`flex h-[16px] min-w-[19px] items-center justify-center rounded-[2px] px-[3px] font-sans text-[7px] font-extrabold leading-none ${
                lit ? 'bg-sl-glow text-sl-void shadow-[0_0_5px_rgba(232,199,120,0.4)]' : ''
              }`}
              style={
                lit
                  ? undefined
                  : {
                      // Played: barely a shade off the surface itself, with a
                      // hairline ring (the ring carries it in the day world),
                      // letter barely inked.
                      background: 'color-mix(in srgb, var(--sl-void) 30%, var(--sl-panel))',
                      color: 'color-mix(in srgb, var(--sl-mute) 60%, transparent)',
                      boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--sl-mute) 35%, transparent)',
                    }
              }
            >
              {posLabel(p)}
            </span>
          )
        })}
      </span>
    )
  }

  if (total <= 0) return null
  const lit = Math.max(0, Math.min(total, left))
  return (
    <span
      className={`inline-flex items-center gap-[3px] ${align === 'right' ? 'flex-row-reverse' : ''}`}
      title={`${lit} of ${total} still to play`}
      role="img"
      aria-label={`${lit} of ${total} players still to play`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-[5px] w-[9px] rounded-[1px] ${
            i < lit ? 'bg-sl-glow shadow-[0_0_6px_rgba(232,199,120,0.5)]' : ''
          }`}
          style={
            i < lit
              ? undefined
              : {
                  background: 'color-mix(in srgb, var(--sl-void) 30%, var(--sl-panel))',
                  boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--sl-mute) 35%, transparent)',
                }
          }
        />
      ))}
    </span>
  )
}
