// The share hub's catalogue.
//
// One entry per almanac page worth sending to somebody outside the league.
// Each entry carries:
//   - the themed palette for its public landing page (/see/<key>), lifted
//     from the same source as that page's OG card so the two match
//   - the OG image that acts as the landing page's hero
//   - where "view in the demo" should land
//
// The hero images are rendered from a real league rather than the demo
// tree, because the demo is a static site with no OG chapter routes. That
// league's almanac is already public, so nothing here exposes anything a
// link preview would not.
export const SHOWCASE_SLUG = 'pams'

export type SharePage = {
  key: string
  /** Card title, also the <title> of the landing page. */
  title: string
  /** One line under the title. */
  deck: string
  /** OG image path used as the hero. */
  og: string
  /** Where "view in the demo" goes. */
  demo: string
  /** Section grouping in the private index. */
  group: 'The almanac' | 'The live season'
  theme: {
    /** Page background, top of the gradient. */
    bg: string
    /** Page background, bottom of the gradient. */
    bg2: string
    /** Body copy. */
    ink: string
    /** Muted copy. */
    mute: string
    /** Accent: eyebrow, rules, primary button. */
    accent: string
    /** Ink used on top of the accent (buttons). */
    onAccent: string
  }
}

const s = SHOWCASE_SLUG

export const SHARE_PAGES: SharePage[] = [
  {
    key: 'standings',
    title: 'All-Time Standings',
    deck: 'Every win, loss and point your league has ever recorded, ranked in one ledger.',
    og: `/api/og/league/${s}?page=standings&v=3`,
    demo: '/demo/standings',
    group: 'The almanac',
    theme: { bg: '#f4ebd8', bg2: '#e9dcc0', ink: '#0e1620', mute: '#55482e', accent: '#a88a4a', onAccent: '#0e1620' },
  },
  {
    key: 'records',
    title: 'The Record Book',
    deck: 'Single-week scorchers, season highs and career marks, kept like exhibits.',
    og: `/api/og/league/${s}?page=records&v=3`,
    demo: '/demo/records',
    group: 'The almanac',
    theme: { bg: '#0d1a12', bg2: '#0a140e', ink: '#f4ebd8', mute: '#9ab3a2', accent: '#e8c889', onAccent: '#0d1a12' },
  },
  {
    key: 'managers',
    title: 'The Society',
    deck: 'Every manager who ever ran a team, with careers, trophies and head-to-head ledgers.',
    og: `/api/og/league/${s}?page=managers&v=3`,
    demo: '/demo/managers/',
    group: 'The almanac',
    theme: { bg: '#0e1620', bg2: '#16202c', ink: '#f4ebd8', mute: '#9fb0c4', accent: '#e8c889', onAccent: '#0e1620' },
  },
  {
    key: 'draft',
    title: 'The Draft Annual',
    deck: 'Every draft in the league’s history, round by round, steal by steal, bust by bust.',
    og: `/api/og/league/${s}?page=draft&v=3`,
    demo: '/demo/draft/',
    group: 'The almanac',
    theme: { bg: '#0c0c0b', bg2: '#151513', ink: '#f4ebd8', mute: '#8a7a60', accent: '#e8c889', onAccent: '#0c0c0b' },
  },
  {
    key: 'seasons',
    title: 'Season Archives',
    deck: 'Season by season through the league’s history, bound and shelved.',
    og: `/api/og/league/${s}?page=seasons&v=3`,
    demo: '/demo/seasons/',
    group: 'The almanac',
    theme: { bg: '#0e1620', bg2: '#2a140e', ink: '#f4ebd8', mute: '#c2b49c', accent: '#e8c889', onAccent: '#2a140e' },
  },
  {
    key: 'rivalries',
    title: 'The Rivalries',
    deck: 'Every grudge in the league, kept meeting by meeting.',
    og: `/api/og/league/${s}?page=rivalries&v=3`,
    demo: '/demo/rivalries/',
    group: 'The almanac',
    theme: { bg: '#140d0b', bg2: '#1d1310', ink: '#f4ebd8', mute: '#96705f', accent: '#c86848', onAccent: '#140d0b' },
  },
  {
    key: 'all-time',
    title: 'The All-Time Team',
    deck: 'The best season at every position, for every manager who ever ran a team.',
    og: `/api/og/alltime/${s}`,
    demo: '/demo/managers/all-time',
    group: 'The almanac',
    theme: { bg: '#0e1620', bg2: '#16202c', ink: '#f4ebd8', mute: '#9fb0c4', accent: '#efe5cd', onAccent: '#0e1620' },
  },
  {
    key: 'live',
    title: 'The Live Season',
    deck: 'The season as it happens: power rankings, pick’ems, records watch and the trade desk.',
    og: `/api/og/league/${s}?page=live&v=3`,
    demo: '/demo/live/',
    group: 'The live season',
    theme: { bg: '#15201b', bg2: '#0f1713', ink: '#f4ebd8', mute: '#7d8c81', accent: '#d4a94c', onAccent: '#15201b' },
  },
  {
    key: 'powerrank',
    title: 'Power Rankings',
    deck: 'Auto-calculated every week from record, points for, form and standing.',
    og: `/api/og/powerrank/${s}`,
    demo: '/demo/powerrank/',
    group: 'The live season',
    theme: { bg: '#f4ebd8', bg2: '#e9dcc0', ink: '#0e1620', mute: '#55482e', accent: '#a88a4a', onAccent: '#0e1620' },
  },
  {
    key: 'pickems',
    title: 'Pick’ems',
    deck: 'Every matchup, plus highest and lowest scorer. No login for your league to play.',
    og: `/api/og/pickems/${s}`,
    demo: '/demo/pickems/',
    group: 'The live season',
    theme: { bg: '#160b1d', bg2: '#241531', ink: '#f5ecf5', mute: '#8e7d9d', accent: '#ff3d8b', onAccent: '#160b1d' },
  },
  {
    key: 'milestones',
    title: 'Milestones',
    deck: 'Career marks struck as they fall, with what is on the brink next.',
    og: `/api/og/milestones/${s}`,
    demo: '/demo/live/',
    group: 'The live season',
    theme: { bg: '#110a18', bg2: '#1c1428', ink: '#f4ebd8', mute: '#c2b6d6', accent: '#b58cff', onAccent: '#110a18' },
  },
  {
    key: 'records-watch',
    title: 'Records Watch',
    deck: 'What is broken, what is on pace, and what is just out of reach.',
    og: `/api/og/records-watch/${s}`,
    demo: '/demo/live/',
    group: 'The live season',
    theme: { bg: '#0f0a0c', bg2: '#1d141a', ink: '#f4ebd8', mute: '#c6a89e', accent: '#7fa8bd', onAccent: '#0f0a0c' },
  },
]

export function findSharePage(key: string): SharePage | undefined {
  return SHARE_PAGES.find((p) => p.key === key)
}
