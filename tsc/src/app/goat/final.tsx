// The final's furniture: the billing, the tale of the tape, and the two roads
// that got here.
//
// Server-renderable on purpose (no hooks, no state). The vote deck is a client
// island and the standby page is not, and both need to dress the final the same
// way; anything that only one of them could render would leave the last round
// looking like two different events.

import {
  allPlay, allPlayRate, finishLine, label, pathTo, postLift, postRecord, pts, record, signed, vsLeague,
  type GameScore, type GoatTeam, type ResolvedGame, type RoundId,
} from '@/lib/greatestTeam'

/**
 * The billing. Two names, the seeds that carried them, and nothing else: this
 * is the poster, and the numbers are the undercard below it.
 */
export function Marquee({ home, away }: { home: GoatTeam; away: GoatTeam }) {
  return (
    <div className="gt-marquee">
      <div className="gt-marquee-rule"><span>✦</span></div>
      <div className="gt-marquee-pair">
        <Billing team={home} />
        <div className="gt-marquee-vs">vs</div>
        <Billing team={away} />
      </div>
      <div className="gt-marquee-rule"><span>✦</span></div>
    </div>
  )
}

function Billing({ team }: { team: GoatTeam }) {
  return (
    <div className="gt-billing">
      <div className="gt-billing-seed">{team.seed} seed</div>
      <h3>{label(team)}</h3>
      <div className="gt-billing-team">&ldquo;{team.team}&rdquo;</div>
      <div className="gt-billing-finish">{finishLine(team)}</div>
    </div>
  )
}

type Row = { label: string; home: string; away: string; edge: 'home' | 'away' | null }

/**
 * The tale of the tape. Every row that HAS a better side marks it, because the
 * whole point of putting the two seasons in one column is to see at a glance
 * how few of these rows actually agree with each other.
 *
 * Split into the year and the run on purpose. The team cards carry the season
 * figures; what they cannot show, and what the final actually turns on, is
 * whether a team was the same team in January.
 *
 * Rows deliberately NOT marked with an edge: points against and the schedule
 * it describes are context, not merit, and a gold tick next to the team that
 * happened to draw softer opponents argues something nobody meant.
 */
export function Tape({ home, away }: { home: GoatTeam; away: GoatTeam }) {
  const games = (t: GoatTeam) => t.wins + t.losses + t.ties
  const winRate = (t: GoatTeam) => (games(t) ? (t.wins + 0.5 * t.ties) / games(t) : 0)
  const dash = (s: string | null) => s ?? '—'

  const season: Row[] = [
    { label: 'Record', home: record(home), away: record(away), edge: edgeOf(winRate(home), winRate(away)) },
    // The record everybody would have had against everybody. Sits directly
    // under the real one so the gap between them is unmissable.
    { label: 'Vs the whole league', home: allPlay(home), away: allPlay(away), edge: edgeOf(allPlayRate(home), allPlayRate(away)) },
    { label: 'Points a week', home: pts(home.regPpg), away: pts(away.regPpg), edge: edgeOf(home.regPpg, away.regPpg) },
    // The row that actually compares two different eras.
    { label: 'Vs league avg', home: vsLeague(home.index), away: vsLeague(away.index), edge: edgeOf(home.index, away.index) },
    { label: 'Weeks as league high', home: `${home.topWeeks}`, away: `${away.topWeeks}`, edge: edgeOf(home.topWeeks, away.topWeeks) },
    { label: 'Best week', home: pts(home.high), away: pts(away.high), edge: edgeOf(home.high, away.high) },
    { label: 'Worst week', home: pts(home.low), away: pts(away.low), edge: edgeOf(home.low, away.low) },
    { label: 'Longest streak', home: `${home.streak}`, away: `${away.streak}`, edge: edgeOf(home.streak, away.streak) },
    { label: 'Points allowed a week', home: pts(home.paPpg), away: pts(away.paPpg), edge: null },
  ]

  const january: Row[] = [
    { label: 'Playoff record', home: dash(postRecord(home)), away: dash(postRecord(away)), edge: edgeOf(home.postWins, away.postWins) },
    {
      label: 'Points a week',
      home: home.postPpg === null ? '—' : pts(home.postPpg),
      away: away.postPpg === null ? '—' : pts(away.postPpg),
      edge: edgeOf(home.postPpg ?? -1, away.postPpg ?? -1),
    },
    {
      label: 'Up on the regular season',
      home: postLift(home) === null ? '—' : signed(postLift(home)!),
      away: postLift(away) === null ? '—' : signed(postLift(away)!),
      edge: edgeOf(postLift(home) ?? -99, postLift(away) ?? -99),
    },
    { label: 'Seed score', home: home.resume.toFixed(1), away: away.resume.toFixed(1), edge: edgeOf(home.resume, away.resume) },
  ]

  return (
    <div className="gt-tape">
      <div className="gt-tape-head">
        <span>{label(home)}</span>
        <span>Tale of the tape</span>
        <span>{label(away)}</span>
      </div>
      <Block rows={season} caption="The season" />
      <Block rows={january} caption="When it counted" />
    </div>
  )
}

function Block({ rows, caption }: { rows: Row[]; caption: string }) {
  return (
    <>
      <div className="gt-tape-caption">{caption}</div>
      {rows.map((r) => (
        <div className="gt-tape-row" key={caption + r.label}>
          <b className={r.edge === 'home' ? 'is-edge' : ''}>{r.home}</b>
          <span>{r.label}</span>
          <b className={r.edge === 'away' ? 'is-edge' : ''}>{r.away}</b>
        </div>
      ))}
    </>
  )
}

/** A dead heat has no edge rather than an arbitrary one. */
function edgeOf(a: number, b: number): 'home' | 'away' | null {
  if (a === b) return null
  return a > b ? 'home' : 'away'
}

const SHORT: Record<RoundId, string> = { r16: 'R16', qf: 'QF', sf: 'SF', final: 'F' }

/**
 * How each side got here. A three-line resume, and the only place the bracket
 * behind the final is visible without scrolling all the way down to it.
 *
 * Each line reads as a result: the seat the beaten team held, its name, and how
 * the room split on it. The scores are only ever for settled games, and those
 * counts are already public on the bracket below.
 */
export function Roads({
  bracket, home, away, scores,
}: {
  bracket: ResolvedGame[]
  home: GoatTeam
  away: GoatTeam
  scores?: Record<string, GameScore>
}) {
  return (
    <div className="gt-roads">
      {[home, away].map((team) => (
        <div className="gt-road" key={team.seed}>
          <div className="gt-road-head">{label(team)}</div>
          {pathTo(bracket, team.seed).map((step) => {
            const s = scores?.[step.game]
            return (
              <div className="gt-road-step" key={step.round}>
                <i>{SHORT[step.round]}</i>
                <span className="gt-road-beat">
                  beat <em>{step.beat.seed}</em> <b>{label(step.beat)}</b>
                </span>
                {/* A game the room never actually split on (a tie the
                    commissioner called by hand) has no score to show. */}
                {s && s.won + s.lost > 0 && (
                  <span className="gt-road-score">
                    {s.won}<i>-</i>{s.lost}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * The whole final in one block: billing, tape, roads. Used by the vote card's
 * opening screen and by the page anybody hits between the semifinals closing
 * and the final opening.
 */
export function FinalPreview({
  bracket, game, scores,
}: {
  bracket: ResolvedGame[]
  game: ResolvedGame
  scores?: Record<string, GameScore>
}) {
  if (!game.home || !game.away) return null
  return (
    <>
      <Marquee home={game.home} away={game.away} />
      <Tape home={game.home} away={game.away} />
      <Roads bracket={bracket} home={game.home} away={game.away} scores={scores} />
    </>
  )
}
