import {
  ROUNDS, buildBracket, label, record, winnerOf,
  type Results, type RoundId, type Tally, type VoteRecord,
  tallyRound,
} from '@/lib/greatestTeam'

/**
 * The bracket as it stands, read-only. Shown to anybody who opens the link
 * between rounds, and to a voter once their card is in.
 *
 * Vote counts are only ever rendered for rounds that are already settled, or
 * when the room has opened the live ones: a running count on a live round is
 * a bandwagon, so it stays sealed by default.
 */
export function BracketView({
  results, votes, revealed, openRound,
}: {
  results: Results
  votes: VoteRecord[]
  revealed: boolean
  openRound: RoundId | null
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
            {champion.team} · {record(champion)} · {champion.ppg} a week
          </p>
        </div>
      )}

      {ROUNDS.map((round) => {
        const games = bracket.filter((g) => g.round === round.id)
        const settled = games.filter((g) => g.winner !== null).length
        // A live round's counts stay hidden unless the room opened them.
        const showCounts = revealed || round.id !== openRound
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
              return (
                <div className="gt-tie" key={g.id}>
                  <Side
                    seed={g.home?.seed ?? null}
                    name={g.home ? label(g.home) : null}
                    won={g.winner !== null && g.winner === g.home?.seed}
                    lost={g.winner !== null && g.winner !== g.home?.seed}
                    count={showCounts ? t?.homeVotes ?? null : null}
                  />
                  <Side
                    seed={g.away?.seed ?? null}
                    name={g.away ? label(g.away) : null}
                    won={g.winner !== null && g.winner === g.away?.seed}
                    lost={g.winner !== null && g.winner !== g.away?.seed}
                    count={showCounts ? t?.awayVotes ?? null : null}
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
  seed, name, won, lost, count,
}: {
  seed: number | null
  name: string | null
  won: boolean
  lost: boolean
  count: number | null
}) {
  return (
    <div className={`gt-tie-side${won ? ' is-won' : ''}${lost ? ' is-lost' : ''}`}>
      <span className="gt-tie-seed">{seed ?? ''}</span>
      {name ? <b>{name}</b> : <b className="gt-tbd">to be decided</b>}
      {count !== null && name && <span className="gt-tie-count">{count}</span>}
    </div>
  )
}

export type { Tally }
