'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CareerSummary, CareerLeagueSummary } from '@/lib/manager/career'

// The career chronicle as a full-screen scrolling broadsheet. Built from the
// same heavy components the almanac's manager page uses — profile header, stat
// strip, regular/playoff split, season ledger, head-to-head and top-performance
// tables — but laid out and dressed as a newspaper, with a sticky chapter rail
// (like the almanac nav) that jumps between sections.

export function ChronicleBook({ summary }: { summary: CareerSummary }) {
  const sections = useMemo(() => buildSections(summary), [summary])
  const [active, setActive] = useState(sections[0]?.id ?? '')
  const railRef = useRef<HTMLDivElement>(null)

  // Highlight the chapter currently in view.
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
    if (els.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: [0, 0.25, 0.5] },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [sections])

  // Keep the active tab scrolled into view in the rail.
  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const tab = rail.querySelector<HTMLElement>(`[data-tab="${active}"]`)
    tab?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [active])

  function jump(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mh">
      <style>{CSS}</style>

      <nav className="mh-rail" ref={railRef} aria-label="Chapters">
        {sections.map((s, i) => (
          <button
            key={s.id}
            data-tab={s.id}
            type="button"
            className={`mh-tab ${active === s.id ? 'is-active' : ''}`}
            onClick={() => jump(s.id)}
          >
            <span className="mh-tab-num">{String(i + 1).padStart(2, '0')}</span>
            {s.label}
          </button>
        ))}
      </nav>

      <div className="mh-paper">
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="mh-sec">
            {s.node}
          </section>
        ))}
      </div>
    </div>
  )
}

// ── sections ─────────────────────────────────────────────────────────────────

type Section = { id: string; label: string; node: ReactNode }

function buildSections(s: CareerSummary): Section[] {
  const out: Section[] = []
  const t = s.totals
  const ready = s.leagues.filter((l) => l.status === 'ready')
  const span = careerSpan(ready)
  const regGames = t.wins + t.losses + t.ties
  const totalGames = regGames + t.playoffWins + t.playoffLosses
  const lead = leadHeadline(s)

  // ── Front page / masthead ───────────────────────────────────────────────
  out.push({
    id: 'front', label: 'Front Page', node: (
      <div className="mh-front">
        <header className="mh-mast">
          <div className="mh-mast-rule mh-mast-rule-thick" />
          <div className="mh-mast-meta">
            <span>Vol. {romanOr(t.seasonsPlayed)}</span>
            <span>★</span>
            <span>The {s.chronicle.displayName} Chronicle</span>
            <span>★</span>
            <span>Est. {span}</span>
          </div>
          <h1 className="mh-mast-title">{s.chronicle.displayName}<em>.</em></h1>
          <div className="mh-mast-rule" />
          <p className="mh-mast-tag">{s.chronicle.subtitle || lead.sub}</p>
        </header>

        {t.championships > 0 && (
          <div className="mh-seals">
            {seriesYears(s).map((y) => <Seal key={y} year={y} />)}
          </div>
        )}

        <FieldRule />

        <div className="mh-lead">
          <div className="mh-kicker">★ Career Dispatch ★</div>
          <h2 className="mh-lead-head">{lead.head}</h2>
        </div>

        <div className="mh-cols">
          <p><span className="mh-dropcap">{firstLetter(s.chronicle.displayName)}</span>{frontProse(s, span, totalGames)}</p>
        </div>
      </div>
    ),
  })

  // ── The Ledger ──────────────────────────────────────────────────────────
  const regPct = regGames > 0 ? t.wins / (t.wins + t.losses || 1) : 0
  const plGames = t.playoffWins + t.playoffLosses
  const plPct = plGames > 0 ? t.playoffWins / plGames : 0
  out.push({
    id: 'ledger', label: 'The Ledger', node: (
      <>
        <SecHead num="§ 01" title="The Ledger —" meta="career, by the numbers" />
        {regGames === 0 ? (
          <Empty>No synced seasons yet. Add a league and run a sync to fill the ledger.</Empty>
        ) : (
          <>
            <div className="mh-strip">
              <Strip label="Leagues" value={t.leagues} detail="in the hub" cream />
              <Strip label="Seasons" value={t.seasonsPlayed} detail={span} />
              <Strip label="Total games" value={totalGames} detail="reg + playoff" cream />
              <Strip label="Championships" value={t.championships} detail={t.championships ? 'engraved' : 'still chasing'} />
              <Strip label="Playoff trips" value={t.playoffAppearances} detail="postseasons" />
              <Strip label="Runner-ups" value={t.runnerUps} detail="so close" cream />
            </div>

            <div className="mh-split">
              <div className="mh-splitcol">
                <div className="mh-split-lbl">Regular Season</div>
                <div className="mh-split-rec">{t.wins}–{t.losses}{t.ties ? `–${t.ties}` : ''}</div>
                <div className="mh-split-pct">{fmtPct(regPct)} win pct</div>
                <div className="mh-split-pf">PF {Math.round(t.pointsFor).toLocaleString()} · PA {Math.round(t.pointsAgainst).toLocaleString()}</div>
              </div>
              <div className="mh-splitcol is-playoff">
                <div className="mh-split-lbl">Playoffs</div>
                <div className="mh-split-rec">{t.playoffWins}–{t.playoffLosses}</div>
                <div className="mh-split-pct">{plGames ? `${fmtPct(plPct)} win pct` : 'no playoff games yet'}</div>
                <div className="mh-split-pf">PF {Math.round(t.playoffPointsFor).toLocaleString()} · PA {Math.round(t.playoffPointsAgainst).toLocaleString()}</div>
              </div>
            </div>
            <p className="mh-foot">★ Championship-bracket games only. Consolation &amp; placement games (incl. the 5th-place game) are excluded — same rules as the league almanac.</p>
          </>
        )}
      </>
    ),
  })

  // ── Trophy case ─────────────────────────────────────────────────────────
  out.push({
    id: 'trophies', label: 'Trophy Case', node: (
      <>
        <SecHead num="§ 02" title="The Trophy Case —" meta={`${t.championships} titles · ${t.runnerUps} runner-ups`} />
        {s.trophyCase.length === 0 ? (
          <Empty>No titles or runner-up finishes on record yet. The case awaits its first plaque.</Empty>
        ) : (
          <div className="mh-trophies">
            {s.trophyCase.map((tr, i) => (
              <div key={i} className={`mh-plaque ${tr.kind === 'champion' ? 'is-champ' : ''}`}>
                {tr.kind === 'champion' ? <Seal year={tr.year} small /> : <div className="mh-plaque-ico">🥈</div>}
                <div className="mh-plaque-year">{tr.year}</div>
                <div className="mh-plaque-league">{tr.leagueName}</div>
                <div className="mh-plaque-tag">{tr.kind === 'champion' ? 'Champion' : 'Runner-up'}</div>
              </div>
            ))}
          </div>
        )}
      </>
    ),
  })

  // ── Per-league chapters ─────────────────────────────────────────────────
  let n = 3
  for (const lg of s.leagues) {
    const num = `§ ${String(n).padStart(2, '0')}`
    n++
    out.push({
      id: `lg-${lg.leagueId}`, label: shortLabel(lg.leagueName),
      node: lg.status === 'pending' ? (
        <>
          <SecHead num={num} title={`${lg.leagueName} —`} meta={`${lg.platform} · awaiting sync`} />
          <Empty>Not synced yet. Open <em>Manage hub</em> and run a sync to thread {lg.leagueName} into your chronicle.</Empty>
        </>
      ) : <LeagueSection lg={lg} num={num} />,
    })
  }

  // ── Rivalry desk ────────────────────────────────────────────────────────
  out.push({
    id: 'rivals', label: 'Rivalries', node: (
      <>
        <SecHead num={`§ ${String(n++).padStart(2, '0')}`} title="The Rivalry Desk —" meta="most-faced, every league" />
        {s.topRivalries.length === 0 ? (
          <Empty>No head-to-head history yet — sync a league to meet your rivals.</Empty>
        ) : (
          <div className="mh-table">
            <table>
              <thead><tr><th>Opponent</th><th className="num">Record</th><th className="num">Playoff</th><th className="num">Games</th><th className="num">PF–PA</th></tr></thead>
              <tbody>
                {s.topRivalries.map((r) => {
                  const cls = r.wins > r.losses ? 'win' : r.losses > r.wins ? 'loss' : 'even'
                  return (
                    <tr key={r.opponent}>
                      <td className="opp">{r.opponent}{r.leagues.length > 1 && <span className="mh-xl"> · {r.leagues.length} lgs</span>}</td>
                      <td className={`num rec ${cls}`}>{r.wins}–{r.losses}{r.ties ? `–${r.ties}` : ''}</td>
                      <td className="num">{r.playoffGames || '—'}</td>
                      <td className="num">{r.games}</td>
                      <td className="num">{Math.round(r.pointsFor)}–{Math.round(r.pointsAgainst)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </>
    ),
  })

  // ── Halls ───────────────────────────────────────────────────────────────
  out.push({
    id: 'fame', label: 'Hall of Fame', node: (
      <>
        <SecHead num={`§ ${String(n++).padStart(2, '0')}`} title="Hall of Fame —" meta="signature wins" />
        <Moments moments={s.bestWins} kind="win" empty="Your biggest wins will be enshrined here once a league is synced." />
      </>
    ),
  })
  out.push({
    id: 'pain', label: 'Hall of Pain', node: (
      <>
        <SecHead num={`§ ${String(n++).padStart(2, '0')}`} title="Hall of Pain —" meta="worst beats" />
        <Moments moments={s.worstLosses} kind="loss" empty="The losses you'd rather forget will live here. Sync to begin the suffering." />
      </>
    ),
  })

  return out
}

// ── per-league section ───────────────────────────────────────────────────────

function LeagueSection({ lg, num }: { lg: CareerLeagueSummary; num: string }) {
  const yrs = lg.firstYear && lg.lastYear ? (lg.firstYear === lg.lastYear ? `${lg.firstYear}` : `${lg.firstYear}–${lg.lastYear}`) : '—'
  const regGames = lg.wins + lg.losses + lg.ties
  const regPct = regGames > 0 ? lg.wins / (lg.wins + lg.losses || 1) : 0
  return (
    <>
      <SecHead num={num} title={`${lg.leagueName} —`} meta={`${lg.platform} · ${yrs}`} />
      <div className="mh-strip mh-strip-4">
        <Strip label="Reg. record" value={`${lg.wins}–${lg.losses}${lg.ties ? `–${lg.ties}` : ''}`} detail={`${fmtPct(regPct)} pct`} cream />
        <Strip label="Playoff" value={`${lg.playoffWins}–${lg.playoffLosses}`} detail={`${lg.playoffAppearances} trips`} />
        <Strip label="Titles" value={lg.championships} detail={lg.titleYears.length ? lg.titleYears.join(', ') : '—'} />
        <Strip label="Best finish" value={lg.bestFinish != null ? ordinal(lg.bestFinish) : '—'} detail={`${lg.seasonsPlayed} seasons`} cream />
      </div>
      {lg.finishes.length > 0 && (
        <div className="mh-table">
          <table>
            <thead><tr><th>Year</th><th className="num">Record</th><th className="num">Finish</th><th>Postseason</th></tr></thead>
            <tbody>
              {lg.finishes.map((f) => (
                <tr key={f.year} className={f.champion ? 'is-title' : ''}>
                  <td className="year">{f.year}</td>
                  <td className="num">{f.wins}–{f.losses}{f.ties ? `–${f.ties}` : ''}</td>
                  <td className={`num finish ${f.rank === 1 ? 'gold' : f.rank === 2 ? 'silver' : f.rank === 3 ? 'bronze' : ''}`}>{f.rank === 1 ? '★ 1st' : f.rank != null ? ordinal(f.rank) : '—'}</td>
                  <td>{f.champion ? '🏆 Champion' : f.madePlayoffs ? 'Made playoffs' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function Moments({ moments, kind, empty }: { moments: CareerSummary['bestWins']; kind: 'win' | 'loss'; empty: string }) {
  if (moments.length === 0) return <Empty>{empty}</Empty>
  return (
    <div className="mh-table">
      <table>
        <thead><tr><th className="num">#</th><th className="num">Score</th><th>Opponent</th><th className="num">Margin</th><th>When</th></tr></thead>
        <tbody>
          {moments.map((m, i) => (
            <tr key={i}>
              <td className={`num rank ${i === 0 ? 'gold' : ''}`}>{i + 1}</td>
              <td className="num score">{m.score.toFixed(1)} – {m.oppScore.toFixed(1)}</td>
              <td className="opp">{m.opponent}</td>
              <td className={`num result ${kind === 'win' ? 'win' : 'loss'}`}>{m.margin > 0 ? '+' : ''}{m.margin.toFixed(1)}</td>
              <td className="mh-when">{m.leagueName} · {m.year} · W{m.week}{m.isPlayoff ? ' · PO' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── atoms ─────────────────────────────────────────────────────────────────────

function SecHead({ num, title, meta }: { num: string; title: string; meta: string }) {
  return (
    <div className="section-header mh-sechead">
      <span className="section-num">{num}</span>
      <span className="section-title">{title}</span>
      <span className="section-meta">{meta}</span>
    </div>
  )
}

function Strip({ label, value, detail, cream }: { label: string; value: ReactNode; detail?: string; cream?: boolean }) {
  return (
    <div className="mh-stripitem">
      <div className="mh-strip-lbl">{label}</div>
      <div className={`mh-strip-val ${cream ? 'is-cream' : ''}`}>{value}</div>
      {detail && <div className="mh-strip-det">{detail}</div>}
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="mh-empty">{children}</div>
}

function FieldRule() {
  return (
    <div className="mh-fieldrule" aria-hidden>
      <span className="mh-hash" />
      <Football />
      <span className="mh-hash" />
    </div>
  )
}

function Football() {
  return (
    <svg width="26" height="16" viewBox="0 0 32 20" aria-hidden style={{ flex: '0 0 auto' }}>
      <ellipse cx="16" cy="10" rx="15" ry="9" fill="none" stroke="var(--gold)" strokeWidth="1.4" />
      <line x1="10" y1="10" x2="22" y2="10" stroke="var(--gold)" strokeWidth="1.2" />
      <line x1="12.5" y1="7" x2="12.5" y2="13" stroke="var(--gold)" strokeWidth="1" />
      <line x1="16" y1="6.5" x2="16" y2="13.5" stroke="var(--gold)" strokeWidth="1" />
      <line x1="19.5" y1="7" x2="19.5" y2="13" stroke="var(--gold)" strokeWidth="1" />
    </svg>
  )
}

// Simplified champion seal, echoing the almanac's mini-seal.
function Seal({ year, small }: { year: number; small?: boolean }) {
  const sz = small ? 58 : 78
  return (
    <svg className="mh-seal" width={sz} height={sz} viewBox="0 0 200 200" aria-hidden>
      <circle cx="100" cy="100" r="92" fill="none" stroke="var(--gold)" strokeWidth="1.5" opacity="0.4" />
      <circle cx="100" cy="100" r="86" fill="none" stroke="var(--gold)" strokeWidth="0.5" opacity="0.6" />
      <polygon points="100,40 103,50 113,50 105,56 108,66 100,60 92,66 95,56 87,50 97,50" fill="var(--gold)" />
      <text x="100" y="128" fill="var(--cream)" fontFamily="var(--serif)" fontStyle="italic" fontSize="58" textAnchor="middle">★</text>
      <line x1="74" y1="142" x2="126" y2="142" stroke="var(--gold)" strokeWidth="0.8" />
      <text x="100" y="158" fill="var(--cream-mute)" fontFamily="var(--mono)" fontSize="13" fontWeight="700" letterSpacing="2" textAnchor="middle">{year}</text>
    </svg>
  )
}

// ── prose + helpers ───────────────────────────────────────────────────────────

function leadHeadline(s: CareerSummary): { head: string; sub: string } {
  const t = s.totals
  if (t.championships >= 3) return { head: `A Dynasty Across ${t.leagues} ${t.leagues === 1 ? 'League' : 'Leagues'}`, sub: `${t.championships} championships and counting.` }
  if (t.championships >= 1) return { head: `${t.championships}× Champion`, sub: `${t.seasonsPlayed} seasons, ${t.wins}–${t.losses} all-time.` }
  if (t.playoffAppearances >= 3) return { head: 'A Perennial Contender', sub: `${t.playoffAppearances} playoff appearances, still chasing the ring.` }
  if (t.seasonsPlayed > 0) return { head: 'The Grind Continues', sub: `${t.seasonsPlayed} seasons across ${t.leagues} ${t.leagues === 1 ? 'league' : 'leagues'}.` }
  return { head: 'A New Chronicle Opens', sub: 'Sync your leagues to write the first chapter.' }
}

function frontProse(s: CareerSummary, span: string, totalGames: number): string {
  const t = s.totals
  if (t.seasonsPlayed === 0) return `his chronicle is freshly bound and waiting. Link your leagues, choose which manager is you, and run a sync — every season, every matchup, and every trophy will be set into these pages automatically.`
  const titlePhrase = t.championships > 0 ? `${t.championships} championship${t.championships === 1 ? '' : 's'}` : 'no titles yet, though the chase is alive'
  const playoffPhrase = t.playoffAppearances > 0 ? `${t.playoffAppearances} trip${t.playoffAppearances === 1 ? '' : 's'} to the postseason` : 'a postseason berth still pending'
  return `cross ${t.leagues} ${t.leagues === 1 ? 'league' : 'leagues'} and ${t.seasonsPlayed} season${t.seasonsPlayed === 1 ? '' : 's'} (${span}), ${totalGames} games have been played. The record reads ${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ''} with ${titlePhrase} and ${playoffPhrase}. The desks that follow break it down league by league and rival by rival — the full account of a manager's career, set in type.`
}

function seriesYears(s: CareerSummary): number[] {
  return s.trophyCase.filter((t) => t.kind === 'champion').map((t) => t.year).sort((a, b) => a - b)
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

function fmtPct(p: number): string {
  return p.toFixed(3).replace(/^0\./, '.')
}
function firstLetter(name: string): string { return (name.trim()[0] ?? 'A').toUpperCase() }
function shortLabel(name: string): string { const c = name.trim(); return c.length <= 14 ? c : c.slice(0, 13) + '…' }
function ordinal(n: number): string { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }
function romanOr(n: number): string {
  if (n <= 0) return 'I'
  const map: [number, string][] = [[40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = '', v = n
  for (const [val, sym] of map) while (v >= val) { out += sym; v -= val }
  return out
}

// ── styles ───────────────────────────────────────────────────────────────────────

const CSS = `
.mh { max-width: 1040px; margin: 0 auto 4rem; padding: 0 1rem; }

/* sticky chapter rail */
.mh-rail {
  position: sticky; top: 0; z-index: 30;
  display: flex; gap: .25rem; overflow-x: auto;
  padding: .5rem .25rem; margin-bottom: 1.5rem;
  background: color-mix(in srgb, var(--ink) 88%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--ink-line);
  scrollbar-width: thin;
}
.mh-tab {
  flex: 0 0 auto; display: inline-flex; align-items: center; gap: .4rem;
  padding: .45rem .8rem; background: none; border: 1px solid transparent; border-radius: 2px;
  color: var(--cream-mute); cursor: pointer;
  font-family: var(--mono); font-weight: 700; font-size: .6rem; letter-spacing: .16em; text-transform: uppercase;
  white-space: nowrap; transition: all .15s;
}
.mh-tab:hover { color: var(--cream); background: var(--ink-soft); }
.mh-tab.is-active { color: var(--ink); background: var(--gold); border-color: var(--gold); }
.mh-tab-num { opacity: .5; }

/* the broadsheet */
.mh-paper {
  background:
    linear-gradient(180deg, rgba(232,200,137,.015), transparent 30%),
    var(--ink-card);
  border: 1px solid var(--ink-line);
  border-radius: 3px;
  box-shadow: 0 30px 80px rgba(0,0,0,.45);
}
.mh-sec {
  scroll-margin-top: 4.5rem;
  padding: 3rem clamp(1.2rem, 5vw, 4rem);
  border-bottom: 1px solid var(--ink-line-soft);
}
.mh-sec:last-child { border-bottom: none; }

/* masthead */
.mh-front { text-align: center; }
.mh-mast { }
.mh-mast-rule { height: 1px; background: var(--ink-line); margin: .4rem 0; }
.mh-mast-rule-thick { height: 3px; background: var(--gold); opacity: .6; }
.mh-mast-meta { display: flex; flex-wrap: wrap; justify-content: center; gap: .8rem; padding: .5rem 0; font-family: var(--mono); font-weight: 700; font-size: .56rem; letter-spacing: .22em; text-transform: uppercase; color: var(--cream-mute); }
.mh-mast-title { font-family: var(--serif); font-size: clamp(3rem, 11vw, 7rem); line-height: .88; letter-spacing: -.03em; color: var(--cream); margin: .6rem 0; }
.mh-mast-title em { font-style: normal; color: var(--gold); }
.mh-mast-tag { font-family: var(--serif); font-style: italic; font-size: 1.2rem; color: var(--cream-soft); max-width: 56ch; margin: .6rem auto 0; }

.mh-seals { display: flex; flex-wrap: wrap; justify-content: center; gap: 1rem; margin: 1.6rem 0 .5rem; }
.mh-seal { display: block; }

.mh-fieldrule { display: flex; align-items: center; gap: .7rem; margin: 2rem auto; max-width: 30rem; }
.mh-hash { flex: 1; height: 6px; background-image: repeating-linear-gradient(90deg, var(--gold) 0 10px, transparent 10px 18px); opacity: .35; }

.mh-lead { margin: 1.2rem 0 .6rem; }
.mh-kicker { font-family: var(--mono); font-weight: 700; font-size: .62rem; letter-spacing: .3em; text-transform: uppercase; color: var(--gold); }
.mh-lead-head { font-family: var(--serif); font-size: clamp(1.8rem, 5vw, 3rem); line-height: 1.05; color: var(--cream); margin: .5rem 0 0; }

.mh-cols { columns: 2; column-gap: 2.4rem; column-rule: 1px solid var(--ink-line); text-align: left; margin-top: 1.4rem; font-family: var(--serif); font-size: 1rem; line-height: 1.65; color: var(--cream-soft); }
.mh-cols p { margin: 0; text-align: justify; }
.mh-dropcap { float: left; font-family: var(--serif); font-size: 3.6rem; line-height: .76; padding: .2rem .5rem .1rem 0; color: var(--gold); }
@media (max-width: 640px) { .mh-cols { columns: 1; } }

/* section header (reuses app .section-header tokens, adds a top rule) */
.mh-sechead { border-top: 3px double var(--ink-line); padding-top: 1rem; margin-bottom: 1.6rem; }

/* stat strip */
.mh-strip { display: grid; grid-template-columns: repeat(6, 1fr); border-top: 1px solid var(--ink-line); border-bottom: 1px solid var(--ink-line); }
.mh-strip-4 { grid-template-columns: repeat(4, 1fr); }
.mh-stripitem { padding: 1.4rem 1rem; border-right: 1px solid var(--ink-line); text-align: center; }
.mh-stripitem:last-child { border-right: none; }
.mh-strip-lbl { font-family: var(--mono); font-weight: 700; font-size: .54rem; letter-spacing: .2em; text-transform: uppercase; color: var(--cream-mute); margin-bottom: .5rem; }
.mh-strip-val { font-family: var(--serif); font-style: italic; font-size: 2rem; line-height: 1; color: var(--gold); }
.mh-strip-val.is-cream { color: var(--cream); font-style: normal; }
.mh-strip-det { font-family: var(--mono); font-size: .54rem; letter-spacing: .12em; text-transform: uppercase; color: var(--cream-mute); margin-top: .45rem; }
@media (max-width: 760px) { .mh-strip { grid-template-columns: repeat(3, 1fr); } .mh-stripitem { border-bottom: 1px solid var(--ink-line); } }
@media (max-width: 460px) { .mh-strip, .mh-strip-4 { grid-template-columns: repeat(2, 1fr); } }

/* regular vs playoff split */
.mh-split { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-top: 1.6rem; }
@media (max-width: 640px) { .mh-split { grid-template-columns: 1fr; } }
.mh-splitcol { position: relative; background: var(--ink-soft); border: 1px solid var(--ink-line); padding: 1.5rem 1.75rem; }
.mh-splitcol::before { content: ''; position: absolute; top: 0; left: 0; width: 3px; height: 100%; background: var(--gold); }
.mh-splitcol.is-playoff::before { background: var(--rust); }
.mh-split-lbl { font-family: var(--mono); font-weight: 700; font-size: .6rem; letter-spacing: .25em; text-transform: uppercase; color: var(--gold); margin-bottom: .7rem; }
.mh-splitcol.is-playoff .mh-split-lbl { color: var(--rust); }
.mh-split-rec { font-family: var(--serif); font-size: 2.6rem; line-height: 1; color: var(--cream); }
.mh-split-pct { font-family: var(--mono); font-weight: 700; font-size: .8rem; color: var(--cream-soft); margin: .35rem 0 .7rem; }
.mh-split-pf { font-family: var(--mono); font-size: .64rem; letter-spacing: .12em; text-transform: uppercase; color: var(--cream-mute); }

.mh-foot { font-family: var(--serif); font-style: italic; font-size: .82rem; color: var(--cream-mute); margin-top: 1.2rem; line-height: 1.5; }

/* tables */
.mh-table { background: var(--ink-card); border: 1px solid var(--ink-line); overflow-x: auto; margin-top: 1.4rem; }
.mh-table table { width: 100%; border-collapse: collapse; font-family: var(--sans); }
.mh-table thead { background: var(--ink-soft); border-bottom: 1px solid var(--ink-line); }
.mh-table th { padding: .8rem 1rem; font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .18em; text-transform: uppercase; color: var(--cream-mute); text-align: left; white-space: nowrap; }
.mh-table th.num { text-align: right; }
.mh-table td { padding: .9rem 1rem; border-top: 1px solid var(--ink-line-soft); font-size: .9rem; color: var(--cream-soft); }
.mh-table td.num { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--mono); font-size: .82rem; }
.mh-table tbody tr:hover { background: rgba(232,200,137,.03); }
.mh-table tr.is-title td { background: rgba(232,200,137,.08); }
.mh-table td.year { font-family: var(--serif); font-style: italic; font-size: 1.2rem; color: var(--gold); }
.mh-table td.opp { font-family: var(--serif); font-size: 1.05rem; color: var(--cream); }
.mh-table td.score { font-family: var(--serif); font-style: italic; font-size: 1.15rem; color: var(--gold); }
.mh-table td.rank { font-family: var(--mono); font-weight: 700; color: var(--cream-mute); }
.mh-table td.rank.gold { color: var(--gold); }
.mh-table td.finish.gold { color: var(--gold); font-weight: 700; }
.mh-table td.finish.silver { color: #c8c8c8; font-weight: 700; }
.mh-table td.finish.bronze { color: #cd7f32; font-weight: 700; }
.mh-table td.rec.win, .mh-table td.result.win { color: var(--gold); font-weight: 700; }
.mh-table td.rec.loss, .mh-table td.result.loss { color: var(--rust); font-weight: 700; }
.mh-table td.rec.even { color: var(--cream-soft); }
.mh-when { font-family: var(--mono); font-size: .66rem; letter-spacing: .06em; color: var(--cream-mute); }
.mh-xl { font-family: var(--mono); font-size: .66rem; color: var(--cream-mute); }

/* trophies */
.mh-trophies { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: 1rem; }
.mh-plaque { border: 1px solid var(--ink-line); border-radius: 3px; padding: 1.2rem .8rem; text-align: center; background: var(--ink-soft); display: flex; flex-direction: column; align-items: center; gap: .3rem; }
.mh-plaque.is-champ { border-color: var(--gold-deep); background: rgba(232,200,137,.06); }
.mh-plaque-ico { font-size: 2rem; }
.mh-plaque-year { font-family: var(--serif); font-size: 1.5rem; color: var(--cream); }
.mh-plaque-league { font-size: .82rem; color: var(--cream-soft); }
.mh-plaque-tag { font-family: var(--mono); font-weight: 700; font-size: .52rem; letter-spacing: .18em; text-transform: uppercase; color: var(--gold); margin-top: .2rem; }

.mh-empty { font-family: var(--serif); font-style: italic; color: var(--cream-mute); line-height: 1.6; padding: 2.5rem 1rem; text-align: center; font-size: 1.05rem; }
`
