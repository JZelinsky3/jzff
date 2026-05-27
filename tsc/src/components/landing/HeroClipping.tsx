'use client'

import { useEffect, useState } from 'react'

// Almanac-plaque style — a stack of "pages" from a bound almanac that
// rotate through different chapters (champions / records / standings).
// Cream paper, gold rules and ornaments, navy ink. Deliberately less
// "newspaper clipping" and more "page from a record book."

type Page = {
  chapter: string          // small uppercase top label
  pageNum: string          // page number, top-right
  title: [string, string]  // first word, italic word
  lead: string             // single italic lede sentence
  body: string             // body paragraph
  feature: {               // single feature line — replaces the boxed stat strip
    label: string
    value: string
  }
  seal: string             // gold seal text in the corner
}

const PAGES: Page[] = [
  {
    chapter: 'Ch. II · Champion Rolls',
    pageNum: 'p. 47',
    title: ['Champion,', 'MMXXIV.'],
    lead: 'Tendency, at last — by a half-point and a Monday-night kicker.',
    body:
      'The PAM Slingers entered Sunday undefeated for the year; they left the season as runners-up. Tight End Tendency held the lead for ninety minutes of football and surrendered it for ninety seconds, then took it back to stay. The book records the result and not the heartbreak.',
    feature: { label: 'Final', value: 'Tendency 142.6 · Slingers 142.1' },
    seal: 'Vol. VII',
  },
  {
    chapter: 'Ch. III · Record Book',
    pageNum: 'p. 112',
    title: ['Single-Week', 'High.'],
    lead: 'The largest one-week score in league history, since MMXVIII.',
    body:
      "Dad Bod Dynasty's Week 9 outing in 2022 still stands as the league's high-water mark — a 198.4 from a roster with no obvious stars and a kicker who outscored two opposing wide receivers. The chronicle keeps the box score so the argument can rest.",
    feature: { label: 'Mark', value: '198.4 · Dad Bod Dynasty · Wk. 9 MMXXII' },
    seal: 'Record',
  },
  {
    chapter: 'Ch. V · Rivalries',
    pageNum: 'p. 184',
    title: ['Slingers', '↔ Dad Bod.'],
    lead: 'Sixteen meetings. Eight to seven. One tie. The book is honest about it.',
    body:
      'Four playoff meetings split evenly. Three different decades of football — well, three different commissioners, anyway. The longest game went to a Monday-night fumble at the goal line, and neither manager has spoken of it since.',
    feature: { label: 'All-time', value: '8 — 7 — 1 · 4 playoff meetings' },
    seal: 'Rivalry',
  },
]

export function HeroClipping() {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % PAGES.length)
    }, 7000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="hc-stack" aria-label="A page from a finished almanac">
      {PAGES.map((p, i) => {
        const active = i === idx
        const offset = (i - idx + PAGES.length) % PAGES.length
        return (
          <article
            key={i}
            className={`hc-page${active ? ' is-active' : ''}`}
            data-offset={offset}
            aria-hidden={!active}
          >
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
              <span className="hc-feature-value">{p.feature.value}</span>
            </div>

            <div className="hc-seal" aria-hidden="true">
              <span className="hc-seal-inner">{p.seal}</span>
            </div>
          </article>
        )
      })}
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
