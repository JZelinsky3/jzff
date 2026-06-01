'use client'

import { useMemo, useState, type ReactNode } from 'react'
import type { CareerSummary, CareerLeagueSummary } from '@/lib/manager/career'

// A newspaper-style "book" of a career chronicle. Each chapter is a full, dense
// broadsheet page — masthead, ruled columns, stat tables, football motifs — and
// a sticky chapter rail (like the almanac's nav) jumps between them with a page
// flip. Pages scroll vertically; they are not constrained to one screen.

type Chapter = { id: string; label: string; node: ReactNode }

export function ChronicleBook({ summary }: { summary: CareerSummary }) {
  const chapters = useMemo(() => buildChapters(summary), [summary])
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<'next' | 'prev'>('next')

  const total = chapters.length
  function go(to: number, direction: 'next' | 'prev') {
    if (to < 0 || to >= total) return
    setDir(direction)
    setIndex(to)
    // Jump the page body back to the top on a chapter change.
    if (typeof document !== 'undefined') {
      document.getElementById('nb-book')?.scrollTo?.({ top: 0 })
      window.scrollTo({ top: (document.getElementById('nb-shell')?.offsetTop ?? 0) - 12, behavior: 'smooth' })
    }
  }

  return (
    <div className="nb-wrap" id="nb-shell">
      <style>{CSS}</style>

      {/* Chapter rail */}
      <nav className="nb-nav" aria-label="Chapters">
        {chapters.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className={`nb-tab ${i === index ? 'is-active' : ''}`}
            onClick={() => go(i, i > index ? 'next' : 'prev')}
          >
            <span className="nb-tab-num">{String(i + 1).padStart(2, '0')}</span>
            {c.label}
          </button>
        ))}
      </nav>

      <div className="nb-stage">
        <button className="nb-arrow" onClick={() => go(index - 1, 'prev')} disabled={index === 0} aria-label="Previous chapter">‹</button>

        <div className="nb-book" id="nb-book">
          <div key={index} className={`nb-page nb-page-${dir}`}>
            {chapters[index].node}
            <div className="nb-folio">
              <Football size={12} /> {summary.chronicle.displayName} · Page {index + 1} of {total}
            </div>
          </div>
        </div>

        <button className="nb-arrow" onClick={() => go(index + 1, 'next')} disabled={index === total - 1} aria-label="Next chapter">›</button>
      </div>
    </div>
  )
}

// ── chapter assembly ─────────────────────────────────────────────────────────

function buildChapters(s: CareerSummary): Chapter[] {
  const chapters: Chapter[] = []
  const t = s.totals
  const ready = s.leagues.filter((l) => l.status === 'ready')
  const decided = t.wins + t.losses
  const winPct = decided > 0 ? (t.winPct * 100).toFixed(1) : '—'
  const span = careerSpan(ready)

  // ── 1. Front page ──────────────────────────────────────────────────────────
  const lead = leadHeadline(s)
  chapters.push({
    id: 'front', label: 'Front Page', node: (
      <article className="nb-sheet">
        <Masthead title={`The ${s.chronicle.displayName} Chronicle`} sub={s.chronicle.subtitle ?? 'A career in full'} span={span} edition="Front Page" />
        <FieldDivider />
        <div className="nb-lead">
          <div className="nb-lead-kicker">★ Career Dispatch ★</div>
          <h2 className="nb-lead-head">{lead.head}</h2>
          <p className="nb-lead-sub">{lead.sub}</p>
        </div>
        <div className="nb-frontstats">
          <BigStat n={t.leagues} label="Leagues" />
          <BigStat n={t.seasonsPlayed} label="Seasons" />
          <BigStat n={`${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ''}`} label="All-time" small />
          <BigStat n={t.championships} label="Titles" gold />
          <BigStat n={`${winPct}%`} label="Win rate" small />
        </div>
        <FieldDivider />
        <div className="nb-columns">
          <p><span className="nb-dropcap">{firstLetter(s.chronicle.displayName)}</span>{frontProse(s, span)}</p>
        </div>
      </article>
    ),
  })

  // ── 2. The Ledger (by the numbers) ──────────────────────────────────────────
  chapters.push({
    id: 'ledger', label: 'The Ledger', node: (
      <article className="nb-sheet">
        <SectionHead num="I" title="The Ledger" kicker="By the numbers" />
        {decided === 0 ? (
          <Empty>No synced seasons yet — add a league and run a sync to fill the ledger.</Empty>
        ) : (
          <>
            <div className="nb-statgrid">
              <Cell label="Regular-season record" value={`${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ''}`} big />
              <Cell label="Win rate" value={`${winPct}%`} big />
              <Cell label="Playoff record" value={`${t.playoffWins}–${t.playoffLosses}`} big />
              <Cell label="Playoff appearances" value={t.playoffAppearances} big />
              <Cell label="Seasons played" value={t.seasonsPlayed} />
              <Cell label="Leagues" value={t.leagues} />
              <Cell label="Championships" value={t.championships} gold />
              <Cell label="Runner-up finishes" value={t.runnerUps} />
              <Cell label="Points for" value={Math.round(t.pointsFor).toLocaleString()} />
              <Cell label="Points against" value={Math.round(t.pointsAgainst).toLocaleString()} />
              <Cell label="Avg PF / season" value={t.seasonsPlayed ? Math.round(t.pointsFor / t.seasonsPlayed).toLocaleString() : '—'} />
              <Cell label="Net points" value={`${t.pointsFor - t.pointsAgainst >= 0 ? '+' : ''}${Math.round(t.pointsFor - t.pointsAgainst).toLocaleString()}`} />
            </div>
            <p className="nb-note">★ Consolation &amp; placement games (incl. the 5th-place game) are excluded — playoff figures count championship-bracket games only, matching the league almanac.</p>
          </>
        )}
      </article>
    ),
  })

  // ── 3. Trophy case ──────────────────────────────────────────────────────────
  chapters.push({
    id: 'trophies', label: 'Trophy Case', node: (
      <article className="nb-sheet">
        <SectionHead num="II" title="The Trophy Case" kicker={`${t.championships} titles · ${t.runnerUps} runner-ups`} />
        {s.trophyCase.length === 0 ? (
          <Empty>No titles or runner-up finishes on record yet. The case awaits its first plaque.</Empty>
        ) : (
          <div className="nb-trophies">
            {s.trophyCase.map((tr, i) => (
              <div key={i} className={`nb-plaque ${tr.kind === 'champion' ? 'is-champ' : ''}`}>
                <div className="nb-plaque-ico">{tr.kind === 'champion' ? '🏆' : '🥈'}</div>
                <div className="nb-plaque-year">{tr.year}</div>
                <div className="nb-plaque-league">{tr.leagueName}</div>
                <div className="nb-plaque-tag">{tr.kind === 'champion' ? 'Champion' : 'Runner-up'}</div>
              </div>
            ))}
          </div>
        )}
      </article>
    ),
  })

  // ── 4..n. Per-league chapters ───────────────────────────────────────────────
  let roman = 3
  for (const lg of s.leagues) {
    const numeral = toRoman(roman++)
    chapters.push({
      id: `lg-${lg.leagueId}`, label: shortLabel(lg.leagueName), node: (
        <article className="nb-sheet">
          {lg.status === 'pending' ? (
            <>
              <SectionHead num={numeral} title={lg.leagueName} kicker={`${lg.platform} · awaiting sync`} />
              <Empty>Not synced yet. Open <em>Manage hub</em> and run a sync to thread {lg.leagueName} into your chronicle.</Empty>
            </>
          ) : (
            <LeagueChapter lg={lg} numeral={numeral} />
          )}
        </article>
      ),
    })
  }

  // ── Rivalry desk ─────────────────────────────────────────────────────────────
  chapters.push({
    id: 'rivals', label: 'Rivalry Desk', node: (
      <article className="nb-sheet">
        <SectionHead num={toRoman(roman++)} title="The Rivalry Desk" kicker="Most-faced opponents, all leagues" />
        {s.topRivalries.length === 0 ? (
          <Empty>No head-to-head history yet — sync a league to meet your rivals.</Empty>
        ) : (
          <table className="nb-table">
            <thead>
              <tr><th>Opponent</th><th>Record</th><th>Games</th><th>Playoff</th><th>PF–PA</th></tr>
            </thead>
            <tbody>
              {s.topRivalries.map((r) => (
                <tr key={r.opponent}>
                  <td className="nb-td-name">{r.opponent}{r.leagues.length > 1 && <span className="nb-xl"> · {r.leagues.length} lgs</span>}</td>
                  <td className="nb-td-mono">{r.wins}–{r.losses}{r.ties ? `–${r.ties}` : ''}</td>
                  <td className="nb-td-mono">{r.games}</td>
                  <td className="nb-td-mono">{r.playoffGames || '—'}</td>
                  <td className="nb-td-mono">{Math.round(r.pointsFor)}–{Math.round(r.pointsAgainst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    ),
  })

  // ── Hall of Fame ──────────────────────────────────────────────────────────────
  chapters.push({
    id: 'fame', label: 'Hall of Fame', node: (
      <article className="nb-sheet">
        <SectionHead num={toRoman(roman++)} title="Hall of Fame" kicker="Signature wins" />
        <MomentsList moments={s.bestWins} kind="win" empty="Your biggest wins will be enshrined here once a league is synced." />
      </article>
    ),
  })

  // ── Hall of Pain ──────────────────────────────────────────────────────────────
  chapters.push({
    id: 'pain', label: 'Hall of Pain', node: (
      <article className="nb-sheet">
        <SectionHead num={toRoman(roman++)} title="Hall of Pain" kicker="Worst beats" />
        <MomentsList moments={s.worstLosses} kind="loss" empty="The losses you'd rather forget will live here. Sync to begin the suffering." />
      </article>
    ),
  })

  // ── Back page ─────────────────────────────────────────────────────────────────
  chapters.push({
    id: 'back', label: 'Back Page', node: (
      <article className="nb-sheet nb-sheet-center">
        <FieldDivider />
        <div className="nb-colophon">
          <Football size={40} />
          <div className="nb-lead-kicker">— End of Edition —</div>
          <p className="nb-colophon-text">
            A living record. Every sync sets the next chapter in type. Add another league to keep
            the presses running.
          </p>
          <div className="nb-colophon-mast">The {s.chronicle.displayName} Chronicle</div>
        </div>
        <FieldDivider />
      </article>
    ),
  })

  return chapters
}

// ── per-league chapter body ────────────────────────────────────────────────────

function LeagueChapter({ lg, numeral }: { lg: CareerLeagueSummary; numeral: string }) {
  const yrs = lg.firstYear && lg.lastYear ? (lg.firstYear === lg.lastYear ? `${lg.firstYear}` : `${lg.firstYear}–${lg.lastYear}`) : '—'
  return (
    <>
      <SectionHead num={numeral} title={lg.leagueName} kicker={`${lg.platform} · ${yrs}`} />
      <div className="nb-statgrid nb-statgrid-tight">
        <Cell label="Regular record" value={`${lg.wins}–${lg.losses}${lg.ties ? `–${lg.ties}` : ''}`} />
        <Cell label="Playoff record" value={`${lg.playoffWins}–${lg.playoffLosses}`} />
        <Cell label="Playoff trips" value={lg.playoffAppearances} />
        <Cell label="Titles" value={lg.championships} gold={lg.championships > 0} />
        <Cell label="Best finish" value={lg.bestFinish != null ? ordinal(lg.bestFinish) : '—'} />
        <Cell label="Seasons" value={lg.seasonsPlayed} />
      </div>
      {lg.titleYears.length > 0 && <p className="nb-note">★ Champion in {lg.titleYears.join(', ')}.</p>}
      {lg.finishes.length > 0 && (
        <table className="nb-table">
          <thead><tr><th>Year</th><th>Record</th><th>Finish</th><th>Postseason</th></tr></thead>
          <tbody>
            {lg.finishes.map((f) => (
              <tr key={f.year} className={f.champion ? 'is-title' : ''}>
                <td className="nb-td-mono">{f.year}</td>
                <td className="nb-td-mono">{f.wins}–{f.losses}{f.ties ? `–${f.ties}` : ''}</td>
                <td className="nb-td-mono">{f.rank != null ? ordinal(f.rank) : '—'}</td>
                <td>{f.champion ? '🏆 Champion' : f.madePlayoffs ? 'Made playoffs' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function MomentsList({ moments, kind, empty }: { moments: CareerSummary['bestWins']; kind: 'win' | 'loss'; empty: string }) {
  if (moments.length === 0) return <Empty>{empty}</Empty>
  return (
    <div className="nb-moments">
      {moments.map((m, i) => (
        <div key={i} className="nb-moment">
          <div className={`nb-moment-margin ${kind === 'loss' ? 'is-bad' : ''}`}>{m.margin > 0 ? '+' : ''}{m.margin.toFixed(1)}</div>
          <div className="nb-moment-body">
            <div className="nb-moment-score">{m.score.toFixed(1)} – {m.oppScore.toFixed(1)} <span className="nb-moment-vs">vs {m.opponent}</span></div>
            <div className="nb-moment-meta">{m.leagueName} · {m.year} · Week {m.week}{m.isPlayoff ? ' · Playoffs' : ''}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── presentational atoms ────────────────────────────────────────────────────────

function Masthead({ title, sub, span, edition }: { title: string; sub: string; span: string; edition: string }) {
  return (
    <header className="nb-mast">
      <div className="nb-mast-rule" />
      <div className="nb-mast-meta">
        <span>Est. {span}</span>
        <span>★</span>
        <span>{edition}</span>
      </div>
      <h1 className="nb-mast-title">{title}</h1>
      <div className="nb-mast-rule" />
      <div className="nb-mast-sub">{sub}</div>
    </header>
  )
}

function SectionHead({ num, title, kicker }: { num: string; title: string; kicker?: string }) {
  return (
    <header className="nb-sechead">
      <div className="nb-sechead-top">
        <span className="nb-sechead-num">§ {num}</span>
        {kicker && <span className="nb-sechead-kicker">{kicker}</span>}
      </div>
      <h2 className="nb-sechead-title">{title}</h2>
    </header>
  )
}

function BigStat({ n, label, gold, small }: { n: ReactNode; label: string; gold?: boolean; small?: boolean }) {
  return (
    <div className="nb-bigstat">
      <div className={`nb-bigstat-n ${gold ? 'is-gold' : ''} ${small ? 'is-small' : ''}`}>{n}</div>
      <div className="nb-bigstat-l">{label}</div>
    </div>
  )
}

function Cell({ label, value, big, gold }: { label: string; value: ReactNode; big?: boolean; gold?: boolean }) {
  return (
    <div className={`nb-cell ${big ? 'is-big' : ''}`}>
      <div className={`nb-cell-v ${gold ? 'is-gold' : ''}`}>{value}</div>
      <div className="nb-cell-l">{label}</div>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="nb-empty">{children}</div>
}

function FieldDivider() {
  return (
    <div className="nb-field" aria-hidden>
      <div className="nb-field-hash" />
      <Football size={16} />
      <div className="nb-field-hash" />
    </div>
  )
}

function Football({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 32 20" aria-hidden style={{ flex: '0 0 auto' }}>
      <ellipse cx="16" cy="10" rx="15" ry="9" fill="#6b3f1d" stroke="#3a2410" strokeWidth="1.5" />
      <line x1="10" y1="10" x2="22" y2="10" stroke="#f5edd9" strokeWidth="1.4" />
      <line x1="12" y1="7" x2="12" y2="13" stroke="#f5edd9" strokeWidth="1.2" />
      <line x1="15" y1="7" x2="15" y2="13" stroke="#f5edd9" strokeWidth="1.2" />
      <line x1="18" y1="7" x2="18" y2="13" stroke="#f5edd9" strokeWidth="1.2" />
      <line x1="21" y1="7" x2="21" y2="13" stroke="#f5edd9" strokeWidth="1.2" />
    </svg>
  )
}

// ── prose + helpers ─────────────────────────────────────────────────────────────

function leadHeadline(s: CareerSummary): { head: string; sub: string } {
  const t = s.totals
  if (t.championships >= 3) return { head: `A Dynasty in ${t.leagues} ${t.leagues === 1 ? 'League' : 'Leagues'}`, sub: `${t.championships} championships and counting.` }
  if (t.championships >= 1) return { head: `${t.championships}× Champion`, sub: `${t.seasonsPlayed} seasons, ${t.wins}–${t.losses} all-time.` }
  if (t.playoffAppearances >= 3) return { head: 'Perennial Contender', sub: `${t.playoffAppearances} playoff appearances, still chasing the ring.` }
  if (t.seasonsPlayed > 0) return { head: 'The Grind Continues', sub: `${t.seasonsPlayed} seasons across ${t.leagues} ${t.leagues === 1 ? 'league' : 'leagues'}.` }
  return { head: 'A New Chronicle Opens', sub: 'Sync your leagues to write the first chapter.' }
}

function frontProse(s: CareerSummary, span: string): string {
  const t = s.totals
  if (t.seasonsPlayed === 0) return `his chronicle is freshly bound and waiting. Link your leagues, pick which manager is you, and run a sync — every season, every matchup, and every trophy will be set into these pages automatically.`
  const titlePhrase = t.championships > 0 ? `${t.championships} championship${t.championships === 1 ? '' : 's'}` : 'no titles yet, but the chase is on'
  const playoffPhrase = t.playoffAppearances > 0 ? `${t.playoffAppearances} trip${t.playoffAppearances === 1 ? '' : 's'} to the postseason` : 'a postseason berth still pending'
  return `cross ${t.leagues} ${t.leagues === 1 ? 'league' : 'leagues'} and ${t.seasonsPlayed} season${t.seasonsPlayed === 1 ? '' : 's'} (${span}), the record reads ${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ''} with ${titlePhrase} and ${playoffPhrase}. The desks that follow break it down league by league, rival by rival.`
}

function careerSpan(ready: CareerLeagueSummary[]): string {
  let lo = Infinity, hi = -Infinity
  for (const l of ready) {
    if (l.firstYear != null) lo = Math.min(lo, l.firstYear)
    if (l.lastYear != null) hi = Math.max(hi, l.lastYear)
  }
  if (lo === Infinity) return '—'
  return lo === hi ? `${lo}` : `${lo}–${hi}`
}

function firstLetter(name: string): string {
  return (name.trim()[0] ?? 'A').toUpperCase()
}

function shortLabel(name: string): string {
  const clean = name.trim()
  return clean.length <= 14 ? clean : clean.slice(0, 13) + '…'
}

function toRoman(n: number): string {
  const map: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = '', v = n
  for (const [val, sym] of map) while (v >= val) { out += sym; v -= val }
  return out || 'I'
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ── styles ───────────────────────────────────────────────────────────────────────

const CSS = `
.nb-wrap { max-width: 1000px; margin: 0 auto 3rem; padding: 0 1rem; }

/* chapter rail */
.nb-nav {
  display: flex; gap: .25rem; overflow-x: auto; padding: .4rem .2rem;
  margin-bottom: .9rem; border-top: 1px solid var(--ink-line); border-bottom: 1px solid var(--ink-line);
  scrollbar-width: thin;
}
.nb-tab {
  flex: 0 0 auto; display: inline-flex; align-items: center; gap: .4rem;
  padding: .4rem .7rem; background: none; border: 1px solid transparent; border-radius: 2px;
  color: var(--cream-soft); cursor: pointer;
  font-family: var(--mono); font-size: .62rem; letter-spacing: .12em; text-transform: uppercase;
  white-space: nowrap; transition: background .15s, color .15s, border-color .15s;
}
.nb-tab:hover { color: var(--cream); background: var(--ink-soft); }
.nb-tab.is-active { color: var(--ink, #1a1410); background: var(--gold); border-color: var(--gold); }
.nb-tab-num { opacity: .55; font-size: .9em; }

.nb-stage { display: flex; align-items: flex-start; gap: .5rem; }
.nb-book { flex: 1; perspective: 2400px; min-width: 0; }
.nb-arrow {
  position: sticky; top: 45vh; flex: 0 0 auto; width: 2.4rem; height: 2.4rem; border-radius: 50%;
  background: var(--ink-soft); color: var(--gold); border: 1px solid var(--ink-line);
  cursor: pointer; font-size: 1.4rem; line-height: 1; display: inline-flex; align-items: center; justify-content: center;
}
.nb-arrow:hover:not(:disabled) { background: rgba(232,200,137,.14); }
.nb-arrow:disabled { opacity: .2; cursor: default; }

/* the page */
.nb-page {
  position: relative; transform-origin: left center;
  background-color: #f3ead4;
  background-image:
    radial-gradient(circle at 20% 10%, rgba(120,90,40,.05), transparent 40%),
    radial-gradient(circle at 80% 80%, rgba(120,90,40,.06), transparent 45%);
  color: #241c12;
  border: 1px solid rgba(120,90,40,.3);
  border-radius: 2px 7px 7px 2px;
  box-shadow: 0 20px 55px rgba(0,0,0,.5), inset 0 0 80px rgba(150,110,50,.07);
}
.nb-page-next { animation: nbFlipNext .5s cubic-bezier(.2,.7,.2,1); }
.nb-page-prev { animation: nbFlipPrev .5s cubic-bezier(.2,.7,.2,1); }
@keyframes nbFlipNext { from { transform: rotateY(-18deg); opacity: 0 } to { transform: rotateY(0); opacity: 1 } }
@keyframes nbFlipPrev { from { transform: rotateY(18deg); opacity: 0 } to { transform: rotateY(0); opacity: 1 } }

.nb-sheet { padding: 2rem clamp(1.2rem, 4vw, 3.2rem) 3rem; }
.nb-sheet-center { display: flex; flex-direction: column; justify-content: center; min-height: 32rem; }
.nb-folio { padding: .8rem 1.4rem 1.1rem; display: flex; align-items: center; gap: .5rem; font-family: var(--mono); font-size: .58rem; letter-spacing: .14em; color: rgba(80,60,30,.55); border-top: 1px solid rgba(120,90,40,.2); }

/* masthead */
.nb-mast { text-align: center; }
.nb-mast-rule { height: 2px; background: #2a1f12; margin: .3rem 0; }
.nb-mast-meta { display: flex; justify-content: center; gap: 1rem; font-family: var(--mono); font-size: .58rem; letter-spacing: .2em; text-transform: uppercase; color: #6a5128; padding: .2rem 0; }
.nb-mast-title { font-family: var(--serif); font-weight: 800; font-size: clamp(1.9rem, 6vw, 3.6rem); line-height: 1.02; margin: .2rem 0; color: #1c1409; letter-spacing: -.01em; }
.nb-mast-sub { font-family: var(--serif); font-style: italic; color: #4a3c28; font-size: 1rem; padding-top: .3rem; }

/* football field divider */
.nb-field { display: flex; align-items: center; gap: .6rem; margin: 1.4rem 0; }
.nb-field-hash { flex: 1; height: 8px; background-image: repeating-linear-gradient(90deg, #2a7d46 0 14px, #226a3b 14px 16px); border-radius: 2px; opacity: .55; }

/* lead */
.nb-lead { text-align: center; margin: 1rem 0; }
.nb-lead-kicker { font-family: var(--mono); font-size: .62rem; letter-spacing: .28em; text-transform: uppercase; color: #9a7536; }
.nb-lead-head { font-family: var(--serif); font-weight: 800; font-size: clamp(1.5rem, 4.5vw, 2.6rem); margin: .4rem 0 .2rem; color: #201809; }
.nb-lead-sub { font-family: var(--serif); font-style: italic; color: #4a3c28; margin: 0; }

.nb-frontstats { display: flex; flex-wrap: wrap; justify-content: center; gap: 1.4rem 2rem; margin: 1.2rem 0; }
.nb-bigstat { text-align: center; }
.nb-bigstat-n { font-family: var(--serif); font-weight: 800; font-size: 2.4rem; line-height: 1; color: #241809; }
.nb-bigstat-n.is-small { font-size: 1.5rem; }
.nb-bigstat-n.is-gold { color: #9a7536; }
.nb-bigstat-l { font-family: var(--mono); font-size: .55rem; letter-spacing: .18em; text-transform: uppercase; color: #6a5128; margin-top: .25rem; }

/* columns + dropcap */
.nb-columns { columns: 2; column-gap: 2rem; column-rule: 1px solid rgba(120,90,40,.25); font-family: var(--serif); font-size: .95rem; line-height: 1.6; color: #2e2416; text-align: justify; }
.nb-columns p { margin: 0; }
.nb-dropcap { float: left; font-family: var(--serif); font-weight: 800; font-size: 3.4rem; line-height: .8; padding: .15rem .4rem .1rem 0; color: #9a7536; }
@media (max-width: 620px) { .nb-columns { columns: 1; } }

/* section heads */
.nb-sechead { border-bottom: 3px double #2a1f12; padding-bottom: .6rem; margin-bottom: 1.3rem; }
.nb-sechead-top { display: flex; align-items: baseline; gap: .8rem; }
.nb-sechead-num { font-family: var(--mono); font-size: .6rem; letter-spacing: .24em; text-transform: uppercase; color: #9a7536; }
.nb-sechead-kicker { font-family: var(--mono); font-size: .6rem; letter-spacing: .12em; color: rgba(80,60,30,.6); }
.nb-sechead-title { font-family: var(--serif); font-weight: 800; font-size: clamp(1.7rem, 4.5vw, 2.6rem); margin: .25rem 0 0; color: #1c1409; }

/* stat grid */
.nb-statgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: rgba(120,90,40,.25); border: 1px solid rgba(120,90,40,.25); }
.nb-statgrid-tight { grid-template-columns: repeat(3, 1fr); }
.nb-cell { background: #f3ead4; padding: .9rem .8rem; }
.nb-cell-v { font-family: var(--serif); font-weight: 700; font-size: 1.3rem; color: #2a2014; line-height: 1.05; }
.nb-cell.is-big .nb-cell-v { font-size: 1.7rem; }
.nb-cell-v.is-gold { color: #9a7536; }
.nb-cell-l { font-family: var(--mono); font-size: .52rem; letter-spacing: .14em; text-transform: uppercase; color: rgba(80,60,30,.62); margin-top: .3rem; }
@media (max-width: 620px) { .nb-statgrid, .nb-statgrid-tight { grid-template-columns: repeat(2, 1fr); } }

.nb-note { font-family: var(--serif); font-style: italic; font-size: .82rem; color: #6a5128; margin: 1rem 0 0; line-height: 1.5; }

/* tables */
.nb-table { width: 100%; border-collapse: collapse; margin-top: 1.2rem; font-size: .9rem; }
.nb-table th { text-align: left; font-family: var(--mono); font-size: .56rem; letter-spacing: .14em; text-transform: uppercase; color: #6a5128; border-bottom: 2px solid #2a1f12; padding: .4rem .5rem; }
.nb-table td { padding: .5rem .5rem; border-bottom: 1px solid rgba(120,90,40,.2); color: #2e2416; }
.nb-table tr.is-title td { background: rgba(232,200,137,.22); }
.nb-td-mono { font-family: var(--mono); font-size: .82rem; }
.nb-td-name { font-weight: 600; }
.nb-xl { font-family: var(--mono); font-size: .68rem; color: rgba(80,60,30,.55); }

/* trophies */
.nb-trophies { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: .8rem; }
.nb-plaque { border: 1px solid rgba(120,90,40,.35); border-radius: 3px; padding: 1rem .8rem; text-align: center; background: #efe4ca; }
.nb-plaque.is-champ { border-color: #c9a44e; background: rgba(232,200,137,.25); }
.nb-plaque-ico { font-size: 1.6rem; }
.nb-plaque-year { font-family: var(--serif); font-weight: 800; font-size: 1.4rem; color: #241809; }
.nb-plaque-league { font-size: .82rem; color: #4a3c28; }
.nb-plaque-tag { font-family: var(--mono); font-size: .54rem; letter-spacing: .16em; text-transform: uppercase; color: #9a7536; margin-top: .3rem; }

/* moments */
.nb-moments { display: flex; flex-direction: column; gap: .6rem; }
.nb-moment { display: flex; align-items: center; gap: 1rem; border-bottom: 1px solid rgba(120,90,40,.2); padding: .6rem 0; }
.nb-moment-margin { flex: 0 0 4.2rem; text-align: center; font-family: var(--serif); font-weight: 800; font-size: 1.5rem; color: #2a7d46; }
.nb-moment-margin.is-bad { color: #a04830; }
.nb-moment-score { font-family: var(--serif); font-size: 1.05rem; color: #241809; }
.nb-moment-vs { font-style: italic; color: #4a3c28; }
.nb-moment-meta { font-family: var(--mono); font-size: .62rem; letter-spacing: .08em; color: rgba(80,60,30,.6); margin-top: .15rem; }

.nb-empty { font-family: var(--serif); font-style: italic; color: #5a4a32; line-height: 1.6; padding: 2rem 0; text-align: center; }

/* colophon */
.nb-colophon { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 1.5rem 0; }
.nb-colophon-text { font-family: var(--serif); font-style: italic; color: #4a3c28; max-width: 26rem; line-height: 1.6; margin: 0; }
.nb-colophon-mast { font-family: var(--serif); font-weight: 800; font-size: 1.2rem; color: #241809; }
`
