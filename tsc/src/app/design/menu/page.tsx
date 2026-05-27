import Link from 'next/link'
import type { Metadata } from 'next'
import { InlineHorizontal } from '@/components/menu-previews/InlineHorizontal'
import { PolishedPanel } from '@/components/menu-previews/PolishedPanel'
import { VintageDrawer } from '@/components/menu-previews/VintageDrawer'

export const metadata: Metadata = {
  title: 'Menu preview — internal',
  robots: { index: false, follow: false },
}

export default function MenuPreviewPage() {
  return (
    <main className="lp-main">
      <div className="mp-page">
        <div className="mp-page-head">
          <Link href="/" className="mp-page-back">← Back to landing</Link>
          <div className="mp-page-kicker">Internal · Menu design preview</div>
          <h1 className="mp-page-title">Three <em>directions.</em></h1>
          <p className="mp-page-sub">
            Each card below is a working masthead with one of the menu styles wired in.
            Click around — open, close, hover, esc. Pick the one you like, or mix.
          </p>
        </div>

        <Demo
          letter="A"
          name="Polished panel"
          effort="Low effort"
          recommended
          notes="Same hamburger trigger, but the dropdown becomes a designed panel: wider, gold rules between sections, sub-items always visible (no accordion clicks), smooth slide-down. Same routing as today — nothing else in the codebase changes."
        >
          <PolishedPanel />
        </Demo>

        <Demo
          letter="B"
          name="Vintage drawer"
          effort="Medium effort"
          notes="Hamburger opens a right-side slide drawer with a serif kicker, Roman-numeral section headings, ornament rule, and a sign-out at the foot. Most distinctive to the almanac voice — pulls a heavier UI moment per click."
        >
          <VintageDrawer />
        </Demo>

        <Demo
          letter="C"
          name="Inline horizontal"
          effort="Higher effort"
          notes="No hamburger on desktop. Top-level groups sit inline as text; hover reveals a small flyout. Most 'professional site' shape, but the chrome gets busier on every page and the layout grid needs to give up real estate on the right side."
        >
          <InlineHorizontal />
        </Demo>

        <div className="mp-page-foot">
          Tell me which letter — A, B, C, or a combination — and I&apos;ll wire it through the real site.
        </div>
      </div>
    </main>
  )
}

function Demo({
  letter, name, effort, recommended, notes, children,
}: {
  letter: string
  name: string
  effort: string
  recommended?: boolean
  notes: string
  children: React.ReactNode
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

      {/* Realistic masthead so the menu sits where it would on the real site */}
      <div className="mp-stage">
        <div className="mp-stage-nav">
          <span className="mp-stage-back" aria-hidden="true">—</span>
          <div className="mp-stage-center">
            <div className="mp-stage-kicker">Vol. II · The League Almanac</div>
            <div className="mp-stage-title">The Sunday <em>Chronicle.</em></div>
          </div>
          <div className="mp-stage-slot">{children}</div>
        </div>
      </div>

      <p className="mp-demo-notes">{notes}</p>
    </section>
  )
}
