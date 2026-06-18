'use client'

import { useState } from 'react'

// Click-to-load iframe of the public /demo/ site. The poster mirrors how
// the dashboard /dashboard actually renders a user's library — the same
// card layout (corner platform · big roman initial · serif title ·
// last-synced line · "Open" CTA) — so visitors see the product they get
// once signed in. The demo league is highlighted with a gold "▶ Demo"
// tag and acts as the affordance for the click-to-load.

export function DemoViewer() {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="dv-frame">
      <div className="dv-chrome">
        <div className="dv-chrome-dots">
          <span /> <span /> <span />
        </div>
        <div className="dv-chrome-url">
          <span className="dv-chrome-lock">●</span>
          thesundaychronicle.app<span className="dv-chrome-path">/dashboard</span>
        </div>
        {loaded && (
          <button
            type="button"
            onClick={() => setLoaded(false)}
            className="dv-chrome-open"
            aria-label="Pause the demo and return to the cover"
          >
            Pause ❚❚
          </button>
        )}
        <a href="/demo/" target="_blank" rel="noopener" className="dv-chrome-open">
          Open ↗
        </a>
      </div>
      <div className="dv-screen">
        {loaded ? (
          <iframe
            src="/demo/"
            title="The Sunday Chronicle — Live demo almanac"
            className="dv-iframe"
            loading="lazy"
          />
        ) : (
          <button
            type="button"
            onClick={() => setLoaded(true)}
            className="dv-poster"
            aria-label="Load the live demo almanac"
          >
            <div className="dv-poster-bg" aria-hidden="true">
              <div className="dv-poster-ticker">
                <div className="dv-poster-ticker-track">
                  <span>★ THE SUNDAY CHRONICLE · YOUR LIBRARY</span>
                  <span>★ EVERY LEAGUE · BOUND FOREVER</span>
                  <span>★ KEPT IN THE BOOKS, ONE PER SHELF</span>
                  <span>★ THE SUNDAY CHRONICLE · YOUR LIBRARY</span>
                </div>
              </div>

              <div className="dv-poster-mast">
                <div className="dv-poster-mast-kicker">★ TSC · Vol. II · Your Library ★</div>
                <h2 className="dv-poster-mast-title">
                  Your <em>library.</em>
                </h2>
                <div className="dv-poster-mast-sub">
                  Every league you&apos;ve archived, kept on one shelf.
                </div>
              </div>

              <div className="dv-poster-section">
                <div className="dv-poster-section-head">
                  <span className="dv-poster-section-num">§ 01 · Your leagues</span>
                  <span className="dv-poster-section-meta">3 on the shelf</span>
                </div>
                <div className="dv-poster-cards">
                  <LeagueCard
                    initial="L"
                    platform="Sleeper"
                    head="Lakeside"
                    tail="League"
                    desc="Last synced Sun, Jan 11"
                    featured
                  />
                  <LeagueCard
                    initial="P"
                    platform="ESPN"
                    head="PAM"
                    tail="Slingers"
                    desc="Last synced Tue, Dec 17"
                  />
                  <LeagueCard
                    initial="D"
                    platform="NFL.com"
                    head="Dad Bod"
                    tail="Dynasty"
                    desc="Last synced Mon, Dec 23"
                  />
                </div>
              </div>
            </div>

            <div className="dv-poster-play">
              <span className="dv-poster-play-icon">▶</span>
              <span className="dv-poster-play-label">Open the demo league</span>
              <span className="dv-poster-play-meta">Lakeside League · 7 seasons</span>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}

function LeagueCard({
  initial, platform, head, tail, desc, featured,
}: {
  initial: string
  platform: string
  head: string
  tail: string
  desc: string
  featured?: boolean
}) {
  return (
    <div className={`dv-poster-card${featured ? ' is-featured' : ''}`}>
      {featured && <div className="dv-poster-card-tag">▶ Demo</div>}
      <div className="dv-poster-card-corner">{platform}</div>
      <div className="dv-poster-card-roman">{initial}</div>
      <div className="dv-poster-card-title">
        {head} <em>{tail}.</em>
      </div>
      <div className="dv-poster-card-desc">{desc}</div>
      <div className="dv-poster-card-cta">
        Open the archive <span className="dv-poster-card-arrow">→</span>
      </div>
    </div>
  )
}
