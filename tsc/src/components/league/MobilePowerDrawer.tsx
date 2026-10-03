'use client'

import { useState } from 'react'
import { CommishPower } from '@/app/league/[slug]/live/commish-power'

// The commissioner's power board on the phone, folded shut until asked
// for. Open, it was a dozen rows of arrows sitting in the middle of the
// page on every visit. The board (and its fetch) only loads on the first
// open, and stays mounted after that so a half-done reorder survives
// closing the drawer.
export function MobilePowerDrawer({
  leagueId,
  seasonId,
  slug,
  status,
}: {
  leagueId: string
  seasonId: string
  slug: string
  // "Published: week 4", "Not published yet", from the page.
  status: string
}) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  return (
    <div className={`mpd${open ? ' open' : ''}`}>
      <button
        type="button"
        className="mpd-head"
        aria-expanded={open}
        aria-controls="mpd-body"
        onClick={() => {
          setOpen((o) => !o)
          setLoaded(true)
        }}
      >
        <span className="mpd-text">
          <span className="mpd-title">Rank the league yourself</span>
          <span className="mpd-status">{status}</span>
        </span>
        <span className="mpd-chev" aria-hidden>
          <svg viewBox="0 0 12 8" width="12" height="8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 1.5 6 6.5 11 1.5" />
          </svg>
        </span>
      </button>
      <div id="mpd-body" className="mpd-body" hidden={!open}>
        {loaded ? <CommishPower leagueId={leagueId} seasonId={seasonId} slug={slug} variant="mobile" /> : null}
      </div>
    </div>
  )
}
