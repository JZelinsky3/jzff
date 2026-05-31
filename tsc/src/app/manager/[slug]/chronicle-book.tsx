'use client'

import { useMemo, useState, type ReactNode } from 'react'
import type { CareerSummary } from '@/lib/manager/career'

// A page-flipping "book" view of a career chronicle. Self-contained: builds an
// ordered list of page nodes from the summary, then shows one spread at a time
// with a 3D flip transition. Dependency-free for now — a richer flip (real
// two-page spreads, drag-to-turn via react-pageflip) is a later polish pass.

export function ChronicleBook({ summary }: { summary: CareerSummary }) {
  const pages = useMemo(() => buildPages(summary), [summary])
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<'next' | 'prev'>('next')

  const total = pages.length
  function go(to: number, direction: 'next' | 'prev') {
    if (to < 0 || to >= total) return
    setDir(direction)
    setIndex(to)
  }

  return (
    <div className="mh-wrap">
      <style>{CSS}</style>

      <div className="mh-stage">
        <button
          type="button"
          className="mh-nav mh-nav-left"
          onClick={() => go(index - 1, 'prev')}
          disabled={index === 0}
          aria-label="Previous page"
        >
          ‹
        </button>

        <div className="mh-book">
          {/* key forces remount so the flip animation replays each turn */}
          <div key={index} className={`mh-page mh-page-${dir}`}>
            <div className="mh-page-inner">{pages[index]}</div>
            <div className="mh-folio">
              {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="mh-nav mh-nav-right"
          onClick={() => go(index + 1, 'next')}
          disabled={index === total - 1}
          aria-label="Next page"
        >
          ›
        </button>
      </div>

      <div className="mh-dots">
        {pages.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`mh-dot ${i === index ? 'is-active' : ''}`}
            onClick={() => go(i, i > index ? 'next' : 'prev')}
            aria-label={`Go to page ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

// ── page builders ───────────────────────────────────────────────────────────

function buildPages(s: CareerSummary): ReactNode[] {
  const pages: ReactNode[] = []
  const t = s.totals
  const decided = t.wins + t.losses
  const winPctLabel = decided > 0 ? `${(t.winPct * 100).toFixed(1)}%` : '—'

  // 1 — Cover
  pages.push(
    <div className="mh-cover">
      <div className="mh-cover-rule" />
      <div className="mh-kicker">The Career Chronicle of</div>
      <h1 className="mh-cover-title">{s.chronicle.displayName}</h1>
      {s.chronicle.subtitle && <p className="mh-cover-sub">{s.chronicle.subtitle}</p>}
      <div className="mh-cover-stats">
        <Stat big label="Leagues" value={t.leagues} />
        <Stat big label="Seasons" value={t.seasonsPlayed} />
        <Stat big label="Titles" value={t.championships} />
      </div>
      <div className="mh-cover-rule" />
    </div>,
  )

  // 2 — By the Numbers
  pages.push(
    <Sheet title="By the Numbers" num="I">
      {decided === 0 ? (
        <Empty>
          No synced seasons yet. Add a league and run a sync to fill these pages.
        </Empty>
      ) : (
        <div className="mh-grid">
          <Stat label="All-time record" value={`${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ''}`} />
          <Stat label="Win rate" value={winPctLabel} />
          <Stat label="Seasons played" value={t.seasonsPlayed} />
          <Stat label="Leagues" value={t.leagues} />
          <Stat label="Championships" value={t.championships} />
          <Stat label="Runner-ups" value={t.runnerUps} />
          <Stat label="Points for" value={Math.round(t.pointsFor).toLocaleString()} />
          <Stat label="Points against" value={Math.round(t.pointsAgainst).toLocaleString()} />
        </div>
      )}
    </Sheet>,
  )

  // 3 — Trophy Case
  pages.push(
    <Sheet title="The Trophy Case" num="II">
      {s.trophyCase.length === 0 ? (
        <Empty>No titles or runner-up finishes on record yet. The case awaits.</Empty>
      ) : (
        <ul className="mh-list">
          {s.trophyCase.map((tr, i) => (
            <li key={i} className="mh-list-row">
              <span className="mh-trophy">{tr.kind === 'champion' ? '🏆' : '🥈'}</span>
              <span className="mh-list-main">
                <strong>{tr.year}</strong> · {tr.leagueName}
              </span>
              <span className="mh-list-tag">{tr.kind === 'champion' ? 'Champion' : 'Runner-up'}</span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>,
  )

  // 4..n — one page per league
  let roman = 3
  for (const lg of s.leagues) {
    const numeral = toRoman(roman++)
    if (lg.status === 'pending') {
      pages.push(
        <Sheet title={lg.leagueName} num={numeral}>
          <Empty>
            Not synced yet. Open <em>Manage hub</em> and run a sync to thread {lg.leagueName} into
            your chronicle.
          </Empty>
        </Sheet>,
      )
      continue
    }
    const yrs =
      lg.firstYear && lg.lastYear
        ? lg.firstYear === lg.lastYear
          ? `${lg.firstYear}`
          : `${lg.firstYear}–${lg.lastYear}`
        : '—'
    pages.push(
      <Sheet title={lg.leagueName} num={numeral} kicker={`${lg.platform} · ${yrs}`}>
        <div className="mh-grid mh-grid-tight">
          <Stat label="Record" value={`${lg.wins}–${lg.losses}${lg.ties ? `–${lg.ties}` : ''}`} />
          <Stat label="Seasons" value={lg.seasonsPlayed} />
          <Stat label="Titles" value={lg.championships} />
          <Stat label="Best finish" value={lg.bestFinish != null ? ordinal(lg.bestFinish) : '—'} />
        </div>
        {lg.titleYears.length > 0 && (
          <p className="mh-note">★ Champion in {lg.titleYears.join(', ')}.</p>
        )}
        {lg.finishes.length > 0 && (
          <ul className="mh-list mh-list-sm">
            {lg.finishes.map((f) => (
              <li key={f.year} className="mh-list-row">
                <span className="mh-list-main">
                  <strong>{f.year}</strong> — {f.wins}–{f.losses}{f.ties ? `–${f.ties}` : ''}
                </span>
                <span className="mh-list-tag">{f.rank != null ? ordinal(f.rank) : '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </Sheet>,
    )
  }

  // Rivalries
  pages.push(
    <Sheet title="Rivals & Foes" num={toRoman(roman++)}>
      {s.topRivalries.length === 0 ? (
        <Empty>No head-to-head history yet — sync a league to meet your rivals.</Empty>
      ) : (
        <ul className="mh-list">
          {s.topRivalries.map((r) => (
            <li key={r.opponent} className="mh-list-row">
              <span className="mh-list-main">
                <strong>{r.opponent}</strong>
                {r.leagues.length > 1 && <span className="mh-xleague"> · {r.leagues.length} leagues</span>}
              </span>
              <span className="mh-list-tag">
                {r.wins}–{r.losses}{r.ties ? `–${r.ties}` : ''} · {r.games}g
              </span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>,
  )

  // Hall of Fame
  pages.push(
    <Sheet title="Hall of Fame" num={toRoman(roman++)} kicker="Signature wins">
      {s.bestWins.length === 0 ? (
        <Empty>Your biggest wins will be enshrined here once a league is synced.</Empty>
      ) : (
        <ul className="mh-list">
          {s.bestWins.map((m, i) => (
            <li key={i} className="mh-list-row">
              <span className="mh-list-main">
                <strong>{m.score.toFixed(1)}</strong>–{m.oppScore.toFixed(1)} vs {m.opponent}
                <span className="mh-xleague"> · {m.year} wk {m.week}{m.isPlayoff ? ' · playoffs' : ''}</span>
              </span>
              <span className="mh-list-tag">+{m.margin.toFixed(1)}</span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>,
  )

  // Hall of Pain
  pages.push(
    <Sheet title="Hall of Pain" num={toRoman(roman++)} kicker="Worst beats">
      {s.worstLosses.length === 0 ? (
        <Empty>The losses you&apos;d rather forget will live here. Sync to begin the suffering.</Empty>
      ) : (
        <ul className="mh-list">
          {s.worstLosses.map((m, i) => (
            <li key={i} className="mh-list-row">
              <span className="mh-list-main">
                <strong>{m.score.toFixed(1)}</strong>–{m.oppScore.toFixed(1)} vs {m.opponent}
                <span className="mh-xleague"> · {m.year} wk {m.week}{m.isPlayoff ? ' · playoffs' : ''}</span>
              </span>
              <span className="mh-list-tag mh-tag-bad">{m.margin.toFixed(1)}</span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>,
  )

  // Colophon
  pages.push(
    <div className="mh-cover">
      <div className="mh-cover-rule" />
      <div className="mh-kicker">— Fin —</div>
      <p className="mh-cover-sub" style={{ maxWidth: '24rem' }}>
        A living record. Every sync writes the next chapter. Add another league to keep the
        story going.
      </p>
      <div className="mh-cover-rule" />
    </div>,
  )

  return pages
}

// ── small presentational helpers ────────────────────────────────────────────

function Sheet({ title, num, kicker, children }: { title: string; num: string; kicker?: string; children: ReactNode }) {
  return (
    <div className="mh-sheet">
      <div className="mh-sheet-head">
        <span className="mh-sheet-num">§ {num}</span>
        {kicker && <span className="mh-sheet-kicker">{kicker}</span>}
      </div>
      <h2 className="mh-sheet-title">{title}</h2>
      <div className="mh-sheet-body">{children}</div>
    </div>
  )
}

function Stat({ label, value, big }: { label: string; value: ReactNode; big?: boolean }) {
  return (
    <div className={`mh-stat ${big ? 'mh-stat-big' : ''}`}>
      <div className="mh-stat-value">{value}</div>
      <div className="mh-stat-label">{label}</div>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="mh-empty">{children}</div>
}

function toRoman(n: number): string {
  const map: [number, string][] = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let out = ''
  let v = n
  for (const [val, sym] of map) {
    while (v >= val) { out += sym; v -= val }
  }
  return out || 'I'
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ── styles ──────────────────────────────────────────────────────────────────

const CSS = `
.mh-wrap { max-width: 920px; margin: 0 auto 3rem; padding: 0 1rem; }
.mh-stage { display: flex; align-items: center; gap: .5rem; }
.mh-book { flex: 1; perspective: 2000px; }
.mh-nav {
  flex: 0 0 auto; width: 2.6rem; height: 2.6rem; border-radius: 50%;
  background: var(--ink-soft); color: var(--gold);
  border: 1px solid var(--ink-line); cursor: pointer;
  font-size: 1.5rem; line-height: 1; display: inline-flex; align-items: center; justify-content: center;
  transition: background .15s, transform .15s;
}
.mh-nav:hover:not(:disabled) { background: rgba(232,200,137,.12); transform: scale(1.06); }
.mh-nav:disabled { opacity: .25; cursor: default; }
.mh-page {
  position: relative; transform-origin: left center;
  background-color: #f5edd9;
  background-image: linear-gradient(90deg, rgba(0,0,0,.18), rgba(0,0,0,0) 6%);
  color: #2a2118;
  border: 1px solid rgba(120,90,40,.25);
  border-radius: 3px 8px 8px 3px;
  box-shadow: 0 18px 50px rgba(0,0,0,.45), inset 0 0 60px rgba(150,110,50,.08);
  min-height: 30rem;
  overflow: hidden;
}
.mh-page-inner { padding: 2.4rem clamp(1.4rem, 4vw, 3rem); }
.mh-page-next { animation: mhFlipNext .55s cubic-bezier(.2,.7,.2,1); }
.mh-page-prev { animation: mhFlipPrev .55s cubic-bezier(.2,.7,.2,1); }
@keyframes mhFlipNext {
  from { transform: rotateY(-22deg); opacity: 0; }
  to   { transform: rotateY(0deg); opacity: 1; }
}
@keyframes mhFlipPrev {
  from { transform: rotateY(22deg); opacity: 0; }
  to   { transform: rotateY(0deg); opacity: 1; }
}
.mh-folio {
  position: absolute; bottom: 1rem; right: 1.4rem;
  font-family: var(--mono); font-size: .6rem; letter-spacing: .2em;
  color: rgba(80,60,30,.55);
}
.mh-dots { display: flex; gap: .4rem; justify-content: center; margin-top: 1rem; flex-wrap: wrap; }
.mh-dot {
  width: .5rem; height: .5rem; border-radius: 50%; border: none; cursor: pointer;
  background: var(--ink-line); transition: background .15s, transform .15s;
}
.mh-dot.is-active { background: var(--gold); transform: scale(1.3); }

/* cover */
.mh-cover { text-align: center; padding: 2rem 0; min-height: 26rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.1rem; }
.mh-cover-rule { width: 40%; height: 1px; background: rgba(120,90,40,.4); }
.mh-kicker { font-family: var(--mono); font-size: .65rem; letter-spacing: .3em; text-transform: uppercase; color: #9a7536; }
.mh-cover-title { font-family: var(--serif); font-size: clamp(2.2rem, 6vw, 3.6rem); margin: 0; color: #241c12; }
.mh-cover-sub { font-family: var(--serif); font-style: italic; color: #4a3c28; margin: 0; }
.mh-cover-stats { display: flex; gap: 2.2rem; margin: 1rem 0; }

/* sheet */
.mh-sheet-head { display: flex; align-items: baseline; gap: .8rem; }
.mh-sheet-num { font-family: var(--mono); font-size: .62rem; letter-spacing: .26em; text-transform: uppercase; color: #9a7536; }
.mh-sheet-kicker { font-family: var(--mono); font-size: .62rem; letter-spacing: .14em; color: rgba(80,60,30,.6); }
.mh-sheet-title { font-family: var(--serif); font-size: clamp(1.7rem, 4vw, 2.4rem); margin: .2rem 0 1.2rem; color: #241c12; border-bottom: 2px solid rgba(120,90,40,.25); padding-bottom: .6rem; }
.mh-sheet-body { font-size: .95rem; }

.mh-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem 1.5rem; }
.mh-grid-tight { grid-template-columns: repeat(2, 1fr); gap: .8rem 1.2rem; margin-bottom: 1rem; }
.mh-stat { }
.mh-stat-value { font-family: var(--serif); font-size: 1.7rem; color: #2a2014; line-height: 1.1; }
.mh-stat-label { font-family: var(--mono); font-size: .58rem; letter-spacing: .18em; text-transform: uppercase; color: rgba(80,60,30,.6); margin-top: .2rem; }
.mh-stat-big .mh-stat-value { font-size: 2.6rem; color: #9a7536; }

.mh-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.mh-list-sm { margin-top: 1rem; }
.mh-list-row { display: flex; align-items: center; gap: .7rem; padding: .55rem 0; border-bottom: 1px solid rgba(120,90,40,.18); }
.mh-list-main { flex: 1; min-width: 0; }
.mh-list-tag { font-family: var(--mono); font-size: .72rem; color: #6a5128; white-space: nowrap; }
.mh-tag-bad { color: #a04830; }
.mh-trophy { font-size: 1.1rem; flex: 0 0 auto; }
.mh-xleague { font-family: var(--mono); font-size: .68rem; color: rgba(80,60,30,.55); }
.mh-note { font-family: var(--serif); font-style: italic; color: #6a5128; margin: 0 0 .4rem; }
.mh-empty { font-family: var(--serif); font-style: italic; color: #5a4a32; line-height: 1.6; padding: 1.5rem 0; }

@media (max-width: 560px) {
  .mh-grid, .mh-grid-tight { grid-template-columns: 1fr 1fr; }
  .mh-cover-stats { gap: 1.2rem; }
}
`
