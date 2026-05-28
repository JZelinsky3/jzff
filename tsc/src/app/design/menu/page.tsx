import Link from 'next/link'
import type { Metadata } from 'next'
import { ChapterBar } from '@/components/menu-previews/ChapterBar'
import { IndexPalette } from '@/components/menu-previews/IndexPalette'
import { MegaMenu } from '@/components/menu-previews/MegaMenu'

export const metadata: Metadata = {
  title: 'Menu preview · v2 — internal',
  robots: { index: false, follow: false },
}

export default function MenuPreviewPage() {
  return (
    <main className="lp-main">
      <div className="mp-page">
        <div className="mp-page-head">
          <Link href="/" className="mp-page-back">← Back to landing</Link>
          <div className="mp-page-kicker">Internal · Menu design preview · v2</div>
          <h1 className="mp-page-title">
            Three fresh <em>directions.</em>
          </h1>
          <p className="mp-page-sub">
            The earlier round (A polished dropdown, B vintage drawer, C inline horizontal)
            are already in use. These three are different patterns — built for sites with
            many destinations, leaning into &ldquo;designed publication&rdquo; rather than
            &ldquo;hamburger menu.&rdquo; Each is fully working below.
          </p>
        </div>

        <Demo
          letter="D"
          name="Chapter section bar"
          effort="Low–medium effort"
          recommended
          notes="A thin sub-row of chapters under the masthead. Newspaper section-bar shape — every destination is visible without a click. Active chapter is underlined in gold. Most 'publication chrome' of the three. Drawback: adds a second row of chrome on every page; overflows horizontally on phones."
          belowMasthead={<ChapterBar />}
        />

        <Demo
          letter="E"
          name="Index palette (⌘K)"
          effort="Medium effort"
          notes="Small 'Index' trigger in the masthead, plus ⌘K from anywhere opens a centered overlay with a search field and grouped destinations. Type to filter, arrow keys to navigate, Enter to go, esc to close. The pattern Linear, Notion, Vercel, GitHub all use. Drawback: keyboard-first feel; some readers won't discover ⌘K."
          menuSlot={<IndexPalette />}
        />

        <Demo
          letter="F"
          name="Mega menu overlay"
          effort="Medium effort"
          notes="A 'Menu' trigger in the masthead opens a centered overlay with a serif title and three columns of grouped destinations (Library / Chapters / Account). Feels like opening the chronicle's index page. Most deliberate and magazine-like. Drawback: heaviest visual moment per open."
          menuSlot={<MegaMenu />}
        />

        <div className="mp-page-foot">
          Tell me which letter — D, E, F, or a combination — and I&apos;ll wire it through.
        </div>
      </div>
    </main>
  )
}

function Demo({
  letter, name, effort, recommended, notes,
  menuSlot, belowMasthead,
}: {
  letter: string
  name: string
  effort: string
  recommended?: boolean
  notes: string
  menuSlot?: React.ReactNode
  belowMasthead?: React.ReactNode
}) {
  return (
    <section className="mp-demo">
      <div className="mp-demo-meta">
        <div className="mp-demo-letter">{letter}</div>
        <div>
          <div className="mp-demo-name">
            {name}
            {recommended && <span className="mp-demo-rec">Recommended</span>}
          </div>
          <div className="mp-demo-effort">{effort}</div>
        </div>
      </div>

      <div className="mp-stage">
        <div className="mp-stage-nav">
          <span className="mp-stage-back" aria-hidden="true">—</span>
          <div className="mp-stage-center">
            <div className="mp-stage-kicker">Vol. II · The League Almanac</div>
            <div className="mp-stage-title">The Sunday <em>Chronicle.</em></div>
          </div>
          <div className="mp-stage-slot">{menuSlot}</div>
        </div>
        {belowMasthead}
      </div>

      <p className="mp-demo-notes">{notes}</p>
    </section>
  )
}
