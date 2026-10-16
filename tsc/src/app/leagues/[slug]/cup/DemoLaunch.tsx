// The demo Cup's launch ticket, between the masthead and the tabs. The demo
// league is mid-Cup so a visitor can play with every part of it; this says
// when a real league's own Cup starts, with the countdown to the draw, and
// links the countdown page every league sees until then.

import Link from 'next/link'
import { CUP_LAUNCH, drawDayText, launchPhase } from '@/lib/cup/launch'
import { Countdown } from './Countdown'
import styles from './demo.module.css'

export function DemoLaunch({ previewHref }: { previewHref: string }) {
  const phase = launchPhase()
  return (
    <aside className={styles.launch} aria-label="When your league's Cup starts">
      <div className={styles.launchInner}>
        <span className={styles.stub} aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 4h10v4.5a5 5 0 0 1-10 0z" />
            <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.6M17 6h2.5a2.5 2.5 0 0 1-2.6 3.6M12 13.5V17M8.5 20h7M9.5 17h5" />
          </svg>
        </span>
        <div className={styles.words}>
          <p className={styles.kicker}>Demo league · {CUP_LAUNCH.year}</p>
          <p className={styles.head}>
            {phase === 'after'
              ? 'Every league with a live season has its own Cup now.'
              : phase === 'today'
                ? 'Your league’s Cup is drawn today.'
                : `Your league’s Cup is drawn ${drawDayText()}.`}
          </p>
          <p className={styles.line}>
            Seeds are the Cup Rating after week {CUP_LAUNCH.seededThrough}, not the standings. Round one is week {CUP_LAUNCH.startWeek}. This league is playing its semifinals now, so try a pick.
          </p>
        </div>
        {phase === 'before' ? (
          <div className={styles.clock}>
            <Countdown at={CUP_LAUNCH.drawAt} done="The draw is today." compact />
          </div>
        ) : null}
        <div className={styles.actions}>
          {phase !== 'after' ? (
            <Link className={styles.btn} href={previewHref}>
              See the countdown page
            </Link>
          ) : null}
          <Link className={`${styles.btn} ${styles.btnGhost}`} href="/login?mode=signup">
            Start your league
          </Link>
        </div>
      </div>
    </aside>
  )
}
