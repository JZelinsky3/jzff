# Instagram artboards

Four things live here, all 1080x1350 (Instagram's 4:5), all rendered
from HTML with headless Chrome so they can be re-cut at any time
instead of being one-off image files.

| | |
|---|---|
| `triptych.html` | the three pinned posts that read as one nameplate across the top of the profile |
| `cover.html` | the reusable cover for every other post, with a swappable section label and accent colour |
| `offseason.html` | the eight-slide offseason carousel, six things to run before Week 1 |
| `tour.html` | the fifteen-slide site tour, for somebody who has never heard of us |
| `brand.css` | shared palette, surface layers and type roles, mirroring `src/styles/main.css` |
| `render.sh` | renders to `out/` |

Open any of them in a browser to preview. Query params are listed at
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
./render.sh tour            # all fifteen
./render.sh tour 7 12       # just those two, while iterating
```

Fifteen slides for somebody who has never heard of the site.

| | |
|---|---|
| 01 | the cover |
| 02 | section plate: The Almanac (the shelf, platforms, ledger tape) |
| 03 | Standings / Seasons |
| 04 | The Record Book / The Draft |
| 05 | The Managers / The Rivalries |
| 06 | The Chart Room / The All-Time Team |
| 07 | section plate: The Live Season |
| 08 | Matchup Preview / Pick'ems |
| 09 | Power Rankings / Best Coach |
| 10 | Records Watch / Milestones |
| 11 | The Trade Desk / The Rumor Mill |
| 12 | The Games / The Clubhouse — **to be split into two slides** |
| 13 | contents |
| 14 | 30 days free, `FIRST50` |

Slides 4–14 are still on the old flat treatment. They are being
reworked a few at a time; converting one means giving each half a
`page` key from `PAGES` and checking the figure still fits the
narrower volume. When 12 splits, `TOTAL` goes back to 15 and every
folio changes, so re-render the whole deck on that pass and bump the
`seq 1 14` default in `render.sh`.

**There is no how-it-works slide.** An earlier cut had one at 02
("one league ID, what came back, how it goes") and it was deleted: a
tour does not need an instructions page, and the only part of it
worth keeping — the first-sync figures — is now the ledger tape on
the section plate.

### Every page is its own colour

The deck used to run navy over the whole almanac and moss over the
whole live season. The site does not do that. Every chapter page
declares its own ground in its own `:root`, and they are wildly
different stocks: the Record Book is green felt, the Draft Annual is
black cloth, the Seasons are mahogany, the Rivalries are black and
red, and Standings, the Manager File and the Power Rankings are
printed on cream. Running two colours over twenty pages threw away
the one thing a rebuild in HTML can get exactly right.

`PAGES` in `tour.html` carries the real pair — `cloth` (the page's own
background) and `foil` (the accent it stamps with) — plus `src`, the
file each came out of. **Anything added there is read off the page,
never picked.** Grep the page's `:root` and copy the value.

### Bookcloth, foil and shelves

Three pieces of vocabulary, all of them binding rather than print:

* **`.cloth`** — woven bookcloth, two crossing hatches over the cover
  colour, fine enough to read as texture and not as a pattern.
* **`.stampfoil`** — real foil instead of flat gold: a raking metallic
  gradient clipped to the letterforms with a hard shadow under them.
  The shadow has to be a `filter`; the text clip eats `text-shadow`.
* **`.shelf`** — a section plate is a shelf, not a bulleted list. Each
  chapter stands as its own volume in its own cloth, so the section
  reads as a row of different books at a glance. `spine()` builds one
  from a `PAGES` key, and the plate falls back to the old `.chaplist`
  for any plate not converted yet. Light stocks take `.pale`.

  **Six spines, not ten.** At ten they came out 85px wide and the
  shelf read as a barcode. The four left off (the Manager File, the
  Chart Room, the Mock Room, the All-Time Team) all open off volumes
  that are on the shelf anyway. The deck line does not claim a count,
  for the same reason the tape does not.

  Spines are a **fixed width, centred**, not stretched to fill the
  column: at full width they went wide and flat and stopped reading as
  books. They carry no definite article either — *Standings*, *Record
  Book* — because "The" six times down a shelf is just noise.

  **No recess behind them.** A dark panel boxed in behind the books
  made the shelf look cut out and pasted onto the slide. They stand on
  the room's own wall now.

### The cover

Slide 1 is the closed book, not a front page. The broadsheet version
carried a masthead bar, a six-item wire and a three-column contents
strip — about a hundred and twenty words — and still left a band of
dead cloth across its middle, because none of that is what stops a
thumb. It is now the binding seen head on: spine and hinge at the
left, gilt fore-edge at the right, a blind-stamped frame, the
nameplate in actual foil, and five short lines in total. Everything
cut from it is said later in the deck anyway.

It carries no running head and no folio strap. A cover is not a page.

The seal hangs at the **foot** of the board, not under the deck.
Trailing the deck it left 250px of bare cloth beneath it and the air
read as a mistake; pushed down over the imprint, the same air becomes
the margin a cover is supposed to have.

### Every slide names its own surface

Each slide sets `ground:` and gets a `.ground.g-<name>` layer. **Do
not run one ground under the whole deck.** Two cuts tried it — first a
brown leather desk everywhere, then a panelled wall everywhere — and
both made fourteen boards read as fourteen of the same board. The
walnut version was doubly wrong: there is almost no brown anywhere on
the site, so wood under every slide looked like somebody else's brand.

A surface is only right for the thing standing on it. Pick one from
where you would actually find a book, a newspaper or an almanac:

| | | |
|---|---|---|
| `g-shelf` | 02 | dim library, warm lamp pool, the wooden plank |
| `g-stone` | 03 | dark warm charcoal, near-zero chroma, lit from above |
| `g-kraft` | 04 | archive-folder board, mid-tone, soft grain |
| `g-news`  | 05 | newsprint, light, with a fold crease |
| `g-slab`  | 06 | neutral dark, for plates to sit on |

### The colour rule

**When the objects carry the colour, the ground goes neutral.** Near
zero chroma, and either far darker or far lighter than what sits on
it. Two saturated hues facing each other is how a board ends up
reading as a flag or a holiday, and this went wrong three times before
the rule got written down:

* **Green baize under cream and mahogany.** Mahogany is a dark
  red-orange, so a green field under it is a straight complement
  pairing, and cream on any saturated hue picks up a cast. It is
  low-chroma warm charcoal now (`g-stone`).
* **An oxblood border on that green.** Saturated red frame, saturated
  green field. Christmas. Gone, along with the wood border round the
  cork: both turned the sheet into a picture frame that had nothing to
  do with the page inside it. **Grounds run to the edge.**
* **Orange cork under a green volume.** The same complement problem,
  and the grain was coarse enough to read as sandpaper. Pulled down to
  a low-chroma kraft board with softer speckle.

Which way to go, darker or lighter, is set by the volumes. `g-stone`
is dark because its two are cream and mahogany. `g-kraft` is mid-tone
because both of its two are near-black and need the ground to separate
them.

**Mid-tone grounds need dark chrome and a shallow falloff.** Set
`ink: 1` to put `.is-ink` on the board; it flips the running head and
the foot to ink and kills the vignette, the wash and the ledger lines.
Those values are tuned to survive on `g-kraft`, not just on paper — on
the first pass they were newsprint-only and the foot strap vanished. A
heavy bottom vignette does the same thing, so a mid-tone ground falls
off shallowly.

**One section runs light.** Fourteen dark boards in a row go flat no
matter how well each is lit, so 04 and 05 lift the deck out of the
dark before it drops back for the live season.

**Texture has to be coarse.** The first cork was one fine-grained
noise layer and it rendered as a flat tan gradient: the deck draws at
2x and downsamples, and anything near 1px of noise averages itself
away on the way down. It is two layers now, dark grains over light
ones, both well above 1px.

### Two ways to draw a chapter, and counting

`treat:` on a slide picks one. **Do not let the whole deck run on
one.** Fourteen bound volumes in different colours is the same
mistake as one ground under every slide, a layer up.

* **`.plate`** (`treat: 'plate'`, slide 06) — a flat field of the
  page's own colour with a hairline inset and nothing else: no cloth,
  no binding, no frame. It is also laid out differently, which is the
  actual point: the header runs **across** the top with the title and
  dek on one line and the figure takes the full width underneath,
  instead of a header column beside a figure column.

  Use it on a pairing whose two pages differ in value. Two navies on a
  neutral ground just go muddy — which is why the All-Time Team is
  keyed to its **paper** stock in `PAGES` rather than its navy chrome.
  The lineup really does print on paper on that page, and it gives the
  slide a cream plate against the Chart Room's dark one.

* **`.vol`** (the default) — a chapter as a bound volume lying open:
  its own cloth, a sewn binding down the inner edge, a soft shadow
  cast on the leather. `--cloth` and `--foil` come from `PAGES`, and
  the volume overrides the ink roles so every figure inside picks up
  the page's colours. Cream stocks take `.pale`, which flips the ink
  and re-cuts the weave — the dark hatch that whispers on navy reads
  as corduroy on cream.
* **`.tape`** — what a league gets, as a strip of till roll across the
  foot of a section plate, with a full-width head bar in the almanac's
  own ink and equal cells under it.

  **It does not carry counts.** It used to say "7 seasons, 1,092
  games, 812 picks", which read as a spec sheet and, worse, implied a
  league needs some number of them before any of this is worth having.
  It says what is covered instead — *Every season, Each matchup,
  Entire drafts* — and no two cells lead with the same quantifier.
  Keep entries to two short words: `.v` is `nowrap`, and anything
  longer hyphenates and stops the strip scanning.

  The same rule killed the bare **7** that used to be the Seasons pull
  and the bare **66** on the Rivalries. A number alone on a line reads
  as a requirement.

  It does not want replacing with something cleverer, either — "Its
  own page" was a worse answer than the number. Say the plain fact:
  **Every year**, *back to your first season, not just the recent
  ones*. The point is that the record is not recent memory, so say
  that.

  Nobody outside the build knows what a "manager file" is, so that
  cell reads **Every manager** now.

**Figures have to be re-fitted when a slide becomes a volume.** A
volume costs about 90px of usable width against the old full-bleed
half (binding, padding, the gap between the two books), so `.vol .hd`
runs narrower and the column rails tighten. The Standings lost its
Pct column and the Seasons rail lost 4px a column and a point of type
before either fit. `.cols .c` also carries `min-width: 0` now:
without it seven columns refuse to compress, the rail runs wider than
the volume, and `overflow: hidden` slices the leftmost season off.

### The horizontal cut

Two chapters share a page by being cut **across**, never down the
middle. The top half runs its header column on the left and its
figures on the right; the bottom half mirrors it, so the two titles
sit on opposite edges and the eye zigzags down the sheet.

The cut used to be a gilded rule. It is now the strip of desk showing
between the two volumes, which does the job better: the gap says the
two halves are separate books, which a line never did.

Vertical splits are used only **inside** a half, where two things
genuinely sit side by side. A slide split down the middle reads as
two posts pasted together, which is what the first cut of this deck
did and why it was thrown out.

### Built out of the site's own furniture, not out of cards

The first version drew every figure as a box with a border and a drop
shadow, which is not what the site looks like anywhere. The real
front page is a newspaper: regions divided by **column rules**, with
almost nothing in a container. Each piece here is lifted from a real
stylesheet and named after its source.

| | from | |
|---|---|---|
| `.agate` | `new.module.css` `.agateTable` | mono figures, serif names, a hairline under every row, no box |
| `.stat` | `main.css` `.stat` | 1px line with a 3px gold spine down the left edge |
| `.clipping` | `new.module.css` `.ledger` | cream stock, tilted a degree, hard offset shadow, double-rule head, ink stamp hanging off the corner |
| `.foil` | `new.module.css` `.mastFlourish` | the gilded rule, ends dissolving |
| `.wire` | `NewLanding.tsx` `TICKER` | invented league headlines in two columns between rules |

Before adding a figure, find the page it comes from and copy how that
page draws it.

### Page furniture

**No crop marks.** Printer's corner marks were on an earlier cut of
this deck and on the offseason deck before it, and were cut from
both: at thumbnail size, four right angles in four corners is the
single most AI-looking thing on a board. The edges carry a running
head and a folio instead, which is what a bound almanac has.

**No progress bar and no page number.** The offseason deck heads
every slide with the wordmark left, section right, and a segmented
rule under it. This one inverts that geometry so the two decks do not
read as one template: the section name runs alone across the top on a
hairline and the wordmark moves down to the foot.

A folio ("3 of 14") sat on the right of every foot for one cut and
was pulled. It is furniture a bound book needs and a carousel does
not, and at thumbnail size it just reads as a counter somebody forgot
to take off.

**The foot rotates.** `IMPRINTS` alternates the URL and the wordmark
lockup so the same strap does not print fourteen times. A third
imprint — "Vol. II, No. 118, compiled from seven seasons" — went with
the folio. It meant nothing to the person who wrote the site, so it
was never going to mean anything to a first-time reader.

**Section plates carry no kicker.** "Section one of three" under a
running head already reading SECTION ONE is the same fact twice.

**Titles are stars, and only wins.** `pips(n)` draws one ★ per title
and nothing at all for none. It used to draw a hollow circle for every
title a manager had *not* won, which turned a column of achievements
into scorekeeping against a target nobody set.

**Column heads need air.** Set tight and unruled, `Record Points
Titles` ran together and read as one sentence across the top of the
table. `.agate` now puts a rule under the head row and a 30px gap
between columns, and the labels are one word each.

**No page URLs.** An earlier cut ran `/leagues/your-league/records`
across every headline row. Fifteen slugs is a sitemap, not a poster.

### Keep the copy short

The deck is read with a thumb. Every dek is one short sentence, every
pulled figure is a number and a half-line, and nothing carries a
caption repeating what the figure already shows. When a slide felt
empty the fix was always more *figure* (a third podium, the other
games that week, bars on a rail), never more prose.

### Two things learned drawing the figures

* **A true chart can still be unreadable.** The Chart Room slide first
  plotted cumulative points, which is what the page plots, and it came
  out as five near-parallel diagonals. Nobody reads a race off that,
  and a board nobody can read is exactly what makes a mockup look
  invented. It plots points above the league average now: same data,
  lines that cross.
* **Text columns overflow, bars do not.** Three figures were rows of
  labelled text in 70px columns, and every one wrapped into a
  paragraph or crossed the column rule into the header. The seasons,
  the all-time team and the milestones are drawn as bar columns now:
  they fill the height, survive a narrow column, and say their number
  in one look.

### Names

Every figure is invented and `CAST` is the same fictional twelve the
offseason deck uses, so the two read as one imaginary league. **No
real league, manager or team name goes on a public post.**

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
