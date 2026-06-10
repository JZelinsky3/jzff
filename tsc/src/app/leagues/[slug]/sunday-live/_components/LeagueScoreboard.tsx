'use client'

// Side rail showing every matchup in the league, sorted by Sweat Index.
// Click a row to put it on the hero card (selectedHeroId callback to parent).

import type { SlMatchup } from '@/lib/sundayLive/types'
import { fmtPct, fmtScore, sweatTier } from '../_lib/format'
import { PickemsBadge } from './PickemsBadge'

export function LeagueScoreboard({
  matchups,
  onPick,
  activeId,
}: {
  matchups: SlMatchup[]
  onPick?: (matchupId: number) => void
  activeId?: number | null
}) {
  return (
    <aside className="sl-card min-w-0 overflow-hidden rounded-md">
      <div className="flex items-center justify-between border-b border-sl-edge-soft px-3.5 py-2.5">
        <div className="sl-ff-mono text-[0.58rem] uppercase tracking-[0.26em] text-sl-ember">
          League Board
        </div>
        <div className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.22em] text-sl-dim">
          {matchups.length} games
        </div>
      </div>
      <div className="flex flex-col">
        {matchups.length === 0 && (
          <div className="px-3.5 py-6 text-center text-xs italic text-sl-mute">
            No matchups yet this week.
          </div>
        )}
        {matchups.map((m) => {
          const tier = sweatTier(m.sweatIndex)
          const active = activeId === m.matchupId
          return (
            <button
              key={m.matchupId}
              type="button"
              onClick={() => onPick?.(m.matchupId)}
              className={`group border-t border-sl-edge-soft px-3.5 py-2.5 text-left transition-colors first:border-t-0 hover:bg-white/[0.02] ${active ? 'bg-white/[0.025]' : ''}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="sl-sweat" data-tier={tier} title={`Sweat Index ${m.sweatIndex}`}>
                  <span className="sl-tnum">{m.sweatIndex}</span>
                </span>
                <span className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.2em] text-sl-dim">
                  {m.status === 'live' ? <><span className="sl-pip mr-1" aria-hidden />LIVE</> : m.status === 'final' ? 'FINAL' : 'PRE'}
                </span>
              </div>
              <SbSide side={m.a} winning={m.a.score >= m.b.score} wp={m.a.wp} />
              <SbSide side={m.b} winning={m.b.score > m.a.score} wp={m.b.wp} />
              {m.pickems && m.pickems.totalVotes > 0 && (
                <div className="mt-1.5">
                  <PickemsBadge data={m.pickems} />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function SbSide({ side, winning, wp }: { side: SlMatchup['a']; winning: boolean; wp: number }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className={`truncate text-xs ${winning ? 'text-sl-cream' : 'text-sl-mute'}`}>
        {side.teamName}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className={`sl-tnum text-xs ${winning ? 'text-sl-ember' : 'text-sl-mute'}`}>
          {fmtScore(side.score)}
        </span>
        <span className="sl-ff-mono w-9 text-right text-[0.55rem] tracking-[0.12em] text-sl-dim sl-tnum">
          {fmtPct(wp)}
        </span>
      </span>
    </div>
  )
}
