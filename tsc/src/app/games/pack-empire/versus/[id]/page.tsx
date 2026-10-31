import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getViewMode } from '@/lib/viewMode'
import { peMeta } from '@/lib/packEmpire/meta'
import { getVersus, versusOpponent, type VersusView } from '@/lib/packEmpire/versus'
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
  const copy = view ? versusCopy(view) : null
  return peMeta({
    title: copy?.title ?? 'Versus Challenge · Pack Empire',
    description: copy?.description ?? 'Open eleven packs, keep one player from each, and build a bigger offense than theirs.',
    card: view ? { c: 'vs', id: view.id, s: `${view.status}${+view.host.done}${+view.guest.done}` } : { c: 'versus' },
    alt: 'A Pack Empire challenge',
    robots: { index: false, follow: false },
  })
}

/** What the link says, by where the challenge has got to. */
function versusCopy(v: VersusView): { title: string; description: string } {
  const { host, guest } = v
  const them = v.bot ? 'the CPU' : guest.name
  if (host.score != null && guest.score != null) {
    const a = `${host.score.toLocaleString('en-US')} to ${guest.score.toLocaleString('en-US')}`
    if (host.score === guest.score) return { title: `${host.name} and ${them} tied · Pack Empire`, description: `Dead even at ${host.score.toLocaleString('en-US')}.` }
    const hostWon = host.score > guest.score
    return {
      title: `${hostWon ? host.name : them} beat ${hostWon ? them : host.name} · Pack Empire`,
      description: hostWon ? `Final: ${a}.` : `Final: ${guest.score.toLocaleString('en-US')} to ${host.score.toLocaleString('en-US')}.`,
    }
  }
  const inSide = host.done ? host : guest.done ? guest : null
  if (inSide?.score != null) {
    return {
      title: `${inSide.name} put up ${inSide.score.toLocaleString('en-US')} · Pack Empire`,
      description: 'Your move. Open eleven packs and beat it.',
    }
  }
  return {
    title: `${host.name} challenged ${v.reserved ? guest.name : 'you'} · Pack Empire`,
    description: 'Open eleven packs, keep one player from each, and build a bigger offense than theirs.',
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
