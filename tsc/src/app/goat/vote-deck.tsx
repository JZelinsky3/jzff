'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ROUNDS, breakdown, buildBracket, finishLine, gamesInRound, label, pts, record, vsLeague,
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
  // Steps: intro, name, one per game, then review.
  const total = games.length + 3
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
                  <span className="gt-review-beat">over</span>
                  <s>{loser ? label(loser) : ''}</s>
                </div>
              )
            })}
          </div>
        </div>
      </Shell>
    )
  }

  // ── Step 0: what this is ──
  if (at === 0) {
    return (
      <Shell round={roundName} rail={null}>
        <div className="gt-slide">
          <div className="gt-game-head">
            <div className="gt-kicker">How this works</div>
            <h2>Who had the best team ever?</h2>
          </div>
          <p className="gt-note">
            Not the best manager and not the best season. The best single team
            anybody has ever put on the field, out of every roster played since
            2019. Sixteen of them, seeded on record, scoring and where the
            season finished.
          </p>
          <p className="gt-note">
            Four rounds. You get one card per round, and it stays sealed until
            everybody is in.
          </p>
          <p className="gt-note">
            One number on the cards is worth knowing: <b>vs league avg</b> is how
            far above or below the average team that team scored in its own
            season. <b>+17%</b> means it put up seventeen per cent more a week
            than everybody else did that year. The league has never scored the
            same way twice, so raw points can&apos;t compare across eras.
          </p>

          <Ladder round={round} />

          <div className="gt-actions">
            <button className="gt-btn" onClick={() => setStep(1)}>Start</button>
          </div>
        </div>
      </Shell>
    )
  }

  // ── Step 1: who is this ──
  if (at === 1) {
    return (
      <Shell round={roundName} rail={{ at: 1, total }}>
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
            <button className="gt-btn is-ghost" onClick={() => setStep(0)}>Back</button>
            <button className="gt-btn" disabled={!who} onClick={() => setStep(2)}>
              Next
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
                      <span className="gt-review-beat">over</span>
                      <s>{loser ? label(loser) : ''}</s>
                    </>
                  ) : (
                    <b className="gt-tbd">
                      {g.home ? label(g.home) : ''} vs {g.away ? label(g.away) : ''}
                    </b>
                  )}
                  <button className="gt-review-edit" onClick={() => setStep(i + 2)}>
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
  const game = games[at - 2]
  const pick = picks[game.id]
  // Selecting does NOT advance. These are two rosters to read side by side and
  // change your mind about; a card that jumped forward on first tap took the
  // decision away before it had been made.
  const choose = (seed: number) => setPicks((p) => ({ ...p, [game.id]: seed }))

  return (
    <Shell round={roundName} rail={{ at, total }}>
      <div className="gt-slide" key={game.id}>
        <div className="gt-game-head">
          <div className="gt-kicker">{roundName} · game {at - 1} of {games.length}</div>
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
            {pick ? (at - 1 === games.length ? 'Review' : 'Next') : 'Pick one'}
          </button>
        </div>
      </div>
    </Shell>
  )
}

/**
 * One team, as a team sheet: a banner with the seed and how the year ended,
 * the four season figures, then the starting lineup with each player's rate
 * and where they finished at their position. The whole card is the button.
 */
/**
 * The four rounds as a ladder, with the live one lit. No teams on it: at this
 * point the voter wants to know how long the thing runs and where tonight sits
 * in it, not who plays who.
 */
function Ladder({ round }: { round: RoundId }) {
  const at = ROUNDS.findIndex((r) => r.id === round)
  return (
    <ol className="gt-ladder">
      {ROUNDS.map((r, i) => (
        <li
          key={r.id}
          className={`gt-rung${i === at ? ' is-now' : ''}${i < at ? ' is-done' : ''}`}
        >
          <span className="gt-rung-name">{r.name}</span>
          <span className="gt-rung-games">
            {r.games} {r.games === 1 ? 'game' : 'games'}
          </span>
        </li>
      ))}
    </ol>
  )
}

function TeamCard({ team, picked, onPick }: { team: GoatTeam; picked: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      className={`gt-team${picked ? ' is-picked' : ''}`}
      onClick={onPick}
      aria-pressed={picked}
    >
      <div className={`gt-team-band${team.finish === 'champion' ? ' is-champ' : ''}`}>
        <span className="gt-seed">{team.seed}</span>
        <span className="gt-team-finish">{finishLine(team)}</span>
        {/* No automatic bids: a ring is a fact about the season, not a
            reason this team is in the field. */}
        {team.finish === 'champion' && <span className="gt-team-ring">ring</span>}
      </div>

      <div className="gt-team-id">
        <h3>{label(team)}</h3>
        <div className="gt-team-team">&ldquo;{team.team}&rdquo;</div>
      </div>

      <div className="gt-figs">
        <div className="gt-fig"><b>{record(team)}</b><span>record</span></div>
        <div className="gt-fig"><b>{pts(team.ppg)}</b><span>a week</span></div>
        <div className="gt-fig gt-fig--wide"><b>{vsLeague(team.index)}</b><span>vs league avg<br />that season</span></div>
        <div className="gt-fig"><b>{team.high}</b><span>best wk</span></div>
      </div>

      {/* Why this team is this seed. The lineup below describes the roster; it
          does not explain the seeding, and a WR41 next to a 1 seed reads as a
          mistake until you can see the score it was actually built from. */}
      <div className="gt-why">
        <span className="gt-why-total">{team.resume.toFixed(1)}</span>
        <span className="gt-why-parts">
          <i className="gt-why-rec">{breakdown(team).record.toFixed(1)} record</i>
          <i className="gt-why-sco">{breakdown(team).scoring.toFixed(1)} scoring</i>
          <i className="gt-why-post">{breakdown(team).post.toFixed(1)} placement</i>
        </span>
      </div>

      {/* The lineup is the argument: team averages don't tell you whether a
          season was a QB1 carrying two WR40s or a roster deep everywhere. */}
      <div className="gt-lineup">
        <div className="gt-lineup-head">
          <span>Best lineup they started</span>
          <span>ppg</span>
        </div>
        {team.lineup.map((p) => (
          <div className="gt-lu-row" key={p.s + p.n}>
            <i className={`gt-slot gt-slot-${p.p}`}>{p.s}</i>
            <span className="gt-lu-name">
              <b>{p.n}</b>
              <em>{p.rk ? `${p.rk} · ` : ''}{p.g} starts</em>
            </span>
            {/* Always one decimal, so the column reads as a column: a bare
                "19" next to a "12.2" breaks the alignment tabular-nums is
                there to hold. */}
            <span className="gt-lu-ppg">{pts(p.ppg)}</span>
          </div>
        ))}
      </div>

      <p className="gt-case">{team.case}</p>
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
