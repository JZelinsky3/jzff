'use client'

// The countdown to the draw, ticking each second. The server can't know the
// visitor's clock, so the first paint shows dashes and the numbers fill in
// on the client.

import { useSyncExternalStore } from 'react'
import styles from './preview.module.css'

function subscribe(cb: () => void) {
  const t = setInterval(cb, 1000)
  return () => clearInterval(t)
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

// `compact`: one short row of cells, for the demo's launch ticket.
export function Countdown({ at, done, compact }: { at: string; done: string; compact?: boolean }) {
  const now = useSyncExternalStore(subscribe, nowSeconds, () => null)
  const left = now == null ? null : Math.max(0, Math.floor(Date.parse(at) / 1000) - now)
  if (left === 0) return <p className={styles.countDone}>{done}</p>
  const parts: [string, number | null][] = [
    ['Days', left == null ? null : Math.floor(left / 86400)],
    ['Hours', left == null ? null : Math.floor((left % 86400) / 3600)],
    ['Min', left == null ? null : Math.floor((left % 3600) / 60)],
    ['Sec', left == null ? null : left % 60],
  ]
  return (
    <div className={`${styles.count} ${compact ? styles.countCompact : ''}`} role="timer" aria-live="off">
      {parts.map(([label, n]) => (
        <span key={label} className={styles.countCell}>
          <span className={styles.countNum}>{n == null ? '--' : String(n).padStart(2, '0')}</span>
          <span className={styles.countLabel}>{label}</span>
        </span>
      ))}
    </div>
  )
}
