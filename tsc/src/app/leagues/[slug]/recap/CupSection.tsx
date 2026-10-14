// The Cup's section in the recap paper, on the weeks it runs: what the Cup
// did this week, who plays next week (with the odds going in), the bracket
// challenge, and the way back to the bracket. Built from the same teaser as
// the email's block (lib/cup/teaser), so the page and the email agree.
//
// Its stock is the Cup page's golden ticket (green ink on brass-cream), so
// it reads as the Cup, not as one more section of the paper.

import type { CupTeaser, CupTeaserGame } from '@/lib/cup/teaser'
import { cupBubbleLines, cupCta, cupDeck, cupLeadersLine, cupLockText, cupNextLabel, cupSideRight, cupTag } from '@/lib/cup/words'
import recap from './recap.module.css'
import styles from './cupSection.module.css'

function Games({ label, games, kind }: { label: string; games: CupTeaserGame[]; kind: 'result' | 'next' }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardLabel}>{label}</div>
      <ol className={styles.games}>
        {games.map((g, i) => {
          const [top, bottom] = kind === 'result' ? (g.winner === 'b' ? [g.b, g.a] : [g.a, g.b]) : g.a.seed <= g.b.seed ? [g.a, g.b] : [g.b, g.a]
          const right = (s: typeof top) => cupSideRight(s, kind)
          return (
            <li key={i} className={styles.game}>
              <span className={`${styles.row} ${kind === 'result' ? styles.won : ''}`}>
                <span className={styles.seed}>{top.seed}</span>
                <span className={styles.name}>
                  {top.name}
                  {g.upset ? <span className={styles.upset}>Upset</span> : null}
                </span>
                <span className={styles.num}>{right(top)}</span>
              </span>
              <span className={`${styles.row} ${kind === 'result' ? styles.lost : ''}`}>
                <span className={styles.seed}>{bottom.seed}</span>
                <span className={styles.name}>{bottom.name}</span>
                <span className={styles.num}>{right(bottom)}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function CupSection({ cup, href }: { cup: CupTeaser; href: string }) {
  const deck = cupDeck(cup)
  // Only while it's still true: an old paper read after the lock points at
  // the bracket instead.
  const lock = cup.next?.open ? cupLockText(cup.next.lockAt) : null
  const leaders = cupLeadersLine(cup)
  const bubble = cupBubbleLines(cup)
  const tag = cupTag(cup)
  return (
    <section className={`${recap.section} ${styles.sCup}`}>
      <header className={recap.sectionHead} id="cup">
        <div>
          <div className={recap.sectionTag}>{tag}</div>
          <h2>{cup.name}</h2>
        </div>
        <a className={recap.sectionLink} href={href}>
          {cup.preview ? 'The preview' : 'The bracket'}
        </a>
      </header>
      {deck ? <p className={styles.deck}>{deck}</p> : null}
      <div className={styles.cards}>
        {cup.results ? <Games label={`Week ${cup.week} · ${cup.results.round}`} games={cup.results.games} kind="result" /> : null}
        {cup.next ? <Games label={cupNextLabel(cup)} games={cup.next.games} kind="next" /> : null}
      </div>
      {cup.next?.byes.length ? <p className={styles.byes}>Byes: {cup.next.byes.map((b) => `${b.name} (${b.seed})`).join(', ')}</p> : null}
      {bubble.map((l) => (
        <p key={l} className={styles.leaders}>
          {l}
        </p>
      ))}
      {leaders ? <p className={styles.leaders}>{leaders}</p> : null}
      <div className={styles.ctaRow}>
        <a className={styles.cta} href={href}>
          {cupCta(cup)}
        </a>
        {lock ? <span className={styles.lock}>Picks lock {lock} ET</span> : null}
      </div>
    </section>
  )
}
