'use client'

// The featured game's producer notes, split into two labeled columns so it
// is always clear what is happening live versus what the booth knew coming
// in: LIVE carries this game's storylines and the day's win-odds swing; THE
// PREVIEW carries pick'ems consensus, the projection line, recent form, and
// the power-ranking framing. Shared by the desk stage and the lab's command
// center.

import type { SlMatchup, Storyline } from '@/lib/sundayLive/types'
import type { SlWeekMatchupContext } from '@/lib/sundayLive/seasonContext'
import { fmtPct, fmtPts } from '../../_lib/format'

export type Note = { key: string; text: string; scope: 'live' | 'pre' }

// Deterministic variant pick: the same game keeps the same wording across
// polls, but different games do not all read off the same card.
function pick(variants: string[], seed: number): string {
  return variants[Math.abs(seed) % variants.length]
}

// Current run off the results strip (oldest first): 3+ is worth a sentence.
function streakOf(form: { results: Array<'W' | 'L' | 'T'> } | null): { kind: 'W' | 'L'; n: number } | null {
  const r = form?.results ?? []
  if (r.length === 0) return null
  const last = r[r.length - 1]
  if (last === 'T') return null
  let n = 0
  for (let i = r.length - 1; i >= 0 && r[i] === last; i--) n++
  return n >= 3 ? { kind: last, n } : null
}

// Two records far enough apart to frame as diverging seasons.
function seasonGap(
  recA: string | null,
  recB: string | null,
): { aUp: boolean; upRec: string; downRec: string } | null {
  const parse = (rec: string | null) => {
    const p = (rec ?? '').split('-').map(Number)
    if (p.length < 2 || p.some(Number.isNaN)) return null
    const games = p[0] + p[1] + (p[2] ?? 0)
    return games >= 5 ? { pct: (p[0] + (p[2] ?? 0) * 0.5) / games } : null
  }
  const a = parse(recA)
  const b = parse(recB)
  if (!a || !b || Math.abs(a.pct - b.pct) < 0.35) return null
  const aUp = a.pct > b.pct
  return { aUp, upRec: (aUp ? recA : recB) as string, downRec: (aUp ? recB : recA) as string }
}

export function buildGameNotes(
  m: SlMatchup,
  storylines: Storyline[],
  wpBounds: { min: number; max: number } | undefined,
  wc: SlWeekMatchupContext | null,
  // The featured card is a fixed-size box, so it gets the short cut of every
  // derived beat; the game room has real estate and asks for the long cut.
  opts?: { long?: boolean },
): Note[] {
  const cut = (short: string[], long: string[]) => (opts?.long ? long : short)
  // Headlines only: the sublines mostly restate the score, and on the
  // featured card the score is right above the notes. Newest bulletin first,
  // so a fresh line lands at the top and pushes the oldest off the card.
  const notes: Note[] = storylines
    .filter((s) => s.refs.matchupId === m.matchupId)
    .sort((a, b) => Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt))
    .slice(0, 3)
    .map((s) => ({ key: s.id, text: s.headline, scope: 'live' as const }))

  if (m.status !== 'pre' && wpBounds && wpBounds.max - wpBounds.min >= 0.35) {
    notes.push({
      key: 'swing',
      text: `${m.a.ownerName}'s win odds have run from ${fmtPct(wpBounds.min)} to ${fmtPct(wpBounds.max)} today.`,
      scope: 'live',
    })
  }

  // Pick'ems consensus deliberately does NOT appear here (Joey's call); the
  // vote lives on The Ballot and in the ticket marks on the cards. Power
  // ranks likewise only get written up when the gap actually says something,
  // since the badges next to both names already show the numbers.

  if (m.status === 'pre') {
    const diff = m.a.projected - m.b.projected
    const team = diff >= 0 ? m.a.ownerName : m.b.ownerName
    notes.push({
      key: 'line',
      text:
        Math.abs(diff) < 1
          ? 'Projections call this one dead even.'
          : `${team} projected by ${fmtPts(Math.abs(diff))}.`,
      scope: 'pre',
    })
  }

  // The booth's homework: streaks colliding, scoring pace, seasons headed in
  // opposite directions. Everything here comes from the league's own history
  // rather than restating what the badges already show.
  const stA = streakOf(wc?.formA ?? null)
  const stB = streakOf(wc?.formB ?? null)
  if (stA && stB && stA.kind !== stB.kind) {
    const [hot, cold] = stA.kind === 'W' ? [m.a, m.b] : [m.b, m.a]
    const [hotN, coldN] = stA.kind === 'W' ? [stA.n, stB.n] : [stB.n, stA.n]
    notes.push({
      key: 'streaks',
      text: pick(
        cut(
          [
            `${hot.ownerName} has won ${hotN} straight; ${cold.ownerName} has dropped ${coldN} in a row.`,
            `Streaks collide: ${hot.ownerName} on a ${hotN}-game run, ${cold.ownerName} skidding at ${coldN}.`,
          ],
          [
            `${hot.ownerName} rides ${hotN} straight into a team that has dropped ${coldN} in a row.`,
            `Streaks collide: ${hot.ownerName} has won ${hotN} straight, ${cold.ownerName} has lost ${coldN}.`,
            `${hot.ownerName} is the hottest thing going; ${cold.ownerName} cannot buy a win lately.`,
          ],
        ),
        m.matchupId + 4,
      ),
      scope: 'pre',
    })
  } else if (stA || stB) {
    const st = (stA ?? stB) as { kind: 'W' | 'L'; n: number }
    const who = stA ? m.a.ownerName : m.b.ownerName
    notes.push({
      key: 'streak',
      text:
        st.kind === 'W'
          ? pick(
              cut(
                [`${who} carries a ${st.n}-game winning streak into this one.`],
                [
                  `${who} brings a ${st.n}-game winning streak into this one.`,
                  `Nobody has solved ${who} in ${st.n} weeks.`,
                ],
              ),
              m.matchupId + 4,
            )
          : pick(
              cut(
                [`${who} has dropped ${st.n} straight and needs this one.`],
                [
                  `${who} has dropped ${st.n} straight and needs this one badly.`,
                  `The skid is at ${st.n} for ${who}; something has to give.`,
                ],
              ),
              m.matchupId + 4,
            ),
      scope: 'pre',
    })
  }

  const ppgA = wc?.formA?.ppg
  const ppgB = wc?.formB?.ppg
  if (ppgA != null && ppgB != null && Math.abs(ppgA - ppgB) >= 10) {
    const [hi, lo] = ppgA >= ppgB ? [m.a, m.b] : [m.b, m.a]
    const [hiP, loP] = ppgA >= ppgB ? [ppgA, ppgB] : [ppgB, ppgA]
    notes.push({
      key: 'pace',
      text: pick(
        cut(
          [`${hi.ownerName} has been scoring ${fmtPts(hiP)} a week lately; ${lo.ownerName} is at ${fmtPts(loP)}.`],
          [
            `${hi.ownerName} has been scoring ${fmtPts(hiP)} a week lately; ${lo.ownerName} is at ${fmtPts(loP)}.`,
            `The scoring gap is real: ${fmtPts(hiP)} a week for ${hi.ownerName}, ${fmtPts(loP)} for ${lo.ownerName}.`,
            `${lo.ownerName} needs a season-best day to hang with ${hi.ownerName}'s ${fmtPts(hiP)} pace.`,
          ],
        ),
        m.matchupId + 5,
      ),
      scope: 'pre',
    })
  }

  const seasons = seasonGap(wc?.recordA ?? null, wc?.recordB ?? null)
  if (seasons) {
    const [up, down] = seasons.aUp ? [m.a, m.b] : [m.b, m.a]
    notes.push({
      key: 'seasons',
      text: pick(
        cut(
          [`${up.ownerName} came in at ${seasons.upRec}; ${down.ownerName} is scraping along at ${seasons.downRec}.`],
          [
            `Two seasons passing in the night: ${up.ownerName} at ${seasons.upRec}, ${down.ownerName} at ${seasons.downRec}.`,
            `${up.ownerName} is playing for seeding at ${seasons.upRec}; ${down.ownerName} is playing for pride at ${seasons.downRec}.`,
            `${seasons.upRec} meets ${seasons.downRec}, and only one of these teams can afford to lose it.`,
          ],
        ),
        m.matchupId + 6,
      ),
      scope: 'pre',
    })
  }

  if (wc?.powerA != null && wc?.powerB != null && Math.abs(wc.powerA - wc.powerB) >= 5) {
    const hiSide = wc.powerA <= wc.powerB ? m.a : m.b
    notes.push({
      key: 'power',
      text: pick(
        cut(
          [`On paper it is a mismatch: the board says ${hiSide.ownerName} in a walk.`],
          [
            `On paper it is a mismatch, and the board says ${hiSide.ownerName} in a walk.`,
            `The rankings say this should not be close; upsets are how rankings get rewritten.`,
            `Everything on the board points to ${hiSide.ownerName}. Sundays do not read the board.`,
          ],
        ),
        m.matchupId,
      ),
      scope: 'pre',
    })
  }

  // When the wire has little to say about a live game, the booth fills the
  // LIVE column itself with beats derived from the frame: the game's best
  // line, where projections land it, and who still has bullets left.
  if (m.status !== 'pre') {
    const liveCount = () => notes.filter((n) => n.scope === 'live').length
    const starters = [...m.a.players, ...m.b.players].filter((p) => p.isStarter)
    const top = starters.reduce<(typeof starters)[number] | null>(
      (best, p) => (p.points > (best?.points ?? 0) ? p : best),
      null,
    )
    if (liveCount() < 3 && top && top.points >= 8) {
      const owner = m.a.players.includes(top) ? m.a.ownerName : m.b.ownerName
      notes.push({
        key: 'fill-top',
        text: pick(
          cut(
            [`The best line in this one belongs to ${owner}: ${top.name} with ${fmtPts(top.points)}.`],
            [
              `The best line in this one belongs to ${owner}: ${top.name} with ${fmtPts(top.points)}.`,
              `${top.name} owns this game so far, ${fmtPts(top.points)} for ${owner}.`,
              `${top.name} is carrying ${owner} with ${fmtPts(top.points)}.`,
            ],
          ),
          m.matchupId + 1,
        ),
        scope: 'live',
      })
    }
    if (liveCount() < 3 && m.status === 'live' && (m.a.playersRemaining > 0 || m.b.playersRemaining > 0)) {
      const [more, less] = m.a.playersRemaining >= m.b.playersRemaining ? [m.a, m.b] : [m.b, m.a]
      notes.push({
        key: 'fill-left',
        text:
          less.playersRemaining === 0
            ? pick(
                cut(
                  [`${less.ownerName} is out of bullets; ${more.ownerName} still has ${more.playersRemaining} to come.`],
                  [
                    `${less.ownerName} is out of bullets; ${more.ownerName} still has ${more.playersRemaining} to come.`,
                    `Everything ${less.ownerName} has is on the board. ${more.ownerName} has ${more.playersRemaining} still playing.`,
                  ],
                ),
                m.matchupId + 2,
              )
            : `${more.ownerName} has ${more.playersRemaining} still to play; ${less.ownerName} has ${less.playersRemaining}.`,
        scope: 'live',
      })
    }
    if (liveCount() < 3 && m.status === 'live') {
      const [pHi, pLo] = m.a.projected >= m.b.projected ? [m.a, m.b] : [m.b, m.a]
      notes.push({
        key: 'fill-proj',
        text: pick(
          cut(
            [`Projections land this ${fmtPts(pHi.projected)} to ${fmtPts(pLo.projected)}, ${pHi.ownerName}'s way.`],
            [
              `Projections land this at ${fmtPts(pHi.projected)} to ${fmtPts(pLo.projected)}, ${pHi.ownerName}'s way.`,
              `The machines call it for ${pHi.ownerName} at the wire: ${fmtPts(pHi.projected)} to ${fmtPts(pLo.projected)}.`,
            ],
          ),
          m.matchupId + 3,
        ),
        scope: 'live',
      })
    }
  }

  return notes
}

function NoteColumn({
  label,
  notes,
  bullet,
  fixed,
}: {
  label: string
  notes: Note[]
  bullet: string
  fixed?: boolean
}) {
  return (
    <div className="min-w-0">
      <span className="sl-kicker">{label}</span>
      <ul className="mt-2 space-y-2">
        {notes.map((n, i) => (
          <li key={n.key} className="flex items-baseline gap-2.5">
            <span className={`shrink-0 text-[10px] ${bullet}`} aria-hidden>
              ✦
            </span>
            {/* Fixed cards budget four text lines: the first bullet may wrap
                to two, the rest hold one line and ellipsize, so the height
                is exact and nothing is ever sliced mid-word. */}
            <span
              className={`sl-display min-w-0 text-[14px] leading-snug text-sl-text ${
                fixed ? (i === 0 ? 'line-clamp-2' : 'truncate') : ''
              }`}
            >
              {n.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// `fixed` holds the block at one exact height for every game: three bullets
// per column, four text lines budgeted (see NoteColumn), so the featured
// card is the same size no matter which matchup is up and the rails never
// re-measure.
export function GameNotes({ notes, fixed = false }: { notes: Note[]; fixed?: boolean }) {
  const live = notes.filter((n) => n.scope === 'live').slice(0, 3)
  const pre = notes.filter((n) => n.scope === 'pre').slice(0, 3)
  if (live.length === 0 && pre.length === 0 && !fixed) return null
  return (
    <div className={`border-t border-sl-line/60 pt-3 ${fixed ? 'h-[118px] overflow-hidden' : ''}`}>
      {live.length === 0 && pre.length === 0 ? (
        <>
          <span className="sl-kicker">GAME NOTES</span>
          <p className="mt-3 text-[12.5px] text-sl-dim">The booth has no notes on this one yet.</p>
        </>
      ) : (
        <div
          className={
            live.length > 0 && pre.length > 0 ? 'grid grid-cols-1 gap-x-7 gap-y-4 sm:grid-cols-2' : ''
          }
        >
          {pre.length > 0 && <NoteColumn label="THE PREVIEW" notes={pre} bullet="text-sl-mute" fixed={fixed} />}
          {live.length > 0 && <NoteColumn label="LIVE" notes={live} bullet="text-sl-gold" fixed={fixed} />}
        </div>
      )}
    </div>
  )
}
