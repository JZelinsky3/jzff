'use client'

// The Hall board — the sitewide record wall the reader steers. Every plaque is
// really a one-league feat, so the server ships each league's best-in-category
// records (candidates); this component argmaxes across the leagues that pass
// the live filters and re-hangs the marquee + wall. Two lenses:
//
//   • Filters (multi-select, empty = all) narrow the field to comparable
//     leagues — pick 1-QB + Full PPR and the superflex-IDP outlier drops out.
//   • Adjusted restates each points record as how far above that league's OWN
//     weekly/season average it was, so a 300 in a 190-avg league and a 150 in a
//     95-avg league compete fairly. Volume records (wins, rings, streaks) never
//     scale.

import { useMemo, useState } from 'react'
import type { HubCandidate, HubLeagueClass } from '@/lib/hub/data'
import { Reveal } from '../bits'

// Fixed wall order; the first present category is the marquee headline.
const CATEGORY_ORDER = [
  'top-week', 'points-season', 'blowout', 'shootout', 'heartbreak',
  'stingy', 'best-record', 'win-streak', 'dynasty', 'closest',
]

type Cls = HubLeagueClass
const FILTER_GROUPS: { name: string; items: { key: string; label: string; test: (c: Cls) => boolean }[] }[] = [
  {
    name: 'Format',
    items: [
      { key: 'fmt-1qb', label: '1-QB', test: (c) => !c.superflex },
      { key: 'fmt-sf', label: 'Superflex / 2-QB', test: (c) => c.superflex },
    ],
  },
  {
    name: 'Scoring',
    items: [
      { key: 'sc-ppr', label: 'Full PPR', test: (c) => c.scoring === 'PPR' },
      { key: 'sc-half', label: 'Half PPR', test: (c) => c.scoring === 'HALF' },
      { key: 'sc-std', label: 'Standard', test: (c) => c.scoring === 'STANDARD' },
    ],
  },
  {
    name: 'Passing TDs',
    items: [
      { key: 'td-4', label: '4 pt', test: (c) => c.qbTd === 4 },
      { key: 'td-6', label: '6 pt', test: (c) => c.qbTd === 6 },
    ],
  },
  {
    name: 'Flex slots',
    items: [
      { key: 'fx-1', label: '1 flex', test: (c) => c.flex === 1 },
      { key: 'fx-2', label: '2+ flex', test: (c) => (c.flex ?? 0) >= 2 },
    ],
  },
  {
    name: 'League size',
    items: [
      { key: 'sz-8', label: '8 or fewer', test: (c) => (c.size ?? 0) > 0 && (c.size ?? 0) <= 8 },
      { key: 'sz-12', label: '10–12 teams', test: (c) => { const n = c.size ?? 0; return n >= 9 && n <= 12 } },
      { key: 'sz-14', label: '14+ teams', test: (c) => (c.size ?? 0) >= 13 },
    ],
  },
  {
    name: 'League type',
    items: [
      { key: 'lt-redraft', label: 'Redraft', test: (c) => c.leagueType === 'redraft' },
      { key: 'lt-keeper', label: 'Keeper', test: (c) => c.leagueType === 'keeper' },
      { key: 'lt-dynasty', label: 'Dynasty', test: (c) => c.leagueType === 'dynasty' },
    ],
  },
  {
    name: 'TE premium',
    items: [
      { key: 'te-prem', label: 'TE premium', test: (c) => c.tePremium },
    ],
  },
]

const KEY_TO_GROUP = new Map<string, string>()
for (const g of FILTER_GROUPS) for (const it of g.items) KEY_TO_GROUP.set(it.key, g.name)

const fmtNum = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })

// A league passes when, for every group with a selection, its class matches at
// least one selected chip in that group (union within group, AND across
// groups). Empty group = all.
function leaguePasses(cls: Cls, selected: Set<string>): boolean {
  for (const g of FILTER_GROUPS) {
    const chosen = g.items.filter((it) => selected.has(it.key))
    if (chosen.length === 0) continue
    if (!chosen.some((it) => it.test(cls))) return false
  }
  return true
}

// Display fields for one plaque under the active lens.
function view(c: HubCandidate, adjusted: boolean): { value: string; unit: string; detail: string } {
  if (adjusted && c.scaleBase != null && c.scaleBase > 0) {
    const pct = (c.rankValue / c.scaleBase - 1) * 100
    return {
      value: `${pct >= 0 ? '+' : ''}${Math.round(pct)}%`,
      unit: 'vs league avg',
      detail: `${c.detail} · ${fmtNum(c.rankValue)} in a ${fmtNum(c.scaleBase)}-avg league`,
    }
  }
  return { value: c.value, unit: c.unit, detail: c.detail }
}

function Plaque({ c, adjusted, banner = false, delay = 0 }: { c: HubCandidate; adjusted: boolean; banner?: boolean; delay?: number }) {
  const v = view(c, adjusted)
  return (
    <Reveal delay={delay} className={banner ? 'hub-plaque-banner-wrap' : undefined}>
      <div className={`hub-plaque${banner ? ' is-banner' : ''}`} style={{ height: '100%' }}>
        <div className="hub-plaque-cat">{c.title}</div>
        <div className="hub-plaque-value">
          {v.value}
          {v.unit && <span className="unit">{v.unit}</span>}
        </div>
        <div className="hub-plaque-holder">{c.holder}</div>
        {c.team && <div className="hub-plaque-team">“{c.team}”</div>}
        <div className="hub-plaque-meta">
          <span>{c.leagueSlug ? <a href={`/leagues/${c.leagueSlug}/`}>{c.league}</a> : c.league}</span>
          <span>{v.detail}</span>
        </div>
      </div>
    </Reveal>
  )
}

export function HallBoard({
  candidates,
}: {
  candidates: HubCandidate[]
}) {
  const [adjusted, setAdjusted] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)

  // League-count per chip (unique leagues matching that chip's test), plus the
  // set of chips worth showing (>0 leagues). Static over the candidate set.
  const { leagueCount, activeGroups } = useMemo(() => {
    const clsByLeague = new Map<string, Cls>()
    for (const c of candidates) if (!clsByLeague.has(c.leagueId)) clsByLeague.set(c.leagueId, c.cls)
    const allCls = [...clsByLeague.values()]
    const leagueCount = new Map<string, number>()
    for (const g of FILTER_GROUPS) for (const it of g.items) {
      leagueCount.set(it.key, allCls.filter((cl) => it.test(cl)).length)
    }
    const activeGroups = FILTER_GROUPS
      .map((g) => ({ name: g.name, items: g.items.filter((it) => (leagueCount.get(it.key) ?? 0) > 0) }))
      .filter((g) => g.items.length > 0)
    return { leagueCount, activeGroups }
  }, [candidates])

  // Filter → best-per-category → ordered wall.
  const { wall, leaguesInView } = useMemo(() => {
    const pool = candidates.filter((c) => leaguePasses(c.cls, selected))
    const leaguesInView = new Set(pool.map((c) => c.leagueId)).size
    const metric = (c: HubCandidate) =>
      adjusted && c.scaleBase != null && c.scaleBase > 0 ? c.rankValue / c.scaleBase : c.rankValue
    const bestByCat = new Map<string, HubCandidate>()
    for (const c of pool) {
      const cur = bestByCat.get(c.category)
      if (!cur) { bestByCat.set(c.category, c); continue }
      const m = metric(c), cm = metric(cur)
      const better = c.rankDir === 'min' ? m < cm : m > cm
      if (better) bestByCat.set(c.category, c)
    }
    const ordered = CATEGORY_ORDER.map((cat) => bestByCat.get(cat)).filter((c): c is HubCandidate => !!c)
    // Any category not in the fixed order still shows, after the known ones.
    for (const [cat, c] of bestByCat) if (!CATEGORY_ORDER.includes(cat)) ordered.push(c)
    return { wall: ordered, leaguesInView }
  }, [candidates, selected, adjusted])

  function toggleKey(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const [headline, ...rest] = wall
  const anyFilters = selected.size > 0

  return (
    <>
      {/* ── Control strip: lens toggle + quick 1-QB + filter drawer ────── */}
      <div className="hub-section">
        <div className="hub-hall-controls">
          <div className="hub-hall-lens" role="group" aria-label="Scoring lens">
            <button
              type="button"
              className={`hub-hall-lens-btn${!adjusted ? ' active' : ''}`}
              onClick={() => setAdjusted(false)}
              aria-pressed={!adjusted}
            >
              Raw points
            </button>
            <button
              type="button"
              className={`hub-hall-lens-btn${adjusted ? ' active' : ''}`}
              onClick={() => setAdjusted(true)}
              aria-pressed={adjusted}
            >
              Adjusted
            </button>
          </div>

          {(leagueCount.get('fmt-1qb') ?? 0) > 0 && (
            <button
              type="button"
              className={`hub-filter-chip${selected.has('fmt-1qb') ? ' active' : ''}`}
              onClick={() => toggleKey('fmt-1qb')}
              aria-pressed={selected.has('fmt-1qb')}
              title="Most leagues run one quarterback — the closest thing to a default"
            >
              1-QB only
              <span className="hub-filter-count">{leagueCount.get('fmt-1qb')}</span>
            </button>
          )}

          <button
            className={`hub-filter-toggle${open ? ' open' : ''}`}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="6" y1="12" x2="18" y2="12" />
              <line x1="9" y1="18" x2="15" y2="18" />
            </svg>
            Filter the wall
            <span className="hub-filter-caret" aria-hidden>›</span>
          </button>

          {anyFilters && (
            <button className="hub-filter-chip active" onClick={() => setSelected(new Set())} title="Clear all filters">
              Clear {selected.size} ✕
            </button>
          )}
        </div>

        {open && (
          <div className="hub-filter-bar">
            {activeGroups.map((g) => (
              <div key={g.name} className={`hub-filter-group${g.name === 'League size' ? ' is-wide' : ''}`}>
                <span className="hub-filter-lbl">{g.name}</span>
                <div className="hub-filter-chips">
                  {g.items.map((it) => (
                    <button
                      key={it.key}
                      className={`hub-filter-chip${selected.has(it.key) ? ' active' : ''}`}
                      onClick={() => toggleKey(it.key)}
                      aria-pressed={selected.has(it.key)}
                    >
                      {it.label}
                      <span className="hub-filter-count">{leagueCount.get(it.key)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="hub-filter-hint" style={{ margin: '.2rem 0 0' }}>
              Pick as many as you like. Empty groups count every setting; choices within a group
              widen the field, choices across groups narrow it. {adjusted
                ? 'Adjusted shows points records as how far above each league’s own average they were.'
                : 'Switch to Adjusted to compare points across different scoring systems.'}
            </p>
          </div>
        )}
      </div>

      {wall.length === 0 ? (
        <div className="hub-section">
          <p className="hub-filter-hint">No completed games on file for this slice yet. Widen the filters.</p>
        </div>
      ) : (
        <>
          <div className="hub-section">
            <div className="hub-section-header">
              <span className="hub-section-num">§ 01 · The marquee</span>
              <span className="hub-section-title">The record of records —</span>
              <span className="hub-section-meta">
                {adjusted ? 'Adjusted' : 'Raw'} · {leaguesInView} {leaguesInView === 1 ? 'league' : 'leagues'} in view
              </span>
            </div>
            {headline && (
              <div className="hub-plaque-grid">
                <Plaque c={headline} adjusted={adjusted} banner />
              </div>
            )}
          </div>

          <div className="hub-section">
            <div className="hub-section-header">
              <span className="hub-section-num">§ 02 · The wall</span>
              <span className="hub-section-title">Plaques in good standing —</span>
              <span className="hub-section-meta">Until somebody takes them</span>
            </div>
            <div className="hub-plaque-grid">
              {rest.map((c, i) => (
                <Plaque key={c.category} c={c} adjusted={adjusted} delay={(i % 3) * 90} />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
