'use client'

import { useState, useTransition } from 'react'
import {
  ROOM_SIZE, ROUNDS, buildBracket, currentRound, label, record, winnerOf,
  tallyRound, type Results, type RoundId, type VoteRecord,
} from '@/lib/greatestTeam'
import {
  breakTie, clearVote, closeVoting, ensureGoatToken, openRound, reopenRound,
  setRevealed, settleOpenRound,
} from '@/app/goat/actions'

type State = { results: Results; openRound: RoundId | null; revealed: boolean }

export function RoomView({
  leagueId, origin, state, votes, token,
}: {
  leagueId: string
  origin: string
  state: State
  votes: VoteRecord[]
  token: string | null
}) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [link, setLink] = useState(token)

  const bracket = buildBracket(state.results)
  const champion = winnerOf(bracket)
  const next = currentRound(state.results)
  const live = state.openRound

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      setMsg(''); setErr('')
      const res = await fn()
      if (res.ok) setMsg(ok)
      else setErr(res.error ?? 'That did not work.')
    })

  const shareUrl = link ? `${origin}/goat/${link}` : ''

  return (
    <div className="gt gtr">
      <div className="gt-shell gtr-shell">
        <div className="gt-head">
          <div className="gt-kicker">Commissioner</div>
          <h1>Bracket <em>room</em></h1>
          <div className="gt-sub">Greatest team in PA Milk Society history</div>
        </div>

        <div className="gt-stage">
          {msg && <div className="gtr-ok">{msg}</div>}
          {err && <div className="gt-err">{err}</div>}

          {/* ── The link ── */}
          <section className="gtr-block">
            <h2 className="gt-round-name">The link<span>hand this to the group</span></h2>
            {shareUrl ? (
              <>
                <code className="gtr-link">{shareUrl}</code>
                <div className="gtr-row">
                  <button
                    className="gt-btn is-ghost"
                    onClick={() => navigator.clipboard?.writeText(shareUrl).then(() => setMsg('Link copied.'))}
                  >Copy</button>
                  <button
                    className="gt-btn is-ghost"
                    disabled={pending}
                    onClick={() => run(async () => {
                      const r = await ensureGoatToken(leagueId, true)
                      if (r.ok) setLink(r.token)
                      return r
                    }, 'New link minted. The old one is dead.')}
                  >Rotate</button>
                </div>
              </>
            ) : (
              <button
                className="gt-btn"
                disabled={pending}
                onClick={() => run(async () => {
                  const r = await ensureGoatToken(leagueId)
                  if (r.ok) setLink(r.token)
                  return r
                }, 'Link minted.')}
              >Mint the link</button>
            )}
          </section>

          {/* ── Where the tournament stands ── */}
          <section className="gtr-block">
            <h2 className="gt-round-name">
              State
              <span>
                {champion ? 'settled' : live ? `${ROUNDS.find((r) => r.id === live)?.name} open` : 'between rounds'}
              </span>
            </h2>

            {champion && (
              <div className="gt-champ">
                <div className="gt-kicker">Winner</div>
                <h2>{label(champion)}</h2>
                <p>{champion.team} · {record(champion)}</p>
              </div>
            )}

            {/* Nothing happens on the public link until a round is open, and
                that was the one step easy to walk past. So it is spelled out
                rather than sitting as one button among six. */}
            {!champion && !live && next && (
              <div className="gtr-next">
                <div className="gt-kicker">Next step</div>
                <h3>Open {ROUNDS.find((r) => r.id === next)?.name}</h3>
                <p>
                  The share link shows a read-only bracket until a round is
                  open. Open one and the same link turns into the voting card
                  for everybody holding it.
                </p>
                <button
                  className="gt-btn"
                  disabled={pending}
                  onClick={() => run(() => openRound(leagueId, next), `${ROUNDS.find((r) => r.id === next)?.name} is open. The link is live.`)}
                >
                  Open {ROUNDS.find((r) => r.id === next)?.name} for voting
                </button>
              </div>
            )}

            <div className="gtr-row">
              {live && (
                <>
                  <button
                    className="gt-btn"
                    disabled={pending}
                    onClick={() => run(async () => {
                      const r = await settleOpenRound(leagueId)
                      return r
                    }, 'Round settled. Bracket advanced.')}
                  >Settle the round</button>
                  <button
                    className="gt-btn is-ghost"
                    disabled={pending}
                    onClick={() => run(() => closeVoting(leagueId), 'Voting closed.')}
                  >Pause voting</button>
                </>
              )}
              <button
                className="gt-btn is-ghost"
                disabled={pending}
                onClick={() => run(() => setRevealed(leagueId, !state.revealed), state.revealed ? 'Counts sealed.' : 'Counts are public.')}
              >{state.revealed ? 'Seal counts' : 'Show counts'}</button>
            </div>
          </section>

          {/* ── The open round, game by game ── */}
          {live && <RoundTallies bracket={bracket} round={live} votes={votes} pending={pending} leagueId={leagueId} run={run} />}

          {/* ── Cards in ── */}
          {live && <Cards leagueId={leagueId} round={live} votes={votes} pending={pending} run={run} />}

          {/* ── Undo ── */}
          <section className="gtr-block">
            <h2 className="gt-round-name">Reopen<span>drops that round and everything after it</span></h2>
            <div className="gtr-row">
              {ROUNDS.map((r) => (
                <button
                  key={r.id}
                  className="gt-btn is-ghost"
                  disabled={pending}
                  onClick={() => run(async () => {
                    const res = await reopenRound(leagueId, r.id)
                    return res
                  }, `${r.name} reopened.`)}
                >{r.name}</button>
              ))}
            </div>
          </section>
        </div>

        <div className="gt-foot">PA Milk Society</div>
      </div>
    </div>
  )
}

function RoundTallies({
  bracket, round, votes, pending, leagueId, run,
}: {
  bracket: ReturnType<typeof buildBracket>
  round: RoundId
  votes: VoteRecord[]
  pending: boolean
  leagueId: string
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => void
}) {
  const tallies = tallyRound(bracket, round, votes)
  const cast = votes.filter((v) => v.round === round).length

  return (
    <section className="gtr-block">
      <h2 className="gt-round-name">
        {ROUNDS.find((r) => r.id === round)?.name}
        <span>{cast} of {ROOM_SIZE} cards in</span>
      </h2>
      {tallies.map((t) => {
        const tied = t.count > 0 && t.leader === null
        return (
          <div className={`gtr-tally${tied ? ' is-tied' : ''}`} key={t.game.id}>
            <div className="gtr-tally-side">
              <b>{t.game.home ? label(t.game.home) : '?'}</b>
              <span>{t.homeVotes}</span>
            </div>
            <div className="gtr-tally-side">
              <b>{t.game.away ? label(t.game.away) : '?'}</b>
              <span>{t.awayVotes}</span>
            </div>
            {tied && (
              <div className="gtr-row gtr-row-tight">
                <span className="gtr-tied-note">Dead tie. Call it:</span>
                {[t.game.home, t.game.away].map((team) =>
                  team ? (
                    <button
                      key={team.seed}
                      className="gt-btn is-ghost"
                      disabled={pending}
                      onClick={() => run(() => breakTie(leagueId, t.game.id, team.seed), `${label(team)} advances.`)}
                    >{label(team)}</button>
                  ) : null,
                )}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

function Cards({
  leagueId, round, votes, pending, run,
}: {
  leagueId: string
  round: RoundId
  votes: VoteRecord[]
  pending: boolean
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => void
}) {
  const cast = votes.filter((v) => v.round === round)
  if (!cast.length) return null
  return (
    <section className="gtr-block">
      <h2 className="gt-round-name">Cards in<span>{cast.length}</span></h2>
      {cast.map((v) => (
        <div className="gtr-card-row" key={v.name}>
          <b>{v.name}</b>
          <button
            className="gt-review-edit"
            disabled={pending}
            onClick={() => run(() => clearVote(leagueId, round, v.name), `${v.name}'s card removed.`)}
          >remove</button>
        </div>
      ))}
    </section>
  )
}
