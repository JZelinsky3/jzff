'use client'

import { useState } from 'react'
import {
  GAMES, asRecord, buildRecap,
  type BallotManager, type BallotRecord, type LockedBoard, type VoteRecord,
} from '@/lib/winBallot'

/**
 * One manager, everything the league said about them.
 *
 * Built to be screenshotted and sent one at a time rather than read as a
 * page: its own masthead and footer, fixed width, nothing that needs the
 * room around it to make sense. A ballot number means nothing on its own,
 * so every card carries the twelve projections behind the line, the side
 * the room took once the line was up, and the record it was all guessed
 * against.
 */
export function RecapCard({
  roster, ballots, board, votes,
}: {
  roster: BallotManager[]
  ballots: BallotRecord[]
  board: LockedBoard
  votes: VoteRecord[]
}) {
  // One manager in full runs about two and a half screens tall, so twelve of
  // them is not a picture anybody can send. The board is the all-together
  // version: one row each, no detail, one screen.
  const [mode, setMode] = useState<'one' | 'all'>('one')
  const [who, setWho] = useState(roster[0]?.name ?? '')
  const recap = buildRecap(roster, ballots, board, votes, who)
  if (!recap) return null

  if (mode === 'all') {
    return (
      <section>
        <div className="wb-section">
          Recap cards<span className="mr-hint">screenshot one at a time</span>
        </div>
        <div className="mr-modes">
          <button type="button" className="mr-mode" onClick={() => setMode('one')}>One manager</button>
          <button type="button" className="mr-mode is-on">All twelve</button>
        </div>
        <BoardCard roster={roster} ballots={ballots} board={board} votes={votes} />
      </section>
    )
  }

  const m = recap.manager
  // Ballots land on whole numbers, so the distribution is a column per win
  // total. A value sits at the middle of its column.
  const at = (v: number) => `${((v + 0.5) / (GAMES + 1)) * 100}%`
  const bins = Array.from({ length: GAMES + 1 }, (_, n) => recap.picks.filter((p) => p.wins === n).length)
  const tallest = Math.max(1, ...bins)
  const overPct = recap.cast ? (recap.over / recap.cast) * 100 : 50

  return (
    <section>
      <div className="wb-section">
        Recap cards<span className="mr-hint">screenshot one at a time</span>
      </div>

      <div className="mr-modes">
        <button type="button" className="mr-mode is-on">One manager</button>
        <button type="button" className="mr-mode" onClick={() => setMode('all')}>All twelve</button>
      </div>

      <div className="mr-picker">
        {roster.map((r) => (
          <button
            key={r.name}
            type="button"
            className={`mr-pick${r.name === who ? ' is-on' : ''}`}
            onClick={() => setWho(r.name)}
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* Everything below is the card itself. */}
      <div className="mr">
        <div className="mr-head">
          <div className="mr-head-main">
            <div className="mr-kicker">PA Milk Society · 2026 win totals</div>
            <h3>{m.name}</h3>
            <div className="mr-sub">
              <span className="wb-conf-mark" data-conf={m.conference}>{m.conference}</span>
              {' · '}line off {recap.count} ballot{recap.count === 1 ? '' : 's'}
            </div>
          </div>
          <div className="mr-line">
            <b>{recap.line.toFixed(1)}</b>
            <span>the line</span>
          </div>
        </div>

        {/* ── What the room projected ── */}
        <div className="mr-block">
          <div className="mr-label">The ballots</div>

          <div className="mr-dist">
            <div className="mr-bins">
              {bins.map((count, n) => (
                <div className="mr-bin" key={n}>
                  <span className="mr-bin-col" style={{ height: `${(count / tallest) * 100}%` }} data-empty={count === 0} />
                  <span className="mr-bin-no">{n}</span>
                </div>
              ))}
            </div>
            <div className="mr-mark mr-mark-line" style={{ left: at(recap.line) }}>
              <span>{recap.line.toFixed(1)}</span>
            </div>
            <div className="mr-mark mr-mark-model" style={{ left: at(m.model) }}>
              <span>model {m.model.toFixed(1)}</span>
            </div>
          </div>

          <div className="mr-figs">
            <div className="mr-fig">
              <b>{recap.mean.toFixed(2)}</b>
              <span>average</span>
            </div>
            <div className="mr-fig">
              <b>{recap.low}–{recap.high}</b>
              <span>ran from</span>
            </div>
            <div className="mr-fig">
              <b>{recap.self ?? '–'}</b>
              <span>called it themselves</span>
            </div>
            <div className="mr-fig" data-tone={Math.abs(recap.vsModel) >= 1 ? 'off' : ''}>
              <b>{recap.vsModel >= 0 ? '+' : ''}{recap.vsModel.toFixed(1)}</b>
              <span>off the model</span>
            </div>
          </div>

          <div className="mr-chips">
            {recap.picks.map((p) => (
              <span key={p.from} className="mr-chip" data-self={p.self} data-out={!p.counted}>
                {p.from} <b>{p.wins}</b>
              </span>
            ))}
          </div>
        </div>

        {/* ── The side they took once the line was up ── */}
        <div className="mr-block">
          <div className="mr-label">The room, on {recap.line.toFixed(1)}</div>
          {recap.cast === 0 ? (
            <div className="mr-none">Nobody has taken a side yet</div>
          ) : (
            <>
              <div className="mr-ou">
                <span className="mr-ou-side" data-on={recap.lean === 'over'}>{recap.over} over</span>
                <span className="mr-ou-bar" aria-hidden="true">
                  <span style={{ width: `${overPct}%` }} />
                </span>
                <span className="mr-ou-side" data-on={recap.lean === 'under'}>{recap.under} under</span>
              </div>
              <div className="mr-verdict">
                {recap.lean === 'split'
                  ? `Dead even. ${recap.cast} cards, ${recap.over} apiece.`
                  : `${Math.max(recap.over, recap.under)} of ${recap.cast} took the ${recap.lean}.`}
                {' '}
                {recap.vsLast >= 0
                  ? `That is ${recap.vsLast.toFixed(1)} above last season's ${m.lastRecord}.`
                  : `That is ${Math.abs(recap.vsLast).toFixed(1)} below last season's ${m.lastRecord}.`}
              </div>
            </>
          )}
        </div>

        {/* ── Everywhere else their name came up ── */}
        <div className="mr-block">
          <div className="mr-label">Named for</div>
          <div className="mr-props">
            {recap.props.map((p) => (
              <div className="mr-prop" key={p.key} data-hit={p.count > 0}>
                <b>{p.count}</b>
                <span>{p.ask.replace(/^Who /, '')}</span>
              </div>
            ))}
          </div>
          <div className="mr-lines">
            {recap.rivalry && (
              <div className="mr-row">
                <span>Rivalry week v {recap.rivalry.opponent}</span>
                <b>
                  {recap.rivalry.mine + recap.rivalry.theirs === 0
                    ? 'no calls'
                    : recap.rivalry.mine === recap.rivalry.theirs
                    ? `even ${recap.rivalry.mine}–${recap.rivalry.theirs}`
                    : recap.rivalry.mine > recap.rivalry.theirs
                    ? `${m.name} ${recap.rivalry.mine}–${recap.rivalry.theirs}`
                    : `${recap.rivalry.opponent} ${recap.rivalry.theirs}–${recap.rivalry.mine}`}
                </b>
              </div>
            )}
            {recap.conference && (
              <div className="mr-row">
                <span>{m.conference} takes the series</span>
                <b>{recap.conference.took} of {recap.conference.cast}</b>
              </div>
            )}
          </div>
        </div>

        {/* ── What it was all guessed against ── */}
        <div className="mr-block">
          <div className="mr-label">The record</div>
          <div className="mr-lines">
            <div className="mr-row"><span>Last season</span><b>{m.lastRecord}</b></div>
            <div className="mr-row"><span>Career, {m.seasons} season{m.seasons === 1 ? '' : 's'}</span><b>{m.career}</b></div>
            <div className="mr-row"><span>Best</span><b>{m.best} in {m.bestYear}</b></div>
            <div className="mr-row"><span>Worst</span><b>{m.worst} in {m.worstYear}</b></div>
            <div className="mr-row"><span>The model</span><b>{m.model.toFixed(1)} · {asRecord(m.model)}</b></div>
          </div>
        </div>

        <div className="mr-foot">
          {recap.line.toFixed(1)} wins · {GAMES}-game season · sealed before a snap
        </div>
      </div>
    </section>
  )
}

/**
 * The whole board on one card. Not a condensed recap, a different picture:
 * every line, the average behind it and the side the room took, with none of
 * the detail that makes a single manager worth a card of their own.
 */
function BoardCard({
  roster, ballots, board, votes,
}: {
  roster: BallotManager[]
  ballots: BallotRecord[]
  board: LockedBoard
  votes: VoteRecord[]
}) {
  const rows = roster
    .map((m) => buildRecap(roster, ballots, board, votes, m.name)!)
    .sort((a, b) => b.line - a.line)
  const cast = Math.max(...rows.map((r) => r.cast), 0)

  return (
    <div className="mr">
      <div className="mr-head">
        <div className="mr-head-main">
          <div className="mr-kicker">PA Milk Society · 2026 win totals</div>
          <h3>The board</h3>
          <div className="mr-sub">
            {board.ballotCount} ballot{board.ballotCount === 1 ? '' : 's'} set it
            {cast > 0 && <> · {cast} card{cast === 1 ? '' : 's'} took a side</>}
          </div>
        </div>
      </div>

      <div className="mr-board">
        {rows.map((r) => (
          <div className="mr-brow" key={r.manager.name}>
            <span className="mr-bname">
              <b>{r.manager.name}</b>
              <em>avg {r.mean.toFixed(1)} · ran {r.low}–{r.high}</em>
            </span>
            <span className="mr-bline">{r.line.toFixed(1)}</span>
            <span className="mr-bou" data-lean={r.lean} data-none={r.cast === 0}>
              {r.cast === 0 ? '–' : `${r.over}–${r.under}`}
              <em>{r.cast === 0 ? 'no calls' : r.lean === 'split' ? 'even' : r.lean}</em>
            </span>
          </div>
        ))}
      </div>

      <div className="mr-foot">
        Over–under · {GAMES}-game season · sealed before a snap
      </div>
    </div>
  )
}
