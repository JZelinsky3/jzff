// The Dispatch — editorial changelog for the Clubhouse. One module so the
// Front Desk "from the wire" teaser and the full /hub/whats-new timeline
// never drift apart. Newest first.
//
// status: 'new'  → shipped, dated entry
//         'soon' → on the way; date is the window, not a promise

export type DispatchEntry = {
  id: string
  date: string // display string, e.g. 'Jun 9, 2026'
  title: string
  /** Italic-gold tail of the title, e.g. 'four rooms.' */
  titleEm?: string
  body: string
  status: 'new' | 'soon'
  tags: { label: string; tone?: 'gold' | 'rust' | 'steel' }[]
}

export const COMING_SOON: DispatchEntry[] = [
  {
    id: 'weekly-recap',
    date: '2026 season',
    title: 'The Weekly',
    titleEm: 'Recap.',
    body: 'Sunday rolls itself into a Monday-morning paper: the blowouts, the photo finishes, who left points on the bench, and which records moved overnight. The end-of-day rollup becomes the story of the week, written for your league.',
    status: 'soon',
    tags: [{ label: 'Live season', tone: 'steel' }, { label: 'In the works', tone: 'rust' }],
  },
  {
    id: 'the-field',
    date: 'Summer 2026',
    title: 'The',
    titleEm: 'Field.',
    body: 'A public, cross-league view of the player pool: start rates, roster rates, and trade velocity drawn from every league on TSC, across all four platforms at once. See how your league’s reads compare to everyone else’s.',
    status: 'soon',
    tags: [{ label: 'Public page', tone: 'steel' }, { label: 'In the works', tone: 'rust' }],
  },
  {
    id: 'underdog',
    date: 'TBD',
    title: 'A fifth',
    titleEm: 'platform.',
    body: 'Underdog Fantasy is on the integration bench. Same promise as the other four: bring a league ID, get the whole history back.',
    status: 'soon',
    tags: [{ label: 'Platforms', tone: 'steel' }],
  },
]

export const DISPATCH: DispatchEntry[] = [
  {
    id: 'guides-shelf',
    date: 'Jun 20, 2026',
    title: 'A bigger Guides',
    titleEm: 'shelf.',
    body: 'New deep-dives on the Trade Analyzer, Milestone Tracker, manager analysis, league-management software, league-history software, the Recap, the Almanac, and a fresh league setup walkthrough. The Guides page itself got a browsable shelf so you can compare and filter instead of scrolling a flat list.',
    status: 'new',
    tags: [{ label: 'New', tone: 'gold' }, { label: 'Guides' }],
  },
  {
    id: 'mobile-rework',
    date: 'Jun 18, 2026',
    title: 'A mobile rework, top to',
    titleEm: 'bottom.',
    body: 'Every page on TSC got a phone-native rebuild: landing, Clubhouse, dashboard, league shells, almanac, live season, pricing, guides, the manager and rivalry pages. Simpler chrome, denser cards, one-thumb navigation, and a dedicated mobile tree (separate from desktop) so the small screen never inherits a layout it can’t carry. Open the site on a phone and it should finally feel like one.',
    status: 'new',
    tags: [{ label: 'New', tone: 'gold' }, { label: 'Mobile' }, { label: 'Sitewide' }],
  },
  {
    id: 'trade-room',
    date: 'Jun 10, 2026',
    title: 'The Trade Room opens in',
    titleEm: 'the Clubhouse.',
    body: 'The Trade Analyzer, unchained from the league: name the players on each side, pick the format (redraft or dynasty, 1-QB or superflex), and the same consensus value engine renders a verdict; add both full rosters and it grades real starting-lineup impact instead. Post the contentious ones to the docket and let the room vote on who won.',
    status: 'new',
    tags: [{ label: 'New', tone: 'gold' }, { label: 'Clubhouse' }, { label: 'All members' }],
  },
  {
    id: 'trade-desk',
    date: 'Jun 9, 2026',
    title: 'The Trade Desk opens',
    titleEm: 'four rooms.',
    body: 'The Grader scores every executed deal and revisits it four weeks later. The Analyzer stress-tests a deal before you send it. The Finder shops your players or hunts a target with real package suggestions. And the Rumor Mill invents a fresh slate of plausible mock trades for your league every week. Argue accordingly.',
    status: 'new',
    tags: [{ label: 'New', tone: 'gold' }, { label: 'Live season' }, { label: 'All plans' }],
  },
  {
    id: 'sunday-live',
    date: 'Jun 8, 2026',
    title: 'Sunday Live,',
    titleEm: 'the second screen.',
    body: 'A five-page game-day companion built for the league, not the individual: a Command Center with every matchup live, real NFL scoreboards, news and inactives, a My Players tracker, and a Moments feed that catches the swings worth screenshotting. Pin it open every Sunday.',
    status: 'new',
    tags: [{ label: 'New', tone: 'gold' }, { label: 'Game day' }],
  },
  {
    id: 'udfa',
    date: 'Jun 6, 2026',
    title: 'The free tier:',
    titleEm: 'UDFA.',
    body: 'Every account now carries one free trial league with every paid page unlocked; your earliest league gets the slot automatically. Additional free leagues keep the core almanac: all-time standings, rivalries, and the manager strip.',
    status: 'new',
    tags: [{ label: 'New', tone: 'gold' }, { label: 'Pricing' }],
  },
  {
    id: 'manager-dna',
    date: 'Jun 5, 2026',
    title: 'Manager',
    titleEm: 'DNA.',
    body: 'Waiver habits, trade volume, draft tendencies, lineup churn: dozens of signals distilled into one archetype per manager, with the receipts to back it up. The Census page in this very Clubhouse runs the same idea across the whole network.',
    status: 'new',
    tags: [{ label: 'New', tone: 'gold' }, { label: 'Live season' }],
  },
  {
    id: 'best-coach',
    date: 'Jun 2, 2026',
    title: 'The Best Coach',
    titleEm: 'Tracker.',
    body: 'Optimal-lineup math for every week of the season: who squeezed the most from their roster, who left a win on the bench, and a Hall of Shame for the worst sit-start calls on file.',
    status: 'new',
    tags: [{ label: 'Live season' }],
  },
  {
    id: 'matchup-preview',
    date: 'Jun 1, 2026',
    title: 'Matchup',
    titleEm: 'Preview.',
    body: 'A departures board for the week ahead: every matchup with all-time head-to-head history, last-five form, and projections. Click through to any manager’s desk for the full dossier.',
    status: 'new',
    tags: [{ label: 'Live season' }],
  },
  {
    id: 'yahoo-nfl',
    date: 'May 31, 2026',
    title: 'Yahoo and NFL.com',
    titleEm: 'join the press.',
    body: 'TSC now ingests league history from all four major platforms: Sleeper, ESPN, Yahoo, and NFL.com. Same archive, same record book, whichever app your league calls home.',
    status: 'new',
    tags: [{ label: 'Platforms', tone: 'steel' }],
  },
  {
    id: 'records-watch',
    date: 'May 2026',
    title: 'Records Watch &',
    titleEm: 'Milestones.',
    body: 'The live hub tracks which franchise records are in danger this week and which round-number milestones are about to fall, so the chase gets called before it happens, not after.',
    status: 'new',
    tags: [{ label: 'Live season' }],
  },
]
