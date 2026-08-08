'use client'

import { useState } from 'react'
import {
  ROOM_SIZE, ROUNDS, buildBracket, label, record, tallyRound, vsLeague,
  type Results, type RoundId, type VoteRecord,
} from '@/lib/greatestTeam'

/**
 * The picture Joey sends the group after a round closes.
 *
 * Built to be screenshotted rather than linked: fixed width, its own masthead
 * and footer, nothing that needs surrounding context to make sense. Every row
 * carries the seed and the vote count, because "2019 Joey beat 2024 Luke" means
 * nothing without knowing they were the 1 and the 16 and that it went 9-3.
 */
export function ResultsCard({
  results, votes,
}: {
  results: Results
  votes: VoteRecord[]
}) {
  const bracket = buildBracket(results)

  // Default to the latest round that has anything in it, since that is the one
  // just finished and the one worth sending.
  const withContent = ROUNDS.filter((r) =>
    bracket.some((g) => g.round === r.id && (g.winner !== null || votes.some((v) => v.round === r.id))),
  )
  const latest = withContent[withContent.length - 1]?.id ?? 'r16'
  const [round, setRound] = useState<RoundId>(latest)

  const meta = ROUNDS.find((r) => r.id === round)!
  const tallies = tallyRound(bracket, round, votes)
  const cast = votes.filter((v) => v.round === round).length
  const settled = tallies.every((t) => t.game.winner !== null)
  const nextRound = ROUNDS[ROUNDS.findIndex((r) => r.id === round) + 1]

  return (
    <section className="gtr-block">
      <h2 className="gt-round-name">
        Shareable results<span>screenshot this</span>
      </h2>

      <div className="gtr-picker">
        {ROUNDS.map((r) => {
          const has = bracket.some((g) => g.round === r.id && g.ready)
          return (
            <button
              key={r.id}
              className={`gtr-pick${r.id === round ? ' is-on' : ''}`}
              disabled={!has}
              onClick={() => setRound(r.id)}
            >
              {r.name}
            </button>
          )
        })}
      </div>

      {/* Everything below is the card itself. */}
      <div className="rc">
        <div className="rc-head">
          <div className="rc-kicker">PA Milk Society · 2026</div>
          <h3>{meta.name}</h3>
          <div className="rc-sub">
            {settled ? 'Final' : 'Voting'} · {cast} of {ROOM_SIZE} cards in
          </div>
        </div>

        <ol className="rc-games">
          {tallies.map((t) => {
            const { game } = t
            const top = Math.max(t.homeVotes, t.awayVotes) || 1
            return (
              <li className="rc-game" key={game.id}>
                {[
                  { team: game.home, v: t.homeVotes },
                  { team: game.away, v: t.awayVotes },
                ].map(({ team, v }, i) => {
                  const won = game.winner !== null && game.winner === team?.seed
                  const lost = game.winner !== null && !won
                  return (
                    <div className={`rc-side${won ? ' is-won' : ''}${lost ? ' is-lost' : ''}`} key={i}>
                      <span className="rc-seed">{team?.seed ?? '?'}</span>
                      <span className="rc-name">
                        <b>{team ? label(team) : 'To be decided'}</b>
                        {team && (
                          <em>
                            {record(team)} · {team.ppg} a week · {vsLeague(team.index)}
                          </em>
                        )}
                      </span>
                      <span className="rc-votes">
                        {/* No bar at all on zero: a sliver reads as a glitch. */}
                        {v > 0 && <span className="rc-bar" style={{ width: `${(v / top) * 100}%` }} />}
                        <b>{v}</b>
                      </span>
                    </div>
                  )
                })}
              </li>
            )
          })}
        </ol>

        <div className="rc-foot">
          {settled && nextRound
            ? `${nextRound.name} next`
            : settled
            ? 'That settles it'
            : 'Still open'}
        </div>
      </div>
    </section>
  )
}
