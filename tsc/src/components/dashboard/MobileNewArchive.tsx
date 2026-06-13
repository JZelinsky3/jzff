import Link from 'next/link'
import { AddLeagueForm } from '@/app/dashboard/new/add-league-form'

export function MobileNewArchive({
  gateOk,
  gateReason,
  gateCurrent,
  gateLimit,
  gateMessage,
  yahooConnected,
}: {
  gateOk: boolean
  gateReason?: string
  gateCurrent?: number
  gateLimit?: number
  gateMessage?: string
  yahooConnected: boolean
}) {
  return (
    <main className="mnew">
      {/* ── Sticky bar ── */}
      <header className="mnew-bar">
        <Link href="/dashboard" className="mnew-bar-back" aria-label="Back to library">
          <svg viewBox="0 0 8 14" width="10" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <span className="mnew-bar-title">New <em>Archive.</em></span>
        <span className="mnew-bar-spacer" />
      </header>

      {/* ── Compact intro ── */}
      <div className="mnew-intro">
        <p className="mnew-intro-text">
          Pick a platform, paste your league ID. We walk every season back to the start.
        </p>
      </div>

      {/* ── Form or gate ── */}
      <div className="mnew-body">
        {gateOk ? (
          <div className="mnew-form-card">
            <AddLeagueForm yahooConnected={yahooConnected} />
          </div>
        ) : (
          <MobileUpgradePrompt
            reason={gateReason as 'no_subscription' | 'tier_limit'}
            current={gateCurrent}
            limit={gateLimit}
            message={gateMessage ?? ''}
          />
        )}

        {/* ── Help section ── */}
        <details className="mnew-help">
          <summary className="mnew-help-trigger">
            Where do I find my league ID?
          </summary>
          <div className="mnew-help-body">
            <div className="mnew-help-item">
              <span className="mnew-help-plat">Sleeper</span>
              <span>Open league in browser. The long number in the URL is your ID.</span>
            </div>
            <div className="mnew-help-item">
              <span className="mnew-help-plat">ESPN</span>
              <span>URL contains <code>leagueId=<em>47847</em></code> — that number. Private leagues need cookies too.</span>
            </div>
            <div className="mnew-help-item">
              <span className="mnew-help-plat">NFL.com</span>
              <span>URL: <code>fantasy.nfl.com/league/<em>7528632</em></code>. Must be public.</span>
            </div>
            <div className="mnew-help-item">
              <span className="mnew-help-plat">Yahoo</span>
              <span>Connect your account above — we pull your leagues automatically.</span>
            </div>
          </div>
        </details>
      </div>

      <div className="mnew-footer">
        <Link href="/dashboard" className="mnew-footer-link">Library</Link>
        <span className="mnew-footer-sep">·</span>
        <Link href="/account" className="mnew-footer-link">Account</Link>
        <span className="mnew-footer-sep">·</span>
        <Link href="/" className="mnew-footer-link">Home</Link>
      </div>
    </main>
  )
}

function MobileUpgradePrompt({
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
    <div className="mnew-gate">
      <div className="mnew-gate-kicker">
        {isLimit ? 'Tier limit reached' : 'Subscription required'}
      </div>
      <div className="mnew-gate-title">
        {isLimit ? `${current}/${limit} leagues used` : 'Pick a plan to start'}
      </div>
      <div className="mnew-gate-desc">{message}</div>
      <div className="mnew-gate-btns">
        <Link href="/pricing" className="dc-btn dc-btn-block">
          {isLimit ? 'Upgrade' : 'See pricing'}
        </Link>
        {isLimit && (
          <Link href="/account" className="dc-btn-ghost dc-btn-block">
            Manage subscription
          </Link>
        )}
      </div>
    </div>
  )
}
