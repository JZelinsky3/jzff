import type { Metadata } from 'next'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { dealGame } from '@/lib/minigames/deal'
import { GAMES } from '@/lib/minigames/record'
import { SITE_POOL } from '../pools'
import { RosterRoulette } from './RosterRoulette'
import styles from '../games.module.css'

// The opening wheel is dealt per request (seeded off ?seed= or freshly
// rolled), so this page can never be prerendered.
export const dynamic = 'force-dynamic'

const NEUTRAL_TITLE = 'Roster Roulette · Can you go 17-0?'
// Sits directly under the card in a chat, where it competes with whatever
// the sender typed. One clause, no rules, no repeat of the title.
const NEUTRAL_DESC = 'One player off each of seven real teams. No account needed.'

// A shared wheel is opened by people who have never heard of the site, so
// the default preview sells the game and names nobody. When the share button
// hands over a finished run (?w=&ppg=), the card becomes a scoreboard and
// the link reads as a challenge instead.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{
    pool?: string
    seed?: string
    w?: string
    ppg?: string
    l?: string
  }>
}): Promise<Metadata> {
  const sp = await searchParams
  const wins = Number(sp.w)
  const ppg = Number(sp.ppg)
  const hasResult = Number.isFinite(wins) && wins >= 0 && wins <= GAMES

  const og = new URLSearchParams({ v: '2' })
  if (hasResult) {
    og.set('w', String(Math.round(wins)))
    if (Number.isFinite(ppg) && ppg > 0) og.set('ppg', String(Math.round(ppg * 10) / 10))
    if (sp.l) og.set('l', sp.l.slice(0, 400))
  }
  const image = `/api/og/games?${og}`

  // The card's TEXT deliberately never repeats the sender's message. Both
  // get read together in a chat, and the record was appearing three times
  // over: once in what the sender typed, once as the preview title, once as
  // its description. The numbers live in the card IMAGE, which shows the
  // record, the PPG and the whole lineup; the words next to it are better
  // spent telling someone who has never seen the game what it is.
  const title = NEUTRAL_TITLE
  const description = NEUTRAL_DESC

  return {
    title,
    description,
    alternates: { canonical: 'https://thesundaychronicle.app/games/roulette/' },
    openGraph: {
      type: 'website',
      url: 'https://thesundaychronicle.app/games/roulette/',
      title,
      description,
      siteName: 'The Sunday Chronicle',
      images: [{ url: image, width: 1200, height: 630, alt: 'Roster Roulette' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default async function RoulettePage({
  searchParams,
}: {
  searchParams: Promise<{ pool?: string; seed?: string; w?: string; ppg?: string; l?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // A ?pool= naming a league the viewer has no card for is still dealt, and
  // no account is needed to deal it: a wheel gets shared into a group chat
  // and has to work for everyone in it. The signed-in user is read only to
  // pick the right nav button.
  const requested = (sp.pool ?? '').toLowerCase()
  const initialPool = requested || SITE_POOL.id

  const dealt = await dealGame(initialPool, sp.seed ?? null)
  // Falling back to the site wheel keeps a bad link playable instead of
  // dead-ending on an error page. But the swap is announced: someone sent a
  // link to a specific league, and quietly handing them a different wheel
  // under a different name is worse than telling them why.
  const fallback = !dealt.ok && initialPool !== SITE_POOL.id
    ? await dealGame(SITE_POOL.id, null)
    : null
  const opening = dealt.ok ? dealt : fallback?.ok ? fallback : null
  const openingError = opening ? null : dealt.ok ? null : dealt.error
  const swapped = !dealt.ok && opening ? dealt.error : null


  return (
    <main>
      <nav className="nav">
        <BackButton fallbackHref="/games/" ariaLabel="Back" />
        <div className="nav-center">
          <div className="nav-kicker">The Games Page</div>
          <div className="nav-title">Roster <em>Roulette</em></div>
        </div>
        <div className="pricing-nav-right">
          <Link href="/games/" className="pricing-nav-link">
            <span className="pricing-nav-link-text">All games</span>
          </Link>
          {user ? (
            <Link href="/dashboard" className="pricing-nav-cta">
              Library <span className="pricing-nav-cta-arrow" aria-hidden>→</span>
            </Link>
          ) : (
            <Link href="/login" className="pricing-nav-cta">
              Login <span className="pricing-nav-cta-arrow" aria-hidden>→</span>
            </Link>
          )}
        </div>
      </nav>

      <div className={styles.wrap}>
        {/* The pool being played is the headline. Switching leagues means
            going back to the Games Page, rather than carrying a rail of
            other people's leagues through every spin. */}
        {/* Tagged so the game can scroll to it: pressing Spin parks the
            collapsed title at the top of the screen with the whole board
            under it. A hashed CSS-module class is no good to query for. */}
        <div className={styles.head} data-rr-head>
          <div className={styles.kicker}>★ Roster Roulette ★</div>
          <h1 className={styles.title}>
            {opening ? opening.pool.label : 'Roster Roulette'}
          </h1>
          <p className={styles.headSub}>
            {opening ? opening.pool.sublabel : 'Build a lineup out of real teams'}
            {' · '}
            <Link href="/games/" className={styles.headSwitch}>
              Change league
            </Link>
          </p>
        </div>

        {swapped && <p className={styles.swap}>{swapped} Playing the site-wide wheel instead.</p>}

        <RosterRoulette initialDeal={opening} initialError={openingError} />
      </div>

      <SiteFooter />
    </main>
  )
}
