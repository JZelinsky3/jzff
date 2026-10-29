import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { myLeagues, openLeagues, type LeagueCard } from '@/lib/packEmpire/league'
import { PHASE_LABEL, REGULAR_WEEKS } from '@/lib/packEmpire/rules'
import mobileStyles from '../../mobile.module.css'
import { PeChrome } from '../chrome'
import { peFonts } from '../fonts'
import { CreateLeague, JoinByCode, JoinPublic } from './LeagueLobby'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = {
  title: 'League Mode · Pack Empire',
  description:
    'An eight-week season of weekly pack drafts with keepers, chemistry and boosted packs, then a Gauntlet and a Final.',
}

function where(l: LeagueCard): string {
  if (l.phase === 'pregame') return `${l.members} of ${l.maxPlayers} teams`
  if (l.phase === 'regular') return `Week ${l.week} of ${REGULAR_WEEKS}`
  return PHASE_LABEL[l.phase]
}

export default async function LeagueLobbyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const mobile = (await getViewMode()) === 'mobile'
  const [mine, open] = await Promise.all([user ? myLeagues(user.id) : [], openLeagues(user?.id ?? null)])

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.boardRoot : ''}`.trim()}>
      <PeChrome
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
          <div className="pe-kicker">★ Mode IV · a season ★</div>
          <h1 className="pe-table-title">
            Eight weeks, <span className="pe-em">one champion.</span>
          </h1>
          <p className="pe-table-sub">
            Draft every week, keep one player from each draft, and chase the boosted packs that come with
            winning the week. Then a Gauntlet, then a Final.
          </p>
        </div>

        {user ? (
          <>
            {mine.length > 0 && (
              <section className="pe-sec" style={{ marginTop: '1rem' }}>
                <div className="pe-sec-head">
                  <span className="pe-sec-num">§ Yours</span>
                  <span className="pe-sec-title">Your leagues</span>
                </div>
                <div className="pe-row-list">
                  {mine.map((l) => (
                    <Link key={l.id} href={`/games/pack-empire/league/${l.id}/`} className="pe-row">
                      <span style={{ minWidth: 0 }}>
                        <span className="pe-row-name">{l.name}</span>
                        <span className="pe-row-sub">
                          Season {l.season} · {where(l)}
                          {l.commissioner ? ' · Commissioner' : ''}
                        </span>
                      </span>
                      <span className="pe-row-side">{PHASE_LABEL[l.phase]}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <div className="pe-twoup pe-sec">
              <CreateLeague />
              <JoinByCode />
            </div>
          </>
        ) : (
          <div className="pe-panel" style={{ textAlign: 'center' }}>
            <p className="pe-panel-text" style={{ marginBottom: '1rem' }}>
              A season is eight weeks of coming back, so League Mode needs an account.
            </p>
            <Link href="/login?next=%2Fgames%2Fpack-empire%2Fleague%2F" className="pe-btn">
              Sign in to play
            </Link>
          </div>
        )}

        {open.length > 0 && (
          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Open</span>
              <span className="pe-sec-title">Taking teams</span>
            </div>
            <div className="pe-row-list">
              {open.map((l) => (
                <div key={l.id} className="pe-row">
                  <span style={{ minWidth: 0 }}>
                    <span className="pe-row-name">{l.name}</span>
                    <span className="pe-row-sub">{where(l)}</span>
                  </span>
                  <span className="pe-row-side">
                    {user ? <JoinPublic id={l.id} /> : <Link className="pe-link" href={`/games/pack-empire/league/${l.id}/`}>View</Link>}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="pe-sec">
          <div className="pe-sec-head">
            <span className="pe-sec-num">§ The rules</span>
            <span className="pe-sec-title">How a season runs</span>
          </div>
          <div className="pe-rules">
            <div className="pe-rule">
              <span>
                <b>Every week, draft your eleven:</b> a pack for every slot you haven&apos;t locked. Five cards a pack,
                keep one.
              </span>
            </div>
            <div className="pe-rule">
              <span>
                <b>Then lock one player for the season.</b> He fills his slot every week after, so your draft
                shrinks from eleven packs towards four.
              </span>
            </div>
            <div className="pe-rule">
              <span>
                <b>Chemistry counts.</b> Teammates who work together add points: a quarterback and his receiver, a
                center and his guards. Players from rival teams cost points.
              </span>
            </div>
            <div className="pe-rule">
              <span>
                <b>Win the week, open better packs.</b> The week&apos;s winner gets the Elite Drop, the top fifth a Prime
                Pack, the top half a Rising Pack, on a slot of their choosing.
              </span>
            </div>
            <div className="pe-rule">
              <span>
                <b>After eight weeks, the postseason.</b> One Gauntlet week halves the field, then the Final. The best
                postseason total takes the title.
              </span>
            </div>
          </div>
        </section>
      </div>

      {!mobile && <SiteFooter />}
    </main>
  )
}
