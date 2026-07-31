'use client'

// Guess the Draft — the board.
//
// Eight redacted manager-seasons arrive in one call to /api/games/guess-the-draft
// and the whole run is played in the browser from there. Each round shows one
// team's evidence with the name taken out, and the reader answers twice: whose
// team, and which year. Both are locked in together, because answering them
// one at a time would let the first answer be walked back once the second one
// made it obvious.
//
// Scored three ways on purpose. A point for the manager and a point for the
// year mean a half-right round still counts for something, and the third
// point for getting both in the same round is what makes a clean call feel
// like one. Sixteen out of twenty-four is a good night; twenty-four is a
// story.
//
// The deal is seeded, so a run is a link: anyone opening ?seed=XXXX plays the
// identical eight cards in the identical order and can be beaten honestly.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { GuessDraftDeal } from '@/lib/minigames/guessDraft'
import {
  ROUNDS,
  PTS_MANAGER,
  PTS_YEAR,
  PTS_SWEEP,
  PTS_PERFECT,
} from '@/lib/minigames/guessDraft'
import { OwnLeagueCta } from '../OwnLeagueCta'
import styles from './guess.module.css'

type Verdict = { manager: boolean; year: boolean }

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
}

function roundPoints(v: Verdict): number {
  return (
    (v.manager ? PTS_MANAGER : 0) +
    (v.year ? PTS_YEAR : 0) +
    (v.manager && v.year ? PTS_SWEEP : 0)
  )
}

// Read out at the end, so they're written to be quoted back at somebody.
function grade(pts: number): { title: string; line: string } {
  const pct = pts / PTS_PERFECT
  if (pts === PTS_PERFECT) {
    return {
      title: 'A perfect card',
      line: 'Eight for eight, name and year. Nobody in this league can tell you anything.',
    }
  }
  if (pct >= 0.8) return { title: 'Total recall', line: 'You have been paying attention for years.' }
  if (pct >= 0.6) return { title: "The commissioner's memory", line: 'You know this room and you know its habits.' }
  if (pct >= 0.4) return { title: 'A good guess or two', line: 'Enough right to argue about, not enough to gloat.' }
  if (pct >= 0.2) return { title: 'Vaguely familiar', line: 'You have been in the group chat, at least.' }
  return { title: 'A stranger here', line: 'Sit in on a draft sometime.' }
}

/**
 * Takes the seed back out of the address bar.
 *
 * Same reasoning as the Roulette board: the seed is only a URL concern when a
 * run is being shared. Leaving it there makes a refresh replay the card you
 * just finished and turns the back arrow into a walk through every card you
 * have played.
 */
function clearSeedFromUrl() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('seed')) return
    for (const key of ['seed', 'pts']) url.searchParams.delete(key)
    window.history.replaceState(null, '', url)
  } catch {
    /* no history access, harmless */
  }
}

export function GuessTheDraft({
  initialDeal,
  initialError,
  signedIn,
}: {
  /** Opening card, dealt during SSR so the board is up on first paint. */
  initialDeal: GuessDraftDeal | null
  initialError: string | null
  /** Read on the server, so the final card's CTA can skip the signup step
      for someone who already has an account. */
  signedIn: boolean
}) {
  const [deal, setDeal] = useState<GuessDraftDeal | null>(initialDeal)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)

  const [round, setRound] = useState(0)
  const [pickedManager, setPickedManager] = useState<string | null>(null)
  const [pickedYear, setPickedYear] = useState<number | null>(null)
  const [verdicts, setVerdicts] = useState<Verdict[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    clearSeedFromUrl()
  }, [])

  const card = deal?.cards[round] ?? null
  // A verdict for the round on screen means it has been locked in and is
  // showing its answer; one short means it is still open.
  const revealed = verdicts.length > round
  const thisVerdict = revealed ? verdicts[round] : null
  const done = deal ? verdicts.length >= deal.cards.length : false

  const score = useMemo(() => verdicts.reduce((sum, v) => sum + roundPoints(v), 0), [verdicts])
  const sweeps = useMemo(() => verdicts.filter((v) => v.manager && v.year).length, [verdicts])

  const managerName = useCallback(
    (id: string | null) => deal?.managers.find((m) => m.id === id)?.name ?? '—',
    [deal]
  )

  const lockIn = useCallback(() => {
    if (!card || revealed || pickedManager === null || pickedYear === null) return
    setVerdicts((v) => [
      ...v,
      { manager: pickedManager === card.answer.managerId, year: pickedYear === card.answer.year },
    ])
  }, [card, revealed, pickedManager, pickedYear])

  const nextRound = useCallback(() => {
    setPickedManager(null)
    setPickedYear(null)
    setRound((r) => r + 1)
  }, [])

  const newCard = useCallback(async () => {
    if (!deal) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/games/guess-the-draft?pool=${encodeURIComponent(deal.pool.id)}`, {
        cache: 'no-store',
      })
      const body = await res.json()
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? 'Could not deal a new card.')
      } else {
        setDeal(body as GuessDraftDeal)
        setRound(0)
        setVerdicts([])
        setPickedManager(null)
        setPickedYear(null)
      }
    } catch {
      setError('Could not reach the press room. Try again.')
    } finally {
      setLoading(false)
    }
  }, [deal])

  // The share link carries the seed, so a friend plays the identical eight
  // cards. The score rides along in the text rather than the URL: there is no
  // bespoke preview card for this game yet, and a ?pts= that nothing reads
  // would just be litter in the address bar.
  const shareRun = useCallback(async () => {
    if (!deal) return
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('pool', deal.pool.id)
    url.searchParams.set('seed', deal.seed)
    const line = `I scored ${score} out of ${PTS_PERFECT} on Guess the Draft, ${sweeps} clean calls. Your turn.`
    try {
      if (navigator.share) {
        await navigator.share({ text: line, url: url.toString() })
        return
      }
    } catch {
      /* cancelled or unavailable, fall through to the clipboard */
    }
    try {
      await navigator.clipboard.writeText(`${line} ${url.toString()}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      /* clipboard blocked, the seed is on screen either way */
    }
  }, [deal, score, sweeps])

  // ── Render ──────────────────────────────────────────────────

  if (loading) return <div className={styles.err}>Dealing…</div>

  if (error || !deal) {
    return (
      <div className={styles.err}>
        <p>{error ?? 'Something went wrong.'}</p>
        <Link href="/games/" className={styles.errLink}>
          Back to the Games Page
        </Link>
      </div>
    )
  }

  if (done) {
    const g = grade(score)
    return (
      <div className={styles.board}>
        <div className={styles.final}>
          <div className={styles.finalKicker}>Final</div>
          <div className={styles.finalScore}>
            {score}
            <span className={styles.finalOf}>/ {PTS_PERFECT}</span>
          </div>
          <h2 className={styles.finalTitle}>{g.title}</h2>
          <p className={styles.finalLine}>{g.line}</p>
          <div className={styles.finalStats}>
            <div className={styles.finalStat}>
              <span className={styles.finalStatNum}>{verdicts.filter((v) => v.manager).length}</span>
              <span className={styles.finalStatLabel}>Managers named</span>
            </div>
            <div className={styles.finalStat}>
              <span className={styles.finalStatNum}>{verdicts.filter((v) => v.year).length}</span>
              <span className={styles.finalStatLabel}>Years placed</span>
            </div>
            <div className={styles.finalStat}>
              <span className={styles.finalStatNum}>{sweeps}</span>
              <span className={styles.finalStatLabel}>Clean calls</span>
            </div>
          </div>

          {/* The card-by-card ledger. Worth showing: the round someone missed
              is the round they want to argue about. */}
          <ol className={styles.ledger}>
            {deal.cards.map((c, i) => {
              const v = verdicts[i]
              return (
                <li key={c.key} className={styles.ledgerRow}>
                  <span className={styles.ledgerNum}>{i + 1}</span>
                  <span className={styles.ledgerName}>
                    {managerName(c.answer.managerId)}, {c.answer.year}
                  </span>
                  <span className={styles.ledgerMarks}>
                    <span className={v?.manager ? styles.markHit : styles.markMiss}>Name</span>
                    <span className={v?.year ? styles.markHit : styles.markMiss}>Year</span>
                  </span>
                  <span className={styles.ledgerPts}>{v ? roundPoints(v) : 0}</span>
                </li>
              )
            })}
          </ol>

          <div className={styles.finalActions}>
            <button type="button" className={styles.btn} onClick={() => void newCard()}>
              New card
            </button>
            <button type="button" className={styles.btnGhost} onClick={() => void shareRun()}>
              {copied ? 'Link copied' : 'Share this card'}
            </button>
          </div>
          <p className={styles.seedNote}>
            Card {deal.seed}, dealt from {deal.deckSize} seasons on the books.
          </p>
          {/* The demo is the ONLY pool this game offers without a league of
              your own, so on a demo run the pitch isn't a pitch: the version
              worth playing is the one with names you recognise. */}
          {deal.pool.id === 'demo' && (
            <OwnLeagueCta
              signedIn={signedIn}
              line="You just guessed at strangers. On your own league these are people you drafted against."
            />
          )}
        </div>
      </div>
    )
  }

  if (!card) return null

  const answer = card.answer
  const record = `${answer.wins}-${answer.losses}${answer.ties ? `-${answer.ties}` : ''}`

  return (
    <div className={styles.board}>
      {/* Running header: which round, and what it has cost so far. */}
      <div className={styles.strip}>
        <div className={styles.stripRounds}>
          {deal.cards.map((c, i) => (
            <span
              key={c.key}
              className={
                i === round
                  ? styles.pipNow
                  : verdicts[i]
                    ? verdicts[i].manager && verdicts[i].year
                      ? styles.pipSweep
                      : verdicts[i].manager || verdicts[i].year
                        ? styles.pipHalf
                        : styles.pipMiss
                    : styles.pip
              }
              aria-hidden
            />
          ))}
        </div>
        <div className={styles.stripScore}>
          <span className={styles.stripScoreNum}>{score}</span>
          <span className={styles.stripScoreOf}>/ {PTS_PERFECT}</span>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardNo}>
            Draft no. {round + 1} of {ROUNDS}
          </span>
          <span className={styles.cardKind}>A draft, redacted</span>
        </div>

        <p className={styles.cardLede}>
          These were the first {card.picks.length} picks one manager made in one season of{' '}
          {deal.pool.label}. Everything else has been taken out.
        </p>

        <ol className={styles.picks}>
          {card.picks.map((p, i) => (
            <li key={`${p.name}-${i}`} className={styles.pick}>
              <span className={styles.pickRound}>R{p.round}</span>
              <span className={styles.pickName}>{p.name}</span>
              <span className={styles.pickPos} data-pos={p.pos}>
                {p.pos}
              </span>
              <span className={styles.pickTeam}>{p.nflTeam ?? ''}</span>
            </li>
          ))}
        </ol>
      </div>

      {revealed && thisVerdict ? (
        <div className={styles.reveal}>
          <div className={styles.revealHead}>
            <span className={thisVerdict.manager && thisVerdict.year ? styles.revealTagSweep : styles.revealTag}>
              {thisVerdict.manager && thisVerdict.year
                ? 'Clean call'
                : thisVerdict.manager || thisVerdict.year
                  ? 'Half right'
                  : 'Nowhere close'}
            </span>
            <span className={styles.revealPts}>
              +{roundPoints(thisVerdict)}
            </span>
          </div>

          <div className={styles.revealAnswer}>
            <span className={styles.revealName}>{managerName(answer.managerId)}</span>
            <span className={styles.revealYear}>{answer.year}</span>
          </div>
          {answer.teamName && <div className={styles.revealTeam}>{answer.teamName}</div>}
          <div className={styles.revealLine}>
            Went {record}
            {answer.finalRank ? `, finished ${ordinal(answer.finalRank)}` : ''}
            {answer.isChampion ? '. Won the thing.' : '.'}
          </div>

          <div className={styles.revealGuesses}>
            <div className={thisVerdict.manager ? styles.guessHit : styles.guessMiss}>
              <span className={styles.guessLabel}>You said</span>
              <span className={styles.guessValue}>{managerName(pickedManager)}</span>
            </div>
            <div className={thisVerdict.year ? styles.guessHit : styles.guessMiss}>
              <span className={styles.guessLabel}>You said</span>
              <span className={styles.guessValue}>{pickedYear ?? '—'}</span>
            </div>
          </div>

          <button type="button" className={styles.btn} onClick={nextRound}>
            {round + 1 >= deal.cards.length ? 'See the final' : 'Next item'}
          </button>
        </div>
      ) : (
        <div className={styles.answers}>
          <div className={styles.ask}>
            <span className={styles.askLabel}>Whose draft was this?</span>
            <div className={styles.pills}>
              {deal.managers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={pickedManager === m.id ? styles.pillOn : styles.pill}
                  onClick={() => setPickedManager(m.id)}
                  aria-pressed={pickedManager === m.id}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.ask}>
            <span className={styles.askLabel}>What year?</span>
            <div className={styles.pills}>
              {deal.years.map((y) => (
                <button
                  key={y}
                  type="button"
                  className={pickedYear === y ? styles.pillOnNum : styles.pillNum}
                  onClick={() => setPickedYear(y)}
                  aria-pressed={pickedYear === y}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Both halves lock together. Answering one at a time would let the
              first be revised once the second gave it away, which is the
              whole difficulty of the game. */}
          <button
            type="button"
            className={pickedManager !== null && pickedYear !== null ? styles.btn : styles.btnOff}
            onClick={lockIn}
            disabled={pickedManager === null || pickedYear === null}
          >
            {pickedManager === null && pickedYear === null
              ? 'Name them and date it'
              : pickedManager === null
                ? 'Still need a name'
                : pickedYear === null
                  ? 'Still need a year'
                  : 'Lock it in'}
          </button>
        </div>
      )}
    </div>
  )
}
