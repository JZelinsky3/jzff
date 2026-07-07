'use client'

// THE BALLOT: how the league voted in pick'ems, game by game. Picks lock at
// kickoff, so names stay sealed on pre-game matchups and are revealed once a
// game is underway; a voter whose pick is currently on the losing side reads
// struck through. The footer ranks the day's best ballots (picks alive
// across every revealed game). Data rides PickemsBadge.votersA/votersB.

import type { SlLeague, SlMatchup } from '@/lib/sundayLive/types'

function losingSide(m: SlMatchup): 'A' | 'B' | null {
  if (m.status === 'pre' || m.a.score === m.b.score) return null
  return m.a.score < m.b.score ? 'A' : 'B'
}

function VoterNames({ names, dead, right }: { names: string[]; dead: boolean; right?: boolean }) {
  if (names.length === 0) return <span className="text-[10.5px] text-sl-dim">No takers</span>
  return (
    <span className={`text-[10.5px] leading-snug ${right ? 'text-right' : ''} ${dead ? 'text-sl-dim line-through' : 'text-sl-mute'}`}>
      {names.join(', ')}
    </span>
  )
}

function BallotRow({ m }: { m: SlMatchup }) {
  const pk = m.pickems
  if (!pk) return null
  // Exact counts when the voter lists rode along; derived from pct otherwise.
  const aVotes = pk.votersA?.length ?? Math.round((pk.pctA / 100) * pk.totalVotes)
  const bVotes = pk.totalVotes - aVotes
  const sealed = m.status === 'pre'
  const loser = losingSide(m)
  return (
    <div className="border-b border-sl-line/50 px-4 py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="sl-display min-w-0 truncate text-[13px] text-sl-text">{m.a.ownerName}</span>
        <span className="sl-num shrink-0 text-[11px] text-sl-mute">
          {aVotes}
          <span className="mx-1 text-sl-dim">to</span>
          {bVotes}
        </span>
        <span className="sl-display min-w-0 truncate text-right text-[13px] text-sl-text">{m.b.ownerName}</span>
      </div>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-gradient-to-r from-sl-glow to-sl-electric"
          style={{ width: `${Math.round(pk.pctA)}%` }}
        />
        <div className="w-px shrink-0" style={{ background: 'rgba(249, 243, 226, 0.85)' }} />
        <div className="sl-meter-b flex-1" />
      </div>
      {sealed ? (
        <p className="mt-1.5 text-[10.5px] italic text-sl-dim">Ballots are sealed until kickoff.</p>
      ) : (
        <div className="mt-1.5 grid grid-cols-2 gap-x-4">
          <VoterNames names={pk.votersA ?? []} dead={loser === 'A'} />
          <VoterNames names={pk.votersB ?? []} dead={loser === 'B'} right />
        </div>
      )}
    </div>
  )
}

// Alive/decided per voter across every revealed matchup.
function bestBallots(matchups: SlMatchup[]): Array<{ name: string; alive: number; decided: number }> {
  const tally = new Map<string, { alive: number; decided: number }>()
  for (const m of matchups) {
    const pk = m.pickems
    const loser = losingSide(m)
    if (!pk || m.status === 'pre' || !loser) continue
    for (const [side, names] of [['A', pk.votersA ?? []] as const, ['B', pk.votersB ?? []] as const]) {
      for (const n of names) {
        const t = tally.get(n) ?? { alive: 0, decided: 0 }
        t.decided++
        if (side !== loser) t.alive++
        tally.set(n, t)
      }
    }
  }
  return [...tally.entries()]
    .map(([name, t]) => ({ name, ...t }))
    .sort((x, y) => y.alive - x.alive || x.decided - x.alive - (y.decided - y.alive) || x.name.localeCompare(y.name))
}

export function Ballot({ frame }: { frame: SlLeague }) {
  const withVotes = frame.matchups.filter((m) => m.pickems && m.pickems.totalVotes > 0)
  if (withVotes.length === 0) return null
  const games = [...withVotes].sort((a, b) => a.matchupId - b.matchupId)
  const best = bestBallots(games).slice(0, 3)
  return (
    <div className="sl-panel flex h-full flex-col overflow-hidden">
      <div className="sl-slate flex items-center justify-between">
        <span className="sl-kicker text-sl-cream!">THE BALLOT</span>
        <span className="sl-num text-[9px] tracking-[0.16em] text-sl-dim">WHO THE LEAGUE PICKED</span>
      </div>
      <div className="min-h-0 flex-1">
        {games.map((m) => (
          <BallotRow key={m.matchupId} m={m} />
        ))}
      </div>
      {best.length > 0 && (
        <div className="border-t border-sl-line/60 px-4 py-2.5">
          <span className="sl-kicker text-[9.5px]!">BEST BALLOTS TODAY</span>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
            {best.map((b, i) => (
              <span key={b.name} className="flex items-baseline gap-1.5">
                <span className="sl-num text-[10px] text-sl-dim">{i + 1}</span>
                <span className="sl-display text-[12.5px] text-sl-text">{b.name}</span>
                <span className="sl-num text-[10px] text-sl-glow">
                  {b.alive} of {b.decided} alive
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
