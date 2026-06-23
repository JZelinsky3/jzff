'use client'

import { useEffect, useState } from 'react'

// Almanac page — single rendered card that rotates through different
// chapters (champions / records / rivalries). Earlier versions stacked
// three absolutely-positioned pages with blur filters and SVG turbulence
// noise on each layer; that produced a "depth" effect but cost real frame
// time during scroll + the 7s tick. This version drops the stack and the
// filters entirely — one DOM card, content swaps in place with a cheap
// opacity fade. The dot tablist still lets readers jump pages manually.

type Page = {
  chapter: string
  pageNum: string
  title: [string, string]
  lead: string
  body: string
  feature: { label: string; parts: string[] }
  seal: string
}

const PAGES: Page[] = [
  {
    chapter: 'Ch. II · Champion Rolls',
    pageNum: 'p. 47',
    title: ['Champion,', '2024.'],
    lead: 'Tendency, at last — by a half-point and a Monday-night kicker.',
    body:
      'The PAM Slingers entered Sunday undefeated for the year; they left the season as runners-up. Tight End Tendency held the lead for ninety minutes of football and surrendered it for ninety seconds, then took it back to stay. The book records the result and not the heartbreak.',
    feature: { label: 'Final', parts: ['Tendency 142.6', 'Slingers 142.1'] },
    seal: 'Vol. VII',
  },
  {
    chapter: 'Ch. III · Record Book',
    pageNum: 'p. 112',
    title: ['Single-Week', 'High.'],
    lead: 'The largest one-week score in league history, since 2018.',
    body:
      "Dad Bod Dynasty's Week 9 outing in 2022 still stands as the league's high-water mark — a 198.4 from a roster with no obvious stars and a kicker who outscored two opposing wide receivers. The chronicle keeps the box score so the argument can rest.",
    feature: { label: 'Mark', parts: ['198.4 pts', 'Dad Bod · Wk. 9, 2022'] },
    seal: 'Record',
  },
  {
    chapter: 'Ch. V · Rivalries',
    pageNum: 'p. 184',
    title: ['Slingers', '↔ Dad Bod.'],
    lead: 'Sixteen meetings. Nine to seven. The book records every one.',
    body:
      'Four playoff meetings split evenly. Three different decades of football — well, three different commissioners, anyway. The longest game went to a Monday-night fumble at the goal line, and neither manager has spoken of it since.',
    feature: { label: 'All-time', parts: ['9 — 7', '4 Playoff Meetings'] },
    seal: 'Rivalry',
  },
]

export function HeroClipping() {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    // Reduced-motion readers stay on whichever page they manually selected.
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer) return
      timer = setInterval(() => {
        setIdx((i) => (i + 1) % PAGES.length)
      }, 8000)
    }
    const stop = () => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const p = PAGES[idx]

  return (
    <div className="hc-stack" aria-label="A page from a finished almanac">
      {/* Single page — content fades when idx changes. The key on the
          inner content is what triggers React to remount it, which kicks
          off the CSS fade-in animation cleanly. Outer chrome (border,
          shadow, seal corner ornament) stays mounted so the card itself
          never repaints. */}
      <article className="hc-page is-active">
        <div className="hc-page-inner" key={idx}>
          <header className="hc-page-head">
            <span className="hc-chapter">{p.chapter}</span>
            <span className="hc-pagenum">{p.pageNum}</span>
          </header>

          <div className="hc-ornament" aria-hidden="true">
            <span className="hc-rule" />
            <span className="hc-ornament-mark">✦</span>
            <span className="hc-rule" />
          </div>

          <h3 className="hc-title">
            {p.title[0]} <em>{p.title[1]}</em>
          </h3>
          <p className="hc-lead">{p.lead}</p>
          <p className="hc-body">{p.body}</p>

          <div className="hc-feature">
            <span className="hc-feature-label">{p.feature.label}</span>
            <span className="hc-feature-value">
              {p.feature.parts.map((part, pi) => (
                <span key={pi} className="hc-feature-piece">
                  {pi > 0 && <span className="hc-feature-sep" aria-hidden="true">·</span>}
                  {part}
                </span>
              ))}
            </span>
          </div>
        </div>

        <div className="hc-seal" aria-hidden="true">
          <span className="hc-seal-inner">{p.seal}</span>
        </div>
      </article>

      <div className="hc-dots" role="tablist" aria-label="Almanac page selector">
        {PAGES.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === idx}
            className={`hc-dot${i === idx ? ' is-active' : ''}`}
            onClick={() => setIdx(i)}
            aria-label={`Show page ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
