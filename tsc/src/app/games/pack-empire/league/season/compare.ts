// Reading a Season pack against your team: what each card would replace, and a
// line of your starters to hold it up against (Joey, 2026-11-07: when drafting
// the bench, and every game's pack, a way to see who you've got).

import { SLOTS, surname, type Player } from '@/lib/packEmpire/rules'

const MINUS = '−'

/** The card against the weakest starter at its position: "+940 vs Godwin". */
export function compareChip(p: Player, lineup: (Player | null)[]): string {
  const starters = SLOTS.flatMap((s, i) => (s.pool === p.pos && lineup[i] ? [lineup[i]!] : []))
  if (!starters.length) return 'No starter yet'
  const weakest = starters.reduce((a, b) => (b.score < a.score ? b : a))
  const d = p.score - weakest.score
  return `${d >= 0 ? '+' : MINUS}${Math.abs(d).toLocaleString()} vs ${surname(weakest.name)}`
}

/** Your starters by position, for the line under an open pack. */
export function startersByPos(lineup: (Player | null)[]): { pos: string; men: Player[] }[] {
  const order: [string, string[]][] = [
    ['QB', ['QB']],
    ['HB', ['RB']],
    ['WR', ['WR']],
    ['TE', ['TE']],
    ['OT', ['OT']],
    ['OG', ['OG']],
    ['C', ['C']],
  ]
  return order.map(([pos, pools]) => ({ pos, men: SLOTS.flatMap((s, i) => (pools.includes(s.pool) && lineup[i] ? [lineup[i]!] : [])) }))
}
