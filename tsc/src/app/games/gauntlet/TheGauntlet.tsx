'use client'

// The Gauntlet — the board.
//
// One question on screen at a time and nothing else, because the game is a
// nerve game and anything else in the frame is an invitation to stop. It's set
// as a BOX SCORE: the week and the season in a header bar welded to two
// full-width team rows, a "vs" between them, and a score column that is
// present but blank until you call it. Two panels side by side read as
// multiple choice; a fixture reads as a result you're being asked to remember.
//
// Records are hidden until the call. Shown up front they answer the question
// more often than not — 7-1 against 2-6 is a favourite, not a read — and the
// game is meant to be about remembering the week. They arrive with the scores,
// where they're the context that makes a result worth reacting to.
//
// TWO MODES, and the second one exists because pure sudden death was a bad
// deal: a run could end four seconds in and then make you wait on a fresh deck
// before trying again. `ten` is a fixed card where a miss costs one of ten;
// `endless` is the original. The other half of that fix is the prefetch below —
// the next deck is fetched while you're still playing, so "Go again" is
// instant either way.
//
// The run is seeded, so a link hands someone the identical questions in the
// identical order and a score can be beaten honestly.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type {
  GauntletDeal,
  GauntletQuestion,
  GauntletSide,
  GauntletMode,
} from '@/lib/minigames/gauntlet'
import { recordLine, streakGrade, setGrade } from '@/lib/minigames/gauntlet'
import { OwnLeagueCta } from '../OwnLeagueCta'
import { Verdict } from '../Verdict'
import styles from './gauntlet.module.css'

/** Takes the seed back out of the address bar. Same reasoning as the other
    boards: left there, a refresh replays the run you just lost. */
function clearSeedFromUrl() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('seed')) return
    url.searchParams.delete('seed')
    window.history.replaceState(null, '', url)
  } catch {
    /* no URL to tidy, which is fine */
  }
}

function teamLabel(side: GauntletSide): string {
  return side.teamName ?? side.managerName
}

function Face({ side }: { side: GauntletSide }) {
  const [ok, setOk] = useState(true)
  return (
    <span className={styles.face}>
      {side.avatarUrl && ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.faceImg}
          src={side.avatarUrl}
          alt=""
          loading="lazy"
          onError={() => setOk(false)}
        />
      ) : (
        <span className={styles.faceLetter} aria-hidden>
          {teamLabel(side).charAt(0)}
        </span>
      )}
    </span>
  )
}

export function TheGauntlet({
  initialDeal,
  initialError,
  signedIn,
}: {
  initialDeal: GauntletDeal | null
  initialError: string | null
  signedIn: boolean
}) {
  const [deal, setDeal] = useState<GauntletDeal | null>(initialDeal)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)

  const [round, setRound] = useState(0)
  const [called, setCalled] = useState<'a' | 'b' | null>(null)
  const [streak, setStreak] = useState(0)
  const [hits, setHits] = useState(0)
  const [over, setOver] = useState(false)
  const [endedOn, setEndedOn] = useState<GauntletQuestion | null>(null)
  const [copied, setCopied] = useState(false)

  // The next run, fetched while this one is still being played. Sudden death
  // means a run can end at any moment, and waiting on a deck at exactly the
  // moment somebody wants to go again is where the appetite goes.
  const nextRun = useRef<GauntletDeal | null>(null)

  useEffect(() => {
    clearSeedFromUrl()
  }, [])

  const fetchRun = useCallback(
    async (poolId: string, mode: GauntletMode): Promise<GauntletDeal | null> => {
      try {
        const res = await fetch(
          `/api/games/gauntlet?pool=${encodeURIComponent(poolId)}&mode=${mode}`,
          { cache: 'no-store' }
        )
        const body = await res.json()
        return res.ok && body?.ok ? (body as GauntletDeal) : null
      } catch {
        return null
      }
    },
    []
  )

  // Warm the next deck once, as soon as a board is up. Deliberately not tied
  // to how the run is going: the whole point is that it's already there
  // whenever the run ends, which in this game can be immediately.
  useEffect(() => {
    if (!deal) return
    nextRun.current = null
    let cancelled = false
    const id = window.setTimeout(async () => {
      const fresh = await fetchRun(deal.pool.id, deal.mode)
      if (!cancelled) nextRun.current = fresh
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [deal, fetchRun])

  const question = deal?.questions[round] ?? null
  const correct = called != null && question != null && called === question.answer
  const isSet = deal?.mode === 'ten'
  const total = deal?.questions.length ?? 0

  const call = useCallback(
    (side: 'a' | 'b') => {
      if (!question || called != null) return
      setCalled(side)
      if (side === question.answer) {
        setStreak((s) => s + 1)
        setHits((h) => h + 1)
      } else {
        // A fixed card keeps going; the streak still resets, because a streak
        // is a streak in either mode and it's the more interesting of the two
        // numbers to carry on a card of ten.
        setStreak(0)
      }
    },
    [question, called]
  )

  const advance = useCallback(() => {
    if (!deal || !question || called == null) return
    const missed = called !== question.answer
    // Sudden death only. On a fixed card a miss costs one of ten.
    if (!isSet && missed) {
      setEndedOn(question)
      setOver(true)
      return
    }
    if (round + 1 >= total) {
      if (missed) setEndedOn(question)
      setOver(true)
      return
    }
    setCalled(null)
    setRound((r) => r + 1)
  }, [deal, question, called, round, total, isSet])

  const startRun = useCallback((fresh: GauntletDeal) => {
    setDeal(fresh)
    setRound(0)
    setCalled(null)
    setStreak(0)
    setHits(0)
    setOver(false)
    setEndedOn(null)
  }, [])

  const newRun = useCallback(
    async (mode?: GauntletMode) => {
      if (!deal) return
      const want = mode ?? deal.mode
      // The warmed deck only counts if it's the mode being asked for.
      const warm = nextRun.current
      if (warm && warm.mode === want) {
        nextRun.current = null
        startRun(warm)
        return
      }
      setLoading(true)
      setError(null)
      const fresh = await fetchRun(deal.pool.id, want)
      if (fresh) startRun(fresh)
      else setError('Could not deal a new run.')
      setLoading(false)
    },
    [deal, fetchRun, startRun]
  )

  const shareRun = useCallback(async () => {
    if (!deal) return
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('pool', deal.pool.id)
    url.searchParams.set('mode', deal.mode)
    url.searchParams.set('seed', deal.seed)
    const line = isSet
      ? `I called ${hits} of ${total} on The Gauntlet. Same ten, your turn.`
      : streak === 0
        ? 'I went out on the first question of The Gauntlet. Do better.'
        : `I called ${streak} straight on The Gauntlet. Your turn.`
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
  }, [deal, streak, hits, total, isSet])

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

  const modeStrip = (
    <div className={styles.modes}>
      <button
        type="button"
        className={deal.mode === 'ten' ? styles.modeOn : styles.mode}
        onClick={() => void newRun('ten')}
      >
        Card of ten
      </button>
      <button
        type="button"
        className={deal.mode === 'endless' ? styles.modeOn : styles.mode}
        onClick={() => void newRun('endless')}
      >
        Sudden death
      </button>
    </div>
  )

  if (over) {
    const cleared = !isSet && streak >= total
    const g = isSet ? setGrade(hits) : streakGrade(streak, cleared)
    return (
      <div className={styles.board}>
        <div className={styles.final}>
          <div className={styles.finalKicker}>
            {isSet ? 'Final' : cleared ? 'Cleared' : 'Run over'}
          </div>
          <div className={styles.finalScore}>
            {isSet ? hits : streak}
            <span className={styles.finalOf}>{isSet ? `/ ${total}` : 'in a row'}</span>
          </div>
          <h2 className={styles.finalTitle}>{g.title}</h2>
          <p className={styles.finalLine}>{g.line}</p>

          {/* The question that ended it, in full. This is the part people
              screenshot and argue about, and it's the honest close: you lost
              to a real result, and here it is. */}
          {endedOn && (
            <div className={styles.tomb}>
              <div className={styles.tombHead}>
                Week {endedOn.week} · {endedOn.year}
                {endedOn.isChampionship ? ' · Championship' : endedOn.isPlayoff ? ' · Playoffs' : ''}
              </div>
              <div className={styles.tombRow}>
                <span className={endedOn.answer === 'a' ? styles.tombWin : styles.tombLose}>
                  {teamLabel(endedOn.a)}
                </span>
                <span className={styles.tombScore}>{endedOn.scoreA.toFixed(2)}</span>
              </div>
              <div className={styles.tombRow}>
                <span className={endedOn.answer === 'b' ? styles.tombWin : styles.tombLose}>
                  {teamLabel(endedOn.b)}
                </span>
                <span className={styles.tombScore}>{endedOn.scoreB.toFixed(2)}</span>
              </div>
              {called != null && (
                <div className={styles.tombNote}>
                  You had {teamLabel(endedOn[called])}.
                </div>
              )}
            </div>
          )}

          {modeStrip}

          <div className={styles.finalActions}>
            <button type="button" className={styles.btn} onClick={() => void newRun()}>
              Go again
            </button>
            <button type="button" className={styles.btnGhost} onClick={() => void shareRun()}>
              {copied ? 'Link copied' : 'Share this run'}
            </button>
          </div>
          <p className={styles.seedNote}>
            Run {deal.seed}, drawn from {deal.deckSize} games on the books.
          </p>
          {!deal.pool.leagueSlug && (
            <OwnLeagueCta
              signedIn={signedIn}
              line="Called on strangers. On your own league these are games you sat through."
            />
          )}
        </div>
      </div>
    )
  }

  if (!question) return null

  const sides: Array<['a' | 'b', GauntletSide, number]> = [
    ['a', question.a, question.scoreA],
    ['b', question.b, question.scoreB],
  ]
  const top = Math.max(question.scoreA, question.scoreB) || 1

  return (
    <div className={`${styles.board} ${styles.playing}`}>
      <div className={styles.strip}>
        <div className={styles.stripSide}>
          <span className={styles.stripNum}>{streak}</span>
          <span className={styles.stripLabel}>Streak</span>
        </div>
        <div className={styles.stripMid}>
          {isSet ? `${round + 1} of ${total}` : 'Sudden death'}
        </div>
        <div className={styles.stripSide}>
          <span className={styles.stripNum}>{isSet ? hits : total - round}</span>
          <span className={styles.stripLabel}>{isSet ? 'Correct' : 'Left'}</span>
        </div>
      </div>

      {/* The whole card takes the colour of the answer, not just the band at
          the bottom of it — at arm's length that outline is what you register
          first, before any word is read. */}
      <div
        className={
          called == null
            ? styles.fixture
            : correct
              ? `${styles.fixture} ${styles.fixtureHit}`
              : `${styles.fixture} ${styles.fixtureMiss}`
        }
      >
        <div className={styles.fixHead}>
          <span className={styles.fixWhen}>
            Week {question.week} · {question.year}
          </span>
          {/* The header carries the WHEN and, when there is one, the stakes.
              It briefly also carried "Who won?" in this slot, which meant the
              ask silently disappeared on every playoff question — the flag
              took the same place. The footer asks instead, where it is always
              visible and always in one spot. */}
          {question.isChampionship ? (
            <span className={styles.fixFlagBig}>★ Championship ★</span>
          ) : question.isPlayoff ? (
            <span className={styles.fixFlag}>Playoffs</span>
          ) : (
            <span className={styles.fixFlag}>Regular season</span>
          )}
        </div>

        {sides.map(([key, side, score], i) => {
          const won = question.answer === key
          const chosen = called === key
          const cls = [
            styles.row,
            called != null && won ? styles.rowWon : '',
            called != null && !won ? styles.rowLost : '',
            chosen ? styles.rowChosen : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div key={key}>
              {i === 1 && (
                <div className={styles.vs}>
                  <span className={styles.vsBadge}>vs</span>
                </div>
              )}
              <button
                type="button"
                className={cls}
                onClick={() => call(key)}
                disabled={called != null}
              >
                <Face side={side} />
                <span className={styles.rowNames}>
                  <span className={styles.rowTeam}>{teamLabel(side)}</span>
                  <span className={styles.rowUnder}>
                    {side.teamName ? side.managerName : ''}
                    {called != null && (
                      <span className={styles.rowRecord}>{recordLine(side)}</span>
                    )}
                  </span>
                  {/* The margin, drawn. Two numbers a foot apart make you do
                      the subtraction; two bars make "he got buried" read
                      instantly, which is the reaction the game wants. */}
                  {called != null && (
                    <span className={styles.bar}>
                      <span
                        className={won ? styles.barFillWon : styles.barFill}
                        style={{ width: `${Math.max(6, (score / top) * 100)}%` }}
                      />
                    </span>
                  )}
                </span>
                <span className={called != null ? styles.rowScore : styles.rowScoreEmpty}>
                  {called != null ? score.toFixed(2) : ''}
                </span>
              </button>
            </div>
          )
        })}

        {called == null ? (
          <div className={styles.fixFoot}>Tap the winner</div>
        ) : (
          <Verdict
            hit={correct}
            headline={correct ? 'Correct' : 'Wrong'}
            detail={
              <>
                {teamLabel(question[question.answer])} by{' '}
                {Math.abs(question.scoreA - question.scoreB).toFixed(2)}
              </>
            }
          />
        )}
      </div>

      <div className={styles.actionBar}>
        <button type="button" className={styles.btn} onClick={advance} disabled={called == null}>
          {called == null
            ? 'Make the call'
            : !isSet && !correct
              ? 'See the damage'
              : round + 1 >= total
                ? 'See how you did'
                : 'Next'}
        </button>
      </div>
    </div>
  )
}
