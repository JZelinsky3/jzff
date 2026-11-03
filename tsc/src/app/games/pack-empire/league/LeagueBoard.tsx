// The league page's pieces, rendered on the server: the table (a client
// component, for its sort), the week just closed, the season's schedule, this
// week at a glance, the season's records, and the champions.

import Link from 'next/link'
import type { LeagueView, StandingRow } from '@/lib/packEmpire/league'
import { WEEK_STATUS_LABEL } from '@/lib/packEmpire/leagueWeek'
import { PACK_TIER_COLOR, PACK_TIER_LABEL, RARITY_LOOK, REGULAR_WEEKS, type Rarity } from '@/lib/packEmpire/rules'
import { LeagueTable } from './LeagueTable'
import { ScheduleScroll } from './ScheduleScroll'

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

export function StandingsTable({ view }: { view: LeagueView }) {
  return (
    <LeagueTable
      leagueId={view.league.id}
      phase={view.league.phase}
      week={view.league.current_week}
      playoffSpots={view.playoffSpots}
      rows={view.standings}
    />
  )
}

function TeamLink({ league, id, name }: { league: string; id: string; name: string }) {
  return (
    <Link href={`/games/pack-empire/league/${league}/team/${id}/`} className="pe-lr-link">
      {name}
    </Link>
  )
}

function CardLine({ card }: { card: { name: string; year?: number; pos: string; rarity: Rarity; score: number } }) {
  const rc = RARITY_LOOK[card.rarity]
  return (
    <>
      <span className="pe-lr-v">
        {card.name} <small>{card.year ?? ''}</small>
      </span>
      <span className="pe-lr-s">
        <b style={{ color: rc.color }}>{k(card.score)}</b> {card.pos} · {rc.label}
      </span>
    </>
  )
}

export function WeekRecapCard({ view }: { view: LeagueView }) {
  const r = view.recap
  if (!r) return null
  const L = view.league.id
  const [first, second, third] = r.top
  const packs = r.finish.some((f) => f.tier)
  return (
    <section className="pe-lr" aria-label={`${r.label} recap`}>
      <header className="pe-lr-head">
        <div>
          <span className="pe-kicker">§ {r.label} recap</span>
          <h2 className="pe-lr-title">{r.rule ? r.rule.title : 'A plain week'}</h2>
          {r.rule && <p className="pe-lr-rule">{r.rule.line}</p>}
        </div>
        <div className="pe-lr-avg">
          <b>{k(r.avg)}</b>
          <small>League average</small>
        </div>
      </header>

      <div className="pe-lr-body">
        <div className="pe-lr-left">
          {first && (
            <div className="pe-lr-podium">
              <div className="pe-lr-first">
                <span className="pe-lr-k">Team of the Week</span>
                <span className="pe-lr-first-team">
                  <TeamLink league={L} id={first.memberId} name={first.team} />
                </span>
                <span className="pe-lr-first-score">{k(first.score)}</span>
                {r.margin != null && r.margin > 0 && <span className="pe-lr-s">Won it by {k(r.margin)}</span>}
              </div>
              {[second, third].filter(Boolean).map((x, i) => (
                <div key={x!.memberId} className={`pe-lr-place p${i + 2}`}>
                  <span className="pe-lr-k">{ordinal(i + 2)}</span>
                  <span className="pe-lr-place-team">
                    <TeamLink league={L} id={x!.memberId} name={x!.team} />
                  </span>
                  <span className="pe-lr-place-score">{k(x!.score)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pe-lr-tiles">
            {r.bestPull && (
              <div className="pe-lr-tile" style={{ '--rc': RARITY_LOOK[r.bestPull.card.rarity].color } as React.CSSProperties}>
                <span className="pe-lr-k">Best pull</span>
                <CardLine card={r.bestPull.card} />
                <span className="pe-lr-by">{r.bestPull.team}</span>
              </div>
            )}
            {r.bestChem && (
              <div className="pe-lr-tile" style={{ '--rc': '#68a878' } as React.CSSProperties}>
                <span className="pe-lr-k">Best chemistry</span>
                <span className="pe-lr-v">+{k(r.bestChem.chem)}</span>
                <span className="pe-lr-by">{r.bestChem.team}</span>
              </div>
            )}
            {r.twist && (
              <div className="pe-lr-tile" style={{ '--rc': '#4fc3b0' } as React.CSSProperties}>
                <span className="pe-lr-k">Twist did most for</span>
                <span className="pe-lr-v">+{k(r.twist.delta)}</span>
                <span className="pe-lr-by">{r.twist.team}</span>
              </div>
            )}
            {r.climber && (
              <div className="pe-lr-tile" style={{ '--rc': '#e8a84b' } as React.CSSProperties}>
                <span className="pe-lr-k">Biggest climb</span>
                <span className="pe-lr-v">▲ {r.climber.places}</span>
                <span className="pe-lr-by">
                  {r.climber.team}, up to {ordinal(r.climber.to)}
                </span>
              </div>
            )}
            {r.low && (
              <div className="pe-lr-tile">
                <span className="pe-lr-k">Low score</span>
                <span className="pe-lr-v">{k(r.low.score)}</span>
                <span className="pe-lr-by">{r.low.team}</span>
              </div>
            )}
          </div>
        </div>

        <div className="pe-lr-finish">
          <div className="pe-lr-k">{packs ? 'The finish, and the pack it bought' : 'The finish'}</div>
          <ol>
            {r.finish.map((f, i) => (
              <li key={f.memberId} className={f.you ? 'you' : ''}>
                <span className="pe-lr-fin-rank">{i + 1}</span>
                <span className="pe-lr-fin-team">{f.team}</span>
                <span className="pe-lr-fin-score">{k(f.score)}</span>
                {f.tier && (
                  <span className="pe-lt-pack" style={{ '--tc': PACK_TIER_COLOR[f.tier] } as React.CSSProperties}>
                    {PACK_TIER_LABEL[f.tier].replace(' Pack', '')}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
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
      <ScheduleScroll>
        {view.schedule.map((w) => (
          <div key={w.key} className={`pe-ls-week ${w.state}`}>
            <span className="pe-ls-label">{w.state === 'now' ? `${w.short} · Now` : w.short}</span>
            <span className="pe-ls-rule">{w.rule ? w.rule.title : 'Plain week'}</span>
            {w.rule && <span className="pe-ls-line">{w.rule.line}</span>}
            <span className="pe-ls-foot">
              {w.winner ? (
                <>
                  ★ {w.winner.team} <b>{k(w.winner.score)}</b>
                </>
              ) : w.state === 'now' ? (
                'This week'
              ) : w.state === 'done' ? (
                '·'
              ) : (
                'Coming up'
              )}
            </span>
          </div>
        ))}
      </ScheduleScroll>
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

/** This week at a glance: the twist, who's done, and what's next. */
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
          <i key={s.memberId} className={s.status} title={`${s.team ?? s.name}: ${WEEK_STATUS_LABEL[s.status]}`} />
        ))}
      </div>
      <p className="pe-lw-count">
        {inNow} of {field.length} in · {ready} done{ready === field.length ? ' · ready to close' : ''}
      </p>
      {next && next.rule && (
        <p className="pe-lw-next">
          <span>Next: {next.label}</span> {next.rule.title}
        </p>
      )}
    </div>
  )
}

/** The season so far: the best of everything, off the weeks that have closed. */
export function RecordsPanel({ view }: { view: LeagueView }) {
  const r = view.records
  if (!r.highWeek) return null
  const rows: { k: string; v: React.ReactNode; s: string }[] = [
    { k: 'Highest week', v: k(r.highWeek.score), s: `${r.highWeek.team} · ${r.highWeek.label}` },
  ]
  if (r.bestPull) {
    rows.push({
      k: 'Best pull',
      v: (
        <span style={{ color: RARITY_LOOK[r.bestPull.card.rarity].color }}>
          {r.bestPull.card.name} {r.bestPull.card.year ?? ''}
        </span>
      ),
      s: `${k(r.bestPull.card.score)} · ${r.bestPull.team} · ${r.bestPull.label}`,
    })
  }
  if (r.mostWins) rows.push({ k: 'Most weeks won', v: `★ ${r.mostWins.wins}`, s: r.mostWins.team })
  if (r.bestChem) rows.push({ k: 'Best chemistry', v: `+${k(r.bestChem.chem)}`, s: `${r.bestChem.team} · ${r.bestChem.label}` })
  if (r.bigTwist) rows.push({ k: 'Biggest twist', v: `+${k(r.bigTwist.delta)}`, s: `${r.bigTwist.team} · ${r.bigTwist.label}` })
  rows.push({ k: 'Immortals pulled', v: String(r.bigPulls), s: 'Cantons count too' })
  return (
    <div className="pe-panel pe-lrec">
      <div className="pe-kicker">Season records</div>
      <dl>
        {rows.map((x) => (
          <div key={x.k}>
            <dt>{x.k}</dt>
            <dd>
              <b>{x.v}</b>
              <small>{x.s}</small>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
