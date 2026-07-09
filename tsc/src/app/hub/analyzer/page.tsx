import Link from 'next/link'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPlayersMap } from '@/lib/sleeperPlayers'
import { getViewMode } from '@/lib/viewMode'
import { Reveal } from '../bits'
import { MobileTradeRoom } from '../mobile/trade-room'
import { AnalyzerStudio } from './analyzer-client'
import { fetchDocket, TradeCase } from './board'

export const metadata = { title: 'The Clubhouse · The Trade Room' }

export default async function TradeRoomPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedIn = !!user

  // Warm the lean player dictionary as soon as anyone opens the room —
  // it backs the search endpoint, and its cold build (a ~5MB Sleeper
  // pull) is what made the FIRST search feel slow. after() runs it once
  // the page response is sent, so the page itself doesn't wait.
  after(async () => {
    try {
      await getPlayersMap()
    } catch {
      /* warm-up only — the search endpoint will retry on demand */
    }
  })

  const docket = await fetchDocket(50, user?.id ?? null)

  if ((await getViewMode()) === 'mobile') {
    return <MobileTradeRoom signedIn={signedIn} docket={docket} />
  }

  const hottest = docket.hottest.slice(0, 2)

  return (
    <main>
      <section className="hub-hero">
        <div className="hub-hero-sup">★ Wing V · The smoke-filled room ★</div>
        <h1 className="hub-hero-title">
          The <em>Trade Room.</em>
        </h1>
        <p className="hub-hero-sub">
          The league Trade Analyzer, unchained. No league required. Name the players, pick
          the format, and the same consensus value engine weighs the deal. Post the good
          arguments to the docket and let the room sign or shred them.
        </p>
        <div className="hub-hero-meta">
          <span>{docket.trades.length} on the docket</span>
          <span>·</span>
          <span>Values refresh daily</span>
          {!signedIn && (
            <>
              <span>·</span>
              <Link href="/login?from=%2Fhub%2Fanalyzer" style={{ color: 'var(--hb-gold)', textDecoration: 'none' }}>
                Sign in to analyze →
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ─── §01 The analyzer ─────────────────────────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">§ 01 · The analyzer</span>
          <span className="hub-section-title">Weigh a deal —</span>
          <span className="hub-section-meta">Quick by names · deeper with rosters</span>
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
                  type two sides of a deal, and the consensus value engine (FantasyCalc,
                  KTC, DynastyProcess, FantasyPros, blended) does the arguing.
                </p>
              </div>
              <div className="hub-promote-side">
                <Link href="/login?from=%2Fhub%2Fanalyzer" className="hub-btn">Sign in to analyze →</Link>
                <Link href="/login?mode=signup&from=%2Fhub%2Fanalyzer" className="hub-btn-ghost">Join the Chronicle</Link>
              </div>
            </div>
          </Reveal>
        )}
        <p className="hub-tr-upsell">
          Grades here are league-blind by design. Inside your almanac, the{' '}
          <Link href="/dashboard">Trade Desk</Link> grades the same deal against your real
          rosters, needs, and league settings: personal, not generic.
        </p>
      </div>

      {/* ─── §02 Hot off the docket ───────────────────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">§ 02 · The docket</span>
          <span className="hub-section-title">Hottest arguments —</span>
          <span className="hub-section-meta">{signedIn ? 'Sign it or shred it' : 'Sign in to vote'}</span>
        </div>
        {hottest.length === 0 ? (
          <Reveal>
            <p
              style={{
                textAlign: 'center', maxWidth: '540px', margin: '0 auto',
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: '1.05rem', lineHeight: 1.6, color: 'var(--hb-mute)',
              }}
            >
              The docket is empty. No trades posted yet. Analyze one above and be the
              first to put a deal up for argument.
            </p>
          </Reveal>
        ) : (
          <>
            <div className="hub-tr-board">
              {hottest.map((t, i) => (
                <Reveal key={t.id} delay={i * 90}>
                  <TradeCase t={t} docket={docket} signedIn={signedIn} />
                </Reveal>
              ))}
            </div>
            {docket.trades.length > hottest.length && (
              <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                <Link href="/hub/analyzer/docket" className="hub-btn-ghost">
                  Open the full docket ({docket.trades.length}) →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
