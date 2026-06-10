'use client'

// "Split the field" — the Hall's filterable record walls. The server
// precomputes a full record wall per bucket (format, platform, league
// size); this component just picks which wall to show, one lens at a
// time, so a superflex league never has to share a plaque with a 1-QB
// one. No fetching — every wall arrives with the page.

import { useState } from 'react'
import type { HubHallSplit, HubRecord } from '@/lib/hub/data'

function MiniPlaque({ r, index }: { r: HubRecord; index: number }) {
  return (
    <div className="hub-plaque" style={{ animationDelay: `${index * 50}ms` }} data-rise>
      <div className="hub-plaque-cat">{r.title}</div>
      <div className="hub-plaque-value">
        {r.value}
        {r.unit && <span className="unit">{r.unit}</span>}
      </div>
      <div className="hub-plaque-holder">{r.holder}</div>
      {r.team && <div className="hub-plaque-team">“{r.team}”</div>}
      <div className="hub-plaque-meta">
        <span>
          {r.leagueSlug ? <a href={`/leagues/${r.leagueSlug}/`}>{r.league}</a> : r.league}
        </span>
        <span>{r.detail}</span>
      </div>
    </div>
  )
}

export function HallSplits({ splits }: { splits: HubHallSplit[] }) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const active = splits.find((s) => s.key === activeKey) ?? null

  const groups: { name: string; items: HubHallSplit[] }[] = []
  for (const s of splits) {
    const g = groups.find((x) => x.name === s.group)
    if (g) g.items.push(s)
    else groups.push({ name: s.group, items: [s] })
  }

  return (
    <div>
      <div className="hub-filter-bar">
        {groups.map((g) => (
          <div key={g.name} className="hub-filter-group">
            <span className="hub-filter-lbl">{g.name}</span>
            <div className="hub-filter-chips">
              {g.items.map((s) => (
                <button
                  key={s.key}
                  className={`hub-filter-chip${activeKey === s.key ? ' active' : ''}`}
                  onClick={() => setActiveKey(activeKey === s.key ? null : s.key)}
                  aria-pressed={activeKey === s.key}
                >
                  {s.label}
                  <span className="hub-filter-count">{s.leagues}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {active === null ? (
        <p className="hub-filter-hint">
          Pick a lens above — one at a time — and the wall re-hangs itself with records from
          only those leagues. Counts show how many published leagues qualify.
        </p>
      ) : (
        <div key={active.key}>
          <div className="hub-filter-readout">
            <span className="hub-filter-readout-title">{active.label}</span>
            <span className="hub-filter-readout-meta">
              {active.leagues} {active.leagues === 1 ? 'league' : 'leagues'} ·{' '}
              {active.seasons.toLocaleString()} {active.seasons === 1 ? 'season' : 'seasons'} surveyed
            </span>
          </div>
          {active.records.length === 0 ? (
            <p className="hub-filter-hint">No completed games on file for this slice yet.</p>
          ) : (
            <div className="hub-plaque-grid">
              {active.records.map((r, i) => (
                <MiniPlaque key={`${active.key}-${r.id}`} r={r} index={i} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
