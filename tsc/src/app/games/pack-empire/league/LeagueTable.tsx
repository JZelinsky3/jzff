'use client'

// The league table. Four groups, left to right: who (rank, movement, team with
// its weeks-won star), this week (last week's score and finish, the Standings
// Pack that finish bought, where the team is with this week's draft), the
// season so far (a bar a week, best, average), and the total.
//
// Sorted two ways: the season table, or last week's finish, which is the order
// the Standings Packs went out in.

import Link from 'next/link'
import { Fragment, useState } from 'react'
import type { StandingRow } from '@/lib/packEmpire/league'
import { WEEK_STATUS_LABEL as STATUS_LABEL } from '@/lib/packEmpire/leagueWeek'
import { PACK_TIER_COLOR, PACK_TIER_LABEL, type LeaguePhase } from '@/lib/packEmpire/rules'

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
}

const k = (n: number) => n.toLocaleString()

function Move({ move }: { move: number | null }) {
  if (move == null || move === 0) return <span className="pe-lt-move">·</span>
  return (
    <span className={`pe-lt-move ${move > 0 ? 'up' : 'down'}`} title={`${move > 0 ? 'Up' : 'Down'} ${Math.abs(move)}`}>
      {move > 0 ? '▲' : '▼'}
      {Math.abs(move)}
    </span>
  )
}

/** A bar a week: its height the score, gold where it won the week. */
function Form({ s, top, now }: { s: StandingRow; top: number; now: number | null }) {
  return (
    <span className="pe-lt-form" aria-hidden>
      {s.weeks.map((w, i) => (
        <i
          key={i}
          className={w == null ? (now === i + 1 ? 'now' : 'none') : s.weekRanks[i] === 1 ? 'won' : ''}
          style={w == null ? undefined : { height: `${Math.max(14, Math.round((w / top) * 100))}%` }}
          title={w == null ? `Week ${i + 1}` : `Week ${i + 1}: ${k(w)}, ${ordinal(s.weekRanks[i] ?? 0)}`}
        />
      ))}
    </span>
  )
}

export function LeagueTable({
  leagueId,
  phase,
  week,
  playoffSpots,
  rows,
}: {
  leagueId: string
  phase: LeaguePhase
  week: number
  playoffSpots: number
  rows: StandingRow[]
}) {
  const post = phase === 'gauntlet' || phase === 'finals' || phase === 'complete'
  const live = phase === 'regular' || phase === 'gauntlet' || phase === 'finals'
  const hasLast = rows.some((s) => s.lastWeek != null)
  const [by, setBy] = useState<'season' | 'week'>('season')
  const sortWeek = by === 'week' && hasLast && !post

  const shown = sortWeek
    ? [...rows].sort((a, b) => (b.lastWeek ?? -1) - (a.lastWeek ?? -1) || b.total - a.total)
    : rows
  const top = Math.max(1, ...rows.flatMap((s) => s.weeks.filter((w): w is number => w != null)))
  const now = phase === 'regular' ? week : null
  const line = !post && !sortWeek && phase === 'regular' ? playoffSpots : 0
  const lastRank = (s: StandingRow) => {
    for (let i = s.weeks.length - 1; i >= 0; i--) if (s.weeks[i] != null) return s.weekRanks[i]
    return null
  }

  return (
    <div className="pe-lt-wrap">
      {hasLast && !post && (
        <div className="pe-lt-sort" role="tablist" aria-label="Sort the table">
          <button type="button" role="tab" aria-selected={!sortWeek} onClick={() => setBy('season')}>
            Season
          </button>
          <button type="button" role="tab" aria-selected={sortWeek} onClick={() => setBy('week')}>
            Last week · who got what pack
          </button>
        </div>
      )}
      <div className={`pe-lt${post ? ' post' : ''}${sortWeek ? ' by-week' : ''}`} role="table" aria-label="Standings">
        <div className="pe-lt-row pe-lt-head" role="row">
          <span>#</span>
          <span />
          <span>Team</span>
          <span className="pe-lt-g pe-lt-num pe-lt-last">{post ? 'Season' : 'Last week'}</span>
          <span className="pe-lt-hide">{live ? 'Pack' : ''}</span>
          <span className="pe-lt-c">{live ? 'This week' : ''}</span>
          <span className="pe-lt-g pe-lt-hide">Form</span>
          <span className="pe-lt-hide pe-lt-wide pe-lt-num">Best</span>
          <span className="pe-lt-hide pe-lt-wide pe-lt-num">Avg</span>
          <span className="pe-lt-g pe-lt-num">{post ? 'Playoff' : 'Total'}</span>
        </div>
        {shown.map((s, i) => {
          const out = post && !s.active
          const inField = phase === 'regular' || s.active
          const fin = lastRank(s)
          return (
            <Fragment key={s.memberId}>
              {line > 0 && i === line && (
                <div className="pe-lt-line" role="presentation">
                  <span>
                    Playoff line · top {line} reach the {playoffSpots >= 3 ? 'Gauntlet' : 'Final'}
                  </span>
                </div>
              )}
              <Link
                href={`/games/pack-empire/league/${leagueId}/team/${s.memberId}/`}
                role="row"
                data-rank={sortWeek ? (fin ?? 0) : i + 1}
                className={`pe-lt-row${s.you ? ' you' : ''}${out ? ' out' : ''}`}
              >
                <span className="pe-lt-rank">{sortWeek ? (fin ?? '·') : i + 1}</span>
                <Move move={post || sortWeek ? null : s.move} />
                <span className="pe-lt-who">
                  <span className="pe-lt-team">
                    <span className="pe-lt-name">{s.team ?? s.name}</span>
                    {s.wins > 0 && (
                      <em className="pe-lt-star" title={`Won ${s.wins} week${s.wins === 1 ? '' : 's'}`}>
                        ★ {s.wins}
                      </em>
                    )}
                    {s.cpu && <em className="pe-lt-cpu">CPU</em>}
                  </span>
                  <span className="pe-lt-sub">
                    {!s.cpu && s.team ? s.name : s.cpu ? 'CPU team' : 'Team'}
                    {phase === 'regular' && s.locks > 0 ? ` · ${s.locks} locked` : ''}
                    {live && inField && s.mulligans > 0 ? ` · ${s.mulligans === 2 ? 'Mulligan + redraft' : 'Mulligan'}` : ''}
                    {post && s.seed != null ? ` · Seed ${s.seed}` : ''}
                    {out && phase !== 'complete' ? ' · Out' : ''}
                  </span>
                  {/* On a phone the pack and status ride under the name. */}
                  {live && inField && (
                    <span className="pe-lt-mob">
                      <span style={{ color: PACK_TIER_COLOR[s.tier] }}>{PACK_TIER_LABEL[s.tier]}</span> · {STATUS_LABEL[s.status]}
                    </span>
                  )}
                </span>
                <span className="pe-lt-g pe-lt-num pe-lt-last">
                  {post ? (
                    k(s.total)
                  ) : s.lastWeek != null ? (
                    <>
                      <b>{k(s.lastWeek)}</b>
                      {fin != null && <small className={fin === 1 ? 'first' : ''}>{ordinal(fin)}</small>}
                    </>
                  ) : (
                    '·'
                  )}
                </span>
                <span className="pe-lt-hide">
                  {live && inField && (
                    <span className="pe-lt-pack" style={{ '--tc': PACK_TIER_COLOR[s.tier] } as React.CSSProperties}>
                      {PACK_TIER_LABEL[s.tier].replace(' Pack', '')}
                    </span>
                  )}
                </span>
                <span className="pe-lt-c">
                  {live && inField && (
                    <span className={`pe-lt-chip ${s.status}`} title={s.peek && !s.you ? 'Your lineup is in: open it' : undefined}>
                      {STATUS_LABEL[s.status]}
                      {s.peek && !s.you ? <i className="pe-lt-eye"> · See</i> : null}
                    </span>
                  )}
                </span>
                <span className="pe-lt-g pe-lt-hide">
                  <Form s={s} top={top} now={now} />
                </span>
                <span className="pe-lt-hide pe-lt-wide pe-lt-num">{s.best != null ? k(s.best) : '·'}</span>
                <span className="pe-lt-hide pe-lt-wide pe-lt-num">{s.avg != null ? k(s.avg) : '·'}</span>
                <span className="pe-lt-g pe-lt-num pe-lt-tot">
                  <b>{k(post ? s.playoff : s.total)}</b>
                  <small>{s.back > 0 ? `−${k(s.back)}` : i === 0 && !sortWeek ? 'Leads' : ''}</small>
                </span>
              </Link>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
