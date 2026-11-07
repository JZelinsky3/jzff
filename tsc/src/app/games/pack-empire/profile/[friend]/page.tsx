// /games/pack-empire/profile/<friendship id>
//
// A friend's Pack Empire profile: the same top as yours, plus where the two of
// you stand. The address is the friendship's id, never an account's: the server
// works out who's on the other end (friendOf), so a user id never reaches the
// browser, and anyone who isn't on that friendship gets a 404.

import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { h2hLine } from '@/components/account/h2h'
import { friendIds, friendOf, headToHeads } from '@/lib/friends'
import { publicNames } from '@/lib/minigames/boardIdentity'
import { peMeta } from '@/lib/packEmpire/meta'
import { profileFor } from '@/lib/packEmpire/profile'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../mobile.module.css'
import { PeChrome, PeDock } from '../../chrome'
import { peFonts } from '../../fonts'
import { ProfileHero } from '../ProfileHero'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = peMeta({
  title: 'Profile · Pack Empire',
  card: { c: 'profile' },
  alt: 'Pack Empire profile',
  robots: { index: false, follow: false },
})

export default async function FriendProfilePage({ params }: { params: Promise<{ friend: string }> }) {
  const { friend } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const friendId = user ? await friendOf(user.id, friend) : null
  if (!user || !friendId) notFound()

  const mobile = (await getViewMode()) === 'mobile'
  const [names, pe, h2h, theirFriends] = await Promise.all([
    publicNames([friendId]),
    profileFor(friendId),
    headToHeads(user.id),
    friendIds(friendId),
  ])
  const name = names.get(friendId) ?? 'Friend'
  const vs = h2hLine(h2h.get(friendId) ?? null)

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()}>
      <PeChrome
        active="profile"
        mobile={mobile}
        signedIn
        back="/games/pack-empire/profile/"
        backLabel="Social"
        kicker="Pack Empire"
        title={name}
      />
      <div className="pe-wrap pe-wrap--narrow" style={{ margin: '0 auto' }}>
        {!mobile && (
          <div className="pe-table-head">
            <div className="pe-kicker">Friend</div>
            <h1 className="pe-table-title">{name}</h1>
          </div>
        )}
        {mobile && <div style={{ height: '0.9rem' }} />}

        <div className="pe-prof">
          <div className="pe-prof-id">
            <span className="pe-prof-mono" aria-hidden>
              {(name.trim()[0] ?? '?').toUpperCase()}
            </span>
            <span className="pe-prof-who">
              <span className="pe-prof-name">{name}</span>
              <span className="pe-prof-sub">
                {theirFriends.length} {theirFriends.length === 1 ? 'friend' : 'friends'} · {pe.runs} {pe.runs === 1 ? 'run' : 'runs'}
              </span>
            </span>
            <span className="pe-ph-vs" data-tone={vs.tone ?? undefined}>
              {vs.text}
            </span>
          </div>

          <ProfileHero profile={pe} you={false} />

          <div className="pe-ph-back">
            <Link href="/games/pack-empire/profile/" className="pe-act">
              Back To Social
            </Link>
          </div>
        </div>
      </div>
      {mobile ? <PeDock signedIn /> : <SiteFooter />}
    </main>
  )
}
