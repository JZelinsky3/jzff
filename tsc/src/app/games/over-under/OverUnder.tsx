'use client'

// The Over/Under — the board.
//
// Set as a bet slip rather than as a quiz: the team and the week are the small
// print, the LINE is the biggest thing on the page, and the two buttons are
// the same size because the whole premise is that they're a coin unless you
// know something.
//
// The card runs to ten calls and keeps a running record rather than a streak,
// which is the deliberate difference from The Gauntlet next door. A wrong call
// here costs you one of ten; a wrong call there ends the night. Two games can
// ask a binary question as long as they disagree about what a miss is worth.
//
// The seed pins the ten lines, so a shared link is the same slate priced the
// same way and two people can actually be compared.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { OverUnderDeal, OverUnderCall } from '@/lib/minigames/overUnder'
import { ROUNDS, grade } from '@/lib/minigames/overUnder'
import { OwnLeagueCta } from '../OwnLeagueCta'
import { Verdict } from '../Verdict'
import styles from './over.module.css'

/** Takes the seed back out of the address bar — see the note on the other
    two boards. A refresh should price a new slate, not replay the last one. */
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

function Face({ url, label }: { url: string | null; label: string }) {
  const [ok, setOk] = useState(true)
  return (
    <span className={styles.face}>
      {url && ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.faceImg} src={url} alt="" loading="lazy" onError={() => setOk(false)} />
      ) : (
        <span className={styles.faceLetter} aria-hidden>
          {label.charAt(0)}
        </span>
      )}
    </span>
  )
}

export function OverUnder({
  initialDeal,
  initialError,
  signedIn,
}: {
  initialDeal: OverUnderDeal | null
  initialError: string | null
  signedIn: boolean
}) {
  const [deal, setDeal] = useState<OverUnderDeal | null>(initialDeal)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)

  const [round, setRound] = useState(0)
  const [called, setCalled] = useState<OverUnderCall | null>(null)
  const [calls, setCalls] = useState<OverUnderCall[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    clearSeedFromUrl()
  }, [])

  const question = deal?.questions[round] ?? null
  // Anchored on the ROUND, not on how many calls have been made. Keying it to
  // calls.length ended the card the instant the tenth call was pressed, so the
  // last line was the only one whose result you never saw — and that is the
  // one the whole card has been building to.
  const done = deal ? round >= deal.questions.length : false
  const correct = called != null && question != null && called === question.answer

  const hits = useMemo(() => {
    if (!deal) return 0
    return calls.reduce((n, c, i) => (c === deal.questions[i]?.answer ? n + 1 : n), 0)
  }, [calls, deal])

  const call = useCallback(
    (side: OverUnderCall) => {
      if (!question || called != null) return
      setCalled(side)
      setCalls((c) => [...c, side])
    },
    [question, called]
  )

  const advance = useCallback(() => {
    setCalled(null)
    setRound((r) => r + 1)
  }, [])

  const newCard = useCallback(async () => {
    if (!deal) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/games/over-under?pool=${encodeURIComponent(deal.pool.id)}`, {
        cache: 'no-store',
      })
      const body = await res.json()
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? 'Could not price a new card.')
      } else {
        setDeal(body as OverUnderDeal)
        setRound(0)
        setCalled(null)
        setCalls([])
      }
    } catch {
      setError('Could not reach the press room. Try again.')
    } finally {
      setLoading(false)
    }
  }, [deal])

  const shareRun = useCallback(async () => {
    if (!deal) return
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('pool', deal.pool.id)
    url.searchParams.set('seed', deal.seed)
    const line = `I went ${hits}-${ROUNDS - hits} against the book on the Over/Under. Same ten lines, your turn.`
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
  }, [deal, hits])

  // ── Render ──────────────────────────────────────────────────

  if (loading) return <div className={styles.err}>Pricing…</div>

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
    const g = grade(hits)
    return (
      <div className={styles.board}>
        <div className={styles.final}>
          <div className={styles.finalKicker}>Final</div>
          <div className={styles.finalScore}>
            {hits}
            <span className={styles.finalOf}>/ {ROUNDS}</span>
          </div>
          <h2 className={styles.finalTitle}>{g.title}</h2>
          <p className={styles.finalLine}>{g.line}</p>

          {/* The slip, line by line. This is the part worth screenshotting:
              it's a record of what you thought, next to what happened. */}
          <ol className={styles.slip}>
            {deal.questions.map((q, i) => {
              const c = calls[i]
              const hit = c === q.answer
              return (
                <li key={q.key} className={styles.slipRow}>
                  <span className={styles.slipTeam}>
                    {q.teamName ?? q.managerName}
                    <span className={styles.slipWhen}>
                      W{q.week} · {q.year}
                    </span>
                  </span>
                  <span className={styles.slipLine}>{q.line.toFixed(1)}</span>
                  <span className={styles.slipScore}>{q.score.toFixed(2)}</span>
                  <span className={hit ? styles.slipHit : styles.slipMiss}>
                    {c ? c.toUpperCase() : '·'}
                  </span>
                </li>
              )
            })}
          </ol>

          <div className={styles.finalActions}>
            <button type="button" className={styles.btn} onClick={() => void newCard()}>
              New card
            </button>
            <button type="button" className={styles.btnGhost} onClick={() => void shareRun()}>
              {copied ? 'Link copied' : 'Share these lines'}
            </button>
          </div>
          <p className={styles.seedNote}>
            Card {deal.seed}, priced off {deal.deckSize} weeks on the books.
          </p>
          {!deal.pool.leagueSlug && (
            <OwnLeagueCta
              signedIn={signedIn}
              line="Priced against strangers. On your own league you know who scores in bunches."
            />
          )}
        </div>
      </div>
    )
  }

  if (!question) return null

  // Where the real score sits on the gauge. The line is the middle; a full
  // half of the track is one sigma-ish of distance, clamped so a freak result
  // parks at the end instead of escaping the rail.
  const spread = Math.max(12, question.line * 0.28)
  const gaugePct = Math.min(
    96,
    Math.max(4, 50 + ((question.score - question.line) / spread) * 50)
  )

  return (
    <div className={`${styles.board} ${styles.playing}`}>
      <div className={styles.strip}>
        <div className={styles.stripLabel}>
          Call {round + 1} of {ROUNDS}
        </div>
        <div className={styles.stripRecord}>
          <span className={styles.stripHits}>{hits}</span>
          <span className={styles.stripSep}>–</span>
          <span className={styles.stripMisses}>{calls.length - hits}</span>
        </div>
      </div>

      {/* Set as a betting ticket. The week and the season are printed on
          the stub directly above the team, not floating in a header two
          blocks up: the whole call is "did THIS team in THAT week beat this
          number", and the three of them have to be readable in one glance. */}
      {/* The ticket takes the colour of the answer. At arm's length the
          outline is what registers first, before a word is read. */}
      <div
        className={
          called == null
            ? styles.ticket
            : correct
              ? `${styles.ticket} ${styles.ticketHit}`
              : `${styles.ticket} ${styles.ticketMiss}`
        }
      >
        <div className={styles.tickHead}>
          <span className={styles.tickNo}>Week {question.week} · {question.year}</span>
          {question.isChampionship ? (
            <span className={styles.tickFlagBig}>★ Championship ★</span>
          ) : question.isPlayoff ? (
            <span className={styles.tickFlag}>Playoffs</span>
          ) : (
            <span className={styles.tickFlag}>Total points</span>
          )}
        </div>

        <div className={styles.tickTeam}>
          <Face url={question.avatarUrl} label={question.teamName ?? question.managerName} />
          <span className={styles.tickTeamText}>
            <span className={styles.tickTeamName}>{question.teamName ?? question.managerName}</span>
            {question.teamName && (
              <span className={styles.tickManager}>{question.managerName}</span>
            )}
            {/* Who they played, before the call. Context rather than
                evidence — it says which game this was, which is often
                enough to remember it. The opponent's SCORE stays hidden. */}
            <span className={styles.tickOpp}>
              vs {question.oppTeamName ?? question.oppManagerName}
            </span>
          </span>
        </div>

        <div className={styles.tickLine}>
          <span className={styles.tickLineNum}>{question.line.toFixed(1)}</span>
          {/* The week's league average, and the reason the board is playable
              at all for anyone whose memory of one specific week has faded —
              which is everyone, about most weeks. A 118.5 line means one
              thing against a room that averaged 95 and the opposite against
              one that averaged 130. */}
          {question.weekAverage > 0 && (
            <span className={styles.tickAvg}>
              The room averaged {question.weekAverage.toFixed(1)} that week
            </span>
          )}
        </div>

        {/* The gauge. The line is pinned at the centre and the two calls own
            the halves either side, so "over" and "under" are places on a
            track rather than two words. After the call the real score drops
            onto it, which is what turns a right answer into something you
            watch happen instead of read about. */}
        <div className={styles.gauge}>
          <span className={styles.gaugeTrack}>
            <span className={styles.gaugeUnder} />
            <span className={styles.gaugeOver} />
            <span className={styles.gaugeTick} />
            {called != null && (
              <span
                className={question.answer === 'over' ? styles.gaugeDotOver : styles.gaugeDotUnder}
                style={{ left: `${gaugePct}%` }}
              >
                <span className={styles.gaugeDotNum}>{question.score.toFixed(1)}</span>
              </span>
            )}
          </span>
          <span className={styles.gaugeEnds}>
            <span>Under</span>
            <span className={styles.gaugeMid}>{question.line.toFixed(1)}</span>
            <span>Over</span>
          </span>
        </div>

        {called == null ? (
          <div className={styles.calls}>
            <button type="button" className={styles.callUnder} onClick={() => call('under')}>
              <span className={styles.callTick}>▼</span>
              <span className={styles.callWord}>Under</span>
            </button>
            <button type="button" className={styles.callOver} onClick={() => call('over')}>
              <span className={styles.callTick}>▲</span>
              <span className={styles.callWord}>Over</span>
            </button>
          </div>
        ) : (
          <>
            <Verdict
              hit={correct}
              headline={correct ? 'Good call' : 'The book wins'}
              detail={
                <>
                  {question.score.toFixed(2)}, {question.answer.toLowerCase()} by{' '}
                  {Math.abs(question.score - question.line).toFixed(2)}. You said {called}.
                </>
              }
            />
            <div className={styles.revealOpp}>
              {question.won ? 'Beat' : 'Lost to'} {question.oppTeamName ?? question.oppManagerName},{' '}
              {question.oppScore.toFixed(2)}
            </div>
          </>
        )}
      </div>

      <div className={styles.actionBar}>
        <button type="button" className={styles.btn} onClick={advance} disabled={called == null}>
          {called == null
            ? 'Over or under'
            : round + 1 >= deal.questions.length
              ? 'See the slip'
              : 'Next line'}
        </button>
      </div>
    </div>
  )
}
