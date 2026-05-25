import Link from 'next/link'
import { OnboardingChecklist, type OnboardingStep } from '@/components/OnboardingChecklist'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { LeagueCardMenu } from './league-card-menu'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, slug, platform, last_synced_at, published_at, created_at')
    .order('created_at', { ascending: false })

  const hasLeague = (leagues?.length ?? 0) > 0
  const hasSynced = !!leagues?.some((l) => l.last_synced_at)
  const hasPublished = !!leagues?.some((l) => l.published_at)
  const firstUnsyncedSlug = leagues?.find((l) => !l.last_synced_at)?.slug
  const firstUnpublishedSlug = leagues?.find((l) => !l.published_at)?.slug
  const targetSlug = firstUnsyncedSlug ?? firstUnpublishedSlug ?? leagues?.[0]?.slug

  const onboardingSteps: OnboardingStep[] = [
    {
      label: 'Create your first league',
      description: 'Pick a platform, paste your league ID — we walk the history for you.',
      done: hasLeague,
      href: '/dashboard/new',
      cta: 'Add league →',
    },
    {
      label: 'Sync your data',
      description: 'Pull every season your sources can reach. Drafts, matchups, standings.',
      done: hasSynced,
      href: targetSlug ? `/league/${targetSlug}` : '/dashboard/new',
      cta: 'Sync now →',
    },
    {
      label: 'Publish your almanac',
      description: 'Flip the switch to open your public archive at /leagues/<slug>/.',
      done: hasPublished,
      href: targetSlug ? `/league/${targetSlug}` : '/dashboard/new',
      cta: 'Publish →',
    },
  ]

  return (
    <main>
      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '2rem' }}>
        <div className="hero-sup">★ Your Library ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}>
          The <em>Archives.</em>
        </h1>
        <p className="hero-sub">
          Every league you keep. Open one, or begin a new chronicle below.
        </p>
        <div style={{ marginTop: '1.75rem' }}>
          <Link href="/dashboard/new" className="dc-btn">+ New archive →</Link>
        </div>
      </section>

      <OnboardingChecklist
        storageKey="tsc_onb_dashboard"
        kicker="Welcome ★ Get started"
        title="Three steps to your"
        titleEm="archive."
        subtitle="Each step ticks itself off as you go."
        steps={onboardingSteps}
      />

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 01 · Your leagues</span>
          <span className="section-title">{leagues?.length ?? 0} on file —</span>
          <span className="section-meta">Newest first</span>
        </div>

        {(!leagues || leagues.length === 0) ? (
          <>
            <div className="dc-empty">
              <div className="dc-empty-title">No archives yet.</div>
              <div className="dc-empty-text">
                Pick a platform, paste your league ID, and watch the chronicle fill itself in.
              </div>
              <Link href="/dashboard/new" className="dc-btn">Start your first archive →</Link>
            </div>
            <div className="card-grid dc-dashboard-grid" style={{ marginTop: '2rem' }}>
              <DemoCard />
            </div>
          </>
        ) : (
          <div className="card-grid dc-dashboard-grid">
            {leagues.map((l) => (
              <div key={l.id} style={{ position: 'relative' }}>
                <LeagueCardMenu leagueId={l.id} leagueName={l.name} />
                <Link href={`/league/${l.slug}`} className="card" style={{ display: 'block' }}>
                  <div className="card-corner">{l.platform}</div>
                  <div className="card-roman">{l.name.charAt(0).toUpperCase()}</div>
                  <div className="card-title">
                    {splitName(l.name).head} <em>{splitName(l.name).tail}.</em>
                  </div>
                  <div className="card-desc">
                    {l.last_synced_at
                      ? `Last synced ${new Date(l.last_synced_at).toLocaleDateString()}`
                      : 'Not synced yet — open the archive to begin.'}
                  </div>
                  <div className="card-cta">
                    Open the archive <span className="card-arrow">→</span>
                  </div>
                </Link>
              </div>
            ))}
            <DemoCard />
          </div>
        )}
      </div>

      <SiteFooter />
    </main>
  )
}

function DemoCard() {
  return (
    <a
      href="/demo/"
      target="_blank"
      rel="noopener"
      className="card"
      style={{ borderStyle: 'dashed' }}
    >
      <div className="card-corner">Tour</div>
      <div className="card-roman">★</div>
      <div className="card-title">
        Demo <em>almanac.</em>
      </div>
      <div className="card-desc">
        See a finished almanac before building your own — a real league&apos;s seven-year history.
      </div>
      <div className="card-cta">
        Open the demo <span className="card-arrow">→</span>
      </div>
    </a>
  )
}

function splitName(name: string): { head: string; tail: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { head: '', tail: parts[0] }
  return { head: parts.slice(0, -1).join(' '), tail: parts[parts.length - 1] }
}
