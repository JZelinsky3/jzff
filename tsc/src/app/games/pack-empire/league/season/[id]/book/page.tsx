// /games/pack-empire/league/season/<id>/book
//
// The Stat Book: the awards once the regular season's done, your men by
// position with points a game up front (standard PPR, so it adds up the way any
// fantasy app does), your eight games, and the league's leaders. In the regular
// season the leaders only count everyone's games up to yours, like the table.
// Once the playoffs start the book splits (?part=playoffs): the regular season
// locks after game eight and the playoffs keep their own.
//
// Your team reads like a depth chart (Joey, 2026-11-07): the backfield, the
// receivers and the tight ends in three columns, then the line as a row of five,
// LT to RT, each starter with his backups under him.

import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { RARITY_LOOK, SLOTS, type Player } from '@/lib/packEmpire/rules'
import { seasonView, statOf, type MySeason, type SeasonLine } from '@/lib/packEmpire/season'
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

/** Three columns down the page: the backfield, the receivers, the tight ends. */
const COLUMNS: { title: string; pos: SeasonLine['pos'] }[][] = [
  [
    { title: 'Quarterbacks', pos: 'QB' },
    { title: 'Running Backs', pos: 'RB' },
  ],
  [{ title: 'Wide Receivers', pos: 'WR' }],
  [{ title: 'Tight Ends', pos: 'TE' }],
]

/** The line, left to right, by slot. */
const LINE_SLOTS = [6, 7, 8, 9, 10]

/** A man's line, or an empty one for a bench card who hasn't played. */
function lineFor(p: Player, book: SeasonLine[], me: MySeason): SeasonLine {
  return (
    book.find((l) => l.id === p.id) ?? {
      id: p.id,
      name: p.name,
      pos: p.pos,
      rarity: p.rarity,
      img: p.img ?? undefined,
      year: p.year,
      tag: me.styles[p.id]?.tag ?? 'Anchor',
      teamId: me.id,
      team: me.teamName,
      games: 0,
      passYds: 0,
      passTd: 0,
      int: 0,
      rushYds: 0,
      rushTd: 0,
      rec: 0,
      recYds: 0,
      recTd: 0,
      fum: 0,
      grade: null,
      pts: 0,
      ppg: 0,
      value: p.score,
    }
  )
}

/** A position's depth chart: the starters in slot order, then everyone else who
    played there or sits on the bench, best first. */
function depth(pos: SeasonLine['pos'], book: SeasonLine[], me: MySeason): { starters: SeasonLine[]; backups: SeasonLine[] } {
  const starterIds = SLOTS.flatMap((s, i) => (s.pool === pos && me.lineup[i] ? [me.lineup[i]!.id] : []))
  const starters = starterIds.flatMap((id) => {
    const p = me.lineup.find((x) => x?.id === id)
    return p ? [lineFor(p, book, me)] : []
  })
  const others = [...book.filter((l) => l.pos === pos && !starterIds.includes(l.id)), ...me.bench.filter((p) => p.pos === pos && !book.some((l) => l.id === p.id)).map((p) => lineFor(p, book, me))]
  return { starters, backups: others.sort((a, b) => (b.grade ?? b.ppg) - (a.grade ?? a.ppg)) }
}

const n = (x: number) => x.toLocaleString()

/** The two or three numbers that say how his season went, by position. */
function chips(l: SeasonLine): string[] {
  if (l.games === 0) return ['Yet to play']
  if (l.grade != null) return [`Grade ${l.grade}`]
  const td = l.rushTd + l.recTd
  if (l.pos === 'QB') return [`${n(l.passYds)} yds`, `${l.passTd} TD`, `${l.int} INT`, ...(l.rushYds >= 20 ? [`${n(l.rushYds)} rush`] : [])]
  if (l.pos === 'RB') return [`${n(l.rushYds)} rush yds`, `${n(l.recYds)} rec yds`, `${td} TD`]
  return [`${l.rec} rec`, `${n(l.recYds)} yds`, `${td} TD`]
}

const face = (l: SeasonLine) => ({ id: l.id, img: l.img ?? null, rarity: l.rarity })

function Man({ l, backup = false }: { l: SeasonLine; backup?: boolean }) {
  const line = l.grade != null || l.pos === 'OT' || l.pos === 'OG' || l.pos === 'C'
  return (
    <li className="pe-sb-man" data-backup={backup ? 'true' : undefined} style={{ '--rc': RARITY_LOOK[l.rarity].color } as React.CSSProperties}>
      <Face player={face(l)} name={l.name} />
      <span className="pe-sb-who">
        <b>{l.name}</b>
        <small>
          {backup ? 'Bench · ' : ''}
          {l.tag} · {l.games} {l.games === 1 ? 'game' : 'games'}
        </small>
      </span>
      <span className="pe-sb-big">
        <b>{line ? (l.grade ?? '–') : l.ppg.toFixed(1)}</b>
        <small>{line ? 'Grade' : 'PPG'}</small>
      </span>
      <span className="pe-sb-chips">
        {chips(l).map((c) => (
          <i key={c}>{c}</i>
        ))}
        {!line && l.games > 0 && <i className="pe-sb-tot">{n(l.pts)} pts</i>}
      </span>
    </li>
  )
}

const LEADER_UNIT: Record<string, string> = { pts: 'pts', ppg: 'a game', td: 'TD', passYds: 'yds', rushYds: 'yds', recYds: 'yds' }

export default async function SeasonBookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ part?: string }> }) {
  const { id } = await params
  const { part } = await searchParams
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
  const split = l.phase === 'playoffs' || l.phase === 'complete'
  const inPlayoffs = split && part === 'playoffs'
  const book = (inPlayoffs ? me?.bookPlayoffs : me?.book) ?? []
  const leaders = inPlayoffs ? view.playoffLeaders : view.leaders
  const href = (p: string | null) => `/games/pack-empire/league/season/${l.id}/book/${p ? `?part=${p}` : ''}`

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

        {split && (
          <nav className="pe-sb-parts" aria-label="Which part of the season">
            <a href={href(null)} aria-current={!inPlayoffs ? 'page' : undefined}>
              Regular Season
            </a>
            <a href={href('playoffs')} aria-current={inPlayoffs ? 'page' : undefined}>
              Playoffs
            </a>
          </nav>
        )}

        {me && me.step === 'season' && (
          <section className="pe-sb-sec">
            <h2 className="pe-sb-h">{inPlayoffs ? 'Your Team In The Playoffs' : 'Your Team'}</h2>
            <div className="pe-sb-cols">
              {COLUMNS.map((col, i) => (
                <div key={i} className="pe-sb-col">
                  {col.map((g) => {
                    const { starters, backups } = depth(g.pos, book, me)
                    if (!starters.length && !backups.length) return null
                    return (
                      <div key={g.title} className="pe-sb-group">
                        <h3>{g.title}</h3>
                        <ol>
                          {starters.map((m) => (
                            <Man key={m.id} l={m} />
                          ))}
                          {backups.map((m) => (
                            <Man key={m.id} l={m} backup />
                          ))}
                        </ol>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="pe-sb-group pe-sb-line">
              <h3>Offensive Line</h3>
              <div className="pe-sb-linecols">
                {(() => {
                  // Backups stand behind the spot they play: tackles split left and
                  // right, guards the same, centers behind the center.
                  const ot = depth('OT', book, me).backups
                  const og = depth('OG', book, me).backups
                  const c = depth('C', book, me).backups
                  const under: Record<number, SeasonLine[]> = { 6: ot.filter((_, k) => k % 2 === 0), 10: ot.filter((_, k) => k % 2 === 1), 7: og.filter((_, k) => k % 2 === 0), 9: og.filter((_, k) => k % 2 === 1), 8: c }
                  return LINE_SLOTS.map((slot) => {
                    const p = me.lineup[slot]
                    return (
                      <div key={slot} className="pe-sb-linecol">
                        <span className="pe-sb-slot">{SLOTS[slot].short}</span>
                        <ol>
                          {p && <Man l={lineFor(p, book, me)} />}
                          {under[slot].map((m) => (
                            <Man key={m.id} l={m} backup />
                          ))}
                        </ol>
                      </div>
                    )
                  })
                })()}
              </div>
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
          <h2 className="pe-sb-h">{inPlayoffs ? 'Playoff Leaders' : 'League Leaders'}</h2>
          <div className="pe-sb-leaders">
            {leaders.map((x) => {
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
