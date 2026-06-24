import type { Metadata } from "next"
import Link from "next/link"
import { SiteFooter } from "@/components/SiteFooter"
import { MobilePageShell } from "@/components/mobile/MobilePageShell"
import { createClient } from "@/lib/supabase/server"
import { getViewMode } from "@/lib/viewMode"

export const metadata: Metadata = {
  title: "Privacy Policy — The Sunday Chronicle",
  description:
    "How The Sunday Chronicle collects, uses, and protects your data.",
  alternates: { canonical: "https://thesundaychronicle.app/privacy/" },
}

const EFFECTIVE = "June 18, 2026"

function PrivacyBody() {
  return (
    <>
      <p style={{ opacity: 0.7, fontSize: ".88rem", marginBottom: "1.5rem" }}>
        Effective {EFFECTIVE}
      </p>

      <p>
        The Sunday Chronicle (&quot;TSC,&quot; &quot;we,&quot; &quot;us&quot;) is a fantasy football
        league-history and live-season platform built and operated by a single
        developer. This policy explains what data we collect, how we use it,
        and what choices you have.
      </p>

      <h2>1. What we collect</h2>

      <h3>Account information</h3>
      <p>
        When you create an account we collect your email address and (when you
        sign in with Google) your Google display name and profile photo. We do
        not see or store your Google password.
      </p>

      <h3>Fantasy league data</h3>
      <p>
        To build your league&apos;s almanac we ingest league, manager, roster,
        matchup, draft, and transaction data from the fantasy platforms you
        connect — Sleeper, ESPN, NFL.com, and Yahoo. For Yahoo we use OAuth and
        store encrypted access and refresh tokens scoped to your account. For
        ESPN and NFL.com we accept the cookies you choose to provide so we can
        read private-league data on your behalf.
      </p>

      <h3>Payment information</h3>
      <p>
        Subscriptions are processed by Stripe. We never see or store your card
        number. Stripe shares with us a customer ID, the plan you bought, and
        the subscription state (active, past due, canceled). Read{" "}
        <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer noopener">Stripe&apos;s privacy notice</a>{" "}
        for details on how they handle payment data.
      </p>

      <h3>Usage and diagnostics</h3>
      <p>
        We log basic request metadata (timestamps, paths, status codes) for
        debugging and abuse prevention. We do not run third-party analytics or
        ad-tracking pixels.
      </p>

      <h2>2. How we use your data</h2>
      <p>To:</p>
      <ul>
        <li>Run the service you signed up for — sync your leagues, render the almanac, send transactional emails.</li>
        <li>Bill you and keep your subscription in good standing.</li>
        <li>Investigate bugs, abuse, and platform errors.</li>
        <li>Contact you about your account or material changes to the service.</li>
      </ul>
      <p>
        We do not sell your data. We do not use it to train any AI model
        outside of the league-specific summaries and trade grades shown in
        your own dashboard.
      </p>

      <h2>3. Who we share with</h2>
      <p>We share data with the following processors, only as needed to operate the service:</p>
      <ul>
        <li><strong>Supabase</strong> — our database and authentication provider (US-hosted).</li>
        <li><strong>Vercel</strong> — our hosting and edge-network provider.</li>
        <li><strong>Stripe</strong> — payment processing and subscription management.</li>
        <li><strong>Google</strong> — only if you sign in with Google; we receive identity, they receive nothing from us about your league activity.</li>
        <li><strong>Groq</strong> — used to generate AI trade summaries when that feature is enabled; only the trade in question is sent, never your account identity.</li>
      </ul>
      <p>
        We disclose data when required by a valid legal request, or to protect
        our users, our service, and our rights.
      </p>

      <h2>4. Cookies</h2>
      <p>
        We use a small number of first-party cookies for authentication, session
        state, mobile/desktop view preference, and CSRF protection. We do not
        use cookies for cross-site tracking or advertising.
      </p>

      <h2>5. Data retention</h2>
      <p>
        We keep your account and league data for as long as your account is
        active. If you delete your account, we remove your account record and
        league configuration. We may retain payment records and limited audit
        logs for as long as required by tax and accounting law.
      </p>

      <h2>6. Your rights</h2>
      <p>You can:</p>
      <ul>
        <li>Access and export your account data on request.</li>
        <li>Correct anything we have on you.</li>
        <li>Delete your account at any time from <Link href="/account">/account</Link>, or by emailing us.</li>
        <li>Disconnect any platform integration from your dashboard.</li>
      </ul>
      <p>
        If you are in the EU, UK, or California, you have additional rights
        (access, portability, deletion, restriction, objection). Email us and
        we will honor them within the timelines required by law.
      </p>

      <h2>7. Children</h2>
      <p>
        The service is not directed to children under 13, and we do not
        knowingly collect their data. If you believe a child has signed up,
        email us and we will delete the account.
      </p>

      <h2>8. Security</h2>
      <p>
        We use industry-standard encryption in transit (TLS) and at rest for
        credentials. No system is perfectly secure; we recommend a unique
        password and enabling Google sign-in where possible.
      </p>

      <h2>9. International users</h2>
      <p>
        The service is operated from the United States. By using it you
        consent to the transfer and processing of your data in the U.S.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        If we make material changes we will update the effective date above
        and, where required, notify you by email. Continued use of the service
        after changes take effect means you accept the revised policy.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions, requests, or complaints:{" "}
        <a href="mailto:jzffgames@gmail.com">jzffgames@gmail.com</a>.
      </p>
    </>
  )
}

export default async function PrivacyPage() {
  if ((await getViewMode()) === "mobile") {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return (
      <MobilePageShell
        backHref="/"
        barTitle="Privacy"
        signedIn={!!user}
        kicker="Legal · Privacy Policy"
        heroTitle="Your"
        heroTitleEm="data."
      >
        <PrivacyBody />
      </MobilePageShell>
    )
  }

  return (
    <main>
      <nav className="nav">
        <Link href="/" className="dc-nav-icon" aria-label="Back">
          <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <div className="nav-center">
          <div className="nav-kicker">Legal · Privacy Policy</div>
          <div className="nav-title">Your <em>data.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: "hidden" }} />
      </nav>

      <div className="legal-body">
        <PrivacyBody />
      </div>

      <SiteFooter />
    </main>
  )
}
