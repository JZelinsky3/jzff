// /games/pack-empire/league/season/<id>/game/?t=<team>&p=regular|playoffs&w=<n>
//
// One Season game, whole: every drive and every man's line. Anyone with the
// league's link can read any of its games.

import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { seasonGame } from '@/lib/packEmpire/season'
import type { BoxLine, Drive } from '@/lib/packEmpire/seasonSim'
import { SLOTS } from '@/lib/packEmpire/rules'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../../../mobile.module.css'
import { PeChrome, PeDock } from '../../../../chrome'
import { peFonts } from '../../../../fonts'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'Box Score · Pack Empire Season', robots: { index: false, follow: false } }

const END: Record<Drive['end'], string> = { td: 'Touchdown', fg: 'Field goal', miss: 'Missed field goal', punt: 'Punt', turnover: 'Turnover' }

function cells(b: BoxLine): string {
  if (b.grade != null) return `Grade ${b.grade}`
  const parts: string[] = []
  if (b.passYds) parts.push(`${b.passYds} pass yds, ${b.passTd ?? 0} TD${b.int ? `, ${b.int} INT` : ''}`)
  if (b.rushYds) parts.push(`${b.car ?? 0} car, ${b.rushYds} yds${b.rushTd ? `, ${b.rushTd} TD` : ''}`)
  if (b.recYds) parts.push(`${b.rec ?? 0} rec, ${b.recYds} yds${b.recTd ? `, ${b.recTd} TD` : ''}`)
  if (b.fum) parts.push(`${b.fum} fumble`)
  return parts.join(' · ') || 'Quiet day'
}

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
        <div className="pe-table-head">
          <div className="pe-kicker">
            {g.phase === 'regular' ? `Game ${g.week}` : `Playoffs · Round ${g.week}`} · {got.defense}
          </div>
          <h1 className="pe-table-title">
            {g.points} <span className="pe-em">{got.line != null ? `to beat ${got.line}` : 'points'}</span>
          </h1>
          <p className="pe-table-sub">
            {r.yards} yards: {r.rushYds} on the ground, {r.passYds} through the air. {r.sacks} {r.sacks === 1 ? 'sack' : 'sacks'} allowed. Projected {r.expected}.
          </p>
        </div>

        <div className="pe-sn">
          <section className="pe-sec pe-sn-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Drives</span>
              <span className="pe-sec-title">Eleven Possessions</span>
            </div>
            <ol className="pe-sn-drivelist">
              {r.drives.map((d, i) => {
                const by = d.by ? r.box.find((b) => b.id === d.by)?.name : null
                return (
                  <li key={i} data-end={d.end}>
                    <span>{i + 1}</span>
                    <b>{END[d.end]}</b>
                    <small>
                      {d.yards} yds{by ? ` · ${by}` : ''}
                    </small>
                    <em>{d.points ? `+${d.points}` : ''}</em>
                  </li>
                )
              })}
            </ol>
          </section>

          <section className="pe-sec pe-sn-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Box</span>
              <span className="pe-sec-title">Every Man</span>
            </div>
            <div className="pe-sn-book">
              {r.box.map((b) => (
                <div key={b.id} className="pe-sn-bookrow">
                  <span className="pe-sn-slot">{SLOTS[b.slot]?.short ?? b.pos}</span>
                  <span className="pe-sn-who">
                    <b>{b.name}</b>
                    <small>{cells(b)}</small>
                  </span>
                  <span className="pe-sn-pts">{b.pts}</span>
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
