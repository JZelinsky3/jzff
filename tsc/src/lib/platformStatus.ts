// What each platform can actually do right now.
//
// This exists because the answer changed twice in one month and the site went
// on advertising the old answer in about a dozen places: the landing FAQ, the
// mobile cover, the platform dots, /about, three guides, and the plate you
// pick when creating a league. Going live while telling people NFL.com is "in
// beta, historical seasons supported" is how you earn a refund request in
// week one.
//
// Anything user-facing that describes platform support should read from here.
//
// ── Where the two dead ones stand (2026-09-10) ────────────────────────────
// NFL.com: fantasy.nfl.com was retired by the NFL around 2026-08-11. The site
//   is gone, so there is nothing left to scrape and no new NFL import can be
//   started. Archives already built from it keep working; they are ordinary
//   rows in our database now. ESPN is the migration path.
// Yahoo:  every Fantasy API endpoint returns 403 "application is not
//   authorized" for every user. Yahoo now gates the Fantasy API behind an
//   approval process and the application has to be re-submitted. The OAuth
//   flow and all four ingest parsers are written and were working, so this is
//   access, not code.

export type PlatformKey = 'sleeper' | 'espn' | 'nfl' | 'yahoo'

export type PlatformAvailability =
  /** Historical + live-season sync, both working. */
  | 'live'
  /** Permanently gone. New imports impossible; existing archives unaffected. */
  | 'retired'
  /** Temporarily blocked by the provider. Expected back. */
  | 'unavailable'

export type PlatformStatus = {
  key: PlatformKey
  name: string
  availability: PlatformAvailability
  /** Two words max. Goes in dots, chips and plate subtitles. */
  badge: string
  /** One sentence, for FAQ answers and help text. No hedging. */
  blurb: string
  /** Can someone start a NEW import from this platform today? */
  canImport: boolean
}

export const PLATFORM_STATUS: Record<PlatformKey, PlatformStatus> = {
  sleeper: {
    key: 'sleeper',
    name: 'Sleeper',
    availability: 'live',
    badge: 'Live',
    blurb: 'Full historical import plus live-season sync, from a username or league ID.',
    canImport: true,
  },
  espn: {
    key: 'espn',
    name: 'ESPN',
    availability: 'live',
    badge: 'Live',
    blurb:
      'Full historical import plus live-season sync. Private leagues need a one-time cookie paste.',
    canImport: true,
  },
  nfl: {
    key: 'nfl',
    name: 'NFL.com',
    availability: 'retired',
    badge: 'Retired',
    blurb:
      'NFL.com retired its fantasy platform in August 2026. New imports are no longer possible. Archives already built from it stay online and keep working.',
    canImport: false,
  },
  yahoo: {
    key: 'yahoo',
    name: 'Yahoo',
    availability: 'unavailable',
    badge: 'Unavailable',
    blurb:
      'Yahoo is currently unavailable while we regain access to their fantasy API. Existing Yahoo archives stay online. Support is expected back soon.',
    canImport: false,
  },
}

export const PLATFORMS: PlatformStatus[] = [
  PLATFORM_STATUS.sleeper,
  PLATFORM_STATUS.espn,
  PLATFORM_STATUS.nfl,
  PLATFORM_STATUS.yahoo,
]

/** The ones someone can actually start an import from today. */
export const IMPORTABLE_PLATFORMS = PLATFORMS.filter((p) => p.canImport)

/** One line covering the whole roster, for FAQ answers and meta descriptions. */
export const PLATFORM_SUMMARY =
  'Sleeper and ESPN are fully supported, historical seasons and live-season sync both. ' +
  'NFL.com retired its fantasy platform in August 2026, so no new NFL.com imports are possible. ' +
  'Yahoo is temporarily unavailable while we regain API access and is expected back soon. ' +
  'Archives already built from NFL.com or Yahoo stay online, and a league that moved between ' +
  'platforms can still combine several sources under one archive.'
