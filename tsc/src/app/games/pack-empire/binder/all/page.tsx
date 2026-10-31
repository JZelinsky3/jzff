// /games/pack-empire/binder/all
//
// The commissioner's copy: every card in the game face up, whoever has pulled
// it, and the place to put a photo on a man who has none. Site admins only, so
// this is the one page that sends the browser the whole pool, values included.
// Anyone else gets a 404, same as /admin.

import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { loadCompleteBinder } from '@/lib/packEmpire/binder'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../mobile.module.css'
import { PeChrome, PeDock } from '../../chrome'
import { peFonts } from '../../fonts'
import { CompleteBinder } from './CompleteBinder'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'Complete Binder · Pack Empire', robots: { index: false, follow: false } }

export default async function CompleteBinderPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=%2Fgames%2Fpack-empire%2Fbinder%2Fall%2F')
  if (!(await isSiteAdmin(user.id))) notFound()

  const mobile = (await getViewMode()) === 'mobile'
  const view = await loadCompleteBinder()

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()}>
      <PeChrome
        active="binder"
        mobile={mobile}
        signedIn
        back="/games/pack-empire/binder/"
        backLabel="The Binder"
        kicker="Pack Empire"
        title="Complete"
        titleEm="Binder"
      />

      <div className="pe-wrap">
        {!mobile && (
          <div className="pe-table-head">
            <div className="pe-kicker">★ Every card in the game ★</div>
            <h1 className="pe-table-title">
              The complete <span className="pe-em">binder.</span>
            </h1>
          </div>
        )}
        {mobile && <div style={{ height: '0.9rem' }} />}
        <CompleteBinder view={view} />
      </div>

      {mobile ? <PeDock signedIn /> : <SiteFooter />}
    </main>
  )
}
