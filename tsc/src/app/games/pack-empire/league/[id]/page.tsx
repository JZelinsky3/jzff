import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { peMeta } from '@/lib/packEmpire/meta'
import { leagueView, mulligansOf } from '@/lib/packEmpire/league'
import { PACK_TIER_COLOR, PACK_TIER_LABEL, PHASE_LABEL, REGULAR_WEEKS, SLOTS, shortName } from '@/lib/packEmpire/rules'
import mobileStyles from '../../../mobile.module.css'
import { PeChrome } from '../../chrome'
import { peFonts } from '../../fonts'
import { ShareButton } from '../../share'
import { HistoryList, RecordsPanel, ScheduleStrip, StandingsTable, WeekPanel, WeekRecapCard, isReady } from '../LeagueBoard'
import { CommishPanel, JoinThisLeague, LeaveLeague, RenameTeam } from '../LeagueControls'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const v = await leagueView(id.toUpperCase(), null)
  const champ = v?.champion ? v.standings.find((s) => s.memberId === v.champion) : null
  return peMeta({
    title: v ? `${v.league.name} · Pack Empire League` : 'League Mode · Pack Empire',
    description: champ
      ? `${champ.team ?? champ.name} won it all.`
      : v?.league.phase === 'pregame'
        ? `${v.standings.length} of ${v.league.max_players} teams are in. Eight weeks of pack drafts, then a Gauntlet and a Final.`
        : 'Eight weeks of pack drafts with keepers and chemistry, then a Gauntlet and a Final.',
    card: v
      ? { c: 'lg', id: v.league.id, s: `${v.league.phase}${v.league.current_week}-${v.standings.length}${v.champion ? '-c' : ''}` }
      : { c: 'league' },
    alt: 'A Pack Empire league',
    robots: { index: false, follow: false },
  })
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
  // Not done: no lineup yet, or still deciding the lock.
  const waitingOn = standings.filter((s) => !isReady(s) && (league.phase === 'regular' || s.active)).length
  const othersIn = standings.filter((s) => s.peek && !s.you).length

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
        <Link href={`/games/pack-empire/league/${league.id}/draft/`} className="pe-push">
          {d ? 'Finish your draft' : league.phase === 'regular' ? `Draft week ${league.current_week}` : `Draft the ${PHASE_LABEL[league.phase]}`}
        </Link>
      )
    } else if (league.phase === 'regular' && league.current_week < REGULAR_WEEKS && !d.locked) {
      cta = (
        <Link href={`/games/pack-empire/league/${league.id}/draft/`} className="pe-push">
          Lock a player, or pass
        </Link>
      )
    } else {
      cta = (
        <p className="pe-note">
          You&apos;re done for the week.{' '}
          {othersIn > 0
            ? `${othersIn} other lineup${othersIn === 1 ? ' is' : 's are'} in: open any team marked See it.`
            : 'Nobody else is in yet. Their lineups open to you as they finish.'}
        </p>
      )
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

      <div className="pe-wrap pe-wrap--league">
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
            <WeekPanel view={view} />
            {member ? (
              <div className="pe-panel pe-lg-team">
                <div className="pe-kicker">Your team</div>
                <div className="pe-lg-team-head">
                  <div className="pe-panel-title">{member.team_name ?? member.display_name}</div>
                  <RenameTeam id={league.id} current={member.team_name} />
                </div>
                <div className="pe-lg-total">
                  <b>{(post ? member.playoff_score : member.team_score).toLocaleString()}</b>
                  <small>{post ? 'Postseason total' : 'Season total'}</small>
                </div>
                {drafting && (
                  <dl className="pe-lg-facts">
                    <div>
                      <dt>Standings Pack</dt>
                      <dd style={{ color: PACK_TIER_COLOR[member.next_pack_tier] }}>{PACK_TIER_LABEL[member.next_pack_tier]}</dd>
                    </div>
                    <div>
                      <dt>Mulligan</dt>
                      <dd>
                        {mulligansOf(member) === 2
                          ? 'Mulligan + redraft'
                          : mulligansOf(member) === 1
                            ? 'One ready'
                            : 'None this week'}
                      </dd>
                    </div>
                    {league.phase === 'regular' && (
                      <div>
                        <dt>Locks</dt>
                        <dd>
                          {view.myLocks.length === 0 ? (
                            'None'
                          ) : (
                            <ul>
                              {view.myLocks.map((l) => (
                                <li key={l.player.id}>
                                  <span>
                                    {SLOTS[l.slot].short} {shortName(l.player.name)}
                                  </span>
                                  <small>{l.until ? `thru wk ${l.until}` : 'season'}</small>
                                </li>
                              ))}
                            </ul>
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
                {cta && <div className="pe-lg-cta">{cta}</div>}
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
                      className="pe-push"
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
                maxPlayers={league.max_players}
                cpus={view.cpus}
                weekRules={league.week_rules !== false}
                minPlayers={view.minPlayers}
                waitingOn={waitingOn}
              />
            )}

            {member && league.joinCode && league.phase === 'pregame' && (
              <div className="pe-panel pe-lg-invite">
                <div className="pe-kicker">Invite</div>
                <div className="pe-lg-code">{league.joinCode}</div>
                <div className="pe-lg-invite-row">
                  <span className="pe-note">Send the code, or the link.</span>
                  <ShareButton
                    path={`/games/pack-empire/league/${league.id}/`}
                    title={league.name}
                    text={`Join ${league.name} on Pack Empire. Code ${league.joinCode}`}
                  />
                </div>
              </div>
            )}

            <RecordsPanel view={view} />
          </div>

          <div className="pe-league-main">
            <div className="pe-sec-head" style={{ marginTop: 0 }}>
              <span className="pe-sec-num">§ Standings</span>
              <span className="pe-sec-title">{post ? 'The Postseason' : 'The Table'}</span>
              <span className="pe-sec-meta">{weekLine}</span>
            </div>
            <StandingsTable view={view} />
            <p className="pe-note" style={{ marginTop: '0.7rem' }}>
              {post
                ? 'Playoff total, Gauntlet and Final together. Season is the regular-season total.'
                : 'Under each team, the Standings Pack it opens this week. Form is a bar a week, gold where it won the week. Lineups stay hidden until the week closes, except to a team whose own is in.'}
            </p>
            <WeekRecapCard view={view} />
            <ScheduleStrip view={view} />
            <HistoryList view={view} />
          </div>
        </div>
      </div>

      {!mobile && <SiteFooter />}
    </main>
  )
}
