import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { leagueView } from '@/lib/packEmpire/league'
import { PACK_TIER_COLOR, PACK_TIER_LABEL, PHASE_LABEL, REGULAR_WEEKS } from '@/lib/packEmpire/rules'
import mobileStyles from '../../../mobile.module.css'
import { PeChrome } from '../../chrome'
import { peFonts } from '../../fonts'
import { ShareLink } from '../../share'
import { CommishPanel, JoinThisLeague, LeaveLeague, RenameTeam } from '../LeagueControls'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const v = await leagueView(id.toUpperCase(), null)
  return {
    title: v ? `${v.league.name} · Pack Empire League` : 'League Mode · Pack Empire',
    robots: { index: false, follow: false },
  }
}

export default async function LeagueHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const view = await leagueView(id.toUpperCase(), user?.id ?? null)
  if (!view) notFound()
  const mobile = (await getViewMode()) === 'mobile'

  const { league, member, standings } = view
  const post = league.phase === 'gauntlet' || league.phase === 'finals' || league.phase === 'complete'
  const drafting = league.phase === 'regular' || ((league.phase === 'gauntlet' || league.phase === 'finals') && !!member?.playoff_active)
  const champion = view.champion ? standings.find((s) => s.memberId === view.champion) : null
  const waitingOn = standings.filter(
    (s) => s.thisWeek !== 'submitted' && (league.phase === 'regular' || s.active)
  ).length

  const weekLine =
    league.phase === 'regular'
      ? `Week ${league.current_week} of ${REGULAR_WEEKS}`
      : league.phase === 'pregame'
        ? `${standings.length} of ${league.max_players} teams`
        : PHASE_LABEL[league.phase]

  let cta: React.ReactNode = null
  if (member && drafting) {
    const d = view.myDraft
    if (!d || d.status === 'drafting') {
      cta = (
        <Link href={`/games/pack-empire/league/${league.id}/draft/`} className="pe-btn">
          {d ? 'Finish your draft' : league.phase === 'regular' ? `Draft week ${league.current_week}` : `Draft the ${PHASE_LABEL[league.phase]}`}
        </Link>
      )
    } else if (league.phase === 'regular' && league.current_week < REGULAR_WEEKS && !d.locked) {
      cta = (
        <Link href={`/games/pack-empire/league/${league.id}/draft/`} className="pe-btn">
          Lock a player
        </Link>
      )
    } else {
      cta = <p className="pe-note">Your lineup is in. Waiting on the commissioner to close the week.</p>
    }
  } else if (member && post && !drafting && league.phase !== 'complete') {
    cta = <p className="pe-note">Out of the running this season. The standings are still yours to watch.</p>
  }

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.boardRoot : ''}`.trim()}>
      <PeChrome
        active="league"
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/league/"
        backLabel="Your leagues"
        kicker="League Mode"
        title={league.name}
      />

      <div className="pe-wrap">
        <div className="pe-table-head">
          <div className="pe-kicker">
            ★ Season {league.season_number} · {weekLine} ★
          </div>
          <h1 className="pe-table-title">{league.name}</h1>
        </div>

        {champion && (
          <div className="pe-recap" style={{ '--tc': '#ffd700' } as React.CSSProperties}>
            <div className="pe-kicker">§ Champion · Season {league.season_number}</div>
            <div className="pe-recap-tier">{champion.team ?? champion.name}</div>
            <div className="pe-recap-score">{champion.playoff.toLocaleString()}</div>
            <div className="pe-recap-lbl pe-note">
              Postseason accolades{champion.team ? ` · ${champion.name}` : ''}
            </div>
          </div>
        )}

        <div className="pe-league">
          <div className="pe-league-side">
            {member ? (
              <div className="pe-panel">
                <div className="pe-kicker">Your team</div>
                <div className="pe-panel-title">{member.team_name ?? member.display_name}</div>
                <div className="pe-note" style={{ marginBottom: '0.9rem' }}>
                  <RenameTeam id={league.id} current={member.team_name} />
                </div>
                <div className="pe-stat-row">
                  <span>
                    <b>{(post ? member.playoff_score : member.team_score).toLocaleString()}</b>
                    <small>{post ? 'Postseason' : 'Total'}</small>
                  </span>
                  <span>
                    <b style={{ color: PACK_TIER_COLOR[member.next_pack_tier] }}>{PACK_TIER_LABEL[member.next_pack_tier]}</b>
                    <small>This week&apos;s pack</small>
                  </span>
                  <span>
                    <b>{(member.permanent_locks ?? []).length}</b>
                    <small>Locked</small>
                  </span>
                </div>
                <div style={{ marginTop: '1rem' }}>{cta}</div>
                {league.phase === 'pregame' && !view.commissioner && (
                  <div style={{ marginTop: '0.8rem' }}>
                    <LeaveLeague id={league.id} />
                  </div>
                )}
              </div>
            ) : (
              <div className="pe-panel">
                <div className="pe-kicker">{league.visibility === 'public' ? 'Open league' : 'Invite only'}</div>
                <div className="pe-panel-title">
                  {league.phase === 'pregame' ? 'Taking teams' : 'Season under way'}
                </div>
                {league.phase === 'pregame' && standings.length < league.max_players ? (
                  user ? (
                    <JoinThisLeague id={league.id} invite={league.visibility !== 'public'} />
                  ) : (
                    <Link
                      href={`/login?next=${encodeURIComponent(`/games/pack-empire/league/${league.id}/`)}`}
                      className="pe-btn"
                      style={{ marginTop: '0.8rem' }}
                    >
                      Sign in to join
                    </Link>
                  )
                ) : (
                  <p className="pe-panel-text">New teams join between seasons.</p>
                )}
              </div>
            )}

            {view.commissioner && (
              <CommishPanel
                id={league.id}
                phase={league.phase}
                week={league.current_week}
                canStart={view.canStart}
                teams={standings.length}
                minPlayers={view.minPlayers}
                waitingOn={waitingOn}
              />
            )}

            {member && league.joinCode && league.phase === 'pregame' && (
              <div className="pe-panel">
                <div className="pe-kicker">Invite</div>
                <p className="pe-panel-text" style={{ margin: '0.5rem 0 0.8rem' }}>
                  The code is <b style={{ fontFamily: 'var(--mono)', letterSpacing: '0.2em' }}>{league.joinCode}</b>.
                  Send it, or the link.
                </p>
                <ShareLink path={`/games/pack-empire/league/${league.id}/`} title={league.name} text={`Join ${league.name} on Pack Empire. Code ${league.joinCode}`} />
              </div>
            )}
          </div>

          <div>
            <div className="pe-sec-head" style={{ marginTop: 0 }}>
              <span className="pe-sec-num">§ Standings</span>
              <span className="pe-sec-title">{post ? 'The postseason' : 'The table'}</span>
              <span className="pe-sec-meta">{weekLine}</span>
            </div>
            <div className="pe-standings">
              {standings.map((s, i) => {
                const out = post && !s.active
                return (
                  <Link
                    key={s.memberId}
                    href={`/games/pack-empire/league/${league.id}/team/${s.memberId}/`}
                    className={`pe-stand${s.you ? ' you' : ''}${out ? ' out' : ''}`}
                  >
                    <span className="pe-stand-rank">{i + 1}</span>
                    <span className="pe-stand-who">
                      <span className="pe-stand-team">{s.team ?? s.name}</span>
                      <span className="pe-stand-sub">
                        {s.team ? `${s.name} · ` : ''}
                        {s.locks} locked
                        {s.seed != null && post ? ` · Seed ${s.seed}` : ''}
                      </span>
                    </span>
                    {(league.phase === 'regular' || (s.active && post && league.phase !== 'complete')) && (
                      <span
                        className={`pe-stand-dot ${s.thisWeek}`}
                        title={s.thisWeek === 'submitted' ? 'Lineup in' : s.thisWeek === 'drafting' ? 'Drafting' : 'Not started'}
                      />
                    )}
                    <span className="pe-stand-last">{s.lastWeek != null ? s.lastWeek.toLocaleString() : '·'}</span>
                    <span className="pe-stand-total">{(post ? s.playoff : s.total).toLocaleString()}</span>
                  </Link>
                )
              })}
            </div>
            <p className="pe-note" style={{ marginTop: '0.7rem' }}>
              {post
                ? 'Postseason total · last regular-season week'
                : 'Season total · last week. A dot means this week’s lineup is in; nobody sees it until the week closes.'}
            </p>
          </div>
        </div>
      </div>

      {!mobile && <SiteFooter />}
    </main>
  )
}
