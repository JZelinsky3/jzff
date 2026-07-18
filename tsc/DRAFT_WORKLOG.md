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

### Retune 2026-07-17 (second pass on the scoring model)

Joey's feedback after living with the restored engine, and the changes made:

- **QB/TE replacement deepened** (`REPL_MULT` QB 1.0→1.35, TE 1.0→1.25). The old QB line sat at
  exactly QB12 in a 12-team league, so Tannehill QB10→QB12 banked zero and ate the full slot
  expectation: −34 for a two-rank slip. Now replacement is the ~QB16 you could stream, so a QB12
  season counts as real production (Tannehill −34 → +15).
- **Asymmetric per-board delta weights** replaced the single `DELTA_W`: `DELTA_UP` QB 1.4 / TE 1.3 /
  FLX 1.35, `DELTA_DOWN` QB 0.7 / TE 1.2 / FLX 1.7. Down-weight is gentler on the steep QB curve
  (2 QB ranks = a pile of points) and harsher on flex letdowns (McLaurin WR11→WR25, FLX 26→38:
  +30 → +15). Up-weight 1.4 makes Dak QB10→QB2 (242) finally edge Allen QB3→QB1 (241) in 2023.
- **Depth zone replaced by continuous climb/bust terms** (`CLIMB_W` .1 cap 120, `BUST_W` .12 cap
  250). Below-line climbs stay token (Doubs +0.9 unchanged); vanishing acts scale with what the slot
  promised instead of capping at −25, so Daniel Jones QB14→QB44 went −25 → −40 (worse than any small
  slip, as it should be) and R8 picks missing the top-100 now land ~−10 to −21 instead of −1.
- Verified offline against all 7 seasons (ppr_6pt reproduces Joey's quoted numbers exactly): 86
  classes, 1113 picks, zero NaN, Kupp 2021 +606 max, Joey 2021 top class. John 2019 slides 2nd→3rd
  of 2019 (late-QB-hit up-weight lifted Connor past him) — accepted. Calibration harness lives in
  the session scratchpad (`tune.js`), rebuildable from this table.

**Second pass, same day (Joey's feedback on the first pass):**

- **QB banded value curve.** Deepening replacement alone made every startable QB finish worth a pile
  (Stafford QB13→QB5 hit +298, Cousins QB16→QB11 +193). QB VOR is now read through a band:
  `0.6 × points above the QB5 line + 0.4 × points between QB5 and QB16`. `DELTA_UP.QB` 1.4→1.6,
  `DELTA_DOWN.QB` 0.7→0.6, and a pick that still finishes top-5 only eats `DELTA_DOWN_QB_ELITE = 0.2`
  of its slot miss (QB1→QB4 is a fine outcome). Results: Tannehill 10→12 = +8, Hurts 14→11 = +51,
  Dak 21 9→7 = +68, Stafford = +128, Cousins = +84, Mahomes 22 3→1 = +189 (QB ceiling), Winston +120.
  Known trade-off: Dak 23 10→2 (123) sits just under Allen 23 3→1 (133) because Allen banked 45 more
  real points; closing that fully would require up-weights that re-inflate every late QB hit.
  Mahomes 21 1→4 = 64 (2021's QB4 scored ~4 pts above QB5, so "top-4" was cheap that year).
- **Flex positional guard.** An RB/WR who met or beat his positional draft slot can't grade negative
  off the flex board alone (met the slot → floor −3, beat it → floor 0). Fixes Gibson 21 RB11→RB10
  FLEX 12→30, which read −11 and now reads 0. Fires on ~14 picks all-time, all small.
- **Oracle reverted to the old dark design** (`wr-verdict` / `wr-or-*` war-room fortune board):
  Joey vetoed the cream book-ticket look. The ticket CSS is gone; the renderer emits the old
  structure with dark-theme `POS_COLORS`.
- "The Class Of" year cards: fixed 3-per-row grid (2 at ≤900px, 1 at ≤600px). Inside an open class,
  year tabs ('25…'19) sit next to the title so you can hop years; ← All years stays on the right;
  switching years via tabs no longer scrolls the page.

**Third pass (value emphasis for single-starter positions + injury forgiveness):**

- Joey: value (beating your slot) matters more than raw finish, especially for QB/TE since you only
  start one. `DELTA_UP` QB 2.0 (from 1.6), TE 1.6 (from 1.3). Late QB hits now pay properly:
  Daniels QB11→QB5 = 101, Stafford QB13→QB5 = 145, Rodgers QB12→QB6 = 120, Cousins QB17→QB6 = 105.
  QB ceiling Mahomes 22 = 205. Dak 23 (140) vs Allen 23 (146) is now a near-tie.
- **TE got the same banded curve as QB** (`VALUE_BANDS`: QB elite 5 / .6 top / .40 band; TE elite 3 /
  .6 top / .45 band; shared `DELTA_DOWN_ELITE` 0.2). Without it the TE up-weight sent Andrews
  TE6→TE1 to +355, dwarfing the QB ceiling. Banded: Andrews 196, McBride TE2→TE1 202,
  Bowers TE12→TE1 154, Kelce TE1→TE1 ~69-99 (solid, expected, same shape as QB1→QB1).
- **Injury forgiveness** (`INJURY_W` 0.65): a flex pick from the first ~1.7 rounds
  (`dr <= 1.7 × teams`) whose flex finish fell below the startable line (or unranked) is treated as
  an injury season and its negative score is scaled by 0.65. Catches exactly the famous ones
  (CMC 21 −475→−309, CMC 24 −403→−262, Saquon 20 −311→−202, JT 22 −353→−229, Kupp 23 −345→−224);
  full-season busts that stayed startable (Deebo 21 −116) are untouched.

**Fourth pass (tier ladder for the QB/TE top end):**

- Joey: QB13→QB5 (+145) beating QB10→QB2 (+140) is wrong; the top end should be tiered, ~20 pts
  between the top-3 finishes, ~15 down through 7th, ~10 after, middle unchanged. Implemented as
  `TIER_OFFSETS = [110, 90, 70, 55, 40, 25, 10]` for finish/slot ranks 1..7, added to the
  points-band value at rank 8 (`TIER_FROM`), per year. Ranks 8+ stay pure points. Both the finish
  value AND the slot expectation read off the same ladder. With value baked into the tiers,
  `DELTA_UP` QB dropped 2.0→0.7 and TE 1.6→0.6; `DELTA_DOWN.TE` 1.2→0.8.
- Results: Stafford 13→5 = 134 (was 145), Dak 23 10→2 = 175 (was 140) now above Allen 23 3→1 = 158,
  Mahomes 21 1→4 = 88 (finally in Joey's 85-100 window), Daniels 11→5 = 114, Hurts 14→11 = 38
  (back in his 20-40 window), Tannehill = 8 unchanged, Cousins 16→11 = 55. Top QB score all-time is
  Rodgers 20 QB9→QB1 = 234. TE: Kelce TE1→TE1 = 132 (top end worth real points now),
  Bowers TE12→TE1 = 203, Andrews TE6→TE1 = 170, Kittle TE1→TE19 = −93.
- Avg value ladder: QB 141/121/101/86/71/56/41/31/26/24/21/14/10/7/3/0 (ranks 1..16),
  TE 125/105/85/70/55/40/25/15/13/10/9/7/4/2 (ranks 1..14).

**Fifth pass (harsher elite falls, TE top-end buff, partial-season injury tier):**

- `DELTA_DOWN` QB/TE 0.85 (from .6/.8): a top QB/TE slot falling 7+ spots out of the elite tier is
  now a real failure. Herbert 22 QB2→QB9 = −54, Hurts 24 QB2→QB9 = −65, Mahomes 23 QB1→QB8 = −74
  (Joey wanted −50/−60 for the QB2→QB9 shape). Falls that stay inside the elite tier still bank with
  only a slight minus (Mahomes 20 QB2→QB3 = +109, Allen 24 QB1→QB4 = +79).
- **TE tier offsets ~15% richer than QB** (`TIER_OFFSETS` now per-position: TE
  [127,104,81,63,46,29,12]) plus `DELTA_UP.TE` .6→.7: late TEs that hit the top are the hardest
  pick in the draft. Bowers TE12→TE1 = 245, Pitts TE15→TE2 = 214, Andrews TE6→TE1 = 204,
  Kelce TE1→TE1 = 149.
- **Partial-season injury tier** (`INJURY_PARTIAL_W` 0.8): top-10 flex picks that finished startable
  but way under cost (missed ~5-7 games) get a lighter version of the injury forgiveness.
  Jefferson 23 WR1→WR33 −314→−251, Ekeler 23 −181→−145, Cook 21 −240→−192, Tyreek 24 −190→−152.
  Full-vanish rule (×0.65, below-startable finish) unchanged and takes precedence.

**Sixth pass (QB falls to the 40-50 window, PPG in the breakdown):**

- Joey asked why Hurts 24 QB2→QB9 (−65) ran 11 worse than Herbert 22 QB2→QB9 (−54), and why
  Lamar 20 QB1→QB10 (−68) beat Mahomes 23 QB1→QB8 (−74) despite falling two spots further.
  Verified against the real curves: finishes at rank 8+ are points-valued per season, and that is
  the whole story. 2022 bunched QB8-QB10 within 8 pts (QB9 was 64 clear of replacement) while 2024
  had a 31-pt cliff after QB8 (QB9 only 55 clear, off a richer QB8 base). And 2020 QB10 (393.7,
  85 over the line) simply out-produced 2023 QB8 (348.1, 49 over). Ruled a feature: ordinals lie
  across years; VOR doesn't. No structural change.
- `DELTA_DOWN.QB` 0.85→0.70 per Joey's new window for the QB2→QB9 shape (−40/−50 instead of
  −50/−60). Results: Herbert 22 = −40, Hurts 24 = −50, Mahomes 23 QB1→QB8 = −57,
  Lamar 20 QB1→QB10 = −50. TE down-weight stays 0.85. Softens every non-elite QB fall
  proportionally.
- **PPG in the class breakdown**: new `gp` (games played) field in the fantasy_ranks files, shown
  per graded pick as `18.5 ppg · 12g` so missed-time seasons read differently from full-season
  busts. Joey found one strip of five data points too dense, so pick rows are now two-deck: player
  + slot, positional move and score on the headline line; ppg annotated under the name
  (`.grader-pick-meta`) and the FLEX board move annotated under the positional move
  (`.grader-pick-flex`) — Joey wanted it near the score it produces (hierarchy, not more color).
  QB/TE rows get `.no-flex` (move spans both rows, vertically centred); ungraded K/DEF rows
  collapse to a single centred line. Move + FLEX are right-aligned so the small stacked lines
  share a flush edge instead of ragged centring. Class cards now sit three across
  (`repeat(3,1fr)`, 2-up under 1150px, 1-up under 700px).
- **fantasy_ranks extended back to 2009** (2026-07-18): generated 2009-2014 from Sleeper for all
  four profiles (Sleeper's stats floor is 2009; 2008 and earlier return no fantasy points). Old
  years are thinner (163 ranked players in '09, 481 by '14, vs ~560 modern) so deep darts more
  often finish NR, and these six years are Sleeper-based vs the FantasyPros-derived 2015-2025 —
  fine for grading since every year grades against its own curve. Nothing reads them until a
  league imports drafts that old.
  Data provenance (corrected after Joey questioned "stat corrections"): the committed
  fantasy_ranks numbers are NOT Sleeper's — they trace to the old pams site's FantasyPros scrape
  (08_scrape_fantasy_ranks.py; the four profiles are arithmetic spins of that base, and the
  Jul 15 Sleeper generator's "exactly reproduces" comment was overstated). Sleeper computes
  ±1-3 fpts differently, names differ ("Patrick Mahomes II"), player pools differ. So old years
  were NOT regenerated — `gp` was backfilled by player_id join, everything else byte-identical
  (~99.7% coverage; a handful of players missing from Sleeper's aggregate show no ppg).
  `generate-fantasy-ranks.mjs` emits `gp` for future years and carries a CAUTION comment against
  wholesale regeneration. NOTE: a future season generated from Sleeper will sit on a slightly
  different scoring base than the FantasyPros-derived history; within-year grading is unaffected
  (each year grades against its own curve), only cross-year point trivia could wobble.

**Seventh pass (2026-07-18): gp-gated partial injury forgiveness.** Joey flagged Lamb 25
(WR2→WR22, FLEX 3→43, 14 games, −199) as too harsh for a 3-games-missed season; wanted ~−155.
`INJURY_PARTIAL_W` 0.8→0.65 (same weight as the full-vanish tier) but the startable-under-cost
tier is now gated on real missed time: `gp <= INJURY_GP_MAX` (14; missing gp forgives). Two-sided
effect, 30 picks moved: injured seasons softened (Lamb 25 −199→−162, Jefferson 23 −251→−204,
Saquon 19 −244→−198, Cook 21 −192→−156, Henry 21 −181→−147, Ekeler 20 −167→−135, Kupp 22
−155→−126) while healthy busts lost the discount entirely (Jefferson 25 17g −186→−233, Tyreek 24
17g −152→−190, Zeke 20 15-of-16 −137→−171, Saquon 25 −116→−145, Chase 23 −104→−130, Breece 24
−84→−106). Joey then softened both edges: `HEALTHY_BUST_W` 0.93 (healthy top-10 flex busts keep a
sliver of forgiveness — Jefferson 25 −233→−216, Tyreek 24 −190→−177) and `POS_STARTER_W` 0.8 (a
flex pick that still finished top-12 at his own position missed on the flex board, not the
position call — Chase 23 WR2→WR11 −130→−97 per Joey's −90/−105 window, Zeke 20 RB2→RB9 −171→−127,
Saquon 19 RB1→RB10 −198→−159, Nico 25 WR4→WR8 −101→−75). Fifth-pass example numbers above are
superseded where they overlap. Second round same day (hits side): `FLX_ELITE` 6 extends the
elite down-forgiveness (0.2) to the flex board; `FLX_ANCHOR_BONUS` +20 for picks that paid a
top-6 flex price AND finished top-6 flex at-or-below the slot — the push-reading correction
(Bijan 25 FLEX 2→3 +203→+229 per Joey's 220-240 window; Gibbs 25 +226, Zeke 19 +169). Up-moves
are excluded: the delta term already pays them, and CMC 19 at +539 with the bonus was too rich
for Joey — without it he sits at +519 (his 510-520 ask), Chase 24 +318, Jefferson 22 +257;
`CLIMB_GP_W` .02/missed game (cap 4) credits positive flex climbs earned in fewer games
(Adams 25 FLEX 42→24 in 14g +91→+96 vs Sutton's healthy +105, closing the gap to ~8 per Joey;
~99 climbers bumped +2 to +16). UI same day:
+.45rem gap between the move stack and score; `.no-meta` centres the name on rows with no ppg
line (never-played NR seasons like Guerendo 25); ungraded "not graded" label shrunk to .5rem;
all `.gp-ungraded` rows flex together so multiple K/DEF lines share a card's leftover height
evenly instead of the last one absorbing it all.

**Report Card redesign (2026-07-17): the Registrar's Ledger.** Best Drafters and the Official
Transcript said the same thing twice, so they merged into one sheet: `renderGraderLedger()` replaced
`renderGraderLead()` + `renderGraderMatrix()` (and `toggleGraderAlumni`; the ledger reuses the shared
`toggleAlumni('ledger')` divider pattern). One `.ledger-table` row per drafter: rank + serif-italic
name + career line (classes graded, best finish, provisional), one column per year holding the grade
chip with that class's within-year rank beneath it, then a fat Avg Rank column that orders the board.
Masthead above the table: double-ring gold seal, "Office of the Registrar / The Official Transcript",
classes-on-file count. Design rule honored: of the loose-leaf trio (cream paper, red top rule, blue
ruling) it borrows ONLY the red line — a crimson 3px double rule under the masthead; row hairlines
are dotted so it reads ledger, not almanac table. Alumni stay in a collapsed section at the bottom
with their own numbering. "The Class Of" year cards got the light version of the same treatment:
centered REPORT CARD letterhead between hairlines, the same crimson double rule under the yearline,
and dotted leaders between each label and its entry. Old CSS blocks (.grader-lead*, .grader-matrix*,
.transcript-*, .gly-*, .mx-*) deleted. Verified via headless-Chrome screenshots against the real
pams data (ledger, expanded alumni, opened Class of 2024 with the new ppg column).

Registrar theme, second sweep (same day): the opened Class Of view joined the system. The year
summary strip became a framed "Registrar's Summary · Class of 'YY" docket (letterhead between
hairlines, crimson double rule, then the horizontal band; count in gold serif, manager names serif
italic). Each manager's class card now carries the same language: serif-italic name in the header,
crimson double rule under it, dotted hairlines between pick rows. Polish fixes from Joey's review:
`.alumni-plus` zeroes inherited letter-spacing (the + sat off-centre in every letterspaced divider),
and the ledger's identity column is fixed at 16rem so revealing alumni rows (whose longer
"provisional" career lines previously re-measured the auto-layout column) no longer shifts the year
grid.

First-pass UI work: FLX column label written out as FLEX, positional-move column centered
(flex column stays right-aligned), league champion's class card gold-trimmed with a ✦ Champion tag
in the year breakdown plus a League Champ line on each year card (needs `finishes` in the draft
export; old exports without it just omit the line). Also restored the Slot Oracle: the design-rework
JS emits an `oracle-ticket` (`ot-*` classes) but its CSS never landed, so the reading rendered as
unstyled run-together text — wrote the cream-ticket CSS block and retired the dead war-room
clock/mode styles.

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
