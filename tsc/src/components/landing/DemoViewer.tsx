'use client'

import { useState } from 'react'

// Click-to-load iframe of the public /demo/ site, framed inside a vintage
// "viewing window" so it reads as part of the page rather than a tacked-on
// preview. Deferring the load keeps it off the critical path.

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
              <div className="dv-poster-ticker" />
              <div className="dv-poster-masthead">
                <div className="dv-poster-kicker">★ Vol. VII · Est. MMXVIII ★</div>
                <div className="dv-poster-title">
                  PAMS<em>.</em>
                </div>
                <div className="dv-poster-sub">The League Almanac · Demo Edition</div>
              </div>
              <div className="dv-poster-grid">
                <div className="dv-poster-card">
                  <span>Ch. i</span> <strong>Season Archives</strong>
                </div>
                <div className="dv-poster-card">
                  <span>Ch. ii</span> <strong>Champion Rolls</strong>
                </div>
                <div className="dv-poster-card">
                  <span>Ch. iii</span> <strong>Draft Boards</strong>
                </div>
                <div className="dv-poster-card">
                  <span>Ch. iv</span> <strong>Manager Dossiers</strong>
                </div>
              </div>
            </div>
            <div className="dv-poster-play">
              <span className="dv-poster-play-icon">▶</span>
              <span className="dv-poster-play-label">Tour the live demo</span>
              <span className="dv-poster-play-meta">7 years of one real league</span>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
