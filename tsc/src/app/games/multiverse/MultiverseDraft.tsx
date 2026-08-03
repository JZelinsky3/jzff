'use client'

// The Multiverse Draft — the board.
//
// Three surfaces in one component, because they are one run: you draft, you
// play it out, you read what happened. Nothing about the draft is hidden —
// every card shows all three of its seasons up front, and the whole game is
// deciding which shape of number you want rather than guessing at one.
//
// The slate is the strategic surface and it is on screen from the first round.
// Fourteen opponents, what each is worth on paper, and your own paper total
// drawn across them once you have cards. That comparison is the decision the
// game is actually about: a roster that is behind the slate wants volatile
// cards, and one that is ahead of it wants anchors. Hiding it would leave
// nothing to think about but the biggest average.
//
// The dice arrive with the board (deal.rolls, one row per slot) rather than
// being rolled here, so a shared link plays the identical season and a
// refresh cannot reroll a bad week.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  SLOTS,
  WEEKS,
  PLAYOFF_LINE,
  weekScore,
  realized,
  grade,
  type MultiverseDeal,
  type MvCard,
} from '@/lib/minigames/multiverse'
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
 * `fired` lights the season that came up this week and dims the others, which
 * is the only animation this game needs: three numbers, one of them true.
 */
function Card({
  card,
  onTake,
  disabled,
  slotLabel,
  fired,
  compact,
}: {
  card: MvCard
  onTake?: () => void
  disabled?: boolean
  slotLabel?: string | null
  fired?: number | null
  compact?: boolean
}) {
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

      <span className={styles.timelines}>
        {card.timelines.map((t, i) => (
          <span
            key={t.year}
            className={styles.timeline}
            data-fired={fired == null ? undefined : fired === i ? 'yes' : 'no'}
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

/**
 * The fourteen weeks, as a magnitude strip.
 *
 * One series and one hue — every bar is the same measure (what that opponent
 * is worth on paper), so colouring them differently would be decoration
 * pretending to be information. Your own paper total is a rule drawn across
 * them, because the only thing worth reading here is which side of it each
 * week falls on. Played weeks take the win/loss tokens, which are the site's
 * reserved status colours and are never used for anything else on this board.
 */
function Slate({
  deal,
  myPpg,
  played,
  results,
}: {
  deal: MultiverseDeal
  myPpg: number | null
  played: number
  results: boolean[]
}) {
  const max = Math.max(...deal.schedule.map((o) => o.ppg), myPpg ?? 0) * 1.06
  return (
    <div className={styles.slate}>
      <div className={styles.slateHead}>
        <span className={styles.slateTitle}>The slate</span>
        <span className={styles.slateNote}>
          {myPpg != null ? (
            <>
              your team <b>{myPpg.toFixed(1)}</b> on paper
            </>
          ) : (
            'what each week is worth on paper'
          )}
        </span>
      </div>
      <div className={styles.slatePlot}>
        {myPpg != null && (
          <span
            className={styles.slateRule}
            style={{ bottom: `${(myPpg / max) * 100}%` }}
            aria-hidden
          />
        )}
        {deal.schedule.map((opp, i) => (
          <span
            key={opp.week}
            className={styles.slateCol}
            title={`Week ${opp.week} · ${opp.name} · ${opp.ppg.toFixed(1)} on paper${
              i < played ? ` · put up ${opp.score.toFixed(1)}` : ''
            }`}
          >
            <span
              className={styles.slateBar}
              data-state={i < played ? (results[i] ? 'won' : 'lost') : undefined}
              style={{ height: `${(opp.ppg / max) * 100}%` }}
            />
            <span className={styles.slateWeek}>{opp.week}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function MultiverseDraft({
  initialDeal,
  initialError,
  signedIn,
}: {
  initialDeal: MultiverseDeal | null
  initialError: string | null
  signedIn: boolean
}) {
  const [deal, setDeal] = useState<MultiverseDeal | null>(initialDeal)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)

  const [roster, setRoster] = useState<(MvCard | null)[]>(() => SLOTS.map(() => null))
  const [round, setRound] = useState(0)
  const [played, setPlayed] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    clearSeedFromUrl()
  }, [])

  const drafting = round < (deal?.rounds.length ?? 0)

  /** Where a card would go: the most restrictive open slot it fits.
      Filling tight slots before the flex is strictly better — it keeps the
      flex open for whatever comes — so there is nothing to ask the player. */
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
    (card: MvCard) => {
      const slot = slotFor(card)
      if (slot == null) return
      setRoster((r) => {
        const next = r.slice()
        next[slot] = card
        return next
      })
      setRound((r) => r + 1)
    },
    [slotFor]
  )

  /** Paper value of the roster so far. During the draft the unfilled slots
      are simply absent, which is honest — it reads as "what I have", and the
      slate rule climbs towards the bars as the board fills. */
  const myPpg = useMemo(
    () => roster.reduce((a, c) => a + (c?.mean ?? 0), 0),
    [roster]
  )

  const weekly = useMemo(() => {
    if (!deal) return []
    return deal.schedule.map((opp, w) => {
      const mine = weekScore(roster, deal.rolls, w)
      return { week: opp.week, mine, theirs: opp.score, won: mine > opp.score, opp }
    })
  }, [deal, roster])

  const results = useMemo(() => weekly.map((w) => w.won), [weekly])
  const wins = useMemo(
    () => weekly.slice(0, played).filter((w) => w.won).length,
    [weekly, played]
  )

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
        setRound(0)
        setPlayed(0)
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
    const line =
      wins >= PLAYOFF_LINE
        ? `I drafted across ${deal.years.length} seasons of ${deal.pool.label} at once and went ${wins}-${WEEKS - wins}. Same cards, same dice, your turn.`
        : `I drafted across ${deal.years.length} seasons of ${deal.pool.label} at once and went ${wins}-${WEEKS - wins}. Beat that.`
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
  }, [deal, wins])

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
          </div>
          <div className={styles.stripSide}>
            <span className={styles.stripNum}>{myPpg.toFixed(1)}</span>
            <span className={styles.stripLabel}>On paper</span>
          </div>
        </div>

        <Slate deal={deal} myPpg={myPpg > 0 ? myPpg : null} played={0} results={results} />

        <div className={styles.cards}>
          {current.cards.map((card) => {
            const slot = slotFor(card)
            return (
              <Card
                key={card.key}
                card={card}
                onTake={() => take(card)}
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
  if (played < WEEKS) {
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
          <div className={styles.stripMid}>Week {played + 1} of {WEEKS}</div>
          <div className={styles.stripSide}>
            <span className={styles.stripNum}>{next.opp.ppg.toFixed(1)}</span>
            <span className={styles.stripLabel}>{next.opp.name} on paper</span>
          </div>
        </div>

        <Slate deal={deal} myPpg={myPpg} played={played} results={results} />

        {last && (
          <div className={styles.result} data-won={last.won ? 'yes' : 'no'}>
            <div className={styles.resultHead}>
              <span className={styles.resultTag}>{last.won ? 'Won' : 'Lost'} week {last.week}</span>
              <span className={styles.resultScore}>
                {last.mine.toFixed(1)} <span className={styles.resultV}>vs</span>{' '}
                {last.theirs.toFixed(1)}
              </span>
            </div>
            <div className={styles.fired}>
              {roster.map((card, slot) =>
                card ? (
                  <Card
                    key={`${card.key}-${slot}`}
                    card={card}
                    compact
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

  // ── The recap ──────────────────────────────────────────────
  const g = grade(wins)
  const madeIt = wins >= PLAYOFF_LINE
  return (
    <div className={styles.board}>
      <div className={styles.final}>
        <div className={styles.finalKicker}>{madeIt ? 'Postseason' : 'Season over'}</div>
        <div className={styles.finalScore}>
          {wins}-{WEEKS - wins}
        </div>
        <h2 className={styles.finalTitle}>{g.title}</h2>
        <p className={styles.finalLine}>{g.line}</p>
        <p className={styles.finalCut}>
          {madeIt
            ? `${PLAYOFF_LINE} wins made it. You had ${wins}.`
            : `${PLAYOFF_LINE} wins made it. You finished ${PLAYOFF_LINE - wins} short.`}
        </p>
      </div>

      <Slate deal={deal} myPpg={myPpg} played={WEEKS} results={results} />

      {/* The thing the whole game is for: what each card was actually worth
          once the dice had finished with it. A man dealt 21 / 12 / 18 is not
          a 17 to you — he is whatever came up, and the front of the card
          never said which. */}
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
            a slate worth <b>{(deal.schedule.reduce((a, o) => a + o.ppg, 0) / WEEKS).toFixed(1)}</b>
          </span>
        </div>
      </div>

      <div className={styles.tape}>
        {weekly.map((w) => (
          <div key={w.week} className={styles.tapeRow} data-won={w.won ? 'yes' : 'no'}>
            <span className={styles.tapeWeek}>{w.week}</span>
            <span className={styles.tapeName}>{w.opp.name}</span>
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
