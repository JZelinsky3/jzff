// /games/pack-empire/profile
//
// Your games profile: friends and the record book, together. They live here
// rather than on /account because a friend only does anything inside Pack
// Empire, and account settings shouldn't have to scroll past a game. The
// account page keeps a link, with a count if anything is waiting.

import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { PlayHub } from '@/components/account/PlayHub'
import { RecordBook } from '@/components/account/RecordBook'
import { SiteFooter } from '@/components/SiteFooter'
import { friendIds, friendsState } from '@/lib/friends'
import { publicNames } from '@/lib/minigames/boardIdentity'
import { loadRecords } from '@/lib/minigames/profileRecords'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../mobile.module.css'
import { PeChrome, PeDock } from '../chrome'
import { peFonts } from '../fonts'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = {
  title: 'Games Profile · Pack Empire',
  description: 'Your friends, your head-to-head records and your record book across the Games Page.',
  robots: { index: false, follow: false },
}

export default async function GamesProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const mobile = (await getViewMode()) === 'mobile'

  const chrome = (
    <PeChrome
      active="profile"
      mobile={mobile}
      signedIn={!!user}
      back="/games/pack-empire/"
      backLabel="Pack Empire"
      kicker="Pack Empire"
      title="Games"
      titleEm="Profile"
    />
  )
  const foot = mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />
  const rootClass = `pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()

  if (!user) {
    return (
      <main className={rootClass}>
        {chrome}
        <div className="pe-wrap pe-wrap--narrow" style={{ margin: '0 auto' }}>
          {!mobile && (
            <div className="pe-table-head">
              <div className="pe-kicker">★ Friends and records ★</div>
              <h1 className="pe-table-title">
                Games <span className="pe-em">profile.</span>
              </h1>
            </div>
          )}
          {mobile && <div style={{ height: '0.9rem' }} />}
          <div className="pe-bd-out">
            <p className="pe-bd-out-lede">
              Your friends, your record against each of them, and your best runs on every game.
            </p>
            <div className="pe-bd-out-ctas">
              <Link href="/login?next=%2Fgames%2Fpack-empire%2Fprofile%2F" className="pe-btn">
                Sign in
              </Link>
              <Link href="/games/pack-empire/play/" className="pe-btn pe-btn--ghost">
                Open packs
              </Link>
            </div>
          </div>
        </div>
        {foot}
      </main>
    )
  }

  const [friends, names, friendList, { data: profile }] = await Promise.all([
    friendsState(user.id),
    publicNames([user.id]),
    friendIds(user.id),
    createAdminClient().from('profiles').select('member_code').eq('id', user.id).maybeSingle(),
  ])
  const records = await loadRecords(user.id, friendList)
  const memberCode = (profile?.member_code as string | null) ?? ''
  const shownAs = names.get(user.id) ?? memberCode
  const runs = records.reduce((n, g) => n + g.runs, 0)

  return (
    <main className={rootClass}>
      {chrome}
      <div className="pe-wrap pe-wrap--narrow" style={{ margin: '0 auto' }}>
        {!mobile && (
          <div className="pe-table-head">
            <div className="pe-kicker">★ Friends and records ★</div>
            <h1 className="pe-table-title">
              Games <span className="pe-em">profile.</span>
            </h1>
          </div>
        )}

        {mobile && <div style={{ height: '0.9rem' }} />}

        <div className="pe-prof">
          <div className="pe-prof-id">
            <span className="pe-prof-mono" aria-hidden>
              {(shownAs.trim()[0] ?? '?').toUpperCase()}
            </span>
            <span className="pe-prof-who">
              <span className="pe-prof-name">{shownAs}</span>
              <span className="pe-prof-sub">
                {friends.friends.length} {friends.friends.length === 1 ? 'friend' : 'friends'} · {runs}{' '}
                {runs === 1 ? 'run' : 'runs'}
              </span>
            </span>
            <Link href="/account/" className="pe-prof-edit">
              Change name
            </Link>
          </div>

          <PlayHub initial={friends} records={<RecordBook records={records} />} memberCode={memberCode} phone={mobile} />
        </div>
      </div>
      {foot}
    </main>
  )
}
