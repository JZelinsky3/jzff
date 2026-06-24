import type { Metadata } from "next"
import Link from "next/link"
import { SiteFooter } from "@/components/SiteFooter"
import { MobilePageShell } from "@/components/mobile/MobilePageShell"
import { createClient } from "@/lib/supabase/server"
import { getViewMode } from "@/lib/viewMode"

export const metadata: Metadata = {
  title: "Terms of Service — The Sunday Chronicle",
  description:
    "The terms that govern your use of The Sunday Chronicle.",
  alternates: { canonical: "https://thesundaychronicle.app/terms/" },
}

const EFFECTIVE = "June 18, 2026"

// Shared body — same prose for desktop and mobile, but rendered inside
// different chrome. H2 styles intentionally stripped so the mpg- scope
// can style headings; the desktop wrapper re-applies its own via the
// .legal-h2 class below.
function TermsBody() {
  return (
    <>
      <p style={{ opacity: 0.7, fontSize: ".88rem", marginBottom: "1.5rem" }}>
        Effective {EFFECTIVE}
      </p>

      <p>
        These Terms govern your use of The Sunday Chronicle (the
        &quot;Service&quot;), a fantasy football league-history and live-season
        platform operated by an independent developer based in Pennsylvania,
        USA. By creating an account or otherwise using the Service, you agree
        to these Terms.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least 13 years old to use the Service. If you are under
        18 you must have permission from a parent or guardian.
      </p>

      <h2>2. Your account</h2>
      <p>
        You are responsible for your account credentials and for activity that
        happens under your account. Tell us promptly at{" "}
        <a href="mailto:jzffgames@gmail.com">jzffgames@gmail.com</a>{" "}
        if you believe your account has been compromised.
      </p>

      <h2>3. Subscriptions and billing</h2>
      <p>
        Some features are gated behind a paid plan. Plans are billed in advance
        on a recurring basis through Stripe. You can cancel at any time from
        your Stripe customer portal; cancellation takes effect at the end of
        the current billing period and is not pro-rated.
      </p>
      <p>
        Trials, comp slots, and promotional pricing are offered at our
        discretion. We may change pricing on a prospective basis with
        reasonable notice.
      </p>
      <p>
        You authorize us (through Stripe) to charge the payment method on file
        for all amounts due. Failed payments may result in suspension of paid
        features.
      </p>

      <h2>4. Third-party fantasy data</h2>
      <p>
        The Service ingests data from third-party fantasy platforms (Sleeper,
        ESPN, NFL.com, Yahoo) at your direction. We are not affiliated with,
        sponsored by, or endorsed by any of them, nor by the NFL, NFLPA, or any
        team. Their platforms may change or restrict access without notice; if
        that happens we will do our best to adapt but cannot guarantee
        uninterrupted service.
      </p>
      <p>
        You represent that you have the right to import the data you connect
        to the Service.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service to harass, threaten, or defame others.</li>
        <li>Scrape, reverse engineer, or otherwise abuse the Service.</li>
        <li>Upload data you don&apos;t have the right to upload, or that violates anyone&apos;s privacy.</li>
        <li>Resell or rebrand the Service without written permission.</li>
        <li>Interfere with the Service&apos;s security, performance, or other users.</li>
      </ul>

      <h2>6. Your content</h2>
      <p>
        You retain ownership of league data and content you submit. You grant
        us a worldwide, royalty-free license to host, process, display, and
        back up that content as needed to operate the Service for you. If you
        mark a league as public, you grant a license to display its almanac
        publicly until you switch it back to private or delete it.
      </p>

      <h2>7. Our content</h2>
      <p>
        Everything else — the design, code, copy, logos, AI-generated grades
        and summaries, and aggregated stat compositions — belongs to us. You
        may not reproduce or redistribute it without permission.
      </p>

      <h2>8. AI features</h2>
      <p>
        Trade grades, recaps, and similar features use third-party large
        language models. Output may be inaccurate, biased, or odd. Treat it as
        color commentary, not advice. We are not responsible for decisions you
        make based on it.
      </p>

      <h2>9. Disclaimer of warranties</h2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available.&quot;
        To the maximum extent permitted by law, we disclaim all warranties,
        express or implied, including merchantability, fitness for a particular
        purpose, and non-infringement. We do not warrant that the Service will
        be uninterrupted, error-free, or that the data it shows will be
        complete or accurate.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, we will not be liable for
        indirect, incidental, consequential, special, exemplary, or punitive
        damages, or for lost profits, revenues, goodwill, or data. Our total
        liability for any claim relating to the Service will not exceed the
        greater of (a) the amount you paid us in the 12 months before the
        claim, or (b) US $50.
      </p>

      <h2>11. Indemnification</h2>
      <p>
        You agree to indemnify and hold us harmless from any claim or expense
        (including reasonable attorneys&apos; fees) arising out of your use of
        the Service, your content, or your violation of these Terms.
      </p>

      <h2>12. Termination</h2>
      <p>
        You can stop using the Service at any time by deleting your account.
        We can suspend or terminate accounts that violate these Terms or that
        create risk for the Service or other users. On termination, paid
        features stop immediately; we do not refund partial billing periods
        except as required by law.
      </p>

      <h2>13. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be
        announced via email or an in-app notice with reasonable advance notice.
        Continued use of the Service after changes take effect constitutes
        acceptance.
      </p>

      <h2>14. Governing law</h2>
      <p>
        These Terms are governed by the laws of the Commonwealth of
        Pennsylvania, USA, without regard to its conflict-of-law rules.
        Exclusive venue for any dispute lies in the state and federal courts
        located in Pennsylvania, and you consent to personal jurisdiction
        there.
      </p>

      <h2>15. Miscellaneous</h2>
      <p>
        If any part of these Terms is held unenforceable, the rest stays in
        effect. Our failure to enforce a provision is not a waiver. You may not
        assign these Terms; we may assign them to a successor in connection
        with a sale of the Service.
      </p>

      <h2>16. Contact</h2>
      <p>
        Questions:{" "}
        <a href="mailto:jzffgames@gmail.com">jzffgames@gmail.com</a>.
      </p>
    </>
  )
}

export default async function TermsPage() {
  if ((await getViewMode()) === "mobile") {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return (
      <MobilePageShell
        backHref="/"
        barTitle="Terms"
        signedIn={!!user}
        kicker="Legal · Terms of Service"
        heroTitle="The"
        heroTitleEm="rules."
      >
        <TermsBody />
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
          <div className="nav-kicker">Legal · Terms of Service</div>
          <div className="nav-title">The <em>rules.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: "hidden" }} />
      </nav>

      <div className="legal-body">
        <TermsBody />
      </div>

      <SiteFooter />
    </main>
  )
}
