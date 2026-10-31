import type { Metadata } from 'next'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { areFriends, inviteOwner } from '@/lib/friends'
import { peMeta } from '@/lib/packEmpire/meta'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import styles from '@/components/account/play.module.css'
import { AcceptInvite } from './AcceptInvite'

// Where a friend invite link lands. The link is the friendship's consent from
// the person who sent it, so for anyone signed in this page is one button.
// Signed out, it says who is asking and sends them through sign-in with the
// way back already set.

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const owner = await inviteOwner(token)
  return peMeta({
    title: owner ? `${owner.name} wants you as a friend · The Sunday Chronicle` : 'Friend Invite · The Sunday Chronicle',
    description: 'Records side by side, and Pack Empire challenges whenever you want them.',
    card: owner ? { c: 'fr', t: token } : { c: 'profile' },
    alt: 'A friend invite',
    robots: { index: false, follow: false },
  })
}

type Copy = { kicker: string; title: string; body: string }

export default async function FriendInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const owner = await inviteOwner(token)
  const back = `/friends/${token}/`

  let copy: Copy
  let action: React.ReactNode = null

  if (!owner) {
    copy = {
      kicker: 'Invite link',
      title: 'This Link Has Been Reset',
      body: 'Whoever sent it made a new one, so this copy no longer works. Ask them for the fresh link.',
    }
    action = (
      <div className={styles.nameButtons}>
        <Link href="/games/" className={styles.btnGhost}>
          The Games Page
        </Link>
      </div>
    )
  } else if (!user) {
    copy = {
      kicker: 'An invitation',
      title: `${owner.name} Wants You as a Friend`,
      body: 'Friends see each other’s game records next to their own and can send each other Pack Empire challenges. It takes an account, which is free.',
    }
    action = (
      <div className={styles.nameButtons}>
        <Link href={`/login?mode=signup&next=${encodeURIComponent(back)}`} className={styles.btn}>
          Create an account
        </Link>
        <Link href={`/login?next=${encodeURIComponent(back)}`} className={styles.btnGhost}>
          Sign in
        </Link>
      </div>
    )
  } else if (owner.userId === user.id) {
    copy = {
      kicker: 'Your invite link',
      title: 'This One Is Yours',
      body: 'Send it to someone. Whoever opens it and says yes is your friend straight away.',
    }
    action = (
      <div className={styles.nameButtons}>
        <Link href="/games/pack-empire/profile/" className={styles.btn}>
          Your friends
        </Link>
      </div>
    )
  } else if (await areFriends(user.id, owner.userId)) {
    copy = {
      kicker: 'Invite link',
      title: `You and ${owner.name} Are Already Friends`,
      body: 'Nothing to do here. Your records and theirs are side by side in your games profile.',
    }
    action = (
      <div className={styles.nameButtons}>
        <Link href="/games/pack-empire/profile/" className={styles.btn}>
          Your friends
        </Link>
      </div>
    )
  } else {
    copy = {
      kicker: 'An invitation',
      title: `${owner.name} Wants You as a Friend`,
      body: 'Say yes and their game records sit next to yours, and you can send each other Pack Empire challenges.',
    }
    action = <AcceptInvite token={token} name={owner.name} />
  }

  if ((await getViewMode()) === 'mobile') {
    return (
      <main className="mprof">
        <header className="mprof-bar">
          <Link href={user ? '/account/' : '/'} className="mprof-bar-back" aria-label="Back">
            <svg viewBox="0 0 8 14" width="10" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="7 1 1 7 7 13" />
            </svg>
          </Link>
          <span className="mprof-bar-title">Friends</span>
          <span className="mprof-bar-spacer" />
        </header>
        <div className="mprof-section" style={{ marginTop: '1.4rem' }}>
          <div className="mprof-section-label">{copy.kicker}</div>
          <div className="mprof-card">
            <div className="mprof-card-title" style={{ fontSize: '1.25rem', lineHeight: 1.2 }}>
              {copy.title}
            </div>
            <div className="mprof-card-detail" style={{ margin: '.5rem 0 .9rem' }}>
              {copy.body}
            </div>
            {action}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <nav className="nav">
        <BackButton fallbackHref={user ? '/account' : '/'} ariaLabel="Back" />
        <div className="nav-center">
          <div className="nav-kicker">The Sunday Chronicle</div>
          <div className="nav-title">
            Friend <em>invite.</em>
          </div>
        </div>
        <span />
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1rem' }}>
        <div className="hero-sup">★ {copy.kicker} ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
          {copy.title}
        </h1>
        <p className="hero-sub">{copy.body}</p>
      </section>

      <div className="section" style={{ maxWidth: 560, paddingBottom: '4rem' }}>
        <div className={styles.panel}>{action}</div>
      </div>

      <SiteFooter />
    </main>
  )
}
