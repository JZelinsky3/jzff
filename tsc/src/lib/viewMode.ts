import { cookies, headers } from 'next/headers'

// Shared mobile/desktop fork for the React side of the site (landing,
// clubhouse, and any future page that ships a dedicated mobile tree).
//
// Mirrors the logic the per-league static-site route uses
// (src/app/leagues/[slug]/[[...path]]/route.ts) on purpose: same UA regex,
// same `dc_view` cookie name. A page that reads this becomes dynamically
// rendered (it touches headers/cookies), which the landing already is — it
// reads the auth cookie to know if you're signed in.

export const VIEW_COOKIE = 'dc_view'

export type ViewMode = 'mobile' | 'desktop'

// Macintosh and Android tablets omit the "Mobile" token, so tablets get the
// desktop layout on purpose (it works fine at tablet widths).
function isMobileUA(ua: string, chMobile: string | null): boolean {
  // Trust a "?1" client hint, but never trust "?0" as proof of desktop:
  // UA-override tools (devtools, headless testing) swap the UA string
  // without swapping the hints, and spoofing an iPhone UA should get you
  // the iPhone site.
  if (chMobile === '?1') return true
  return /\b(iPhone|iPod)\b/.test(ua)
    || (/\bAndroid\b/.test(ua) && /\bMobile\b/.test(ua))
    || /\bWindows Phone\b/.test(ua)
}

// Resolve which layout to serve for the current request. An explicit
// `dc_view` cookie wins in both directions (so the "view desktop / mobile
// site" links work, and a desktop browser can force the mobile view for
// testing); otherwise fall back to user-agent sniffing.
export async function getViewMode(): Promise<ViewMode> {
  const [h, c] = await Promise.all([headers(), cookies()])
  const pref = c.get(VIEW_COOKIE)?.value
  if (pref === 'desktop') return 'desktop'
  if (pref === 'mobile') return 'mobile'
  return isMobileUA(h.get('user-agent') ?? '', h.get('sec-ch-ua-mobile'))
    ? 'mobile'
    : 'desktop'
}

// True when a phone is being shown the desktop layout because it explicitly
// asked for it (dc_view=desktop). Pages use this to render a small "Back to
// mobile" escape hatch, mirroring the pill the per-league static site injects.
export async function isMobileForcingDesktop(): Promise<boolean> {
  const [h, c] = await Promise.all([headers(), cookies()])
  if (c.get(VIEW_COOKIE)?.value !== 'desktop') return false
  return isMobileUA(h.get('user-agent') ?? '', h.get('sec-ch-ua-mobile'))
}
