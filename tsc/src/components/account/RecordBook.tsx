// The profile's record book: one short card per game you've played.
//
// Each card leads with your best board. Everything else a game keeps (other
// boards, head-to-head records) stays out of the way: records as a row of
// chips, other boards behind a tap. Games you haven't touched fold into one
// line, because three empty cards is the longest thing on a new profile.
//
// The data comes from loadRecords().

import Link from 'next/link'
import type { GameRecord, RecordLine } from '@/lib/minigames/profileRecords'
import styles from './play.module.css'

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
}

function Line({ line: l }: { line: RecordLine }) {
  return (
    <Link href={l.href} className={styles.line}>
      <span className={styles.lineBoard}>{l.board}</span>
      <span className={styles.lineRank}>
        {l.rank ? (
          <>
            <b>{ordinal(l.rank)}</b>of {l.of.toLocaleString()}
          </>
        ) : (
          <>{l.runs} posted</>
        )}
      </span>
      <span className={styles.lineStat}>
        <span className={styles.lineBig}>{l.big}</span>
        <span className={styles.lineSmall}>{l.small}</span>
      </span>
      {l.friend && (
        <span className={styles.lineFriend}>
          Top friend <b>{l.friend.name}</b>{' '}
          <span className={l.friend.ahead ? styles.ahead : undefined}>{l.friend.big}</span>
        </span>
      )}
    </Link>
  )
}

export function RecordBook({ records }: { records: GameRecord[] }) {
  const played = records.filter((g) => g.lines.length > 0 || g.extras.length > 0)
  const unplayed = records.filter((g) => g.lines.length === 0 && g.extras.length === 0)

  return (
    <div className={styles.books}>
      {played.map((g) => {
        const [lead, ...more] = g.lines
        return (
          <article key={g.id} className={styles.book} style={{ '--accent': g.accent } as React.CSSProperties}>
            <header className={styles.bookHead}>
              <Link href={g.href} className={styles.bookTitle}>
                {g.title} <em>{g.titleEm}</em>
              </Link>
              {g.runs > 0 && (
                <span className={styles.bookRuns}>
                  {g.runs} {g.runs === 1 ? 'run' : 'runs'}
                </span>
              )}
            </header>

            {lead && <Line line={lead} />}

            {g.extras.length > 0 && (
              <div className={styles.chips}>
                {g.extras.map((x) => (
                  <span key={x.label} className={styles.chip} title={x.note}>
                    {x.label} <b>{x.value}</b>
                  </span>
                ))}
              </div>
            )}

            {more.length > 0 && (
              <details className={styles.more}>
                <summary>
                  {more.length} more {more.length === 1 ? 'board' : 'boards'}
                </summary>
                {more.map((l) => (
                  <Line key={l.href} line={l} />
                ))}
              </details>
            )}
          </article>
        )
      })}

      {unplayed.length > 0 && (
        <div className={styles.unplayed}>
          <span>{played.length ? 'Not played yet' : 'Nothing on the books yet'}</span>
          {unplayed.map((g) => (
            <Link key={g.id} href={g.href} style={{ '--accent': g.accent } as React.CSSProperties}>
              {g.title} <em>{g.titleEm}</em>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
