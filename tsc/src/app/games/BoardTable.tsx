// The leaderboard itself, shared by every game's board page.
//
// Two things this component exists to get right, both of which came out of
// the design rather than the code:
//
//  - It lists RUNS, not players. If one person has put up four of the top
//    ten, they hold four of the top ten. Playing a lot to get there is the
//    board working, not a loophole in it.
//  - The pinned row is a real lookup, not a search of the page. The whole
//    point is the case where your best ISN'T in the rows shown (twenty on a
//    league board, fifty site-wide): you are 77th, and the board says 77th
//    rather than saying nothing.
//
// The career tab is the other question — who is actually good, as a rate
// over every run, with a minimum so one hot wheel can't top it.

import type { Board, BestRow, CareerRow, GameId } from '@/lib/minigames/leaderboard'
import { BoardFace } from './BoardFace'
import styles from './board.module.css'

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
}

/**
 * When the run happened, with the year on it.
 *
 * It was "Aug 3", which is fine on a board a month old and wrong on one that
 * has been collecting runs across seasons: a top ten with 2026 and 2028 in it
 * reads as ten runs from the same fortnight. Nothing in the database had to
 * change — `at` has always been a full timestamp; the year was being thrown
 * away here.
 *
 * Zero-padded and numeric because the column is mono and every row should be
 * the same width down it, which is the whole reason to set a date in numbers
 * rather than "Aug 3, 2026" that shifts a pixel per month.
 */
function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${pad(d.getFullYear() % 100)}`
}

/**
 * How far a Multiverse run got, in two or three characters.
 *
 * The row printed the whole sentence — "Out in the semi-final · 122.8 PPG" —
 * into the same small line as the PPG, next to a date, and on a phone the
 * three of them fought over about 90px. It is a chip beside the date now, and
 * the small line is just the scoring.
 *
 * Read off the stored sentence rather than a new field, so the runs already
 * on the board get chips too. The phrasing is fixed by verifyRun in this same
 * repo; anything unrecognised simply gets no chip.
 */
function playoffChip(round: string | undefined): { label: string; won: boolean } | null {
  if (!round) return null
  const r = round.toLowerCase()
  if (r.includes('won')) return { label: 'Champ', won: true }
  if (r.includes('quarter')) return { label: 'QF', won: false }
  if (r.includes('semi')) return { label: 'SF', won: false }
  if (r.includes('champ') || r.includes('final')) return { label: 'Final', won: false }
  return null
}

/** What a row prints on the right, per game. */
function statFor(game: GameId, row: BestRow): { big: string; small: string } {
  const d = row.display
  switch (game) {
    case 'roulette':
      return { big: d.record ?? String(row.score), small: `${d.ppg ?? row.score} PPG` }
    case 'gauntlet':
      return d.streak != null
        ? { big: String(d.streak), small: 'straight' }
        : { big: `${d.correct ?? row.score}/${d.asked ?? 10}`, small: 'correct' }
    case 'redraft':
      return { big: d.record ?? String(row.score), small: `${d.margin ?? 0} a game` }
    case 'multiverse':
      // Never `row.score`: that one is a packed sort key (wins, then win
      // rate, then scoring) and printing it would put a ten-digit number on
      // the board. The record is the display and it always exists.
      // The round goes in a chip next to the date; this line stays one fact.
      return { big: d.record ?? '·', small: `${d.ppg ?? 0} PPG` }
    default:
      return { big: `${d.correct ?? row.score}/${d.asked ?? 10}`, small: 'correct' }
  }
}

export function BoardTable({
  board,
  game,
  viewerId,
}: {
  board: Board
  game: GameId
  viewerId: string | null
}) {
  if (board.kind === 'career') return <CareerTable board={board} viewerId={viewerId} />

  const { rows, you, total } = board
  if (rows.length === 0) {
    return (
      <p className={styles.empty}>
        Nothing on this board yet. The first finished run takes top spot.
      </p>
    )
  }

  // Only pin the viewer's row when it fell off the end of the page. Inside
  // the page it is highlighted where it already sits, because showing it
  // twice reads as a bug.
  const youShown = you != null && rows.some((r) => r.runId === you.runId)

  return (
    <>
      <ol className={styles.rows}>
        {rows.map((row) => (
          <Row
            key={row.runId}
            row={row}
            game={game}
            mine={viewerId != null && row.userId === viewerId}
          />
        ))}
      </ol>

      {you && !youShown && (
        <>
          <div className={styles.gap} aria-hidden />
          <ol className={styles.rows}>
            <Row row={you} game={game} mine />
          </ol>
          <p className={styles.scale}>
            Your best of {total.toLocaleString()} runs on this board.
          </p>
        </>
      )}
    </>
  )
}

function Row({ row, game, mine }: { row: BestRow; game: GameId; mine: boolean }) {
  const stat = statFor(game, row)
  const chip = game === 'multiverse' ? playoffChip(row.display.round as string | undefined) : null
  return (
    <li className={`${styles.row} ${mine ? styles.rowMine : ''}`}>
      <span className={styles.rank}>{row.rank}</span>
      <BoardFace name={row.name} avatar={row.avatar} />
      <span className={styles.who}>
        <span className={styles.name}>{row.name}</span>
        <span className={styles.sub}>
          <span className={styles.date}>{when(row.at)}</span>
          {chip && (
            <span className={styles.roundChip} data-won={chip.won ? 'yes' : undefined}>
              {chip.label}
            </span>
          )}
        </span>
      </span>
      <span className={styles.stat}>
        <span className={styles.statBig}>{stat.big}</span>
        <span className={styles.statSmall}>{stat.small}</span>
      </span>
    </li>
  )
}

function CareerTable({
  board,
  viewerId,
}: {
  board: Extract<Board, { kind: 'career' }>
  viewerId: string | null
}) {
  const { rows, minRuns } = board
  if (rows.length === 0) {
    return (
      <p className={styles.empty}>
        Nobody has {minRuns} runs in yet. This board needs a few sessions before it says anything.
      </p>
    )
  }

  const qualified = rows.filter((r) => r.qualified)
  const waiting = rows.filter((r) => !r.qualified)

  return (
    <>
      <p className={styles.lede}>
        Every run counts, as a rate, so playing more can&apos;t buy a place. {minRuns} runs to
        qualify.
      </p>
      <ol className={styles.rows}>
        {qualified.map((r) => (
          <CareerRowLine key={r.userId} row={r} mine={viewerId != null && r.userId === viewerId} />
        ))}
      </ol>
      {waiting.length > 0 && (
        <>
          <p className={styles.subhead}>Still qualifying</p>
          <ol className={styles.rows}>
            {waiting.map((r) => (
              <CareerRowLine
                key={r.userId}
                row={r}
                mine={viewerId != null && r.userId === viewerId}
                minRuns={minRuns}
              />
            ))}
          </ol>
        </>
      )}
    </>
  )
}

function CareerRowLine({
  row,
  mine,
  minRuns,
}: {
  row: CareerRow
  mine: boolean
  minRuns?: number
}) {
  return (
    <li className={`${styles.row} ${mine ? styles.rowMine : ''}`}>
      <span className={styles.rank}>{row.rank != null ? row.rank : '·'}</span>
      <BoardFace name={row.name} avatar={row.avatar} />
      <span className={styles.who}>
        <span className={styles.name}>{row.name}</span>
        <span className={styles.date}>
          {row.runs} {row.runs === 1 ? 'run' : 'runs'}
          {minRuns != null ? ` · ${minRuns - row.runs} to go` : ''}
        </span>
      </span>
      <span className={styles.stat}>
        <span className={styles.statBig}>{(row.rate * 100).toFixed(1)}%</span>
        <span className={styles.statSmall}>best {row.best}</span>
      </span>
    </li>
  )
}

export { ordinal }
