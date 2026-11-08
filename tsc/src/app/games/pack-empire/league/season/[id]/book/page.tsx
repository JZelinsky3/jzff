// /games/pack-empire/league/season/<id>/book
//
// The Stat Book: the awards once the regular season's done, your men by
// position with points a game up front (standard PPR, so it adds up the way any
// fantasy app does), your eight games, and the league's leaders. In the regular
// season the leaders only count everyone's games up to yours, like the table.

import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { RARITY_LOOK } from '@/lib/packEmpire/rules'
import { seasonView, statOf, type SeasonLine } from '@/lib/packEmpire/season'
import { seasonViewer } from '@/lib/packEmpire/seasonWho'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../../../mobile.module.css'
import { Face } from '../../../../cards'
import { PeChrome, PeDock } from '../../../../chrome'
import { peFonts } from '../../../../fonts'
import { gameHref } from '../../api'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'Stat Book · Pack Empire Season', robots: { index: false, follow: false } }

/** Three columns down the page: the backfield, the receivers, then tight ends and the line. */
const GROUPS: { title: string; pos: SeasonLine['pos'][] }[][] = [
  [
    { title: 'Quarterbacks', pos: ['QB'] },
    { title: 'Running Backs', pos: ['RB'] },
  ],
  [{ title: 'Wide Receivers', pos: ['WR'] }],
  [
    { title: 'Tight Ends', pos: ['TE'] },
    { title: 'Offensive Line', pos: ['OT', 'OG', 'C'] },
  ],
]

const n = (x: number) => x.toLocaleString()

/** The two or three numbers that say how his season went, by position. */
function chips(l: SeasonLine): string[] {
  if (l.grade != null) return [`Grade ${l.grade}`]
  const td = l.rushTd + l.recTd
  if (l.pos === 'QB') return [`${n(l.passYds)} yds`, `${l.passTd} TD`, `${l.int} INT`, ...(l.rushYds >= 20 ? [`${n(l.rushYds)} rush`] : [])]
  if (l.pos === 'RB') return [`${n(l.rushYds)} rush yds`, `${n(l.recYds)} rec yds`, `${td} TD`]
  return [`${l.rec} rec`, `${n(l.recYds)} yds`, `${td} TD`]
}

const face = (l: SeasonLine) => ({ id: l.id, img: l.img ?? null, rarity: l.rarity })

function Man({ l }: { l: SeasonLine }) {
  const line = l.grade != null
  return (
    <li className="pe-sb-man" style={{ '--rc': RARITY_LOOK[l.rarity].color } as React.CSSProperties}>
      <Face player={face(l)} name={l.name} />
      <span className="pe-sb-who">
        <b>{l.name}</b>
        <small>
          {l.tag} · {l.games} {l.games === 1 ? 'game' : 'games'}
        </small>
      </span>
      <span className="pe-sb-big">
        <b>{line ? l.grade : l.ppg.toFixed(1)}</b>
        <small>{line ? 'Grade' : 'PPG'}</small>
      </span>
      <span className="pe-sb-chips">
        {chips(l).map((c) => (
          <i key={c}>{c}</i>
        ))}
        {!line && <i className="pe-sb-tot">{n(l.pts)} pts</i>}
      </span>
    </li>
  )
}

const LEADER_UNIT: Record<string, string> = { pts: 'pts', ppg: 'a game', td: 'TD', passYds: 'yds', rushYds: 'yds', recYds: 'yds' }

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
  const regular = me?.games.filter((g) => g.phase === 'regular') ?? []
  const playoffs = me?.games.filter((g) => g.phase === 'playoffs') ?? []

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
      <div className="pe-wrap pe-wrap--season" style={{ margin: '0 auto' }}>
        <header className="pe-sb-hero">
          <div className="pe-kicker">{l.name}</div>
          <h1>
            Stat <em>Book.</em>
          </h1>
          <p>
            {me ? `${me.teamName}. ` : ''}
            Points are standard PPR: a point a catch, one per 10 yards rushing or receiving, one per 25 passing, 6 a touchdown, 4 a passing one.
            {view.through != null ? ` The league counts through your game ${view.through}.` : ''}
          </p>
        </header>

        {view.awards.length > 0 && (
          <section className="pe-sb-sec">
            <h2 className="pe-sb-h">The Awards</h2>
            <div className="pe-sb-awards">
              {view.awards.map((a) => (
                <article key={a.title} className="pe-sb-award" data-low={a.title === 'Least Valuable' ? 'true' : undefined}>
                  <small>{a.title}</small>
                  {a.who ? <Face player={face(a.who)} name={a.who.name} /> : <span className="pe-sb-award-mark">OL</span>}
                  <b>{a.who ? a.who.name : a.team}</b>
                  <em>
                    {a.who ? `${a.team} · ` : ''}
                    {a.line}
                  </em>
                </article>
              ))}
            </div>
          </section>
        )}

        {me && me.book.length > 0 && (
          <section className="pe-sb-sec">
            <h2 className="pe-sb-h">Your Team</h2>
            <div className="pe-sb-cols">
              {GROUPS.map((col, i) => (
                <div key={i} className="pe-sb-col">
                  {col.map((g) => {
                    const men = me.book.filter((b) => g.pos.includes(b.pos)).sort((a, b) => (b.grade ?? b.ppg) - (a.grade ?? a.ppg))
                    if (!men.length) return null
                    return (
                      <div key={g.title} className="pe-sb-group">
                        <h3>{g.title}</h3>
                        <ol>
                          {men.map((m) => (
                            <Man key={m.id} l={m} />
                          ))}
                        </ol>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </section>
        )}

        {me && me.games.length > 0 && (
          <section className="pe-sb-sec">
            <h2 className="pe-sb-h">Your Games</h2>
            <ol className="pe-sb-games">
              {[...regular, ...playoffs].map((g) => (
                <li key={`${g.phase}${g.week}`} data-won={g.won == null ? undefined : String(g.won)}>
                  <Link href={gameHref(l.id, me.id, g.phase, g.week)}>
                    <small>{g.phase === 'regular' ? `Game ${g.week}` : `Playoffs ${g.week}`}</small>
                    <b>{g.points}</b>
                    <em>{g.won == null ? 'Played' : g.won ? 'Win' : 'Loss'}</em>
                    <span>{g.line != null ? `${g.line} to win` : g.opponent ? `vs ${g.opponent}` : ''}</span>
                    <span>{g.defense}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="pe-sb-sec">
          <h2 className="pe-sb-h">League Leaders</h2>
          <div className="pe-sb-leaders">
            {view.leaders.map((x) => {
              const [top, ...rest] = x.rows
              return (
                <article key={x.title} className="pe-sb-board">
                  <h3>{x.title}</h3>
                  {!top ? (
                    <p className="pe-note">No games yet.</p>
                  ) : (
                    <>
                      <div className={`pe-sb-lead${top.teamId === me?.id ? ' mine' : ''}`} style={{ '--rc': RARITY_LOOK[top.rarity].color } as React.CSSProperties}>
                        <Face player={face(top)} name={top.name} />
                        <span>
                          <b>{top.name}</b>
                          <small>{top.team}</small>
                        </span>
                        <strong>
                          {x.stat === 'ppg' ? top.ppg.toFixed(1) : n(statOf(top, x.stat))}
                          <small>{LEADER_UNIT[x.stat]}</small>
                        </strong>
                      </div>
                      <ol>
                        {rest.map((r, k) => (
                          <li key={`${r.teamId}${r.id}`} className={r.teamId === me?.id ? 'mine' : undefined}>
                            <i>{k + 2}</i>
                            <span>
                              <b>{r.name}</b>
                              <small>{r.team}</small>
                            </span>
                            <em>{x.stat === 'ppg' ? r.ppg.toFixed(1) : n(statOf(r, x.stat))}</em>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      </div>
      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
