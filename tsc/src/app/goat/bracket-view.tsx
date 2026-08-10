import {
  ROUNDS, buildBracket, label, pts, record, winnerOf, tallyRound,
  type Ballot, type GoatTeam, type Results, type RoundId, type VoteRecord,
} from '@/lib/greatestTeam'

/**
 * The bracket as it stands, read-only. Shown to anybody who opens the link
 * between rounds, and to a voter once their card is in.
 *
 * Every side carries its record and scoring average, not just a name: "2019
 * Joey" means nothing to somebody scrolling in a group chat, and the whole
 * argument is about the numbers underneath.
 *
 * Vote counts only render for rounds already settled, or when the room has
 * opened the live ones: a running count on a live round is a bandwagon.
 *
 * `mine` marks one person's own picks down the whole bracket, which is what
 * turns this from a scoreboard into their receipt. It is only ever their own
 * card: the counts stay sealed exactly as before.
 */
export function BracketView({
  results, votes, revealed, openRound, mine, counts = true,
}: {
  results: Results
  votes: VoteRecord[]
  revealed: boolean
  openRound: RoundId | null
  mine?: Ballot
  /** Off when the caller has no business showing turnout, e.g. a receipt. */
  counts?: boolean
}) {
  const bracket = buildBracket(results)
  const champion = winnerOf(bracket)

  return (
    <div className="gt-bracket">
      {champion && (
        <div className="gt-champ">
          <div className="gt-kicker">The greatest team in league history</div>
          <h2>{label(champion)}</h2>
          <p>
            {champion.team} · {record(champion)} · {pts(champion.ppg)} a week
          </p>
        </div>
      )}

      {ROUNDS.map((round) => {
        const games = bracket.filter((g) => g.round === round.id)
        const settled = games.filter((g) => g.winner !== null).length
        const showCounts = counts && (revealed || round.id !== openRound)
        const tallies = tallyRound(bracket, round.id, votes)
        const tallyFor = (id: string) => tallies.find((t) => t.game.id === id)

        return (
          <section key={round.id}>
            <h2 className="gt-round-name">
              {round.name}
              <span>
                {round.id === openRound
                  ? 'voting open'
                  : settled === round.games
                  ? 'settled'
                  : settled
                  ? `${settled} of ${round.games} in`
                  : 'to come'}
              </span>
            </h2>

            {games.map((g) => {
              const t = tallyFor(g.id)
              const decided = g.winner !== null
              const my = mine?.[g.id]
              return (
                <div className="gt-tie" key={g.id}>
                  <Side
                    team={g.home}
                    won={decided && g.winner === g.home?.seed}
                    lost={decided && g.winner !== g.home?.seed}
                    count={showCounts ? t?.homeVotes ?? null : null}
                    mine={!!g.home && my === g.home.seed}
                  />
                  <Side
                    team={g.away}
                    won={decided && g.winner === g.away?.seed}
                    lost={decided && g.winner !== g.away?.seed}
                    count={showCounts ? t?.awayVotes ?? null : null}
                    mine={!!g.away && my === g.away.seed}
                  />
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

function Side({
  team, won, lost, count, mine,
}: {
  team: GoatTeam | null
  won: boolean
  lost: boolean
  count: number | null
  mine?: boolean
}) {
  return (
    <div className={`gt-tie-side${won ? ' is-won' : ''}${lost ? ' is-lost' : ''}${mine ? ' is-mine' : ''}`}>
      <span className="gt-tie-seed">{team?.seed ?? ''}</span>
      {team ? (
        <span className="gt-tie-name">
          <b>{label(team)}</b>
          <i>
            {record(team)} · {pts(team.ppg)} a week · {team.team}
          </i>
        </span>
      ) : (
        <span className="gt-tie-name">
          <b className="gt-tbd">winner of the round before</b>
        </span>
      )}
      {count !== null && team && <span className="gt-tie-count">{count}</span>}
    </div>
  )
}
