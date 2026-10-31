import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { areFriends } from '@/lib/friends'
import { peMeta } from '@/lib/packEmpire/meta'
import { getMega, megaOpponent } from '@/lib/packEmpire/mega'
import mobileStyles from '../../../mobile.module.css'
import { PeChrome } from '../../chrome'
import { peFonts } from '../../fonts'
import { MegaRoom } from '../MegaRoom'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const view = await getMega(id.toUpperCase(), null, null)
  const [a, b] = view?.seats ?? []
  const done = view?.status === 'done' && a && b
  const firstWon = done && a.score > b.score
  const named = (seat: 0 | 1) => (view?.botSeat === seat ? 'the CPU' : view?.seats[seat].name)
  const title = !view
    ? 'Mega Draft · Pack Empire'
    : done
      ? a.score === b.score
        ? `${named(0)} and ${named(1)} tied · Pack Empire`
        : `${named(firstWon ? 0 : 1)} beat ${named(firstWon ? 1 : 0)} · Pack Empire`
      : view.status === 'live'
        ? `${named(0)} vs ${named(1)} · Pack Empire`
        : `${view.hostName}'s Mega Draft · Pack Empire`
  return peMeta({
    title,
    description: done
      ? `Final: ${Math.max(a.score, b.score).toLocaleString('en-US')} to ${Math.min(a.score, b.score).toLocaleString('en-US')}.`
      : 'A live snake draft off one shared board of thirty-six. Sit down and pick.',
    card: view ? { c: 'mg', id: view.id, s: view.status === 'live' ? `live${view.pickNo}` : view.status } : { c: 'mega' },
    alt: 'A Pack Empire Mega Draft',
    robots: { index: false, follow: false },
  })
}

export default async function MegaDraftRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const view = await getMega(id.toUpperCase(), user?.id ?? null, null)
  if (!view) notFound()
  const mobile = (await getViewMode()) === 'mobile'
  const opponent = user && view.status === 'done' ? await megaOpponent(view.id, user.id) : null
  const canFriend = !!opponent && !(await areFriends(user!.id, opponent))

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.boardRoot : ''}`.trim()}>
      <PeChrome
        active="mega"
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/mega-draft/"
        backLabel="Mega Draft"
        kicker="Pack Empire"
        title="Mega"
        titleEm="Draft"
      />
      <div className="pe-wrap">
        <MegaRoom initial={view} signedIn={!!user} canFriend={canFriend} />
      </div>
      {!mobile && <SiteFooter />}
    </main>
  )
}
