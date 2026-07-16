# Draft Annual + Mock Room Worklog

Reconstructed 2026-07-15 from local Claude Code transcripts (`~/.claude/projects/-Users-jojo-Desktop-jzff/*.jsonl`).
These transcripts survive on disk regardless of which account was signed in, so the work done on the
now-expired account is fully readable and recoverable.

Two separate features were built across these sessions and they got intermingled on Jul 11:

1. **Draft Annual / The Report Card** (the draft-class grader) in `src/templates/pams/draft/index.html`
2. **Mock Room** (the mock draft simulator) in `src/templates/pams/draft/mock.html`

---

## ⚠ Recovery status (read first)

**1. The tuned draft-class grader was lost in a rebuild, and has now been RESTORED (2026-07-15).**
On Jul 11 a detailed flex-scoring grader was built and tuned. On Jul 15 you noticed "top rated draft
classes" was gone after a VS Code restart/update. Confirmed: the rebuilt `draft/index.html` "Report Card"
had been replaced with a simpler letter-grade model (early-pick hit rate only). The tuned engine was never
committed to git, so it survived only in transcript `b997b3f6-5db5-41f5-900e-64a7e7af01dc.jsonl`.
- Extracted the full engine from that transcript and re-applied it to `draft/index.html` (Chapter V,
  `renderReportCards` -> `computeGrader` + render functions), re-themed from the old dark `--dg-*` palette
  to the Draft Annual `--an-*` palette.
- Verified: JS syntax clean; engine run against real rank data produces 86 classes across 7 seasons,
  zero NaN scores, grades spread A+ to F, and reproduces the original signature (Michael Thomas WR4->WR1
  FLX 10->2). Dev server serves the page at 200 with the grader present.
- NOTE: this engine is client-side JS inside the template and is easy to wipe in a future rebuild. If it
  disappears again, it is in transcript `b997b3f6` and in git history from this date forward.

**2. `mock.html` (the Mock Room simulator, ~4000 lines) was untracked in git. COMMITTED 2026-07-15**
(commit `eeacda4`). It is now recoverable from git.

---

## Feature A: Draft Annual / The Report Card (draft-class grader)

File: `src/templates/pams/draft/index.html` (Chapter V, "The Report Card").
Tested on slug `pams` (Joey's 7-season league, 2019-2025), never other users' leagues.

### The tuned scoring model that was built (Jul 11, now lost)

A "class" = one manager's draft in one year. Every pick gets a score; the class score is the sum.

- **Per-pick score** = `production secured + (production secured - slot expectation)`
  - `production secured` = value over replacement of where the player actually finished, floored at 0
  - `slot expectation` = value over replacement implied by where he was drafted, floored at 0
  - So the consensus RB1 who finishes RB1 grades as a solid, expected pick (banked real production),
    not a nothing-pick. This was your explicit requirement from the start.
- **Replacement level** = last startable player (~WR36 in a 12-team league, scaling to ~WR42 for the
  14-team 2019 season).
- **Depth scale** for picks below replacement: small scores capped at ±25 based on actual points
  gained/lost vs the slot, so a deep pick that climbs beats one that vanishes, without letting late darts
  swing the grade. Worked examples that were verified:
  - Christian Kirk WR51 → WR101 = −7
  - Romeo Doubs WR61 → WR37 = +6
  - Xavier Legette WR60 → WR71 = −1
  - J.K. Dobbins RB36 → RB43 = −1
  - Jaydon Blue RB47 → RB92 = −8
- **Flex scoring** (your idea, a genuinely better model): RB and WR are scored on ONE combined flex
  board, because they come off the same shelf for the first several rounds. For RB/WR the flex ranks are
  the *entire* scoring input; positional ranks (WR32 → WR2) are kept only as the familiar label. QB and TE
  are scored on positional rank. Each pick row displays four aligned columns:
  `player | positional move | FLX move | score`. QB/TE leave the FLX column blank.
- **Asymmetry (positive vs negative), partly deliberate:** meeting your slot scores positive on purpose
  (you banked production), so the baseline is positive and you see more green than red. This was your call.
- **Headline metric changed** from "avg class rank vs all classes ever" (produced an unreadable 77.0 for a
  one-year manager) to **within-year avg draft finish** (e.g. 5.1 = across your drafts you averaged the
  ~5th-best draft of that year). Plus a qualification rule, alumni split, and pick-by-pick breakdown.
- **Grade** = percentile band of the class rank (top band = A, bottom = F).

Verification note from that session: John's 2019 A- was correct. His class really was the 2nd-best value
haul of the year (Godwin WR32→WR2 +207, Winston last pick QB28→QB3 +187, Kelce TE1→TE1 +141). He went
2-12 because the grader measures draft-day value, not lineup/luck after the draft.

### Current file (restored 2026-07-15)

`draft/index.html` Chapter V now runs the tuned engine again: `computeGrader()` plus render functions
(`renderGraderLead`, `renderGraderMatrix`, `renderGraderClasses`, `renderGraderDetail`), entered through
`renderReportCards()`. The chapter renders four blocks: Best Drafters leaderboard (avg draft finish,
active + collapsible alumni), the Report Card grade matrix (grade per manager per year, score/rank on
hover), Classes of Record (best/worst single drafts), and Class Breakdown (year tabs, pick-by-pick with
the FLX column and per-pick score). The interim simpler hit-rate model that had replaced it is gone.

### Chronology of your requests (draft-class, Jul 9-11)

- Explain what "avg class rank 1.0" means; split alumni from active (collapsible section); make sure a
  7-season player is not hurt vs a 3-season player by the scale.
- Show actual class scores, not just letter grades, so ties are readable. Investigate why John's 2019
  ranked A- despite a 2-12 finish (verdict: grade was right, it measures draft value).
- Fix the many flat-0 scores around picks 40-80; every pick should carry a value; fill the empty bottom
  slot (extra DEF/K pick) with a short grey note.
- Reduce positive/negative asymmetry concern; put RB and WR on one "flex" scale (excluding TE).
- Make the flex ranking display better and confirm it actually feeds the score (it does, for RB/WR).

---

## Feature B: Mock Room (mock draft simulator)

File: `src/templates/pams/draft/mock.html` (~4000 lines, UNTRACKED in git).
Mobile: `src/templates/pams-mobile/live/trades/mocks/` and related. API: `src/app/api/mock-board/route.ts`.

### What was built and decided (Jul 10-15)

- Redraft leagues first (no keepers/dynasty yet).
- Draft-order setup: drag-and-drop names, not one-step up/down arrows.
- Draft board should fit all 12 teams without scrolling (scale for more/fewer teams).
- A separate "Start draft" button; don't auto-start when the board opens. Same for the projection mock:
  add a Begin button, don't start immediately.
- **Rankings sources:** pull ESPN, NFL.com, Sleeper (and FantasyPros) draft rankings via a scraper that
  runs ~daily until the season starts. Consensus must exclude mixed modes (no Dynasty mixed with Redraft);
  ROS pre-draft = same as regular rankings. User can select one, several, or all ranking sources; hover/
  odds popups must reflect only the selected sources, not all four.
- **Draft brain:** picks follow player rankings weighted by odds, plus manager tendencies for close
  positional calls. Top few picks of each ranking should be stable (no random players from 10 picks back
  jumping up early). Replaced the old `needWeight` with real roster math (integer starter requirements,
  flex accounting, spare-pick urgency, bench suppression).
- **Odds view:** when a team is on the clock, show per-player odds (e.g. 55% / 25% / 20%), with
  highest/lowest ADP, similar to FantasyPros' simulator but with the league-manager tendencies that set
  this apart. At least 3 players shown per pick even if the 3rd is ~3%.
- **Pace options** (Instant / Quick / Broadcast) control per-pick speed. The projection reveal was cut
  from ~5s to ~3s per pick after selection.
- **Scripts** (draft-strategy archetypes like Double RB/WR, Robust, etc.): derived from each manager's
  past drafts; "double RB/WR" changed from 4 rounds to 3 rounds; ordered double before triple/robust;
  list the requirements to earn each script; manual script selection list is long, wants a better UI.
- **"The book on {name}"** scouting cards: needed real design (not just full-width stretched cards);
  3 per row; at least 3 candidate players per pick; a bit of bottom margin below the last row; header
  spacing fixes; a way to close the popup without picking. Ongoing doubt about whether a full-page popup
  is the right pattern vs seeing the board + recommended players inline.
- **Scouting report content:** bigger cards (2 per row) treated like real scouting reports; keep the
  draft-identity badge/stamp (e.g. "elite QB") in the top-right; use "RD" for rounds not "R"; drop K/DEF
  from the report.
- **Recency weighting:** weight the last 3 seasons more heavily than career overall, since tactics change.
- **Colors:** position colors should match the site-wide palette. Gold for WR was disliked; the board was
  made black with warmer, less-matte position dyes (WR moved off gold; see the WR-color note in memory).
- **URLs:** the new mock and all-time pages should not have `.html` in the URL.
- **Snake order label fix:** reverse round of a snake draft is 2.01, not 1.12 (the 12th picker is not the
  12th pick every round).

### Related draft-history / all-time work (same Jul 10 sessions)

Draft-order vs first-round-lineage tables were merged; season ledger reversed to newest-on-top; All-Time
Team cards filled with avatars + rank line; alumni collapsed behind a "more/+"; chapter-jump anchors land
with the full title visible. (Tracked here only because it shared sessions with the draft work.)

---

## Source file map (current)

- `src/templates/pams/draft/index.html` - Draft Annual, Chapters incl. V "The Report Card" (grader). TRACKED, modified.
- `src/templates/pams/draft/mock.html` - Mock Room simulator. UNTRACKED (commit this).
- `src/templates/pams-mobile/draft/index.html` - mobile draft annual.
- `src/app/api/mock-board/route.ts` - mock board API.
- `src/app/api/cron/refresh-draft-ranks/route.ts` - draft-rank scraper cron.
- `src/lib/values/draftRanks.ts` - draft rank values.
- `public/data/fantasy_ranks/<profile>/<year>.json` - end-of-season positional finishes feeding the grader.

## Transcript index (for deeper recovery)

Path: `~/.claude/projects/-Users-jojo-Desktop-jzff/`

- `b997b3f6-...jsonl` (Jul 11) - draft-class grader built and tuned. ~220 edits to draft/index.html. Best source to recover the lost grader.
- `ee4cfa2b-...jsonl` (Jul 11) - grader import of custom 2019 draft + Mock Room scouting/projection work.
- `06c4117f-...`, `ef2a0e5a-...jsonl` (Jul 10) - earlier draft-annual layout/grading-scale work.
- `aee96563-...jsonl` (Jul 15) - you noticing the grader went missing after a restart.
- `a2401c1d-...jsonl` (Jul 11) - Mock Room engine (rankings sources, odds, draft brain).
- `80dacdd4-...jsonl` (Jul 11) - Mock Room board styling, scripts, "the book" popup, position colors.
- `833ef0c3-...jsonl` (Jul 15) - Mock Room scouting-report polish, reveal timing, recency weighting.
- `76a415eb-...jsonl` (Jul 10) - All-Time Team + draft-history layout.

## Recommended next steps

1. Commit `mock.html` so the Mock Room can't be lost to git.
2. Decide whether to restore the tuned flex-scoring grader from `b997b3f6`. If yes, the exact code can be
   extracted from that transcript and re-applied to the current `draft/index.html`.
