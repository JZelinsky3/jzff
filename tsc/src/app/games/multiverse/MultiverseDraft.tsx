'use client'

// The Multiverse Draft — the board.
//
// Four surfaces in one component, because they are one run: you draft, you
// play fourteen weeks, you play the postseason if you earned it, and you read
// what happened. Nothing about the draft is hidden — every card shows all
// three of its seasons up front, and the whole game is deciding which SHAPE of
// number you want rather than guessing at one.
//
// The slate is the strategic surface and it is on screen from the first round,
// drawn as the margin either side of a fixed line. That comparison is the
// decision the game is about: a roster behind the slate wants volatile cards,
// one ahead of it wants anchors. Hiding it would leave nothing to think about
// but the biggest average.
//
// The dice arrive with the board (deal.rolls, one row per slot) rather than
// being rolled here, so a shared link plays the identical season and a refresh
// cannot reroll a bad week.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  SLOTS,
  WEEKS,
  PLAYOFF_LINE,
  PLAYOFF_ROUNDS,
  PLAYOFF_ROUND_NAMES,
  weekScore,
  playoffScore,
  bestTimelines,
  realized,
  grade,
  type MultiverseDeal,
  type MvCard,
} from '@/lib/minigames/multiverse'
import { bankRun, postRun } from '../runBank'
import { OwnLeagueCta } from '../OwnLeagueCta'
import styles from './multiverse.module.css'

function headshot(playerId: string | null): string | null {
  return playerId ? `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg` : null
}

/** Takes the seed back out of the address bar — see the other boards. A
    refresh should deal a new season, not replay the last one. */
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

function Face({ name, playerId }: { name: string; playerId: string | null }) {
  const [imgOk, setImgOk] = useState(true)
  const src = headshot(playerId)
  return (
    <span className={styles.face}>
      {src && imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.faceImg} src={src} alt="" loading="lazy" onError={() => setImgOk(false)} />
      ) : (
        <span className={styles.faceLetter} aria-hidden>
          {name.charAt(0)}
        </span>
      )}
    </span>
  )
}

/**
 * One card, with every season it carries on the front.
 *
 * `fired` lights the season that came up and dims the rest. `slot` only feeds
 * the animation's stagger, so the roster resolves one man at a time.
 */
function Card({
  card,
  onTake,
  disabled,
  slotLabel,
  fired,
  compact,
  slot = 0,
  only,
}: {
  card: MvCard
  onTake?: () => void
  disabled?: boolean
  slotLabel?: string | null
  fired?: number | null
  compact?: boolean
  slot?: number
  /** Postseason: the seasons still in play, when the card has been cut down. */
  only?: number[] | null
}) {
  const shown = only ? card.timelines.filter((_, i) => only.includes(i)) : card.timelines
  const firedYear =
    fired != null && only
      ? card.timelines[only[fired]]?.year
      : fired != null
        ? card.timelines[fired]?.year
        : null

  const body = (
    <>
      <span className={styles.cardHead}>
        <Face name={card.name} playerId={card.playerId} />
        <span className={styles.cardWho}>
          <span className={styles.cardName}>{card.name}</span>
          <span className={styles.cardMeta}>
            <span className={styles.pos} data-pos={card.pos}>
              {card.pos}
            </span>
            {slotLabel ? <span className={styles.slotHint}>{slotLabel}</span> : null}
          </span>
        </span>
      </span>

      <span className={styles.timelines} style={{ '--slot': slot } as React.CSSProperties}>
        {shown.map((t) => (
          <span
            key={t.year}
            className={styles.timeline}
            data-fired={firedYear == null ? undefined : firedYear === t.year ? 'yes' : 'no'}
          >
            <span className={styles.tlYear}>{t.year}</span>
            <span className={styles.tlPpg}>{t.ppg.toFixed(1)}</span>
            {!compact && (
              <span className={styles.tlRank}>
                {card.pos}
                {t.posRank} · {t.gp}g
              </span>
            )}
          </span>
        ))}
      </span>

      {!compact && (
        <span className={styles.cardFoot}>
          <span>
            avg <b>{card.mean.toFixed(1)}</b>
          </span>
          <span className={styles.spread} data-wide={card.spread >= 8 ? 'yes' : undefined}>
            spread {card.spread.toFixed(1)}
          </span>
        </span>
      )}
    </>
  )

  if (!onTake) return <div className={compact ? styles.cardMini : styles.card}>{body}</div>
  return (
    <button type="button" className={styles.card} onClick={onTake} disabled={disabled}>
      {body}
    </button>
  )
}

type WeekLine = { week: number; mine: number; theirs: number; won: boolean; name: string; paper: number }

/**
 * The fourteen weeks.
 *
 * Every bar is grown from the BOTTOM and the line is the opponent — the
 * height is what you put up measured against what they put up, so the line
 * sits at parity and never moves. Clear it and the bar is green; fall short
 * and it is red and simply does not reach, from the same floor as a win.
 *
 * That is the whole reason it is drawn this way rather than as margins
 * hanging off a centre line. A win and a loss are the same kind of week and
 * should be the same kind of mark; only the height differs, which is exactly
 * what the reader wants to compare down the row.
 *
 * Before a week is played the bar carries the same ratio off paper, which is
 * why an undrafted board reads as fourteen near-identical bars just over the
 * line: the opponents are all within a few points of each other, so the
 * shape only appears once the dice start landing.
 *
 * One measure, one hue, no legend. The win/loss colours are the site's
 * reserved status tokens and mean only what they mean everywhere else.
 */
const SLATE_LINE = 62 // where parity sits, in % of plot height
const SLATE_SPAN = 32 // how far the largest deviation reaches from it

function Slate({
  lines,
  myPpg,
  played,
}: {
  lines: WeekLine[]
  myPpg: number
  played: number
}) {
  // Your points as a share of theirs. 1 is parity, and the line is drawn at 1.
  const ratios = lines.map((l, i) =>
    i < played
      ? l.theirs > 0
        ? l.mine / l.theirs
        : 1
      : l.paper > 0
        ? myPpg / l.paper
        : 1
  )
  // Scaled off the biggest deviation actually present, with a floor so a
  // quiet season doesn't get magnified into a dramatic one.
  const spread = Math.max(0.1, ...ratios.map((r) => Math.abs(r - 1)))

  return (
    <div className={styles.slate}>
      <div className={styles.slateHead}>
        <span className={styles.slateTitle}>The slate</span>
        <span className={styles.slateNote}>
          {played > 0 ? (
            <>
              you against them · <b>{played}</b> played
            </>
          ) : (
            <>
              projected · your <b>{myPpg.toFixed(1)}</b> against theirs
            </>
          )}
        </span>
      </div>
      <div className={styles.slatePlot} style={{ '--cols': lines.length } as React.CSSProperties}>
        <span className={styles.slateZero} aria-hidden />
        {lines.map((l, i) => {
          const done = i < played
          const height = Math.max(
            6,
            Math.min(99, SLATE_LINE + ((ratios[i] - 1) / spread) * SLATE_SPAN)
          )
          return (
            <span
              key={l.week}
              className={styles.slateCol}
              title={
                done
                  ? `Week ${l.week} · ${l.name} · ${l.mine.toFixed(1)} to ${l.theirs.toFixed(1)}`
                  : `Week ${l.week} · ${l.name} · ${l.paper.toFixed(1)} on paper`
              }
            >
              <span
                className={styles.slateBar}
                data-state={done ? (l.won ? 'won' : 'lost') : 'projected'}
                style={{ height: `${height}%` }}
              />
              <span className={styles.slateWeek}>{l.week}</span>
            </span>
          )
        })}
      </div>
      <div className={styles.slateFoot}>
        <span>Bars above the line are wins</span>
        <span>{played > 0 ? `${lines.slice(0, played).filter((l) => l.won).length} so far` : ''}</span>
      </div>
    </div>
  )
}

type PostState =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'banked' }
  | { state: 'posted'; rank: number | null; total: number }
  | { state: 'refused'; why: string }

export function MultiverseDraft({
  initialDeal,
  initialError,
  signedIn,
  shared,
}: {
  initialDeal: MultiverseDeal | null
  initialError: string | null
  signedIn: boolean
  shared: boolean
}) {
  const [deal, setDeal] = useState<MultiverseDeal | null>(initialDeal)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [isShared, setIsShared] = useState(shared)

  const [roster, setRoster] = useState<(MvCard | null)[]>(() => SLOTS.map(() => null))
  const [picks, setPicks] = useState<number[]>([])
  const [round, setRound] = useState(0)
  const [played, setPlayed] = useState(0)
  const [poPlayed, setPoPlayed] = useState(0)
  const [poOpen, setPoOpen] = useState(false)
  const [poClosed, setPoClosed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [post, setPost] = useState<PostState>({ state: 'idle' })

  useEffect(() => {
    clearSeedFromUrl()
  }, [])

  const drafting = round < (deal?.rounds.length ?? 0)

  /** Where a card would go: the most restrictive open slot it fits. Filling
      tight slots before the flex is strictly better — it keeps the flex open
      for whatever comes — so there is nothing to ask the player. The verifier
      replays this exact rule, which is why a run only has to post its card
      choices and not its slot assignments. */
  const slotFor = useCallback(
    (card: MvCard): number | null => {
      const open = SLOTS.map((_, i) => i).filter((i) => roster[i] === null)
      const legal = open.filter((i) => SLOTS[i].accepts.includes(card.pos))
      if (legal.length === 0) return null
      return legal.sort((a, b) => SLOTS[a].accepts.length - SLOTS[b].accepts.length)[0]
    },
    [roster]
  )

  const take = useCallback(
    (card: MvCard, index: number) => {
      const slot = slotFor(card)
      if (slot == null) return
      setRoster((r) => {
        const next = r.slice()
        next[slot] = card
        return next
      })
      setPicks((p) => [...p, index])
      setRound((r) => r + 1)
    },
    [slotFor]
  )

  const myPpg = useMemo(() => roster.reduce((a, c) => a + (c?.mean ?? 0), 0), [roster])

  const weekly = useMemo<WeekLine[]>(() => {
    if (!deal) return []
    return deal.schedule.map((opp, w) => {
      const mine = weekScore(roster, deal.rolls, w)
      return {
        week: opp.week,
        mine,
        theirs: opp.score,
        won: mine > opp.score,
        name: opp.name,
        paper: opp.ppg,
      }
    })
  }, [deal, roster])

  const wins = useMemo(() => weekly.slice(0, played).filter((w) => w.won).length, [weekly, played])
  const finalWins = useMemo(() => weekly.filter((w) => w.won).length, [weekly])
  const madeIt = finalWins >= PLAYOFF_LINE

  /** The postseason, and how far it can possibly go: it stops at the first
      loss, because it is single elimination. */
  const poGames = useMemo<WeekLine[]>(() => {
    if (!deal) return []
    return deal.playoffs.opponents.map((opp, r) => {
      const mine = playoffScore(roster, deal.playoffs.rolls, r, deal.playoffs.keep)
      return {
        week: opp.week,
        mine,
        theirs: opp.score,
        won: mine > opp.score,
        name: opp.name,
        paper: opp.ppg,
      }
    })
  }, [deal, roster])

  const poLimit = useMemo(() => {
    for (let i = 0; i < poGames.length; i++) if (!poGames[i].won) return i + 1
    return poGames.length
  }, [poGames])

  const poWins = useMemo(
    () => poGames.slice(0, poPlayed).filter((g) => g.won).length,
    [poGames, poPlayed]
  )

  const seasonOver = played >= WEEKS
  // A postseason has to be CLOSED by the player, not just finished. Deriving
  // the end from `poPlayed >= poLimit` sent a knocked-out run straight to the
  // recap the instant the losing game resolved, so the game you lost was the
  // one game you never saw.
  const done = seasonOver && (!madeIt || poClosed)

  // ── The board ───────────────────────────────────────────────
  // A finished run posts itself. No submit button: the only thing one would
  // add is a way to leave a bad run off the board, and a board you can opt
  // out of after seeing the number is not a board.
  useEffect(() => {
    if (!done || !deal) return
    if (post.state !== 'idle') return

    let cancelled = false
    void (async () => {
      if (isShared) {
        if (!cancelled) {
          setPost({
            state: 'refused',
            why: 'A shared season is a replay, so it stays off the board.',
          })
        }
        return
      }

      const run = {
        game: 'multiverse',
        mode: null,
        pool: deal.pool.id,
        seed: deal.seed,
        picks: { cards: picks, playoffs: madeIt ? poPlayed : 0 },
      }

      if (!signedIn) {
        bankRun({ ...run, at: Date.now() })
        if (!cancelled) setPost({ state: 'banked' })
        return
      }

      if (!cancelled) setPost({ state: 'sending' })
      const out = await postRun(run)
      if (cancelled) return
      if (out.ok) {
        setPost({ state: 'posted', rank: out.rank ?? null, total: out.total ?? 0 })
      } else if (out.needsAuth) {
        bankRun({ ...run, at: Date.now() })
        setPost({ state: 'banked' })
      } else {
        setPost({ state: 'refused', why: out.error ?? 'Could not reach the board.' })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [done, deal, post.state, isShared, picks, madeIt, poPlayed, signedIn])

  const deal_ = useCallback(async (poolId: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/games/multiverse?pool=${encodeURIComponent(poolId)}`, {
        cache: 'no-store',
      })
      const body = await res.json()
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? 'Could not deal a new season.')
      } else {
        setDeal(body as MultiverseDeal)
        setRoster(SLOTS.map(() => null))
        setPicks([])
        setRound(0)
        setPlayed(0)
        setPoPlayed(0)
        setPoOpen(false)
        setPoClosed(false)
        setPost({ state: 'idle' })
        setIsShared(false)
      }
    } catch {
      setError('Could not reach the press room. Try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const shareRun = useCallback(async () => {
    if (!deal) return
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('pool', deal.pool.id)
    url.searchParams.set('seed', deal.seed)
    const tail =
      madeIt && poWins >= PLAYOFF_ROUNDS
        ? `went ${finalWins}-${WEEKS - finalWins} and won the whole thing`
        : madeIt
          ? `went ${finalWins}-${WEEKS - finalWins} and made the postseason`
          : `went ${finalWins}-${WEEKS - finalWins}`
    const line = `I drafted across ${deal.years.length} seasons of ${deal.pool.label} at once and ${tail}. Same cards, same dice, your turn.`
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
  }, [deal, madeIt, poWins, finalWins])

  // ── Render ──────────────────────────────────────────────────

  if (loading) return <div className={styles.err}>Opening the other seasons…</div>

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

  const keptIdx = (card: MvCard): number[] => {
    const best = bestTimelines(card, deal.playoffs.keep)
    return best.map((t) => card.timelines.findIndex((x) => x.year === t.year))
  }

  const rosterRail = (
    <div className={styles.rail}>
      {SLOTS.map((slot, i) => {
        const card = roster[i]
        return (
          <div key={slot.id} className={card ? styles.railOn : styles.railOff}>
            <span className={styles.railSlot}>{slot.label}</span>
            <span className={styles.railName}>{card ? card.name : '—'}</span>
            <span className={styles.railNum}>{card ? card.mean.toFixed(1) : ''}</span>
          </div>
        )
      })}
    </div>
  )

  // ── Drafting ───────────────────────────────────────────────
  if (drafting) {
    const current = deal.rounds[round]
    return (
      <div className={styles.board}>
        <div className={styles.strip}>
          <div className={styles.stripSide}>
            <span className={styles.stripNum}>
              {round + 1}
              <span className={styles.stripOf}>/{deal.rounds.length}</span>
            </span>
            <span className={styles.stripLabel}>Round</span>
          </div>
          <div className={styles.stripMid}>
            {deal.timelines} seasons per player · {deal.years[0]}–{deal.years[deal.years.length - 1]}
            <span className={styles.tierNote}>{current.tier}</span>
          </div>
          <div className={styles.stripSide}>
            <span className={styles.stripNum}>{myPpg.toFixed(1)}</span>
            <span className={styles.stripLabel}>On paper</span>
          </div>
        </div>

        <Slate lines={weekly} myPpg={myPpg} played={0} />

        <div className={styles.cards}>
          {current.cards.map((card, i) => {
            const slot = slotFor(card)
            return (
              <Card
                key={card.key}
                card={card}
                onTake={() => take(card, i)}
                disabled={slot == null}
                slotLabel={slot == null ? 'no slot open' : SLOTS[slot].label}
              />
            )
          })}
        </div>

        {rosterRail}
      </div>
    )
  }

  // ── Playing it out ─────────────────────────────────────────
  if (!seasonOver) {
    const last = played > 0 ? weekly[played - 1] : null
    const next = weekly[played]
    return (
      <div className={styles.board}>
        <div className={styles.strip}>
          <div className={styles.stripSide}>
            <span className={styles.stripNum}>
              {wins}-{played - wins}
            </span>
            <span className={styles.stripLabel}>Record</span>
          </div>
          <div className={styles.stripMid}>
            Week {played + 1} of {WEEKS}
          </div>
          <div className={styles.stripSide}>
            <span className={styles.stripNum}>{next.paper.toFixed(1)}</span>
            <span className={styles.stripLabel}>{next.name} on paper</span>
          </div>
        </div>

        <Slate lines={weekly} myPpg={myPpg} played={played} />

        {last && (
          <div className={styles.result} data-won={last.won ? 'yes' : 'no'}>
            <div className={styles.resultHead}>
              <span className={styles.resultTag}>
                {last.won ? 'Won' : 'Lost'} week {last.week} · {last.name}
              </span>
              <span className={styles.resultScore}>
                {last.mine.toFixed(1)} <span className={styles.resultV}>vs</span>{' '}
                {last.theirs.toFixed(1)}
              </span>
            </div>
            <div className={styles.fired}>
              {roster.map((card, slot) =>
                card ? (
                  // Keyed by week so the reveal animation replays each time.
                  <Card
                    key={`${card.key}-${slot}-${played}`}
                    card={card}
                    compact
                    slot={slot}
                    fired={deal.rolls[slot][played - 1] % card.timelines.length}
                  />
                ) : null
              )}
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => setPlayed((p) => p + 1)}>
            Play week {played + 1}
          </button>
          <button type="button" className={styles.ghost} onClick={() => setPlayed(WEEKS)}>
            Play out the season
          </button>
        </div>
      </div>
    )
  }

  // ── The postseason ─────────────────────────────────────────
  const bracket = (
    <div className={styles.poBracket}>
      {poGames.map((g, r) => {
        const state = r < poPlayed ? (g.won ? 'won' : 'lost') : 'pending'
        return (
          <div key={g.week} className={styles.poLeg} data-state={state}>
            <span className={styles.poLegName}>{PLAYOFF_ROUND_NAMES[r]}</span>
            <span className={styles.poLegOpp}>{g.name}</span>
            <span className={styles.poLegScore}>
              {r < poPlayed
                ? `${g.mine.toFixed(1)} vs ${g.theirs.toFixed(1)}`
                : r < poLimit
                  ? `${g.paper.toFixed(1)} on paper`
                  : 'not reached'}
            </span>
          </div>
        )
      })}
    </div>
  )

  if (madeIt && !poOpen) {
    return (
      <div className={styles.board}>
        <div className={styles.poBanner}>
          <div className={styles.poKicker}>You are in</div>
          <h2 className={styles.poTitle}>
            {finalWins}-{WEEKS - finalWins}, and through
          </h2>
          <p className={styles.poLine}>
            Three rounds, single elimination. Every card cuts down to its best{' '}
            {deal.playoffs.keep === 1 ? 'season' : `${deal.playoffs.keep} seasons`}, so the numbers
            go up — and so does everybody else&rsquo;s, because the field left is the strongest the
            league can put out.
          </p>
        </div>
        {bracket}
        <div className={styles.actions} data-single="yes">
          <button type="button" className={styles.primary} onClick={() => setPoOpen(true)}>
            Into the postseason
          </button>
        </div>
      </div>
    )
  }

  if (madeIt && !poClosed) {
    const last = poPlayed > 0 ? poGames[poPlayed - 1] : null
    const more = poPlayed < poLimit
    const knockedOut = !more && poWins < PLAYOFF_ROUNDS
    return (
      <div className={styles.board}>
        <div className={styles.strip}>
          <div className={styles.stripSide}>
            <span className={styles.stripNum}>
              {finalWins}-{WEEKS - finalWins}
            </span>
            <span className={styles.stripLabel}>Regular season</span>
          </div>
          <div className={styles.stripMid}>
            {more ? PLAYOFF_ROUND_NAMES[poPlayed] : knockedOut ? 'Knocked out' : 'Champions'}
            <span className={styles.tierNote}>
              best {deal.playoffs.keep === 1 ? 'season' : `${deal.playoffs.keep} seasons`} only
            </span>
          </div>
          <div className={styles.stripSide}>
            <span className={styles.stripNum}>
              {more ? poGames[poPlayed].paper.toFixed(1) : `${poWins}-${poPlayed - poWins}`}
            </span>
            <span className={styles.stripLabel}>
              {more ? `${poGames[poPlayed].name} on paper` : 'Postseason'}
            </span>
          </div>
        </div>

        {bracket}

        {last && (
          <div className={styles.result} data-won={last.won ? 'yes' : 'no'}>
            <div className={styles.resultHead}>
              <span className={styles.resultTag}>
                {last.won ? 'Won' : 'Lost'} the {PLAYOFF_ROUND_NAMES[poPlayed - 1].toLowerCase()}
                {' · '}
                {last.name}
              </span>
              <span className={styles.resultScore}>
                {last.mine.toFixed(1)} <span className={styles.resultV}>vs</span>{' '}
                {last.theirs.toFixed(1)}
              </span>
            </div>
            <div className={styles.fired}>
              {roster.map((card, slot) =>
                card ? (
                  <Card
                    key={`${card.key}-${slot}-po${poPlayed}`}
                    card={card}
                    compact
                    slot={slot}
                    only={keptIdx(card)}
                    fired={deal.playoffs.rolls[slot][poPlayed - 1] % deal.playoffs.keep}
                  />
                ) : null
              )}
            </div>
          </div>
        )}

        {/* The run ended here, so it says so on the page it ended on rather
            than on the recap two clicks later. Losing used to drop straight
            through to the season summary with no account of the game that
            did it. */}
        {!more && (
          <div className={styles.poOut} data-won={knockedOut ? 'no' : 'yes'}>
            {knockedOut ? (
              <>
                <span className={styles.poOutTag}>Out in the {PLAYOFF_ROUND_NAMES[poWins].toLowerCase()}</span>
                <span className={styles.poOutLine}>
                  {last ? `${last.name} put up ${last.theirs.toFixed(1)} and you had ${last.mine.toFixed(1)}.` : ''}{' '}
                  {poWins > 0
                    ? `${poWins} won before it, on the best years those cards had.`
                    : 'Eight wins got you here and the best team on the slate was waiting.'}
                </span>
              </>
            ) : (
              <>
                <span className={styles.poOutTag}>You won it</span>
                <span className={styles.poOutLine}>
                  Three rounds, all of them on your best years, and none of them let you down.
                </span>
              </>
            )}
          </div>
        )}

        <div className={styles.actions} data-single="yes">
          {more ? (
            <button
              type="button"
              className={styles.primary}
              onClick={() => setPoPlayed((p) => p + 1)}
            >
              Play the {PLAYOFF_ROUND_NAMES[poPlayed].toLowerCase()}
            </button>
          ) : (
            <button type="button" className={styles.primary} onClick={() => setPoClosed(true)}>
              See how the season read
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── The recap ──────────────────────────────────────────────
  const g = grade(finalWins, madeIt ? poWins : null)
  const champion = madeIt && poWins >= PLAYOFF_ROUNDS
  const tape = [
    ...weekly.map((w) => ({ ...w, po: false })),
    ...(madeIt ? poGames.slice(0, poPlayed).map((w) => ({ ...w, po: true })) : []),
  ]

  return (
    <div className={styles.board}>
      <div className={styles.final}>
        <div className={styles.finalKicker}>
          {champion ? 'Champions' : madeIt ? 'Postseason' : 'Season over'}
        </div>
        <div className={styles.finalScore}>
          {finalWins}-{WEEKS - finalWins}
        </div>
        <h2 className={styles.finalTitle}>{g.title}</h2>
        <p className={styles.finalLine}>{g.line}</p>
        <p className={styles.finalCut}>
          {madeIt
            ? `${PLAYOFF_LINE} wins made it. You had ${finalWins}, then went ${poWins}-${poPlayed - poWins} in January.`
            : `${PLAYOFF_LINE} wins made it. You finished ${PLAYOFF_LINE - finalWins} short.`}
        </p>
      </div>

      {post.state === 'posted' && (
        <div className={styles.posted}>
          {post.rank ? (
            <>
              <b>
                {post.rank}
                {post.rank === 1 ? 'st' : post.rank === 2 ? 'nd' : post.rank === 3 ? 'rd' : 'th'}
              </b>{' '}
              of {post.total} on the board ·{' '}
              <Link href={`/games/multiverse/board/?pool=${deal.pool.id}`} className={styles.postedLink}>
                See it
              </Link>
            </>
          ) : (
            <>
              Posted ·{' '}
              <Link href={`/games/multiverse/board/?pool=${deal.pool.id}`} className={styles.postedLink}>
                See the board
              </Link>
            </>
          )}
        </div>
      )}
      {post.state === 'banked' && (
        <div className={styles.posted}>
          This run is saved. <Link href="/login" className={styles.postedLink}>Sign in</Link> and it
          goes on the board.
        </div>
      )}
      {post.state === 'refused' && <div className={styles.posted}>{post.why}</div>}

      <Slate lines={weekly} myPpg={myPpg} played={WEEKS} />

      {madeIt && bracket}

      {/* The thing the whole game is for: what each card was actually worth
          once the dice had finished with it. A man dealt 21 / 12 / 18 is not
          a 17 to you — he is whatever came up, and the front of the card
          never said which. Regular season only, which is the fourteen weeks
          every run has. */}
      <div className={styles.recap}>
        <div className={styles.recapHead}>
          <h3 className={styles.recapTitle}>What they actually gave you</h3>
          <p className={styles.recapSub}>
            Season PPG across the {WEEKS} weeks, against the seasons the card was dealt.
          </p>
        </div>
        <div className={styles.recapRows}>
          {roster.map((card, slot) => {
            if (!card) return null
            const r = realized(card, deal.rolls, slot, WEEKS)
            const delta = Math.round((r.ppg - card.mean) * 10) / 10
            return (
              <div key={`${card.key}-${slot}`} className={styles.recapRow}>
                <span className={styles.recapSlot}>{SLOTS[slot].label}</span>
                <span className={styles.recapWho}>
                  <span className={styles.recapName}>{card.name}</span>
                  <span className={styles.pos} data-pos={card.pos}>
                    {card.pos}
                  </span>
                </span>
                <span className={styles.recapTl}>
                  {card.timelines.map((t, i) => (
                    <span key={t.year} className={styles.recapChip}>
                      <span className={styles.recapChipYear}>{t.year}</span>
                      <span className={styles.recapChipPpg}>{t.ppg.toFixed(1)}</span>
                      <span className={styles.recapChipCount}>×{r.counts[i]}</span>
                    </span>
                  ))}
                </span>
                <span className={styles.recapPpg}>
                  <b>{r.ppg.toFixed(1)}</b>
                  <span
                    className={styles.recapDelta}
                    data-dir={delta > 0 ? 'up' : delta < 0 ? 'down' : undefined}
                  >
                    {delta > 0 ? '+' : ''}
                    {delta.toFixed(1)}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
        <div className={styles.recapFoot}>
          <span>
            Team <b>{(weekly.reduce((a, w) => a + w.mine, 0) / WEEKS).toFixed(1)}</b> a week, against
            a slate worth <b>{(weekly.reduce((a, w) => a + w.paper, 0) / WEEKS).toFixed(1)}</b>
          </span>
        </div>
      </div>

      <div className={styles.tape}>
        {tape.map((w) => (
          <div
            key={w.week}
            className={styles.tapeRow}
            data-won={w.won ? 'yes' : 'no'}
            data-po={w.po ? 'yes' : undefined}
          >
            <span className={styles.tapeWeek}>{w.po ? 'PO' : w.week}</span>
            <span className={styles.tapeName}>{w.name}</span>
            <span className={styles.tapeScore}>
              {w.mine.toFixed(1)} <span className={styles.resultV}>vs</span> {w.theirs.toFixed(1)}
            </span>
            <span className={styles.tapeMark}>{w.won ? 'W' : 'L'}</span>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => void deal_(deal.pool.id)}>
          Draft another season
        </button>
        <button type="button" className={styles.ghost} onClick={() => void shareRun()}>
          {copied ? 'Link copied' : 'Share this season'}
        </button>
      </div>

      <div className={styles.seedLine}>
        Seed <span className={styles.seed}>{deal.seed}</span> · scored on{' '}
        {deal.profile.replace('_', ' ').replace('pt', 'pt passing TD')}
      </div>

      <OwnLeagueCta
        signedIn={signedIn}
        line="Your own league's cards, drawn from the seasons you were there for."
      />
    </div>
  )
}
