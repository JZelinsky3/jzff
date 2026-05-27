'use client'

import { useState } from 'react'

// Click-to-load iframe of the public /demo/ site. The poster is styled as
// a "library catalog" — a TSC masthead over four volume cards, with the
// demo league highlighted as the one that opens on click. This frames the
// product the way the dashboard frames it (a shelf of bound chronicles),
// instead of imitating a single league's home page.

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
              <div className="dv-poster-ticker">
                <div className="dv-poster-ticker-track">
                  <span>★ THE SUNDAY CHRONICLE · YOUR LIBRARY</span>
                  <span>★ EVERY LEAGUE · BOUND FOREVER</span>
                  <span>★ KEPT IN THE BOOKS, ONE PER SHELF</span>
                  <span>★ THE SUNDAY CHRONICLE · YOUR LIBRARY</span>
                </div>
              </div>

              <div className="dv-poster-mast">
                <div className="dv-poster-mast-kicker">★ TSC · Your Library ★</div>
                <h2 className="dv-poster-mast-title">
                  The <em>Library.</em>
                </h2>
                <div className="dv-poster-mast-sub">
                  Every league you&apos;ve archived, kept on one shelf.
                </div>
              </div>

              <div className="dv-poster-section">
                <div className="dv-poster-section-head">
                  <span className="dv-poster-section-num">§ 01 · Your archives</span>
                  <span className="dv-poster-section-meta">4 leagues · 28 seasons</span>
                </div>
                <div className="dv-poster-shelf">
                  <div className="dv-poster-vol is-featured">
                    <div className="dv-poster-vol-tag">▶ Demo league</div>
                    <div className="dv-poster-vol-head">
                      <span className="dv-poster-vol-num">Vol. VII</span>
                      <span className="dv-poster-vol-pill">Sleeper</span>
                    </div>
                    <div className="dv-poster-vol-name">
                      The Lakeside <em>League.</em>
                    </div>
                    <div className="dv-poster-vol-meta">2018 — 2025 · 7 seasons</div>
                    <div className="dv-poster-vol-stats">17 managers · 644 matchups</div>
                  </div>
                  <div className="dv-poster-vol">
                    <div className="dv-poster-vol-head">
                      <span className="dv-poster-vol-num">Vol. III</span>
                      <span className="dv-poster-vol-pill">ESPN</span>
                    </div>
                    <div className="dv-poster-vol-name">PAM Slingers</div>
                    <div className="dv-poster-vol-meta">2022 — 2024 · 3 seasons</div>
                  </div>
                  <div className="dv-poster-vol">
                    <div className="dv-poster-vol-head">
                      <span className="dv-poster-vol-num">Vol. IV</span>
                      <span className="dv-poster-vol-pill">NFL.com</span>
                    </div>
                    <div className="dv-poster-vol-name">Dad Bod Dynasty</div>
                    <div className="dv-poster-vol-meta">2021 — 2024 · 4 seasons</div>
                  </div>
                  <div className="dv-poster-vol">
                    <div className="dv-poster-vol-head">
                      <span className="dv-poster-vol-num">Vol. II</span>
                      <span className="dv-poster-vol-pill">Sleeper</span>
                    </div>
                    <div className="dv-poster-vol-name">Sunday Money League</div>
                    <div className="dv-poster-vol-meta">2023 — 2024 · 2 seasons</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="dv-poster-play">
              <span className="dv-poster-play-icon">▶</span>
              <span className="dv-poster-play-label">Open the demo league</span>
              <span className="dv-poster-play-meta">Vol. VII — The Lakeside League</span>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
