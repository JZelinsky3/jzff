'use client'

import { useState } from 'react'

// Click-to-load iframe of the public /demo/ site. The poster intentionally
// mirrors the real demo hub's layout — ticker + masthead + benchmark stat
// + chapter ledger — so a visitor can tell what they're about to load.

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
          jzff.online<span className="dv-chrome-path">/demo</span>
        </div>
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
              {/* Ticker — matches the gold ticker at the top of the demo */}
              <div className="dv-poster-ticker">
                <div className="dv-poster-ticker-track">
                  <span>★ THE LAKESIDE LEAGUE · VOL. II</span>
                  <span>★ EVERY CHAMPION · EVERY DRAFT</span>
                  <span>★ KEPT IN THE BOOKS SINCE MMXVIII</span>
                  <span>★ THE LAKESIDE LEAGUE · VOL. II</span>
                </div>
              </div>

              {/* Masthead — large serif, kicker, sub */}
              <div className="dv-poster-mast">
                <div className="dv-poster-mast-kicker">★ LSL · Fantasy Football Almanac ★</div>
                <h2 className="dv-poster-mast-title">
                  The Lakeside<br />
                  <em>League.</em>
                </h2>
                <div className="dv-poster-mast-sub">
                  Seven seasons of champions, blowouts, and grudge matches.
                </div>
                <div className="dv-poster-mast-meta">2019 — 2025 · 644 MATCHUPS · 17 MANAGERS</div>
              </div>

              {/* § 01 — single hero benchmark + 3 sub-stats, like the live page */}
              <div className="dv-poster-section">
                <div className="dv-poster-section-head">
                  <span className="dv-poster-section-num">§ 01 · Benchmarks</span>
                  <span className="dv-poster-section-meta">The records of record</span>
                </div>
                <div className="dv-poster-benchmarks">
                  <div className="dv-poster-hero-stat">
                    <div className="dv-poster-stat-label">Largest blowout</div>
                    <div className="dv-poster-stat-value">87.4 pts</div>
                    <div className="dv-poster-stat-detail">
                      <strong>Tendency</strong> over <strong>Bench Mob</strong> · Wk. 14, 2022
                    </div>
                  </div>
                  <div className="dv-poster-stat-grid">
                    <div className="dv-poster-stat">
                      <span>Most titles</span>
                      <strong>3</strong>
                    </div>
                    <div className="dv-poster-stat">
                      <span>Single-wk high</span>
                      <strong>198.4</strong>
                    </div>
                    <div className="dv-poster-stat">
                      <span>Longest streak</span>
                      <strong>11 W</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="dv-poster-play">
              <span className="dv-poster-play-icon">▶</span>
              <span className="dv-poster-play-label">Tour the live demo</span>
              <span className="dv-poster-play-meta">Seven years of one real league</span>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
