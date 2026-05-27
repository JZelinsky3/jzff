'use client'

import { useEffect, useState } from 'react'

// Cycles through mocked-up "front-page clippings" so the hero has something
// alive in the first 3 seconds — instead of a static block of marketing copy.
// Content is hand-picked to demonstrate what a real almanac page looks like.

type Clipping = {
  edition: string
  dateline: string
  kicker: string
  headline: [string, string]
  byline: string
  body: string
  stamp: string
  stats: { label: string; value: string }[]
}

const CLIPPINGS: Clipping[] = [
  {
    edition: 'No. CXLII',
    dateline: 'Sunday · Wk. 17',
    kicker: 'Championship Edition',
    headline: ['The Slingers,', 'undone at last.'],
    byline: 'A four-year reign ends in a blizzard of points.',
    body:
      'After a regular season spent untouched at the top of the standings, the PAM Slingers fell in the title game to Tight End Tendency by a single half-point — settled, fittingly, by a Monday-night kicker.',
    stamp: 'Vol. VII',
    stats: [
      { label: 'Final', value: '142.6 · 142.1' },
      { label: 'Margin', value: '0.5 pts' },
      { label: 'Title No.', value: 'I' },
    ],
  },
  {
    edition: 'No. CXLIII',
    dateline: 'Tuesday · Trade Wire',
    kicker: 'Bourse · The Trade Wire',
    headline: ['A draft pick', 'changes hands.'],
    byline: 'Three-team deal reshuffles the dynasty board.',
    body:
      "Dad Bod Dynasty surrendered next year's first to Tendency in exchange for a veteran tight end and a late-season flier — a quiet, considered move that the standings will spend the next eighteen months interpreting.",
    stamp: 'Grade B',
    stats: [
      { label: 'Pieces', value: '3 + 1.04' },
      { label: 'Grade', value: 'B+' },
      { label: 'Era', value: 'MMXXVI' },
    ],
  },
  {
    edition: 'No. CXLIV',
    dateline: 'Records · All-Time',
    kicker: 'The Long Memory',
    headline: ['Eight seasons,', 'one rivalry.'],
    byline: 'The book on Slingers ↔ Dad Bod, kept faithfully.',
    body:
      "Sixteen meetings. Eight to seven, with one tie. They have met four times in the playoffs and split them evenly. The chronicle keeps every column, every point, every Sunday — so the argument can rest.",
    stamp: 'Hand-picked',
    stats: [
      { label: 'Meetings', value: '16' },
      { label: 'Record', value: '8–7–1' },
      { label: 'Playoffs', value: '2–2' },
    ],
  },
]

export function HeroClipping() {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % CLIPPINGS.length)
    }, 6500)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="hc-stack" aria-label="A live clipping from a finished almanac">
      {CLIPPINGS.map((c, i) => {
        const active = i === idx
        // Offsets fan the inactive cards out behind the active one — like a
        // small stack of clippings on the desk.
        const offset = (i - idx + CLIPPINGS.length) % CLIPPINGS.length
        return (
          <article
            key={i}
            className={`hc-card${active ? ' is-active' : ''}`}
            data-offset={offset}
            aria-hidden={!active}
          >
            <header className="hc-card-head">
              <span className="hc-edition">{c.edition}</span>
              <span className="hc-dateline">{c.dateline}</span>
            </header>
            <div className="hc-kicker">★ {c.kicker} ★</div>
            <h3 className="hc-headline">
              {c.headline[0]} <em>{c.headline[1]}</em>
            </h3>
            <div className="hc-byline">{c.byline}</div>
            <div className="hc-rule" />
            <p className="hc-body">{c.body}</p>
            <div className="hc-stats">
              {c.stats.map((s) => (
                <div key={s.label} className="hc-stat">
                  <span className="hc-stat-label">{s.label}</span>
                  <span className="hc-stat-value">{s.value}</span>
                </div>
              ))}
            </div>
            <div className="hc-stamp">{c.stamp}</div>
          </article>
        )
      })}
      <div className="hc-dots" role="tablist" aria-label="Clipping selector">
        {CLIPPINGS.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === idx}
            className={`hc-dot${i === idx ? ' is-active' : ''}`}
            onClick={() => setIdx(i)}
            aria-label={`Show clipping ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
