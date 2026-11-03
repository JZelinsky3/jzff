import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { teamView } from '@/lib/packEmpire/league'
import { weekScore } from '@/lib/packEmpire/leagueWeek'
import {
  PACK_TIER_COLOR,
  PACK_TIER_LABEL,
  PHASE_LABEL,
  RARITY_LOOK,
  SLOTS,
  tierFor,
  type LeaguePhase,
  type Player,
} from '@/lib/packEmpire/rules'
import mobileStyles from '../../../../../mobile.module.css'
import { LineupSheet } from '../../../../cards'
import { PeChrome } from '../../../../chrome'
import { peFonts } from '../../../../fonts'
import { DraftReport } from '../../../../report'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = {
  title: 'Team · Pack Empire League',
  robots: { index: false, follow: false },
}

function signed(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}`
}

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
}

export default async function LeagueTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; memberId: string }>
  searchParams: Promise<{ w?: string }>
}) {
  const { id: raw, memberId } = await params
  const { w } = await searchParams
  const id = raw.toUpperCase()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!/^[0-9a-f-]{36}$/.test(memberId)) notFound()
  const view = await teamView(id, memberId, user?.id ?? null, typeof w === 'string' ? w : null)
  if (!view) notFound()
  const mobile = (await getViewMode()) === 'mobile'

  const d = view.draft
  const title = view.member.team ?? view.member.name
  const weekLabel = d ? (d.phase === 'regular' ? `Week ${d.week}` : PHASE_LABEL[d.phase as LeaguePhase]) : null
  const base = `/games/pack-empire/league/${id}/team/${memberId}/`
  const best = view.season.reduce<number | null>((m, x) => (m == null || x.score > m ? x.score : m), null)
  const wins = view.season.filter((x) => x.rank === 1).length

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
      <div className="pe-wrap">
        <div className="pe-table-head">
          <div className="pe-kicker">
            ★ {view.member.cpu ? 'CPU' : view.member.team ? view.member.name : 'Team'}
            {view.member.titles > 0 ? ` · ${view.member.titles} title${view.member.titles === 1 ? '' : 's'}` : ''} ★
          </div>
          <h1 className="pe-table-title">{title}</h1>
          {view.season.length > 0 && best != null && (
            <p className="pe-table-sub">
              {view.season.length} week{view.season.length === 1 ? '' : 's'} on show · best {best.toLocaleString()}
              {wins ? ` · won ${wins} week${wins === 1 ? '' : 's'}` : ''}
            </p>
          )}
        </div>

        {view.season.length > 1 && (
          <nav className="pe-lt-tabs" aria-label="Weeks">
            {[...view.season].reverse().map((x) => (
              <Link key={x.key} href={`${base}?w=${x.key}`} className={d?.key === x.key ? 'on' : ''} scroll={false}>
                {x.key.startsWith('regular') ? x.label.replace('Week ', 'Wk ') : x.label.replace('The ', '')}
              </Link>
            ))}
          </nav>
        )}

        {d ? (
          (() => {
            const lineup = d.lineup.filter((p): p is Player => !!p)
            // Drafts from before the rebuild have no twist and count soft chemistry:
            // their stored numbers are the ones to show.
            const scored = d.ruleId ? weekScore(d.lineup, d.packSlot, d.ruleId) : null
            const cards = scored?.cards ?? d.draftScore
            const twist = scored?.ruleDelta ?? 0
            return (
              <div className="pe-draft">
                <div className="pe-recap landed" style={{ '--tc': tierFor(d.finalScore).color } as React.CSSProperties}>
                  <div className="pe-kicker">
                    § {weekLabel}
                    {d.rule ? ` · ${d.rule.title}` : ''}
                    {d.early ? ' · In, before the close' : ''}
                  </div>
                  <div className="pe-recap-tier">{tierFor(d.finalScore).label}</div>
                  <div className="pe-recap-score">{d.finalScore.toLocaleString()}</div>
                  <div className="pe-daily-sum">
                    <span>
                      <b>{cards.toLocaleString()}</b> Cards
                    </span>
                    {twist !== 0 && (
                      <span>
                        <b>{signed(twist)}</b> Twist
                      </span>
                    )}
                    <span>
                      <b>{signed(d.chemistry.total)}</b> Chemistry
                    </span>
                  </div>
                  {d.packSlot != null && d.packSlot >= 0 && (
                    <p className="pe-recap-post">
                      <span style={{ color: PACK_TIER_COLOR[d.tier] }}>{PACK_TIER_LABEL[d.tier]}</span> at {SLOTS[d.packSlot].short}
                    </p>
                  )}
                </div>
                <DraftReport
                  lineup={lineup}
                  chem={d.chemistry}
                  captain={null}
                  counted={{ cards, rule: twist !== 0 ? twist : null, total: d.finalScore }}
                  sheet={<LineupSheet name={weekLabel ?? 'Lineup'} lineup={d.lineup} total={d.finalScore} counted={scored?.counted} />}
                />
              </div>
            )
          })()
        ) : (
          <p className="pe-empty">
            {view.member.you
              ? 'No lineup yet this season.'
              : 'Nothing to show yet. A lineup opens once the week closes, or as soon as your own lineup is in.'}
          </p>
        )}

        {view.season.length > 0 && (
          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Season</span>
              <span className="pe-sec-title">Week by Week</span>
              <span className="pe-sec-meta">Tap a week to see the lineup</span>
            </div>
            <div className="pe-tw">
              {view.season.map((x) => (
                <Link key={x.key} href={`${base}?w=${x.key}`} className={`pe-tw-row${d?.key === x.key ? ' on' : ''}`} scroll={false}>
                  <span className="pe-tw-week">{x.label}</span>
                  <span className="pe-tw-mid">
                    <span className="pe-tw-rule">{x.rule ?? 'Plain week'}</span>
                    <span className="pe-tw-sub">
                      <span style={{ color: PACK_TIER_COLOR[x.tier] }}>{PACK_TIER_LABEL[x.tier]}</span>
                      {x.packSlot != null && x.packSlot >= 0 ? ` at ${SLOTS[x.packSlot].short}` : ''}
                      {x.mulligan ? ' · Mulligan' : ''}
                      {x.locked ? ` · Locked ${x.locked}` : ''}
                    </span>
                  </span>
                  <span className="pe-tw-rank">{x.rank != null ? (x.rank === 1 ? '★ 1st' : `${ordinal(x.rank)} of ${x.of}`) : 'In'}</span>
                  <span className="pe-tw-score">{x.score.toLocaleString()}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {view.locks.length > 0 && (
          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Locked</span>
              <span className="pe-sec-title">Keepers</span>
              <span className="pe-sec-meta">{view.locks.length} holding a slot</span>
            </div>
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
                        {l.until ? ` · through week ${l.until}` : ''}
                      </span>
                    </span>
                    <span className="pe-row-side">{p.score.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <div className="pe-recap-actions" style={{ marginTop: '2rem' }}>
          <Link href={`/games/pack-empire/league/${id}/`} className="pe-act">
            Back to {view.league.name}
          </Link>
        </div>
      </div>
      {!mobile && <SiteFooter />}
    </main>
  )
}
