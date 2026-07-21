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
    id: 'trade-room-clubhouse',
    date: 'Jul 20, 2026',
    title: 'The Trade Room, rebuilt in',
    titleEm: 'the Clubhouse.',
    body: 'The Clubhouse Trade Analyzer was reworked to match the league desk exactly. Name the two sides, pick your format, and it grades the deal off the same consensus value engine, now resolving players across every platform instead of one. Post the close ones to the docket, let the room regrade them, and vote on who won.',
    status: 'new',
    tags: [{ label: 'New', tone: 'gold' }, { label: 'Clubhouse' }, { label: 'All members' }],
  },
  {
    id: 'trade-desk-overhaul',
    date: 'Jul 19, 2026',
    title: 'A sharper',
    titleEm: 'Trade Desk.',
    body: 'The league Trade Desk got an accuracy pass from end to end. Values now respect your league’s scoring and TE premium, the Grader reads players off any of the four platforms and prices them from the consensus engine, and executed trades grade themselves every day with a four-week revisit. The Grader room itself was redrawn as a wire room: the season’s biggest deal runs as a full front page, and the rest fall down a dated timeline.',
    status: 'new',
    tags: [{ label: 'New', tone: 'gold' }, { label: 'Live season' }, { label: 'Trade Desk' }],
  },
  {
    id: 'broadsheet-landing',
    date: 'Jul 19, 2026',
    title: 'A brand new',
    titleEm: 'front page.',
    body: 'The whole landing page was rebuilt as a proper broadsheet: the pitch, the four platforms, the pages, and the pricing all set like the front of a newspaper. It is the first thing a new commissioner sees, and now it finally looks the part.',
    status: 'new',
    tags: [{ label: 'New', tone: 'gold' }, { label: 'Sitewide' }],
  },
  {
    id: 'leagues-wing',
    date: 'Jul 15, 2026',
    title: 'Four new rooms in the',
    titleEm: 'Leagues wing.',
    body: 'The almanac grew a whole floor. The <em>Draft Grader</em> scores every draft class you have ever run and stacks the managers on a report card. The <em>All-Time Team</em> builds each manager’s best-ever starting lineup as a deck of trading cards. The <em>Chart Room</em> draws twelve hand-inked charts of a manager’s entire career. And the <em>Mock Room</em> runs a full snake-draft simulator against ghost managers modeled on how your league actually drafts.',
    status: 'new',
    tags: [{ label: 'New', tone: 'gold' }, { label: 'Leagues' }, { label: 'Desktop', tone: 'steel' }],
  },
  {
    id: 'standings-archives',
    date: 'Jul 12, 2026',
    title: 'Standings and Archives,',
    titleEm: 'rebuilt.',
    body: 'The all-time standings, the season archives, and every single-season page were rebuilt from the ground up. Cleaner tables, faster reads, and season exports now carry full week-by-week matchup history, so the record book and the recaps have more to draw on.',
    status: 'new',
    tags: [{ label: 'Almanac' }, { label: 'Desktop', tone: 'steel' }],
  },
  {
    id: 'league-setup',
    date: 'Jul 8, 2026',
    title: 'A smoother league',
    titleEm: 'setup.',
    body: 'Adding a league got a new preview and setup screen. Point it at your league on any platform, see exactly what history will come back before you commit, and get into the almanac faster.',
    status: 'new',
    tags: [{ label: 'Sitewide' }],
  },
  {
    id: 'sunday-live-v3',
    date: 'Jul 7, 2026',
    title: 'Sunday Live, rebuilt in',
    titleEm: 'broadcast dark.',
    body: 'The game-day companion was rebuilt on a dark broadcast set: a live desk that surfs between matchups, real NFL scoreboards and inactives, and a storyline engine that calls the swings as they happen. The Sunday second screen, sharper than the first cut.',
    status: 'new',
    tags: [{ label: 'Game day' }],
  },
  {
    id: 'record-book-remix',
    date: 'Jun 30, 2026',
    title: 'The Record Book,',
    titleEm: 'reimagined.',
    body: 'The record book was rebuilt as a set of swipeable rails with a podium for every stat, so first, second, and third all get called out, not just the leader. New title-era records joined the board, and the whole thing now reads like a mosaic of feats instead of a flat list.',
    status: 'new',
    tags: [{ label: 'Almanac' }],
  },
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
