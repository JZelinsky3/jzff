import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getViewMode } from '@/lib/viewMode'
import { getVersus, versusOpponent } from '@/lib/packEmpire/versus'
import { areFriends } from '@/lib/friends'
import { nameForUser } from '@/lib/packEmpire/people'
import mobileStyles from '../../../mobile.module.css'
import { PeChrome } from '../../chrome'
import { peFonts } from '../../fonts'
import { VersusRoom } from '../VersusRoom'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const view = await getVersus(id.toUpperCase(), null, null)
  const title = view ? `${view.host.name} challenged you · Pack Empire` : 'Versus Challenge · Pack Empire'
  return {
    title,
    description: 'Open eleven packs, keep one player from each, and build a bigger offense than theirs.',
    robots: { index: false, follow: false },
  }
}

export default async function VersusChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const view = await getVersus(id.toUpperCase(), user?.id ?? null, null)
  if (!view) notFound()

  const mobile = (await getViewMode()) === 'mobile'
  const yourName = user ? await nameForUser(createAdminClient(), user.id) : null
  // Offer "add as a friend" off the result only when there's an account on
  // the other side and the two of you aren't friends already.
  const opponent = user && view.you ? await versusOpponent(view.id, user.id) : null
  const canFriend = !!opponent && !(await areFriends(user!.id, opponent))

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.boardRoot : ''}`.trim()}>
      <PeChrome
        active="versus"
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/versus/"
        backLabel="Versus Challenge"
        kicker="Pack Empire"
        title="Versus"
        titleEm="Challenge"
      />
      <div className="pe-wrap">
        <VersusRoom initial={view} signedIn={!!user} yourName={yourName} canFriend={canFriend} />
      </div>
      {!mobile && <SiteFooter />}
    </main>
  )
}
