// /games/pack-empire/locker/collection

import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { dayKey } from '@/lib/packEmpire/daily'
import { lockerOpenTo } from '@/lib/packEmpire/locker/access'
import { lockerEventForDay } from '@/lib/packEmpire/locker/rules'
import { ownedCards } from '@/lib/packEmpire/locker/store'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../mobile.module.css'
import { PeChrome, PeDock } from '../../chrome'
import { peFonts } from '../../fonts'
import { Collection } from './Collection'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'Collection · The Locker', robots: { index: false, follow: false } }

export default async function CollectionPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await lockerOpenTo(user?.id))) notFound()
  if (!user) redirect('/login?next=%2Fgames%2Fpack-empire%2Flocker%2Fcollection%2F')

  const mobile = (await getViewMode()) === 'mobile'
  const cards = await ownedCards(user.id)

  return (
    <main className={`pe-theme ${peFonts}${mobile ? ` ${mobileStyles.root}` : ''}`}>
      <PeChrome mobile={mobile} signedIn back="/games/pack-empire/locker/" backLabel="The Locker" kicker="The Locker" title="Your" titleEm="Collection" active="locker" />
      <div className="pe-wrap pe-lk">
        {!mobile && (
          <header className="pe-lk-head">
            <div className="pe-kicker">★ The Locker ★</div>
            <h1 className="pe-brd-title">
              Your <span className="pe-em">Collection.</span>
            </h1>
          </header>
        )}
        <Collection cards={cards} event={lockerEventForDay(dayKey())} />
      </div>
      {mobile ? <PeDock signedIn /> : <SiteFooter />}
    </main>
  )
}
