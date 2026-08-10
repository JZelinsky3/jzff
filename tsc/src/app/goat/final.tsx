// The final's furniture: the billing, the tale of the tape, and the two roads
// that got here.
//
// Server-renderable on purpose (no hooks, no state). The vote deck is a client
// island and the standby page is not, and both need to dress the final the same
// way; anything that only one of them could render would leave the last round
// looking like two different events.

import {
  finishLine, label, pathTo, pts, record, vsLeague,
  type GoatTeam, type ResolvedGame, type RoundId,
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

/**
 * The tale of the tape. Every row that HAS a better side marks it, because the
 * whole point of putting the two seasons in one column is to see at a glance
 * how few of these rows actually agree with each other.
 */
export function Tape({ home, away }: { home: GoatTeam; away: GoatTeam }) {
  const games = (t: GoatTeam) => t.wins + t.losses + t.ties
  const winRate = (t: GoatTeam) => (games(t) ? (t.wins + 0.5 * t.ties) / games(t) : 0)

  const rows: { label: string; home: string; away: string; edge: 'home' | 'away' | null }[] = [
    { label: 'Record', home: record(home), away: record(away), edge: edgeOf(winRate(home), winRate(away)) },
    { label: 'Points a week', home: pts(home.ppg), away: pts(away.ppg), edge: edgeOf(home.ppg, away.ppg) },
    // The row that actually compares two different eras, which is why it is
    // third and not buried under the raw scoring above it.
    { label: 'Vs league avg', home: vsLeague(home.index), away: vsLeague(away.index), edge: edgeOf(home.index, away.index) },
    { label: 'Best week', home: pts(home.high), away: pts(away.high), edge: edgeOf(home.high, away.high) },
    { label: 'Longest streak', home: `${home.streak}`, away: `${away.streak}`, edge: edgeOf(home.streak, away.streak) },
    { label: 'Seed score', home: home.resume.toFixed(1), away: away.resume.toFixed(1), edge: edgeOf(home.resume, away.resume) },
  ]

  return (
    <div className="gt-tape">
      <div className="gt-tape-head">
        <span>{label(home)}</span>
        <span>Tale of the tape</span>
        <span>{label(away)}</span>
      </div>
      {rows.map((r) => (
        <div className="gt-tape-row" key={r.label}>
          <b className={r.edge === 'home' ? 'is-edge' : ''}>{r.home}</b>
          <span>{r.label}</span>
          <b className={r.edge === 'away' ? 'is-edge' : ''}>{r.away}</b>
        </div>
      ))}
    </div>
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
 */
export function Roads({ bracket, home, away }: { bracket: ResolvedGame[]; home: GoatTeam; away: GoatTeam }) {
  return (
    <div className="gt-roads">
      {[home, away].map((team) => (
        <div className="gt-road" key={team.seed}>
          <div className="gt-road-head">{label(team)}</div>
          {pathTo(bracket, team.seed).map((step) => (
            <div className="gt-road-step" key={step.round}>
              <i>{SHORT[step.round]}</i>
              <span>
                beat <b>{label(step.beat)}</b>
              </span>
              <em>{step.beat.seed}</em>
            </div>
          ))}
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
export function FinalPreview({ bracket, game }: { bracket: ResolvedGame[]; game: ResolvedGame }) {
  if (!game.home || !game.away) return null
  return (
    <>
      <Marquee home={game.home} away={game.away} />
      <Tape home={game.home} away={game.away} />
      <Roads bracket={bracket} home={game.home} away={game.away} />
    </>
  )
}
