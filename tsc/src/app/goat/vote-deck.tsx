'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ROUNDS, buildBracket, finishLine, gamesInRound, label, record,
  type Ballot, type GoatTeam, type ResolvedGame, type Results, type RoundId,
} from '@/lib/greatestTeam'
import { submitBallot } from './actions'

/**
 * One round's card, one game per screen. The deck is client-only (see
 * ./vote-client) because it restores a saved draft from the device on first
 * render, which the server cannot do without guaranteeing a mismatch.
 */
export function VoteDeck({
  leagueId, token, round, results, roster, alreadyVoted,
}: {
  leagueId: string
  token: string
  round: RoundId
  results: Results
  roster: readonly string[]
  alreadyVoted: string[]
}) {
  const games = useMemo(
    () => gamesInRound(buildBracket(results), round).filter((g) => g.ready && g.winner === null),
    [results, round],
  )
  const roundName = ROUNDS.find((r) => r.id === round)?.name ?? 'The bracket'
  // Draft is keyed by round, so last round's answers can't bleed into this one.
  const draftKey = `gt-draft-${round}`

  const [who, setWho] = useState('')
  const [picks, setPicks] = useState<Ballot>({})
  const [step, setStep] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // Restore whatever this device had in progress.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || '{}')
      if (saved && typeof saved === 'object') {
        if (typeof saved.who === 'string') setWho(saved.who)
        if (saved.picks && typeof saved.picks === 'object') setPicks(saved.picks)
      }
    } catch {
      // A corrupt draft is a draft that never was. Start clean.
    }
  }, [draftKey])

  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ who, picks }))
    } catch {
      // Private mode, or a full store. Losing the draft is survivable; the
      // card still submits.
    }
  }, [draftKey, who, picks])

  const taken = new Set(alreadyVoted)
  const called = games.filter((g) => picks[g.id]).length
  // Steps: name, then one per game, then review.
  const total = games.length + 2
  const at = Math.min(step, total - 1)

  async function send() {
    setSending(true)
    setError('')
    const res = await submitBallot({ leagueId, token, managerName: who, picks })
    setSending(false)
    if (!res.ok) { setError(res.error); return }
    try { localStorage.removeItem(draftKey) } catch { /* nothing to clean up */ }
    setDone(true)
  }

  if (done) {
    return (
      <Shell round={roundName} rail={null}>
        <div className="gt-slide">
          <div className="gt-game-head">
            <div className="gt-kicker">Card filed</div>
            <h2>That&apos;s in, {who}.</h2>
          </div>
          <p className="gt-note">
            Your {roundName.toLowerCase()} picks are sealed until Joey closes the
            round. Come back then for the winners and the next set.
          </p>
          <div className="gt-review">
            {games.map((g) => {
              const pick = picks[g.id]
              const winner = pick === g.home?.seed ? g.home : g.away
              const loser = pick === g.home?.seed ? g.away : g.home
              return (
                <div className="gt-review-row" key={g.id}>
                  <b>{winner ? label(winner) : ''}</b>
                  <s>{loser ? label(loser) : ''}</s>
                </div>
              )
            })}
          </div>
        </div>
      </Shell>
    )
  }

  // ── Step 0: who is this ──
  if (at === 0) {
    return (
      <Shell round={roundName} rail={{ at: 0, total }}>
        <div className="gt-slide">
          <div className="gt-game-head">
            <div className="gt-kicker">{roundName}</div>
            <h2>Who&apos;s voting?</h2>
          </div>
          <div className="gt-names">
            {roster.map((name) => (
              <button
                key={name}
                type="button"
                className={`gt-name${who === name ? ' is-on' : ''}`}
                disabled={taken.has(name)}
                onClick={() => setWho(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="gt-note" style={{ marginTop: '.9rem' }}>
            {taken.size
              ? `${taken.size} of ${roster.length} already voted this round. Crossed-out names are in.`
              : 'One card each. Pick your name and it locks when you send.'}
          </p>
          {error && <div className="gt-err">{error}</div>}
          <div className="gt-actions">
            <button className="gt-btn" disabled={!who} onClick={() => setStep(1)}>
              Start
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  // ── Last step: review ──
  if (at === total - 1) {
    return (
      <Shell round={roundName} rail={{ at: total - 1, total }}>
        <div className="gt-slide">
          <div className="gt-game-head">
            <div className="gt-kicker">Last look</div>
            <h2>{called} of {games.length} called</h2>
          </div>
          <div className="gt-review">
            {games.map((g, i) => {
              const pick = picks[g.id]
              const winner = pick === g.home?.seed ? g.home : pick === g.away?.seed ? g.away : null
              const loser = pick === g.home?.seed ? g.away : pick === g.away?.seed ? g.home : null
              return (
                <div className="gt-review-row" key={g.id}>
                  {winner ? (
                    <>
                      <b>{label(winner)}</b>
                      <s>{loser ? label(loser) : ''}</s>
                    </>
                  ) : (
                    <b className="gt-tbd">
                      {g.home ? label(g.home) : ''} vs {g.away ? label(g.away) : ''}
                    </b>
                  )}
                  <button className="gt-review-edit" onClick={() => setStep(i + 1)}>
                    {winner ? 'change' : 'call it'}
                  </button>
                </div>
              )
            })}
          </div>
          {error && <div className="gt-err">{error}</div>}
          <div className="gt-actions">
            <button className="gt-btn is-ghost" onClick={() => setStep(total - 2)}>Back</button>
            <button className="gt-btn" disabled={called < games.length || sending} onClick={send}>
              {sending ? 'Sending' : called < games.length ? `${games.length - called} left` : 'Send it'}
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  // ── A game ──
  const game = games[at - 1]
  const pick = picks[game.id]
  const choose = (seed: number) => {
    setPicks((p) => ({ ...p, [game.id]: seed }))
    // Move on by itself, so the whole round is one tap per game.
    setTimeout(() => setStep(at + 1), 180)
  }

  return (
    <Shell round={roundName} rail={{ at, total }}>
      <div className="gt-slide" key={game.id}>
        <div className="gt-game-head">
          <div className="gt-kicker">{roundName} · game {at} of {games.length}</div>
          <h2>Which one wins?</h2>
        </div>
        <div className="gt-pair">
          <div className="gt-vs">tap the one that survives</div>
          {[game.home, game.away].map((t) =>
            t ? (
              <TeamCard key={t.seed} team={t} picked={pick === t.seed} onPick={() => choose(t.seed)} />
            ) : null,
          )}
        </div>
        <div className="gt-actions">
          <button className="gt-btn is-ghost" onClick={() => setStep(at - 1)}>Back</button>
          <button className="gt-btn" disabled={!pick} onClick={() => setStep(at + 1)}>
            {pick ? 'Next' : 'Pick one'}
          </button>
        </div>
      </div>
    </Shell>
  )
}

function TeamCard({ team, picked, onPick }: { team: GoatTeam; picked: boolean; onPick: () => void }) {
  return (
    <button type="button" className={`gt-team${picked ? ' is-picked' : ''}`} onClick={onPick}>
      <div className="gt-team-top">
        <span className="gt-seed">{team.seed}</span>
        <span>{finishLine(team)}</span>
      </div>
      <h3>{label(team)}</h3>
      <div className="gt-team-team">{team.team}</div>
      <div className="gt-figs">
        <div className="gt-fig"><b>{record(team)}</b><span>rec</span></div>
        <div className="gt-fig"><b>{team.ppg}</b><span>a week</span></div>
        <div className="gt-fig"><b>{team.index.toFixed(2)}</b><span>vs era</span></div>
        <div className="gt-fig"><b>{team.high}</b><span>best wk</span></div>
      </div>
      <p className="gt-case">{team.case}</p>
      {team.autoBid && <span className="gt-ring">Champion · automatic bid</span>}
    </button>
  )
}

function Shell({
  round, rail, children,
}: {
  round: string
  rail: { at: number; total: number } | null
  children: React.ReactNode
}) {
  return (
    <div className="gt">
      <div className="gt-shell">
        <div className="gt-head">
          <div className="gt-kicker">PA Milk Society</div>
          <h1>The <em>greatest</em> team we&apos;ve had</h1>
          <div className="gt-sub">{round}</div>
        </div>
        {rail && (
          <div className="gt-rail">
            <div className="gt-rail-track">
              <div className="gt-rail-fill" style={{ width: `${(rail.at / (rail.total - 1)) * 100}%` }} />
            </div>
            <div className="gt-rail-count">{rail.at} / {rail.total - 1}</div>
          </div>
        )}
        <div className="gt-stage">{children}</div>
        <div className="gt-foot">PA Milk Society · sixteen teams · one winner</div>
      </div>
    </div>
  )
}

export type { ResolvedGame }
