// Manager Hub editorial shell — Phase 8 redesign.
//
// Wraps the remaining React tool pages (desk, scout, trade-builder) in the
// same atmospheric / ticker / library-dropdown / slim-chapbar chrome the
// static Issue templates use. The inner content keeps its existing mh-*
// classes — those styles ship below — so we only had to swap the wrapper.

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { CareerSummary } from '@/lib/manager/career'

// Minimal shape the shell needs. Real CareerChronicle satisfies this, but
// pages that don't compute the full chronicle (e.g. settings) can pass a
// thinner CareerSummary or even a hand-built object.
type ShellChronicle = {
  chronicle: { id: string; slug: string; displayName: string; subtitle?: string | null }
  totals: CareerSummary['totals']
}

// Tool slugs the shell knows about. The chapbar always highlights Issue VI
// (the tool pages live under the War Room), but the legacy mh-rail at the
// bottom uses ChapterSlug to mark the active tool.
export type ChapterSlug = 'front' | 'war-room' | 'desk' | 'trade-desk' | 'scout' | 'settings'

export const CHAPTERS: { slug: ChapterSlug; href: (s: string) => string; numeral: string; title: string; kicker: string }[] = [
  { slug: 'front',      numeral: 'I',    title: 'Front Page',  kicker: 'The Masthead',        href: (s) => `/manager/${s}` },
  { slug: 'war-room',   numeral: 'VI',   title: 'War Room',    kicker: 'Live Tools Hub',      href: (s) => `/manager/${s}/war-room` },
  { slug: 'desk',       numeral: 'VI·a', title: 'Player Desk', kicker: 'Live Rosters & Wire', href: (s) => `/manager/${s}/desk` },
  { slug: 'trade-desk', numeral: 'VI·b', title: 'Trade Desk',  kicker: 'Builder & Verdicts',  href: (s) => `/manager/${s}/trade-builder` },
  { slug: 'scout',      numeral: 'VI·c', title: 'The Scout',   kicker: 'Needs & Targets',     href: (s) => `/manager/${s}/scout` },
  { slug: 'settings',   numeral: '§',    title: 'Settings',    kicker: 'Manage the chronicle', href: (s) => `/manager/${s}/settings` },
]

// All issue tabs — used by the slim editorial chapbar.
const ISSUES: { slug: string; label: string; href: (s: string) => string }[] = [
  { slug: 'front',     label: 'I · Front',    href: (s) => `/manager/${s}` },
  { slug: 'legacy',    label: 'II · Legacy',  href: (s) => `/manager/${s}/legacy` },
  { slug: 'dynasty',   label: 'III · Dynasty', href: (s) => `/manager/${s}/dynasty` },
  { slug: 'seasons',   label: 'IV · Seasons', href: (s) => `/manager/${s}/seasons` },
  { slug: 'vault',     label: 'V · Vault',    href: (s) => `/manager/${s}/vault` },
  { slug: 'war-room',  label: 'VI · War Room', href: (s) => `/manager/${s}/war-room` },
]

const SHELL_STYLES = `
/* ============================================================
   New editorial wrapper (ed-*) — matches the static Issue templates
   ============================================================ */
.ed-glow { position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image:
        radial-gradient(circle at 15% 20%, rgba(232, 200, 137, .07) 0%, transparent 45%),
        radial-gradient(circle at 85% 80%, rgba(160, 72, 48, .04) 0%, transparent 50%); }
.ed-grain { position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: .5;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence baseFrequency='0.85' numOctaves='2' seed='11'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 0.92 0 0 0 0 0.8 0 0 0 0.04 0'/></filter><rect width='180' height='180' filter='url(%23n)'/></svg>"); }

.ed-ticker { position: relative; z-index: 10; background: var(--gold); color: var(--ink); border-bottom: 3px solid var(--ink); height: 38px; display: flex; align-items: center; overflow: hidden; }
.ed-ticker-track { display: flex; gap: 3rem; white-space: nowrap; padding-left: 3rem; animation: ed-ticker-scroll 60s linear infinite; }
.ed-ticker-group { display: flex; gap: 3rem; }
.ed-ticker-item { font-family: var(--mono); font-size: .72rem; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; display: inline-flex; align-items: center; gap: .6rem; }
.ed-ticker-star { color: var(--rust); }
@keyframes ed-ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }

.ed-nav { position: sticky; top: 0; z-index: 30; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 1rem; padding: 1.2rem 2rem; background: rgba(14, 22, 32, .92); backdrop-filter: blur(12px); border-bottom: 1px solid var(--ink-line); }
.ed-nav-back, .ed-nav-link { color: var(--gold); text-decoration: none; font-family: var(--mono); font-weight: 700; font-size: .72rem; letter-spacing: .2em; text-transform: uppercase; transition: color .2s; }
.ed-nav-back { justify-self: start; } .ed-nav-link { justify-self: end; }
.ed-nav-back:hover, .ed-nav-link:hover { color: var(--gold-bright); }
.ed-nav-center { text-align: center; justify-self: center; }
.ed-nav-kicker { font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .3em; text-transform: uppercase; color: var(--cream-mute); margin-bottom: .3rem; }
.ed-nav-title { font-family: var(--serif); font-size: 1.4rem; color: var(--cream); }
.ed-nav-title em { font-style: italic; color: var(--gold); }

.ed-drop { position: relative; }
.ed-drop-btn { color: var(--gold); background: none; border: none; cursor: pointer; padding: 2px; display: flex; align-items: center; }
.ed-drop-icon { display: block; }
.ed-drop-menu { display: none; position: fixed; top: 4.5rem; right: 1.5rem; min-width: 240px; max-width: calc(100vw - 3rem); background: rgba(14,22,32,.97); border: 1px solid var(--ink-line); backdrop-filter: blur(12px); z-index: 50; overflow: hidden; }
.ed-drop.open .ed-drop-menu { display: block; }
.ed-drop-label { display: block; padding: .45rem 1.1rem .3rem; font-family: var(--mono); font-size: .55rem; letter-spacing: .25em; text-transform: uppercase; color: var(--cream-mute); border-bottom: 1px solid var(--ink-line-soft); }
.ed-drop-menu a { display: block; padding: .7rem 1.1rem; color: var(--cream-soft); text-decoration: none; font-family: var(--mono); font-size: .68rem; letter-spacing: .18em; text-transform: uppercase; border-bottom: 1px solid var(--ink-line-soft); transition: background .15s, color .15s; }
.ed-drop-menu a:last-child { border-bottom: none; }
.ed-drop-menu a:hover { background: rgba(232,200,137,.07); color: var(--gold); }
.ed-drop-menu a.is-active { color: var(--rust); background: rgba(160,72,48,.06); }

.ed-chapbar { position: sticky; top: var(--nav-h, 4.5rem); z-index: 29; background: rgba(14, 22, 32, .9); backdrop-filter: blur(12px); border-bottom: 1px solid var(--ink-line); }
.ed-chapbar-track { display: flex; justify-content: center; align-items: stretch; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; max-width: 1370px; margin: 0 auto; padding: 0 1rem; }
.ed-chapbar-track::-webkit-scrollbar { display: none; }
.ed-chapbar-link { flex-shrink: 0; position: relative; color: var(--cream-soft); text-decoration: none; font-family: var(--mono); font-weight: 700; font-size: .68rem; letter-spacing: .2em; text-transform: uppercase; padding: .65rem 1.3rem .75rem; white-space: nowrap; transition: color .15s; }
.ed-chapbar-link:hover, .ed-chapbar-link.is-active { color: var(--rust); }
.ed-chapbar-link.is-active::after { content: ""; position: absolute; left: 1.3rem; right: 1.3rem; bottom: 0; height: 2px; background: var(--rust); }
.ed-chapbar-link + .ed-chapbar-link::before { content: ""; position: absolute; left: 0; top: 35%; bottom: 35%; width: 1px; background: var(--ink-line); }
@media (max-width: 640px) {
    .ed-chapbar-track { justify-content: flex-start; padding: 0 .15rem; }
    .ed-chapbar-link { padding: .55rem .75rem; font-size: .55rem; letter-spacing: .15em; }
    .ed-chapbar-link.is-active::after { left: .75rem; right: .75rem; }
}

/* Edition masthead — tool-specific title + deck */
.ed-edition { position: relative; z-index: 10; max-width: 1100px; margin: 0 auto; padding: 4rem 1.5rem 1rem; text-align: center; }
.ed-edition-sup { font-family: var(--mono); font-weight: 700; font-size: .65rem; letter-spacing: .4em; text-transform: uppercase; color: var(--rust); margin-bottom: 1.25rem; }
.ed-edition-sup .star { color: var(--gold); }
.ed-edition-title { font-family: var(--serif); font-size: clamp(2.4rem, 6vw, 4.8rem); line-height: .95; letter-spacing: -.025em; color: var(--cream); }
.ed-edition-title em { font-style: italic; color: var(--rust); }
.ed-edition-deck { font-family: var(--serif); font-style: italic; font-size: clamp(1.05rem, 1.5vw, 1.25rem); color: var(--cream-soft); max-width: 640px; margin: 1.25rem auto 0; }
.ed-edition-rule { max-width: 320px; margin: 1.75rem auto 0; border-top: 1px solid var(--ink-line); position: relative; }
.ed-edition-rule::before { content: '✦'; position: absolute; top: -.55rem; left: 50%; transform: translateX(-50%); background: var(--ink); padding: 0 .6rem; color: var(--rust); font-size: .7rem; }

/* Editor's lede frame — optional intro paragraph */
.ed-lede { position: relative; z-index: 10; max-width: 820px; margin: 2.75rem auto 0; padding: 0 1.75rem; }
.ed-lede-frame { padding: 1.85rem 2.25rem 1.7rem; background: linear-gradient(180deg, rgba(160,72,48,.04), transparent), var(--ink-card); border: 1px solid var(--ink-line); position: relative; }
.ed-lede-frame::before, .ed-lede-frame::after { content: ''; position: absolute; left: 1.5rem; right: 1.5rem; height: 1px; background: var(--rust); opacity: .55; }
.ed-lede-frame::before { top: .55rem; } .ed-lede-frame::after { bottom: .55rem; }
.ed-lede-mast { text-align: center; font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .32em; text-transform: uppercase; color: var(--rust); margin-bottom: 1.1rem; }
.ed-lede-mast .star { color: var(--gold); }
.ed-lede-body { font-family: var(--serif); font-style: italic; font-size: 1.05rem; line-height: 1.65; color: var(--cream-soft); }

/* Main content wrapper (children of the shell) */
.ed-main { position: relative; z-index: 10; max-width: 1200px; margin: 3rem auto 0; padding: 0 1.75rem 4rem; }

/* Continue / foot at the bottom */
.ed-continue { position: relative; z-index: 10; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; max-width: 1200px; margin: 4rem auto 0; padding: 0 1.75rem; }
@media (max-width: 720px) { .ed-continue { grid-template-columns: 1fr; } }
.ed-continue a { display: block; padding: 1.5rem 1.4rem; background: var(--ink-card); border: 1px solid var(--ink-line); text-decoration: none; color: inherit; transition: background .15s, border-color .15s; }
.ed-continue a:hover { background: rgba(232,200,137,.04); border-color: var(--gold-deep); }
.ed-continue-dir { font-family: var(--mono); font-weight: 700; font-size: .55rem; letter-spacing: .25em; color: var(--gold-deep); margin-bottom: .4rem; }
.ed-continue-num { font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .3em; color: var(--rust); margin-bottom: .55rem; }
.ed-continue-name { font-family: var(--serif); font-style: italic; font-size: 1.3rem; color: var(--cream); }
.ed-continue-kicker { font-family: var(--mono); font-size: .55rem; letter-spacing: .2em; text-transform: uppercase; color: var(--cream-mute); margin-top: .25rem; }

.ed-foot { position: relative; z-index: 10; max-width: 1200px; margin: 4rem auto 3rem; padding: 1.75rem 1.75rem 0; text-align: center; border-top: 3px double var(--ink-line); font-family: var(--mono); font-size: .62rem; letter-spacing: .22em; text-transform: uppercase; color: var(--cream-mute); }
.ed-foot em { color: var(--rust); font-style: italic; }

/* ============================================================
   LEGACY mh-* styles — preserved so existing tool-page markup keeps
   working. The tool pages render their own cards/stories/boxes
   inside .ed-main using these classes.
   ============================================================ */
.mh-page { padding: 0; color: var(--cream); }
.mh-broadsheet { display: grid; gap: 2.5rem; }

/* Story grid */
.mh-row { display: grid; gap: 2rem; align-items: start; }
.mh-row-2 { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); }
.mh-row-2alt { grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); }
.mh-row-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.mh-row-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 900px) { .mh-row-2, .mh-row-2alt, .mh-row-3 { grid-template-columns: 1fr; } .mh-row-4 { grid-template-columns: 1fr 1fr; } }
@media (max-width: 540px) { .mh-row-4 { grid-template-columns: 1fr; } }

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
.mh-pull::before { content: '\\201C'; position: absolute; top: -.5rem; left: .5rem; font-size: 3rem; color: var(--gold-deep); opacity: .7; }
.mh-pull-cite { display: block; font-family: var(--mono); font-style: normal; font-size: .58rem; letter-spacing: .25em; text-transform: uppercase; color: var(--cream-mute); margin-top: .85rem; }

/* Sidebar box */
.mh-box { background: linear-gradient(180deg, rgba(232,200,137,.03), transparent), var(--ink-card); border: 1px solid var(--ink-line); padding: 1.4rem 1.4rem 1.2rem; position: relative; }
.mh-box::before { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 3px; background: var(--gold); }
.mh-box.rust::before { background: var(--rust); }
.mh-box.steel::before { background: var(--steel); }
.mh-box-mast { font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .28em; text-transform: uppercase; color: var(--gold); margin-bottom: .85rem; padding-bottom: .65rem; border-bottom: 1px dotted var(--ink-line); }
.mh-box.rust .mh-box-mast { color: var(--rust); }
.mh-box.steel .mh-box-mast { color: var(--steel); }

.mh-row-line { display: grid; grid-template-columns: 1fr auto; gap: .75rem; align-items: baseline; padding: .55rem 0; border-bottom: 1px dotted var(--ink-line-soft); font-family: var(--mono); font-size: .68rem; color: var(--cream); }
.mh-row-line:last-child { border-bottom: none; }
.mh-row-line .lbl { color: var(--cream-soft); letter-spacing: .04em; }
.mh-row-line .val { color: var(--gold); font-weight: 700; letter-spacing: .04em; font-variant-numeric: tabular-nums; }
.mh-row-line .val.cream { color: var(--cream); }

.mh-stat { text-align: center; padding: 1.25rem 1rem; border: 1px solid var(--ink-line); background: linear-gradient(135deg, rgba(232,200,137,.02), transparent 60%), var(--ink-soft); }
.mh-stat-value { font-family: var(--serif); font-size: clamp(2.2rem, 4vw, 3rem); line-height: 1; letter-spacing: -.025em; color: var(--cream); font-variant-numeric: tabular-nums; margin-bottom: .35rem; }
.mh-stat-value em { color: var(--gold); font-style: italic; }
.mh-stat-label { font-family: var(--mono); font-weight: 700; font-size: .56rem; letter-spacing: .28em; text-transform: uppercase; color: var(--gold); }
.mh-stat-sub { font-family: var(--mono); font-size: .55rem; letter-spacing: .2em; text-transform: uppercase; color: var(--cream-mute); margin-top: .4rem; }

.mh-year { padding: 1rem 1.1rem; background: rgba(26,37,50,.4); border: 1px solid var(--ink-line); border-left: 3px solid var(--gold-deep); }
.mh-year.champion { border-left-color: var(--gold); background: rgba(232,200,137,.06); }
.mh-year.runner { border-left-color: var(--rust); }
.mh-year-yr { font-family: var(--serif); font-style: italic; font-size: 1.6rem; color: var(--gold); line-height: 1; }
.mh-year-league { font-family: var(--mono); font-size: .55rem; letter-spacing: .22em; text-transform: uppercase; color: var(--cream-mute); margin-top: .15rem; }
.mh-year-body { display: flex; gap: 1rem; flex-wrap: wrap; margin-top: .75rem; font-family: var(--mono); font-size: .68rem; color: var(--cream); letter-spacing: .04em; }
.mh-year-body strong { color: var(--gold); font-weight: 700; font-variant-numeric: tabular-nums; }
.mh-year-tag { display: inline-block; font-family: var(--mono); font-size: .5rem; letter-spacing: .2em; text-transform: uppercase; padding: .15rem .45rem; background: var(--gold); color: var(--ink); margin-left: .5rem; vertical-align: middle; }
.mh-year-tag.runner { background: var(--rust); color: var(--cream); }

.mh-shead { padding-bottom: .75rem; border-bottom: 2px solid var(--gold-deep); margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; flex-wrap: wrap; }
.mh-shead-title { font-family: var(--serif); font-size: clamp(1.4rem, 2.4vw, 1.9rem); color: var(--cream); font-style: italic; }
.mh-shead-title em { color: var(--gold); }
.mh-shead-meta { font-family: var(--mono); font-size: .58rem; letter-spacing: .24em; text-transform: uppercase; color: var(--cream-mute); }
.mh-section-intro { font-family: var(--serif); font-style: italic; font-size: 1rem; line-height: 1.6; color: var(--cream-soft); max-width: 72ch; margin: 0 0 1.5rem; }
.mh-section-intro::before { content: '— '; color: var(--rust); font-style: normal; }
.mh-card-context { font-family: var(--serif); font-style: italic; font-size: .92rem; line-height: 1.5; color: var(--cream-soft); padding-top: .65rem; margin-top: .85rem; border-top: 1px dotted var(--ink-line); }

.mh-clip { max-width: 820px; margin: 0 auto; background: var(--ink-card); border: 1px solid var(--ink-line); padding: 2rem 2rem 1.75rem; position: relative; box-shadow: 5px 5px 0 rgba(0,0,0,.2); }
.mh-clip::before { content: ''; position: absolute; top: -8px; left: 50%; width: 28px; height: 14px; background: var(--rust); transform: translateX(-50%) skewY(-2deg); }
.mh-clip-mast { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: .8rem; margin-bottom: 1.1rem; border-bottom: 2px solid var(--gold-deep); font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .26em; text-transform: uppercase; color: var(--gold); }
.mh-clip-mast .meta { color: var(--cream-mute); }
.mh-clip-head { font-family: var(--serif); font-size: clamp(1.7rem, 3vw, 2.3rem); line-height: 1.05; color: var(--cream); margin-bottom: .8rem; letter-spacing: -.015em; }
.mh-clip-head em { color: var(--gold); font-style: italic; }
.mh-clip-body { font-family: var(--serif); font-size: 1.02rem; line-height: 1.65; color: var(--cream-soft); }
.mh-clip-body strong { color: var(--cream); font-family: var(--sans); font-weight: 600; }

.mh-empty { padding: 3rem 1.5rem; text-align: center; font-family: var(--serif); font-style: italic; color: var(--cream-mute); border: 1px dashed var(--ink-line); }
`

const DROPDOWN_SCRIPT = `(function(){var d=document.getElementById('ed-drop');if(!d)return;var b=d.querySelector('.ed-drop-btn');if(!b)return;b.addEventListener('click',function(e){e.stopPropagation();d.classList.toggle('open');});document.addEventListener('click',function(e){if(!d.contains(e.target))d.classList.remove('open');});var n=document.querySelector('.ed-nav');function p(){if(!n)return;var h=n.getBoundingClientRect().height;if(h>0)document.documentElement.style.setProperty('--nav-h',h+'px');}p();window.addEventListener('resize',p);})()`

export function ChronicleShell({
  chronicle,
  active,
  children,
  edition,
  deck,
  intro,
}: {
  chronicle: ShellChronicle
  active: ChapterSlug
  children: ReactNode
  edition?: string
  deck?: string
  intro?: ReactNode
}) {
  const slug = chronicle.chronicle.slug
  const totals = chronicle.totals
  const winPct = (totals.winPct * 100).toFixed(1)
  const decided = totals.wins + totals.losses
  const recordLine = decided > 0
    ? `${totals.wins}-${totals.losses}${totals.ties ? `-${totals.ties}` : ''} · ${winPct}%`
    : 'NO GAMES'

  const activeChapter = CHAPTERS.find((c) => c.slug === active)
  const editionTitle = edition ?? activeChapter?.title ?? 'Manager Hub'
  const editionKicker = active === 'desk' ? 'The War Room · Issue VI · Sub-page'
    : active === 'scout' ? 'The War Room · Issue VI · Sub-page'
    : active === 'trade-desk' ? 'The War Room · Issue VI · Sub-page'
    : active === 'settings' ? 'Chronicle settings'
    : 'The jzFF Dispatch'

  // Chapbar lights up Issue VI for the tool pages (they live under the War
  // Room), front for the masthead, nothing for settings (it sits outside the
  // Issues).
  const activeIssue = active === 'front' ? 'front' : active === 'settings' ? '' : 'war-room'

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHELL_STYLES }} />

      <div className="ed-glow" />
      <div className="ed-grain" />

      <div className="ed-ticker">
        <div className="ed-ticker-track">
          {[0, 1].map((i) => (
            <div key={i} className="ed-ticker-group">
              <span className="ed-ticker-item"><span className="ed-ticker-star">★</span> THE {chronicle.chronicle.displayName.toUpperCase()} CHRONICLE</span>
              <span className="ed-ticker-item">{totals.leagues} {totals.leagues === 1 ? 'LEAGUE' : 'LEAGUES'}</span>
              <span className="ed-ticker-item">{totals.seasonsPlayed} SEASONS</span>
              {totals.championships > 0 && <span className="ed-ticker-item"><span className="ed-ticker-star">★</span> {totals.championships} {totals.championships === 1 ? 'RING' : 'RINGS'}</span>}
              <span className="ed-ticker-item">{recordLine}</span>
            </div>
          ))}
        </div>
      </div>

      <nav className="ed-nav">
        <div className="ed-drop" id="ed-drop">
          <button className="ed-drop-btn" type="button" aria-haspopup="menu" aria-label="Open library">
            <svg className="ed-drop-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="ed-drop-menu" role="menu">
            <span className="ed-drop-label">Issues</span>
            {ISSUES.map((iss) => (
              <Link key={iss.slug} href={iss.href(slug)}>
                {iss.label}
              </Link>
            ))}
            <span className="ed-drop-label">War Room Tools</span>
            <Link href={`/manager/${slug}/war-room/wire`} className={active === ('war-room' as ChapterSlug) ? 'is-active' : ''}>The Live Wire</Link>
            <Link href={`/manager/${slug}/desk`} className={active === 'desk' ? 'is-active' : ''}>Player Desk</Link>
            <Link href={`/manager/${slug}/scout`} className={active === 'scout' ? 'is-active' : ''}>The Scout</Link>
            <Link href={`/manager/${slug}/trade-builder`} className={active === 'trade-desk' ? 'is-active' : ''}>Trade Desk</Link>
            <span className="ed-drop-label">Manager</span>
            <Link href={`/manager/${slug}/settings`}>Settings</Link>
            <Link href="/dashboard">← Dashboard</Link>
          </div>
        </div>
        <div className="ed-nav-center">
          <div className="ed-nav-kicker">{editionKicker}</div>
          <div className="ed-nav-title">The <em>{chronicle.chronicle.displayName}</em> Chronicle</div>
        </div>
        <Link
          href={active === 'settings' ? `/manager/${slug}` : `/manager/${slug}/war-room`}
          className="ed-nav-link"
        >
          {active === 'settings' ? '← Front Page' : '← War Room'}
        </Link>
      </nav>

      <nav className="ed-chapbar" aria-label="Issues">
        <div className="ed-chapbar-track">
          {ISSUES.map((iss) => (
            <Link
              key={iss.slug}
              href={iss.href(slug)}
              className={`ed-chapbar-link${iss.slug === activeIssue ? ' is-active' : ''}`}
            >
              {iss.label}
            </Link>
          ))}
        </div>
      </nav>

      <header className="ed-edition">
        <div className="ed-edition-sup"><span className="star">★</span> {editionTitle} <span className="star">★</span></div>
        <h1 className="ed-edition-title">{renderEditionTitle(editionTitle)}</h1>
        {deck && <p className="ed-edition-deck">{deck}</p>}
        <div className="ed-edition-rule"></div>
      </header>

      {intro && (
        <section className="ed-lede">
          <div className="ed-lede-frame">
            <div className="ed-lede-mast"><span className="star">★</span> The Editor's Lede <span className="star">★</span></div>
            <div className="ed-lede-body">{intro}</div>
          </div>
        </section>
      )}

      <main className="ed-main mh-page">
        <div className="mh-broadsheet">{children}</div>
      </main>

      <section className="ed-continue">
        <Link href={`/manager/${slug}/war-room`}>
          <div className="ed-continue-dir">← Back</div>
          <div className="ed-continue-num">Issue VI</div>
          <div className="ed-continue-name">The War Room</div>
          <div className="ed-continue-kicker">Tools hub</div>
        </Link>
        <Link href={`/manager/${slug}`}>
          <div className="ed-continue-dir">Issue I</div>
          <div className="ed-continue-num">Front Page</div>
          <div className="ed-continue-name">The Grand Chronicle</div>
          <div className="ed-continue-kicker">Career masthead</div>
        </Link>
      </section>

      <footer className="ed-foot">
        <div>End of {editionTitle} · The <em>{chronicle.chronicle.displayName}</em> Chronicle</div>
        <div style={{ marginTop: '.5rem' }}>The <em>jzFF</em> Dispatch · Issue VI Sub-page</div>
      </footer>

      <script dangerouslySetInnerHTML={{ __html: DROPDOWN_SCRIPT }} />
    </>
  )
}

// Split the edition title on the last word so we can italicize the tail —
// matches the visual rhythm of the template Issue mastheads ("The Story
// of <em>You.</em>").
function renderEditionTitle(t: string): ReactNode {
  const parts = t.trim().split(/\s+/)
  if (parts.length <= 1) return <em>{t}</em>
  const head = parts.slice(0, -1).join(' ')
  const tail = parts[parts.length - 1]
  return <>{head} <em>{tail}.</em></>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="mh-empty">{children}</div>
}
