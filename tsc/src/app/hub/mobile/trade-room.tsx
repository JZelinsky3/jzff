import Link from 'next/link'
import { Reveal } from '../bits'
import { AnalyzerStudio } from '../analyzer/analyzer-client'
import type { Docket } from '../analyzer/board'
import { MobileTradeCard } from './trade-card'

// Pocket Clubhouse — the Trade Room. The studio is the same client
// component as desktop (it already stacks to one column at phone
// widths); the docket renders the mobile-native slip instead of the
// desktop TradeCase, and the room around them is recut: shorter hero,
// app-style section heads, stacked full-width actions.

export function MobileTradeRoom({ signedIn, docket }: { signedIn: boolean; docket: Docket }) {
  const hottest = docket.hottest.slice(0, 2)

  return (
    <main className="mhb">
      <section className="mhb-hero">
        <div className="mhb-hero-sup">★ Wing V · The smoke-filled room ★</div>
        <h1 className="mhb-hero-title">
          The Trade <em>Room.</em>
        </h1>
        <p className="mhb-hero-sub">
          The Trade Analyzer with no league required. Name the players, pick the format,
          get a verdict. Post the good arguments and let the room vote.
        </p>
        <div className="mhb-hero-meta">
          <span>{docket.trades.length} on the docket</span>
          <span>Values refresh daily</span>
          {!signedIn && <Link href="/login?from=%2Fhub%2Fanalyzer">Sign in to analyze</Link>}
        </div>
      </section>

      {/* ── §01 The analyzer ── */}
      <section className="mhb-sec">
        <div className="mhb-sec-head">
          <div>
            <span className="mhb-sec-num">§ 01 · The analyzer</span>
            <span className="mhb-sec-title">Weigh a deal</span>
          </div>
        </div>
        {signedIn ? (
          <Reveal>
            <AnalyzerStudio />
          </Reveal>
        ) : (
          <Reveal>
            <div className="hub-promote">
              <div>
                <div className="hub-promote-title">Members <em>only.</em></div>
                <p className="hub-promote-body">
                  The analyzer is free to use; it just needs a name on the ledger. Sign in,
                  type two sides of a deal, and the consensus value engine does the arguing.
                </p>
              </div>
              <div className="hub-promote-side">
                <Link href="/login?from=%2Fhub%2Fanalyzer" className="hub-btn">Sign in to analyze</Link>
                <Link href="/login?mode=signup&from=%2Fhub%2Fanalyzer" className="hub-btn-ghost">Join the Chronicle</Link>
              </div>
            </div>
          </Reveal>
        )}
        <p className="mhb-fine">
          Grades here are league-blind by design. Inside your almanac, the{' '}
          <Link href="/dashboard">Trade Desk</Link> grades the same deal against your real
          rosters and league settings.
        </p>
      </section>

      {/* ── §02 The docket ── */}
      <section className="mhb-sec">
        <div className="mhb-sec-head">
          <div>
            <span className="mhb-sec-num">§ 02 · The docket</span>
            <span className="mhb-sec-title">Hottest arguments</span>
          </div>
          <span className="mhb-sec-side">{signedIn ? 'Sign it or shred it' : 'Sign in to vote'}</span>
        </div>
        {hottest.length === 0 ? (
          <Reveal>
            <p className="mhb-fine" style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '.92rem', textAlign: 'center' }}>
              The docket is empty. Analyze a deal above and be the first to put one up
              for argument.
            </p>
          </Reveal>
        ) : (
          <>
            <div className="mhb-feed">
              {hottest.map((t, i) => (
                <Reveal key={t.id} delay={i * 90}>
                  <MobileTradeCard t={t} docket={docket} signedIn={signedIn} />
                </Reveal>
              ))}
            </div>
            {docket.trades.length > hottest.length && (
              <div className="mhb-btnrow">
                <Link href="/hub/analyzer/docket" className="hub-btn-ghost">
                  Open the full docket ({docket.trades.length})
                </Link>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
