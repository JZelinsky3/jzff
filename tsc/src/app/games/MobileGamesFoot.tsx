import Link from 'next/link'
import s from './mobile.module.css'

// The quiet end of a mobile games page, same shape as the Pocket
// Clubhouse's .mhb-foot: a brand line and four flat links, no columns and
// no repeat of the dock sitting right underneath it.
export function MobileGamesFoot({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className={s.foot}>
      <div className={s.footBrand}>
        <em>The Sunday Chronicle</em> · The Games Page
      </div>
      <nav className={s.footLinks} aria-label="Site">
        <Link href="/">Home</Link>
        <Link href={signedIn ? '/dashboard' : '/login'}>{signedIn ? 'Library' : 'Login'}</Link>
        <Link href="/hub">Clubhouse</Link>
        <a href="/api/view/?mode=desktop&to=/games/">Desktop site</a>
      </nav>
    </footer>
  )
}
