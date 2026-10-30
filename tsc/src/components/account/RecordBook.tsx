// The profile's record book: one card per game that keeps a board.
//
// Presentational only, so it renders the same from the desktop page and
// inside the phone profile. The data comes from loadRecords().

import Link from 'next/link'
import type { GameRecord } from '@/lib/minigames/profileRecords'
import styles from './play.module.css'

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
}

export function RecordBook({ records, phone = false }: { records: GameRecord[]; phone?: boolean }) {
  return (
    <div className={`${styles.books}${phone ? ` ${styles.phone}` : ''}`}>
      {records.map((g) => (
        <article key={g.id} className={styles.book} style={{ '--accent': g.accent } as React.CSSProperties}>
          <header className={styles.bookHead}>
            <Link href={g.href} className={styles.bookTitle}>
              {g.title} <em>{g.titleEm}</em>
            </Link>
            <span className={styles.bookRuns}>
              {g.runs ? `${g.runs} ${g.runs === 1 ? 'run' : 'runs'}` : 'Unplayed'}
            </span>
          </header>

          {g.lines.length === 0 && g.extras.length === 0 ? (
            <div className={styles.empty}>
              Nothing on the books yet.
              <Link href={g.href} className={styles.btnGhost}>
                Play
              </Link>
            </div>
          ) : (
            g.lines.map((l) => (
              <Link key={l.href} href={l.href} className={styles.line}>
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
                  <span className={styles.lineSmall}>
                    {l.small}
                    {l.runs > 1 ? ` · best of ${l.runs}` : ''}
                  </span>
                </span>
                {l.friend && (
                  <span className={styles.lineFriend}>
                    Top friend <b>{l.friend.name}</b>{' '}
                    <span className={l.friend.ahead ? styles.ahead : undefined}>
                      {l.friend.big} · {l.friend.small}
                    </span>
                  </span>
                )}
              </Link>
            ))
          )}

          {g.extras.length > 0 && (
            <div className={styles.extras}>
              {g.extras.map((x) => (
                <div key={x.label} className={styles.extra}>
                  <span>{x.label}</span>
                  <span className={styles.extraDots} aria-hidden />
                  <span className={styles.extraValue}>{x.value}</span>
                  {x.note && <span className={styles.extraNote}>{x.note}</span>}
                </div>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
