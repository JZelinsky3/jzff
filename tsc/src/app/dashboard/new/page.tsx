import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { MobileNewArchive } from '@/components/dashboard/MobileNewArchive'
import { createClient } from '@/lib/supabase/server'
import { canCreateLeague } from '@/lib/stripe'
import { getViewMode } from '@/lib/viewMode'
import { AddLeagueForm } from './add-league-form'

export default async function NewLeaguePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const gate = await canCreateLeague(user.id)

  // Yahoo Fantasy requires per-user OAuth (unlike Sleeper/ESPN/NFL where the
  // platform is paste-an-ID). Surface the connection state to the form so it
  // can show a "Connect Yahoo" prompt when that platform is selected.
  const { data: yahooRow } = await supabase
    .from('yahoo_tokens')
    .select('user_id, expires_at')
    .eq('user_id', user.id)
    .maybeSingle()
  const yahooConnected = !!yahooRow

  if ((await getViewMode()) === 'mobile') {
    return (
      <MobileNewArchive
        gateOk={gate.ok}
        gateReason={gate.ok ? undefined : gate.reason}
        gateCurrent={gate.ok ? undefined : gate.current}
        gateLimit={gate.ok ? undefined : gate.limit}
        gateMessage={gate.ok ? undefined : gate.message}
        yahooConnected={yahooConnected}
      />
    )
  }

  return (
    <main>
      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ New archive ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}>
          Begin a <em>chronicle.</em>
        </h1>
        <p className="hero-sub">
          Pick your platform, paste your league ID. We&apos;ll walk back through every season we can find
          from that ID — you can add more sources later if your league lived under several.
        </p>
      </section>

      <div className="section" style={{ maxWidth: '560px' }}>
        {gate.ok ? (
          <div className="dc-card-static">
            <AddLeagueForm yahooConnected={yahooConnected} />
          </div>
        ) : (
          <UpgradePrompt
            reason={gate.reason}
            current={gate.current}
            limit={gate.limit}
            message={gate.message}
          />
        )}

        <details style={{ marginTop: '1.5rem', color: 'var(--cream-soft)' }}>
          <summary style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '.7rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)' }}>
            Where do I find my league ID?
          </summary>
          <div style={{ marginTop: '.85rem', fontSize: '.9rem', lineHeight: 1.6 }}>
            <p style={{ marginBottom: '.6rem' }}>
              <strong style={{ color: 'var(--gold)' }}>Sleeper:</strong> open your league in a browser. The URL
              looks like{' '}
              <code style={{ background: 'var(--ink-soft)', padding: '.15rem .4rem', borderRadius: '2px', fontSize: '.78rem' }}>
                sleeper.com/leagues/<em>1234567890123456789</em>/team
              </code>
              {' '}— that long number is your league ID.
            </p>
            <p style={{ marginBottom: '.6rem' }}>
              <strong style={{ color: 'var(--gold)' }}>ESPN:</strong> from any league page, the URL contains{' '}
              <code style={{ background: 'var(--ink-soft)', padding: '.15rem .4rem', borderRadius: '2px', fontSize: '.78rem' }}>
                fantasy.espn.com/football/league?leagueId=<em>47847</em>
              </code>
              {' '}— that number is it. Private leagues also need SWID + espn_s2 cookies (DevTools → Application → Cookies → fantasy.espn.com).
            </p>
            <p style={{ marginBottom: 0 }}>
              <strong style={{ color: 'var(--gold)' }}>NFL.com:</strong> open the league. The URL is{' '}
              <code style={{ background: 'var(--ink-soft)', padding: '.15rem .4rem', borderRadius: '2px', fontSize: '.78rem' }}>
                fantasy.nfl.com/league/<em>7528632</em>
              </code>
              {' '}— that number is it. League must be set to public; historical only for now (NFL.com hasn&apos;t reopened live leagues this year).
            </p>
          </div>
        </details>

        <div style={{ marginTop: '2rem' }}>
          <Link href="/dashboard" className="dc-btn-ghost">← Back to library</Link>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}

function UpgradePrompt({
  reason,
  current,
  limit,
  message,
}: {
  reason: 'no_subscription' | 'tier_limit'
  current?: number
  limit?: number
  message: string
}) {
  const isLimit = reason === 'tier_limit'
  return (
    <div className="dc-card-static">
      <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)' }}>
        {isLimit ? 'Tier limit reached' : 'Subscription required'}
      </div>
      <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.8rem', margin: '.5rem 0 .35rem' }}>
        {isLimit
          ? <>You&apos;re at <em style={{ color: 'var(--gold)' }}>{current}/{limit}</em> leagues.</>
          : <>Pick a plan to <em style={{ color: 'var(--gold)' }}>get started.</em></>}
      </h2>
      <p style={{ opacity: 0.75, lineHeight: 1.6, fontSize: '.95rem', marginBottom: '1.25rem' }}>
        {message}
      </p>
      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
        <Link href="/pricing" className="dc-btn">
          {isLimit ? 'Upgrade to Tier 2 →' : 'See pricing →'}
        </Link>
        {isLimit && (
          <Link href="/account" className="dc-btn-ghost">Manage subscription</Link>
        )}
      </div>
    </div>
  )
}
