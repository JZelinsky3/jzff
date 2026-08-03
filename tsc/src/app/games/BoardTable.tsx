// The leaderboard itself, shared by every game's board page.
//
// Two things this component exists to get right, both of which came out of
// the design rather than the code:
//
//  - It lists RUNS, not players. If one person has put up four of the top
//    ten, they hold four of the top ten. Playing a lot to get there is the
//    board working, not a loophole in it.
//  - The pinned row is a real lookup, not a search of the page. The whole
//    point is the case where your best ISN'T in the fifty shown: you are
//    77th, and the board says 77th rather than saying nothing.
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

function when(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
  return (
    <li className={`${styles.row} ${mine ? styles.rowMine : ''}`}>
      <span className={styles.rank}>{row.rank}</span>
      <BoardFace name={row.name} avatar={row.avatar} />
      <span className={styles.who}>
        <span className={styles.name}>{row.name}</span>
        <span className={styles.date}>{when(row.at)}</span>
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
