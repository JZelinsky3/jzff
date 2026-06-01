// Shared kit for the Manager Hub multi-page chronicle.
//
// This file holds everything the per-route pages compose from:
//   • <ChronicleShell>   the page frame — top action bar + chapter rail + paper
//   • <ChapterRail>      the link-bar nav (active = current route)
//   • <FolioRail>        Spine variant A — left-edge printer's strip + postmark
//   • <PressPlate>       Spine variant B — top-right registration mark + column rule
//   • atoms              SecHead, Strip, Empty, FieldRule, Football, Seal, Agate
//   • helpers            fmtPct, ordinal, romanOr, careerSpan, etc.
//   • CSS                <ChronicleStyles/> — one <style> tag injected per page
//
// Pages mix "ingredients" (drafts + standings + records + rivalries + milestones)
// using these atoms with a different lead each time. Two pages currently wear
// different spines so we can A/B them in the real UI without a throwaway demo.

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'
import type { CareerSummary, CareerLeagueSummary } from '@/lib/manager/career'

// ── chapter rail (link bar, active=route) ─────────────────────────────────────

export type ChapterId = 'front' | 'standings' | 'drafts' | 'records' | 'rivals' | 'trophies' | 'setup'

export const CHAPTERS: { id: ChapterId; label: string; path: (slug: string) => string }[] = [
  { id: 'front',     label: 'Front Page',      path: (s) => `/manager/${s}` },
  { id: 'standings', label: 'Standings Desk',  path: (s) => `/manager/${s}/standings` },
  { id: 'drafts',    label: 'Draft Room',      path: (s) => `/manager/${s}/drafts` },
  { id: 'records',   label: 'Record Book',     path: (s) => `/manager/${s}/records` },
  { id: 'rivals',    label: 'Society Page',    path: (s) => `/manager/${s}/rivals` },
  { id: 'trophies',  label: 'Trophy Room',     path: (s) => `/manager/${s}/trophies` },
  { id: 'setup',     label: 'Manager Setup',   path: (s) => `/manager/${s}/settings` },
]

export function ChapterRail({ slug }: { slug: string }) {
  const path = usePathname() ?? ''
  const railRef = useRef<HTMLDivElement>(null)
  const activeId = activeChapter(path, slug)

  useEffect(() => {
    const tab = railRef.current?.querySelector<HTMLElement>(`[data-tab="${activeId}"]`)
    tab?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeId])

  return (
    <nav className="mh-rail" ref={railRef} aria-label="Chapters">
      {CHAPTERS.map((c, i) => {
        const active = c.id === activeId
        return (
          <Link
            key={c.id}
            data-tab={c.id}
            href={c.path(slug)}
            className={`mh-tab ${active ? 'is-active' : ''}`}
          >
            <span className="mh-tab-num">{String(i + 1).padStart(2, '0')}</span>
            {c.label}
          </Link>
        )
      })}
    </nav>
  )
}

function activeChapter(path: string, slug: string): ChapterId {
  const tail = path.replace(`/manager/${slug}`, '').replace(/^\//, '').split('/')[0] ?? ''
  if (tail === '') return 'front'
  if (tail === 'standings') return 'standings'
  if (tail === 'drafts')    return 'drafts'
  if (tail === 'records')   return 'records'
  if (tail === 'rivals')    return 'rivals'
  if (tail === 'trophies')  return 'trophies'
  if (tail === 'settings')  return 'setup'
  return 'front'
}

// ── Spine A: Folio Rail (left edge printer's strip + postmark) ───────────────

export type PostmarkKind = 'front' | 'ledger' | 'draft-perf' | 'crossed-pens' | 'rosette' | 'crown'

export function FolioRail({
  edition, sectionNum, sectionName, initials, syncDate, postmark,
}: {
  edition: string         // e.g. "EDITION XXVI"
  sectionNum: string      // e.g. "§ 01"
  sectionName: string     // e.g. "THE FRONT PAGE"
  initials: string        // e.g. "JZ"
  syncDate: string        // e.g. "Filed Nov 4"
  postmark: PostmarkKind
}) {
  return (
    <aside className="mh-folio" aria-hidden>
      <div className="mh-folio-strip">
        <span>{edition}</span>
        <span className="mh-folio-dot">●</span>
        <span>{sectionNum}</span>
        <span className="mh-folio-dot">●</span>
        <strong>{sectionName}</strong>
        <span className="mh-folio-dot">●</span>
        <span>{initials}</span>
        <span className="mh-folio-dot">●</span>
        <span>{syncDate}</span>
      </div>
      <div className="mh-folio-stamp">
        <Postmark kind={postmark} />
      </div>
    </aside>
  )
}

function Postmark({ kind }: { kind: PostmarkKind }) {
  // Each postmark is a 92×92 circular stamp — the page's "identity" mark.
  switch (kind) {
    case 'front':
      return (
        <svg viewBox="0 0 100 100" width="92" height="92" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--gold)" strokeWidth="1" opacity=".55" />
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--gold)" strokeWidth=".5" opacity=".8" strokeDasharray="2 3" />
          <text x="50" y="38" fill="var(--cream-mute)" fontFamily="var(--mono)" fontSize="6" fontWeight="700" letterSpacing="2" textAnchor="middle">FRONT</text>
          <text x="50" y="58" fill="var(--gold)" fontFamily="var(--serif)" fontStyle="italic" fontSize="20" textAnchor="middle">★</text>
          <text x="50" y="74" fill="var(--cream-mute)" fontFamily="var(--mono)" fontSize="6" fontWeight="700" letterSpacing="2" textAnchor="middle">PAGE</text>
        </svg>
      )
    case 'ledger':
      return (
        <svg viewBox="0 0 100 100" width="92" height="92" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--gold)" strokeWidth="1" opacity=".55" />
          <line x1="20" y1="42" x2="80" y2="42" stroke="var(--cream-mute)" strokeWidth=".5" />
          <line x1="20" y1="50" x2="80" y2="50" stroke="var(--cream-mute)" strokeWidth=".5" />
          <line x1="20" y1="58" x2="80" y2="58" stroke="var(--cream-mute)" strokeWidth=".5" />
          <text x="50" y="30" fill="var(--cream-mute)" fontFamily="var(--mono)" fontSize="6" fontWeight="700" letterSpacing="2" textAnchor="middle">LEDGER</text>
          <text x="50" y="72" fill="var(--gold)" fontFamily="var(--mono)" fontSize="6" fontWeight="700" letterSpacing="2" textAnchor="middle">DESK</text>
        </svg>
      )
    case 'draft-perf':
      return (
        <svg viewBox="0 0 100 100" width="92" height="92" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--gold)" strokeWidth="1" opacity=".55" strokeDasharray="3 2" />
          <rect x="32" y="32" width="36" height="36" fill="none" stroke="var(--gold)" strokeWidth=".75" />
          <text x="50" y="55" fill="var(--gold)" fontFamily="var(--serif)" fontStyle="italic" fontSize="18" textAnchor="middle">№</text>
        </svg>
      )
    case 'crossed-pens':
      return (
        <svg viewBox="0 0 100 100" width="92" height="92" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--gold)" strokeWidth="1" opacity=".55" />
          <line x1="32" y1="32" x2="68" y2="68" stroke="var(--gold)" strokeWidth="1.5" />
          <line x1="32" y1="68" x2="68" y2="32" stroke="var(--gold)" strokeWidth="1.5" />
          <circle cx="50" cy="50" r="6" fill="var(--ink)" stroke="var(--gold)" strokeWidth="1" />
        </svg>
      )
    case 'rosette':
      return (
        <svg viewBox="0 0 100 100" width="92" height="92" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--gold)" strokeWidth="1" opacity=".55" />
          <circle cx="50" cy="50" r="38" fill="none" stroke="var(--gold)" strokeWidth=".5" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="var(--gold)" strokeWidth=".4" />
          <polygon points="50,20 53,42 50,38 47,42" fill="var(--gold)" />
          <polygon points="50,80 47,58 50,62 53,58" fill="var(--gold)" />
          <polygon points="20,50 42,47 38,50 42,53" fill="var(--gold)" />
          <polygon points="80,50 58,53 62,50 58,47" fill="var(--gold)" />
        </svg>
      )
    case 'crown':
      return (
        <svg viewBox="0 0 100 100" width="92" height="92" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--gold)" strokeWidth="1" opacity=".55" />
          <path d="M30 60 L36 40 L44 55 L50 35 L56 55 L64 40 L70 60 Z" fill="none" stroke="var(--gold)" strokeWidth="1.2" />
          <line x1="30" y1="66" x2="70" y2="66" stroke="var(--gold)" strokeWidth="1" />
        </svg>
      )
  }
}

// ── Spine B: Press Plate (top-right registration + column rule) ──────────────

export function PressPlate({
  glyph, accent, sectionNum, sectionName,
}: {
  glyph: string                      // e.g. "⚖" "⛁" "⚔" "★"
  accent: 'gold' | 'cream' | 'rust' | 'steel'
  sectionNum: string
  sectionName: string
}) {
  return (
    <>
      <div className={`mh-plate mh-plate-${accent}`} aria-hidden>
        <svg viewBox="0 0 100 100" width="84" height="84">
          {/* registration crosshair */}
          <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth=".75" opacity=".6" />
          <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeWidth=".5" opacity=".4" />
          <line x1="50" y1="2" x2="50" y2="14" stroke="currentColor" strokeWidth=".75" />
          <line x1="50" y1="86" x2="50" y2="98" stroke="currentColor" strokeWidth=".75" />
          <line x1="2"  y1="50" x2="14" y2="50" stroke="currentColor" strokeWidth=".75" />
          <line x1="86" y1="50" x2="98" y2="50" stroke="currentColor" strokeWidth=".75" />
        </svg>
        <div className="mh-plate-glyph">{glyph}</div>
        <div className="mh-plate-label">{sectionNum} · {sectionName}</div>
      </div>
      <div className={`mh-platerule mh-platerule-${accent}`} aria-hidden />
    </>
  )
}

// ── Shell — top action bar + nav + paper container ───────────────────────────

export function ChronicleShell({
  slug, summary, spine, children,
}: {
  slug: string
  summary: CareerSummary
  spine?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="mh">
      <ChronicleStyles />

      <div className="mh-actions">
        <Link href="/manager/new" className="dc-btn">+ Add a league</Link>
        <Link href={`/manager/${slug}/settings`} className="dc-btn-ghost">Manager Setup</Link>
        <Link href="/dashboard" className="dc-btn-ghost">← Dashboard</Link>
      </div>

      <ChapterRail slug={slug} />

      <div className="mh-paper">
        {spine}
        <div className="mh-paper-inner">
          {children}
        </div>
      </div>

      <PaperFooter summary={summary} />
    </main>
  )
}

function PaperFooter({ summary }: { summary: CareerSummary }) {
  return (
    <footer className="mh-colophon">
      <span>— 30 —</span>
      <span>· The {summary.chronicle.displayName} Chronicle ·</span>
      <span>Set in type from {summary.totals.leagues} {summary.totals.leagues === 1 ? 'league' : 'leagues'} on file</span>
    </footer>
  )
}

// ── atoms ────────────────────────────────────────────────────────────────────

export function SecHead({ num, title, meta }: { num: string; title: string; meta?: string }) {
  return (
    <div className="mh-sechead">
      <span className="mh-sechead-num">{num}</span>
      <span className="mh-sechead-title">{title}</span>
      {meta && <span className="mh-sechead-meta">{meta}</span>}
    </div>
  )
}

export function Strip({ label, value, detail, cream }: { label: string; value: ReactNode; detail?: string; cream?: boolean }) {
  return (
    <div className="mh-stripitem">
      <div className="mh-strip-lbl">{label}</div>
      <div className={`mh-strip-val ${cream ? 'is-cream' : ''}`}>{value}</div>
      {detail && <div className="mh-strip-det">{detail}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="mh-empty">{children}</div>
}

export function FieldRule() {
  return (
    <div className="mh-fieldrule" aria-hidden>
      <span className="mh-hash" />
      <Football />
      <span className="mh-hash" />
    </div>
  )
}

export function Football() {
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

export function Seal({ year, small }: { year: number; small?: boolean }) {
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

// Agate strip — the "in this edition" tease: small items in a row.
export function Agate({ items }: { items: { label: string; value: ReactNode }[] }) {
  if (items.length === 0) return null
  return (
    <div className="mh-agate">
      {items.map((it, i) => (
        <div key={i} className="mh-agate-item">
          <div className="mh-agate-lbl">{it.label}</div>
          <div className="mh-agate-val">{it.value}</div>
        </div>
      ))}
    </div>
  )
}

// Pull quote / Callout used in mixed sidebars.
export function PullQuote({ kicker, body, attribution }: { kicker?: string; body: ReactNode; attribution?: string }) {
  return (
    <aside className="mh-pull">
      {kicker && <div className="mh-pull-kicker">{kicker}</div>}
      <div className="mh-pull-body">{body}</div>
      {attribution && <div className="mh-pull-attr">— {attribution}</div>}
    </aside>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function fmtPct(p: number): string {
  return p.toFixed(3).replace(/^0\./, '.')
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function romanOr(n: number): string {
  if (n <= 0) return 'I'
  const map: [number, string][] = [[40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = '', v = n
  for (const [val, sym] of map) while (v >= val) { out += sym; v -= val }
  return out
}

export function careerSpan(ready: CareerLeagueSummary[]): string {
  let lo = Infinity, hi = -Infinity
  for (const l of ready) {
    if (l.firstYear != null) lo = Math.min(lo, l.firstYear)
    if (l.lastYear != null) hi = Math.max(hi, l.lastYear)
  }
  if (lo === Infinity) return '—'
  return lo === hi ? `${lo}` : `${lo}–${hi}`
}

export function firstLetter(name: string): string {
  return (name.trim()[0] ?? 'A').toUpperCase()
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'JZ'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function syncDateLabel(summary: CareerSummary): string {
  // Most-recent sync across ready leagues — used in folio/footer.
  // Falls back to a year when nothing's synced.
  const ready = summary.leagues.filter((l) => l.status === 'ready')
  if (ready.length === 0) return 'Awaiting first edition'
  return 'Filed today'
}

// ── styles ────────────────────────────────────────────────────────────────────

export function ChronicleStyles() {
  return <style>{CSS}</style>
}

const CSS = `
.mh {
  max-width: 1080px;
  margin: 0 auto 4rem;
  padding: 0 1rem;
}

/* top action bar (same as before) */
.mh-actions {
  display: flex; gap: .6rem; justify-content: center; flex-wrap: wrap;
  padding: 1.25rem 1rem .5rem;
}

/* chapter rail — link bar, sticky */
.mh-rail {
  position: sticky; top: 0; z-index: 30;
  display: flex; gap: .25rem; overflow-x: auto;
  padding: .55rem .25rem; margin-bottom: 1.5rem;
  background: color-mix(in srgb, var(--ink) 90%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--ink-line);
  scrollbar-width: thin;
}
.mh-tab {
  flex: 0 0 auto; display: inline-flex; align-items: center; gap: .4rem;
  padding: .5rem .85rem; background: none; border: 1px solid transparent; border-radius: 2px;
  color: var(--cream-mute); cursor: pointer; text-decoration: none;
  font-family: var(--mono); font-weight: 700; font-size: .6rem; letter-spacing: .16em; text-transform: uppercase;
  white-space: nowrap; transition: all .15s;
}
.mh-tab:hover { color: var(--cream); background: var(--ink-soft); }
.mh-tab.is-active { color: var(--ink); background: var(--gold); border-color: var(--gold); }
.mh-tab-num { opacity: .55; }

/* paper container — supports spine overlays */
.mh-paper {
  position: relative;
  background:
    linear-gradient(180deg, rgba(232,200,137,.015), transparent 30%),
    var(--ink-card);
  border: 1px solid var(--ink-line);
  border-radius: 3px;
  box-shadow: 0 30px 80px rgba(0,0,0,.45);
  overflow: hidden;
}
.mh-paper-inner {
  position: relative; z-index: 1;
  padding: 3rem clamp(1.2rem, 5vw, 4rem);
}

/* ──────────────────────────────────────────────────────────────────────────
   SPINE A — Folio Rail
   Left edge vertical printer's strip, with a circular postmark below.
   ────────────────────────────────────────────────────────────────────────── */
.mh-folio {
  position: absolute; top: 0; bottom: 0; left: 0;
  width: 56px; pointer-events: none;
  border-right: 1px solid var(--ink-line);
  background: linear-gradient(180deg, rgba(232,200,137,.04), transparent 40%, transparent 70%, rgba(232,200,137,.025));
  z-index: 2;
}
.mh-folio::before {
  content: ''; position: absolute; left: 26px; top: 0; bottom: 0;
  border-left: 1px dashed color-mix(in srgb, var(--gold) 30%, transparent);
}
.mh-folio-strip {
  position: absolute; left: 18px; top: 50%; transform: rotate(-90deg) translateX(50%); transform-origin: left top;
  white-space: nowrap;
  display: flex; gap: .85rem; align-items: center;
  font-family: var(--mono); font-weight: 700; font-size: .56rem; letter-spacing: .35em; text-transform: uppercase;
  color: var(--cream-mute);
}
.mh-folio-strip strong { color: var(--gold); }
.mh-folio-dot { color: var(--gold); opacity: .5; }
.mh-folio-stamp {
  position: absolute; left: 50%; bottom: 2.5rem; transform: translateX(-50%);
  opacity: .85;
}
@media (max-width: 720px) {
  .mh-folio { width: 36px; }
  .mh-folio::before { left: 17px; }
  .mh-folio-strip { left: 9px; font-size: .5rem; letter-spacing: .25em; gap: .55rem; }
  .mh-folio-stamp { transform: translateX(-50%) scale(.65); bottom: 1rem; }
}
.mh-paper:has(.mh-folio) .mh-paper-inner { padding-left: clamp(4.5rem, 8vw, 6.5rem); }

/* ──────────────────────────────────────────────────────────────────────────
   SPINE B — Press Plate
   Top-right circular registration mark + a thin column rule down the left.
   ────────────────────────────────────────────────────────────────────────── */
.mh-plate {
  position: absolute; top: 1.5rem; right: 1.5rem;
  width: 84px; height: 84px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  pointer-events: none; z-index: 3;
  opacity: .9;
}
.mh-plate-gold  { color: var(--gold); }
.mh-plate-cream { color: var(--cream); }
.mh-plate-rust  { color: var(--rust); }
.mh-plate-steel { color: var(--steel); }
.mh-plate svg { position: absolute; inset: 0; }
.mh-plate-glyph {
  position: relative; font-family: var(--serif); font-style: italic;
  font-size: 1.9rem; line-height: 1; color: currentColor;
}
.mh-plate-label {
  position: absolute; top: 100%; left: 50%; transform: translateX(-50%); margin-top: .35rem;
  white-space: nowrap;
  font-family: var(--mono); font-weight: 700; font-size: .5rem; letter-spacing: .2em; text-transform: uppercase;
  color: var(--cream-mute);
}
.mh-platerule {
  position: absolute; top: 0; bottom: 0; left: 0;
  width: 4px; z-index: 2;
}
.mh-platerule-gold  { background: linear-gradient(180deg, var(--gold-deep), var(--gold) 30%, transparent); }
.mh-platerule-cream { background: linear-gradient(180deg, var(--cream-mute), var(--cream-soft) 30%, transparent); }
.mh-platerule-rust  { background: linear-gradient(180deg, var(--rust), color-mix(in srgb, var(--rust) 60%, transparent) 30%, transparent); }
.mh-platerule-steel { background: linear-gradient(180deg, var(--steel), color-mix(in srgb, var(--steel) 60%, transparent) 30%, transparent); }
.mh-paper:has(.mh-platerule) .mh-paper-inner { padding-left: clamp(2rem, 6vw, 4.5rem); padding-top: 2.5rem; }
@media (max-width: 720px) {
  .mh-plate { width: 60px; height: 60px; top: .8rem; right: .8rem; }
  .mh-plate-glyph { font-size: 1.3rem; }
  .mh-plate-label { display: none; }
}

/* section headers — used inside every page */
.mh-sechead {
  display: flex; align-items: baseline; gap: 1.25rem; flex-wrap: wrap;
  border-top: 3px double var(--ink-line);
  padding-top: 1rem; padding-bottom: 1rem;
  margin: 2rem 0 1.4rem;
  border-bottom: 1px solid var(--ink-line);
}
.mh-sec-first .mh-sechead { margin-top: 0; border-top: none; padding-top: 0; }
.mh-sechead-num {
  font-family: var(--mono); font-weight: 700; font-size: .6rem; letter-spacing: .3em; text-transform: uppercase;
  color: var(--gold); flex-shrink: 0;
}
.mh-sechead-title {
  font-family: var(--serif); font-style: italic; font-size: 1.75rem; line-height: 1.05; letter-spacing: -.01em;
  color: var(--cream);
}
.mh-sechead-meta {
  margin-left: auto;
  font-family: var(--mono); font-weight: 700; font-size: .55rem; letter-spacing: .18em; text-transform: uppercase;
  color: var(--cream-mute);
}

/* masthead — Front Page only */
.mh-front-mast { text-align: center; }
.mh-mast-rule { height: 1px; background: var(--ink-line); margin: .4rem 0; }
.mh-mast-rule-thick { height: 3px; background: var(--gold); opacity: .6; }
.mh-mast-meta { display: flex; flex-wrap: wrap; justify-content: center; gap: .8rem; padding: .5rem 0; font-family: var(--mono); font-weight: 700; font-size: .56rem; letter-spacing: .22em; text-transform: uppercase; color: var(--cream-mute); }
.mh-mast-title { font-family: var(--serif); font-size: clamp(2.6rem, 9vw, 6rem); line-height: .9; letter-spacing: -.03em; color: var(--cream); margin: .4rem 0; }
.mh-mast-title em { font-style: normal; color: var(--gold); }
.mh-mast-tag { font-family: var(--serif); font-style: italic; font-size: 1.15rem; color: var(--cream-soft); max-width: 56ch; margin: .6rem auto 0; }

/* field rule / hash marks */
.mh-fieldrule { display: flex; align-items: center; gap: .7rem; margin: 1.8rem auto; max-width: 30rem; }
.mh-hash { flex: 1; height: 6px; background-image: repeating-linear-gradient(90deg, var(--gold) 0 10px, transparent 10px 18px); opacity: .35; }

/* lead head + prose columns */
.mh-lead { margin: 1.2rem 0 .6rem; text-align: center; }
.mh-kicker { font-family: var(--mono); font-weight: 700; font-size: .62rem; letter-spacing: .3em; text-transform: uppercase; color: var(--gold); }
.mh-lead-head { font-family: var(--serif); font-size: clamp(1.8rem, 5vw, 3rem); line-height: 1.05; color: var(--cream); margin: .5rem 0 0; }

.mh-cols { columns: 2; column-gap: 2.4rem; column-rule: 1px solid var(--ink-line); text-align: left; margin-top: 1.4rem; font-family: var(--serif); font-size: 1rem; line-height: 1.65; color: var(--cream-soft); }
.mh-cols p { margin: 0; text-align: justify; }
.mh-dropcap { float: left; font-family: var(--serif); font-size: 3.6rem; line-height: .76; padding: .2rem .5rem .1rem 0; color: var(--gold); }
@media (max-width: 640px) { .mh-cols { columns: 1; } }

/* champion seals */
.mh-seals { display: flex; flex-wrap: wrap; justify-content: center; gap: 1rem; margin: 1.6rem 0 .5rem; }
.mh-seal { display: block; }

/* stat strip (career numbers row) */
.mh-strip { display: grid; grid-template-columns: repeat(6, 1fr); border-top: 1px solid var(--ink-line); border-bottom: 1px solid var(--ink-line); margin: 1.5rem 0; }
.mh-strip-4 { grid-template-columns: repeat(4, 1fr); }
.mh-strip-3 { grid-template-columns: repeat(3, 1fr); }
.mh-stripitem { padding: 1.3rem .9rem; border-right: 1px solid var(--ink-line); text-align: center; }
.mh-stripitem:last-child { border-right: none; }
.mh-strip-lbl { font-family: var(--mono); font-weight: 700; font-size: .54rem; letter-spacing: .2em; text-transform: uppercase; color: var(--cream-mute); margin-bottom: .5rem; }
.mh-strip-val { font-family: var(--serif); font-style: italic; font-size: 1.9rem; line-height: 1; color: var(--gold); }
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

/* agate strip — "in this edition" */
.mh-agate {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  border-top: 1px solid var(--ink-line); border-bottom: 1px solid var(--ink-line);
  margin: 2rem 0;
}
.mh-agate-item { padding: 1rem 1.1rem; border-right: 1px solid var(--ink-line-soft); }
.mh-agate-item:last-child { border-right: none; }
.mh-agate-lbl { font-family: var(--mono); font-weight: 700; font-size: .5rem; letter-spacing: .22em; text-transform: uppercase; color: var(--cream-mute); margin-bottom: .3rem; }
.mh-agate-val { font-family: var(--serif); font-size: 1rem; color: var(--cream-soft); line-height: 1.35; }
.mh-agate-val em { font-style: italic; color: var(--gold); }

/* pull quote sidebar */
.mh-pull {
  border-left: 3px solid var(--gold);
  background: rgba(232,200,137,.04);
  padding: 1.2rem 1.3rem;
  margin: 1.4rem 0;
}
.mh-pull-kicker { font-family: var(--mono); font-weight: 700; font-size: .54rem; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); margin-bottom: .4rem; }
.mh-pull-body { font-family: var(--serif); font-style: italic; font-size: 1.15rem; color: var(--cream); line-height: 1.5; }
.mh-pull-attr { font-family: var(--mono); font-size: .6rem; letter-spacing: .15em; text-transform: uppercase; color: var(--cream-mute); margin-top: .6rem; }

/* trophies grid (reused on Front + Trophy Room) */
.mh-trophies { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: 1rem; margin-top: 1rem; }
.mh-plaque { border: 1px solid var(--ink-line); border-radius: 3px; padding: 1.2rem .8rem; text-align: center; background: var(--ink-soft); display: flex; flex-direction: column; align-items: center; gap: .3rem; }
.mh-plaque.is-champ { border-color: var(--gold-deep); background: rgba(232,200,137,.06); }
.mh-plaque-ico { font-size: 2rem; }
.mh-plaque-year { font-family: var(--serif); font-size: 1.5rem; color: var(--cream); }
.mh-plaque-league { font-size: .82rem; color: var(--cream-soft); }
.mh-plaque-tag { font-family: var(--mono); font-weight: 700; font-size: .52rem; letter-spacing: .18em; text-transform: uppercase; color: var(--gold); margin-top: .2rem; }

/* empty/zero state */
.mh-empty { font-family: var(--serif); font-style: italic; color: var(--cream-mute); line-height: 1.6; padding: 2.5rem 1rem; text-align: center; font-size: 1.05rem; }

/* colophon — bottom-of-page sign-off (— 30 —, printer's traditional end-mark) */
.mh-colophon {
  display: flex; justify-content: center; gap: .9rem; align-items: center; flex-wrap: wrap;
  margin: 2rem auto 0; padding: 1.2rem;
  font-family: var(--mono); font-weight: 700; font-size: .56rem; letter-spacing: .22em; text-transform: uppercase;
  color: var(--cream-mute);
}

/* page-specific accents picked up by the Front Page below-the-fold grid */
.mh-fold {
  display: grid; grid-template-columns: 1.4fr 1fr 1.4fr; gap: 0;
  border-top: 1px solid var(--ink-line); border-bottom: 1px solid var(--ink-line);
  margin: 2rem 0;
}
@media (max-width: 760px) { .mh-fold { grid-template-columns: 1fr; } }
.mh-foldcol { padding: 1.4rem 1.3rem; border-right: 1px solid var(--ink-line-soft); }
.mh-foldcol:last-child { border-right: none; }
@media (max-width: 760px) { .mh-foldcol { border-right: none; border-bottom: 1px solid var(--ink-line-soft); } }
.mh-foldcol h3 { font-family: var(--mono); font-weight: 700; font-size: .56rem; letter-spacing: .25em; text-transform: uppercase; color: var(--gold); margin-bottom: .7rem; }
.mh-foldcol .mh-big { font-family: var(--serif); font-style: italic; font-size: 2.2rem; line-height: 1; color: var(--cream); }
.mh-foldcol p { font-family: var(--serif); font-size: .94rem; color: var(--cream-soft); line-height: 1.55; margin-top: .4rem; }

/* stub placeholder — used by the not-yet-built routes */
.mh-stub { padding: 4rem 1rem; text-align: center; }
.mh-stub h2 { font-family: var(--serif); font-style: italic; color: var(--cream); font-size: 2rem; }
.mh-stub p { font-family: var(--serif); color: var(--cream-mute); margin-top: 1rem; max-width: 40ch; margin-left: auto; margin-right: auto; line-height: 1.55; }
`
