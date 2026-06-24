import Link from 'next/link'
import { MobilePageShell } from '@/components/mobile/MobilePageShell'
import { AddToHubForm } from '@/app/manager/new/pick-self-form'

export function MobileManagerNew({
  signedIn,
  backHref,
  gateOk,
  gateReason,
  gateCurrent,
  gateLimit,
  gateMessage,
  yahooConnected,
}: {
  signedIn: boolean
  backHref: string
  gateOk: boolean
  gateReason?: 'no_subscription' | 'tier_limit'
  gateCurrent?: number
  gateLimit?: number
  gateMessage?: string
  yahooConnected: boolean
}) {
  return (
    <MobilePageShell
      backHref={backHref}
      backLabel="Back"
      barTitle="Add"
      barTitleEm="League"
      signedIn={signedIn}
      kicker="Manager Hub · Setup"
      heroTitle="Add yourself to"
      heroTitleEm="the book."
      heroSub="Pick a platform, paste a league ID, choose which member is you. The chronicle threads the league's history in automatically."
    >
      {gateOk ? (
        <div className="mpg-card" style={{ margin: '0 1.1rem .85rem' }}>
          <AddToHubForm yahooConnected={yahooConnected} />
        </div>
      ) : (
        <div className="mpg-card" style={{ margin: '0 1.1rem .85rem' }}>
          <div className="mpg-cta-kicker">
            {gateReason === 'tier_limit' ? '★ Hub limit reached' : '★ Subscription required'}
          </div>
          <div className="mpg-cta-title">
            {gateReason === 'tier_limit'
              ? `${gateCurrent}/${gateLimit} linked leagues`
              : 'Subscribe to build your hub'}
          </div>
          <div className="mpg-cta-desc">{gateMessage}</div>
          <div className="mpg-cta-btns">
            <Link href="/pricing" className="dc-btn">
              {gateReason === 'tier_limit' ? 'Upgrade' : 'See pricing'}
            </Link>
            {gateReason === 'tier_limit' && (
              <Link href="/account" className="dc-btn-ghost">Manage</Link>
            )}
          </div>
        </div>
      )}

      <div className="mpg-section-head">★ What happens next</div>
      <div style={{ padding: '0 1.1rem' }}>
        <Step n="01" head="We thread the archive.">
          Sleeper resolves instantly. ESPN, NFL.com, and Yahoo walk back through every
          season the platform has data for &mdash; usually a minute or two.
        </Step>
        <Step n="02" head="You become a chapter.">
          Once the archive lands, your finishes, drafts, rivalries, and extremes from
          that league get stitched into the chronicle automatically.
        </Step>
        <Step n="03" head="You can rename and re-sync.">
          Settings lets you alias the league for your hub, re-trigger a sync, or unlink
          entirely &mdash; whenever.
        </Step>
      </div>
    </MobilePageShell>
  )
}

function Step({ n, head, children }: { n: string; head: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      gap: '.85rem',
      padding: '.9rem 0',
      borderTop: '1px dotted var(--ink-line)',
    }}>
      <span style={{
        fontFamily: 'var(--serif)',
        fontStyle: 'italic',
        fontSize: '1.5rem',
        color: 'var(--gold)',
        lineHeight: 1,
      }}>{n}</span>
      <div>
        <div style={{ fontFamily: 'var(--serif)', color: 'var(--cream)', marginBottom: '.25rem' }}>{head}</div>
        <div style={{ fontSize: '.88rem', lineHeight: 1.5 }}>{children}</div>
      </div>
    </div>
  )
}
