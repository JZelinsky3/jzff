// Shared shell for every Manager Hub chronicle chapter.
//
// Each chapter page wraps its content in <ChronicleShell chronicle={c} active="...">
// to inherit the newspaper masthead, chapter rail, and editorial typography. Styles
// are scoped to .mh-* classnames so they coexist with the global pams stylesheet
// without polluting it.

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { CareerChronicle } from '@/lib/manager/chronicle'

export type ChapterSlug = 'front' | 'title-chase' | 'draft-room' | 'feuds' | 'ledger' | 'desk' | 'trade-desk' | 'scout'

export const CHAPTERS: { slug: ChapterSlug; href: (s: string) => string; numeral: string; title: string; kicker: string }[] = [
  { slug: 'front',       numeral: 'I',    title: 'Front Page',   kicker: 'The Masthead',   href: (s) => `/manager/${s}` },
  { slug: 'title-chase', numeral: 'II',   title: 'Title Chase',  kicker: 'Rings & Final Fours', href: (s) => `/manager/${s}/title-chase` },
  { slug: 'draft-room',  numeral: 'III',  title: 'Draft Room',   kicker: 'Picks, Steals & Busts', href: (s) => `/manager/${s}/draft-room` },
  { slug: 'feuds',       numeral: 'IV',   title: 'The Feuds',    kicker: 'Society Pages',  href: (s) => `/manager/${s}/feuds` },
  { slug: 'ledger',      numeral: 'V',    title: 'The Ledger',   kicker: 'Records & Extremes', href: (s) => `/manager/${s}/ledger` },
  { slug: 'desk',        numeral: 'VI',   title: 'Player Desk',  kicker: 'Live Rosters & Wire', href: (s) => `/manager/${s}/desk` },
  { slug: 'trade-desk',  numeral: 'VII',  title: 'Trade Desk',   kicker: 'Builder & Verdicts', href: (s) => `/manager/${s}/trade-builder` },
  { slug: 'scout',       numeral: 'VIII', title: 'The Scout',    kicker: 'Needs & Targets', href: (s) => `/manager/${s}/scout` },
]

const SHELL_STYLES = `
.mh-page { position: relative; z-index: 10; max-width: 1200px; margin: 0 auto; padding: 0 1.75rem 5rem; color: var(--cream); }
.mh-ticker { background: var(--gold); color: var(--ink); padding: .55rem 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; font-family: var(--mono); font-weight: 700; font-size: .65rem; letter-spacing: .25em; text-transform: uppercase; border-bottom: 3px solid var(--ink); }
.mh-ticker-left, .mh-ticker-right { display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center; }
.mh-ticker .star { color: var(--rust); }
.mh-nav { display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; padding: 1rem 2rem; align-items: center; border-bottom: 1px solid var(--ink-line); background: rgba(14,22,32,.92); backdrop-filter: blur(8px); position: sticky; top: 0; z-index: 30; }
.mh-nav-back, .mh-nav-add { font-family: var(--mono); font-weight: 700; font-size: .68rem; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); text-decoration: none; }
.mh-nav-back { justify-self: start; }
.mh-nav-add { justify-self: end; }
.mh-nav-back:hover, .mh-nav-add:hover { color: var(--gold-bright); }
.mh-nav-center { text-align: center; }
.mh-nav-kicker { font-family: var(--mono); font-weight: 700; font-size: .56rem; letter-spacing: .3em; text-transform: uppercase; color: var(--cream-mute); margin-bottom: .25rem; }
.mh-nav-title { font-family: var(--serif); font-size: 1.25rem; color: var(--cream); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mh-nav-title em { color: var(--gold); font-style: italic; }

.mh-masthead { text-align: center; padding: 3.5rem 1rem 1.5rem; border-bottom: 4px double var(--ink-line); margin-bottom: 1rem; }
.mh-masthead-sup { font-family: var(--mono); font-weight: 700; font-size: .62rem; letter-spacing: .4em; text-transform: uppercase; color: var(--gold); margin-bottom: 1rem; }
.mh-masthead-sup .star { color: var(--rust); }
.mh-masthead-title { font-family: var(--serif); font-size: clamp(2.6rem, 7vw, 5.5rem); line-height: .95; letter-spacing: -.03em; color: var(--cream); }
.mh-masthead-title em { color: var(--gold); font-style: italic; }
.mh-masthead-sub { font-family: var(--serif); font-style: italic; font-size: clamp(1rem, 1.5vw, 1.2rem); line-height: 1.5; color: var(--cream-soft); max-width: 60ch; margin: 1.25rem auto 0; }
.mh-masthead-meta { display: flex; justify-content: center; gap: 1.5rem; flex-wrap: wrap; margin-top: 1.5rem; font-family: var(--mono); font-size: .6rem; letter-spacing: .2em; text-transform: uppercase; color: var(--cream-mute); }
.mh-masthead-meta strong { color: var(--gold); font-weight: 700; }

.mh-rail { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 0; border-top: 1px solid var(--ink-line); border-bottom: 1px solid var(--ink-line); margin-bottom: 2.5rem; }
@media (max-width: 1280px) { .mh-rail { grid-template-columns: repeat(4, minmax(0, 1fr)); } .mh-rail-item:nth-child(4n) { border-right: none; } .mh-rail-item:nth-child(n+5) { border-top: 1px dotted var(--ink-line); } }
.mh-rail-item { display: block; text-align: center; padding: 1rem .75rem; text-decoration: none; color: var(--cream-mute); border-right: 1px dotted var(--ink-line); transition: background .2s, color .2s; }
.mh-rail-item:last-child { border-right: none; }
.mh-rail-item:hover { background: rgba(232,200,137,.04); color: var(--gold); }
.mh-rail-num { display: block; font-family: var(--mono); font-weight: 700; font-size: .55rem; letter-spacing: .3em; color: var(--gold); margin-bottom: .35rem; }
.mh-rail-title { display: block; font-family: var(--serif); font-style: italic; font-size: 1rem; color: var(--cream); }
.mh-rail-kicker { display: block; font-family: var(--mono); font-size: .52rem; letter-spacing: .18em; text-transform: uppercase; color: var(--cream-mute); margin-top: .25rem; }
.mh-rail-item.is-active { background: var(--ink-card); }
.mh-rail-item.is-active .mh-rail-title { color: var(--gold); }
@media (max-width: 760px) { .mh-rail { grid-template-columns: repeat(2, 1fr); } .mh-rail-item { border-bottom: 1px dotted var(--ink-line); } .mh-rail-item:nth-child(odd) { border-right: 1px dotted var(--ink-line); } .mh-rail-item:nth-child(even) { border-right: none; } }

.mh-broadsheet { display: grid; gap: 2.5rem; }

/* Newspaper "edition" header for each chapter */
.mh-edition { display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; align-items: end; padding-bottom: .75rem; border-bottom: 3px double var(--ink-line); }
.mh-edition-left, .mh-edition-right { font-family: var(--mono); font-weight: 700; font-size: .6rem; letter-spacing: .25em; text-transform: uppercase; color: var(--cream-mute); }
.mh-edition-right { text-align: right; }
.mh-edition-center { text-align: center; }
.mh-edition-title { font-family: var(--serif); font-size: clamp(2rem, 5vw, 3.4rem); line-height: 1; letter-spacing: -.02em; color: var(--cream); }
.mh-edition-title em { color: var(--gold); font-style: italic; }
.mh-edition-deck { font-family: var(--serif); font-style: italic; font-size: .95rem; color: var(--cream-soft); margin-top: .35rem; }
@media (max-width: 640px) { .mh-edition { grid-template-columns: 1fr; text-align: center; } .mh-edition-left, .mh-edition-right { text-align: center; } }

/* Story grid — the multi-column newspaper feel */
.mh-row { display: grid; gap: 2rem; align-items: start; }
.mh-row-2 { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); }
.mh-row-2alt { grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); }
.mh-row-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.mh-row-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 900px) { .mh-row-2, .mh-row-2alt, .mh-row-3 { grid-template-columns: 1fr; } .mh-row-4 { grid-template-columns: 1fr 1fr; } }
@media (max-width: 540px) { .mh-row-4 { grid-template-columns: 1fr; } }

/* Story card — a "story" is a headline + dek + body */
.mh-story { padding: 1.5rem 0; border-top: 1px dotted var(--ink-line); }
.mh-story-kicker { font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .28em; text-transform: uppercase; color: var(--gold); margin-bottom: .5rem; }
.mh-story-kicker.rust { color: var(--rust); }
.mh-story-head { font-family: var(--serif); font-size: clamp(1.4rem, 2.4vw, 2rem); line-height: 1.1; letter-spacing: -.015em; color: var(--cream); margin-bottom: .55rem; }
.mh-story-head em { color: var(--gold); font-style: italic; }
.mh-story-dek { font-family: var(--serif); font-style: italic; font-size: 1.02rem; line-height: 1.5; color: var(--cream-soft); margin-bottom: .85rem; }
.mh-story-body { font-family: var(--serif); font-size: .98rem; line-height: 1.65; color: var(--cream-soft); }
.mh-story-body p + p { margin-top: .85rem; }
.mh-story-body strong { color: var(--cream); font-family: var(--sans); font-weight: 600; }
.mh-story-body em { color: var(--gold); font-style: italic; }
.mh-story-body .dropcap { float: left; font-family: var(--serif); font-style: italic; font-size: 3.4rem; line-height: .8; color: var(--gold); padding: .2rem .55rem 0 0; margin-right: .15rem; }
.mh-story-byline { font-family: var(--mono); font-size: .56rem; letter-spacing: .22em; text-transform: uppercase; color: var(--cream-mute); margin-top: .85rem; padding-top: .65rem; border-top: 1px dotted var(--ink-line); display: flex; justify-content: space-between; gap: .5rem; flex-wrap: wrap; }
.mh-story-byline strong { color: var(--gold); font-weight: 700; }

/* Pull quote */
.mh-pull { font-family: var(--serif); font-style: italic; font-size: 1.5rem; line-height: 1.35; color: var(--gold); padding: 1.25rem 1.5rem; border-top: 2px solid var(--gold-deep); border-bottom: 2px solid var(--gold-deep); margin: 1rem 0; position: relative; }
.mh-pull::before { content: '“'; position: absolute; top: -.5rem; left: .5rem; font-size: 3rem; color: var(--gold-deep); opacity: .7; }
.mh-pull-cite { display: block; font-family: var(--mono); font-style: normal; font-size: .58rem; letter-spacing: .25em; text-transform: uppercase; color: var(--cream-mute); margin-top: .85rem; }

/* Sidebar boxed block */
.mh-box { background: linear-gradient(180deg, rgba(232,200,137,.03), transparent), var(--ink-card); border: 1px solid var(--ink-line); padding: 1.4rem 1.4rem 1.2rem; position: relative; }
.mh-box::before { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 3px; background: var(--gold); }
.mh-box.rust::before { background: var(--rust); }
.mh-box.steel::before { background: var(--steel); }
.mh-box-mast { font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .28em; text-transform: uppercase; color: var(--gold); margin-bottom: .85rem; padding-bottom: .65rem; border-bottom: 1px dotted var(--ink-line); }
.mh-box.rust .mh-box-mast { color: var(--rust); }
.mh-box.steel .mh-box-mast { color: var(--steel); }

/* Data row inside a sidebar */
.mh-row-line { display: grid; grid-template-columns: 1fr auto; gap: .75rem; align-items: baseline; padding: .55rem 0; border-bottom: 1px dotted var(--ink-line-soft); font-family: var(--mono); font-size: .68rem; color: var(--cream); }
.mh-row-line:last-child { border-bottom: none; }
.mh-row-line .lbl { color: var(--cream-soft); letter-spacing: .04em; }
.mh-row-line .val { color: var(--gold); font-weight: 700; letter-spacing: .04em; font-variant-numeric: tabular-nums; }
.mh-row-line .val.cream { color: var(--cream); }

/* Stat block (big number + label) */
.mh-stat { text-align: center; padding: 1.25rem 1rem; border: 1px solid var(--ink-line); background: linear-gradient(135deg, rgba(232,200,137,.02), transparent 60%), var(--ink-soft); }
.mh-stat-value { font-family: var(--serif); font-size: clamp(2.2rem, 4vw, 3rem); line-height: 1; letter-spacing: -.025em; color: var(--cream); font-variant-numeric: tabular-nums; margin-bottom: .35rem; }
.mh-stat-value em { color: var(--gold); font-style: italic; }
.mh-stat-label { font-family: var(--mono); font-weight: 700; font-size: .56rem; letter-spacing: .28em; text-transform: uppercase; color: var(--gold); }
.mh-stat-sub { font-family: var(--mono); font-size: .55rem; letter-spacing: .2em; text-transform: uppercase; color: var(--cream-mute); margin-top: .4rem; }

/* Year card — for season-by-season briefs */
.mh-year { padding: 1rem 1.1rem; background: rgba(26,37,50,.4); border: 1px solid var(--ink-line); border-left: 3px solid var(--gold-deep); }
.mh-year.champion { border-left-color: var(--gold); background: rgba(232,200,137,.06); }
.mh-year.runner { border-left-color: var(--rust); }
.mh-year-yr { font-family: var(--serif); font-style: italic; font-size: 1.6rem; color: var(--gold); line-height: 1; }
.mh-year-league { font-family: var(--mono); font-size: .55rem; letter-spacing: .22em; text-transform: uppercase; color: var(--cream-mute); margin-top: .15rem; }
.mh-year-body { display: flex; gap: 1rem; flex-wrap: wrap; margin-top: .75rem; font-family: var(--mono); font-size: .68rem; color: var(--cream); letter-spacing: .04em; }
.mh-year-body strong { color: var(--gold); font-weight: 700; font-variant-numeric: tabular-nums; }
.mh-year-tag { display: inline-block; font-family: var(--mono); font-size: .5rem; letter-spacing: .2em; text-transform: uppercase; padding: .15rem .45rem; background: var(--gold); color: var(--ink); margin-left: .5rem; vertical-align: middle; }
.mh-year-tag.runner { background: var(--rust); color: var(--cream); }

/* Section header inside chapter */
.mh-shead { padding-bottom: .75rem; border-bottom: 2px solid var(--gold-deep); margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; flex-wrap: wrap; }
.mh-shead-title { font-family: var(--serif); font-size: clamp(1.4rem, 2.4vw, 1.9rem); color: var(--cream); font-style: italic; }
.mh-shead-title em { color: var(--gold); }
.mh-shead-meta { font-family: var(--mono); font-size: .58rem; letter-spacing: .24em; text-transform: uppercase; color: var(--cream-mute); }

/* "From the Archives" clipping */
.mh-clip { max-width: 820px; margin: 0 auto; background: var(--ink-card); border: 1px solid var(--ink-line); padding: 2rem 2rem 1.75rem; position: relative; box-shadow: 5px 5px 0 rgba(0,0,0,.2); }
.mh-clip::before { content: ''; position: absolute; top: -8px; left: 50%; width: 28px; height: 14px; background: var(--rust); transform: translateX(-50%) skewY(-2deg); }
.mh-clip-mast { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: .8rem; margin-bottom: 1.1rem; border-bottom: 2px solid var(--gold-deep); font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .26em; text-transform: uppercase; color: var(--gold); }
.mh-clip-mast .meta { color: var(--cream-mute); }
.mh-clip-head { font-family: var(--serif); font-size: clamp(1.7rem, 3vw, 2.3rem); line-height: 1.05; color: var(--cream); margin-bottom: .8rem; letter-spacing: -.015em; }
.mh-clip-head em { color: var(--gold); font-style: italic; }
.mh-clip-body { font-family: var(--serif); font-size: 1.02rem; line-height: 1.65; color: var(--cream-soft); }
.mh-clip-body strong { color: var(--cream); font-family: var(--sans); font-weight: 600; }

/* Empty state */
.mh-empty { padding: 3rem 1.5rem; text-align: center; font-family: var(--serif); font-style: italic; color: var(--cream-mute); border: 1px dashed var(--ink-line); }

/* Footer / continue rail */
.mh-foot { margin-top: 3.5rem; padding: 1.5rem 0 0; border-top: 3px double var(--ink-line); display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; font-family: var(--mono); font-size: .62rem; letter-spacing: .22em; text-transform: uppercase; color: var(--cream-mute); }
.mh-foot a { color: var(--gold); text-decoration: none; }
.mh-foot a:hover { color: var(--gold-bright); }
`

export function ChronicleShell({
  chronicle,
  active,
  children,
  edition,
  deck,
}: {
  chronicle: CareerChronicle
  active: ChapterSlug
  children: ReactNode
  edition?: string
  deck?: string
}) {
  const slug = chronicle.chronicle.slug
  const totals = chronicle.totals
  const years = leagueYearRange(chronicle)
  const winPct = (totals.winPct * 100).toFixed(1)
  const decided = totals.wins + totals.losses
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const masthead = active === 'front'

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHELL_STYLES }} />

      <div className="mh-ticker">
        <div className="mh-ticker-left">
          <span><span className="star">★</span> THE {chronicle.chronicle.displayName.toUpperCase()} CHRONICLE</span>
          <span>{totals.leagues} {totals.leagues === 1 ? 'LEAGUE' : 'LEAGUES'}</span>
          <span>{totals.seasonsPlayed} SEASONS</span>
          {totals.championships > 0 && <span><span className="star">★</span> {totals.championships} {totals.championships === 1 ? 'RING' : 'RINGS'}</span>}
        </div>
        <div className="mh-ticker-right">
          <span>{years}</span>
          <span>{decided > 0 ? `${totals.wins}-${totals.losses}${totals.ties ? `-${totals.ties}` : ''} · ${winPct}%` : 'NO GAMES'}</span>
        </div>
      </div>

      <nav className="mh-nav">
        <Link href="/dashboard" className="mh-nav-back">← Dashboard</Link>
        <div className="mh-nav-center">
          <div className="mh-nav-kicker">Manager Hub</div>
          <div className="mh-nav-title">The <em>{chronicle.chronicle.displayName}</em> Chronicle</div>
        </div>
        <Link href={`/manager/${slug}/settings`} className="mh-nav-add">Settings</Link>
      </nav>

      <main className="mh-page">
        {masthead && <Masthead chronicle={chronicle} />}

        <div className="mh-rail">
          {CHAPTERS.map((c) => (
            <Link
              key={c.slug}
              href={c.href(slug)}
              className={`mh-rail-item${c.slug === active ? ' is-active' : ''}`}
            >
              <span className="mh-rail-num">{c.numeral}</span>
              <span className="mh-rail-title">{c.title}</span>
              <span className="mh-rail-kicker">{c.kicker}</span>
            </Link>
          ))}
        </div>

        {!masthead && (
          <header className="mh-edition">
            <div className="mh-edition-left">Edition {CHAPTERS.find((c) => c.slug === active)?.numeral}</div>
            <div className="mh-edition-center">
              <h1 className="mh-edition-title">{edition ?? CHAPTERS.find((c) => c.slug === active)?.title}</h1>
              {deck && <div className="mh-edition-deck">{deck}</div>}
            </div>
            <div className="mh-edition-right">{today}</div>
          </header>
        )}

        <div className="mh-broadsheet">{children}</div>

        <footer className="mh-foot">
          <span>End of {CHAPTERS.find((c) => c.slug === active)?.title} · The {chronicle.chronicle.displayName} Chronicle</span>
          <span><Link href={`/manager/${slug}`}>← Front Page</Link></span>
        </footer>
      </main>
    </>
  )
}

function Masthead({ chronicle }: { chronicle: CareerChronicle }) {
  const t = chronicle.totals
  const yrs = leagueYearRange(chronicle)
  return (
    <header className="mh-masthead">
      <div className="mh-masthead-sup"><span className="star">★</span> Volume I · {yrs} <span className="star">★</span></div>
      <h1 className="mh-masthead-title">The <em>{chronicle.chronicle.displayName}</em> Chronicle</h1>
      {chronicle.chronicle.subtitle && (
        <p className="mh-masthead-sub">{chronicle.chronicle.subtitle}</p>
      )}
      <div className="mh-masthead-meta">
        <span><strong>{t.leagues}</strong> leagues</span>
        <span><strong>{t.seasonsPlayed}</strong> seasons</span>
        <span><strong>{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ''}</strong> regular</span>
        {t.championships > 0 && <span><strong>{t.championships}</strong> {t.championships === 1 ? 'ring' : 'rings'}</span>}
      </div>
    </header>
  )
}

function leagueYearRange(c: CareerChronicle): string {
  const first = c.leagues.filter((l) => l.firstYear != null).map((l) => l.firstYear as number)
  const last = c.leagues.filter((l) => l.lastYear != null).map((l) => l.lastYear as number)
  if (first.length === 0) return '—'
  const min = Math.min(...first)
  const max = Math.max(...last)
  return min === max ? String(min) : `${min}–${max}`
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="mh-empty">{children}</div>
}
