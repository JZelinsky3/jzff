'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MIN_STARTS, ROUNDS, breakdown, buildBracket, finishLine, gamesInRound, label, pts, record, vsLeague,
  type Ballot, type GameScore, type GoatTeam, type ResolvedGame, type Results, type RoundId,
  type VoteRecord,
} from '@/lib/greatestTeam'
import { readMyCard, submitBallot } from './actions'
import { FinalPreview, Tape } from './final'
import { Recap } from './recap'

/** 1 -> "1st". Used for the rank context under the figures. */
function ordinal(n: number): string {
  const t = n % 100
  if (t >= 11 && t <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/**
 * One round's card, one game per screen. The deck is client-only (see
 * ./vote-client) because it restores a saved draft from the device on first
 * render, which the server cannot do without guaranteeing a mismatch.
 */
export function VoteDeck({
  leagueId, token, round, results, roster, alreadyVoted, scores,
}: {
  leagueId: string
  token: string
  round: RoundId
  results: Results
  roster: readonly string[]
  alreadyVoted: string[]
  scores: Record<string, GameScore>
}) {
  const bracket = useMemo(() => buildBracket(results), [results])
  const games = useMemo(
    () => gamesInRound(bracket, round).filter((g) => g.ready && g.winner === null),
    [bracket, round],
  )
  const roundName = ROUNDS.find((r) => r.id === round)?.name ?? 'The bracket'
  // The last round is dressed as the last round. Everything downstream of this
  // flag is presentation: same bracket, same rules, different room.
  const isFinal = round === 'final'
  // Draft is keyed by round, so last round's answers can't bleed into this one.
  const draftKey = `gt-draft-${round}`
  // Who this device is. Survives the round, so a phone that voted in the
  // semifinals is offered its own card back without having to claim a name.
  const meKey = 'gt-me'

  const [who, setWho] = useState('')
  const [picks, setPicks] = useState<Ballot>({})
  const [step, setStep] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [me, setMe] = useState('')
  /** Their own cards, every round, once fetched. Null until then. */
  const [card, setCard] = useState<VoteRecord[] | null>(null)
  const [loadingCard, setLoadingCard] = useState(false)

  // Restore whatever this device had in progress.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || '{}')
      if (saved && typeof saved === 'object') {
        if (typeof saved.who === 'string') setWho(saved.who)
        if (saved.picks && typeof saved.picks === 'object') setPicks(saved.picks)
      }
      const mine = localStorage.getItem(meKey)
      if (mine) setMe(mine)
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

  /** Pull this device's own cards back out for the receipt. */
  async function loadCard(name: string) {
    setLoadingCard(true)
    const res = await readMyCard({ leagueId, token, name })
    setLoadingCard(false)
    // A receipt that failed to load is not worth an error screen: the card is
    // filed either way, and the fallback below still shows the round just cast.
    setCard(res.ok ? res.votes : [])
  }

  async function send() {
    setSending(true)
    setError('')
    const res = await submitBallot({ leagueId, token, managerName: who, picks })
    setSending(false)
    if (!res.ok) { setError(res.error); return }
    try {
      localStorage.removeItem(draftKey)
      localStorage.setItem(meKey, who)
    } catch { /* nothing to clean up */ }
    setMe(who)
    setDone(true)
    void loadCard(who)
  }

  if (done || (card && card.length)) {
    const name = done ? who : me
    // The receipt reads from the server so it can grade every earlier round.
    // Until it lands, the round just filed stands in, so nothing flashes empty.
    const fallback: VoteRecord[] = [{ name, round, picks }]
    return (
      <Shell round={roundName} rail={null} isFinal={isFinal}>
        <Recap
          name={name}
          filedRound={round}
          results={results}
          votes={card && card.length ? card : fallback}
        />
      </Shell>
    )
  }

  // Somebody who already filed, coming back to the same link. Offered their own
  // card, never anybody else's.
  const backAgain = !!me && taken.has(me)

  // ── Step 0: what this is ──
  // The final gets its own opening: by now nobody needs the rules explained,
  // and what they want on the screen is the two teams left.
  if (at === 0 && isFinal) {
    const game = games[0] ?? gamesInRound(bracket, 'final')[0]
    return (
      <Shell round={roundName} rail={null} isFinal>
        <div className="gt-slide">
          <div className="gt-game-head">
            <div className="gt-kicker">Two left</div>
            <h2>One game decides it.</h2>
          </div>
          {game && <FinalPreview bracket={bracket} game={game} scores={scores} />}
          <p className="gt-note">
            Fourteen teams are out. Whichever of these two the room calls is the
            greatest team anybody in this league has ever put on the field, and
            it stays that way until somebody builds a better one.
          </p>
          {/* Two rows on the tape are built rather than recorded, and neither
              means anything until somebody says what it is. */}
          <p className="gt-note">
            Two lines on the tape are worth a sentence.{' '}
            <b>Beat, week to week</b> is what their record would have been
            against the whole league every week instead of the one team the
            schedule gave them, so it is the season with the luck taken out.{' '}
            <b>Up on the regular season</b> is how many more points a week they
            scored once the bracket started.
          </p>
          {backAgain && <SeenIt name={me} loading={loadingCard} onOpen={() => loadCard(me)} />}
          <div className="gt-actions">
            <button className="gt-btn" onClick={() => setStep(1)}>Make the call</button>
          </div>
        </div>
      </Shell>
    )
  }

  if (at === 0) {
    return (
      <Shell round={roundName} rail={null} isFinal={isFinal}>
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
            season.{' '}<b>+17%</b>{' '}means it put up seventeen percent more a week
            than everybody else did that year. The league has never scored the
            same way twice, so raw points can&apos;t compare across eras.
          </p>
          <p className="gt-note">
            Both that and the weekly average count the regular season{' '}
            <b>and</b> the real playoff games. Consolation and placement games
            are thrown out, so nothing a team did after it was eliminated
            counts for anything.
          </p>

          <Ladder round={round} />

          {backAgain && <SeenIt name={me} loading={loadingCard} onOpen={() => loadCard(me)} />}

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
      <Shell round={roundName} rail={{ at: 1, total }} isFinal={isFinal}>
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
      <Shell round={roundName} rail={{ at: total - 1, total }} isFinal={isFinal}>
        <div className="gt-slide">
          <div className="gt-game-head">
            <div className="gt-kicker">Last look</div>
            <h2>{isFinal ? 'One call, and that’s the league’s answer' : `${called} of ${games.length} called`}</h2>
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
              {sending
                ? 'Sending'
                : called < games.length
                ? `${games.length - called} left`
                : isFinal
                ? 'Seal it'
                : 'Send it'}
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
    <Shell round={roundName} rail={{ at, total }} isFinal={isFinal}>
      <div className="gt-slide" key={game.id}>
        <div className="gt-game-head">
          <div className="gt-kicker">
            {isFinal ? 'For the whole thing' : `${roundName} · game ${at - 1} of ${games.length}`}
          </div>
          <h2>{isFinal ? 'Which one is the greatest?' : 'Which one wins?'}</h2>
        </div>
        {/* The tape again, right above the two cards. On the final the numbers
            are the argument, and making somebody scroll back to the opening
            screen for them is how a card gets filled in from memory. */}
        {isFinal && game.home && game.away && <Tape home={game.home} away={game.away} />}
        <Pair
          game={game}
          pick={pick}
          onPick={choose}
          hint={isFinal ? 'tap the greatest team we have had' : 'tap the one that survives'}
        />
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
 * The two teams, as one card at a time.
 *
 * They used to sit stacked, which meant comparing them was a long scroll down
 * and a longer scroll back, and by the time you reached the second lineup you
 * were remembering the first rather than reading it. Now they are a deck you
 * swipe: one card fills the screen, the other is a thumb away, and the tabs
 * above stay put so you always know which one you are looking at and can jump
 * straight to the other.
 *
 * Wide screens skip all of it and go back to two columns, where side by side
 * is genuinely side by side.
 */
function Pair({
  game, pick, onPick, hint,
}: {
  game: ResolvedGame
  pick: number | undefined
  onPick: (seed: number) => void
  hint: string
}) {
  const teams = [game.home, game.away].filter((t): t is GoatTeam => !!t)
  const track = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)

  // Which card is under the thumb. Read off the scroller rather than held as
  // the source of truth, so a flick and a tab tap can never disagree.
  function onScroll() {
    const el = track.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    setAt(Math.max(0, Math.min(teams.length - 1, i)))
  }

  function go(i: number) {
    const el = track.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="gt-swipe">
      <div className="gt-swipe-tabs">
        {teams.map((t, i) => (
          <button
            key={t.seed}
            type="button"
            className={`gt-swipe-tab${i === at ? ' is-on' : ''}${pick === t.seed ? ' is-picked' : ''}`}
            onClick={() => go(i)}
            aria-current={i === at}
          >
            {/* The chevron points at the card you are not on, which is the
                whole instruction this control needs to give. */}
            {i === 0 && at !== 0 && <em aria-hidden>‹</em>}
            <span>{label(t)}</span>
            {i === 1 && at !== 1 && <em aria-hidden>›</em>}
          </button>
        ))}
      </div>

      <div className="gt-vs">
        <span className="gt-vs-swipe">swipe to compare</span>
        <span className="gt-vs-tap">{hint}</span>
      </div>

      <div className="gt-pair" ref={track} onScroll={onScroll}>
        {teams.map((t) => (
          <TeamCard key={t.seed} team={t} picked={pick === t.seed} onPick={() => onPick(t.seed)} />
        ))}
      </div>
    </div>
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

      {/* Every number that isn't self-explaining carries its rank, because
          "+17%" means nothing until you know whether that is good. */}
      <div className="gt-figs">
        <div className="gt-fig">
          <b>{record(team)}</b>
          <span>record</span>
        </div>
        <div className="gt-fig">
          <b>{pts(team.ppg)}</b>
          <span>a week</span>
          <i>{ordinal(team.ppgRank)} of {team.seasonTeams} that year</i>
        </div>
        <div className="gt-fig">
          <b>{vsLeague(team.index)}</b>
          <span>vs league avg</span>
          <i>{ordinal(team.indexRank)} best of 86 ever</i>
        </div>
        <div className="gt-fig">
          <b>{team.high}</b>
          <span>best week</span>
        </div>
      </div>

      {/* Why this team is this seed. The lineup below describes the roster; it
          does not explain the seeding, and a WR41 next to a 1 seed reads as a
          mistake until you can see the score it was actually built from. */}
      <div className="gt-why">
        {/* No rank under the total: the seed on the banner already is it. */}
        <span className="gt-why-total">
          <b>{team.resume.toFixed(1)}</b>
          <em>score</em>
        </span>
        <span className="gt-why-parts">
          <span className="gt-why-part gt-why-rec">
            <b>{breakdown(team).record.toFixed(1)}</b>
            <em>record</em>
            <i>{ordinal(team.recRank)}</i>
          </span>
          <span className="gt-why-part gt-why-sco">
            <b>{breakdown(team).scoring.toFixed(1)}</b>
            <em>scoring</em>
            <i>{ordinal(team.scoRank)}</i>
          </span>
          <span className="gt-why-part gt-why-post">
            <b>{breakdown(team).post.toFixed(1)}</b>
            <em>placement</em>
            <i>{ordinal(team.postRank)}</i>
          </span>
        </span>
      </div>

      {/* The lineup is the argument: team averages don't tell you whether a
          season was a QB1 carrying two WR40s or a roster deep everywhere. */}
      <div className="gt-lineup">
        <div className="gt-lineup-head">
          <span>Best lineup they started</span>
          <span>ppg</span>
        </div>
        {team.lineup.map((p, i) => (
          <div className={`gt-lu-row${p.n ? '' : ' is-empty'}`} key={p.s + (p.n ?? i)}>
            <i className={`gt-slot gt-slot-${p.p}`}>{p.s}</i>
            <span className="gt-lu-name">
              {/* A fixed slot nobody started six times stays empty on purpose. */}
              <b>{p.n ?? 'No settled starter'}</b>
              <em>
                {p.n
                  ? `${p.rk ? `${p.rk} · ` : ''}${p.g} starts`
                  : `nobody started ${MIN_STARTS}+ here`}
              </em>
            </span>
            {/* Always one decimal, so the column reads as a column: a bare
                "19" next to a "12.2" breaks the alignment tabular-nums is
                there to hold. */}
            <span className="gt-lu-ppg">{p.n ? pts(p.ppg) : '\u2014'}</span>
          </div>
        ))}
      </div>

      <p className="gt-case">{team.case}</p>
    </button>
  )
}

/**
 * The way back into a card already filed. Only ever offers the name this
 * device submitted with: the tallies stay sealed, and a link that let you read
 * somebody else's live picks would not be a sealed vote at all.
 */
function SeenIt({ name, loading, onOpen }: { name: string; loading: boolean; onOpen: () => void }) {
  return (
    <div className="gt-seenit">
      <span>
        You&apos;re already in this round, <b>{name}</b>.
      </span>
      <button type="button" onClick={onOpen} disabled={loading}>
        {loading ? 'Opening' : 'See your card'}
      </button>
    </div>
  )
}

function Shell({
  round, rail, isFinal, children,
}: {
  round: string
  rail: { at: number; total: number } | null
  isFinal?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`gt${isFinal ? ' is-final' : ''}`}>
      <div className="gt-shell">
        <div className="gt-head">
          <div className="gt-kicker">
            {isFinal ? 'PA Milk Society · the championship' : 'PA Milk Society'}
          </div>
          {isFinal ? (
            <h1>The <em>Final</em></h1>
          ) : (
            <h1>The <em>greatest</em> team we&apos;ve had</h1>
          )}
          <div className="gt-sub">{isFinal ? 'Greatest team in league history' : round}</div>
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
        <div className="gt-foot">
          {isFinal ? 'Sixteen went in · two are left · one is the answer' : 'PA Milk Society · sixteen teams · one winner'}
        </div>
      </div>
    </div>
  )
}

export type { ResolvedGame }
