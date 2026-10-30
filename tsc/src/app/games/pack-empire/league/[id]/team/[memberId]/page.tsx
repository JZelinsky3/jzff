import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { teamView } from '@/lib/packEmpire/league'
import { PHASE_LABEL, RARITY_LOOK, SLOTS, tierFor, type LeaguePhase, type Player } from '@/lib/packEmpire/rules'
import mobileStyles from '../../../../../mobile.module.css'
import { LineupSheet } from '../../../../cards'
import { PeChrome } from '../../../../chrome'
import { peFonts } from '../../../../fonts'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = {
  title: 'Team · Pack Empire League',
  robots: { index: false, follow: false },
}

export default async function LeagueTeamPage({
  params,
}: {
  params: Promise<{ id: string; memberId: string }>
}) {
  const { id: raw, memberId } = await params
  const id = raw.toUpperCase()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!/^[0-9a-f-]{36}$/.test(memberId)) notFound()
  const view = await teamView(id, memberId, user?.id ?? null)
  if (!view) notFound()
  const mobile = (await getViewMode()) === 'mobile'

  const d = view.draft
  const title = view.member.team ?? view.member.name
  const weekLabel = d
    ? d.phase === 'regular'
      ? `Week ${d.week}`
      : PHASE_LABEL[d.phase as LeaguePhase]
    : null

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.boardRoot : ''}`.trim()}>
      <PeChrome
        active="league"
        mobile={mobile}
        signedIn={!!user}
        back={`/games/pack-empire/league/${id}/`}
        backLabel={view.league.name}
        kicker={view.league.name}
        title={title}
      />
      <div className="pe-wrap pe-wrap--narrow" style={{ margin: '0 auto' }}>
        <div className="pe-table-head">
          <div className="pe-kicker">★ {view.member.team ? view.member.name : 'Team'} ★</div>
          <h1 className="pe-table-title">{title}</h1>
        </div>

        {d ? (
          <>
            <div className="pe-recap" style={{ '--tc': tierFor(d.finalScore).color } as React.CSSProperties}>
              <div className="pe-kicker">§ {weekLabel}</div>
              <div className="pe-recap-score">{d.finalScore.toLocaleString()}</div>
              <div className="pe-recap-lbl pe-note">
                {d.draftScore.toLocaleString()} accolades {d.chemistry.total >= 0 ? '+' : '−'}{' '}
                {Math.abs(d.chemistry.total).toLocaleString()} chemistry
              </div>
            </div>
            <div className="pe-twoup">
              <LineupSheet name={weekLabel ?? 'Lineup'} lineup={d.lineup} total={d.draftScore} />
              <div className="pe-panel">
                <div className="pe-kicker">Chemistry</div>
                {d.chemistry.bonds.length === 0 ? (
                  <p className="pe-note" style={{ marginTop: '0.6rem' }}>
                    No chemistry either way.
                  </p>
                ) : (
                  <div className="pe-chem">
                    {d.chemistry.bonds.map((b, i) => (
                      <div key={i} className={`pe-bond ${b.type}`}>
                        <span>
                          {b.aName} and {b.bName}
                          <small>{b.reason}</small>
                        </span>
                        <b>
                          {b.points > 0 ? '+' : ''}
                          {b.points}
                        </b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="pe-empty">
            {view.member.you
              ? 'No lineup yet this season.'
              : 'Nothing revealed yet. Lineups show once the commissioner closes the week.'}
          </p>
        )}

        <section className="pe-sec">
          <div className="pe-sec-head">
            <span className="pe-sec-num">§ Locked</span>
            <span className="pe-sec-title">Keepers</span>
            <span className="pe-sec-meta">{view.locks.length} of 7</span>
          </div>
          {view.locks.length === 0 ? (
            <p className="pe-empty">Nobody locked yet.</p>
          ) : (
            <div className="pe-row-list">
              {view.locks.map((l) => {
                const p = l.player as Player
                const rc = RARITY_LOOK[p.rarity]
                return (
                  <div key={p.id} className="pe-row">
                    <span style={{ minWidth: 0 }}>
                      <span className="pe-row-name">{p.name}</span>
                      <span className="pe-row-sub" style={{ color: rc.color }}>
                        {SLOTS[l.slot]?.label} · {rc.label}
                      </span>
                    </span>
                    <span className="pe-row-side">{p.score.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <div className="pe-recap-actions" style={{ marginTop: '2rem' }}>
          <Link href={`/games/pack-empire/league/${id}/`} className="pe-btn pe-btn--quiet">
            Back to {view.league.name}
          </Link>
        </div>
      </div>
      {!mobile && <SiteFooter />}
    </main>
  )
}
