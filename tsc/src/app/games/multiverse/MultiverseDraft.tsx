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

/** Takes the shared run back out of the address bar — see the other boards.
    A refresh should deal a new season, not replay the last one, and the
    sharer's record has no business sitting in the reader's URL once the
    preview that needed it has been scraped. */
function clearSeedFromUrl() {
  try {
    const url = new URL(window.location.href)
    const junk = ['seed', 'w', 's', 'm', 'po']
    if (!junk.some((k) => url.searchParams.has(k))) return
    for (const k of junk) url.searchParams.delete(k)
    window.history.replaceState(null, '', url)
  } catch {
    /* no URL to tidy, which is fine */
  }
}

/**
 * Winning it, briefly.
 *
 * The one moment in the game that deserves motion, and the only one that
 * gets it. Fixed over everything, pointer-events off, and it falls out of
 * the top of the screen once and does not repeat.
 *
 * Deterministic rather than random: every value is derived from the index, so
 * there is nothing here that could differ between a server render and a
 * client one. In this game's colours, because a burst of party primaries over
 * a cold teal board would look like somebody else's component.
 */
function Confetti() {
  const bits = Array.from({ length: 46 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: ((i * 29) % 90) / 100,
    dur: 2.4 + (((i * 53) % 70) / 100) * 2,
    tilt: (((i * 71) % 100) - 50) * 6,
    tone: i % 4,
    wide: i % 3 === 0,
  }))
  return (
    <div className={styles.confetti} aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          className={styles.bit}
          data-tone={b.tone}
          style={
            {
              left: `${b.left}%`,
              width: b.wide ? '9px' : '5px',
              '--delay': `${b.delay}s`,
              '--dur': `${b.dur}s`,
              '--tilt': `${b.tilt}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
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
  // The postseason cuts every card to its best seasons, and the ones it cut
  // are still worth drawing: an empty third of the card says nothing, whereas
  // a greyed year says "this one is out of play now". Kept first, dropped
  // last, so the two that count read as a pair.
  const kept = only ? card.timelines.filter((_, i) => only.includes(i)) : card.timelines
  const dropped = only ? card.timelines.filter((_, i) => !only.includes(i)) : []
  const shown = [...kept, ...dropped]
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
        {shown.map((t, i) => (
          <span
            key={t.year}
            className={styles.timeline}
            data-cut={i >= kept.length ? 'yes' : undefined}
            data-fired={
              i >= kept.length || firedYear == null
                ? undefined
                : firedYear === t.year
                  ? 'yes'
                  : 'no'
            }
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
 * The draft, on a phone: one card per ROW, three seasons abreast.
 *
 * The desktop board deals five cards across. A phone got that same grid folded
 * to two columns, which left each card about 158px with its three bands stacked
 * inside it — so the positional rank had to be dropped for want of width, and
 * comparing all five meant scrolling a screen and a half of near-identical
 * tiles.
 *
 * A phone's spare dimension is the WIDTH of a row, not the number of columns.
 * So the bands run across instead of down: three seasons side by side at about
 * 100px each, which is enough to keep the rank and the games played, and a card
 * that is three players finally reads as three things at one glance. Five rows
 * down the screen also compare the way the desktop's five columns do — the
 * decision this game is actually about is the SHAPE of the three numbers, and
 * shapes only compare when they're drawn the same size in a row.
 */
function DraftRow({
  card,
  onTake,
  disabled,
  slotLabel,
}: {
  card: MvCard
  onTake: () => void
  disabled?: boolean
  slotLabel: string | null
}) {
  // The right of the row used to be the slot this card would fill, which for
  // six of the seven slots is the word already sitting under the name: a QB
  // card read "QB … QB". The slot is only worth saying when it ISN'T the
  // position — the flex, or nowhere at all — so it says it then, next to the
  // position, and the right of the row carries the average instead. That is
  // the number every card gets compared on, and it belongs where the eye ends
  // up rather than buried in a line of small type.
  const hint =
    slotLabel == null ? 'no slot' : slotLabel === card.pos ? null : `to ${slotLabel.toLowerCase()}`

  // What SHAPE the three numbers are, which is the decision this game is
  // actually about and the one thing the row never said out loud. The bands
  // below hold all three seasons and the spread holds the gap, but reading a
  // card off them takes a second per card and there are five of them on
  // screen — this is that second, spent once, at the front.
  //
  // Measured against the card's own average rather than a flat points
  // threshold: eight points between a quarterback's best and worst year is
  // ordinary, and on a tight end it is the whole player.
  const swing = card.mean > 0 ? card.spread / card.mean : 0
  const shape = swing < 0.28 ? 'steady' : swing < 0.55 ? 'swings' : 'wild'

  return (
    <button type="button" className={styles.dRow} onClick={onTake} disabled={disabled}>
      <span className={styles.dHead}>
        <Face name={card.name} playerId={card.playerId} />
        <span className={styles.dWho}>
          <span className={styles.dName}>{card.name}</span>
          <span className={styles.dMeta}>
            <span className={styles.pos} data-pos={card.pos}>
              {card.pos}
            </span>
            <span className={styles.dShape} data-shape={shape}>
              {shape}
            </span>
            {hint && (
              <span className={styles.dHint} data-none={slotLabel == null ? 'yes' : undefined}>
                {hint}
              </span>
            )}
          </span>
        </span>
        <span className={styles.dAvg}>
          <span className={styles.dAvgNum}>{card.mean.toFixed(1)}</span>
          <span className={styles.dAvgFoot}>
            <span className={styles.dAvgLabel}>avg</span>
            <span className={styles.spread} data-wide={card.spread >= 8 ? 'yes' : undefined}>
              ±{card.spread.toFixed(1)}
            </span>
          </span>
        </span>
      </span>

      <span className={styles.dBands}>
        {card.timelines.map((t) => (
          <span key={t.year} className={styles.dBand}>
            <span className={styles.dBandYear}>{t.year}</span>
            <span className={styles.dBandPpg}>{t.ppg.toFixed(1)}</span>
            <span className={styles.dBandRank}>
              {card.pos}
              {t.posRank} · {t.gp}g
            </span>
          </span>
        ))}
      </span>
    </button>
  )
}

/** What one slot did in the week just played: the seasons it could have
    rolled, which one came up, and what that was worth. Null before a week
    has been played, which is when the HUD falls back to the card's average. */
type HudRoll = { shown: MvCard['timelines']; idx: number; pts: number }

/**
 * The lineup, at the thumb.
 *
 * Lifted from Roster Roulette's HUD (see .hud in games.module.css) because it
 * solved the same problem: on a phone the thing you consult on every single
 * decision was living at the bottom of a scroll. Here it does one more job.
 *
 * Playing a week used to be a round trip — scroll down to the button, tap,
 * scroll up to find out whether you won, scroll back down for the next one,
 * fourteen times. So the week's action lives in the bar, and so does its
 * result: the seven cells that show each slot's average while you draft show
 * what that slot actually PUT UP once the week has been played. Open it and
 * every card shows all three seasons with the one that came up lit, which is
 * the only question the collapsed number leaves ("was that his good year?").
 *
 * The board above it never has to move, so the slate and the record stay where
 * they were.
 */
function Hud({
  roster,
  open,
  onToggle,
  rolls,
  replay,
  headline,
  action,
  secondary,
  keep,
}: {
  roster: (MvCard | null)[]
  open: boolean
  onToggle: () => void
  /** Per slot. Null during the draft and before week one. */
  rolls: (HudRoll | null)[] | null
  /** Postseason only: how many seasons a card still has in play. The rest are
      drawn greyed at the end of the row rather than left out, so the cut is
      visible BEFORE the round is played rather than inferred from a gap. */
  keep?: number
  /** Bumped every week so the fire animation replays down the rows. */
  replay: number
  headline: React.ReactNode
  action?: { label: string; onClick: () => void }
  secondary?: { label: string; onClick: () => void }
}) {
  return (
    <div className={styles.hud}>
      <div className={styles.hudInner}>
        <div className={styles.hudBar}>
          <button
            type="button"
            className={styles.hudToggle}
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? 'Collapse the lineup' : 'Expand the lineup'}
          >
            <span className={styles.hudHeadline}>{headline}</span>
            <span className={open ? styles.hudChevOpen : styles.hudChev} aria-hidden>
              {/* 12, not 13. The box is 24 inside its border, so an odd glyph
                  leaves a 6.5px gap either side — a half pixel, which the
                  browser has to round somewhere, and it rounds it the same way
                  every time. It read as the arrow sitting a pixel right. */}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </span>
          </button>
          {action && (
            <button type="button" className={styles.hudGo} onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </div>

        {open ? (
          <div className={styles.hudRows}>
            {SLOTS.map((s, i) => {
              const card = roster[i]
              if (!card) {
                return (
                  <div key={s.id} className={styles.hudRowOff}>
                    <span className={styles.hudRowId}>{s.label}</span>
                    <span className={styles.hudRowOpen}>Open</span>
                  </div>
                )
              }
              const r = rolls?.[i] ?? null
              const live = r ? r.shown : keep ? bestTimelines(card, keep) : card.timelines
              const cut = keep
                ? card.timelines.filter((t) => !live.some((k) => k.year === t.year))
                : []
              const bands = [...live, ...cut]
              return (
                <div
                  // Re-keyed per week, which is what replays the reveal.
                  key={`${s.id}-${replay}`}
                  className={styles.hudRow}
                  style={
                    {
                      '--pos': `var(--pos-${card.pos})`,
                      '--slot': i,
                    } as React.CSSProperties
                  }
                >
                  <span className={styles.hudRowId}>{s.label}</span>
                  <span className={styles.hudRowName}>{card.name}</span>
                  <span className={styles.hudRowPts}>{(r ? r.pts : card.mean).toFixed(1)}</span>
                  <span className={styles.hudRowBands}>
                    {bands.map((t, ti) => (
                      <span
                        key={t.year}
                        className={styles.hudBand}
                        data-cut={ti >= live.length ? 'yes' : undefined}
                        data-fired={
                          ti >= live.length || !r ? undefined : ti === r.idx ? 'yes' : 'no'
                        }
                      >
                        <span className={styles.hudBandYear}>{t.year}</span>
                        <span className={styles.hudBandPpg}>{t.ppg.toFixed(1)}</span>
                        <span className={styles.hudBandRank}>
                          {card.pos}
                          {t.posRank}
                        </span>
                      </span>
                    ))}
                  </span>
                </div>
              )
            })}
            {secondary && (
              <button type="button" className={styles.hudSecondary} onClick={secondary.onClick}>
                {secondary.label}
              </button>
            )}
          </div>
        ) : (
          <div className={styles.hudCells}>
            {SLOTS.map((s, i) => {
              const card = roster[i]
              const r = rolls?.[i] ?? null
              return (
                <div
                  key={s.id}
                  className={card ? styles.hudCellOn : styles.hudCell}
                  style={
                    card ? ({ '--pos': `var(--pos-${card.pos})` } as React.CSSProperties) : undefined
                  }
                >
                  <span className={styles.hudCellId}>{s.label}</span>
                  <span className={styles.hudCellVal}>
                    {r ? r.pts.toFixed(1) : card ? card.mean.toFixed(1) : '·'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
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
 * An UNPLAYED week sits exactly on the line. It used to carry a projected
 * ratio off paper, and the projection was never worth what it cost: opponents
 * land within a few points of each other, so fourteen unplayed weeks drew
 * fourteen near-identical bars a hair off parity — close enough to read as a
 * result, different enough to look like one week was going better than
 * another before a single die had been thrown. Flat says the true thing. The
 * row then fills in as it is played, and the shape that appears is entirely
 * made of weeks that actually happened.
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
  mobile,
}: {
  lines: WeekLine[]
  myPpg: number
  played: number
  mobile: boolean
}) {
  // Your points as a share of theirs. 1 is parity, and the line is drawn at 1
  // — so an unplayed week, which has no share of anything yet, is exactly 1.
  const ratios = lines.map((l, i) =>
    i < played ? (l.theirs > 0 ? l.mine / l.theirs : 1) : 1
  )
  // Scaled off the biggest deviation actually present, with a floor so a
  // quiet season doesn't get magnified into a dramatic one. Played weeks
  // only: the flat ones would just pull the maximum to the floor.
  const spread = Math.max(0.1, ...ratios.slice(0, played).map((r) => Math.abs(r - 1)))

  return (
    <div className={styles.slate}>
      <div className={styles.slateHead}>
        <span className={styles.slateTitle}>The slate</span>
        <span className={styles.slateNote}>
          {played > 0 ? (
            <>
              <b>{played}</b> played
            </>
          ) : mobile ? (
            <>
              projected · <b>{myPpg.toFixed(1)}</b>
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
        <span>{mobile ? 'Above the line is a win' : 'Bars above the line are wins'}</span>
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
  mobile,
}: {
  initialDeal: MultiverseDeal | null
  initialError: string | null
  signedIn: boolean
  shared: boolean
  mobile: boolean
}) {
  const [deal, setDeal] = useState<MultiverseDeal | null>(initialDeal)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [isShared, setIsShared] = useState(shared)

  const [roster, setRoster] = useState<(MvCard | null)[]>(() => SLOTS.map(() => null))
  const [picks, setPicks] = useState<number[]>([])
  const [round, setRound] = useState(0)
  const [played, setPlayed] = useState(0)
  /** Week fourteen has to be read before the season is allowed to end. */
  const [seasonClosed, setSeasonClosed] = useState(false)
  const [poPlayed, setPoPlayed] = useState(0)
  const [poOpen, setPoOpen] = useState(false)
  const [poClosed, setPoClosed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [post, setPost] = useState<PostState>({ state: 'idle' })
  // The phone's lineup bar. Closed is the seven cells, which already answer
  // "what did each of them put up" — open is the three-seasons detail, which
  // is a question you ask a few times a season rather than every week.
  const [hudOpen, setHudOpen] = useState(false)

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
  /**
   * Where your record puts you in the bracket.
   *
   * The dealer hands back the three sides weakest-first and cannot do better
   * than that: it builds the postseason before anybody has drafted, so it has
   * no idea what record the player will bring to it. Seeding is therefore
   * done here, at the point the season is over and the record is known.
   *
   * The SAME three teams either way. Scraping in at eight wins puts the best
   * side left in front of you immediately; a 12-2 season opens against the
   * softest and climbs. So the field you have to beat to win it is identical
   * whatever your seed — three opponents averaging the same — and all the
   * record buys you is the order they arrive in, which is exactly what a seed
   * is worth in a real bracket.
   */
  const poOrder = useMemo(() => {
    if (finalWins >= 12) return [0, 1, 2]
    if (finalWins >= 10) return [1, 0, 2]
    return [2, 0, 1]
  }, [finalWins])

  const poGames = useMemo<WeekLine[]>(() => {
    if (!deal) return []
    return poOrder.map((oi, r) => {
      const opp = deal.playoffs.opponents[oi]
      const mine = playoffScore(roster, deal.playoffs.rolls, r, deal.playoffs.keep)
      return {
        // The round decides the week, not the opponent: they have been
        // reordered, and a quarter-final is week fifteen whoever is in it.
        week: WEEKS + r + 1,
        mine,
        theirs: opp.score,
        won: mine > opp.score,
        name: opp.name,
        paper: opp.ppg,
      }
    })
  }, [deal, roster, poOrder])

  const poLimit = useMemo(() => {
    for (let i = 0; i < poGames.length; i++) if (!poGames[i].won) return i + 1
    return poGames.length
  }, [poGames])

  const poWins = useMemo(
    () => poGames.slice(0, poPlayed).filter((g) => g.won).length,
    [poGames, poPlayed]
  )

  /** What each slot rolled in the week just played, for the phone's HUD.
      Null until a week has been played, which is when the bar shows the
      card's average instead — there is no result to report yet. */
  const seasonRolls = useMemo<(HudRoll | null)[] | null>(() => {
    if (!deal || played === 0) return null
    return roster.map((card, slot) => {
      if (!card) return null
      const idx = (deal.rolls[slot]?.[played - 1] ?? 0) % card.timelines.length
      return { shown: card.timelines, idx, pts: card.timelines[idx]?.ppg ?? 0 }
    })
  }, [deal, roster, played])

  /** The same, for the postseason — where every card has been cut down to its
      best seasons, so the three bands are not the three it was drafted with. */
  const poRolls = useMemo<(HudRoll | null)[] | null>(() => {
    if (!deal || poPlayed === 0) return null
    return roster.map((card, slot) => {
      if (!card) return null
      const kept = bestTimelines(card, deal.playoffs.keep)
      const idx = (deal.playoffs.rolls[slot]?.[poPlayed - 1] ?? 0) % kept.length
      return { shown: kept, idx, pts: kept[idx]?.ppg ?? 0 }
    })
  }, [deal, roster, poPlayed])

  const seasonOver = played >= WEEKS
  // Both endings have to be CLOSED by the player, not just reached.
  //
  // The postseason learned this first: deriving the end from `poPlayed >=
  // poLimit` sent a knocked-out run to the recap the instant the losing game
  // resolved, so the game you lost was the one game you never saw. Week
  // fourteen had exactly the same hole and it was worse, because every run
  // has a week fourteen — `played >= WEEKS` flipped the moment the button was
  // pressed, and the fourteenth week's score went past on the way to the
  // postseason banner. You could go 9-5 without ever seeing the week that
  // made it 9-5.
  const done = seasonOver && seasonClosed && (!madeIt || poClosed)

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
        setSeasonClosed(false)
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
    // NO SEED, for the reason Roster Roulette gives: a challenge means "play
    // until you beat this", not "replay my exact draft". Handing over the seed
    // sent a friend to a board that could never be posted — a seeded deal is a
    // replay, and the run banker refuses replays — so the one link anybody
    // actually shares was the one link that led somewhere that did not count.
    // They land on a fresh draft with the record to beat in the preview.
    // The season, written onto the link so the preview card can draw it
    // without a database or a session. The board ignores all three.
    url.searchParams.set('w', String(finalWins))
    url.searchParams.set('s', weekly.map((w) => (w.won ? 'W' : 'L')).join(''))
    // Each week's height on the slate, so the preview draws the season's own
    // shape rather than fourteen identical bars. It is the SHARE the slate
    // plots (your points over theirs), not the margin, because the card
    // redraws that chart and the two have to agree.
    //
    // One base36 digit per week: two-percent steps off parity, offset by 17,
    // which puts ±34% inside one character and the season inside fourteen.
    url.searchParams.set(
      'm',
      weekly
        .map((w) => {
          const share = w.theirs > 0 ? w.mine / w.theirs : 1
          const step = Math.round((share - 1) * 50)
          return Math.max(0, Math.min(34, step + 17)).toString(36)
        })
        .join('')
    )
    if (madeIt) {
      url.searchParams.set(
        'po',
        poWins >= PLAYOFF_ROUNDS
          ? 'champion'
          : poPlayed >= PLAYOFF_ROUNDS
            ? 'final'
            : 'out'
      )
    }
    const tail =
      madeIt && poWins >= PLAYOFF_ROUNDS
        ? `went ${finalWins}-${WEEKS - finalWins} and won the whole thing`
        : madeIt
          ? `went ${finalWins}-${WEEKS - finalWins} and made the postseason`
          : `went ${finalWins}-${WEEKS - finalWins}`
    // The invitation is to DRAFT, not to replay: the link carries no seed, so
    // whoever opens it gets their own board and a number to beat.
    const line = `I drafted across ${deal.years.length} seasons of ${deal.pool.label} at once and ${tail}. Draft your own and beat it.`
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
  }, [deal, madeIt, poWins, poPlayed, finalWins, weekly])

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
            <span className={styles.railName}>{card ? card.name : '·'}</span>
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
            {mobile
              ? `${deal.timelines} seasons each`
              : `${deal.timelines} seasons per player · ${deal.years[0]}–${deal.years[deal.years.length - 1]}`}
            <span className={styles.tierNote}>{current.tier}</span>
          </div>
          <div className={styles.stripSide}>
            <span className={styles.stripNum}>{myPpg.toFixed(1)}</span>
            <span className={styles.stripLabel}>On paper</span>
          </div>
        </div>

        <Slate lines={weekly} myPpg={myPpg} played={0} mobile={mobile} />

        {mobile ? (
          <div className={styles.deck}>
            {current.cards.map((card, i) => {
              const slot = slotFor(card)
              return (
                <DraftRow
                  key={card.key}
                  card={card}
                  onTake={() => take(card, i)}
                  disabled={slot == null}
                  slotLabel={slot == null ? null : SLOTS[slot].label}
                />
              )
            })}
          </div>
        ) : (
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
        )}

        {/* The rail is the phone's HUD instead: same seven slots, fixed at the
            thumb, so the roster fills in view of the cards being chosen rather
            than a screen below them. */}
        {mobile ? (
          <Hud
            roster={roster}
            open={hudOpen}
            onToggle={() => setHudOpen((v) => !v)}
            rolls={null}
            replay={round}
            headline={
              <>
                <b>{myPpg.toFixed(1)}</b> on paper
                <span className={styles.hudDot}>·</span>
                {roster.filter(Boolean).length}/{SLOTS.length} set
              </>
            }
          />
        ) : (
          rosterRail
        )}
      </div>
    )
  }

  // ── Playing it out ─────────────────────────────────────────
  // Stays on screen after the fourteenth week is played, until the player
  // closes it. See `done` above.
  if (!seasonOver || !seasonClosed) {
    const last = played > 0 ? weekly[played - 1] : null
    const next = played < WEEKS ? weekly[played] : null
    const myWeekly = weekly.reduce((a, w) => a + w.mine, 0) / WEEKS
    // Deliberately not "you're in" / "you're out" — the fourteenth week is
    // still being read at this point, and the banner is where the season is
    // totted up.
    const closeLabel = 'See where that leaves you'
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
            {next ? `Week ${played + 1} of ${WEEKS}` : `All ${WEEKS} played`}
          </div>
          <div className={styles.stripSide}>
            {/* Nothing here says whether the season was enough. That is the
                banner's reveal on the next tap, and printing "In" beside the
                fourteenth week's score would take it away. */}
            <span className={styles.stripNum}>
              {next ? next.paper.toFixed(1) : myWeekly.toFixed(1)}
            </span>
            <span className={styles.stripLabel}>
              {next ? `${next.name} on paper` : 'Your week'}
            </span>
          </div>
        </div>

        <Slate lines={weekly} myPpg={myPpg} played={played} mobile={mobile} />

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
            {/* The seven reveals are the HUD's job on a phone — printing them
                here as well is the same information twice on a screen that
                then needs scrolling to reach the button. */}
            {!mobile && (
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
            )}
          </div>
        )}

        {mobile ? (
          <Hud
            roster={roster}
            open={hudOpen}
            onToggle={() => setHudOpen((v) => !v)}
            rolls={seasonRolls}
            replay={played}
            headline={
              last ? (
                <>
                  <span className={styles.hudRes} data-won={last.won ? 'yes' : 'no'}>
                    {last.won ? 'W' : 'L'}
                  </span>
                  <b>{last.mine.toFixed(1)}</b> vs {last.theirs.toFixed(1)}
                </>
              ) : (
                <>
                  <b>{myPpg.toFixed(1)}</b> on paper
                  <span className={styles.hudDot}>·</span>
                  {WEEKS} to play
                </>
              )
            }
            action={
              next
                ? { label: `Play week ${played + 1}`, onClick: () => setPlayed((p) => p + 1) }
                : { label: closeLabel, onClick: () => setSeasonClosed(true) }
            }
            secondary={
              next ? { label: 'Play out the season', onClick: () => setPlayed(WEEKS) } : undefined
            }
          />
        ) : (
          <div className={styles.actions} data-single={next ? undefined : 'yes'}>
            {next ? (
              <>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => setPlayed((p) => p + 1)}
                >
                  Play week {played + 1}
                </button>
                <button type="button" className={styles.ghost} onClick={() => setPlayed(WEEKS)}>
                  Play out the season
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.primary}
                onClick={() => setSeasonClosed(true)}
              >
                {closeLabel}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── The postseason ─────────────────────────────────────────

  /** Whether the run is over: the losing game has been played, or the final
      has. Not `poPlayed >= poLimit` used as a FORECAST — see below. */
  const poEnded = poPlayed >= poLimit

  // A round nobody has played yet is quoted on paper, whether or not it will
  // ever be reached. It used to say "not reached" for any round past the
  // first loss, which read the result out before the game did: three rounds
  // priced on paper meant you were going to win the first two, and "not
  // reached" sitting under round two meant you were about to lose round one.
  // Only a run that has actually ENDED knows which rounds went unplayed.
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
                : poEnded && r >= poLimit
                  ? 'not reached'
                  : `${g.paper.toFixed(1)} on paper`}
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
            go up, and so does everybody else&rsquo;s, because the field left is the strongest the
            league can put out.
          </p>
          {/* Why the draw looks the way it does. Same three teams at every
              seed, so this is about order and nothing else. */}
          <p className={styles.poSeed}>
            {finalWins >= 12
              ? 'Top seed. You open against the softest side left, and it hardens from there.'
              : finalWins >= 10
                ? 'Middle seed. You open in the middle of the field, and the best of it waits.'
                : 'Low seed. The best team left is in front of you in round one.'}
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

        {/* The postseason has no slate, and that space is the point: three
            games decide the run, so each one gets announced rather than
            appearing as another row. */}
        {more && (
          <div className={styles.poStage}>
            <div className={styles.poStageKicker}>
              Round {poPlayed + 1} of {PLAYOFF_ROUNDS} · single elimination
            </div>
            <h2 className={styles.poStageTitle}>{PLAYOFF_ROUND_NAMES[poPlayed]}</h2>
            <div className={styles.poStageVs}>
              <span className={styles.poStageTeam}>Your seven</span>
              <span className={styles.poStageV}>vs</span>
              <span className={styles.poStageTeam}>{poGames[poPlayed].name}</span>
            </div>
            <div className={styles.poStageLine}>
              <b>{poGames[poPlayed].paper.toFixed(1)}</b> on paper
              {poPlayed + 1 === PLAYOFF_ROUNDS
                ? '. Win this and you have won it.'
                : '. Lose and the season ends here.'}
            </div>
          </div>
        )}

        {bracket}

        {last && (
          <div className={styles.result} data-won={last.won ? 'yes' : 'no'} data-po="yes">
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
            {!mobile && (
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
            )}
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
                {/* The moment it happens, not two screens later on the recap. */}
                <Confetti />
              </>
            )}
          </div>
        )}

        {mobile ? (
          <Hud
            roster={roster}
            open={hudOpen}
            onToggle={() => setHudOpen((v) => !v)}
            rolls={poRolls}
            keep={deal.playoffs.keep}
            replay={100 + poPlayed}
            headline={
              last ? (
                <>
                  <span className={styles.hudRes} data-won={last.won ? 'yes' : 'no'}>
                    {last.won ? 'W' : 'L'}
                  </span>
                  <b>{last.mine.toFixed(1)}</b> vs {last.theirs.toFixed(1)}
                </>
              ) : (
                <>
                  Best {deal.playoffs.keep === 1 ? 'season' : `${deal.playoffs.keep} seasons`} only
                </>
              )
            }
            action={
              more
                ? {
                    label: `Play ${PLAYOFF_ROUND_NAMES[poPlayed].toLowerCase()}`,
                    onClick: () => setPoPlayed((p) => p + 1),
                  }
                : { label: 'End season', onClick: () => setPoClosed(true) }
            }
          />
        ) : (
          <div className={styles.actions} data-single="yes">
            {more ? (
              <button
                type="button"
                className={styles.primary}
                onClick={() => setPoPlayed((p) => p + 1)}
              >
                Play {PLAYOFF_ROUND_NAMES[poPlayed].toLowerCase()}
              </button>
            ) : (
              <button type="button" className={styles.primary} onClick={() => setPoClosed(true)}>
                End season
              </button>
            )}
          </div>
        )}
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

      <Slate lines={weekly} myPpg={myPpg} played={WEEKS} mobile={mobile} />

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
            {mobile
              ? `Season PPG, against the ${deal.timelines} he was dealt.`
              : `Season PPG across the ${WEEKS} weeks, against the seasons the card was dealt.`}
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
                    <span
                      key={t.year}
                      className={styles.recapChip}
                      // Filled to the share of the season it took. See the
                      // ::before in the stylesheet.
                      style={
                        { '--share': `${(r.counts[i] / WEEKS) * 100}%` } as React.CSSProperties
                      }
                    >
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

      {/* The board, offered whatever happened to the run. It used to appear
          only inside the "posted" line, which meant a signed-out player, a
          shared season, or anyone whose post didn't land was told a board
          existed and given no way to it. */}
      <div className={styles.actions} data-three="yes">
        <button type="button" className={styles.primary} onClick={() => void deal_(deal.pool.id)}>
          Draft another season
        </button>
        <Link
          href={`/games/multiverse/board/?pool=${encodeURIComponent(deal.pool.id)}`}
          className={styles.ghostLink}
        >
          See the board
        </Link>
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
