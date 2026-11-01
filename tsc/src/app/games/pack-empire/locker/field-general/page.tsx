// /games/pack-empire/locker/field-general

import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { dayKey } from '@/lib/packEmpire/daily'
import { lockerOpenTo } from '@/lib/packEmpire/locker/access'
import { liveMatch } from '@/lib/packEmpire/locker/fieldGeneralMatch'
import { BONUS_WINS, lockerEventForDay, lockerGame } from '@/lib/packEmpire/locker/rules'
import { deckFor, lockerHome } from '@/lib/packEmpire/locker/store'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../mobile.module.css'
import { PeChrome, PeDock } from '../../chrome'
import { peFonts } from '../../fonts'
import { WinMeter } from '../WinMeter'
import { Lobby } from './Lobby'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'Field General · The Locker', robots: { index: false, follow: false } }

const GAME = 'field-general'

export default async function FieldGeneralLobby() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await lockerOpenTo(user?.id))) notFound()
  if (!user) redirect('/login?next=%2Fgames%2Fpack-empire%2Flocker%2Ffield-general%2F')

  const def = lockerGame(GAME)
  if (!def) notFound()
  const mobile = (await getViewMode()) === 'mobile'
  const [deck, live, home] = await Promise.all([deckFor(user.id, GAME), liveMatch(user.id), lockerHome(user.id)])

  return (
    <main className={`pe-theme ${peFonts}${mobile ? ` ${mobileStyles.root}` : ''}`}>
      <PeChrome mobile={mobile} signedIn back="/games/pack-empire/locker/" backLabel="The Locker" kicker="The Locker" title={def.title} titleEm={def.titleEm} active="locker" />
      <div className="pe-wrap pe-lk">
        {!mobile && (
          <header className="pe-lk-head">
            <div className="pe-kicker">★ Twelve cards, three lanes, six drives ★</div>
            <h1 className="pe-brd-title">
              {def.title} <span className="pe-em">{def.titleEm}.</span>
            </h1>
          </header>
        )}
        <WinMeter wins={home.wins} need={BONUS_WINS} bonus={home.bonus} />
        <Lobby deck={deck} event={lockerEventForDay(dayKey())} rule={def.deck} live={live} />
      </div>
      {mobile ? <PeDock signedIn /> : <SiteFooter />}
    </main>
  )
}
