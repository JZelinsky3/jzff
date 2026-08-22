# PAMS 2026 Draft Day

A draft broadcast for the PA Milk Society. Three screens that share one live
state through Firestore, with Sleeper as the eventual source of truth.

Draft: **Friday August 28, 2026, 7:15pm** — 14 rounds, snake, 12 teams,
120 second clock, full PPR / 6pt passing TD / TE premium (+0.5).

## The three screens

| Page | Who opens it | What it is |
|---|---|---|
| `board.html` | the laptop mirrored to the TV | the broadcast. Read-only, never touch it once it's up |
| `control.html` | Joey's phone, privately | start, hold, announce, advance, undo, showcase |
| `pick.html` | every manager's phone | pick who you are once, then tap a player on the clock |

`index.html` is the hub that links all three plus the runbook.

## How a pick goes

1. Board puts a manager **on the clock**, timer runs.
2. He taps his player in `pick.html`. The TV flips to **THE PICK IS IN** and
   shows nothing about who it is.
3. Joey hits **Announce in 5s**, walks to the TV, says the name. The board
   then runs one continuous sequence:
   - the stage takes over on **THE PICK IS IN**, covering the whole canvas:
     headline top left in gold leaf, the overall pick as a huge outlined
     numeral right with the round and pick crossing its middle, and who locked
     it bottom left with his cut-out. The set is lifted rather
     than dimmed here — it is the one beat with nothing else on the screen.
     `.pickin` is a child of `#frame`, not `.main`, so it reaches the edges,
     and the two headline lines are `white-space: nowrap` because left to
     itself it re-wraps to three the moment the type outgrows the column
   - the **selection graphic** holds for six seconds: portrait, owner,
     the name at 12.5vh, the pick badge, an oversized pick number behind it.
     The photo column is 33% with `padding-left` on `.sel-shot`, not 30% flush:
     once the cut-out grew to 50u it was centred in 53u of panel and came out
     jammed against the left bezel with 18px either side of it
   - it collapses into the **detail screen**: the portrait shrinks in, the
     board and the manager's roster slide back, tags and history appear
   Retime the hold with `?sel=8000`, or park on it with a huge number.
4. The manager enters it in Sleeper. Joey hits **Next Pick**.

**No screen ever uncovers the board on its way out.** Every full-screen beat
here fades in from transparent, and the one it replaces used to be switched
off in the same frame that fade started — so for a third of a second you were
looking through the incoming card at the resting board. That is the reported
"half-second pause" between THE PICK IS IN and the selection graphic, and the
"break" between the round card and the man on the clock: not a pause, a hole.

`beginHandoff()` in board.js sets `handoff` on the body for 440ms and the CSS
holds the outgoing screen up underneath (`body.handoff .pickin`,
`body.handoff .reveal`), with `.selection` moved above `.pickin` in the z
order so it has something to cross. The two announcements do the same thing
between themselves: `runAnnounce()` lifts the incoming card over the outgoing
one (`.announce.over`) and drops the old one once the new one is opaque,
rather than clearing it and waiting 260ms as it used to. The last card of a
run fades back to the board (`.announce.out`) instead of cutting to it.

Nothing in the handoff waits on the network or on a load. It is one class and
one timer, so it cannot be the thing that goes wrong on the night.

**THE PICK IS IN is built, not switched on.** It runs about 1.7 seconds and
every step of it is transform, opacity or clip-path: the set fades up, the two
headline lines are *wiped* left to right rather than slid into place, a bar of
light then travels across the gold leaf (the leaf is a gradient clipped to the
glyphs, so animating its position is literally light moving over metal, and it
lands back where it rests), the numeral settles down into a gold bloom that
opens under it, the round-and-pick line opens out of its own tracking, and the
manager rises off the bottom edge with his three lines coming in behind him.

The wipe is `polygon()`, not `inset()`. The headline is `nowrap` in a
`minmax(0, 1fr)` column and leans out of its own box on every side; negative
`inset()` offsets are clamped to zero, so a clip meant to finish clear of the
type finished flush with the box and sheared THE PICK down to THE PIC.

**And the pick numeral steps down to 45 from pick 100.** Related trap, same
column: a three-digit numeral makes its own column wide enough that the 1fr
beside it drops under what the headline needs, and the headline does not
shrink. It overflowed — and because the gold leaf is a *background* clipped to
the glyphs, and backgrounds tile, everything past the box edge came out painted
in the dark end of the gradient. The K went black against a black wall for the
back half of the draft.

**The next man's clock starts at the reveal, not at Next Pick.** The board says
he is up the moment a pick lands — his slot lights on the wall, the ticker
names him, the band swaps best available for his card and clock — so the clock
is true from that moment too. Next Pick carries that clock forward rather than
restarting it, so sitting on a reveal to talk about it costs the draft real
time instead of quietly banking it. If a reveal ran long and the next man
deserves it back, **Reset** in the console is one tap.

**The clock controls work during a reveal, not just on the clock.** Pause,
+30s and Reset were gated on `status === "clock"` and the next man's clock
starts at the *reveal* — so from the moment a pick landed until Next Pick was
pressed there was a countdown running in the corner of the board that all three
buttons silently refused to touch. `clockLive()` in control.js is the gate now,
and it also covers the turn of a round: there is deliberately no clock between
the last pick of a round and the advance, and pausing one that has not started
would have written a paused 0:00 onto all three screens. The buttons render
disabled when there is nothing to act on, so a dead button reads as "no clock"
rather than as a broken tap.

**Except at the turn of a round.** The last pick of a round is followed by the
round card and then the on-the-clock card before anyone is really up, and the
man leading off the next round is usually the one who just picked at the other
end of the snake. `clockForReveal()` in control.js clears the clock there
instead of starting one, and advancing into a new round starts a whole one. The
next-up card says **STARTS ON NEXT PICK** and the console reads `2:00 held`,
because otherwise there is no way to tell a held clock from a running one.

## The manager showcase

**A whole screen about the man on the clock, while his clock runs.** One
button in the console, `showcase` in state carrying his draft slot, and the
board hands the canvas over to him: cut-out and power rank across the top, the
career strip, the season he is drafting for, his seasons and his tendencies,
every pick he owns tonight, and every pick he has ever made in this round.
Press it again to take it down.

**The seasons come from TSC's database, not from the dossier.** This is the
one part of the showcase that was wrong on the television rather than merely
plain: Mason came out as the 6 seed in 2021 and 10th at the end of it, which
cannot happen. `build_seasons.mjs` writes `source/seasons.json` out of the
league's own rows and `build_draft_data.py` reads it for the ledger and the
whole career line. Three rules, all of them TSC's own (`madePlayoffs` and the
seating comment in `src/lib/export/pams.ts`, which names this exact Mason row):

- **Who made the playoffs** is `final_rank` inside the season's
  `playoff_team_count`, cross-checked here against the championship bracket
  walked back from the game flagged `is_championship`. Not the top N by record:
  PAMS seeds out of divisions and conferences, so in 2025 the fourth and fifth
  best records both sat home while two worse ones played.
- **A team that missed finishes on its regular season.** The platform ranks the
  consolation bracket into 7-12 and that is what made Mason 10th — he lost a
  game in a bracket nobody cares about. Non-playoff teams are re-seated in
  regular-season order under the field, so he is 7th, the best team that missed.
- **Seed is the playoff seed**, and only exists for a team that made it.

The playoff record follows TSC's definition too — championship-bracket games
only, and the run ends at the first loss, so the 3rd-place game is not a
playoff game. Counting placement games gave Mason 60-43 where the site says
59-42, and the board must not show a man two different careers. Everything
reconciles now (ledger + playoffs = career record for all twelve), which
`selftest.html` asserts outright rather than around a known exception.

**2019 was a fourteen-team league**, so a finish that year carries `/14` on it
and a first rounder can read `pk 14`. And **the 2019 draft in `source/` is
Joey's hand-built import**, not the NFL.com scrape: the scrape is wrong from
pick 33 on (it has Mahomes at 33 where the real draft had Josh Gordon). It is
the same file as `public/old/pams/data/drafts/2019.json` — if that one is ever
re-curated, copy it across again.

**The seasons went sideways so that the tendencies card could exist.** The career
was a five-column table down half the screen and for all that room it only
said what had already happened. It is a row of seasons now at a third of the
height — year, record, finish, the seed (`2 seed`, the way anybody says it),
and what he averaged with the rank it earned him, one column each, filled
column-by-column in a single grid so every line stays level whether or not a
season carries a title badge. The points rank is a medal on the top three:
gold, silver, bronze, the only place on this board a number is coloured for
its own sake. `1st in points` on its own was a rank with nothing behind it.

Two alignment traps in that strip, both already paid for. The cells stretch to
their row so the title column's tint has no gaps in it, and a stretched box
puts an inline badge at its top — which is why TITLE sat high in a row where
every other season's text sat in the middle. Every cell centres its own
content now. And every small line in these two cards is `line-height: 1`: a
default line box carries descender space that tracked-out small caps never
fill, so a cell centred on its boxes still reads as sitting low.

The half it gave up is `TENDENCIES`, and it is read facts rather than a
chart. It was a proportional bar of his career by position, and a bar of how
many receivers a man has taken over seven years is a shape, not something
anybody can use while he is on the clock. Four things now, all counted:

- **His guy** — the player he has taken more than any other, and out of how
  many drafts. Kickers and defenses are left out of it, because taking the
  same defense three years running is not a personality, and a tie goes to
  whoever he takes earliest: two men taken twice each is common, and the one
  he spends a first rounder on is the one he is actually about.
- **Round N** — what he does with the round the draft is actually in, and in
  how many of his drafts, the way the round band along the bottom already
  follows the draft. It said ROUND ONE all night, which is the least useful
  version of it after the first twelve picks. Counted in drafts rather than
  picks — two ninth rounders spent on receivers in one year is one year — and
  the denominator is the years he owned a pick that deep, since picks move.
- **Against the room** — the position he is furthest from the league average
  on, and which way. Three quarters of a round is the bar for calling it, and
  every manager in this league clears it somewhere.
- **First off the board** — the round he takes each position in, averaged, with
  the earliest and latest he has ever gone, one bar a position.

All of it comes off `round_picks` and `draft_tendency`, so there is no prose
to keep true and nothing to rewrite when a draft is added. Whether a man waits
on a quarterback is the thing the room argues about while he is on the clock,
and nothing on the board answered it.

**The card is boxes now, not columns of one grid.** Seven cells split by
hairlines is the cheapest way to lay a card like this out and the hardest
thing on the board to read from a couch: nothing tells the eye where one fact
ends and the next begins, and the labels — the only type that says what the
number under it means — were the dimmest thing on the screen. The three read
facts are their own blocks, lit a shade off the panel and ruled in gold along
the top, with the labels gold at the size the rest of this board sets a key
in. Under them, `FIRST OFF THE BOARD` once as a caption with the rule running
off it, and four bars keyed down the leading edge in the position's own colour
— the eye finds the quarterback bar before it reads a word of it, which is the
question that row exists to answer. The word `FIRST` used to be in all four
cells, in the smallest type on the screen, doing work one line does.

**The round band follows the draft.** On the clock in round nine it shows every
ninth rounder he has taken, oldest year on the left, with the overall pick each
one went at. `round_picks` in managers.json is every pick he has made filed by
round; `round1_history` stays where it is because voice.js reads it for its own
purposes. Those pick numbers are that year's, not this year's: **PAMS had
fourteen teams in 2019**, so a first rounder from that draft can read `pk 14`
on a board whose first round now ends at twelve. That is where he actually
picked and it stays.

**The 2026 strip carries the fixtures with the other man's face on them.**
Week one and rivalry week, then the three he plays twice and where he picks
next. `doublesFor()` in core.js counts the doubles off the schedule rather than
storing them. Two of the six rivalries are inside one conference (Kyle and
Sean, Charlie and Luke) and those pairs meet twice like any other conference
opponent; the other four meet once, in week 11. `selftest.html` asserts exactly
that, so a schedule rebuild that breaks it says so.

**In his own draft, the two labels trade places.** A pick he has made is filed
the way the whole board files a pick — `3.10`, player beside it. A pick he has
not reached is the other way round: the overall number on the left, because how
far away it is is the useful thing, and the round and pick spelled out where
the player's name would be.

It covers everything, header and ticker included, which is why it carries its
own bottom band: **last pick, the clock, up next**. Nothing else on the board
is left showing to say where the draft is. The clock in that band is the real
one — `tickClock()` writes it the same way it writes the wall and the next-up
card — so a two minute pick spent looking at a career table still costs two
minutes.

**It is a clock-time screen and it closes itself.** The board only draws it
while `status === "clock"`, and every state change that moves the draft on
spreads `CLOSED` (`showcase: null`) into its patch, `submitPick` in core.js
included so a manager's phone takes it down as well. That matters: the moment
a pick lands, THE PICK IS IN owns the screen, and a showcase sat over it at
z-index 14 would have covered the one beat the whole night is built around.

**Two things it deliberately does not rebuild.** `renderShowcase` keys on
`slot|picks|current` and returns early otherwise, because `renderAll` runs on
every clock adjustment and re-writing the markup restarts every entrance
animation on the card. And the seasons table sets `align-content: start` with
a fixed row height rather than letting the grid stretch: at seven seasons
stretch looks right, at Evan's three it spread four rows a hundred pixels
apart. A short career ends early and says `IN PAMS SINCE 2023` under it.

**Four things about this layout that were got wrong once each.** The round
band's chips are two lines, year and pick over player and position, because on
one line the pick number left so little room that most of a round came out as
`Travis Eti…`; they also grow into the row (`flex: 1 1 auto`, capped at 26u)
rather than sitting at their content width, which bunched seven of them at the
left with a third of the canvas empty after the last. The title column in the
career strip takes a flat tint, not a gradient — it is five separate grid
cells, so a vertical gradient restarts in each one and the lit column comes out
banded in five steps. The cut-outs in the bottom band are the one place on this
screen where a portrait must not bleed past its box: that band is the last row
on the canvas, so anything hanging below it is cut off by the screen and
anything hanging above it lands on the label. And the last pick carries the
manager's cut-out only — the player's own headshot was in there too and at that
size a headshot is a thumbnail of a helmet next to the name that is already
being read.

**The career strip counts playoff trips off the ledger, not off the
directory.** Mason's two sources disagree — the dossier gives him four berths
and a 3-4 record in them, `managers_directory.json` gives him three trips and
a career record two losses shorter — and the seasons table would have shown
four seeded years beside a strip saying three. `selftest.html` asserts that
Mason is the only row where they disagree, so if a second name ever turns up
in that line something has moved in the dossier.

**All-time and the regular season are different numbers and are labelled as
two.** `career.record` is every game a manager has played, playoffs included;
the W-L column in the seasons table is the regular season alone. Ricci is
51-53 in the strip and 46-50 down the table, and the 5-3 between them is in
the strip as well, so all three agree if anybody in the room adds them up.

**Pick length is set from the console and lives in state.** `pickMs`, with
1:30 / 2:00 / 3:00 / 5:00 under the clock controls — the early rounds are worth
five minutes and round twelve is not. Pressing one restarts whatever clock is
running, because changing the length and then watching the old one run out is
never the answer. Null means the league default in `meta.json`.

Rounds 1-4 are worth that ceremony. After that flip the console to **Live
Feed**: everyone drafts in Sleeper as normal and the board keeps itself current
off the Sleeper API with nobody pressing anything.

## Why it runs smoothly

Written down because every one of these is the kind of thing that gets quietly
undone by a later edit that looks harmless.

**Panels only rebuild when what they say has changed.** `renderAll()` runs on
every write to the state document and every pick that lands — pause, resume,
adjust the clock, absorb a pick off Sleeper — and every one of those used to
re-`innerHTML` the whole board: seven lists, and upward of thirty `<img>`
elements thrown away and made again, each one a fresh cache lookup and a fresh
decode. That is the lag: not drawing the board once, but drawing it again for
no reason. `changed(id, key)` in board.js guards each panel with a key
describing what its content depends on. It also stops the panels' entrance
animations restarting on every state write, which is the other half of what
made the board feel twitchy.

The keys use `picksRev`, a counter bumped on every picks snapshot, not
`PICKS.length` — undoing a pick and entering a different player in the same
slot leaves the count exactly where it was.

**The clock writes are guarded too.** `put()` compares before assigning:
`className` invalidates style whether or not the string differs, and
`textContent` tears down a text node and builds another. Five times a second
across four countdowns, that was 40 needless invalidations a second inside
cards the compositor would otherwise never touch.

**The graded set is baked, not filtered.** THE PICK IS IN, the two
announcements and the showcase all sat on `bg/stage.webp` under
`hue-rotate(-14deg) saturate(.82) contrast(1.14)` — three full-screen filtered
layers, each of which had to be re-rasterised in the frame it was switched on,
which is a hitch you can see at the top of a beat. That exact chain is baked
into `bg/stage-graded.webp` offline (see the numpy in the commit that added
it), verified against Chrome's own output at a mean difference of 0.26%.

**Both backdrops are 1920x1080 now**, the canvas's own size, so `cover` is not
resampling on every paint, and re-encoded: `bg/stage.webp` went from 1.4MB to
102KB at a mean difference of 0.38%, which is nothing on a television. The
1.4MB master is kept at `source/stage-master.webp` — regrade or re-encode from
that, not from the shipped file.

**Nothing waits on the network while it is on screen.** Player photographs and
crests come off sleepercdn, and the first time either was asked for was the
frame the selection graphic was painted in. `warmPending()` pulls the pending
player's photo and crest the moment `pending` appears in state — which is
while THE PICK IS IN is still up, seconds ahead of when it is wanted — and all
32 crests are fetched once at boot.

**No `backdrop-filter` anywhere.** There was a `blur(6px)` on the three bottom
band cards doing nothing you could see (the fill above it is 93% opaque) and
costing a great deal: a backdrop filter makes the element a backdrop root, and
everything behind it is re-blurred whenever anything in front of it moves.
Three of them sat under a countdown that ticks five times a second.

**The band cards and the rail are `contain: layout style paint`.** A list
rebuilding inside one has no bearing on the layout of anything outside it, and
saying so keeps the browser from checking.

## Why it can't get out of sync

Every screen polls `GET /v1/draft/1304235037553590272/picks` every 4 seconds.
Any pick Sleeper knows about that the board does not gets absorbed
automatically. So:

- If a phone dies, draft in Sleeper — the board catches up.
- If the app dies completely, draft in Sleeper — nothing is lost.
- If someone drafts straight in Sleeper during ceremony mode, the board shows
  the reveal anyway instead of waiting for a phone that isn't coming.

A player can never land on the board twice: the phone re-checks before
submitting and the console refuses to announce a duplicate.

## Rooms

Everything is namespaced by a `room` query param, default `2026`.
`board.html?room=sim` etc. points at a throwaway copy. Use it to rehearse.

- `selftest.html` — 62 assertions over snake order, roster needs, value
  verdicts, position runs, the history join, and the showcase's ledgers: that
  every career reconciles, that a seed only exists for a season he made the
  playoffs, and that Mason's 2021 is the corrected row. Open it, read the list.
- `simdraft.html?room=sim&picks=24` — drives a fake draft into the sim room so
  you can see a populated board. It refuses to run against room `2026`.
- `clocktest.html?room=sim` — drives the real console in an iframe and checks
  what the clock actually does: held at the turn of a round, started on the
  reveal mid-round, carried through Next Pick. Worth having because a held 2:00
  and a 2:00 that started a second ago look identical on the board.

## Refreshing the data

```
npm run dev          # in another terminal, the board order comes from TSC
python3 build_draft_data.py
```

**The dev server matters.** Player order comes from TSC's own consensus board
at `/api/mock-board?scoring=ppr&qbs=1`, which blends ESPN, Sleeper ADP and
FantasyPros for a one-quarterback league. Sleeper's raw `search_rank` is a
search-popularity list, not a draft board: it had Josh Allen 4th overall
because superflex and dynasty players search quarterbacks constantly. The
consensus puts him 29th, which is right. If the server is not up the script
still finishes, warns loudly, and falls back to `search_rank` with the
quarterbacks too high. Set `TSC_BASE` to hit production instead.

It writes four files (and reads a fifth, `source/seasons.json`, written by
`build_seasons.mjs` — see the showcase section):

- `players.json` — 1,828 draftable players, consensus order for the top 340 and
  Sleeper order behind them, positional ranks, rookie flags
- `history.json` — 400 of those players mapped to every time PAMS drafted them,
  2019-2025
- `managers.json` — the twelve, Sleeper identity joined to PAMS career record,
  titles, draft tendencies and the season-by-season ledger the showcase reads
- `meta.json` — league format

## Manager identity

PAMS history is keyed to NFL.com user ids, Sleeper uses its own, and the
display names are actively misleading: `Cnnr430` is **Connie**, Connor drafts
as `Atkinsson`. The mapping is `MANAGER_MAP` in `build_draft_data.py`,
confirmed by Joey 2026-08-19. Key on the ids, never the handle.

**Luke has not joined the Sleeper league yet.** He is hardcoded into draft slot
9 with his full PAMS history, and `refreshLateJoiners()` in `core.js` binds him
to his Sleeper account automatically the moment he joins — the board checks
every 60 seconds. Nothing needs rebuilding.

## Why it does not stretch on a television

The board is a **fixed 1920x1080 canvas** (`#frame`) fit to whatever screen it
lands on by a single factor in `fitFrame()`. Every dimension inside it is a
multiple of `--u` (10.8px, one old vh) or `--uw` (19.2px, one old vw), so the
whole broadcast scales as one piece and is proportionally identical at any
size, letterboxing onto the set rather than reflowing.

It used to mix `vw` and `vh` units, so mirroring a 16:10 laptop onto a 16:9
television pulled the cards out of proportion. Verified at 1680x1050, 1920x1080
and 2560x1080.

**The fit is `zoom`, not `transform: scale()`** (2026-08-19). A transform
paints the frame at its native size and resamples the bitmap down, and the fit
factor is essentially never a clean number — a 1512-wide laptop gives
0.7875 — so every 1px border lands on a fractional device pixel and blurs.
That read as "the cards aren't crisp." `zoom` changes the box's used values
before layout instead, the same as multiplying every length in the stylesheet
by it, so the browser lays out and rasterizes directly at the final size: no
resample, no softness. Falls back to `transform: scale()` for browsers without
`zoom` (Firefox before 126) via `CSS.supports("zoom", "1")`.

Two things this makes easy to get wrong:
- The frame is pinned with `position:absolute; top:50%; left:50%` and centred
  by `translate(-50%,-50%)`. That percentage resolves against the frame's own
  post-zoom box, which is why centring still works after switching from
  `scale()` — but it means centring depends on `zoom` being applied *before*
  the translate is read, not after.
- `body.board::before/::after` (the set and its wash) stay in real viewport
  units so they fill the letterbox. Do not convert those to `--u`, and do not
  put them inside `#frame` or `zoom` will scale them too.

## Design

The set is `bg/stage.webp`, fixed behind the whole page, with every panel
floating over it at `rgba(5,10,18,.82)` so the header, board and ticker share
one room. Four type families do four jobs: **Archivo 900/62%** for the loud
moments, **Barlow Condensed** for anything you read, **IBM Plex Mono** for
every number and label, and **DM Serif Display** wherever the board is being
TSC rather than a broadcast (the masthead, the power-rank numeral). All
self-hosted in `fonts/`, ~240kb total.

A fifth face does exactly one job: **Anton**, digits only, for the giant
outlined pick number on THE PICK IS IN. Archivo draws `1` with a full base
serif, and at that size the foot is a wide bar that reads as part of the design
and drags the pair left of where the eye puts its middle. Anton's `1` is stem
and flag, it is the same kind of heavy condensed grotesque, and its narrow `1`
advance puts the ink of a number like "12" in the centre of its own box, which
is what the round-and-pick line above it is centred on. `anton-digits.woff2` is
1.3kb; if the numeral ever needs a letter, resubset it.

**The fonts were broken from the start and nobody noticed for weeks.** The
original `archivoblack.woff2`, `archivo-cond-900/800.woff2`,
`barlowcond-*.woff2` and `plexmono-*.woff2` were bad subsets: 109-161 glyphs
each and **not one Latin letter or digit between them**. Every headline,
every name, every number on this board was silently falling through to
Helvetica and Menlo. It looked plausible enough that the only symptom was
people saying the type "could be better."

If you ever swap a font file here, check it actually has letters:

```
python3 -c "
from fontTools.ttLib import TTFont
f=TTFont('fonts/archivo-var.woff2'); cm={}
for t in f['cmap'].tables: cm.update(t.cmap)
print(sum(1 for c in 'ABCXYZ0123456789' if ord(c) in cm), '/16')"
```

Or in the browser, render text in the family and compare its measured width
against Helvetica: if they match to the tenth of a pixel, the webfont is not
loading. `document.fonts.check()` is not enough on its own, because with
`font-display: swap` an unused face reports unloaded whether it is broken or
merely idle.

Two consequences of the fix worth knowing. Archivo is now **one variable
file** with real `wght` (100-900) and `wdth` (62-125%) axes, so
`font-stretch: 62%` genuinely condenses instead of being ignored; there is no
separate "Archivo Black" family any more. And `font-stretch` values below 62%
are outside the axis and clamp silently, so 55% and 50% were rewritten to 62%.
For a slant, use `font-style: italic` (Chrome synthesises it); `oblique
<angle>` is silently ignored for a webfont whose `@font-face` declares no
style.

Two rules the stylesheet obeys, both of which came from things that looked
wrong on a television:

1. **No glow on content.** Light lives in the room, never as a halo on text.
   Position colours are desaturated twice over so the roster slots read as ink
   and not as a video-game HUD.
2. **Every list is a fixed-column grid,** so positions, teams and ranks line
   up down the page instead of drifting with name length.

**Bare state classes in this stylesheet are landmines.** `.idle` is the
pre-draft screen and it is written bare — `.idle { position: absolute;
display: none }` — so anything else that borrows the word vanishes. The
next-up card's stopped clock did exactly that: `.next-clock.idle` matched
`.idle` too and the countdown disappeared instead of greying out. It is
`.held` now. Check `grep -nE "^\.(idle|warn|panic|paused|new|first)" draft.css`
before naming a state class.

**Three traps that will silently come back:**

- A blanket child rule (`body.board > *`, `.sel-body > *`) outranks
  `position: fixed`/`absolute` set on a class, because it wins on specificity
  or source order. It turned the backdrop into a grid item and threw the whole
  board off screen, and separately dumped the giant pick number into the flow.
  Lift specific children by class, never with `*`.
- **Full-stage overlays must be opaque.** At `rgba(...,.9)` the on-clock name
  and timer ghost straight through the reveal on a big screen. Each overlay
  carries the set image itself so the room still shows without letting the
  layer underneath bleed.
- **DOM assertions pass while the page is visually destroyed.** Screenshot the
  board at 1920x1080 after any layout change.

The ticker is a **queue, not a loop**. Each section flies up into place,
crosses once, and hands over to the next when its last entry clears the left
edge: the current round's twelve slots (on the clock, on deck, blanks), then
the top twenty still available, then every pick once a round is done. Nothing
repeats, so round one never sits there cycling the same two picks.

**The fly-up and the cross used to be two animations on one `transform`**
(fixed 2026-08-19). CSS resolves that by letting the later animation in the
list own the property for its whole active span, backwards-fill included — so
`cross`'s `.5s` delay silently overrode `flyUp` for the entire time the
vertical entrance should have been playing. Split onto two elements now:
`.ticker-lift` (wraps the track, plays `liftUp`, vertical only) and
`.ticker-track` itself (plays `cross`, horizontal only). Two elements, two
properties, no fight. If the ticker ever needs a third motion, give it a third
element rather than a third animation on an element that already has one.

**The round wall is the draft board**, laid out like Madden's: all twelve
slots of the round in progress, filled tiles carrying the manager cut-out,
the player's own NFL photo once he's picked, the current pick lit gold and
the next flagged (deliberately quiet — a faint blue tint, dim label, nothing
that competes with gold for the eye). It lives in `.rail` now (2026-08-20,
moved from a strip under the clock), two tiles across and six deep, running
the full height of the right side — which is also why it stays visible
through the reveal instead of getting covered by `.reveal`: `.rail` is a
sibling of `.stage`, not inside it.

**At the turn of a round that card is about the round.** No clock has started
yet, so `.bb-next.turning` swaps the name-and-countdown layout for the round
numeral — same Anton face and lean as the round card and THE PICK IS IN —
under STARTING SHORTLY, with the man who leads it off small beside it.

**The band swaps best available for the next man's clock during a reveal.**
`.bb-ba` and `.bb-next` are the same slot in the bottom band, traded on
`body.phase-details`: who is left while the draft runs, who is up next while a
reveal is on screen — name, pick number and a clock the size of the one a
broadcast puts under the pick that just happened. The board's own timer is
behind the reveal at that moment, which is the whole reason it is there. The
reveal itself picks up what the band gave away: `.reveal-also` lists who is
left **at the drafted player's position**, beside the history box that used to
sit alone with half the screen empty next to it.

**That card says whose clock it is before it shows the clock.** For the first
2.6 seconds of a reveal it reads `IS NOW / ON THE CLOCK` where the countdown
goes, and the numbers land after (`cueNextOnClock()`, `.bb-next.cue` and
`.bb-next.ready` in the CSS). The clock has in fact been running since the pick
was revealed — this is what is drawn, not what is true, and nothing is held up
by it. It is the one handover in the draft that used to happen silently: a
countdown on the card one frame and a different countdown the next. No cue at
the turn of a round, because there is no clock there to introduce.

The cue wraps to two lines and is capped at 14u for a reason: the countdown it
stands in for is four characters wide, ON THE CLOCK on one line is three times
that, and this card sizes its name column off whatever is left — so the cue was
squeezing MASON down to `MA…` for as long as it was up.

**The plate behind it is art, not CSS.** `bg/smallclock.webp`. It used to be
seven gradient layers plus a masked pseudo-element approximating angled planes
over a gold dot field, and it looked like an approximation. The image happens
to land within four percent of this card's own aspect ratio, so
`background-size: 100% 100%` fills it without cropping the gold border off the
edges or distorting the diagonals enough to see.

**Nothing is laid over it.** There was a scrim on it briefly — a wash down the
left, a corner vignette — carried over from when this card was a CSS
construction that needed help seating its type. It is a photograph of a plate
and it is already dark where the type sits, so it runs at the brightness it was
delivered at. If type ever stops reading on it, move the type, don't dim the
plate. The card is also padded harder on the right (4.2u) than the left (2.2u):
the plate's own gold border sits about 3% in and the countdown was almost on
it, while the cut-out on the left is a cut-out and can run to the edge.

**Two nudges on the conference chip are optical, not geometric.** The row
centres the chip's box on the team name's line box, and a line box carries
descender space the capitals never fill — so a chip centred in it hangs below
the baseline and reads low. A `margin-bottom` lifts it by half itself and a
tight `line-height` stops it standing so much taller than the letters. Judge it
against the baseline of the words beside it, not against the box.

**The lineup carries where each player was taken** — `1.12`, round and pick in
the round, between the name and the team, in the same shorthand the ticker, the
pick log and the wall all use. `pickLabel()` in board.js. The column exists in
both grid definitions for `.lu-row`: the standalone one and the `.bb-lu`
override that divides the band card. Miss the second and the team abbreviation
wraps onto a row of its own.

**The lineup and Still On The Board are the bottom band**, not the rail
(2026-08-20, swapped with the wall). Two cards side by side under the clock,
in `.stage`, so they *do* get covered by `.reveal` during the ceremony — the
wall picked up the "stays visible" job when the two traded places. One
`.bb-lu` panel shows whoever the draft is currently focused on — on-the-clock
manager while the timer runs, same manager with the new pick through the
reveal — replacing what used to be a `.clock-wrap` column plus a separate
reveal-only duplicate.

**The power rank is a badge, not a fact line.** It used to sit in the same
small-caps list as "2025 rd 4" and "next pick," which buried it. `.rank-badge`
next to the name in `.clock-id` instead, set the way the live Power Rank
page's podium hero sets one: a tracked mono label over a gold serif-italic
roman numeral with a full stop. That page is the reference; match it rather
than inventing a new treatment. No "of 12" on it, and the roman numeral is the
rank itself, not decoration behind a digit.

**The board uses TSC's masthead.** `.hdr-kicker` + `.hdr-title` are the same
shape as `.nav-kicker` + `.nav-title` on the site: mono kicker, DM Serif
Display line, `em` goes italic gold. `fonts/dmserif-*.woff2` are subset from
the TTFs in `public/og/fonts` that the OG renderer already ships.

**The three screens never say the same thing twice.** A pick shows the
manager's line on the clock (`onClockLine`), then a line on the selection
graphic (`selectionLine`), then the writeup under the reveal (`pickLine`) —
and the writeup used to open with the same stakes sentence that had been under
his name for the whole two minutes before it, with the graphic's angle repeated
in the middle. `selectionAngle()` is now the single place that decides what the
graphic says; `pickLine` reads it and starts from whatever is left, working
down: where the pick landed against the board, what he did in this round last
year, history on the player, a run on the position, and only at the end the
shape of his roster — stated as what he has, never as what he still needs,
because what he still needs is the on-the-clock line.

**A needs list is only worth saying when it is nearly closed.** `onClockLine`
used to read the whole thing out from round two on — "still needs a
quarterback, a running back, two receivers and depth after that", about a man
who had made one pick. It names them at two holes or fewer; above that it says
what he took in this round last year, or what is on the roster. `clockAngle()`
is that decision, and `pickLine` reads it too so the writeup never repeats it.

**The writeups in voice.js are checked against `source/dossier.json`.** Two
traps, both of which shipped once. A career total is not a since-the-title
total: Isaac has four playoff trips in six seasons but only two in the three
seasons since his 2022 ring, and "four of six seasons since" a title four
years ago is impossible. And a tie is not a lead: Sean and Mason are both
56-40, so neither has "the best record in PAMS." Recompute from the ledger
before writing a number. **No em dashes in any rendered copy, anywhere.**

**Two full-screen announcements, queued.** `.announce.oncard` ("X is now on
the clock", 5.2s) and `.announce.roundcard` (the round numeral, its pick range
and the order it runs in, 4.6s) are siblings of `.selection` and cover the whole
frame the same way. `showAnnounce()` queues them, because the last pick of a
round fires both at once and they would otherwise paint over each other; the
round card leads and the on-the-clock card follows. `lastRound` is seeded from
the first state the board sees, so opening the page mid-round doesn't play a
card at whoever is watching. Both sit on the same graded, vignetted set THE
PICK IS IN uses, with a wash over it that beat does not need — they carry a
great deal more small type than it does.

**The round card is the pick-is-in idiom at lower volume**: the numeral hard
left in Anton, leaning, gold leaf and solid where the pick number is a
hairline outline, and the round's twelve slots on the right in the order they
will actually run, six down each column, the leadoff slot lit with his cut-out.
Both columns are sized to their content and the pair centred; at full canvas
width the two columns of names sat half a screen apart.

Everything on it is set a size up from where it started (2026-08-22): sized to
read on a laptop, it left a quarter of a 1920x1080 television empty on three
sides, which on the one card in the draft that is nothing but a number and a
list is the whole design. ROUND is also centred over the numeral rather than
over its own box, which is not the same thing twice over — `letter-spacing`
hangs a tracking gap off the last letter, which walks the word left of its own
middle, and the numeral under it leans, which puts the top of the digits (the
part the word sits against) right of where they start. `text-indent` hands the
tracking back and `left` covers the lean.

**The wall and the ticker hold the old round through the last reveal of it.**
Both point at `boardPick()`, not `nextOpenPick()` directly: normally the next
open pick, so a slot lights the moment one lands, but while a reveal is up and
the next open pick belongs to a new round they stay on the round that just
finished. Otherwise the twelfth pick of round one is still on screen while the
wall and the ticker have both moved to round two — announcing the new round
before the round card gets to.

**No gold rail on the manager's card there.** The rest of the board hangs a
name off one, and this card had one too — drawn top to bottom as part of the
build. THE PICK IS IN is the one screen with the set showing through behind it
rather than a panel, and a floating vertical bar over a photograph of a room
reads as a graphic that has come loose. The cut-out and the name carry it.

**THE PICK IS IN hides the chrome.** `.pickin` is a direct child of `#frame`,
beside `.selection`, so `inset: 0` covers the whole 1920x1080 canvas, header and
ticker included. It used to live inside `.main`, which does not reach the edges:
fading the header and ticker out on `body.state-pick_in` then left two dead
bands where they had been.

**The round wall counts positions in draft order, not board order.** The chip
on a filled tile is where that player sits in the run on his own position as
drafted (the second back off the board is RB2 there), built in
`renderRoundBoard`. Everywhere a player has *not* been drafted yet — best
available, the available ticker strip, the phone — the same-looking chip is
his preseason positional rank off `posrank`. Two different numbers that can
disagree for the same player, on purpose.

**The 2026 schedule lives in `data/schedule.json`.** Fourteen weeks, six games
a week, built from the schedule artifact and validated on load (every manager
plays exactly once a week, twelve managers, rivals derived from week 11).
`core.js` exposes `week1For()` and `rivalOf()`; the on-the-clock card uses
both. It is the one data file the board tolerates missing: a failed fetch
degrades to no schedule facts rather than taking the page down.

## Hosting

Lives at `tsc/public/draftday/`, so it deploys with TSC on Vercel and needs no
build step of its own. URLs:

| | |
|---|---|
| hub | `/draftday/` |
| the TV | `/draftday/board.html` |
| your console | `/draftday/control.html` |
| the managers | `/draftday/pick.html` |

**`src/proxy.ts` has a `PUBLIC_STATIC_TREES` entry for `/draftday`.** Without
it the middleware matcher — which exempts `html` and images from auth but not
`js`, `css` or `json` — bounced every script and data file to `/login`, which
broke the board completely. That entry also rewrites `/draftday/` to
`index.html`, which `next dev` does not do for `public/` on its own. Don't
remove it.

State lives in Firestore project `ffootball-1ffa4`, collection `pams_draft`.
That is the only part of the stack that is not Supabase; it was kept because it
was already built and proven, and it is a CDN import inside static files, so it
adds nothing to `package.json` and nothing to the TSC build.

`source/` holds the frozen 2019-2025 PAMS draft history the build script reads.
It is vendored deliberately: completed drafts never change.

`cutouts/` are the twelve cut-out portraits from the power rankings, trimmed to
the subject and resized to 620px tall (0.6mb for all twelve). They stand in the
light on the on-the-clock screen and label the roster panel. `cat.png` in the
source folder is Connor and is renamed on the way in. Regenerate them from
`~/Desktop/pams 2026 power rankings/cutouts/trim` if the originals change.

`fonts/` are self-hosted subsets of Archivo (variable), Barlow Condensed, IBM
Plex Mono, DM Serif Display and Anton. Self-hosted on purpose so draft night
never depends on Google Fonts being reachable.
