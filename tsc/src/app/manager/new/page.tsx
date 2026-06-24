import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAddCareerLink } from '@/lib/stripe'
import { getViewMode } from '@/lib/viewMode'
import { MobileManagerNew } from '@/components/manager/MobileManagerNew'
import { AddToHubForm } from './pick-self-form'

export default async function NewManagerLeaguePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const gate = await canAddCareerLink(user.id)

  // Yahoo needs per-user OAuth — surface connection state so the form can show
  // a "Connect Yahoo" prompt instead of an empty picker.
  const { data: yahooRow } = await supabase
    .from('yahoo_tokens')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const yahooConnected = !!yahooRow

  // Where "back" goes — to the chronicle if one exists, else the dashboard.
  const { data: chron } = await supabase
    .from('career_chronicles')
    .select('slug')
    .eq('owner_id', user.id)
    .maybeSingle()
  const backHref = chron ? `/manager/${chron.slug}` : '/dashboard'
  const backLabel = chron ? '← Back to chronicle' : '← Dashboard'

  if ((await getViewMode()) === 'mobile') {
    return (
      <MobileManagerNew
        signedIn={!!user}
        backHref={backHref}
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
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="newl-glow" />
      <div className="newl-grain" />

      <div className="newl-ticker">
        <div className="newl-ticker-track">
          {[0, 1].map((i) => (
            <div key={i} className="newl-ticker-group">
              <span className="newl-ticker-item"><span className="newl-ticker-star">★</span> MANAGER HUB · SETUP</span>
              <span className="newl-ticker-item">SLEEPER · ESPN · NFL · YAHOO</span>
              <span className="newl-ticker-item"><span className="newl-ticker-star">★</span> ONE CHRONICLE, EVERY LEAGUE</span>
            </div>
          ))}
        </div>
      </div>

      <nav className="newl-nav">
        <Link href={backHref} className="newl-nav-back">{backLabel}</Link>
        <div className="newl-nav-center">
          <div className="newl-nav-kicker">The jzFF Dispatch · Setup</div>
          <div className="newl-nav-title">Add a <em>League.</em></div>
        </div>
        <Link href="/dashboard" className="newl-nav-link">Dashboard →</Link>
      </nav>

      <header className="newl-edition">
        <div className="newl-edition-sup"><span className="star">★</span> Manager Hub · Setup <span className="star">★</span></div>
        <h1 className="newl-edition-title">Add yourself to <em>the book.</em></h1>
        <p className="newl-edition-deck">
          Pick a platform, paste a league ID, choose which member is you. The chronicle threads
          that league&apos;s history in automatically.
        </p>
        <div className="newl-edition-rule"></div>
      </header>

      <section className="newl-lede">
        <div className="newl-lede-frame">
          <div className="newl-lede-mast"><span className="star">★</span> The Editor&apos;s Lede <span className="star">★</span></div>
          <div className="newl-lede-body">
            <span className="newl-dropcap">F</span>our platforms supported: <em>Sleeper</em> goes
            instant, <em>ESPN</em> and <em>NFL.com</em> walk back through every season your league
            has data for, <em>Yahoo</em> needs a one-time OAuth handshake first. Every linked
            league becomes a chapter in your chronicle &mdash; finishes, drafts, rivalries,
            extremes &mdash; without you copying a single number.
          </div>
        </div>
      </section>

      <main className="newl-main">
        <div className="newl-shead">
          <h3 className="newl-shead-title">§ Link a <em>League</em></h3>
          <span className="newl-shead-meta">Pick platform &middot; paste ID &middot; pick yourself</span>
        </div>
        <p className="newl-section-intro">
          The form below threads a single league into your chronicle. Adding more leagues later
          (Settings &rarr; Linked Leagues) extends the chronicle without touching anything you
          already linked.
        </p>

        {gate.ok ? (
          <div className="newl-card">
            <AddToHubForm yahooConnected={yahooConnected} />
          </div>
        ) : (
          <UpgradePrompt
            reason={gate.reason}
            current={gate.current}
            limit={gate.limit}
            message={gate.message}
          />
        )}

        <section className="newl-aside">
          <div className="newl-shead">
            <h3 className="newl-shead-title">What <em>Happens Next</em></h3>
            <span className="newl-shead-meta">Three steps</span>
          </div>
          <ol className="newl-steps">
            <li>
              <span className="newl-step-num">01</span>
              <div>
                <div className="newl-step-head">We thread the archive.</div>
                <div className="newl-step-body">
                  Sleeper resolves immediately. ESPN, NFL.com, and Yahoo walk back through every
                  season the platform has data for &mdash; usually a minute or two.
                </div>
              </div>
            </li>
            <li>
              <span className="newl-step-num">02</span>
              <div>
                <div className="newl-step-head">You become a chapter.</div>
                <div className="newl-step-body">
                  Once the archive lands, your finishes, drafts, rivalries, and extremes from
                  that league are stitched into the chronicle&apos;s issues automatically.
                </div>
              </div>
            </li>
            <li>
              <span className="newl-step-num">03</span>
              <div>
                <div className="newl-step-head">You can rename and re-sync.</div>
                <div className="newl-step-body">
                  Settings lets you alias the league for your hub (without touching the public
                  almanac), re-trigger a sync, or unlink entirely &mdash; whenever.
                </div>
              </div>
            </li>
          </ol>
        </section>

        <div className="newl-foot">
          <span>The <em>jzFF</em> Dispatch &middot; Manager Hub Setup</span>
        </div>
      </main>
    </>
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
    <div className="newl-card newl-card-warn">
      <div className="newl-card-mast">
        {isLimit ? '★ Hub limit reached' : '★ Subscription required'}
      </div>
      <h2 className="newl-card-head">
        {isLimit
          ? <>You&apos;re at <em>{current}/{limit}</em> linked leagues.</>
          : <>Subscribe to <em>build your hub.</em></>}
      </h2>
      <p className="newl-card-body">{message}</p>
      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
        <Link href="/pricing" className="dc-btn">{isLimit ? 'Upgrade →' : 'See pricing →'}</Link>
        {isLimit && <Link href="/account" className="dc-btn-ghost">Manage subscription</Link>}
      </div>
    </div>
  )
}

const STYLES = `
.newl-glow { position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background-image:
    radial-gradient(circle at 15% 20%, rgba(232, 200, 137, .07) 0%, transparent 45%),
    radial-gradient(circle at 85% 80%, rgba(160, 72, 48, .04) 0%, transparent 50%);
}
.newl-grain { position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: .5;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence baseFrequency='0.85' numOctaves='2' seed='12'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 0.92 0 0 0 0 0.8 0 0 0 0.04 0'/></filter><rect width='180' height='180' filter='url(%23n)'/></svg>");
}

.newl-ticker { position: relative; z-index: 10; background: var(--gold); color: var(--ink); border-bottom: 3px solid var(--ink); height: 38px; display: flex; align-items: center; overflow: hidden; }
.newl-ticker-track { display: flex; gap: 3rem; white-space: nowrap; padding-left: 3rem; animation: newl-ticker-scroll 60s linear infinite; }
.newl-ticker-group { display: flex; gap: 3rem; }
.newl-ticker-item { font-family: var(--mono); font-size: .72rem; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; display: inline-flex; align-items: center; gap: .6rem; }
.newl-ticker-star { color: var(--rust); }
@keyframes newl-ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }

.newl-nav { position: sticky; top: 0; z-index: 30; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 1rem; padding: 1.2rem 2rem; background: rgba(14, 22, 32, .92); backdrop-filter: blur(12px); border-bottom: 1px solid var(--ink-line); }
.newl-nav-back, .newl-nav-link { color: var(--gold); text-decoration: none; font-family: var(--mono); font-weight: 700; font-size: .72rem; letter-spacing: .2em; text-transform: uppercase; transition: color .2s; }
.newl-nav-back { justify-self: start; } .newl-nav-link { justify-self: end; }
.newl-nav-back:hover, .newl-nav-link:hover { color: var(--gold-bright); }
.newl-nav-center { text-align: center; justify-self: center; }
.newl-nav-kicker { font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .3em; text-transform: uppercase; color: var(--cream-mute); margin-bottom: .3rem; }
.newl-nav-title { font-family: var(--serif); font-size: 1.4rem; color: var(--cream); }
.newl-nav-title em { font-style: italic; color: var(--gold); }

.newl-edition { position: relative; z-index: 10; max-width: 1100px; margin: 0 auto; padding: 4rem 1.5rem 1rem; text-align: center; }
.newl-edition-sup { font-family: var(--mono); font-weight: 700; font-size: .65rem; letter-spacing: .4em; text-transform: uppercase; color: var(--gold); margin-bottom: 1.25rem; }
.newl-edition-sup .star { color: var(--rust); }
.newl-edition-title { font-family: var(--serif); font-size: clamp(2.4rem, 6vw, 4.8rem); line-height: .95; letter-spacing: -.025em; color: var(--cream); }
.newl-edition-title em { font-style: italic; color: var(--gold); }
.newl-edition-deck { font-family: var(--serif); font-style: italic; font-size: clamp(1.05rem, 1.5vw, 1.25rem); color: var(--cream-soft); max-width: 640px; margin: 1.25rem auto 0; }
.newl-edition-rule { max-width: 320px; margin: 1.75rem auto 0; border-top: 1px solid var(--ink-line); position: relative; }
.newl-edition-rule::before { content: '✦'; position: absolute; top: -.55rem; left: 50%; transform: translateX(-50%); background: var(--ink); padding: 0 .6rem; color: var(--gold); font-size: .7rem; }

.newl-lede { position: relative; z-index: 10; max-width: 820px; margin: 2.75rem auto 0; padding: 0 1.75rem; }
.newl-lede-frame { padding: 1.85rem 2.25rem 1.7rem; background: linear-gradient(180deg, rgba(232,200,137,.04), transparent), var(--ink-card); border: 1px solid var(--ink-line); position: relative; }
.newl-lede-frame::before, .newl-lede-frame::after { content: ''; position: absolute; left: 1.5rem; right: 1.5rem; height: 1px; background: var(--gold-deep); opacity: .55; }
.newl-lede-frame::before { top: .55rem; } .newl-lede-frame::after { bottom: .55rem; }
.newl-lede-mast { text-align: center; font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .32em; text-transform: uppercase; color: var(--gold); margin-bottom: 1.1rem; }
.newl-lede-mast .star { color: var(--rust); }
.newl-lede-body { font-family: var(--serif); font-style: italic; font-size: 1.05rem; line-height: 1.65; color: var(--cream-soft); }
.newl-dropcap { float: left; font-family: var(--serif); font-style: italic; font-size: 3.6rem; line-height: .85; color: var(--gold); padding: .15rem .55rem 0 0; margin-right: .15rem; }

.newl-main { position: relative; z-index: 10; max-width: 760px; margin: 3rem auto 0; padding: 0 1.75rem 4rem; }
.newl-shead { padding-bottom: .65rem; border-bottom: 2px solid var(--gold-deep); margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; flex-wrap: wrap; }
.newl-shead-title { font-family: var(--serif); font-style: italic; font-size: clamp(1.4rem, 2.6vw, 1.9rem); color: var(--cream); }
.newl-shead-title em { color: var(--gold); }
.newl-shead-meta { font-family: var(--mono); font-size: .58rem; letter-spacing: .22em; text-transform: uppercase; color: var(--cream-mute); }
.newl-section-intro { font-family: var(--serif); font-style: italic; font-size: 1rem; line-height: 1.6; color: var(--cream-soft); max-width: 72ch; margin: 0 0 1.75rem; }
.newl-section-intro::before { content: '— '; color: var(--gold); font-style: normal; }

.newl-card { background: linear-gradient(180deg, rgba(232,200,137,.03), transparent), var(--ink-card); border: 1px solid var(--ink-line); padding: 2rem 1.85rem 1.75rem; position: relative; }
.newl-card::before { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 3px; background: var(--gold); }
.newl-card-warn { padding-top: 1.75rem; }
.newl-card-warn::before { background: var(--rust); }
.newl-card-mast { font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .3em; text-transform: uppercase; color: var(--rust); margin-bottom: .8rem; }
.newl-card-head { font-family: var(--serif); font-style: italic; font-size: 1.6rem; color: var(--cream); margin-bottom: .65rem; line-height: 1.2; }
.newl-card-head em { color: var(--gold); }
.newl-card-body { font-family: var(--serif); font-style: italic; font-size: 1rem; line-height: 1.6; color: var(--cream-soft); }

.newl-aside { margin-top: 3.5rem; }
.newl-steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 1.5rem; }
.newl-steps li { display: grid; grid-template-columns: auto 1fr; gap: 1.25rem; align-items: baseline; padding: 1.25rem 0; border-top: 1px dotted var(--ink-line); }
.newl-steps li:first-child { border-top: none; padding-top: .25rem; }
.newl-step-num { font-family: var(--serif); font-style: italic; font-size: 2.2rem; color: var(--gold); line-height: 1; font-variant-numeric: tabular-nums; }
.newl-step-head { font-family: var(--serif); font-size: 1.15rem; color: var(--cream); margin-bottom: .35rem; }
.newl-step-body { font-family: var(--serif); font-style: italic; font-size: .98rem; line-height: 1.55; color: var(--cream-soft); }

.newl-foot { margin-top: 5rem; padding: 1.75rem 0 0; text-align: center; border-top: 3px double var(--ink-line); font-family: var(--mono); font-size: .62rem; letter-spacing: .22em; text-transform: uppercase; color: var(--cream-mute); }
.newl-foot em { color: var(--gold); font-style: italic; }
`
