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
import { peFonts } from '../../fonts'
import { LockerChrome, LockerDock, ROOM_CLASS, ROOM_COLOR } from '../chrome'
import { Collection } from './Collection'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: ROOM_COLOR, width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'Collection · The Locker Room', robots: { index: false, follow: false } }

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
    <main className={`${ROOM_CLASS} ${peFonts}${mobile ? ` ${mobileStyles.root}` : ''}`}>
      <LockerChrome mobile={mobile} signedIn back="/games/pack-empire/locker/" backLabel="The Locker Room" kicker="The Locker Room" title="Your" titleEm="Collection" tab="collection" />
      <div className="pe-wrap pe-lk">
        {!mobile && (
          <header className="pe-lk-head">
            <div className="pe-kicker">★ The Locker Room ★</div>
            <h1 className="pe-brd-title">
              Your <span className="pe-em">Collection.</span>
            </h1>
          </header>
        )}
        <Collection cards={cards} event={lockerEventForDay(dayKey())} />
      </div>
      {mobile ? <LockerDock /> : <SiteFooter />}
    </main>
  )
}
