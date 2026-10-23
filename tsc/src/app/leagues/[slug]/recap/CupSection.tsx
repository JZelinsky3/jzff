// The Cup's section in the recap paper, on the weeks it runs: what the Cup
// did this week, who plays next week (with the odds going in), the bracket
// challenge, and the way back to the bracket. Built from the same teaser as
// the email's block (lib/cup/teaser), so the page and the email agree.
//
// It is a pull-out, not one more section of the paper: the Cup page's own
// green board and brass, the trophy, the rounds across the top, the round's
// best story as a headline, the results on cream tickets, next week's games
// with their odds, and one brass button.

import type { CupTeaser, CupTeaserGame } from '@/lib/cup/teaser'
import { trophy } from '@/lib/cup/trophy'
import {
  cupBubbleLines,
  cupCta,
  cupHeadline,
  cupLaunchLine,
  cupLockText,
  cupNextLabel,
  cupPts,
  cupRoundStrip,
  cupSideRight,
  cupStoryDeck,
  cupTag,
  cupWin,
} from '@/lib/cup/words'
import recap from './recap.module.css'
import styles from './cupSection.module.css'

function Results({ label, games }: { label: string; games: CupTeaserGame[] }) {
  return (
    <div className={styles.board}>
      <div className={styles.boardLabel}>{label}</div>
      <ol className={styles.tickets}>
        {games.map((g, i) => {
          const [w, l] = g.winner === 'b' ? [g.b, g.a] : [g.a, g.b]
          const margin = (w.score ?? 0) - (l.score ?? 0)
          return (
            <li key={i} className={styles.ticket}>
              <span className={`${styles.tRow} ${styles.tWon}`}>
                <span className={styles.medal}>{w.seed}</span>
                <span className={styles.tName}>{w.name}</span>
                <span className={styles.tNum}>{cupSideRight(w, 'result')}</span>
              </span>
              <span className={`${styles.tRow} ${styles.tLost}`}>
                <span className={styles.medal}>{l.seed}</span>
                <span className={styles.tName}>{l.name}</span>
                <span className={styles.tNum}>{cupSideRight(l, 'result')}</span>
              </span>
              <span className={styles.tFoot}>
                {g.upset ? <span className={styles.upset}>Upset</span> : <span className={styles.through}>Through</span>}
                <span>{g.tiebreak ? 'Level, through on seed' : `By ${cupPts(margin)}`}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Next({ label, games, odds }: { label: string; games: CupTeaserGame[]; odds: boolean }) {
  return (
    <div className={styles.board}>
      <div className={styles.boardLabel}>{label}</div>
      <ol className={styles.matches}>
        {games.map((g, i) => {
          const [top, bottom] = g.a.seed <= g.b.seed ? [g.a, g.b] : [g.b, g.a]
          return (
            <li key={i} className={styles.match}>
              <span className={styles.mRow}>
                <span className={styles.medal}>{top.seed}</span>
                <span className={styles.tName}>{top.name}</span>
                <span className={styles.mNum}>{cupSideRight(top, 'next')}</span>
              </span>
              {odds && top.prob != null ? (
                <span className={styles.split} aria-hidden>
                  <span style={{ width: `${Math.round(top.prob * 100)}%` }} />
                </span>
              ) : (
                <span className={styles.vs} aria-hidden>
                  v
                </span>
              )}
              <span className={styles.mRow}>
                <span className={styles.medal}>{bottom.seed}</span>
                <span className={styles.tName}>{bottom.name}</span>
                <span className={styles.mNum}>{cupSideRight(bottom, 'next')}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function CupSection({ cup, href }: { cup: CupTeaser; href: string }) {
  // Weeks before the draw week: a small "New" card at the foot of The Games,
  // not a section. The preview page has the rest. The week the seeds are
  // set gets the full section.
  if (cup.preview && !cup.preview.final) {
    return (
      <aside className={styles.launchWrap}>
        <a className={styles.launch} href={href}>
          <span className={styles.launchTop}>
            <span className={styles.launchTag}>New</span>
            <span className={styles.launchName}>{cup.name}</span>
          </span>
          <span className={styles.launchLine}>{cupLaunchLine(cup)}</span>
          <span className={styles.launchGo}>See the preview</span>
        </a>
      </aside>
    )
  }
  const { headline, game } = cupHeadline(cup)
  const deck = cupStoryDeck(cup, game)
  // Only while it's still true: an old paper read after the lock points at
  // the bracket instead.
  const lock = cup.next?.open ? cupLockText(cup.next.lockAt) : null
  const bubble = cupBubbleLines(cup)
  const strip = cupRoundStrip(cup)
  const fav = cup.favourites?.[0]
  const leader = cup.leaders[0]
  const chasers = cup.favourites && cup.favourites.length > 1 ? cup.favourites.slice(1) : []
  const facts: { label: string; value: string; note?: string; more?: string }[] = cup.preview
    ? [
        { label: 'The field', value: String(cup.field), note: `after week ${cup.preview.throughWeek}` },
        ...(cup.next?.byes.length ? [{ label: 'Byes', value: String(cup.next.byes.length), note: `seeds 1 to ${cup.next.byes.length}` }] : []),
        { label: 'The draw', value: cup.preview.drawDay.replace(/^\w+, /, ''), note: '9 AM ET' },
      ]
    : [
        ...(cup.champion ? [] : cup.alive != null ? [{ label: 'Still in', value: `${cup.alive}`, note: `of ${cup.field}` }] : []),
        ...(cup.champion
          ? [{ label: 'Champion', value: cup.champion.name, note: `${cupPts(cup.champion.score)} in the final` }]
          : fav
            ? [
                {
                  label: 'Favourite',
                  value: fav.name,
                  note: `${cupWin(fav.win)} to win it`,
                  more: chasers.length ? `Then ${chasers.map((c) => `${c.name} ${cupWin(c.win)}`).join(', ')}` : undefined,
                },
              ]
            : []),
        ...(leader
          ? [{ label: 'Bracket challenge', value: leader.name, note: `${leader.points} ${leader.points === 1 ? 'point' : 'points'}` }]
          : cup.pickers
            ? [{ label: 'Bracket challenge', value: `${cup.inPicks} of ${cup.pickers}`, note: 'have picked' }]
            : []),
      ]
  return (
    <section className={`${recap.section} ${styles.sCup}`} id="cup" aria-labelledby="cup-h">
      <div className={styles.mast}>
        <span className={styles.trophy} aria-hidden>
          {trophy({ width: 58, brass: '#c8a35b', light: '#e6cb8e', dark: '#7d6230', plate: '#0d2a21' })}
        </span>
        <div className={styles.kicker}>{cup.preview ? 'Special section · The draw' : `Special section · Week ${cup.week}`}</div>
        <h2 id="cup-h" className={styles.title}>
          {cup.name}
        </h2>
        {strip.length ? (
          <ol className={styles.strip} aria-label="Rounds">
            {strip.map((r) => (
              <li key={r.week} data-state={r.state}>
                <span className={styles.stripName}>{r.short}</span>
                <span className={styles.stripWk}>Wk {r.week}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      <div className={styles.story}>
        <div className={styles.storyTag}>{cupTag(cup)}</div>
        <h3 className={styles.headline}>{headline}</h3>
        {deck ? <p className={styles.deck}>{deck}</p> : null}
      </div>

      <div className={styles.boards}>
        {cup.results ? <Results label={`Week ${cup.week} · ${cup.results.round}`} games={cup.results.games} /> : null}
        {cup.next ? <Next label={cupNextLabel(cup)} games={cup.next.games} odds={!cup.preview} /> : null}
      </div>
      {cup.next?.byes.length ? <p className={styles.byes}>Byes into the {cup.rounds?.[1]?.short.toLowerCase() ?? 'next round'}: {cup.next.byes.map((b) => `${b.name} (${b.seed})`).join(', ')}</p> : null}
      {bubble.map((l) => (
        <p key={l} className={styles.byes}>
          {l}
        </p>
      ))}

      {facts.length ? (
        <dl className={styles.facts}>
          {facts.map((f) => (
            <div key={f.label} className={styles.fact}>
              <dt>{f.label}</dt>
              <dd>
                {f.value}
                {f.note ? <small>{f.note}</small> : null}
                {f.more ? <small className={styles.more}>{f.more}</small> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className={styles.ctaRow}>
        <a className={styles.cta} href={href}>
          {cupCta(cup)}
        </a>
        {lock ? <span className={styles.lock}>Picks lock {lock} ET</span> : null}
      </div>
    </section>
  )
}

