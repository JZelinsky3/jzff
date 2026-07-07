'use client'

// THE SCENARIO MACHINE: the live "if the day ends now" table. Every game
// this week gets a scenario winner (the live leader, or the projected
// favorite before kickoff); the standings recompute from entering records
// plus those results, with movement arrows against where each team stood
// entering the week. Clicking a game flips its winner, so members can play
// out "if Luke hangs on AND Chris loses" without leaving the room. Finals
// are settled and locked. Pure client state; nothing persists or polls.

import { useState } from 'react'
import type { SlLeague, SlMatchup } from '@/lib/sundayLive/types'
import type { SlWeekContext } from '@/lib/sundayLive/seasonContext'
import { fmtPts } from '../../_lib/format'
import { parseFlips, serializeFlips, type ScenarioFlips } from '../../_lib/scenarioFlips'

type Winner = 'A' | 'B'

// Only flips that point at a real, still-undecided game survive a permalink.
function sanitizeFlips(flips: ScenarioFlips, frame: SlLeague): ScenarioFlips {
  const out: ScenarioFlips = {}
  for (const m of frame.matchups) {
    if (m.status !== 'final' && flips[m.matchupId]) out[m.matchupId] = flips[m.matchupId]
  }
  return out
}

// Keep the shareable scenario in the address bar without navigating.
function writeFlipsUrl(flips: ScenarioFlips) {
  const url = new URL(window.location.href)
  const s = serializeFlips(flips)
  if (s) url.searchParams.set('flips', s)
  else url.searchParams.delete('flips')
  window.history.replaceState(null, '', url)
}

function parseRecord(rec: string | null): { w: number; l: number; t: number } | null {
  if (!rec) return null
  const parts = rec.split('-').map(Number)
  if (parts.length < 2 || parts.some(Number.isNaN)) return null
  return { w: parts[0], l: parts[1], t: parts[2] ?? 0 }
}

// The machine needs entering records for both sides of every game; leagues
// without season context (identity misses, week 1) simply do not get it.
export function canRunScenarios(frame: SlLeague, wc: SlWeekContext | null): boolean {
  if (!wc || frame.matchups.length < 2) return false
  return frame.matchups.every((m) => {
    const c = wc.matchups[m.matchupId]
    return Boolean(c && parseRecord(c.recordA) && parseRecord(c.recordB))
  })
}

function defaultWinner(m: SlMatchup): Winner {
  if (m.a.score !== m.b.score) return m.a.score > m.b.score ? 'A' : 'B'
  return m.a.projected >= m.b.projected ? 'A' : 'B'
}

type Standing = {
  key: string
  rosterId: number
  ownerName: string
  w: number
  l: number
  t: number
  pf: number
}

function rankSort(rows: Standing[]): Standing[] {
  return [...rows].sort((x, y) => {
    const pct = (r: Standing) => (r.w + r.t * 0.5) / Math.max(1, r.w + r.l + r.t)
    return pct(y) - pct(x) || y.w - x.w || y.pf - x.pf || x.ownerName.localeCompare(y.ownerName)
  })
}

export function ScenarioMachine({
  frame,
  weekContext,
  initialFlips,
}: {
  frame: SlLeague
  weekContext: SlWeekContext
  initialFlips?: ScenarioFlips
}) {
  // First mount hydrates from the server-parsed permalink (SSR and client
  // agree because both read the same URL); remounts after a view switch
  // re-read the address bar so a played-with scenario survives navigation.
  const [flips, setFlips] = useState<ScenarioFlips>(() =>
    sanitizeFlips(
      typeof window === 'undefined'
        ? (initialFlips ?? {})
        : parseFlips(new URL(window.location.href).searchParams.get('flips')),
      frame,
    ),
  )

  const games = [...frame.matchups].sort((a, b) => a.matchupId - b.matchupId)
  const winnerOf = (m: SlMatchup): Winner =>
    m.status === 'final' ? defaultWinner(m) : (flips[m.matchupId] ?? defaultWinner(m))

  // Entering-week table, then the scenario table with this week applied.
  const entering: Standing[] = []
  const scenario: Standing[] = []
  for (const m of games) {
    const c = weekContext.matchups[m.matchupId]
    const recA = parseRecord(c?.recordA ?? null)
    const recB = parseRecord(c?.recordB ?? null)
    if (!c || !recA || !recB) return null
    const win = winnerOf(m)
    for (const [side, rec, pf] of [
      ['A', recA, c.pfA] as const,
      ['B', recB, c.pfB] as const,
    ]) {
      const s = side === 'A' ? m.a : m.b
      const won = win === side
      entering.push({ key: `${m.matchupId}${side}`, rosterId: s.rosterId, ownerName: s.ownerName, ...rec, pf: pf ?? 0 })
      scenario.push({
        key: `${m.matchupId}${side}`,
        rosterId: s.rosterId,
        ownerName: s.ownerName,
        w: rec.w + (won ? 1 : 0),
        l: rec.l + (won ? 0 : 1),
        t: rec.t,
        pf: (pf ?? 0) + s.score,
      })
    }
  }

  const enteringRank = new Map(rankSort(entering).map((r, i) => [r.key, i]))
  const table = rankSort(scenario)
  // THE CUT comes from the platform's playoff settings when we have them;
  // the size-based guess only covers leagues where the read came up empty.
  const cut = frame.league.playoffSpots ?? (table.length >= 10 ? 6 : 4)
  const flipped = Object.keys(flips).length > 0

  // Division furniture: the best-ranked team in each division under this
  // scenario wears the leader mark, and every row carries its division tag.
  const divisions = frame.league.divisions ?? null
  const divisionLeaders = new Set<string>()
  if (divisions) {
    const seen = new Set<number>()
    for (const r of table) {
      const d = divisions.byRosterId[r.rosterId]
      if (d != null && !seen.has(d)) {
        seen.add(d)
        divisionLeaders.add(r.key)
      }
    }
  }
  const divisionTag = (r: Standing): string | null => {
    const d = divisions?.byRosterId[r.rosterId]
    return d != null ? (divisions?.names[d - 1] ?? `Division ${d}`) : null
  }

  const flip = (m: SlMatchup) => {
    if (m.status === 'final') return
    const next: Winner = winnerOf(m) === 'A' ? 'B' : 'A'
    const out = { ...flips, [m.matchupId]: next }
    // Flipping back to the live default clears the override.
    if (next === defaultWinner(m)) delete out[m.matchupId]
    setFlips(out)
    writeFlipsUrl(out)
  }

  return (
    <div className="sl-panel h-full overflow-hidden">
      <div className="sl-slate flex items-center justify-between">
        <span className="sl-kicker text-sl-cream!">THE SCENARIO MACHINE</span>
        {flipped && (
          <button
            type="button"
            onClick={() => {
              setFlips({})
              writeFlipsUrl({})
            }}
            className="sl-chip transition-colors hover:text-sl-text"
          >
            BACK TO REALITY
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.15fr] md:divide-x md:divide-sl-line/50">
        {/* This week's results, each one a switch */}
        <div className="px-4 py-3">
          <p className="text-[11px] leading-snug text-sl-dim">
            If the day ended now. Tap a game to flip its winner and watch the table move.
          </p>
          <div className="mt-2.5 space-y-1">
            {games.map((m) => {
              const win = winnerOf(m)
              const isFlipped = flips[m.matchupId] != null
              const settled = m.status === 'final'
              const winner = win === 'A' ? m.a : m.b
              const loser = win === 'A' ? m.b : m.a
              return (
                <button
                  key={m.matchupId}
                  type="button"
                  onClick={() => flip(m)}
                  disabled={settled}
                  className={`flex w-full items-center gap-2 rounded-[3px] border px-2.5 py-1.5 text-left transition-colors ${
                    isFlipped
                      ? 'border-sl-gold/50 bg-sl-gold/8'
                      : 'border-transparent hover:border-sl-line'
                  } ${settled ? 'opacity-60' : 'cursor-pointer'}`}
                  title={settled ? 'Final: this one is in the books' : 'Flip the winner'}
                >
                  <span className="sl-display min-w-0 flex-1 truncate text-[13.5px] text-sl-text">
                    {winner.ownerName}
                    <span className="mx-1.5 font-sans text-[10.5px] italic text-sl-dim">over</span>
                    <span className="text-sl-mute">{loser.ownerName}</span>
                  </span>
                  <span
                    className={`sl-num shrink-0 text-[8.5px] tracking-[0.14em] ${
                      isFlipped ? 'text-sl-gold' : 'text-sl-dim'
                    }`}
                  >
                    {settled ? 'FINAL' : isFlipped ? 'FLIPPED' : m.status === 'pre' ? 'PROJECTED' : 'LEADING'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        {/* The table under that scenario */}
        <div className="px-4 py-3">
          <div className="space-y-0.5">
            {table.map((r, i) => {
              const move = (enteringRank.get(r.key) ?? i) - i
              const tag = divisionTag(r)
              const leads = divisionLeaders.has(r.key)
              return (
                <div key={r.key}>
                  <div className="flex items-center gap-2.5 py-[3px]">
                    <span className="sl-num w-4 shrink-0 text-right text-[11px] text-sl-dim">{i + 1}</span>
                    <span className="sl-display min-w-0 flex-1 truncate text-[13.5px] text-sl-text">
                      {r.ownerName}
                      {leads && (
                        <span className="ml-1.5 text-[10px] text-sl-gold" title={`Leads ${tag ?? 'the division'} under this scenario`}>
                          ★
                        </span>
                      )}
                      {tag && (
                        <span className="sl-num ml-1.5 text-[8px] tracking-[0.14em] text-sl-dim">
                          {tag.toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="sl-num shrink-0 text-[11px] text-sl-mute">
                      {r.w}-{r.l}
                      {r.t ? `-${r.t}` : ''}
                    </span>
                    <span className="sl-num w-12 shrink-0 text-right text-[10px] text-sl-dim">{fmtPts(r.pf)}</span>
                    <span
                      className={`sl-num w-7 shrink-0 text-right text-[10px] ${
                        move > 0 ? 'text-sl-up' : move < 0 ? 'text-sl-down' : 'text-sl-dim'
                      }`}
                      title="Movement against the entering standings"
                    >
                      {move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : '·'}
                    </span>
                  </div>
                  {i + 1 === cut && (
                    <div className="my-1 flex items-center gap-2">
                      <span className="h-px flex-1 bg-sl-gold/40" />
                      <span className="sl-num text-[8px] tracking-[0.2em] text-sl-gold/80">THE CUT</span>
                      <span className="h-px flex-1 bg-sl-gold/40" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
