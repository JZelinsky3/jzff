import {
  PROPS, RIVALRIES, rivalryKey, tallyChoices, tallyLines,
  type BallotManager, type LockedBoard, type VoteRecord,
} from '@/lib/winBallot'

/**
 * What the link becomes once the commissioner opens the room. Read-only, so
 * it renders on the server: by the time anybody sees this the voting is over
 * and there is nothing left to interact with.
 */
export function ResultsView({
  roster, board, votes, token, order,
}: {
  roster: BallotManager[]
  board: LockedBoard
  votes: VoteRecord[]
  token: string
  /** Board order, worked out once from the recaps so both pages agree. */
  order: string[]
}) {
  // tallyLines ranks by how lopsided the room was; a board reads better in
  // line order, so put it back that way and let the row say how one-sided it
  // went. Ties are settled by the recap order, which knows the averages.
  const seat = (name: string) => {
    const i = order.indexOf(name)
    return i === -1 ? order.length : i
  }
  const lines = tallyLines(roster, board, votes).sort((a, b) => seat(a.name) - seat(b.name))
  const unanimous = lines.filter((l) => l.count > 0 && l.edge === 1)
  const split = lines.filter((l) => l.count > 0 && l.lean === 'split')

  return (
    <div className="wb">
      <div className="wb-shell">
        <div className="wb-card" style={{ marginTop: '1.2rem' }}>
          <div className="wb-card-top"><span>PA Milk Society</span><span>Form O/U · 2026</span></div>
          <h1>The room has <em>spoken.</em></h1>
          <div className="wb-card-sub">
            {votes.length} card{votes.length === 1 ? '' : 's'} · lines set by {board.ballotCount} ballot
            {board.ballotCount === 1 ? '' : 's'}
          </div>
        </div>

        <div className="wb-brief">
          <p>
            Every line below came out of the preseason ballots
            {board.basis === 'outsiders' ? ', with nobody counted on their own season' : ''}.
            Then the league took a side on all of them.
          </p>
          {(unanimous.length > 0 || split.length > 0) && (
            <div className="wb-note">
              {unanimous.length > 0 && (
                <>The room was unanimous on {unanimous.map((l) => l.name).join(', ')}.{' '}</>
              )}
              {split.length > 0 && (
                <>Dead even on {split.map((l) => l.name).join(', ')}.</>
              )}
            </div>
          )}
        </div>

        <div className="wb-recap-link">
          <a href={`/ballot/${token}/recap`}>
            Read the twelve recap cards
          </a>
          <span>every ballot behind every line, one card each</span>
        </div>

        <div className="wb-eyebrow">The board</div>
        <div className="wb-results">
          {lines.map((l) => {
            const pct = l.count ? (l.over / l.count) * 100 : 50
            return (
              <div key={l.name} className="wb-result" data-lean={l.lean}>
                <div className="wb-result-head">
                  <span className="wb-result-name">{l.name}</span>
                  <span className="wb-conf-mark" data-conf={l.conference}>{l.conference}</span>
                  <span className="wb-result-line">{l.line.toFixed(1)}</span>
                </div>
                <div className="wb-bar" aria-hidden="true">
                  <div className="wb-bar-over" style={{ width: `${pct}%` }} />
                </div>
                <div className="wb-result-foot">
                  <span className="wb-result-over">{l.over} over</span>
                  <span className="wb-result-verdict">
                    {l.count === 0 ? 'no votes'
                      : l.lean === 'split' ? 'dead even'
                      : l.edge === 1 ? `all ${l.count} took the ${l.lean}`
                      : `the ${l.lean}, ${Math.max(l.over, l.under)} to ${Math.min(l.over, l.under)}`}
                  </span>
                  <span className="wb-result-under">{l.under} under</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="wb-eyebrow" style={{ marginTop: '1.6rem' }}>The props</div>
        {PROPS.map((p) => {
          const counts = tallyChoices(votes, (c) => c.props[p.key])
          const top = counts[0]?.count ?? 0
          return (
            <div key={p.key} className="wb-prop-result">
              <div className="wb-prop-ask">{p.ask}</div>
              <div className="wb-prop-note">{p.note}</div>
              {counts.length === 0 ? (
                <div className="wb-empty">Nobody called it</div>
              ) : (
                <div className="wb-tallies">
                  {counts.map((c) => (
                    <div key={c.answer} className="wb-tally-row" data-top={c.count === top}>
                      <span className="wb-tally-name">{c.answer}</span>
                      <span className="wb-tally-bar" aria-hidden="true">
                        <span style={{ width: `${(c.count / Math.max(1, votes.length)) * 100}%` }} />
                      </span>
                      <span className="wb-tally-no">{c.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div className="wb-eyebrow" style={{ marginTop: '1.6rem' }}>Rivalry week</div>
        <div className="wb-results">
          {RIVALRIES.map((pair) => {
            const counts = tallyChoices(votes, (c) => c.rivalry[rivalryKey(pair)])
            const a = counts.find((c) => c.answer === pair[0])?.count ?? 0
            const b = counts.find((c) => c.answer === pair[1])?.count ?? 0
            const total = a + b
            return (
              <div key={rivalryKey(pair)} className="wb-result">
                <div className="wb-result-head">
                  <span className="wb-result-name">{pair[0]} v {pair[1]}</span>
                  <span className="wb-result-line">{total ? `${Math.max(a, b)}–${Math.min(a, b)}` : '–'}</span>
                </div>
                <div className="wb-bar" aria-hidden="true">
                  <div className="wb-bar-over" style={{ width: `${total ? (a / total) * 100 : 50}%` }} />
                </div>
                <div className="wb-result-foot">
                  <span className="wb-result-over">{pair[0]} {a}</span>
                  <span className="wb-result-verdict">
                    {total === 0 ? 'no votes' : a === b ? 'dead even' : `${a > b ? pair[0] : pair[1]} by ${Math.abs(a - b)}`}
                  </span>
                  <span className="wb-result-under">{b} {pair[1]}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="wb-foot" style={{ marginTop: '2rem' }}>
          Nothing moves now. Come back when the season settles it.
        </div>
      </div>
    </div>
  )
}
