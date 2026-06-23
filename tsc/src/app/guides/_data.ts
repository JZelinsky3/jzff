// Shared guide metadata, used by both the server-rendered grouped index
// and the client-side search component. Keeping this in one module
// guarantees the two views stay in sync — adding a guide here surfaces it
// in the category grid AND in the search results without a second edit.

export type Guide = {
  slug: string
  title: string
  // Short label for the visible chip on each card.
  chip?: string
  // One-line tagline shown on the card.
  tagline: string
  // 1–2 sentence summary used in search results (and matched against).
  // Should read like a snippet a reader would see in Google — meaningful
  // out of context. Avoid marketing fluff; lead with the answer.
  snippet: string
  // Curated keywords + synonyms that don't appear verbatim in the title
  // or tagline. Used only for matching, not displayed. Helps the search
  // surface a guide when the user types a related term — "draft" matches
  // platform guides, "fairness" matches the trade analyzer, etc.
  searchTerms: string[]
}

export type Section = {
  kicker: string
  title: string
  titleEm: string
  blurb: string
  guides: Guide[]
}

export const SECTIONS: Section[] = [
  {
    kicker: "Buyer's guides",
    title: "Compare the active services —",
    titleEm: "by category.",
    blurb:
      "Side-by-side reviews of the tools in each fantasy-football software category. Start here if you're picking what to use.",
    guides: [
      {
        slug: "best-fantasy-football-almanac",
        title: "Best fantasy football almanac services",
        chip: "Comparison",
        tagline: "What an almanac is, what to look for, and how the active services stack up — from full archives to recap-only tools.",
        snippet:
          "The active fantasy football almanac services compared in 2026 — what an almanac actually is, the five things to evaluate, and which tool to use when (The Sunday Chronicle, FantasyPros, FTN Fantasy, recap-only services, DIY).",
        searchTerms: [
          "almanac", "yearbook", "record book", "history book",
          "fantasy football archive", "best almanac",
          "fantasypros", "ftn", "recapmyleague", "smackscript", "tfo",
          "notion", "google sites", "spreadsheet",
          "compare", "comparison", "vs", "alternatives",
        ],
      },
      {
        slug: "fantasy-football-league-history-software",
        title: "League history software — what actually preserves a league",
        chip: "Comparison",
        tagline: "The category beyond your host platform's basic history tab — what these tools do, which work cross-platform, and how to pick one.",
        snippet:
          "Software for tracking fantasy football league history beyond the native platform views. What Sleeper/ESPN/Yahoo/NFL.com expose, what third-party tools add, and how to pick one — including The Sunday Chronicle, custom scripts, and database approaches.",
        searchTerms: [
          "league history", "league archive", "preservation", "long term",
          "data loss", "platform shutdown", "migration", "data portability",
          "custom script", "api", "diy",
          "category", "overview", "what is", "tools", "software",
        ],
      },
      {
        slug: "fantasy-football-league-management-software",
        title: "League management software — reviews & comparison",
        chip: "Comparison",
        tagline: "The host platform plus the third-party tools commissioners actually use. Where each fits in a 2026 league stack.",
        snippet:
          "Reviews of fantasy football league management software in 2026. What the host platforms (Sleeper, ESPN, Yahoo, NFL.com) cover, what they don't, and which third-party tools commissioners layer on top — almanac, recaps, dues, draft prep.",
        searchTerms: [
          "league management", "commissioner tools", "manage league",
          "leaguesafe", "dues", "buy-in", "payout", "escrow",
          "fantasypros", "stack", "tools for commissioners",
          "reviews", "comparison", "best", "top",
        ],
      },
      {
        slug: "best-fantasy-football-recap",
        title: "Best fantasy football recap services",
        chip: "Comparison",
        tagline: "Weekly recaps compared — designed for league-specific voice vs generic AI prose, archived vs standalone.",
        snippet:
          "Fantasy football weekly recap services compared — what makes a recap worth reading, how AI-generated narratives differ from designed weekly stories, and which services fit a league that wants the Tuesday-morning email.",
        searchTerms: [
          "recap", "weekly recap", "narrative", "summary",
          "ai recap", "ai generated", "story",
          "recapmyleague", "smackscript", "tfo fantasy", "chatgpt recap",
          "best recap", "tuesday",
        ],
      },
    ],
  },
  {
    kicker: "Tool deep-dives",
    title: "Inside the individual tools —",
    titleEm: "what they do, how to use them.",
    blurb:
      "Feature-by-feature looks at the categories TSC already covers — trade grading, milestone tracking, manager profiling.",
    guides: [
      {
        slug: "fantasy-football-trade-analyzer",
        title: "Trade analysis tools — how to pick one",
        chip: "Feature",
        tagline: "Live redraft graders vs dynasty value calculators vs post-trade graders — which to use when, and where each fits in a league stack.",
        snippet:
          "Fantasy football trade analyzers compared by category — live redraft (FantasyPros), dynasty value (KeepTradeCut, FantasyCalc), and post-trade grading (The Sunday Chronicle Trade Tape). How each works and when to use which.",
        searchTerms: [
          "trade", "trade analyzer", "trade grader", "trade fairness",
          "keeptradecut", "ktc", "fantasycalc", "trade value",
          "dynasty value", "redraft trade", "trade calculator",
          "trade tape", "post-trade", "who won the trade",
        ],
      },
      {
        slug: "fantasy-football-milestone-tracker",
        title: "Milestone tracking — what to track and how",
        chip: "Feature",
        tagline: "Career wins, championship counts, point thresholds, streaks, rivalry chapters. The markers that turn a multi-year league into a story.",
        snippet:
          "Milestone tracking for fantasy football leagues — career wins, championship counts, single-game records, win streaks, rivalry meetings. What's worth tracking, how to automate it from a Sleeper/ESPN league ID.",
        searchTerms: [
          "milestone", "career", "lifetime", "anniversary",
          "100 wins", "championship", "title", "ring",
          "streak", "record", "achievement", "all-time",
          "tracker", "automated tracking",
        ],
      },
      {
        slug: "fantasy-football-manager-analysis",
        title: "Manager analysis — DNA, tendencies, and style",
        chip: "Feature",
        tagline: "Drafting style, lineup habits, trade behavior, response to adversity — profiling managers as a personality, not a record.",
        snippet:
          "Profiling fantasy football managers by their decision patterns — draft tendencies, lineup-setting style, trade behavior, response to losing streaks. How manager DNA differs from standings and what to do with it.",
        searchTerms: [
          "manager", "dna", "tendencies", "style", "profile",
          "drafting style", "set-and-forget", "tinkerer",
          "zero rb", "rb heavy", "late qb",
          "manager dossier", "personality", "playing style",
        ],
      },
    ],
  },
  {
    kicker: "Platform how-tos",
    title: "Set up your league —",
    titleEm: "step by step.",
    blurb:
      "Practical walkthroughs for each fantasy host. Find your league ID, paste it, publish.",
    guides: [
      {
        slug: "sleeper-league-history",
        title: "Sleeper — archive your league history",
        chip: "How-to",
        tagline: "Every season, every draft, every champion — pulled from any Sleeper league ID in 30 seconds.",
        snippet:
          "Step-by-step instructions to archive a Sleeper fantasy football league's full history — finding your league ID, pasting it into The Sunday Chronicle, and publishing the public almanac. No installation, no manual exports.",
        searchTerms: [
          "sleeper", "sleeper api", "previous_league_id",
          "how to", "setup", "instructions", "walkthrough",
          "league id", "sleeper league id", "import sleeper",
        ],
      },
      {
        slug: "espn-league-history",
        title: "ESPN — full history (public + private leagues)",
        chip: "How-to",
        tagline: "ESPN hides old seasons behind a clunky interface. Here's how to pull every year — including private leagues — into one public almanac.",
        snippet:
          "Archive an ESPN fantasy football league's full history including private leagues. Finding your league ID, grabbing the SWID and espn_s2 cookies for private leagues, and getting every season — including pre-2018 archives — into one public almanac.",
        searchTerms: [
          "espn", "espn fantasy", "swid", "espn_s2", "cookie",
          "private league", "espn league id", "leaguehistory",
          "pre-2018", "legacy", "how to", "instructions",
        ],
      },
      {
        slug: "yahoo-league-history",
        title: "Yahoo — archive your fantasy league history",
        chip: "How-to",
        tagline: "Yahoo needs a one-time OAuth sign-in. After that, every season your league has played comes back as a clean public almanac.",
        snippet:
          "Archive a Yahoo fantasy football league's full history via OAuth sign-in. Step-by-step from sign-up through Yahoo authorization to a published public almanac.",
        searchTerms: [
          "yahoo", "yahoo fantasy", "oauth", "yahoo league id",
          "yahoo sign in", "authorize", "how to", "instructions",
          "import yahoo",
        ],
      },
      {
        slug: "nfl-com-league-history",
        title: "NFL.com — archive your league history",
        chip: "How-to",
        tagline: "NFL.com exposes league data publicly behind the league ID. Paste it, no sign-in needed, every season back to the league's founding.",
        snippet:
          "Archive an NFL.com fantasy football league's full history. NFL.com exposes league data publicly so no sign-in is needed — paste your league ID and every season the league has played gets imported.",
        searchTerms: [
          "nfl.com", "nfl fantasy", "nfl league id",
          "fantasy.nfl.com", "how to", "instructions",
          "import nfl.com", "no sign in",
        ],
      },
    ],
  },
  {
    kicker: "Editorial",
    title: "The case for keeping the league's story —",
    titleEm: "and what gets it wrong.",
    blurb:
      "Long-form reads on why league history dies, how to move between platforms without losing it, and the recurring mistakes commissioners make.",
    guides: [
      {
        slug: "sleeper-vs-espn-history",
        title: "Sleeper vs ESPN — what each platform actually saves",
        chip: "Comparison",
        tagline: "Side-by-side: how far back you can see, what data you can export, and where each falls short.",
        snippet:
          "Sleeper vs ESPN compared on what each platform actually saves of your league's history — API surface, historical depth, public vs private league friction, draft data, playoff bracket detection.",
        searchTerms: [
          "sleeper vs espn", "espn vs sleeper", "compare platforms",
          "which platform", "platform comparison",
          "switch platforms", "leave espn", "leave sleeper",
        ],
      },
      {
        slug: "migrate-fantasy-league",
        title: "Moving your league between platforms — keeping the history",
        chip: "How-to",
        tagline: "Yahoo → ESPN → Sleeper. When commissioners migrate, league history dies. Here's how to preserve it.",
        snippet:
          "How to move a fantasy football league between platforms without losing the history. Yahoo to ESPN to Sleeper migrations covered — preserving every season under one unified archive.",
        searchTerms: [
          "migrate", "migration", "switch", "move league",
          "yahoo to espn", "espn to sleeper", "switch platforms",
          "platform change", "leaving yahoo", "leaving espn",
          "preserve history", "lose history",
        ],
      },
      {
        slug: "why-league-history-dies",
        title: "Why fantasy league history dies (and how to save it)",
        chip: "Essay",
        tagline: "Screenshots get lost. Group chats archive. Platforms change. A long-running league's story deserves better.",
        snippet:
          "Why most long-running fantasy football leagues end up with no usable history after 5+ years — screenshots scatter, group chats archive, platforms change, commissioners move on. What to do about it.",
        searchTerms: [
          "why", "history dies", "lose history", "data loss",
          "screenshots", "group chat", "old seasons",
          "long-running league", "preservation",
        ],
      },
      {
        slug: "commissioner-mistakes",
        title: "The 5 biggest mistakes commissioners make",
        chip: "Essay",
        tagline: "Practical lessons from running and archiving long-standing fantasy leagues.",
        snippet:
          "Five recurring mistakes fantasy football commissioners make with their league's history — and how to recover from each one. Practical lessons from running long-standing dynasty and redraft leagues.",
        searchTerms: [
          "mistakes", "commissioner", "common mistakes",
          "what not to do", "fix",
          "platform reliance", "documentation",
          "lessons", "advice",
        ],
      },
    ],
  },
]

// Flat list of every guide across every section — used by the client search
// component so it can match across categories without re-flattening.
export const ALL_GUIDES: (Guide & { sectionKicker: string })[] = SECTIONS.flatMap((s) =>
  s.guides.map((g) => ({ ...g, sectionKicker: s.kicker })),
)
