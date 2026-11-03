// /games/pack-empire/locker
//
// A collection of your own and the games that play it. See lib/packEmpire/locker.

import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { lockerOpenTo } from '@/lib/packEmpire/locker/access'
import { lockerHome, trophyRoom } from '@/lib/packEmpire/locker/store'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../mobile.module.css'
import { peFonts } from '../fonts'
import { LockerChrome, LockerDock, ROOM_CLASS, ROOM_COLOR } from './chrome'
import { LockerHub } from './LockerHub'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: ROOM_COLOR, width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'The Locker Room · Pack Empire', robots: { index: false, follow: false } }

export default async function LockerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await lockerOpenTo(user?.id))) notFound()

  const mobile = (await getViewMode()) === 'mobile'
  const [home, room] = user ? await Promise.all([lockerHome(user.id), trophyRoom(user.id)]) : [null, null]

  return (
    <main className={`${ROOM_CLASS} ${peFonts}${mobile ? ` ${mobileStyles.root}` : ''}`}>
      <LockerChrome mobile={mobile} userId={user?.id} back="/games/pack-empire/" backLabel="Pack Empire" kicker="Pack Empire" title="Locker" titleEm="Room" tab="home" />
      <div className="pe-wrap pe-lk">
        {!mobile && (
          <header className="pe-lk-head">
            <div className="pe-kicker">Cards you keep, games to play them in</div>
            <h1 className="pe-brd-title">
              The Locker <span className="pe-em">Room.</span>
            </h1>
          </header>
        )}
        {home && room ? (
          <LockerHub home={home} trophies={{ waiting: room.waiting, claimed: room.claimed.length }} />
        ) : (
          <div className="pe-lk-signin">
            <p>The Locker Room is tied to your account. Sign in for a Starter Pack and a pack every day.</p>
            <Link href="/login?next=%2Fgames%2Fpack-empire%2Flocker%2F" className="pe-btn">
              Sign In
            </Link>
          </div>
        )}
      </div>
      {mobile ? <LockerDock /> : <SiteFooter />}
    </main>
  )
}
