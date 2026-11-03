// The league page's pieces, all rendered on the server: the table, the week
// just closed, the season's schedule, this week's board, and the champions.

import Link from 'next/link'
import { Fragment } from 'react'
import type { LeagueView, StandingRow, WeekStatus } from '@/lib/packEmpire/league'
import { PACK_TIER_COLOR, PACK_TIER_LABEL, RARITY_LOOK, REGULAR_WEEKS } from '@/lib/packEmpire/rules'

export const STATUS_LABEL: Record<WeekStatus, string> = {
  none: 'Not started',
  drafting: 'Drafting',
  in: 'Lineup in',
  locked: 'Locked',
  done: 'Done',
}

/** In, with nothing left to decide this week. */
export function isReady(s: StandingRow): boolean {
  return s.status === 'locked' || s.status === 'done'
}

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

/** Eight bars, one a week: its height the score, gold where it won the week. */
function Form({ s, top, now }: { s: StandingRow; top: number; now: number | null }) {
  return (
    <span className="pe-lt-form" aria-label={`Weekly scores: ${s.weeks.map((w) => (w == null ? 'none' : k(w))).join(', ')}`}>
      {s.weeks.map((w, i) => (
        <i
          key={i}
          className={w == null ? (now === i + 1 ? 'now' : 'none') : s.weekRanks[i] === 1 ? 'won' : ''}
          style={w == null ? undefined : { height: `${Math.max(12, Math.round((w / top) * 100))}%` }}
          title={w == null ? `Week ${i + 1}` : `Week ${i + 1}: ${k(w)}, ${ordinal(s.weekRanks[i] ?? 0)}`}
        />
      ))}
    </span>
  )
}

export function StandingsTable({ view }: { view: LeagueView }) {
  const { league, standings } = view
  const post = league.phase === 'gauntlet' || league.phase === 'finals' || league.phase === 'complete'
  const live = league.phase === 'regular' || league.phase === 'gauntlet' || league.phase === 'finals'
  const top = Math.max(1, ...standings.flatMap((s) => s.weeks.filter((w): w is number => w != null)))
  const now = league.phase === 'regular' ? league.current_week : null
  const line = !post && league.phase === 'regular' ? view.playoffSpots : 0

  return (
    <div className={`pe-lt${post ? ' post' : ''}`} role="table" aria-label="Standings">
      <div className="pe-lt-row pe-lt-head" role="row">
        <span>#</span>
        <span />
        <span>Team</span>
        <span className="pe-lt-hide">Form</span>
        <span>{live ? 'This week' : ''}</span>
        <span className="pe-lt-hide pe-lt-num" title="Weeks with the league's top score">
          Wins
        </span>
        <span className="pe-lt-hide pe-lt-wide pe-lt-num">Best</span>
        <span className="pe-lt-hide pe-lt-wide pe-lt-num">Avg</span>
        <span className="pe-lt-num pe-lt-last">{post ? 'Season' : 'Last'}</span>
        <span className="pe-lt-num">{post ? 'Playoff' : 'Total'}</span>
        <span className="pe-lt-hide pe-lt-num">Back</span>
      </div>
      {standings.map((s, i) => {
        const out = post && !s.active
        const href = `/games/pack-empire/league/${league.id}/team/${s.memberId}/`
        const showStatus = live && (league.phase === 'regular' || s.active)
        return (
          <Fragment key={s.memberId}>
            {line > 0 && i === line && (
              <div className="pe-lt-line" role="presentation">
                <span>Playoff line · top {line} reach the {view.playoffSpots >= 3 ? 'Gauntlet' : 'Final'}</span>
              </div>
            )}
            <Link href={href} role="row" className={`pe-lt-row${s.you ? ' you' : ''}${out ? ' out' : ''}`}>
              <span className="pe-lt-rank">{i + 1}</span>
              <Move move={post ? null : s.move} />
              <span className="pe-lt-who">
                <span className="pe-lt-team">
                  {s.team ?? s.name}
                  {s.cpu && <em className="pe-lt-cpu">CPU</em>}
                </span>
                <span className="pe-lt-sub">
                  {!s.cpu && s.team ? `${s.name} · ` : ''}
                  {live && (league.phase === 'regular' || s.active) && (
                    <span style={{ color: PACK_TIER_COLOR[s.tier] }}>{PACK_TIER_LABEL[s.tier]}</span>
                  )}
                  {league.phase === 'regular' && s.locks > 0 ? ` · ${s.locks} locked` : ''}
                  {live && s.mulligan && (league.phase === 'regular' || s.active) ? ' · Mulligan' : ''}
                  {post && s.seed != null ? ` · Seed ${s.seed}` : ''}
                  {out && league.phase !== 'complete' ? ' · Out' : ''}
                </span>
              </span>
              <Form s={s} top={top} now={now} />
              <span className="pe-lt-status">
                {showStatus && (
                  <span className={`pe-lt-chip ${s.status}`}>
                    {STATUS_LABEL[s.status]}
                    {s.peek && !s.you ? ' · See it' : ''}
                  </span>
                )}
              </span>
              <span className="pe-lt-hide pe-lt-num pe-lt-wins">{s.wins ? `★ ${s.wins}` : '·'}</span>
              <span className="pe-lt-hide pe-lt-wide pe-lt-num">{s.best != null ? k(s.best) : '·'}</span>
              <span className="pe-lt-hide pe-lt-wide pe-lt-num">{s.avg != null ? k(s.avg) : '·'}</span>
              <span className="pe-lt-num pe-lt-last">{post ? k(s.total) : s.lastWeek != null ? k(s.lastWeek) : '·'}</span>
              <span className="pe-lt-num pe-lt-total">{k(post ? s.playoff : s.total)}</span>
              <span className="pe-lt-hide pe-lt-num pe-lt-back">{s.back > 0 ? `−${k(s.back)}` : i === 0 ? 'Lead' : '·'}</span>
            </Link>
          </Fragment>
        )
      })}
    </div>
  )
}

export function WeekRecapCard({ view }: { view: LeagueView }) {
  const r = view.recap
  if (!r) return null
  const [first, ...rest] = r.top
  const team = (id: string, name: string) => (
    <Link href={`/games/pack-empire/league/${view.league.id}/team/${id}/`} className="pe-link">
      {name}
    </Link>
  )
  return (
    <section className="pe-lr" aria-label={`${r.label} recap`}>
      <div className="pe-lr-head">
        <span className="pe-kicker">§ {r.label} recap</span>
        {r.rule && <span className="pe-lr-rule">{r.rule.title}</span>}
      </div>
      {first && (
        <div className="pe-lr-hero">
          <span className="pe-lr-hero-k">Team of the Week</span>
          <span className="pe-lr-hero-team">{team(first.memberId, first.team)}</span>
          <span className="pe-lr-hero-score">{k(first.score)}</span>
          <span className="pe-lr-hero-sub">
            {rest.map((x, i) => (
              <span key={x.memberId}>
                {ordinal(i + 2)} {x.team} {k(x.score)}
              </span>
            ))}
            <span>League average {k(r.avg)}</span>
          </span>
        </div>
      )}
      <div className="pe-lr-tiles">
        {r.bestPull && (
          <div className="pe-lr-tile" style={{ '--rc': RARITY_LOOK[r.bestPull.card.rarity].color } as React.CSSProperties}>
            <span className="pe-lr-k">Best pull</span>
            <span className="pe-lr-v">
              {r.bestPull.card.name} {r.bestPull.card.year ?? ''}
            </span>
            <span className="pe-lr-s">
              <b>{k(r.bestPull.card.score)}</b> {RARITY_LOOK[r.bestPull.card.rarity].label} · {r.bestPull.team}
            </span>
          </div>
        )}
        {r.bestChem && (
          <div className="pe-lr-tile">
            <span className="pe-lr-k">Best chemistry</span>
            <span className="pe-lr-v">+{k(r.bestChem.chem)}</span>
            <span className="pe-lr-s">{r.bestChem.team}</span>
          </div>
        )}
        {r.climber && (
          <div className="pe-lr-tile">
            <span className="pe-lr-k">Biggest climb</span>
            <span className="pe-lr-v">▲ {r.climber.places}</span>
            <span className="pe-lr-s">
              {r.climber.team}, up to {ordinal(r.climber.to)}
            </span>
          </div>
        )}
        {r.low && (
          <div className="pe-lr-tile">
            <span className="pe-lr-k">Low score</span>
            <span className="pe-lr-v">{k(r.low.score)}</span>
            <span className="pe-lr-s">{r.low.team}</span>
          </div>
        )}
      </div>
    </section>
  )
}

export function ScheduleStrip({ view }: { view: LeagueView }) {
  if (!view.schedule.length || view.league.phase === 'pregame') return null
  return (
    <section className="pe-sec" aria-label="The season">
      <div className="pe-sec-head">
        <span className="pe-sec-num">§ Schedule</span>
        <span className="pe-sec-title">The Season</span>
        <span className="pe-sec-meta">
          {REGULAR_WEEKS} weeks, then the playoffs{view.league.week_rules !== false ? ' · every twist, ahead of time' : ''}
        </span>
      </div>
      <div className="pe-ls">
        {view.schedule.map((w) => (
          <div key={w.key} className={`pe-ls-week ${w.state}`}>
            <span className="pe-ls-label">{w.short}</span>
            <span className="pe-ls-rule">{w.rule ? w.rule.title : 'Plain week'}</span>
            <span className="pe-ls-foot">
              {w.state === 'now' ? 'This week' : w.winner ? `${w.winner.team} ${k(w.winner.score)}` : w.state === 'done' ? '·' : 'Coming up'}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function HistoryList({ view }: { view: LeagueView }) {
  if (!view.history.length) return null
  return (
    <section className="pe-sec" aria-label="Past champions">
      <div className="pe-sec-head">
        <span className="pe-sec-num">§ History</span>
        <span className="pe-sec-title">Champions</span>
        <span className="pe-sec-meta">
          {view.history.length} season{view.history.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="pe-row-list">
        {view.history.map((h) => (
          <div key={h.season} className="pe-row">
            <span style={{ minWidth: 0 }}>
              <span className="pe-row-name">★ {h.team}</span>
              <span className="pe-row-sub">Season {h.season}</span>
            </span>
            <span className="pe-row-side">{k(h.score)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** This week at a glance: the twist, what's coming next, and who's done. */
export function WeekPanel({ view }: { view: LeagueView }) {
  const { league, standings } = view
  const live = league.phase === 'regular' || league.phase === 'gauntlet' || league.phase === 'finals'
  if (!live) return null
  const field = standings.filter((s) => league.phase === 'regular' || s.active)
  const ready = field.filter(isReady).length
  const inNow = field.filter((s) => s.status !== 'none' && s.status !== 'drafting').length
  const next = view.schedule.find((w) => w.state === 'next')
  return (
    <div className="pe-panel pe-lw">
      <div className="pe-kicker">This week</div>
      {view.rule ? (
        <>
          <div className="pe-lg-twist-title">{view.rule.title}</div>
          <p className="pe-panel-text">{view.rule.line}</p>
        </>
      ) : (
        <p className="pe-panel-text">A plain week: cards and chemistry.</p>
      )}
      <div className="pe-lw-meter" aria-label={`${ready} of ${field.length} done`}>
        {field.map((s) => (
          <i key={s.memberId} className={s.status} title={`${s.team ?? s.name}: ${STATUS_LABEL[s.status]}`} />
        ))}
      </div>
      <p className="pe-note">
        {inNow} of {field.length} lineups in · {ready} done
        {ready === field.length ? '. Ready to close.' : ''}
      </p>
      {next && next.rule && (
        <p className="pe-lw-next">
          <span>Next: {next.label}</span> {next.rule.title}
        </p>
      )}
    </div>
  )
}
