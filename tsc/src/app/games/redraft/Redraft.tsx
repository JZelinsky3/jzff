'use client'

// Redraft — the board.
//
// You are on the clock at a real pick, looking at six players who were
// genuinely there. Nothing on the cards says how the season went, because the
// entire game is the gap between what a name was worth in August and what it
// turned out to be worth. The numbers arrive the instant a pick is made and
// not one moment sooner.
//
// The running score is two totals side by side, yours and theirs, because a
// single number would hide which half moved. Watching their total climb after
// a pick you passed on is the point.
//
// Two modes on one engine, swapped from the strip. Switching re-deals rather
// than reshaping the board in place: they are different lengths and different
// opponents, and pretending a half-finished run survives the change would be
// a lie about what the score meant.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { RedraftDeal, RedraftCandidate, RedraftMode } from '@/lib/minigames/redraft'
import { grade } from '@/lib/minigames/redraft'
import { OwnLeagueCta } from '../OwnLeagueCta'
import styles from './redraft.module.css'

/** Sleeper serves headshots for retired players too, so old drafts get faces. */
function headshot(playerId: string | null): string | null {
  return playerId ? `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg` : null
}

/** Takes the seed back out of the address bar — see the note on the other
    boards. A refresh should deal a new board, not replay the last one. */
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

function ordinalPos(pos: string, rank: number): string {
  return `${pos}${rank}`
}

function Face({ player }: { player: RedraftCandidate }) {
  const [imgOk, setImgOk] = useState(true)
  const src = headshot(player.playerId)
  return (
    <span className={styles.face}>
      {src && imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.faceImg}
          src={src}
          alt=""
          loading="lazy"
          onError={() => setImgOk(false)}
        />
      ) : (
        <span className={styles.faceLetter} aria-hidden>
          {player.name.charAt(0)}
        </span>
      )}
    </span>
  )
}

export function Redraft({
  initialDeal,
  initialError,
  signedIn,
}: {
  initialDeal: RedraftDeal | null
  initialError: string | null
  signedIn: boolean
}) {
  const [deal, setDeal] = useState<RedraftDeal | null>(initialDeal)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)

  const [round, setRound] = useState(0)
  const [taken, setTaken] = useState<string | null>(null)
  const [picks, setPicks] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    clearSeedFromUrl()
  }, [])

  const slot = deal?.slots[round] ?? null
  const done = deal ? round >= deal.slots.length : false

  const byKey = useCallback(
    (s: RedraftDeal['slots'][number], key: string | null) =>
      s.candidates.find((c) => c.key === key) ?? null,
    []
  )

  // Both totals, over the slots actually played. Computed rather than
  // accumulated so a re-render can never drift from the picks list.
  const { mine, theirs } = useMemo(() => {
    if (!deal) return { mine: 0, theirs: 0 }
    let a = 0
    let b = 0
    picks.forEach((key, i) => {
      const s = deal.slots[i]
      if (!s) return
      a += byKey(s, key)?.ppg ?? 0
      b += byKey(s, s.actualKey)?.ppg ?? 0
    })
    return { mine: Math.round(a * 100) / 100, theirs: Math.round(b * 100) / 100 }
  }, [deal, picks, byKey])

  const take = useCallback(
    (key: string) => {
      if (!slot || taken != null) return
      setTaken(key)
      setPicks((p) => [...p, key])
    },
    [slot, taken]
  )

  const advance = useCallback(() => {
    setTaken(null)
    setRound((r) => r + 1)
  }, [])

  const deal_ = useCallback(
    async (mode: RedraftMode, poolId: string) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/games/redraft?pool=${encodeURIComponent(poolId)}&mode=${mode}`,
          { cache: 'no-store' }
        )
        const body = await res.json()
        if (!res.ok || !body?.ok) {
          setError(body?.error ?? 'Could not deal a new board.')
        } else {
          setDeal(body as RedraftDeal)
          setRound(0)
          setTaken(null)
          setPicks([])
        }
      } catch {
        setError('Could not reach the press room. Try again.')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const shareRun = useCallback(async () => {
    if (!deal) return
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('pool', deal.pool.id)
    url.searchParams.set('mode', deal.mode)
    url.searchParams.set('seed', deal.seed)
    const margin = Math.round((mine - theirs) * 10) / 10
    const who = deal.mode === 'manager' ? (deal.managerName ?? 'the board') : `the ${deal.year} first round`
    const line =
      margin >= 0
        ? `I redrafted ${who} and came out ${margin} points a game better. Your turn.`
        : `I redrafted ${who} and somehow ended up ${Math.abs(margin)} points a game worse. Beat that.`
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
  }, [deal, mine, theirs])

  // ── Render ──────────────────────────────────────────────────

  if (loading) return <div className={styles.err}>Setting the board…</div>

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

  const opponent =
    deal.mode === 'manager' ? (deal.managerName ?? 'The board') : `The ${deal.year} board`

  const modeStrip = (
    <div className={styles.modes}>
      <button
        type="button"
        className={deal.mode === 'manager' ? styles.modeOn : styles.mode}
        onClick={() => void deal_('manager', deal.pool.id)}
      >
        Whole draft
      </button>
      <button
        type="button"
        className={deal.mode === 'round1' ? styles.modeOn : styles.mode}
        onClick={() => void deal_('round1', deal.pool.id)}
      >
        First round
      </button>
    </div>
  )

  if (done) {
    const margin = Math.round((mine - theirs) * 10) / 10
    const g = grade(margin)
    return (
      <div className={styles.board}>
        <div className={styles.final}>
          <div className={styles.finalKicker}>{margin >= 0 ? 'You win' : 'They win'}</div>
          <div className={styles.finalScore}>
            {margin > 0 ? '+' : ''}
            {margin.toFixed(1)}
            <span className={styles.finalOf}>PPG</span>
          </div>
          <h2 className={styles.finalTitle}>{g.title}</h2>
          <p className={styles.finalLine}>{g.line}</p>

          <div className={styles.totals}>
            <div className={styles.total}>
              <span className={styles.totalNum}>{mine.toFixed(1)}</span>
              <span className={styles.totalLabel}>You</span>
            </div>
            <div className={styles.total}>
              <span className={styles.totalNum}>{theirs.toFixed(1)}</span>
              <span className={styles.totalLabel}>{opponent}</span>
            </div>
          </div>

          {/* Pick by pick. The row somebody wants to point at is the one
              where they took the wrong man, so both are always shown. */}
          <ol className={styles.ledger}>
            {deal.slots.map((s, i) => {
              const mineC = byKey(s, picks[i] ?? null)
              const realC = byKey(s, s.actualKey)
              const won = (mineC?.ppg ?? 0) >= (realC?.ppg ?? 0)
              return (
                <li key={s.key} className={styles.ledgerRow}>
                  <span className={styles.ledgerNum}>
                    {s.round}.{String(s.overallPick).padStart(2, '0')}
                  </span>
                  <span className={won ? styles.ledgerMine : styles.ledgerMineLose}>
                    {mineC?.name ?? '·'}
                    <span className={styles.ledgerPpg}>{(mineC?.ppg ?? 0).toFixed(1)}</span>
                  </span>
                  <span className={styles.ledgerReal}>
                    {realC?.name ?? '·'}
                    <span className={styles.ledgerPpg}>{(realC?.ppg ?? 0).toFixed(1)}</span>
                  </span>
                </li>
              )
            })}
          </ol>

          {modeStrip}

          <div className={styles.finalActions}>
            <button
              type="button"
              className={styles.btn}
              onClick={() => void deal_(deal.mode, deal.pool.id)}
            >
              New board
            </button>
            <button type="button" className={styles.btnGhost} onClick={() => void shareRun()}>
              {copied ? 'Link copied' : 'Share this board'}
            </button>
          </div>
          <p className={styles.seedNote}>
            Board {deal.seed} · {deal.year} · scored on {deal.profile.replace('_', ' ')}
          </p>
          {!deal.pool.leagueSlug && (
            <OwnLeagueCta
              signedIn={signedIn}
              line="You just second-guessed strangers. On your own league it's a draft you sat in."
            />
          )}
        </div>
      </div>
    )
  }

  if (!slot) return null

  const takenC = byKey(slot, taken)
  const realC = byKey(slot, slot.actualKey)
  // The best of the six, which is the only "you left this behind" figure the
  // board quotes. It reveals nothing about players who were never offered.
  const best = slot.candidates.reduce((a, b) => (b.ppg > a.ppg ? b : a), slot.candidates[0])

  return (
    <div className={`${styles.board} ${styles.playing}`}>
      <div className={styles.strip}>
        <div className={styles.stripSide}>
          <span className={styles.stripNum}>{mine.toFixed(1)}</span>
          <span className={styles.stripLabel}>You</span>
        </div>
        <div className={styles.stripMid}>
          Pick {round + 1} of {deal.slots.length}
        </div>
        <div className={styles.stripSide}>
          <span className={styles.stripNum}>{theirs.toFixed(1)}</span>
          <span className={styles.stripLabel}>{opponent}</span>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardWhen}>
            {deal.year} · Round {slot.round}, pick {slot.overallPick}
          </span>
          <span className={styles.cardWhose}>
            {deal.mode === 'manager'
              ? 'Your slot'
              : `${slot.slotTeamName ?? slot.slotManagerName}'s slot`}
          </span>
        </div>

        {taken == null ? (
          <>
            <p className={styles.cardAsk}>On the clock. Who do you take?</p>
            <div className={styles.picks}>
              {slot.candidates.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={styles.pick}
                  onClick={() => take(c.key)}
                >
                  <Face player={c} />
                  <span className={styles.pickBody}>
                    <span className={styles.pickName}>{c.name}</span>
                    <span className={styles.pickMeta}>
                      <span className={styles.pickPos} data-pos={c.pos}>
                        {c.pos}
                      </span>
                      {c.nflTeam && <span className={styles.pickTeam}>{c.nflTeam}</span>}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className={styles.reveal}>
            <div className={styles.revealPair}>
              <div className={styles.revealCol}>
                <span className={styles.revealTag}>You took</span>
                <span className={styles.revealName}>{takenC?.name}</span>
                <span className={styles.revealPpg}>{(takenC?.ppg ?? 0).toFixed(2)}</span>
                <span className={styles.revealSub}>
                  {takenC ? ordinalPos(takenC.pos, takenC.posRank) : ''} · {takenC?.gp ?? 0} games
                </span>
              </div>
              <div className={styles.revealCol}>
                <span className={styles.revealTag}>They took</span>
                <span className={styles.revealName}>{realC?.name}</span>
                <span className={styles.revealPpg}>{(realC?.ppg ?? 0).toFixed(2)}</span>
                <span className={styles.revealSub}>
                  {realC ? ordinalPos(realC.pos, realC.posRank) : ''} · {realC?.gp ?? 0} games
                </span>
              </div>
            </div>
            <div
              className={
                (takenC?.ppg ?? 0) >= (realC?.ppg ?? 0) ? styles.revealBarWin : styles.revealBarLose
              }
            >
              {takenC?.key === realC?.key
                ? 'You made the same pick they did.'
                : (takenC?.ppg ?? 0) >= (realC?.ppg ?? 0)
                  ? `You are up ${((takenC?.ppg ?? 0) - (realC?.ppg ?? 0)).toFixed(2)} a game on that one.`
                  : `That cost you ${((realC?.ppg ?? 0) - (takenC?.ppg ?? 0)).toFixed(2)} a game.`}
            </div>
            {best.key !== takenC?.key && (
              <div className={styles.revealBest}>
                Best on that list was {best.name}, {best.ppg.toFixed(2)} a game
                {best.overallPick > slot.overallPick
                  ? `, and he actually went at ${best.overallPick}.`
                  : '.'}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.actionBar}>
        <button type="button" className={styles.btn} onClick={advance} disabled={taken == null}>
          {taken == null
            ? 'Make your pick'
            : round + 1 >= deal.slots.length
              ? 'See the board'
              : 'Next pick'}
        </button>
      </div>
    </div>
  )
}
