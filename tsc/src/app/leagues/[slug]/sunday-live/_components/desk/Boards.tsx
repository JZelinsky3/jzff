'use client'

// The stat boards: tabbed panel under the stage. Leaders, boom, bench heroes,
// duds, stacks, inactives, power pulse. All data comes off the frame; tabs
// are pure client state.

import { useState } from 'react'
import type { TickerEntry } from '@/lib/sundayLive/types'
import { useSl } from '../SlProvider'
import { fmtDelta, fmtPts, shortName } from '../../_lib/format'
import { teamColor } from '../../_lib/teamColors'

type Tab = 'leaders' | 'boom' | 'bench' | 'duds' | 'stacks' | 'inactives' | 'pulse'

const TABS: { id: Tab; label: string }[] = [
  { id: 'leaders', label: 'LEADERS' },
  { id: 'boom', label: 'BOOM' },
  { id: 'bench', label: 'BENCH HEROES' },
  { id: 'duds', label: 'DUDS' },
  { id: 'stacks', label: 'STACKS' },
  { id: 'inactives', label: 'INACTIVES' },
  { id: 'pulse', label: 'POWER PULSE' },
]

function EntryRow({ e, deltaMode }: { e: TickerEntry; deltaMode?: boolean }) {
  const owner = e.startedByOwner ?? e.benchedByOwner
  return (
    <div className="flex items-center gap-2 border-b border-sl-line/50 px-3 py-1.5 last:border-b-0">
      <span className="sl-num w-5 shrink-0 text-right text-[11px] text-sl-dim">{e.rank}</span>
      <span className="h-3 w-0.5 shrink-0 rounded" style={{ background: teamColor(e.team) }} aria-hidden />
      <span className="sl-display min-w-0 flex-1 truncate text-[13.5px] text-sl-text">
        {shortName(e.name)}
        <span className="ml-1.5 font-sans text-[10px] text-sl-dim">
          {e.position ?? ''} {e.team ?? ''}
        </span>
      </span>
      {owner && <span className="sl-chip max-w-[110px] truncate text-[9px]!">{owner}</span>}
      <span className={`sl-num w-9 shrink-0 text-right text-[11px] ${e.projDelta >= 0 ? 'text-sl-up' : 'text-sl-down'}`}>
        {fmtDelta(e.projDelta)}
      </span>
      <span className="sl-num w-12 shrink-0 text-right text-[14px] text-sl-text">
        {deltaMode ? fmtDelta(e.projDelta) : fmtPts(e.points)}
      </span>
    </div>
  )
}

function Board({ compact = false }: { compact?: boolean }) {
  const { frame, setView } = useSl()
  const [tab, setTab] = useState<Tab>('leaders')
  const rows = compact ? 12 : 30

  return (
    <div className="sl-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="sl-scroll flex items-center gap-1 overflow-x-auto border-b border-sl-line px-2 py-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`sl-kicker shrink-0 rounded px-2 py-1 transition-colors ${
              tab === t.id ? 'bg-sl-navy/35 text-sl-cream!' : 'hover:text-sl-text!'
            }`}
          >
            {t.label}
          </button>
        ))}
        {compact && (
          <button
            type="button"
            onClick={() => setView('leaders')}
            className="sl-kicker ml-auto shrink-0 rounded px-2 py-1 text-sl-electric! transition-colors hover:text-sl-text!"
            title="Open the full leaders board"
          >
            ▸
          </button>
        )}
      </div>
      <div className="sl-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === 'leaders' && frame.ticker.all.slice(0, rows).map((e) => <EntryRow key={e.playerId} e={e} />)}
        {tab === 'boom' && frame.ticker.boom.slice(0, rows).map((e) => <EntryRow key={e.playerId} e={e} />)}
        {tab === 'bench' && frame.ticker.bench.slice(0, rows).map((e) => <EntryRow key={e.playerId} e={e} />)}
        {tab === 'duds' && frame.ticker.duds.slice(0, rows).map((e) => <EntryRow key={e.playerId} e={e} />)}

        {tab === 'stacks' &&
          frame.stacks.map((s, i) => (
            <div key={`${s.ownerName}-${s.team}-${i}`} className="border-b border-sl-line/50 px-3 py-2 last:border-b-0">
              <div className="flex items-center justify-between">
                <span className="sl-display text-[12px] text-sl-text">
                  {s.team} STACK
                  <span className="ml-2 text-[10px] font-normal normal-case text-sl-dim">{s.ownerName}</span>
                </span>
                <span className="sl-num text-[14px] text-sl-glow">{fmtPts(s.combined)}</span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-sl-mute">
                {s.players.map((p) => `${shortName(p.name)} ${fmtPts(p.points)}`).join(' + ')}
              </div>
            </div>
          ))}

        {tab === 'inactives' &&
          (frame.inactives.length === 0 ? (
            <p className="px-3 py-4 text-center text-[12px] text-sl-dim">Clean bill of health.</p>
          ) : (
            frame.inactives.map((a, i) => (
              <div key={`${a.name}-${i}`} className="flex items-center gap-2 border-b border-sl-line/50 px-3 py-1.5 last:border-b-0">
                <span className={`sl-num w-16 shrink-0 text-[10px] font-bold ${a.isStarter ? 'text-sl-live' : 'text-sl-dim'}`}>
                  {a.status.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-sl-text">
                  {shortName(a.name)}
                  <span className="ml-1.5 text-[10px] text-sl-dim">{a.position ?? ''} {a.team ?? ''}</span>
                </span>
                {a.isStarter && <span className="sl-chip border-sl-live/40 text-[9px]! text-sl-live!">IN LINEUP</span>}
                <span className="sl-chip max-w-[110px] truncate text-[9px]!">{a.ownerName}</span>
              </div>
            ))
          ))}

        {tab === 'pulse' &&
          (frame.powerPulse.length === 0 ? (
            <p className="px-3 py-4 text-center text-[12px] text-sl-dim">Power rankings arrive after a few weeks.</p>
          ) : (
            frame.powerPulse.map((r) => (
              <div key={r.rank} className="flex items-center gap-2 border-b border-sl-line/50 px-3 py-1.5 last:border-b-0">
                <span className="sl-display w-6 shrink-0 text-center text-[14px] text-sl-electric">{r.rank}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-sl-text">
                  {r.teamName}
                  <span className="ml-1.5 text-[10px] text-sl-dim">{r.ownerName}</span>
                </span>
                <span className="sl-num shrink-0 text-[11px] text-sl-mute">
                  {r.wins}-{r.losses}
                </span>
                {r.liveResult && (
                  <span
                    className={`sl-num w-14 shrink-0 text-right text-[10px] font-bold ${
                      r.liveResult === 'leading' ? 'text-sl-up' : r.liveResult === 'trailing' ? 'text-sl-down' : 'text-sl-dim'
                    }`}
                  >
                    {r.liveResult.toUpperCase()}
                  </span>
                )}
              </div>
            ))
          ))}
      </div>
    </div>
  )
}

export function Boards({ compact = false }: { compact?: boolean }) {
  return <Board compact={compact} />
}
