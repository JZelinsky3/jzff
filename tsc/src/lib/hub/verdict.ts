// Trade Room verdict + consolidation engine.
//
// Two jobs, both pure (no I/O), so the analyzer can call them on every
// keystroke-cadence analyze AND freeze their output onto the docket at
// publish time:
//
//   effectivePackageValue() — a consolidation-adjusted package value that
//     fixes the "more bodies always wins" problem of a raw value sum. Extra
//     pieces get diminishing returns (you can only start so many), and an
//     elite peak gets a small scarcity premium (one stud beats two mids of
//     equal total). Quick mode grades on THIS instead of the raw sum.
//
//   composeVerdict() — a seeded, trade-shape-aware writeup generator. Instead
//     of the old eight fixed strings, each side's read is composed from the
//     actual headline player, margin, consolidation shape, positions, and
//     league mode, drawing from large phrase banks. Seeded by the real player
//     ids so two similarly-graded trades with different players read
//     differently, on the live studio and on the docket alike.

export type VerdictAsset = { id: string; name: string; position: string; value: number }
export type VerdictMode = 'redraft' | 'keeper' | 'dynasty'

// ── Consolidation-adjusted package value ───────────────────────────────────
//
// Raw sum treats a 3rd and 4th piece as worth their full face value, which is
// how a 2-for-1 always "wins" even when the single side is the better player.
// Real rosters have finite starting slots, so we discount each successive
// piece, and reward a genuine stud peak. Both curves are monotonic (never
// reorder players within a side) and sized as a nudge, not a hammer: a real
// fleece still grades as a fleece.

// Depth decay by rank within the side (0 = the side's best piece). The first
// piece is full; each additional body is worth progressively less, floored so
// deep packages never collapse to nothing.
const DEPTH_WEIGHTS = [1.0, 0.9, 0.78, 0.66, 0.56, 0.48]
const DEPTH_FLOOR = 0.42

function depthWeight(rank: number): number {
  return rank < DEPTH_WEIGHTS.length ? DEPTH_WEIGHTS[rank] : DEPTH_FLOOR
}

// Elite scarcity premium. Values sit on a ~0-10000 consensus scale; the
// premium ramps in above ELITE_FLOOR and caps at +12% for a true blue-chip.
// This is what lets one elite asset out-value two mids of equal raw total.
const ELITE_FLOOR = 6000
const ELITE_CEIL = 9000
const ELITE_MAX_PREMIUM = 0.12

function elitePremium(value: number): number {
  if (value <= ELITE_FLOOR) return 1
  const t = Math.min(1, (value - ELITE_FLOOR) / (ELITE_CEIL - ELITE_FLOOR))
  return 1 + ELITE_MAX_PREMIUM * t
}

/**
 * Consolidation-adjusted value of a package. Sort desc, apply depth decay by
 * rank and an elite scarcity premium by value. The elite premium applies to a
 * lone stud too, so a single blue-chip can out-value two mids of higher raw
 * total. For an even 1-for-1 the two premiums cancel in the delta, so those
 * deals still read as even.
 */
export function effectivePackageValue(assets: VerdictAsset[]): number {
  if (assets.length === 0) return 0
  const sorted = [...assets].sort((a, b) => b.value - a.value)
  let eff = 0
  sorted.forEach((a, i) => {
    eff += a.value * depthWeight(i) * elitePremium(a.value)
  })
  return eff
}

// ── Verdict composition ────────────────────────────────────────────────────

// FNV-1a hash → deterministic per-trade seed. Same inputs always pick the
// same phrases (so a re-analyze is stable), but different players/margins land
// on different phrases.
function seedFrom(parts: string[]): number {
  let h = 2166136261
  const s = parts.join('|')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// A tiny seeded PRNG so a single side can draw several independent choices
// (opener, clause, closer) without them all collapsing to the same index.
function makePicker(seed: number) {
  let state = seed || 1
  return function pick<T>(arr: T[]): T {
    // xorshift32
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return arr[state % arr.length]
  }
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  const tail = parts[parts.length - 1]
  // Keep suffixes attached to the surname (e.g. "Jr.", "II").
  if (/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(tail) && parts.length > 2) {
    return `${parts[parts.length - 2]} ${tail}`
  }
  return tail
}

type Margin = 'even' | 'slight' | 'clear' | 'big'
function marginBucket(abs: number): Margin {
  if (abs < 0.03) return 'even'
  if (abs < 0.08) return 'slight'
  if (abs < 0.15) return 'clear'
  return 'big'
}

// Distinct positions in a package, in QB→TE order, for scarcity notes.
const POS_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3 }
function posSet(assets: VerdictAsset[]): string[] {
  const set = new Set<string>()
  for (const a of assets) if (POS_ORDER[a.position] != null) set.add(a.position)
  return [...set].sort((a, b) => POS_ORDER[a] - POS_ORDER[b])
}

export type VerdictInput = {
  /** Signed advantage for THIS side. Positive = this side comes out ahead. */
  pct: number
  /** 'value' = raw/consolidated value delta (quick mode). 'lineup' = starting-lineup change (roster mode). */
  lens: 'value' | 'lineup'
  mode: VerdictMode
  /** What this side RECEIVES. */
  received: VerdictAsset[]
  /** What this side SENDS (the other side's haul). */
  sent: VerdictAsset[]
  /**
   * 'full' (default) — the studio read: opener plus optional consolidation and
   * league-mode clauses, 2-3 sentences of advice.
   * 'brief' — the docket read: a single flowing sentence (~<=25 words), no
   * stacked clauses, so 50 posted cards stay skimmable.
   */
  length?: 'full' | 'brief'
  /**
   * Whose seat this read is written from. The docket + studio both frame a
   * trade as "You" (the side receiving verdict_a) vs "They" (verdict_b). When
   * set, roughly half the reads (seeded) address that seat directly as you /
   * they instead of the neutral "this side"; the rest stay neutral for mix.
   */
  voice?: 'you' | 'they'
}

/**
 * Compose a verdict for one side of a trade. Deterministic given the same
 * players + margin, but varied across different trades. 'brief' returns one
 * sentence for the docket; 'full' returns the longer studio read.
 */
export function composeVerdict(input: VerdictInput): string {
  const { pct, lens, mode, received, sent } = input
  const length = input.length ?? 'full'
  const abs = Math.abs(pct)
  const bucket = marginBucket(abs)
  const dir: 'up' | 'down' | 'flat' = bucket === 'even' ? 'flat' : pct > 0 ? 'up' : 'down'

  const headline = [...received].sort((a, b) => b.value - a.value)[0] ?? null
  const headName = headline ? lastName(headline.name) : 'the return'
  const headPos = headline?.position ?? ''

  // Consolidation shape: is this side condensing many bodies into fewer,
  // better ones (gain), or taking on the extra depth (give)?
  const countGap = received.length - sent.length
  const shape: 'consolidate' | 'spread' | 'even' =
    countGap <= -1 ? 'consolidate' : countGap >= 1 ? 'spread' : 'even'

  const seed = seedFrom([
    lens,
    mode,
    ...received.map((a) => a.id),
    ...sent.map((a) => a.id),
    bucket,
    dir,
  ])
  const pick = makePicker(seed)

  // ── Opener: margin + direction, often naming the headline piece. A single
  //    flowing sentence that stands on its own — this is the whole docket read.
  //    When a voice is set, ~half the time (seeded) address the seat directly
  //    ("You"/"They") instead of the neutral "this side."
  const voice = input.voice
  const voicedPool = voice ? VOICED_OPENERS[lens]?.[bucket]?.[dir] : undefined
  const useVoiced = !!(voicedPool && voicedPool.length) && pick([true, false])
  let line = useVoiced
    ? pick(voicedPool!)({ ...voiceForms(voice!), headName })
    : pick(OPENERS[lens][bucket][dir])({ headName, headPos, mode })

  // Brief (docket): the opener, plus a SHORT second sentence about half the
  // time (seeded), capped at 2 sentences / ~25 words so cards stay skimmable
  // but do not all read as one-liners. Lopsided-count trades get the
  // consolidation note; the rest get a short league-mode tail.
  if (length === 'brief') {
    // Even trades say it all in one line; only add a tail when there is a real
    // edge to explain, so coin-flip cards don't read redundantly.
    if (dir !== 'flat' && pick([true, false])) {
      let tail: string | null = null
      if (shape !== 'even') {
        const clause = pick(CONSOLIDATION[shape][dir])
        if (clause) tail = clause({ headName, headPos })
      }
      if (!tail) tail = briefTail(mode, dir, pick)
      if (tail) {
        const combined = `${line} ${tail}`
        if (combined.split(/\s+/).length <= 25) line = combined
      }
    }
    return line.replace(/\s+/g, ' ').trim()
  }

  // Full (studio): layer on the extra advice.
  // ── Optional consolidation clause (fires on lopsided body counts) ────────
  if (shape !== 'even' && bucket !== 'even') {
    const clause = pick(CONSOLIDATION[shape][dir])
    if (clause) line = `${line} ${clause({ headName, headPos })}`
  }

  // ── Optional mode / scarcity flavor, ~half the time, seeded ──────────────
  if (pick([true, false, true])) {
    const positions = posSet(received)
    const flavorPool = FLAVORS(mode, positions, headPos, dir)
    if (flavorPool.length) {
      const flavor = pick(flavorPool)
      if (flavor) line = `${line} ${flavor}`
    }
  }

  return line.replace(/\s+/g, ' ').trim()
}

// ── Duel verdict (mobile docket slip) ───────────────────────────────────────
//
// The phone card shows ONE writeup for the whole trade, not a read per side,
// so it can't lean on "this side" the way the two-column desktop docket does.
// This composes a single self-contained sentence that names BOTH sides by
// their headline player and says plainly who comes out ahead. One sentence,
// no consolidation/mode tails, so the slip stays short and the vote pill sits
// clean beside it.
export function composeDuelVerdict(input: {
  /** Signed edge. Positive favors the GET side (what the You seat receives). */
  pct: number
  /** What the You seat receives (side_b on the card). */
  getSide: VerdictAsset[]
  /** What the You seat sends (side_a on the card). */
  giveSide: VerdictAsset[]
}): string {
  const { pct, getSide, giveSide } = input
  const getHead = [...getSide].sort((a, b) => b.value - a.value)[0] ?? null
  const giveHead = [...giveSide].sort((a, b) => b.value - a.value)[0] ?? null
  const getName = getHead ? lastName(getHead.name) : 'that side'
  const giveName = giveHead ? lastName(giveHead.name) : 'the other side'

  const bucket = marginBucket(Math.abs(pct))
  const seed = seedFrom([
    bucket,
    pct > 0 ? 'get' : 'give',
    ...getSide.map((a) => a.id),
    ...giveSide.map((a) => a.id),
  ])
  const pick = makePicker(seed)

  if (bucket === 'even') {
    return pick(DUEL_EVEN)({ a: getName, b: giveName }).replace(/\s+/g, ' ').trim()
  }
  const winName = pct > 0 ? getName : giveName
  const loseName = pct > 0 ? giveName : getName
  return pick(DUEL_EDGE[bucket])({ win: winName, lose: loseName }).replace(/\s+/g, ' ').trim()
}

// ── Phrase banks ───────────────────────────────────────────────────────────
// Every entry is a function of the trade so the headline player and position
// can be woven in. House style: no em dashes, no emojis, no trailing arrows.

type Ctx = { headName: string; headPos: string; mode: VerdictMode }
type Opener = (c: Ctx) => string
type Clause = (c: { headName: string; headPos: string }) => string

// Duel banks — both sides named by their headline player. `a`/`b` are the two
// sides for an even deal; `win`/`lose` for one that tips.
type DuelEven = (c: { a: string; b: string }) => string
type DuelEdge = (c: { win: string; lose: string }) => string

const DUEL_EVEN: DuelEven[] = [
  (c) => `The ${c.a} and ${c.b} sides grade out about even, so fit and need break the tie.`,
  (c) => `Call it a wash: ${c.a} for ${c.b} lands right down the middle.`,
  (c) => `${c.a} and ${c.b} come out close enough that preference decides it.`,
  (c) => `Neither side is fleecing anyone, with ${c.a} and ${c.b} priced about the same.`,
]

const DUEL_EDGE: Record<'slight' | 'clear' | 'big', DuelEdge[]> = {
  slight: [
    (c) => `The ${c.win} side has the slight edge over the ${c.lose} return.`,
    (c) => `${c.win} tips it just ahead of ${c.lose}, though not by much.`,
    (c) => `A hair in favor of the ${c.win} side over ${c.lose}.`,
  ],
  clear: [
    (c) => `The ${c.win} side clearly beats the ${c.lose} package here.`,
    (c) => `${c.win} comes out comfortably ahead of ${c.lose}.`,
    (c) => `The ${c.win} return wins this over ${c.lose} by a real margin.`,
  ],
  big: [
    (c) => `The ${c.win} side runs away with it, leaving the ${c.lose} package behind.`,
    (c) => `${c.win} lands a haul the ${c.lose} side cannot match.`,
    (c) => `A rout in favor of the ${c.win} side over ${c.lose}.`,
  ],
}

const OPENERS: Record<'value' | 'lineup', Record<Margin, Record<'up' | 'down' | 'flat', Opener[]>>> = {
  value: {
    even: {
      flat: [
        () => 'Consensus splits this down the middle, so fit and timing matter more than value here.',
        () => 'The totals land in a dead heat, which makes it a fair handshake either way.',
        (c) => `${c.headName} anchors a deal that grades out essentially even on the market.`,
        () => 'Neither side is fleecing anyone, with the value coming out close to a wash.',
        () => 'This one balances out on paper, so preference breaks the tie rather than value.',
        (c) => `Even with ${c.headName} involved, the two packages settle at nearly the same number.`,
        () => 'Both sides walk away with comparable value, which is what a fair trade looks like.',
        () => 'The consensus barely separates the sides, so call it a coin flip.',
      ],
      up: [],
      down: [],
    },
    slight: {
      up: [
        (c) => `${c.headName} tips this side just ahead, though the edge is slim.`,
        () => 'This side comes out a hair in front on value, nothing worth gloating over.',
        (c) => `The margin leans this way, with ${c.headName} the piece that nudges it.`,
        () => 'A modest win on value, the kind you take quietly and move on from.',
        (c) => `Getting ${c.headName} back gives this side a small but real edge.`,
        () => 'The consensus tilts this way by a shade, more lean than landslide.',
        (c) => `${c.headName} does just enough to put this side barely on top.`,
        () => 'This side wins the margins, but only by a whisper.',
      ],
      down: [
        () => 'This side gives up a touch more than it gets, though nothing that stings.',
        (c) => `Even with ${c.headName} coming back, this side concedes a little on value.`,
        () => 'A small step back on paper, defensible if the fit is right.',
        () => 'This side trails by a shade, a fair price for the right need.',
        (c) => `${c.headName} softens it, but this side still comes out slightly light.`,
        () => 'The margin leans away here, more of a nick than a wound.',
        () => 'This side pays a modest premium, the kind a contender can stomach.',
        (c) => `Landing ${c.headName} costs a little on value, but not enough to regret.`,
      ],
      flat: [],
    },
    clear: {
      up: [
        (c) => `${c.headName} headlines a clear value win for this side.`,
        () => 'This side comes out comfortably ahead once the numbers settle.',
        (c) => `Banking ${c.headName} hands this side the better end of the deal.`,
        () => 'The math favors this side cleanly, and it is not especially close.',
        (c) => `${c.headName} does the heavy lifting on a deal this side clearly wins.`,
        () => 'This side pulls ahead by a comfortable margin on consensus value.',
        (c) => `This side lands the better of it, ${c.headName} tipping the scale hard.`,
        () => 'The edge here is real, not imagined, and it favors this side.',
      ],
      down: [
        (c) => `This side pays up for ${c.headName}, and it shows on the value sheet.`,
        () => 'This side comes out clearly light once the totals are tallied.',
        () => 'The numbers favor the other side by a comfortable margin here.',
        (c) => `Even ${c.headName} does not close the gap this side gives up.`,
        () => 'This side gives up real value to get the deal done.',
        () => 'A clear loss on value for this side, and not a narrow one.',
        (c) => `Chasing ${c.headName} costs this side more than the return justifies.`,
        () => 'The consensus marks this down for this side, comfortably so.',
      ],
      flat: [],
    },
    big: {
      up: [
        (c) => `${c.headName} anchors a haul that lands lopsided in this side's favor.`,
        () => 'This side runs away with it, stealing real value in the process.',
        () => 'The value gap is enormous, and it all points toward this side.',
        (c) => `This side walks off with ${c.headName} and a fat edge to boot.`,
        () => 'Consensus calls this close to a robbery, with this side cleaning up.',
        (c) => `${c.headName} headlines a return so rich it is not a fair fight.`,
        () => 'This side wins in a rout, and the margin is hard to overstate.',
        (c) => `Landing ${c.headName} on top of the rest makes this a runaway for this side.`,
      ],
      down: [
        () => 'This side hemorrhages value here, and it is hard to defend on the numbers.',
        (c) => `This side overpays badly, ${c.headName} nowhere near enough to balance it.`,
        () => 'A lopsided loss this side is likely to regret before long.',
        () => 'This side ships out a fortune in value and gets buried on the deal.',
        () => 'The value bleed for this side is severe, not a close call at all.',
        (c) => `Not even ${c.headName} keeps this side from getting run over here.`,
        () => 'This side comes out drastically short, with the gap a chasm.',
        (c) => `Trading for ${c.headName} at this cost sets this side back in a big way.`,
      ],
      flat: [],
    },
  },
  lineup: {
    even: {
      flat: [
        () => 'The optimal starting lineup barely flinches, making this a lateral move.',
        (c) => `${c.headName} swaps in without really changing the weekly ceiling.`,
        () => 'Starters come out roughly where they went in, so this is a depth reshuffle at most.',
        () => 'The weekly lineup lands in nearly the same place either way.',
        () => 'There is no meaningful lineup swing here in either direction.',
        (c) => `Even with ${c.headName} in the mix, the starting lineup holds steady.`,
      ],
      up: [],
      down: [],
    },
    slight: {
      up: [
        (c) => `${c.headName} nudges the starting lineup up a notch, and every point counts.`,
        () => 'The weekly starters get modestly better on this one.',
        () => 'This tightens the starting lineup a touch, a small but real gain.',
        (c) => `Slotting ${c.headName} in lifts the lineup slightly.`,
        () => 'A minor bump to the weekly ceiling for this side.',
        () => 'The starters improve by a shade, nothing dramatic.',
      ],
      down: [
        () => 'The starting lineup slips a little on this deal.',
        (c) => `Even with ${c.headName}, the weekly lineup dips slightly.`,
        () => 'A minor hit to the starters, with bench depth as the trade-off.',
        () => 'This costs the lineup a shade of ceiling, not much more.',
        (c) => `${c.headName} softens it, but the starting lineup still edges down.`,
        () => 'The weekly starters give back a little here.',
      ],
      flat: [],
    },
    clear: {
      up: [
        (c) => `${c.headName} is a real upgrade to the starting lineup.`,
        () => 'The weekly starters get clearly stronger on this one.',
        () => 'A genuine lineup upgrade that moves the ceiling for this side.',
        (c) => `Dropping ${c.headName} into the lineup clearly lifts it.`,
        () => 'This makes the starting lineup meaningfully better.',
        (c) => `${c.headName} steps straight into the lineup and raises its floor.`,
      ],
      down: [
        () => 'The starting lineup takes a clear step back here.',
        () => 'This weakens the weekly starters more than it helps them.',
        (c) => `${c.headName} is not enough to stop the lineup from sliding.`,
        () => 'A real dent in the starting lineup for this side.',
        () => 'The weekly ceiling drops noticeably on this deal.',
        (c) => `Even adding ${c.headName}, the starters come out worse.`,
      ],
      flat: [],
    },
    big: {
      up: [
        (c) => `${c.headName} transforms the starting lineup outright.`,
        () => 'The weekly ceiling jumps as this reshapes the starters.',
        () => 'A lineup overhaul that makes this side markedly stronger.',
        (c) => `Dropping ${c.headName} into a lineup that needed him changes everything.`,
        () => 'The starters here take a major step up.',
        (c) => `${c.headName} headlines a lineup leap that is hard to overstate.`,
      ],
      down: [
        () => 'The starting lineup craters on this one.',
        () => 'This guts the weekly starters, hard to justify for a contender.',
        (c) => `Not even ${c.headName} keeps the lineup from collapsing here.`,
        () => 'A major hit to the starters that sets this side back.',
        () => 'The weekly ceiling falls off sharply on this deal.',
        (c) => `Losing this much leaves the lineup badly exposed, ${c.headName} aside.`,
      ],
      flat: [],
    },
  },
}

// ── Second-person / third-person opener variants ────────────────────────────
// Same reads as the neutral OPENERS, but addressing the seat directly. Both
// "you" and "they" share the plural verb form, so one template serves both;
// the ctx carries every pronoun case so subject / object / possessive stay
// grammatical (you/you/your vs they/them/their).
type VoicedCtx = { subj: string; subjLow: string; obj: string; poss: string; headName: string }
type VoicedOpener = (c: VoicedCtx) => string

function voiceForms(voice: 'you' | 'they'): Omit<VoicedCtx, 'headName'> {
  return voice === 'you'
    ? { subj: 'You', subjLow: 'you', obj: 'you', poss: 'your' }
    : { subj: 'They', subjLow: 'they', obj: 'them', poss: 'their' }
}

// Only the value lens, and only buckets with a real edge (even/flat stay
// neutral). Access is optional-chained, so any gap just falls back to OPENERS.
const VOICED_OPENERS: Partial<Record<'value' | 'lineup', Partial<Record<Margin, Partial<Record<'up' | 'down' | 'flat', VoicedOpener[]>>>>>> = {
  value: {
    slight: {
      up: [
        (c) => `${c.subj} come out a hair in front on value, nothing worth gloating over.`,
        (c) => `${c.headName} tips ${c.obj} just ahead, though the edge is slim.`,
        (c) => `${c.subj} win the margins here, but only by a whisper.`,
        (c) => `Getting ${c.headName} back gives ${c.obj} a small but real edge.`,
      ],
      down: [
        (c) => `${c.subj} give up a touch more than ${c.subjLow} get, though nothing that stings.`,
        (c) => `Even with ${c.headName} coming back, ${c.subjLow} concede a little on value.`,
        (c) => `${c.subj} trail by a shade, a fair price for the right need.`,
        (c) => `${c.subj} pay a modest premium, the kind a contender can stomach.`,
      ],
    },
    clear: {
      up: [
        (c) => `${c.subj} come out comfortably ahead once the numbers settle.`,
        (c) => `Banking ${c.headName} hands ${c.obj} the better end of the deal.`,
        (c) => `${c.subj} pull ahead by a comfortable margin on consensus value.`,
        (c) => `${c.headName} does the heavy lifting on a deal ${c.subjLow} clearly win.`,
      ],
      down: [
        (c) => `${c.subj} pay up for ${c.headName}, and it shows on the value sheet.`,
        (c) => `${c.subj} come out clearly light once the totals are tallied.`,
        (c) => `${c.subj} give up real value to get the deal done.`,
        (c) => `Chasing ${c.headName} costs ${c.obj} more than the return justifies.`,
      ],
    },
    big: {
      up: [
        (c) => `${c.subj} run away with it, stealing real value in the process.`,
        (c) => `${c.subj} walk off with ${c.headName} and a fat edge to boot.`,
        (c) => `${c.subj} win in a rout, and the margin is hard to overstate.`,
        (c) => `Landing ${c.headName} on top of the rest makes this a runaway for ${c.obj}.`,
      ],
      down: [
        (c) => `${c.subj} hemorrhage value here, and it is hard to defend on the numbers.`,
        (c) => `${c.subj} overpay badly, ${c.headName} nowhere near enough to balance it.`,
        (c) => `${c.subj} ship out a fortune in value and get buried on the deal.`,
        (c) => `${c.subj} come out drastically short, with the gap a chasm.`,
      ],
    },
  },
}

// Short second sentence for a brief docket verdict when the trade shape has no
// consolidation angle: a terse league-mode note. Only called for up/down
// (there is a real edge to elaborate), kept short so the brief stays under cap.
function briefTail(mode: VerdictMode, dir: 'up' | 'down' | 'flat', pick: <T>(a: T[]) => T): string {
  if (mode === 'dynasty') return pick(['The younger side holds up better over time.', 'It looks even better a year from now.'])
  if (mode === 'keeper') return pick(['The cheaper keeper adds to it.', 'Keeper value nudges it further.'])
  if (dir === 'down') return pick(['The immediate impact may be thin, but the upside is there.', 'Only time will tell if it pays off.'])
  return pick(['This is a win-now bet.', 'Only this season matters here.'])
}

// Consolidation clauses. `consolidate` = this side gave up bodies for fewer,
// better pieces; `spread` = this side took on the extra depth.
const CONSOLIDATION: Record<'consolidate' | 'spread', Record<'up' | 'down' | 'flat', Clause[]>> = {
  consolidate: {
    up: [
      () => 'Trading a few players for one clear difference-maker is the smart move.',
      (c) => `Turning depth into a star like ${c.headName} is how you win.`,
      () => 'One great player beats a pile of depth.',
      () => 'Getting the best player in the deal is the whole point.',
    ],
    down: [
      () => 'Still, one great player is worth more than the extra bodies given up.',
      () => 'Landing the best player in a deal rarely looks bad later.',
      () => 'The side with the best player usually comes out ahead.',
    ],
    flat: [],
  },
  spread: {
    up: [
      () => 'The extra players help, but only your starters really count.',
      () => 'Depth has value, though bench players do less than the total suggests.',
      () => 'More players pad the total, but you can only start so many.',
    ],
    down: [
      () => 'Taking back a pile of depth for one star rarely works out.',
      (c) => `A bunch of smaller pieces does not replace a player like ${c.headName}.`,
      () => 'It looks even on the total, but benches do not win weeks.',
      () => 'Trading the best player away for depth is usually the losing end.',
    ],
    flat: [],
  },
}

// Mode / scarcity flavor. Returns a pool of complete sentences; picking is
// seeded upstream. Empty pool means "no flavor this time."
function FLAVORS(
  mode: VerdictMode,
  positions: string[],
  headPos: string,
  dir: 'up' | 'down' | 'flat',
): string[] {
  const out: string[] = []

  // League-mode angle.
  if (mode === 'dynasty') {
    out.push(
      'In dynasty, the younger side with the picks gains value over the years.',
      'Dynasty rewards whoever ends up with the longer window.',
    )
    if (dir === 'up') out.push('This builds value for future seasons, not just this one.')
  } else if (mode === 'keeper') {
    out.push(
      'In a keeper league, the cheaper long-term player tilts it further.',
      'The keeper angle matters as much as this season here.',
    )
  } else {
    out.push(
      'In redraft, all that matters is the points a player puts up this season.',
      'None of the long-term stuff matters in redraft, only the next few months.',
    )
  }

  // Positional scarcity angle.
  if (headPos === 'RB') out.push('Workhorse running backs are the hardest thing to find, which helps here.')
  if (headPos === 'QB') out.push('Quarterback value swings a lot by format, so check the lineup type first.')
  if (headPos === 'TE') out.push('A tight end you can start every week is a rare edge most teams never get.')
  if (headPos === 'WR' && positions.length > 1) out.push('Receiver depth is easy to find; a true top receiver is not.')

  return out
}
