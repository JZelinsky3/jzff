import Link from 'next/link'
import { MobilePageShell } from '@/components/mobile/MobilePageShell'

export function MobileAbout({ signedIn }: { signedIn: boolean }) {
  return (
    <MobilePageShell
      backHref="/"
      barTitle="About"
      barTitleEm="TSC"
      signedIn={signedIn}
      kicker="For the commissioner who keeps the records"
      heroTitle="A league's history,"
      heroTitleEm="done right."
      heroSub="The Sunday Chronicle turns your fantasy football league's full history into a polished public almanac. Paste a Sleeper, ESPN, or NFL.com league ID; we walk back through every season and produce a single canonical archive."
    >
      <div className="mpg-section-head">§ 01 · What it is</div>
      <Faq q="What is The Sunday Chronicle?">
        A SaaS that takes any fantasy football league ID and turns the
        league&apos;s entire history into a public-facing almanac. Standings,
        champion rolls, season archives, the record book, draft history,
        manager dossiers, rivalries, weekly pick&apos;ems, power rankings —
        all rendered into a single shareable URL like{' '}
        <code>thesundaychronicle.app/leagues/your-league/</code>.
      </Faq>
      <Faq q="Who is it for?">
        Fantasy football commissioners running long-standing leagues. Especially
        useful for dynasty leagues, leagues that have moved between platforms,
        and leagues with years of stories scattered across screenshots and
        group chats.
      </Faq>
      <Faq q="Which platforms does it support?">
        <strong>Sleeper</strong> (full historical + live season).{' '}
        <strong>ESPN</strong> (full historical + live; private leagues need
        SWID + espn_s2). <strong>NFL.com</strong> (historical only).{' '}
        <strong>Yahoo</strong> coming soon.
      </Faq>

      <div className="mpg-section-head">§ 02 · Pricing</div>
      <Faq q="How much does it cost?">
        <strong>Rookie</strong> — $3/mo, 1 league. <strong>Veteran</strong> —
        $5/mo, up to 3 leagues. <strong>All-Pro</strong> — $15/mo, up to 10
        leagues. Every plan has a 7-day free trial. See{' '}
        <Link href="/pricing">pricing</Link>.
      </Faq>
      <Faq q="Can I see what the almanac looks like?">
        Yes — visit <Link href="/demo/">/demo/</Link> for a fully-populated
        demo built from a real seven-year league&apos;s history. No signup
        required.
      </Faq>
      <Faq q="What happens if I cancel?">
        Your leagues stay in good standing for 6 months after cancellation.
        After that, without a new subscription, they&apos;re permanently
        deleted (we&apos;ll show you the exact date on your dashboard).
      </Faq>

      <div className="mpg-section-head">§ 03 · The team</div>
      <Faq q="Who built it?">
        Built and maintained by JZFF — a long-time fantasy commissioner who
        got tired of league history living scattered across screenshots and
        group chats. Reach out at{' '}
        <a href="mailto:jzffgames@gmail.com">jzffgames@gmail.com</a>.
      </Faq>
      <Faq q="Where can I start?">
        Visit <Link href="/">the home page</Link> → sign up → paste your
        league ID. We do the rest.
      </Faq>

      <div className="mpg-cta">
        <div className="mpg-cta-kicker">★ Try it</div>
        <div className="mpg-cta-title">
          See your league&apos;s <em>full history</em> in 30 seconds.
        </div>
        <div className="mpg-cta-desc">
          Paste your Sleeper, ESPN, or NFL.com league ID. 7-day free trial.
        </div>
        <div className="mpg-cta-btns">
          <Link href="/login?mode=signup" className="dc-btn">Start archive</Link>
          <a href="/demo/" target="_blank" rel="noopener" className="dc-btn-ghost">Tour demo</a>
        </div>
      </div>
    </MobilePageShell>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="mpg-card" style={{ margin: '0 1.1rem .75rem' }}>
      <h2 className="mpg-card-title">{q}</h2>
      <div className="mpg-card-body">{children}</div>
    </div>
  )
}
