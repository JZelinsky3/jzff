// /games/pack-empire/locker/trophies

import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { lockerOpenTo } from '@/lib/packEmpire/locker/access'
import { trophyRoom } from '@/lib/packEmpire/locker/store'
import { TROPHY_CASES } from '@/lib/packEmpire/locker/trophies'
import { playerById } from '@/lib/packEmpire/pool'
import type { Player } from '@/lib/packEmpire/rules'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../mobile.module.css'
import { peFonts } from '../../fonts'
import { LockerChrome, LockerDock, ROOM_CLASS, ROOM_COLOR } from '../chrome'
import { TrophyRoom } from './TrophyRoom'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: ROOM_COLOR, width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'Trophy Case · The Locker Room', robots: { index: false, follow: false } }

export default async function TrophiesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await lockerOpenTo(user?.id))) notFound()
  if (!user) redirect('/login?next=%2Fgames%2Fpack-empire%2Flocker%2Ftrophies%2F')

  const mobile = (await getViewMode()) === 'mobile'
  const room = await trophyRoom(user.id)
  const cards = Object.fromEntries(TROPHY_CASES.flatMap((c): [string, Player][] => {
    const card = playerById(c.card)
    return card ? [[c.id, card]] : []
  }))

  return (
    <main className={`${ROOM_CLASS} ${peFonts}${mobile ? ` ${mobileStyles.root}` : ''}`}>
      <LockerChrome mobile={mobile} userId={user.id} back="/games/pack-empire/locker/" backLabel="The Locker Room" kicker="The Locker Room" title="Trophy" titleEm="Case" tab="trophies" />
      <div className="pe-wrap pe-lk">
        {!mobile && (
          <header className="pe-lk-head">
            <div className="pe-kicker">The seasons that are not in any pack</div>
            <h1 className="pe-brd-title">
              The Trophy <span className="pe-em">Case.</span>
            </h1>
          </header>
        )}
        <TrophyRoom stats={room.stats} claimed={room.claimed} cards={cards} />
      </div>
      {mobile ? <LockerDock /> : <SiteFooter />}
    </main>
  )
}
