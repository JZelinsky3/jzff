// /games/pack-empire/league/season/<id>/game/?t=<team>&p=regular|playoffs&w=<n>
//
// One Season game, whole: the score against the line, every drive, and every
// man's line with his standard PPR points. Anyone with the league's link can
// read any of its games.

import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { playerById } from '@/lib/packEmpire/pool'
import { RARITY_LOOK, SLOTS } from '@/lib/packEmpire/rules'
import { seasonGame } from '@/lib/packEmpire/season'
import type { BoxLine, Drive } from '@/lib/packEmpire/seasonSim'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../../../mobile.module.css'
import { Face } from '../../../../cards'
import { PeChrome, PeDock } from '../../../../chrome'
import { peFonts } from '../../../../fonts'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'Box Score · Pack Empire Season', robots: { index: false, follow: false } }

const END: Record<Drive['end'], string> = { td: 'Touchdown', fg: 'Field Goal', miss: 'Missed FG', punt: 'Punt', turnover: 'Turnover' }

function cells(b: BoxLine): string {
  const parts: string[] = []
  if (b.passYds) parts.push(`${b.passYds} pass yds, ${b.passTd ?? 0} TD${b.int ? `, ${b.int} INT` : ''}`)
  if (b.rushYds) parts.push(`${b.car ?? 0} car, ${b.rushYds} yds${b.rushTd ? `, ${b.rushTd} TD` : ''}`)
  if (b.recYds) parts.push(`${b.rec ?? 0} rec, ${b.recYds} yds${b.recTd ? `, ${b.recTd} TD` : ''}`)
  if (b.fum) parts.push(`${b.fum} fumble lost`)
  return parts.join(' · ') || 'A quiet day'
}

const SKILL_ORDER = ['QB', 'RB', 'WR', 'TE']

export default async function SeasonGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string; p?: string; w?: string }>
}) {
  const { id } = await params
  const { t, p, w } = await searchParams
  const got = await seasonGame(id.toUpperCase(), t, p, w)
  if (!got) notFound()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const mobile = (await getViewMode()) === 'mobile'
  const g = got.game
  const r = g.result
  const won = g.phase === 'regular' ? g.won : null
  const skill = r.box.filter((b) => b.grade == null).sort((a, b) => SKILL_ORDER.indexOf(a.pos) - SKILL_ORDER.indexOf(b.pos) || b.pts - a.pts)
  const line = r.box.filter((b) => b.grade != null)
  const nameOf = (bid?: string) => (bid ? (r.box.find((b) => b.id === bid)?.name ?? null) : null)

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()}>
      <PeChrome
        active="league"
        mobile={mobile}
        signedIn={!!user}
        back={`/games/pack-empire/league/season/${id.toUpperCase()}/`}
        backLabel="Season"
        kicker="Box Score"
        title={got.team}
      />
      <div className="pe-wrap pe-wrap--narrow" style={{ margin: '0 auto' }}>
        <section className="pe-sn-gd-last pe-bx-hero" data-won={won == null ? undefined : String(won)}>
          <div className="pe-sn-gd-kick">
            <span>
              {g.phase === 'regular' ? `Game ${g.week}` : `Playoffs · Round ${g.week}`} · {got.defense}
            </span>
            {won != null && <b className="pe-sn-gd-stamp">{won ? 'Win' : 'Loss'}</b>}
          </div>
          <h1 className="pe-bx-team">{got.team}</h1>
          <div className="pe-sn-gd-board">
            <div className="pe-sn-gd-score">
              <b>{g.points}</b>
              <small>Points</small>
            </div>
            <div className="pe-sn-gd-vs">{got.line != null ? (won ? 'beat' : 'missed') : 'scored'}</div>
            <div className="pe-sn-gd-score pe-sn-gd-score--line">
              <b>{got.line ?? r.yards}</b>
              <small>{got.line != null ? 'To win' : 'Yards'}</small>
            </div>
          </div>
          <p className="pe-bx-sub">
            {r.yards} yards: {r.rushYds} on the ground, {r.passYds} through the air. {r.sacks} {r.sacks === 1 ? 'sack' : 'sacks'} allowed. Projected {Math.round(r.expected)}.
          </p>
        </section>

        <div className="pe-sn">
          <section className="pe-sn-block">
            <div className="pe-sn-blockhead">
              <h2>The Drives</h2>
              <small>{r.drives.length} possessions</small>
            </div>
            <ol className="pe-bx-drives">
              {r.drives.map((d, i) => (
                <li key={i} data-end={d.end}>
                  <span>{i + 1}</span>
                  <b>{END[d.end]}</b>
                  <i>
                    <em style={{ transform: `scaleX(${Math.min(1, d.yards / 80)})` }} />
                  </i>
                  <small>
                    {d.yards} yds{nameOf(d.by) ? ` · ${nameOf(d.by)}` : ''}
                  </small>
                  <strong>{d.points ? `+${d.points}` : ''}</strong>
                </li>
              ))}
            </ol>
          </section>

          <section className="pe-sn-block">
            <div className="pe-sn-blockhead">
              <h2>The Box</h2>
              <small>Standard PPR</small>
            </div>
            <ol className="pe-bx-box">
              {skill.map((b) => {
                const c = playerById(b.id)
                return (
                  <li key={b.id} style={{ '--rc': c ? RARITY_LOOK[c.rarity].color : undefined } as React.CSSProperties}>
                    <Face player={c ? { id: c.id, img: c.img, rarity: c.rarity } : null} name={b.name} />
                    <span>
                      <b>{b.name}</b>
                      <small>
                        {SLOTS[b.slot]?.short ?? b.pos} · {cells(b)}
                      </small>
                    </span>
                    <strong>
                      {b.pts}
                      <small>pts</small>
                    </strong>
                  </li>
                )
              })}
            </ol>
            <div className="pe-bx-line">
              {line.map((b) => (
                <span key={b.id}>
                  <small>{SLOTS[b.slot]?.short ?? b.pos}</small>
                  <b>{b.name.split(' ').slice(-1)[0]}</b>
                  <em>{b.grade}</em>
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
