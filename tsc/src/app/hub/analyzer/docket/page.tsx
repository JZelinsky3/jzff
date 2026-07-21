import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { Reveal } from '../../bits'
import { MobileTradeCard } from '../../mobile/trade-card'
import { AdminRegrade } from '../analyzer-client'
import { fetchDocket, TradeCase } from '../board'

export const metadata = { title: 'The Clubhouse · The Full Docket' }

export default async function FullDocketPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedIn = !!user
  const isAdmin = await isSiteAdmin(user?.id)

  const docket = await fetchDocket(100, user?.id ?? null)

  // Pocket Clubhouse: same cases, recut around the mobile chrome.
  if ((await getViewMode()) === 'mobile') {
    return (
      <main className="mhb">
        <section className="mhb-hero">
          <div className="mhb-hero-sup">★ Wing V · The Trade Room ★</div>
          <h1 className="mhb-hero-title">
            The full <em>docket.</em>
          </h1>
          <p className="mhb-hero-sub">
            Every trade the room has posted, hottest first. Sign the ones you&apos;d do,
            shred the ones you wouldn&apos;t.
          </p>
          <div className="mhb-hero-meta">
            <span>{docket.trades.length} posted</span>
            <Link href="/hub/analyzer">Back to the Trade Room</Link>
          </div>
        </section>

        <section className="mhb-sec">
          {isAdmin && <AdminRegrade />}
          {docket.trades.length === 0 ? (
            <p className="mhb-fine" style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '.92rem', textAlign: 'center' }}>
              Nothing here yet. The docket fills as members post analyses from the desk.
            </p>
          ) : (
            <div className="mhb-feed">
              {docket.hottest.map((t, i) => (
                <Reveal key={t.id} delay={(i % 2) * 80}>
                  <MobileTradeCard t={t} docket={docket} signedIn={signedIn} isAdmin={isAdmin} />
                </Reveal>
              ))}
            </div>
          )}
          <p className="mhb-fine">
            Values are blended market consensus, frozen at post time. Quick analyses grade
            raw asset value; team trades grade the change in each side&apos;s optimal starting
            lineup. Five posts per member per day keeps the docket honest.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main>
      <section className="hub-hero" style={{ paddingBottom: '1.5rem' }}>
        <div className="hub-hero-sup">★ Wing V · The Trade Room ★</div>
        <h1 className="hub-hero-title" style={{ fontSize: 'clamp(2.4rem, 5.5vw, 4.4rem)' }}>
          The full <em>docket.</em>
        </h1>
        <p className="hub-hero-sub">
          Every trade the room has posted, hottest first. Sign the ones you&apos;d do,
          shred the ones you wouldn&apos;t.
        </p>
        <div className="hub-hero-meta">
          <Link href="/hub/analyzer" className="hub-back-link">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to the Trade Room
          </Link>
          <span>·</span>
          <span>{docket.trades.length} posted</span>
        </div>
      </section>

      <div className="hub-section">
        {isAdmin && <AdminRegrade />}
        {docket.trades.length === 0 ? (
          <Reveal>
            <p
              style={{
                textAlign: 'center', maxWidth: '540px', margin: '0 auto',
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: '1.05rem', lineHeight: 1.6, color: 'var(--hb-mute)',
              }}
            >
              Nothing here yet. The docket fills as members post analyses from the desk.
            </p>
          </Reveal>
        ) : (
          <div className="hub-tr-board">
            {docket.hottest.map((t, i) => (
              <Reveal key={t.id} delay={(i % 2) * 80}>
                <TradeCase t={t} docket={docket} signedIn={signedIn} isAdmin={isAdmin} />
              </Reveal>
            ))}
          </div>
        )}
        <p
          style={{
            maxWidth: '720px', margin: '1.6rem auto 0', textAlign: 'center',
            fontSize: '.8rem', lineHeight: 1.6, color: 'var(--hb-mute)',
          }}
        >
          Values are blended market consensus (FantasyCalc · KeepTradeCut · DynastyProcess ·
          FantasyPros · Sleeper), frozen at post time. Quick analyses grade raw asset value;
          team trades grade the change in each side&apos;s optimal starting lineup. Five posts
          per member per day keeps the docket honest.
        </p>
      </div>
    </main>
  )
}
