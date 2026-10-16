import styles from './cup.module.css'

// Back to the league from the top of the page, on desktop (a phone has the
// footer's "View the league" a thumb away). Absolutely placed above the
// masthead's kicker, inside its content box, so nothing in the masthead
// moves. `top` is that offset for the page's own masthead padding. Used by
// the Cup, its preview and the Hall of Fame.
export function BackLink({ href, top = -30, label = 'Back to the league' }: { href: string; top?: number; label?: string }) {
  return (
    <a className={styles.backLink} href={href} style={{ top }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 8H3M7.5 3.5 3 8l4.5 4.5" />
      </svg>
      {label}
    </a>
  )
}
