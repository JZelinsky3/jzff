import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { getDraft, leagueView } from '@/lib/packEmpire/league'
import { WEEK_STATUS_LABEL } from '@/lib/packEmpire/leagueWeek'
import { PACK_TIER_COLOR, PACK_TIER_LABEL } from '@/lib/packEmpire/rules'
import { WeekPanel } from '../../LeagueBoard'
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

  // Every week opens on the Standings Pack's slot, so nothing starts itself.
  const out = await getDraft(id, user.id)
  // Desktop has room for the league beside the field: who's in, where they stand.
  const mobile0 = (await getViewMode()) === 'mobile'
  const lv = out.ok && !mobile0 ? await leagueView(id, user.id) : null
  const mobile = mobile0

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.boardRoot : ''}`.trim()}>
      <PeChrome
        active="league"
        mobile={mobile}
        signedIn
        back={`/games/pack-empire/league/${id}/`}
        backLabel="The league"
        kicker="League Mode"
        title={out.ok ? out.view.league.name : 'Weekly'}
        titleEm={out.ok ? undefined : 'Draft'}
      />
      <div className={`pe-wrap${lv ? ' pe-wrap--league' : ''}`}>
        {out.ok ? (
          <>
            {mobile && <div style={{ height: '0.9rem' }} />}
            {lv ? (
              <div className="pe-lgd">
                <div className="pe-lgd-main">
                  <LeagueDraft leagueId={id} initial={out.view} />
                </div>
                <aside className="pe-lgd-side" aria-label="The league this week">
                  <WeekPanel view={lv} />
                  <div className="pe-panel pe-lgd-board">
                    <div className="pe-kicker">The table</div>
                    <ol>
                      {lv.standings
                        .filter((s) => lv.league.phase === 'regular' || s.active)
                        .map((s, i) => (
                          <li key={s.memberId} className={s.you ? 'you' : ''}>
                            <span className="pe-lgd-rank">{i + 1}</span>
                            <span className="pe-lgd-team">
                              {s.team ?? s.name}
                              <small style={{ color: PACK_TIER_COLOR[s.tier] }}>{PACK_TIER_LABEL[s.tier]}</small>
                            </span>
                            <span className={`pe-lgd-st ${s.status}`}>{WEEK_STATUS_LABEL[s.status]}</span>
                            <span className="pe-lgd-total">
                              {(lv.league.phase === 'regular' ? s.total : s.playoff).toLocaleString()}
                            </span>
                          </li>
                        ))}
                    </ol>
                    <Link href={`/games/pack-empire/league/${id}/`} className="pe-link pe-lgd-more">
                      The full league
                    </Link>
                  </div>
                </aside>
              </div>
            ) : (
              <LeagueDraft leagueId={id} initial={out.view} />
            )}
          </>
        ) : (
          <div className="pe-table pe-wrap--narrow">
            <div className="pe-table-head">
              <h1 className="pe-table-title">No draft for you right now.</h1>
              <p className="pe-table-sub">{out.error}</p>
            </div>
            <div className="pe-recap-actions">
              <Link href={`/games/pack-empire/league/${id}/`} className="pe-push">
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
