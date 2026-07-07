'use client'

// The full news desk: every wire article with its standfirst, league-tagged
// stories leading. The NFL strip runs the full desk width; the column of
// stories reads centered beneath it.

import { NflStrip } from '../desk/NflStrip'
import { NewsRail } from '../desk/NewsRail'

export function NewsPage() {
  return (
    <div className="space-y-3 pt-3">
      <div className="mx-auto max-w-[1840px] px-4">
        <NflStrip />
      </div>
      <div className="mx-auto max-w-[900px] space-y-3 px-4">
        <h1 className="sl-display text-2xl text-sl-text">The News Desk</h1>
        <NewsRail />
      </div>
    </div>
  )
}
