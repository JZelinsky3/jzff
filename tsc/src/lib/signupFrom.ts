// Where someone was when they decided to sign up. Client-safe: no server imports.
//
// Every page notes its path in localStorage (components/LastPageNote, and the
// static almanac's inline script), so by the time someone reaches /login the
// browser knows the page that sent them. That goes on the account as
// user_metadata.signup_from, which needs no table and lands the same way for a
// password, a magic link or Google (see auth/callback). /admin reads it.

export const LAST_PAGE_KEY = 'tsc_last_page'

/** The sign-in pages aren't anywhere: they're the door, not the room. */
const NOT_A_PLACE = /^\/(login|auth|api|reset-password)(\/|$)/

export function noteLastPage(path: string) {
  if (NOT_A_PLACE.test(path)) return
  try {
    window.localStorage.setItem(LAST_PAGE_KEY, path)
  } catch {
    /* private browsing: they count as having come straight here */
  }
}

/** What goes on a new account: the last page, or the site that linked straight
    to sign-up, or 'direct'. */
export function signupFrom(): string {
  try {
    const last = window.localStorage.getItem(LAST_PAGE_KEY)
    if (last) return last.slice(0, 200)
  } catch {
    /* fall through */
  }
  try {
    const host = document.referrer ? new URL(document.referrer).host : ''
    if (host && host !== window.location.host) return `ref:${host}`.slice(0, 200)
  } catch {
    /* fall through */
  }
  return 'direct'
}

const PACK_EMPIRE_ROOMS: Record<string, string> = {
  daily: 'The Daily',
  play: 'Empire Builder',
  versus: 'Versus',
  'mega-draft': 'Mega Draft',
  league: 'League Mode',
  board: 'The Board',
  binder: 'The Binder',
  profile: 'Profile',
  run: 'A Shared Score',
}

const title = (slug: string) => slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** That path as a place, for /admin. */
export function signupPlace(from: string | null | undefined, leagueName: (slug: string) => string | undefined): string | null {
  if (!from) return null
  if (from === 'direct') return 'Straight To Sign Up'
  if (from.startsWith('ref:')) return `Link From ${from.slice(4)}`
  const [a, b, c] = from.split(/[?#]/)[0].split('/').filter(Boolean)
  if (!a) return 'Home Page'
  if (a === 'games') {
    if (!b) return 'Games Page'
    if (b !== 'pack-empire') return `Games: ${title(b)}`
    return c && PACK_EMPIRE_ROOMS[c] ? `Pack Empire: ${PACK_EMPIRE_ROOMS[c]}` : 'Pack Empire'
  }
  if (a === 'leagues' || a === 'league') {
    if (!b) return 'Leagues Page'
    return b === 'demo' ? 'Demo League' : `League: ${leagueName(b) ?? title(b)}`
  }
  if (a === 'friends') return 'Friend Invite'
  if (a === 'recap') return 'Weekly Recap'
  if (a === 'see') return 'Share Page'
  return title(a)
}
