import type { Metadata } from 'next'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { dealGame } from '@/lib/minigames/deal'
import { loadPoolsForViewer, SITE_POOL } from '../pools'
import { RosterRoulette } from './RosterRoulette'
import styles from '../games.module.css'

// The opening wheel is dealt per request (seeded off ?seed= or freshly
// rolled), so this page can never be prerendered.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Roster Roulette · Build a lineup out of other people’s teams',
  description:
    'Spin for a random fantasy team from a real league’s history, take one player off it, and repeat until your lineup is full. Scored on the points per game each player actually averaged — build a lineup good enough to go 17-0.',
  alternates: { canonical: 'https://thesundaychronicle.app/games/roulette/' },
}

export default async function RoulettePage({
  searchParams,
}: {
  searchParams: Promise<{ pool?: string; seed?: string }>
}) {
  const sp = await searchParams
  const { leaguePools } = await loadPoolsForViewer()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const pools = [SITE_POOL, ...leaguePools.map((p) => ({ id: p.id, label: p.label }))]
  // A ?pool= naming a league the viewer has no card for is still dealt — a
  // published almanac is public, and a link shared into a group chat should
  // work for everyone in it. dealGame does the real access check; this only
  // decides which chip lights up.
  const requested = (sp.pool ?? '').toLowerCase()
  const initialPool = requested || SITE_POOL.id

  const dealt = await dealGame(initialPool, sp.seed ?? null, user?.id ?? null)
  // Falling back to the site wheel keeps a bad link playable instead of
  // dead-ending on an error page.
  const fallback = !dealt.ok && initialPool !== SITE_POOL.id
    ? await dealGame(SITE_POOL.id, null, user?.id ?? null)
    : null
  const opening = dealt.ok ? dealt : fallback?.ok ? fallback : null
  const openingError = opening ? null : dealt.ok ? null : dealt.error

  const chips =
    opening && !pools.some((p) => p.id === opening.pool.id)
      ? [...pools, { id: opening.pool.id, label: opening.pool.label }]
      : pools

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
        <div className={styles.head}>
          <div className={styles.kicker}>★ Spin · Take one · Repeat ★</div>
          <h1 className={styles.title}>
            Can you go <em>17-0?</em>
          </h1>
          <p className={styles.lede}>
            The wheel lands on somebody&apos;s real team from a real season. Take one
            player off it, set him in a slot, and keep going until the lineup is
            full. Everyone scores the points per game he actually averaged. Two
            rerolls, no take-backs.
          </p>
        </div>

        <RosterRoulette initialDeal={opening} initialError={openingError} pools={chips} />
      </div>

      <SiteFooter />
    </main>
  )
}
