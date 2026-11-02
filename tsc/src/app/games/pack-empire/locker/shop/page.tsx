// /games/pack-empire/locker/shop

import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { lockerOpenTo } from '@/lib/packEmpire/locker/access'
import { ownedCards, sparesOf, walletOf } from '@/lib/packEmpire/locker/store'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../mobile.module.css'
import { peFonts } from '../../fonts'
import { LockerChrome, LockerDock, ROOM_CLASS, ROOM_COLOR } from '../chrome'
import { Shop } from './Shop'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: ROOM_COLOR, width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'The Shop · The Locker', robots: { index: false, follow: false } }

export default async function ShopPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await lockerOpenTo(user?.id))) notFound()
  if (!user) redirect('/login?next=%2Fgames%2Fpack-empire%2Flocker%2Fshop%2F')

  const mobile = (await getViewMode()) === 'mobile'
  const [faab, cards] = await Promise.all([walletOf(user.id), ownedCards(user.id)])

  return (
    <main className={`${ROOM_CLASS} ${peFonts}${mobile ? ` ${mobileStyles.root}` : ''}`}>
      <LockerChrome mobile={mobile} signedIn back="/games/pack-empire/locker/" backLabel="The Locker" kicker="The Locker" title="The" titleEm="Shop" tab="shop" />
      <div className="pe-wrap pe-lk">
        {!mobile && (
          <header className="pe-lk-head">
            <div className="pe-kicker">★ Spend it on packs ★</div>
            <h1 className="pe-brd-title">
              The <span className="pe-em">Shop.</span>
            </h1>
          </header>
        )}
        <Shop faab={faab} spares={sparesOf(cards)} />
      </div>
      {mobile ? <LockerDock /> : <SiteFooter />}
    </main>
  )
}
