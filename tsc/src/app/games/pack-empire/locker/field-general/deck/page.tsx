// /games/pack-empire/locker/field-general/deck

import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'
import { lockerOpenTo } from '@/lib/packEmpire/locker/access'
import { lockerGame } from '@/lib/packEmpire/locker/rules'
import { deckFor, ownedCards } from '@/lib/packEmpire/locker/store'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../../mobile.module.css'
import { PeChrome } from '../../../chrome'
import { peFonts } from '../../../fonts'
import { DeckBuilder } from './DeckBuilder'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'Your Deck · Field General', robots: { index: false, follow: false } }

const GAME = 'field-general'

export default async function DeckPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await lockerOpenTo(user?.id))) notFound()
  if (!user) redirect('/login?next=%2Fgames%2Fpack-empire%2Flocker%2Ffield-general%2Fdeck%2F')

  const def = lockerGame(GAME)
  if (!def) notFound()
  const mobile = (await getViewMode()) === 'mobile'
  const owned = await ownedCards(user.id)
  const deck = await deckFor(user.id, GAME, owned)

  return (
    <main className={`pe-theme ${peFonts}${mobile ? ` ${mobileStyles.root}` : ''}`}>
      <PeChrome mobile={mobile} signedIn back="/games/pack-empire/locker/field-general/" backLabel="Field General" kicker="Field General" title="Your" titleEm="Deck" active="locker" />
      <div className="pe-wrap pe-lk">
        <DeckBuilder owned={owned} start={deck.map((c) => c.id)} rule={def.deck} game={GAME} />
      </div>
    </main>
  )
}
