'use client'

// Full NFL slate, grouped by time window. Same poll source as the hub — the
// payload already contains every game with rostered-player annotations.

import { useMemo, useState } from 'react'
import type { SlLeague, SlNflGame } from '@/lib/sundayLive/types'
import { useSundayLivePoll, type Demo } from '../../_lib/useSundayLivePoll'
import { SubHeader } from './SubHeader'
import { StatusStrip } from '../StatusStrip'
import { DemoBanner } from '../DemoBanner'

type Filter = 'all' | 'league' | 'live'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',    label: 'All games' },
  { key: 'league', label: 'My league' },
  { key: 'live',   label: 'Live' },
]

export function GamesBoard({
  slug,
  initial,
  initialDemo,
}: {
  slug: string
  initial: SlLeague
  initialDemo: Demo | null
}) {
  const { league, refresh, demo, nudgeDemo, exitDemo } = useSundayLivePoll(slug, initial, initialDemo)
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = useMemo(() => {
    let list = league.nflGames
    if (filter === 'league') list = list.filter((g) => g.hasLeagueStarter)
    if (filter === 'live') list = list.filter((g) => g.state === 'live')
    return list
  }, [league.nflGames, filter])

  // Group by kickoff time window. ISO date → local "1:00 PM" string.
  const groups = useMemo(() => {
    const buckets = new Map<string, SlNflGame[]>()
    for (const g of filtered) {
      const key = formatWindow(g.date)
      const list = buckets.get(key) ?? []
      list.push(g)
      buckets.set(key, list)
    }
    return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  return (
    <>
      <StatusStrip league={league} refresh={refresh} />
      {demo && (
        <DemoBanner demo={demo} onBack={() => nudgeDemo(-0.1)} onFwd={() => nudgeDemo(0.1)} onExit={exitDemo} />
      )}

      <SubHeader
        slug={slug}
        kicker={`NFL · Wk ${league.league.week}`}
        title="All NFL Games"
        description="The full slate for the week, annotated with the rostered players in your league."
      />

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`sl-ff-mono rounded-sm px-2.5 py-1.5 text-[0.58rem] uppercase tracking-[0.22em] transition-colors ${
              filter === f.key
                ? 'border border-sl-ember/40 bg-sl-ember/10 text-sl-ember'
                : 'border border-sl-edge text-sl-mute hover:text-sl-cream'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="sl-ff-mono ml-2 text-[0.55rem] uppercase tracking-[0.18em] text-sl-dim">
          {filtered.length} games
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="sl-card rounded-md px-6 py-12 text-center text-sm italic text-sl-mute">
          No games match this filter.
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {groups.map(([window, games]) => (
            <section key={window}>
              <div className="sl-ff-mono mb-2 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.26em] text-sl-ember">
                <span>{window}</span>
                <span className="h-px flex-1 bg-sl-edge-soft" />
                <span className="text-sl-dim sl-tnum">{games.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {games.map((g) => (
                  <GameCard key={g.id} game={g} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

function GameCard({ game }: { game: SlNflGame }) {
  const live = game.state === 'live'
  const finished = game.state === 'final'
  const stateLabel = live ? 'LIVE' : finished ? 'FINAL' : 'KICKOFF'
  return (
    <div className={`sl-card rounded-md p-4 ${live ? 'sl-rim-live' : ''}`}>
      <div className="mb-2 flex items-center justify-between text-[0.55rem]">
        <span className="sl-ff-mono uppercase tracking-[0.22em] text-sl-dim">
          {live && <span className="sl-pip mr-1.5" aria-hidden />}
          <span className={live ? 'text-sl-signal' : finished ? 'text-sl-mute' : 'text-sl-cream'}>
            {stateLabel}
          </span>
          {(live || finished) && <span className="ml-1.5 text-sl-cream">{game.short}</span>}
        </span>
        {game.broadcast && (
          <span className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.18em] text-sl-dim">{game.broadcast}</span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-2 py-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-sl-cream">
          {game.possessionAbbr === game.awayAbbr && <span className="text-sl-ember">●</span>}
          {game.awayAbbr ?? '—'}
          <span className="text-[0.62rem] font-normal text-sl-mute">· {game.awayFull}</span>
        </span>
        <span className={`sl-tnum text-2xl font-semibold leading-none ${game.awayScore > game.homeScore ? 'text-sl-ember' : 'text-sl-cream'}`}>
          {game.awayScore}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-2 py-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-sl-cream">
          {game.possessionAbbr === game.homeAbbr && <span className="text-sl-ember">●</span>}
          {game.homeAbbr ?? '—'}
          <span className="text-[0.62rem] font-normal text-sl-mute">· {game.homeFull}</span>
        </span>
        <span className={`sl-tnum text-2xl font-semibold leading-none ${game.homeScore > game.awayScore ? 'text-sl-ember' : 'text-sl-cream'}`}>
          {game.homeScore}
        </span>
      </div>

      {(game.downDistance || game.lastPlay) && live && (
        <div className="mt-2 border-t border-sl-edge-soft pt-2">
          {game.downDistance && (
            <div className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.18em] text-sl-ember">
              {game.downDistance}
            </div>
          )}
          {game.lastPlay && (
            <div className="mt-1 line-clamp-2 text-[0.7rem] italic text-sl-mute">{game.lastPlay}</div>
          )}
        </div>
      )}

      {game.hasLeagueStarter && (
        <div className="mt-2 border-t border-sl-edge-soft pt-2">
          <div className="sl-ff-mono mb-0.5 text-[0.5rem] uppercase tracking-[0.18em] text-sl-dim">
            league starters in this game
          </div>
          <div className="flex flex-wrap gap-1">
            {[...game.redZoneLeagueStarters, ...game.onFieldLeagueStarters].slice(0, 4).map((n) => (
              <span
                key={n}
                className="sl-ff-mono rounded-sm border border-sl-ember/40 bg-sl-ember/10 px-1.5 py-0.5 text-[0.55rem] uppercase tracking-[0.16em] text-sl-ember"
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatWindow(iso: string): string {
  if (!iso) return 'TBD'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'TBD'
  return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}
