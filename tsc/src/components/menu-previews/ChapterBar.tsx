'use client'

import { useState } from 'react'

// Option D — Chapter section bar. Thin sub-nav under the masthead listing
// every chapter at a glance. The active chapter gets a gold underline.
// Pattern modeled after publication section bars (NYT, FT).

const CHAPTERS = [
  'Standings',
  'Seasons',
  'Drafts',
  'Records',
  'Managers',
  'Rivalries',
  "Pick'ems",
  'Power',
] as const

export function ChapterBar() {
  // Local hover-active just to make the demo feel alive — production
  // would use the current pathname to mark the active chapter.
  const [active, setActive] = useState<string>('Standings')
  return (
    <nav className="mp-chapbar" aria-label="Chapters">
      <div className="mp-chapbar-track">
        {CHAPTERS.map((c) => (
          <button
            key={c}
            type="button"
            className={`mp-chapbar-link${active === c ? ' is-active' : ''}`}
            onClick={() => setActive(c)}
          >
            {c}
          </button>
        ))}
      </div>
    </nav>
  )
}
