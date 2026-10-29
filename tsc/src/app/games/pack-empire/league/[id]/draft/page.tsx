import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { beginDraft, getDraft } from '@/lib/packEmpire/league'
import mobileStyles from '../../../../mobile.module.css'
import { PeChrome } from '../../../chrome'
import { peFonts } from '../../../fonts'
import { LeagueDraft } from '../../LeagueDraft'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = {
  title: 'Weekly Draft · Pack Empire League',
  robots: { index: false, follow: false },
}

export default async function LeagueDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params
  const id = raw.toUpperCase()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/games/pack-empire/league/${id}/draft/`)}`)

  let out = await getDraft(id, user.id)
  // A week with nothing to choose (no boosted pack) starts itself, here
  // rather than in the browser, so the page arrives with the draft open.
  if (out.ok && out.view.status === 'not_started' && !out.view.needsBoost) {
    out = await beginDraft(id, user.id, undefined)
  }
  const mobile = (await getViewMode()) === 'mobile'

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.boardRoot : ''}`.trim()}>
      <PeChrome
        mobile={mobile}
        signedIn
        back={`/games/pack-empire/league/${id}/`}
        backLabel="The league"
        kicker="League Mode"
        title={out.ok ? out.view.league.name : 'Weekly'}
        titleEm={out.ok ? undefined : 'Draft'}
      />
      <div className="pe-wrap">
        {out.ok ? (
          <>
            {mobile && <div style={{ height: '0.9rem' }} />}
            <LeagueDraft leagueId={id} initial={out.view} />
          </>
        ) : (
          <div className="pe-table pe-wrap--narrow">
            <div className="pe-table-head">
              <h1 className="pe-table-title">No draft for you right now.</h1>
              <p className="pe-table-sub">{out.error}</p>
            </div>
            <div className="pe-recap-actions">
              <Link href={`/games/pack-empire/league/${id}/`} className="pe-btn">
                Back to the league
              </Link>
            </div>
          </div>
        )}
      </div>
      {!mobile && <SiteFooter />}
    </main>
  )
}
