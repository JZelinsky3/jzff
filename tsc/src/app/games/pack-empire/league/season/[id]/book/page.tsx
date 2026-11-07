// /games/pack-empire/league/season/<id>/book
//
// The Stat Book: your men's season lines off every box score, your game log,
// the league's leaders, and once the regular season is done, the awards.

import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { seasonView, type SeasonLine } from '@/lib/packEmpire/season'
import { seasonViewer } from '@/lib/packEmpire/seasonWho'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../../../mobile.module.css'
import { PeChrome, PeDock } from '../../../../chrome'
import { peFonts } from '../../../../fonts'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'Stat Book · Pack Empire Season', robots: { index: false, follow: false } }

function line(l: SeasonLine): string {
  if (l.grade != null) return `Grade ${l.grade}`
  const parts: string[] = []
  if (l.passYds) parts.push(`${l.passYds.toLocaleString()} pass yds, ${l.passTd} TD, ${l.int} INT`)
  if (l.rushYds) parts.push(`${l.rushYds.toLocaleString()} rush yds, ${l.rushTd} TD`)
  if (l.recYds) parts.push(`${l.rec} rec, ${l.recYds.toLocaleString()} yds, ${l.recTd} TD`)
  return parts.join(' · ') || 'Quiet season'
}

export default async function SeasonBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const view = await seasonView(id.toUpperCase(), await seasonViewer(user?.id ?? null))
  if (!view) notFound()
  const mobile = (await getViewMode()) === 'mobile'
  const l = view.league
  const me = view.me
  const gameHref = (team: string, phase: string, week: number) => `/games/pack-empire/league/season/${l.id}/game/?t=${team}&p=${phase}&w=${week}`

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()}>
      <PeChrome
        active="league"
        mobile={mobile}
        signedIn={!!user}
        back={`/games/pack-empire/league/season/${l.id}/`}
        backLabel={l.name}
        kicker="Season"
        title="Stat"
        titleEm="Book"
      />
      <div className="pe-wrap pe-wrap--narrow" style={{ margin: '0 auto' }}>
        <div className="pe-table-head">
          <div className="pe-kicker">{l.name}</div>
          <h1 className="pe-table-title">
            Stat <span className="pe-em">Book.</span>
          </h1>
        </div>

        <div className="pe-sn">
          {view.awards.length > 0 && (
            <section className="pe-sec pe-sn-sec">
              <div className="pe-sec-head">
                <span className="pe-sec-num">§ Awards</span>
                <span className="pe-sec-title">The Regular Season</span>
              </div>
              <div className="pe-sn-awards">
                {view.awards.map((a) => (
                  <div key={a.title} className="pe-sn-card pe-sn-award">
                    <div className="pe-kicker">{a.title}</div>
                    <b>{a.who ? a.who.name : a.team}</b>
                    <small>
                      {a.who ? `${a.team} · ` : ''}
                      {a.line}
                    </small>
                  </div>
                ))}
              </div>
            </section>
          )}

          {me && me.book.length > 0 && (
            <section className="pe-sec pe-sn-sec">
              <div className="pe-sec-head">
                <span className="pe-sec-num">§ Yours</span>
                <span className="pe-sec-title">{me.teamName}</span>
              </div>
              <div className="pe-sn-book">
                {me.book.map((b) => (
                  <div key={b.id} className="pe-sn-bookrow">
                    <span className="pe-sn-slot">{b.pos}</span>
                    <span className="pe-sn-who">
                      <b>{b.name}</b>
                      <small>
                        {b.games} {b.games === 1 ? 'game' : 'games'} · {line(b)}
                      </small>
                    </span>
                    <span className="pe-sn-pts">{b.pts.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {me && me.games.length > 0 && (
            <section className="pe-sec pe-sn-sec">
              <div className="pe-sec-head">
                <span className="pe-sec-num">§ Games</span>
                <span className="pe-sec-title">Game Log</span>
              </div>
              <ol className="pe-sn-sched">
                {me.games.map((g) => (
                  <li key={`${g.phase}${g.week}`} data-won={g.won == null ? undefined : String(g.won)}>
                    <span className="pe-sn-wk">{g.phase === 'regular' ? g.week : `P${g.week}`}</span>
                    <span className="pe-sn-front">
                      <b>{g.defense}</b>
                      <small>{g.line != null ? `Needed ${g.line}` : g.opponent ? `vs ${g.opponent}` : ''}</small>
                    </span>
                    <Link href={gameHref(me.id, g.phase, g.week)} className="pe-sn-need">
                      {g.points} · {g.won == null ? 'Box' : g.won ? 'W' : 'L'}
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="pe-sec pe-sn-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ League</span>
              <span className="pe-sec-title">Leaders</span>
            </div>
            <div className="pe-sn-leaders">
              {view.leaders.map((x) => (
                <div key={x.title} className="pe-sn-card">
                  <div className="pe-kicker">{x.title}</div>
                  {x.rows.length === 0 ? (
                    <p className="pe-note">No games yet.</p>
                  ) : (
                    <ol className="pe-sn-lead">
                      {x.rows.map((r) => (
                        <li key={`${r.teamId}${r.id}`}>
                          <span>
                            <b>{r.name}</b>
                            <small>{r.team}</small>
                          </span>
                          <em>{Number(r[x.stat]).toLocaleString()}</em>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
