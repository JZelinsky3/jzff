# Instagram artboards

Two things live here, both 1080x1350 (Instagram's 4:5), both rendered
from HTML with headless Chrome so they can be re-cut at any time
instead of being one-off image files.

| | |
|---|---|
| `triptych.html` | the three pinned posts that read as one nameplate across the top of the profile |
| `cover.html` | the reusable cover for every other post, with a swappable section label and accent colour |
| `offseason.html` | the eight-slide offseason carousel, six things to run before Week 1 |
| `tour.html` | the twenty-slide site tour, for somebody who has never heard of us |
| `brand.css` | shared palette, surface layers and type roles, mirroring `src/styles/main.css` |
| `render.sh` | renders to `out/` |

Open either file in a browser to preview. Query params are listed at
the top of each file.

Rendering needs nothing installed: it uses the copy of Google Chrome
already on the machine, and DM Serif Display already in
`~/Library/Fonts`. Everything renders at 2x and is downsampled to
1080x1350 (the 2x originals stay in `out/2x/`). Upload the 1080 files.
Instagram re-encodes anything wider and does it worse than `sips`.

---

## The pinned triptych

```
./render.sh triptych
```

Produces `triptych-1/2/3.png` plus `triptych-spread.png`, which is the
full 3240x1350 sheet the three posts are sliced from. The spread is
for proofing only, never for posting.

**Posting order.** Instagram fills the grid newest-first from the top
left, so post them backwards: **3, then 2, then 1.** Pin them in that
same order and look at the profile. If the row comes out reversed,
unpin all three and re-pin in the opposite order; which way pinning
sorts has changed between app versions, and the grid is the only
reliable check.

**Do not** edit, crop or filter a single panel. All three are slices of
one sheet, and any per-panel change breaks the letterforms where they
meet. Change `triptych.html` and re-render all three.

### Why the words break where they do

Joey's original spec was for the cuts to fall between letters:
`The S` / `unday` / `Chronicle`. Those exact fragments cannot happen at
a single type size. "The S" is 24% of the nameplate's width but would
have to fill 33% of the row, which means the line would have to be
about 18% wider than the three tiles put together, and the T and the
final e. would run off the ends of the spread.

So `fit()` keeps the rule rather than the letters. It measures every
glyph and solves for the one size and offset that land both tile
boundaries exactly in the middle of a gap between two letters, taking
whichever solution gives the largest type with the most even outer
margins. No glyph is ever sliced. It currently resolves to 274px type
reading `The Su` / `nday Chr` / `onicle.`

If the sliced-billboard look is ever wanted instead (letters cut
through by the tile edges, which shouts "these three go together" more
loudly at the cost of tidier single posts), set `FORCE_PLAIN_FIT` to
`true` in `triptych.html` and re-render.

---

## The post cover

```
./render.sh cover --label "The Clubhouse" --accent gold --num 02 \
                  --kicker "Section" \
                  --sub "Everything you follow, behind one door."
```

Writes `out/cover-the-clubhouse.png`. Only `--label` really matters;
everything else has a default or can be left out. `--out` overrides
the filename.

The frame never changes: nameplate row, corner marks, ruled foot, the
site's navy and grain. What changes per post is the section block in
the lower left and the accent colour that runs with it, which drives
the spine down the left edge, the kicker, the rule under the label and
the section mark in the foot.

Accents are `gold`, `rust`, `steel`, `ivory`, or any hex (write `#` as
`%23`). To add a permanent one, put it in the `ACCENTS` table in
`cover.html` rather than passing a hex every time.

The label auto-fits and wraps to a second line when it needs to, so
"Leagues" and "The Clubhouse" both fill the same box. Three words is
about the limit before it gets small.

### Screenshots behind the cover

Optional, off by default, and the default is the right answer most of
the time.

```
./render.sh grab "https://thesundaychronicle.app/hub" clubhouse 430 932
./render.sh cover --label "The Clubhouse" --phone "shots/clubhouse.png"
```

`--phone` lays the grab in as an angled phone in the upper right;
`--shot` lays it in as a wider angled card. Both fade out towards the
lower left so they stay clear of the headline.

Two things were learned by trying it:

* **The phone works, the card mostly does not.** The site's own
  surface is navy, so a screenshot of it sits only a few values off
  the board it is laid on. The phone reads because its bezel gives it
  an outline; the flat card just goes muddy. If a card is used, use it
  for a page with a light or busy surface, like a chart.
* **A cover with a screenshot in it ages with the UI.** The plain
  cover stays true forever. Reach for the screenshot only when the
  post is announcing a specific feature and a sliver of the real
  interface earns its keep. For a record, a stat, a quote or a link,
  the plain frame is better and faster.

`grab` sends a phone user agent, but the site still answered with its
desktop tree, so a 430px grab overflows and clips on the right. Worth
fixing at the source before leaning on `--phone` much.

---

## The site tour

```
./render.sh tour            # all twenty
./render.sh tour 7 13       # just those two, while iterating
```

Twenty slides for somebody who has never heard of the site. Cover,
what it is, then three sections with a plate in front of each, then
two contents pages as a refresher, then the offer.

**Twenty is Instagram's hard cap on a carousel.** There is no room to
add a slide without taking one out. The current run is:

| | |
|---|---|
| 01 | cover |
| 02 | what it is: one league ID, and what came back |
| 03 | plate: The Almanac |
| 04–09 | standings, record book, managers, chart room, draft, rivalries |
| 10 | plate: The Live Season |
| 11–15 | matchups, pick'ems, records watch, trade desk, Sunday Live |
| 16 | The Games |
| 17 | The Clubhouse |
| 18–19 | contents, part one and part two |
| 20 | 30 days free, `FIRST50` |

### It wears the site's clothes, unlike the offseason deck

That deck was selling ideas, so it went poster black with condensed
caps. This one is selling the site, and a stranger should recognise
the pages when they land on them. So the type is the real thing (DM
Serif nameplates with the second half italic gold, mono labels), and
each section carries the ground its pages actually sit on:

| section | ground | from |
|---|---|---|
| almanac | navy `#0e1620` + gold | `src/styles/main.css` |
| live season | moss `#15201b` + amber | `public/demo/live/index.html` |
| Sunday Live | black `#0b0d0e` + amber | game day |
| games | slate `#101013` + per-game accents | `src/app/games/gameDefs.ts` |
| clubhouse | cream `#f3ead6` + brass | `src/styles/hub.css`, day theme |

The swipe therefore changes ground colour twice. That is the thing
that tells somebody the site has rooms rather than pages, and it is
worth more than any sentence on any of the slides. Slide 17 is the
only light one; check it against its neighbours in the grid before
posting, because it is the slide most likely to read as a mistake.

### Every number is invented, every board is real

The artifacts are redraws of boards that exist: the all-time
standings, the record book's podiums, the chart room's above-average
lines, the draft grader's class grades, the live scoreboard. The data
in them is fiction, and the cast (`CAST` in the file) is the same
invented twelve the offseason deck used, so the two decks read as the
same imaginary league. **No real league, manager or team name goes on
a public post.**

Two things learned drawing them:

* **A true chart can still be a useless one.** The chart room slide
  first plotted cumulative points, which is what the page plots, and
  it rendered as five near-parallel diagonals. Nobody can read a race
  off that, and a board nobody can read is exactly what makes a
  mockup look invented. It plots points above the league average now:
  same data, but the lines cross.
* **Half-empty cards are the tell.** Several artifacts were laid out
  with two blocks in a card tall enough for four, and the voids read
  as a template with the copy missing. Where that happened the answer
  was always more real content (a third podium, the other games this
  week, how each game plays), never bigger type.

### The two contents pages

They list *pages*, not slides, because the deck folds two or three
pages onto some slides. They are numbered 01 to 23 straight through,
which is why the numbering does not match the `§` marks in the deck.
`TOC` in the file is the source; if a page is added to the site it
goes there and in the matching section plate's `inside` list, and the
counts in `kick` / `band` have to move with it.

---

## Notes

* `out/` and `shots/` are ignored by git. Renders are reproducible, so
  there is no reason to carry the PNGs in the repo.
* Instagram's profile grid has changed shape before (square for years,
  then 4:5). If it ever reverts, the triptych survives it: the
  nameplate, the folio line and the sub-line all sit inside the middle
  1080x1080, and a square crop would take only the outer rules and the
  corner marks. The cover would not: its nameplate row and its ruled
  foot are both a little outside that square and would be clipped. If
  that day comes, pull those two rows in by about 50px.
