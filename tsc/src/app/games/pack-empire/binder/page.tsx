// /games/pack-empire/binder
//
// Every card you've pulled, a man to a row, his seasons best first. Each
// version carries its own count, so you can see that you've pulled Jerry
// Rice's 2003 four times and his 1995 never.
//
// Signed in only: the binder is filed by the server as it deals (see
// lib/packEmpire/binder.ts). Runs played signed out still get here, the
// moment they're claimed.

import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { loadBinder } from '@/lib/packEmpire/binder'
import { POOL_SIZE } from '@/lib/packEmpire/pool'
import { MobileGamesDock } from '../../MobileGamesDock'
import mobileStyles from '../../mobile.module.css'
import { PeChrome } from '../chrome'
import { peFonts } from '../fonts'
import { Binder } from './Binder'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = {
  title: 'The Binder · Pack Empire',
  description: 'Every card you have pulled in Pack Empire, every season of every player, best to worst.',
  robots: { index: false, follow: true },
}

export default async function BinderPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const mobile = (await getViewMode()) === 'mobile'
  const view = user ? await loadBinder(user.id) : null

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()}>
      <PeChrome
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/"
        backLabel="Pack Empire"
        kicker="Pack Empire"
        title="The"
        titleEm="Binder"
      />

      <div className="pe-wrap">
        {!mobile && (
          <div className="pe-table-head">
            <div className="pe-kicker">★ Every card you&apos;ve pulled ★</div>
            <h1 className="pe-table-title">
              The <span className="pe-em">binder.</span>
            </h1>
          </div>
        )}
        {mobile && <div style={{ height: '0.9rem' }} />}

        {view ? (
          <Binder view={view} mobile={mobile} />
        ) : (
          <div className="pe-bd-out">
            <p className="pe-bd-out-lede">
              Every card that comes out of your packs goes in here, {POOL_SIZE} seasons in all. Each player gets a
              row, his best season first, with how many times you&apos;ve pulled each one.
            </p>
            <p className="pe-bd-out-sub">
              Sign in to start yours. Runs you&apos;ve already played on this device come with you.
            </p>
            <div className="pe-bd-out-ctas">
              <Link href="/login?next=%2Fgames%2Fpack-empire%2Fbinder%2F" className="pe-btn">
                Sign in
              </Link>
              <Link href="/games/pack-empire/play/" className="pe-btn pe-btn--ghost">
                Open packs
              </Link>
            </div>
          </div>
        )}
      </div>

      {mobile ? <MobileGamesDock signedIn={!!user} boardHref="/games/pack-empire/board/" /> : <SiteFooter />}
    </main>
  )
}
