// /games/pack-empire/league
//
// League Mode's lobby, for both kinds of league: Weekly (league.ts, a pack draft
// every week) and Season (season.ts, draft once, eight games against eight
// defenses at your own pace). Your leagues of either kind, the setup card, a code
// box that takes either kind's code, and public leagues taking teams. A solo
// Season works signed out, so the setup card shows to everyone.

import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { peMeta } from '@/lib/packEmpire/meta'
import { myLeagues, openLeagues, type LeagueCard } from '@/lib/packEmpire/league'
import { playerById } from '@/lib/packEmpire/pool'
import { LOCK_WEEKS, PHASE_LABEL, REGULAR_WEEKS, type Player } from '@/lib/packEmpire/rules'
import { mySeasons, openSeasons, type SeasonCard } from '@/lib/packEmpire/season'
import { seasonViewer } from '@/lib/packEmpire/seasonWho'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../mobile.module.css'
import { HowItWorks, PeChrome, PeDock } from '../chrome'
import { peFonts } from '../fonts'
import { JoinPublic } from './LeagueLobby'
import { JoinAnyCode, LeagueSetup } from './LeagueSetup'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = peMeta({
  title: 'League Mode · Pack Empire',
  description: 'Two ways to run a league: a pack draft every week, or draft once and play eight games against eight defenses at your own pace.',
  card: { c: 'league' },
  alt: 'League Mode',
})

/** The setup card's three cards a format. Ids must be in the pool, or they're skipped. */
const HANDS = {
  weekly: ['wr-puka-nacua-2023', 'wr-ceedee-lamb-2023-immortal', 'wr-justin-jefferson-2022'],
  season: ['rb-derrick-henry-2020', 'qb-josh-allen-2020', 'te-brock-bowers-2024'],
}
const hand = (ids: string[]) => ids.flatMap((id) => playerById(id) ?? []) as Player[]

function where(l: LeagueCard): string {
  if (l.phase === 'pregame') return `${l.members} of ${l.maxPlayers} teams`
  if (l.phase === 'regular') return `Week ${l.week} of ${REGULAR_WEEKS}`
  return PHASE_LABEL[l.phase]
}

const SEASON_PHASE = { pregame: 'Taking teams', regular: 'Regular season', playoffs: 'Playoffs', complete: 'Final' } as const

function seasonWhere(s: SeasonCard): string {
  if (s.phase === 'pregame') return `${s.teams} teams so far`
  if (s.phase === 'regular') return `${s.played} of 8 played · ${s.wins}-${s.losses}`
  return `${s.wins}-${s.losses} · ${SEASON_PHASE[s.phase]}`
}

export default async function LeagueLobbyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const mobile = (await getViewMode()) === 'mobile'
  const who = await seasonViewer(user?.id ?? null)
  const [mine, open, seasons, openS] = await Promise.all([
    user ? myLeagues(user.id) : [],
    openLeagues(user?.id ?? null),
    mySeasons(who),
    openSeasons(user?.id ?? null),
  ])

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()}>
      <PeChrome
        active="league"
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/"
        backLabel="Pack Empire"
        kicker="Pack Empire"
        title="League"
        titleEm="Mode"
      />

      <div className="pe-wrap pe-wrap--narrow" style={{ margin: '0 auto' }}>
        <div className="pe-table-head">
          <div className="pe-kicker">Mode IV · a season</div>
          <h1 className="pe-table-title">
            Two ways, <span className="pe-em">one champion.</span>
          </h1>
          <p className="pe-table-sub">
            Weekly is a pack draft every week with keepers. Season is one Draft Day, then eight games against eight defenses, played whenever you like. Season works solo against the CPU, no account needed.
          </p>
        </div>

        {(seasons.length > 0 || mine.length > 0) && (
          <section className="pe-sec" style={{ marginTop: '1rem' }}>
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Yours</span>
              <span className="pe-sec-title">Your Leagues</span>
            </div>
            <div className="pe-row-list">
              {seasons.map((s) => (
                <Link key={s.id} href={`/games/pack-empire/league/season/${s.id}/`} className="pe-row">
                  <span style={{ minWidth: 0 }}>
                    <span className="pe-row-name">{s.name}</span>
                    <span className="pe-row-sub">
                      {s.kind === 'solo' ? 'Solo Season' : 'Season'} · {seasonWhere(s)}
                      {s.owner && s.kind === 'league' ? ' · Commissioner' : ''}
                    </span>
                  </span>
                  <span className="pe-row-side">{SEASON_PHASE[s.phase]}</span>
                </Link>
              ))}
              {mine.map((l) => (
                <Link key={l.id} href={`/games/pack-empire/league/${l.id}/`} className="pe-row">
                  <span style={{ minWidth: 0 }}>
                    <span className="pe-row-name">{l.name}</span>
                    <span className="pe-row-sub">
                      Weekly · Season {l.season} · {where(l)}
                      {l.commissioner ? ' · Commissioner' : ''}
                    </span>
                  </span>
                  <span className="pe-row-side">{PHASE_LABEL[l.phase]}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <LeagueSetup signedIn={!!user} hands={{ weekly: hand(HANDS.weekly), season: hand(HANDS.season) }} />

        {user && (
          <div className="pe-sec">
            <JoinAnyCode />
          </div>
        )}

        {(open.length > 0 || openS.length > 0) && (
          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Open</span>
              <span className="pe-sec-title">Taking Teams</span>
            </div>
            <div className="pe-row-list">
              {openS.map((s) => (
                <Link key={s.id} href={`/games/pack-empire/league/season/${s.id}/`} className="pe-row">
                  <span style={{ minWidth: 0 }}>
                    <span className="pe-row-name">{s.name}</span>
                    <span className="pe-row-sub">Season · {s.teams} teams so far</span>
                  </span>
                  <span className="pe-row-side">View</span>
                </Link>
              ))}
              {open.map((l) => (
                <div key={l.id} className="pe-row">
                  <span style={{ minWidth: 0 }}>
                    <span className="pe-row-name">{l.name}</span>
                    <span className="pe-row-sub">Weekly · {where(l)}</span>
                  </span>
                  <span className="pe-row-side">
                    {user ? <JoinPublic id={l.id} /> : <Link className="pe-link" href={`/games/pack-empire/league/${l.id}/`}>View</Link>}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <HowItWorks mobile={mobile} num="§ The rules" title="How Each One Runs">
          <div className="pe-rules">
            <div className="pe-rule">
              <span>
                <b>Season, Draft Day:</b> put your Franchise Pack on any slot (the best pack you&apos;ll open), open a pack for every slot, then three wild packs for your bench.
              </span>
            </div>
            <div className="pe-rule">
              <span>
                <b>Season, the games:</b> eight defenses, each with points to beat. Every card plays to its type: a Deep Threat, a Bell Cow, a Road Grader. Each front shuts some of that down and gives up the rest, and a scouting report before every game says which.
              </span>
            </div>
            <div className="pe-rule">
              <span>
                <b>Season, the bench:</b> every game pays a pack, better for a win, better again for a big one. Its card goes to your bench and subs in at his position whenever you like.
              </span>
            </div>
            <div className="pe-rule">
              <span>
                <b>Season, your own pace:</b> play all eight at once if you like. Once every team has played eight, the playoffs: the best records, byes on top, both teams in a game facing the same elite defense.
              </span>
            </div>
            <div className="pe-rule">
              <span>
                <b>Weekly:</b> draft your eleven every week, keep one player for the next {LOCK_WEEKS} weeks, and chase the Standings Packs that come with finishing high. After eight weeks, a Gauntlet, then the Final.
              </span>
            </div>
          </div>
        </HowItWorks>
      </div>

      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
