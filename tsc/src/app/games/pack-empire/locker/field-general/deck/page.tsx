// /games/pack-empire/locker/field-general/deck

import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'
import { lockerOpenTo } from '@/lib/packEmpire/locker/access'
import { lockerGame } from '@/lib/packEmpire/locker/rules'
import { DEFAULT_CALLS } from '@/lib/packEmpire/locker/calls'
import { deckFor, deckShelf, ownedCards, type DeckDraft } from '@/lib/packEmpire/locker/store'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../../mobile.module.css'
import { peFonts } from '../../../fonts'
import { LockerChrome, ROOM_CLASS, ROOM_COLOR } from '../../chrome'
import { DeckBuilder } from './DeckBuilder'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: ROOM_COLOR, width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'Your Deck · Field General', robots: { index: false, follow: false } }

const GAME = 'field-general'

export default async function DeckPage({ searchParams }: { searchParams: Promise<{ deck?: string }> }) {
  const { deck: wanted } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await lockerOpenTo(user?.id))) notFound()
  if (!user) redirect('/login?next=%2Fgames%2Fpack-empire%2Flocker%2Ffield-general%2Fdeck%2F')

  const def = lockerGame(GAME)
  if (!def) notFound()
  const mobile = (await getViewMode()) === 'mobile'
  const [owned, shelf] = await Promise.all([ownedCards(user.id), deckShelf(user.id, GAME)])
  const saved = shelf.decks.find((d) => d.id === (wanted ?? shelf.active))
  const draft: DeckDraft = saved ?? { id: null, name: '', cards: wanted === 'new' ? [] : (await deckFor(user.id, GAME, owned)).map((c) => c.id), calls: DEFAULT_CALLS }

  return (
    <main className={`${ROOM_CLASS} ${peFonts}${mobile ? ` ${mobileStyles.root}` : ''}`}>
      <LockerChrome mobile={mobile} signedIn back="/games/pack-empire/locker/field-general/" backLabel="Field General" kicker="Field General" title={saved ? 'Edit' : 'New'} titleEm="Deck" tab="field-general" />
      <div className="pe-wrap pe-lk">
        <DeckBuilder key={draft.id ?? 'new'} owned={owned} draft={draft} rule={def.deck} game={GAME} home={def.href} />
      </div>
    </main>
  )
}
