'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

// Five almanac "pages" displayed in a horizontal scroll-snap track. The
// visitor can pan through them with trackpad/swipe/arrow buttons — but
// vertical scrolling is not hijacked. Earlier version pinned the section
// and drove the scroll from window-scroll, which felt aggressive on first
// landing.

type Page = {
  numeral: string
  chapter: string
  title: [string, string]
  blurb: string
  href: string
  cta: string
  body: React.ReactNode
}

const PAGES: Page[] = [
  {
    numeral: 'I',
    chapter: 'Chapter I · Season',
    title: ['Season', 'Archives.'],
    blurb:
      'Every year your league has existed, walked back. Final standings, every matchup, every playoff run — laid out the way an almanac would print them.',
    href: '/demo/seasons/',
    cta: 'Tour the season pages →',
    body: (
      <div className="cp-table">
        <div className="cp-table-head">
          <span>Final Standings · 2024</span>
          <span>Wk. 17</span>
        </div>
        {[
          ['1', 'Tight End Tendency', '12–2', '1,842.1'],
          ['2', 'PAM Slingers', '11–3', '1,801.6'],
          ['3', 'Dad Bod Dynasty', '10–4', '1,755.4'],
          ['4', 'Pittsburgh Tomlinmen', '9–5', '1,712.0'],
          ['5', 'Iron Sheik Bombers', '8–6', '1,688.3'],
          ['6', 'Bench Mob', '7–7', '1,640.9'],
        ].map(([rk, name, rec, pf]) => (
          <div key={rk} className="cp-row">
            <span className="cp-row-rk">{rk}</span>
            <span className="cp-row-name">{name}</span>
            <span className="cp-row-rec">{rec}</span>
            <span className="cp-row-pf">{pf}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    numeral: 'II',
    chapter: 'Chapter II · Champions',
    title: ['Champion', 'Rolls.'],
    blurb:
      'Trophy lifters, runner-ups, and the regular-season kings who never quite got there. The book remembers all three.',
    href: '/demo/records.html',
    cta: 'Read the record book →',
    body: (
      <div className="cp-roll">
        {[
          ['2024', 'Tendency',        '142.6–142.1 · Slingers'],
          ['2023', 'Dad Bod Dynasty', '138.0–119.4 · Tendency'],
          ['2022', 'Slingers',        '156.3–122.0 · Bombers'],
          ['2021', 'Slingers',        '130.4–128.1 · Tomlinmen'],
          ['2020', 'Bombers',         '148.8–146.9 · Slingers'],
          ['2019', 'Tomlinmen',       '122.5–117.0 · Bench Mob'],
        ].map(([yr, ch, fin]) => (
          <div key={yr} className="cp-roll-row">
            <span className="cp-roll-yr">{yr}</span>
            <span className="cp-roll-ch">{ch}</span>
            <span className="cp-roll-fin">{fin}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    numeral: 'III',
    chapter: 'Chapter III · Drafts',
    title: ['Draft', 'Boards.'],
    blurb:
      'Round by round, every year. Who they took, what slot, who got robbed late. Click a name and read every season since.',
    href: '/demo/draft/',
    cta: 'Pull a draft board →',
    body: (
      <div className="cp-draft">
        <div className="cp-draft-head">
          <span>Draft Board · 2024 · Rd. 1</span>
          <span>10-team · ½ PPR</span>
        </div>
        <div className="cp-draft-grid">
          {[
            ['1.01', 'CMC', 'Tendency'],
            ['1.02', "Ja'Marr", 'Slingers'],
            ['1.03', 'Bijan', 'Dad Bod'],
            ['1.04', 'Jefferson', 'Tomlinmen'],
            ['1.05', 'Lamb', 'Bombers'],
            ['1.06', 'Chase', 'Bench Mob'],
            ['1.07', 'Hill', 'Tendency'],
            ['1.08', 'Ekeler', 'Slingers'],
            ['1.09', 'Kelce', 'Dad Bod'],
            ['1.10', 'Adams', 'Tomlinmen'],
          ].map(([pk, ply, mgr]) => (
            <div key={pk} className="cp-pick">
              <div className="cp-pick-no">{pk}</div>
              <div className="cp-pick-name">{ply}</div>
              <div className="cp-pick-mgr">{mgr}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    numeral: 'IV',
    chapter: 'Chapter IV · Managers',
    title: ['Manager', 'Dossiers.'],
    blurb:
      'A page for every owner. Career records, championships, head-to-head against every rival in the league.',
    href: '/demo/managers/',
    cta: 'Pull a dossier →',
    body: (
      <div className="cp-dossier">
        <div className="cp-dossier-head">
          <div className="cp-dossier-avatar">JK</div>
          <div>
            <div className="cp-dossier-name">
              Jake K. <em>· PAM Slingers</em>
            </div>
            <div className="cp-dossier-tag">Joined 2018 · Seven seasons</div>
          </div>
        </div>
        <div className="cp-dossier-stats">
          {[
            ['Titles', '3'],
            ['Finals', '5'],
            ['Reg. W%', '.682'],
            ['All-time PF', '12,144.3'],
            ['Playoffs', '12'],
            ['vs. Tendency', '6–4'],
          ].map(([k, v]) => (
            <div key={k} className="cp-dossier-stat">
              <span className="cp-dossier-lbl">{k}</span>
              <span className="cp-dossier-val">{v}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    numeral: 'V',
    chapter: 'Chapter V · Rivalries',
    title: ['The', 'Rivalries.'],
    blurb:
      'Hand-picked feuds with running scoreboards. Every meeting, every playoff bracket they shared, every Sunday they ruined for each other.',
    href: '/demo/rivalries/',
    cta: 'Read a rivalry →',
    body: (
      <div className="cp-rivalry">
        <div className="cp-rivalry-vs">
          <div className="cp-rivalry-side">
            <div className="cp-rivalry-name">Slingers</div>
            <div className="cp-rivalry-rec">9</div>
          </div>
          <div className="cp-rivalry-dash">—</div>
          <div className="cp-rivalry-side">
            <div className="cp-rivalry-rec">7</div>
            <div className="cp-rivalry-name">Dad Bod</div>
          </div>
        </div>
        <div className="cp-rivalry-meta">16 meetings · since 2018</div>
        <div className="cp-rivalry-list">
          {[
            ['2024 · Wk. 14', 'Slingers 132.4 · 128.7'],
            ['2024 · Wk. 03', 'Dad Bod 110.0 · 108.2'],
            ['2023 · QF',     'Dad Bod 121.8 · 118.5'],
            ['2023 · Wk. 11', 'Slingers 144.3 · 99.1'],
          ].map(([when, score]) => (
            <div key={when} className="cp-rivalry-line">
              <span>{when}</span>
              <span>{score}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
]

export function ChroniclePages() {
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  // Update the active page indicator as the user scrolls the track
  // horizontally. Snap points already keep pages aligned; we just read
  // which one is closest to the start.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    let rafId = 0
    const onScroll = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        const pages = track.querySelectorAll<HTMLElement>('.cp-page')
        if (!pages.length) return
        const x = track.scrollLeft + 8
        let best = 0
        let bestDist = Infinity
        pages.forEach((p, i) => {
          const dist = Math.abs(p.offsetLeft - x)
          if (dist < bestDist) {
            bestDist = dist
            best = i
          }
        })
        setActive(best)
      })
    }
    onScroll()
    track.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      track.removeEventListener('scroll', onScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  const goTo = (i: number) => {
    const track = trackRef.current
    if (!track) return
    const pages = track.querySelectorAll<HTMLElement>('.cp-page')
    const target = pages[i]
    if (!target) return
    track.scrollTo({ left: target.offsetLeft, behavior: 'smooth' })
  }

  const step = (delta: number) => {
    const next = Math.min(PAGES.length - 1, Math.max(0, active + delta))
    goTo(next)
  }

  return (
    <section className="cp-section" aria-label="Pages of the Chronicle">
      <div className="cp-meta">
        <div className="cp-meta-left">
          <span className="cp-meta-num">§ 02 · The Pages</span>
          <span className="cp-meta-title">
            Five pages — <em>scroll the chronicle.</em>
          </span>
        </div>
        <div className="cp-meta-right">
          <div className="cp-dots" role="tablist" aria-label="Page selector">
            {PAGES.map((p, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={p.chapter}
                className={`cp-dot${i === active ? ' is-active' : ''}`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
          <div className="cp-arrows" aria-label="Page navigation">
            <button
              type="button"
              className="cp-arrow"
              aria-label="Previous page"
              onClick={() => step(-1)}
              disabled={active === 0}
            >
              ‹
            </button>
            <span className="cp-counter">
              {String(active + 1).padStart(2, '0')} <span>/ {String(PAGES.length).padStart(2, '0')}</span>
            </span>
            <button
              type="button"
              className="cp-arrow"
              aria-label="Next page"
              onClick={() => step(1)}
              disabled={active === PAGES.length - 1}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <div ref={trackRef} className="cp-track">
        {PAGES.map((page) => (
          <article key={page.numeral} className="cp-page">
            <div className="cp-page-aside">
              <div className="cp-page-chap">{page.chapter}</div>
              <div className="cp-page-num">{page.numeral}</div>
              <h3 className="cp-page-title">
                {page.title[0]} <em>{page.title[1]}</em>
              </h3>
              <p className="cp-page-blurb">{page.blurb}</p>
              <Link href={page.href} target="_blank" rel="noopener" className="cp-page-cta">
                {page.cta}
              </Link>
            </div>
            <div className="cp-page-body">{page.body}</div>
          </article>
        ))}
      </div>

      <div className="cp-hint">
        <span>Pan, swipe, or use the arrows · scroll past freely</span>
      </div>
    </section>
  )
}
