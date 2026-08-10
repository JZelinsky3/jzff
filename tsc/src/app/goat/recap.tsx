// What a voter gets back the moment their card is in.
//
// Before this, filing a card ended the evening: you saw the round you had just
// called and nothing else. The tournament runs for four rounds across weeks,
// though, and the interesting question by the end is not "what did I just do"
// but "how has my bracket held up" — so the receipt is the whole card, every
// round, graded where the room has settled and sealed where it hasn't.

import {
  ROUNDS, buildBracket, flattenCard, label, pathTo, pts, record, scoreCard,
  type Results, type RoundId, type VoteRecord,
} from '@/lib/greatestTeam'
import { BracketView } from './bracket-view'

export function Recap({
  name, filedRound, results, votes,
}: {
  name: string
  /** The round they just filed, which is sealed rather than graded. */
  filedRound: RoundId
  results: Results
  /** Their cards, and only theirs. */
  votes: VoteRecord[]
}) {
  const bracket = buildBracket(results)
  const { rounds, right, graded } = scoreCard(bracket, votes)
  const mine = flattenCard(votes)
  const isFinal = filedRound === 'final'
  const filedName = ROUNDS.find((r) => r.id === filedRound)?.name ?? 'this round'

  // The one team they backed to win the whole thing, once they have called the
  // final. Everything else on this page is history; this is the bet.
  const champPick = rounds.find((r) => r.id === 'final')?.lines[0]?.pick ?? null

  return (
    <div className="gt-slide">
      <div className="gt-game-head">
        <div className="gt-kicker">{isFinal ? 'The envelope' : 'Card filed'}</div>
        <h2>
          {isFinal ? `Your call is in, ${name}.` : `That's in, ${name}.`}
        </h2>
      </div>

      {isFinal && champPick && (
        <div className="gt-mychamp">
          <div className="gt-kicker">Your pick for the greatest team we&apos;ve had</div>
          <h3>{label(champPick)}</h3>
          <p>
            {champPick.team} · {record(champPick)} · {pts(champPick.ppg)} a week
          </p>
          <div className="gt-mychamp-road">
            {pathTo(bracket, champPick.seed).map((step) => (
              <span key={step.round}>beat {label(step.beat)}</span>
            ))}
            <span className="gt-mychamp-last">one to go</span>
          </div>
        </div>
      )}

      <p className="gt-note">
        {isFinal
          ? `Sealed until Joey opens the envelope. Nobody sees the room's call, including you, until every card is in.`
          : `Your ${filedName.toLowerCase()} picks are sealed until Joey closes the round. Come back then for the winners and the next set.`}
      </p>

      {graded > 0 && (
        <div className="gt-score">
          <b>
            {right}<i>/</i>{graded}
          </b>
          <span>
            calls the room has agreed with so far
            <em>{Math.round((right / graded) * 100)}% of your settled picks</em>
          </span>
        </div>
      )}

      {/* Round by round, because the shape of a card matters: eight right in
          the first round and nothing since is a different tournament from
          the other way round. */}
      <div className="gt-card">
        {rounds.map((r) => {
          const done = r.lines.filter((l) => l.right !== null)
          const hit = done.filter((l) => l.right).length
          return (
            <section key={r.id}>
              <h3 className="gt-card-round">
                {r.name}
                <span>
                  {done.length === 0
                    ? 'sealed'
                    : `${hit} of ${done.length} right`}
                </span>
              </h3>
              {r.lines.map((l) => (
                <div
                  className={`gt-card-line${
                    l.right === true ? ' is-hit' : l.right === false ? ' is-miss' : ' is-sealed'
                  }`}
                  key={l.game.id}
                >
                  <i className="gt-card-mark">
                    {l.right === true ? '✓' : l.right === false ? '✕' : '·'}
                  </i>
                  <span className="gt-card-call">
                    <b>{l.pick ? label(l.pick) : ''}</b>
                    <em>over {l.against ? label(l.against) : ''}</em>
                  </span>
                  {l.right === false && l.against && (
                    <span className="gt-card-actual">room took {label(l.against)}</span>
                  )}
                </div>
              ))}
            </section>
          )
        })}
      </div>

      {/* The whole board with their line through it. Counts stay off: this is
          a receipt, not the room's tally. */}
      <div className="gt-card-bracket">
        <div className="gt-kicker">The bracket, with your card on it</div>
        <BracketView
          results={results}
          votes={[]}
          revealed={false}
          openRound={null}
          mine={mine}
          counts={false}
        />
      </div>

      <Next2026 />
    </div>
  )
}

/**
 * The handoff. The bracket is an offseason bit and it is nearly over; the
 * thing everybody actually opened their phone for this month lands today.
 */
export function Next2026() {
  return (
    <div className="gt-next">
      <div className="gt-kicker">Next up</div>
      <h3>Then it&apos;s 2026.</h3>
      <p>
        The schedule drops in the group chat later today. Fourteen weeks, every
        cross-conference rival once, and the last two are already spoken for.
      </p>
      <div className="gt-next-rule"><span>✦</span></div>
    </div>
  )
}
