// /games/pack-empire/binder
//
// Every card you've pulled (the one you kept from each pack), a man to a row,
// his best card first. Each version carries its own count, so you can see
// that you've pulled Jerry Rice's 1995 four times and his 2002 never, and how
// often the whole site has.
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
import mobileStyles from '../../mobile.module.css'
import { PeChrome, PeDock } from '../chrome'
import { peFonts } from '../fonts'
import { Binder } from './Binder'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = {
  title: 'The Binder · Pack Empire',
  description: 'Every card you have pulled in Pack Empire, every version of every player, best to worst.',
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
        active="binder"
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
              The card you keep from every pack goes in here, {POOL_SIZE} cards to find. Each player gets a
              row, his best card first, with how many times you&apos;ve pulled each one and the odds of finding
              it in a pack.
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

      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
