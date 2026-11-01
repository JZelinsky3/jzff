// /games/pack-empire/locker
//
// A collection of your own and the games that play it. See lib/packEmpire/locker.

import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { lockerOpenTo } from '@/lib/packEmpire/locker/access'
import { lockerHome } from '@/lib/packEmpire/locker/store'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../mobile.module.css'
import { PeChrome, PeDock } from '../chrome'
import { peFonts } from '../fonts'
import { LockerHub } from './LockerHub'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'The Locker · Pack Empire', robots: { index: false, follow: false } }

export default async function LockerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await lockerOpenTo(user?.id))) notFound()

  const mobile = (await getViewMode()) === 'mobile'
  const home = user ? await lockerHome(user.id) : null

  return (
    <main className={`pe-theme ${peFonts}${mobile ? ` ${mobileStyles.root}` : ''}`}>
      <PeChrome mobile={mobile} signedIn={!!user} back="/games/pack-empire/" backLabel="Pack Empire" kicker="Pack Empire" title="The" titleEm="Locker" active="locker" />
      <div className="pe-wrap pe-lk">
        {!mobile && (
          <header className="pe-lk-head">
            <div className="pe-kicker">★ Cards you keep, games to play them in ★</div>
            <h1 className="pe-brd-title">
              The <span className="pe-em">Locker.</span>
            </h1>
          </header>
        )}
        {home ? (
          <LockerHub home={home} />
        ) : (
          <div className="pe-lk-signin">
            <p>Your Locker is tied to your account. Sign in for a Starter Pack and a pack every day.</p>
            <Link href="/login?next=%2Fgames%2Fpack-empire%2Flocker%2F" className="pe-btn">
              Sign In
            </Link>
          </div>
        )}
      </div>
      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
