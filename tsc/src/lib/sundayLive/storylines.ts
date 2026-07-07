// The producer voice.
//
// A rules engine that reads the live frame (plus the previous frame and the
// cached season context) and writes ranked broadcast lines: upset alerts,
// revenge games, milestone watches, bench regret, streak drama. Pure and
// deterministic: the same inputs always produce the same lines, ids are
// stable across polls while a condition holds, and template variants are
// picked by hashing the id so a line never rewords itself mid-broadcast.
//
// House style (enforced in renderCopy): no emojis, no em/en dashes,
// headline <= 90 chars, subline <= 120 chars.

import type { SlLeague, SlMatchup, SlPlayer, SlSide, Storyline, StorylineKind } from './types'
import type { SlSeasonContext } from './seasonContext'

// ── Utilities ────────────────────────────────────────────────────────────────

function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const fmt = (n: number): string => {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

const pct = (p: number): string => `${Math.round(p * 100)} percent`

// "1 point" / "2.5 points" — for copy where the unit follows the number.
const pts = (n: number): string => `${fmt(n)} ${Math.round(n * 10) === 10 ? 'point' : 'points'}`

// Interpolates {tokens}, then enforces house style. Dev-only throws keep bad
// copy from ever shipping silently.
function renderCopy(template: string, vars: Record<string, string | number>): string {
  const out = template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k]
    return v == null ? '' : String(v)
  })
  if (process.env.NODE_ENV !== 'production') {
    if (/[–—]/.test(out)) throw new Error(`storyline copy contains an em/en dash: ${out}`)
    if (/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/u.test(out)) throw new Error(`storyline copy contains an emoji: ${out}`)
  }
  return out
}

function pick(variants: string[], id: string): string {
  return variants[hash(id) % variants.length]
}

// ── Engine ───────────────────────────────────────────────────────────────────

type RuleInput = {
  frame: SlLeague
  prev: SlLeague | null
  ctx: SlSeasonContext | null
  progress: number
}

type Candidate = Omit<Storyline, 'firstSeenAt' | 'severity'> & { severity: number }

const CAP_TOTAL = 24
const CAP_PER_KIND = 2
const CAP_PER_MATCHUP = 6

export function buildStorylines(
  frame: SlLeague,
  prev: SlLeague | null,
  ctx: SlSeasonContext | null,
  progress: number,
): Storyline[] {
  const input: RuleInput = { frame, prev, ctx, progress }
  const prevById = new Map<string, Storyline>()
  for (const s of prev?.storylines ?? []) prevById.set(s.id, s)

  const candidates: Candidate[] = []
  for (const rule of RULES) {
    try {
      candidates.push(...rule(input))
    } catch {
      // One misbehaving rule never takes down the frame.
    }
  }

  const now = frame.meta.fetchedAt
  const withMeta: Storyline[] = candidates.map((c) => {
    const firstSeenAt = prevById.get(c.id)?.firstSeenAt ?? now
    // Boost by the referenced matchup's sweat, decay with age.
    const m = c.refs.matchupId != null ? frame.matchups.find((x) => x.matchupId === c.refs.matchupId) : undefined
    const sweatBoost = m ? m.sweatIndex / 5 : 0
    const ageMin = Math.max(0, (Date.parse(now) - Date.parse(firstSeenAt)) / 60_000)
    const decay = Math.max(0, ageMin - 10)
    const severity = Math.max(0, Math.min(100, c.severity + sweatBoost - decay))
    return { ...c, severity, firstSeenAt }
  })

  withMeta.sort((a, b) => b.severity - a.severity || a.id.localeCompare(b.id))

  const perKind = new Map<StorylineKind, number>()
  const perMatchup = new Map<number, number>()
  const out: Storyline[] = []
  for (const s of withMeta) {
    if (out.length >= CAP_TOTAL) break
    const k = perKind.get(s.kind) ?? 0
    if (k >= CAP_PER_KIND) continue
    const mid = s.refs.matchupId
    if (mid != null) {
      const mCount = perMatchup.get(mid) ?? 0
      if (mCount >= CAP_PER_MATCHUP) continue
      perMatchup.set(mid, mCount + 1)
    }
    perKind.set(s.kind, k + 1)
    out.push(s)
  }
  return out
}

// ── Shared helpers for rules ─────────────────────────────────────────────────

function starters(side: SlSide): SlPlayer[] {
  return side.players.filter((p) => p.isStarter)
}

function idFor(frame: SlLeague, kind: StorylineKind, refKey: string, bucket?: string | number): string {
  const b = bucket != null ? `:${bucket}` : ''
  return `${kind}:${frame.league.year}-${frame.league.week}:${refKey}${b}`
}

function hadId(prev: SlLeague | null, id: string): boolean {
  return (prev?.storylines ?? []).some((s) => s.id === id)
}

function managerIdOf(ctx: SlSeasonContext, side: SlSide): string | null {
  return side.ownerId ? ctx.managers[side.ownerId]?.managerId ?? null : null
}

// The winner of "who does this line belong to" for two-sided rules.
function sides(m: SlMatchup): Array<{ side: SlSide; other: SlSide; key: 'a' | 'b' }> {
  return [
    { side: m.a, other: m.b, key: 'a' },
    { side: m.b, other: m.a, key: 'b' },
  ]
}

// ── Rules ────────────────────────────────────────────────────────────────────

type Rule = (input: RuleInput) => Candidate[]

const nailbiter: Rule = ({ frame, prev, progress }) => {
  const out: Candidate[] = []
  if (progress < 0.35) return out
  for (const m of frame.matchups) {
    if (m.status !== 'live') continue
    const id = idFor(frame, 'nailbiter', `m${m.matchupId}`)
    const gap = Math.abs(m.a.score - m.b.score)
    const threshold = hadId(prev, id) ? 10 : 6 // hysteresis: no strobing
    if (gap >= threshold) continue
    const leader = m.a.score >= m.b.score ? m.a : m.b
    const trailer = m.a.score >= m.b.score ? m.b : m.a
    const left = m.a.playersRemaining + m.b.playersRemaining
    out.push({
      id,
      kind: 'nailbiter',
      category: 'game',
      severity: 75,
      headline: renderCopy(
        pick(
          [
            '{gap} in it and {left} starters still on the field.',
            'Nobody breathe. {leader} leads {trailer} by {gap}.',
            'This one is coming down to the wire. {gap} between them.',
            'One swing decides it. {leader} up {gap} on {trailer}.',
            'Do not look away. {gap} in it with {left} starters to go.',
          ],
          id,
        ),
        { gap: pts(gap), left, leader: leader.ownerName, trailer: trailer.ownerName },
      ),
      subline: renderCopy('{a} {as}, {b} {bs}', {
        a: m.a.ownerName,
        as: fmt(m.a.score),
        b: m.b.ownerName,
        bs: fmt(m.b.score),
      }),
      refs: { matchupId: m.matchupId, rosterIds: [m.a.rosterId, m.b.rosterId] },
    })
  }
  return out
}

const comeback: Rule = ({ frame }) => {
  const out: Candidate[] = []
  for (const m of frame.matchups) {
    if (m.status !== 'live') continue
    const bounds = frame.wpBounds[String(m.matchupId)]
    if (!bounds) continue
    for (const { side, key } of sides(m)) {
      const wp = key === 'a' ? m.a.wp : m.b.wp
      const floor = key === 'a' ? bounds.min : 1 - bounds.max
      if (wp < 0.45 || floor > 0.2) continue
      const id = idFor(frame, 'comeback', `m${m.matchupId}${key}`)
      out.push({
        id,
        kind: 'comeback',
        category: 'game',
        severity: 78,
        headline: renderCopy(
          pick(
            [
              'Left for dead earlier. {owner} is all the way back in this one.',
              'The comeback is on. {team} has climbed from {floor} to {now}.',
              '{owner} was down to {floor} win odds. Now: {now}. Believe.',
              'Call it a heist in progress. {owner} has clawed back to {now}.',
            ],
            id,
          ),
          { owner: side.ownerName, team: side.ownerName, floor: pct(floor), now: pct(wp) },
        ),
        subline: renderCopy('Win odds bottomed out at {floor}, now {now}', {
          floor: pct(floor),
          now: pct(wp),
        }),
        refs: { matchupId: m.matchupId, rosterIds: [side.rosterId] },
      })
    }
  }
  return out
}

const blowout: Rule = ({ frame, prev, progress }) => {
  const out: Candidate[] = []
  if (progress < 0.4) return out
  for (const m of frame.matchups) {
    if (m.status === 'pre') continue
    const id = idFor(frame, 'blowout', `m${m.matchupId}`)
    const gap = Math.abs(m.a.score - m.b.score)
    const threshold = hadId(prev, id) ? 38 : 45
    if (gap < threshold) continue
    const leader = m.a.score >= m.b.score ? m.a : m.b
    const trailer = m.a.score >= m.b.score ? m.b : m.a
    out.push({
      id,
      kind: 'blowout',
      category: 'game',
      severity: 60,
      headline: renderCopy(
        pick(
          [
            'It is a laugher. {leaderOwner} leads by {gap}.',
            'Somebody check on {trailerOwner}. Down {gap} and counting.',
            'The rout is on: {leader} by {gap}.',
            '{leaderOwner} is up {gap}. This stopped being a game a while ago.',
            'Mercy rule requested. {trailerOwner} trails by {gap}.',
          ],
          id,
        ),
        { gap: fmt(gap), leader: leader.ownerName, leaderOwner: leader.ownerName, trailerOwner: trailer.ownerName },
      ),
      subline: renderCopy('{a} {as}, {b} {bs}', {
        a: m.a.ownerName,
        as: fmt(m.a.score),
        b: m.b.ownerName,
        bs: fmt(m.b.score),
      }),
      refs: { matchupId: m.matchupId, rosterIds: [leader.rosterId, trailer.rosterId] },
    })
  }
  return out
}

const upsetAlert: Rule = ({ frame, ctx, progress }) => {
  const out: Candidate[] = []
  if (progress < 0.4) return out
  for (const m of frame.matchups) {
    if (m.status !== 'live') continue
    // Path 1: the pick'ems room called it heavily one way and that side trails.
    if (m.pickems && m.pickems.totalVotes >= 4) {
      const { pctA } = m.pickems
      const favored = pctA >= 70 ? m.a : (100 - pctA) >= 70 ? m.b : null
      if (favored) {
        const other = favored === m.a ? m.b : m.a
        const favPct = favored === m.a ? pctA : 100 - pctA
        if (other.score > favored.score) {
          const id = idFor(frame, 'upset-alert', `m${m.matchupId}:room`)
          out.push({
            id,
            kind: 'upset-alert',
            category: 'game',
            severity: 80,
            headline: renderCopy(
              pick(
                [
                  'The room called this one {fav} to {dog}. The {dog} percent are feeling smart.',
                  'Upset brewing. {upOwner} is beating the {fav} percent consensus.',
                  'The {fav} percent are sweating. {upOwner} did not get the memo.',
                  '{upOwner} versus the chalk, and the chalk is losing.',
                ],
                id,
              ),
              { fav: favPct, dog: 100 - favPct, upOwner: other.ownerName },
            ),
            subline: renderCopy('{up} {upScore}, {favTeam} {favScore}', {
              up: other.ownerName,
              upScore: fmt(other.score),
              favTeam: favored.ownerName,
              favScore: fmt(favored.score),
            }),
            refs: { matchupId: m.matchupId, rosterIds: [other.rosterId] },
          })
          continue
        }
      }
    }
    // Path 2: big power-rank gap inverted on the scoreboard.
    if (ctx) {
      const pa = managerIdOf(ctx, m.a)
      const pb = managerIdOf(ctx, m.b)
      const ra = pa ? ctx.power[pa]?.rank : undefined
      const rb = pb ? ctx.power[pb]?.rank : undefined
      if (ra != null && rb != null && Math.abs(ra - rb) >= 5) {
        const low = ra > rb ? m.a : m.b // worse-ranked team
        const high = ra > rb ? m.b : m.a
        const lowRank = Math.max(ra, rb)
        const highRank = Math.min(ra, rb)
        if (low.score > high.score) {
          const id = idFor(frame, 'upset-alert', `m${m.matchupId}:power`)
          out.push({
            id,
            kind: 'upset-alert',
            category: 'league',
            severity: 76,
            headline: renderCopy(
              pick(
                [
                  'The number {lowRank} team is beating the number {highRank} team. Upset watch is on.',
                  '{lowOwner} did not read the power rankings. Number {lowRank} leads number {highRank}.',
                  'Check the poll twice. Number {lowRank} is up on number {highRank}.',
                  'Rankings are a suggestion. {lowOwner} has number {highRank} on the ropes.',
                ],
                id,
              ),
              { lowRank, highRank, lowOwner: low.ownerName },
            ),
            subline: renderCopy('{low} {ls}, {high} {hs}', {
              low: low.ownerName,
              ls: fmt(low.score),
              high: high.ownerName,
              hs: fmt(high.score),
            }),
            refs: { matchupId: m.matchupId, rosterIds: [low.rosterId] },
          })
        }
      }
    }
  }
  return out
}

const earthquake: Rule = ({ frame }) => {
  const out: Candidate[] = []
  const now = Date.parse(frame.meta.fetchedAt)
  for (const mo of frame.moments) {
    if (mo.tier === 'wave') continue
    if (now - Date.parse(mo.at) > 3 * 60_000) continue
    const m = frame.matchups.find((x) => x.matchupId === mo.matchupId)
    if (!m) continue
    const gainer = mo.side === 'a' ? m.a : m.b
    const id = idFor(frame, 'earthquake', `${mo.id}`)
    const swing = Math.abs(mo.wpAfter - mo.wpBefore)
    out.push({
      id,
      kind: 'earthquake',
      category: 'game',
      severity: mo.tier === 'earthquake' ? 90 : 82,
      headline: renderCopy(
        pick(
          [
            'The board just shook. {cause} swung it {swing} toward {owner}.',
            'Huge swing: {cause}. {owner} jumps from {before} to {after}.',
            '{cause}, and just like that {owner} sits at {after}.',
          ],
          id,
        ),
        {
          cause: mo.cause,
          swing: pct(swing),
          owner: gainer.ownerName,
          before: pct(mo.side === 'a' ? mo.wpBefore : 1 - mo.wpBefore),
          after: pct(mo.side === 'a' ? mo.wpAfter : 1 - mo.wpAfter),
        },
      ),
      subline: null,
      refs: { matchupId: m.matchupId, rosterIds: [gainer.rosterId] },
    })
  }
  return out
}

const photoFinish: Rule = ({ frame }) => {
  const out: Candidate[] = []
  for (const m of frame.matchups) {
    if (m.status !== 'live') continue
    if (m.a.playersRemaining > 0 || m.b.playersRemaining > 0) continue
    const gap = Math.abs(m.a.score - m.b.score)
    if (gap >= 3) continue
    const id = idFor(frame, 'photo-finish', `m${m.matchupId}`)
    out.push({
      id,
      kind: 'photo-finish',
      category: 'game',
      severity: 88,
      headline: renderCopy(
        pick(
          [
            'Nothing left on the field and {gap} decides it.',
            'Every starter is done. {gap} between agony and ecstasy.',
            'Pencils down. {gap} separates them and nobody can add to it.',
            'It is out of everyone’s hands now. {gap} the difference.',
          ],
          id,
        ),
        { gap: pts(gap) },
      ),
      subline: renderCopy('{a} {as}, {b} {bs}, stat corrections pending', {
        a: m.a.ownerName,
        as: fmt(m.a.score),
        b: m.b.ownerName,
        bs: fmt(m.b.score),
      }),
      refs: { matchupId: m.matchupId },
    })
  }
  return out
}

const winSealed: Rule = ({ frame }) => {
  const out: Candidate[] = []
  for (const m of frame.matchups) {
    if (m.status !== 'live') continue
    for (const { side, other, key } of sides(m)) {
      const wp = key === 'a' ? m.a.wp : m.b.wp
      if (wp < 0.95 || other.playersRemaining > 0) continue
      const id = idFor(frame, 'win-sealed', `m${m.matchupId}${key}`)
      out.push({
        id,
        kind: 'win-sealed',
        category: 'game',
        severity: 55,
        headline: renderCopy(
          pick(
            [
              'Book it. {owner} just needs the clock to run.',
              '{team} has this one on ice.',
              '{owner} can start the handshake line. This one is done.',
              'Stick a fork in it. {owner} has it wrapped.',
            ],
            id,
          ),
          { owner: side.ownerName, team: side.ownerName },
        ),
        subline: renderCopy('{other} is out of bullets, down {gap}', {
          other: other.ownerName,
          gap: fmt(Math.abs(side.score - other.score)),
        }),
        refs: { matchupId: m.matchupId, rosterIds: [side.rosterId] },
      })
    }
  }
  return out
}

const monsterGame: Rule = ({ frame }) => {
  const out: Candidate[] = []
  for (const m of frame.matchups) {
    for (const { side } of sides(m)) {
      for (const p of starters(side)) {
        if (p.points < 25 || p.projected <= 0 || p.points < 2.2 * p.projected) continue
        const id = idFor(frame, 'monster-game', p.playerId)
        const stillLive = p.game?.state === 'live'
        out.push({
          id,
          kind: 'monster-game',
          category: 'player',
          severity: 65 + (stillLive ? 5 : 0),
          headline: renderCopy(
            pick(
              [
                '{name} has {pts} and the day is not over.',
                '{name} is out of his mind: {pts} against a {proj} projection.',
                'Somebody tell {owner} to start printing shirts. {name} has {pts}.',
                '{name} woke up and chose violence. {pts} and counting.',
                'Whatever {owner} fed {name} this week, it worked. {pts} today.',
              ],
              id,
            ),
            { name: p.name, pts: fmt(p.points), proj: fmt(p.projected), owner: side.ownerName },
          ),
          subline: renderCopy('Started by {owner}', { owner: side.ownerName }),
          refs: { matchupId: m.matchupId, rosterIds: [side.rosterId], playerIds: [p.playerId] },
        })
      }
    }
  }
  return out
}

const milestoneWatch: Rule = ({ frame }) => {
  const out: Candidate[] = []
  for (const m of frame.matchups) {
    for (const { side } of sides(m)) {
      for (const p of starters(side)) {
        if (p.game?.state !== 'live') continue
        for (const bucket of [30, 40, 50]) {
          if (p.points >= bucket - 4 && p.points < bucket) {
            const id = idFor(frame, 'milestone-watch', p.playerId, bucket)
            out.push({
              id,
              kind: 'milestone-watch',
              category: 'player',
              severity: 60 + (bucket - 30) / 2,
              headline: renderCopy(
                pick(
                  [
                    '{need} more and {name} posts a {bucket} burger.',
                    '{name} is knocking on {bucket}. He sits at {pts}.',
                    'A {bucket} burger is on the grill. {name} needs {need} more.',
                    '{name} is {need} away from a {bucket} spot and still cooking.',
                  ],
                  id,
                ),
                { need: pts(bucket - p.points), name: p.name, bucket, pts: fmt(p.points) },
              ),
              subline: renderCopy('Started by {owner}', { owner: side.ownerName }),
              refs: { matchupId: m.matchupId, rosterIds: [side.rosterId], playerIds: [p.playerId] },
            })
            break
          }
        }
      }
    }
  }
  return out
}

const rankOvertake: Rule = ({ frame, ctx }) => {
  const out: Candidate[] = []
  if (!ctx || Object.keys(ctx.positionRanks).length === 0) return out
  for (const m of frame.matchups) {
    for (const { side } of sides(m)) {
      for (const p of starters(side)) {
        if (p.points < 20) continue
        const rank = ctx.positionRanks[p.playerId]
        if (!rank) continue
        const rankNum = Number(rank.replace(/^[A-Z]+/, ''))
        if (!Number.isFinite(rankNum) || rankNum > 12) continue
        const id = idFor(frame, 'rank-overtake', p.playerId)
        out.push({
          id,
          kind: 'rank-overtake',
          category: 'player',
          severity: 58,
          headline: renderCopy(
            pick(
              [
                '{name} came into today as the {rank}. Days like this are why.',
                'The season {rank} is doing season {rank} things: {pts} today.',
                'That is the {rank} on your screen. {name} has {pts} and wants more.',
              ],
              id,
            ),
            { name: p.name, rank, pts: fmt(p.points) },
          ),
          subline: renderCopy('Started by {owner}', { owner: side.ownerName }),
          refs: { matchupId: m.matchupId, rosterIds: [side.rosterId], playerIds: [p.playerId] },
        })
      }
    }
  }
  return out
}

const dudAlert: Rule = ({ frame }) => {
  const out: Candidate[] = []
  for (const m of frame.matchups) {
    for (const { side } of sides(m)) {
      for (const p of starters(side)) {
        const g = p.game
        const lateOrDone =
          g?.state === 'final' || (g?.state === 'live' && (g.quarterClock ?? '').startsWith('Q4'))
        if (!lateOrDone || p.projected < 12 || p.points >= 3) continue
        const id = idFor(frame, 'dud-alert', p.playerId)
        out.push({
          id,
          kind: 'dud-alert',
          category: 'player',
          severity: 55,
          headline: renderCopy(
            pick(
              [
                'Started, trusted, betrayed. {name} sits at {pts}.',
                '{name} was projected for {proj}. He has {pts}.',
                'The milk carton photo is ready: {name}, last seen projecting {proj}.',
                'Projection {proj}. Reality {pts}. {name} owes somebody an apology.',
                '{name} showed up in disguise today: {pts} on a {proj} projection.',
              ],
              id,
            ),
            { name: p.name, pts: fmt(p.points), proj: fmt(p.projected) },
          ),
          subline: renderCopy('{owner} would like a word', { owner: side.ownerName }),
          refs: { matchupId: m.matchupId, rosterIds: [side.rosterId], playerIds: [p.playerId] },
        })
      }
    }
  }
  return out
}

const benchRegret: Rule = ({ frame }) => {
  const out: Candidate[] = []
  for (const m of frame.matchups) {
    for (const { side } of sides(m)) {
      const bench = side.players.filter((p) => !p.isStarter && p.game && p.game.state !== 'pre')
      for (const b of bench) {
        if (!b.position) continue
        const rival = starters(side).filter((s) => s.position === b.position)
        if (rival.length === 0) continue
        const worst = rival.reduce((lo, s) => (s.points < lo.points ? s : lo))
        if (b.points < worst.points + 10 || b.points < 12) continue
        const id = idFor(frame, 'bench-regret', `${side.rosterId}:${b.playerId}`)
        out.push({
          id,
          kind: 'bench-regret',
          category: 'player',
          severity: 58,
          headline: renderCopy(
            pick(
              [
                'The wrong {pos} started. {bench} has {bpts} on {owner}’s bench.',
                '{owner} benched {bench} and he went for {bpts}. {starter} gave him {spts}.',
                'The points were on the pine. {bench} put up {bpts} for {owner}’s bench.',
                '{bench} scored {bpts} from the bench while {starter} managed {spts}.',
              ],
              id,
            ),
            {
              pos: b.position,
              bench: b.name,
              bpts: fmt(b.points),
              owner: side.ownerName,
              starter: worst.name,
              spts: fmt(worst.points),
            },
          ),
          subline: null,
          refs: { matchupId: m.matchupId, rosterIds: [side.rosterId], playerIds: [b.playerId, worst.playerId] },
        })
      }
    }
  }
  return out
}

const redzoneStakes: Rule = ({ frame }) => {
  const out: Candidate[] = []
  for (const m of frame.matchups) {
    if (m.sweatIndex < 70) continue
    for (const { side } of sides(m)) {
      for (const p of starters(side)) {
        if (!p.game?.inRedZone) continue
        const id = idFor(frame, 'redzone-stakes', `${p.playerId}:${frame.meta.fetchedAt.slice(0, 16)}`)
        out.push({
          id,
          kind: 'redzone-stakes',
          category: 'player',
          severity: 72,
          headline: renderCopy(
            pick(
              [
                'Hold your breath, {owner}. {name} is in the red zone with the matchup on the line.',
                '{name} inside the twenty. This sweat just got sweatier.',
                '{name} is knocking at the goal line and {owner}’s week hangs on it.',
                'Red zone, big spot. {name} has a chance to swing this whole matchup.',
                'Twenty yards from chaos. {name} is in close and {owner} knows it.',
              ],
              id,
            ),
            { owner: side.ownerName, name: p.name },
          ),
          subline: null,
          refs: { matchupId: m.matchupId, rosterIds: [side.rosterId], playerIds: [p.playerId] },
        })
      }
    }
  }
  return out
}

const manDown: Rule = ({ frame, progress }) => {
  const out: Candidate[] = []
  if (progress > 0.3) return out
  for (const a of frame.inactives) {
    if (!a.isStarter) continue
    const st = a.status.toLowerCase()
    if (!(st.startsWith('out') || st === 'ir' || st === 'pup' || st.startsWith('sus'))) continue
    const id = idFor(frame, 'man-down', `${a.name}:${a.ownerName}`)
    out.push({
      id,
      kind: 'man-down',
      category: 'player',
      severity: 70,
      headline: renderCopy(
        pick(
          [
            '{owner} kicks off a man down. {name} is {status} and still in the lineup.',
            'Lineup alert: {name} is {status} and {owner} has not swapped him out.',
            'Check your lineup, {owner}. {name} is {status} and penciled in anyway.',
            '{name} will not play today. {owner}’s lineup has not heard the news.',
          ],
          id,
        ),
        { owner: a.ownerName, name: a.name, status: a.status },
      ),
      subline: null,
      refs: {},
    })
  }
  return out
}

const freeAgentTaunt: Rule = ({ frame }) => {
  const out: Candidate[] = []
  for (const e of frame.ticker.all.slice(0, 5)) {
    if (!e.freeAgent) continue
    const id = idFor(frame, 'free-agent-taunt', e.playerId)
    out.push({
      id,
      kind: 'free-agent-taunt',
      category: 'league',
      severity: 45,
      headline: renderCopy(
        pick(
          [
            'The best {pos} in football today belongs to nobody in this league. {name}, {pts}.',
            '{name} has {pts} and is sitting on waivers. Somebody do something.',
            'Free to a good home: {name}, {pts} today, zero owners.',
            'The waiver wire is showing off. {name} has {pts} for no one.',
          ],
          id,
        ),
        { pos: e.position ?? 'player', name: e.name, pts: fmt(e.points) },
      ),
      subline: null,
      refs: { playerIds: [e.playerId] },
    })
  }
  return out
}

// ── Transaction rules ────────────────────────────────────────────────────────

const revengeGame: Rule = ({ frame, ctx }) => {
  const out: Candidate[] = []
  if (!ctx) return out
  const sideByRoster = new Map<number, { side: SlSide; matchup: SlMatchup }>()
  for (const m of frame.matchups) {
    sideByRoster.set(m.a.rosterId, { side: m.a, matchup: m })
    sideByRoster.set(m.b.rosterId, { side: m.b, matchup: m })
  }
  for (const t of ctx.trades) {
    if (t.week == null) continue // offseason trades are old news by kickoff
    for (const [pid, toRoster] of Object.entries(t.adds)) {
      const fromRoster = t.drops[pid]
      if (fromRoster == null || fromRoster === toRoster) continue
      const here = sideByRoster.get(toRoster)
      if (!here) continue
      const { side, matchup } = here
      const opponent = matchup.a.rosterId === toRoster ? matchup.b : matchup.a
      if (opponent.rosterId !== fromRoster) continue // not facing the old boss today
      const p = side.players.find((x) => x.playerId === pid && x.isStarter)
      if (!p || p.points < 12) continue
      const id = idFor(frame, 'revenge-game', pid)
      out.push({
        id,
        kind: 'revenge-game',
        category: 'revenge',
        severity: 85,
        headline: renderCopy(
          pick(
            [
              'Traded in Week {week}. {name} has {pts} against the man who sent him packing.',
              'Revenge game alert: {name} is dropping {pts} on his old team.',
              '{name} remembers Week {week}. {pts} against the side that shipped him out.',
              'No handshake needed. {name} has {pts} on the manager who traded him.',
            ],
            id,
          ),
          { week: t.week, name: p.name, pts: fmt(p.points) },
        ),
        subline: renderCopy('{newOwner} thanks {oldOwner} for his generosity', {
          newOwner: side.ownerName,
          oldOwner: opponent.ownerName,
        }),
        refs: { matchupId: matchup.matchupId, rosterIds: [side.rosterId], playerIds: [pid] },
      })
    }
  }
  return out
}

const newArrival: Rule = ({ frame, ctx }) => {
  const out: Candidate[] = []
  if (!ctx) return out
  const week = frame.league.week
  const acquiredBy = new Map<string, { roster: number; via: 'trade' | 'waivers'; week: number }>()
  for (const t of ctx.trades) {
    if (t.week == null || week - t.week > 3 || t.week >= week) continue
    for (const [pid, r] of Object.entries(t.adds)) acquiredBy.set(pid, { roster: r, via: 'trade', week: t.week })
  }
  for (const mv of ctx.moves) {
    if (week - mv.week > 3 || mv.week >= week) continue
    for (const [pid, r] of Object.entries(mv.adds ?? {})) acquiredBy.set(pid, { roster: r, via: 'waivers', week: mv.week })
  }
  for (const m of frame.matchups) {
    for (const { side } of sides(m)) {
      for (const p of starters(side)) {
        const acq = acquiredBy.get(p.playerId)
        if (!acq || acq.roster !== side.rosterId || p.points < 15) continue
        const id = idFor(frame, 'new-arrival', p.playerId)
        out.push({
          id,
          kind: 'new-arrival',
          category: 'revenge',
          severity: 60,
          headline: renderCopy(
            pick(
              [
                'The new guy delivers. {name} has {pts} for {owner}, {ago} after arriving via {via}.',
                '{owner} added {name} in Week {week}. Today: {pts}. Scouting department raise incoming.',
                'Best pickup of the season so far? {name} has {pts} for {owner}.',
              ],
              id,
            ),
            {
              name: p.name,
              pts: fmt(p.points),
              owner: side.ownerName,
              via: acq.via,
              week: acq.week,
              ago: week - acq.week === 1 ? 'a week' : `${week - acq.week} weeks`,
            },
          ),
          subline: null,
          refs: { matchupId: m.matchupId, rosterIds: [side.rosterId], playerIds: [p.playerId] },
        })
      }
    }
  }
  return out
}

const dropRegret: Rule = ({ frame, ctx }) => {
  const out: Candidate[] = []
  if (!ctx) return out
  const week = frame.league.week
  const droppedBy = new Map<string, { roster: number; week: number }>()
  for (const mv of ctx.moves) {
    if (week - mv.week > 4) continue
    for (const [pid, r] of Object.entries(mv.drops ?? {})) droppedBy.set(pid, { roster: r, week: mv.week })
  }
  if (droppedBy.size === 0) return out

  const ownerByRoster = new Map<number, string>()
  for (const m of frame.matchups) {
    ownerByRoster.set(m.a.rosterId, m.a.ownerName)
    ownerByRoster.set(m.b.rosterId, m.b.ownerName)
  }
  // Find dropped players scoring anywhere today (ticker covers all rostered).
  for (const e of frame.ticker.all) {
    const drop = droppedBy.get(e.playerId)
    if (!drop || e.points < 15) continue
    // Skip when the same roster re-added him (drop/add churn).
    if (e.startedByOwner && ownerByRoster.get(drop.roster) === e.startedByOwner) continue
    const dropper = ownerByRoster.get(drop.roster) ?? 'someone'
    const id = idFor(frame, 'drop-regret', e.playerId)
    out.push({
      id,
      kind: 'drop-regret',
      category: 'revenge',
      severity: 63,
      headline: renderCopy(
        pick(
          [
            'Cut in Week {week} by {dropper}. All {name} has done since is score: {pts} today.',
            '{name}, waived in Week {week}, just hung {pts} on the league.',
            'Somewhere {dropper} is refreshing this score. {name} has {pts}.',
            'The one that got away: {name}, cut in Week {week}, {pts} this afternoon.',
          ],
          id,
        ),
        { week: drop.week, dropper, name: e.name, pts: fmt(e.points) },
      ),
      subline: e.startedByOwner ? renderCopy('Now starting for {owner}', { owner: e.startedByOwner }) : null,
      refs: { playerIds: [e.playerId] },
    })
  }
  return out
}

const tradeScoreboard: Rule = ({ frame, ctx }) => {
  const out: Candidate[] = []
  if (!ctx) return out
  const pointsByPlayer = new Map<string, number>()
  const ownerByRoster = new Map<number, string>()
  for (const m of frame.matchups) {
    for (const { side } of sides(m)) {
      ownerByRoster.set(side.rosterId, side.ownerName)
      for (const p of side.players) pointsByPlayer.set(p.playerId, p.points)
    }
  }
  for (const t of ctx.trades) {
    if (t.week == null || t.rosterIds.length !== 2) continue
    const [r1, r2] = t.rosterIds
    const sum = (roster: number) =>
      Object.entries(t.adds)
        .filter(([, r]) => r === roster)
        .reduce((s, [pid]) => s + (pointsByPlayer.get(pid) ?? 0), 0)
    const s1 = sum(r1)
    const s2 = sum(r2)
    if (s1 + s2 < 25 || Math.abs(s1 - s2) < 10) continue
    const winner = s1 >= s2 ? r1 : r2
    const id = idFor(frame, 'trade-scoreboard', `w${t.week}:${r1}-${r2}`)
    out.push({
      id,
      kind: 'trade-scoreboard',
      category: 'revenge',
      severity: 58,
      headline: renderCopy(
        pick(
          [
            'The Week {week} trade reads {hi} to {lo} today. Advantage {owner}.',
            'Re-grading the Week {week} deal: {owner} is up {hi} to {lo} this afternoon.',
            'Week {week} trade check-in: {owner}’s side leads it {hi} to {lo}.',
          ],
          id,
        ),
        {
          week: t.week,
          hi: fmt(Math.max(s1, s2)),
          lo: fmt(Math.min(s1, s2)),
          owner: ownerByRoster.get(winner) ?? 'one side',
        },
      ),
      subline: null,
      refs: { rosterIds: [r1, r2] },
    })
  }
  return out
}

// ── History rules ────────────────────────────────────────────────────────────

const grudgeMatch: Rule = ({ frame, ctx, progress }) => {
  const out: Candidate[] = []
  if (!ctx || progress > 0.5) return out // pregame and early-window flavor
  for (const m of frame.matchups) {
    const ma = managerIdOf(ctx, m.a)
    const mb = managerIdOf(ctx, m.b)
    if (!ma || !mb) continue
    const [lo, hi] = ma < mb ? [ma, mb] : [mb, ma]
    const rec = ctx.h2h[`${lo}|${hi}`]
    if (!rec) continue
    const total = rec.aWins + rec.bWins + rec.ties
    if (total < 5) continue
    const aWins = ma === lo ? rec.aWins : rec.bWins
    const bWins = ma === lo ? rec.bWins : rec.aWins
    const domA = aWins / Math.max(1, aWins + bWins)
    const even = aWins === bWins
    if (!even && domA < 0.7 && domA > 0.3) continue
    const id = idFor(frame, 'grudge-match', `m${m.matchupId}`)
    const owner = domA >= 0.7 ? m.a : m.b
    const victim = domA >= 0.7 ? m.b : m.a
    const w = Math.max(aWins, bWins)
    const l = Math.min(aWins, bWins)
    out.push({
      id,
      kind: 'grudge-match',
      category: 'history',
      severity: 55,
      headline: even
        ? renderCopy(
            pick(
              [
                'Dead even series, {w} wins apiece across {total} meetings. Somebody breaks the tie today.',
                'All square at {w} apiece through {total} meetings. Today tips the scale.',
              ],
              id,
            ),
            { w: aWins, total },
          )
        : renderCopy(
            pick(
              [
                '{owner} owns this series {w} games to {l}. {victim} says history is bunk.',
                'The ledger says {owner} leads {w} to {l} all time. {victim} wants a word.',
                '{w} to {l} all time. {victim} is tired of hearing about it.',
                'Same two names, same old story. {owner} leads it {w} to {l}.',
              ],
              id,
            ),
            { owner: owner.ownerName, w, l, victim: victim.ownerName },
          ),
      subline: rec.last ? renderCopy('Last met Week {w} of {y}', { w: rec.last.week, y: rec.last.year }) : null,
      refs: { matchupId: m.matchupId },
    })
  }
  return out
}

const seasonHighWatch: Rule = ({ frame, ctx, progress }) => {
  const out: Candidate[] = []
  if (!ctx || ctx.leagueSeasonHigh.score <= 0 || progress < 0.3) return out
  for (const m of frame.matchups) {
    for (const { side, key } of sides(m)) {
      const pace = Math.max(side.score, side.projected)
      if (pace <= ctx.leagueSeasonHigh.score) continue
      const crossed = side.score > ctx.leagueSeasonHigh.score
      // "On pace" reads wrong once the day is effectively over.
      if (!crossed && progress >= 0.9) continue
      const id = idFor(frame, 'season-high-watch', `m${m.matchupId}${key}`, crossed ? 'set' : 'pace')
      out.push({
        id,
        kind: 'season-high-watch',
        category: 'history',
        severity: crossed ? 74 : 68,
        headline: crossed
          ? renderCopy('New season high. {team} just passed the {old} the league had been chasing.', {
              team: side.ownerName,
              old: fmt(ctx.leagueSeasonHigh.score),
            })
          : renderCopy(
              pick(
                [
                  'The season-high {old} is officially in danger. {team} is pacing past it.',
                  '{owner} is on pace to break the league’s season high of {old}.',
                  'Circle the scoreboard. {owner} is chasing the season-best {old}.',
                ],
                id,
              ),
              { old: fmt(ctx.leagueSeasonHigh.score), team: side.ownerName, owner: side.ownerName },
            ),
        subline: renderCopy('Currently {now}, projecting {proj}', {
          now: fmt(side.score),
          proj: fmt(side.projected),
        }),
        refs: { matchupId: m.matchupId, rosterIds: [side.rosterId] },
      })
    }
  }
  return out
}

const streakStory: Rule = ({ frame, ctx, progress }) => {
  const out: Candidate[] = []
  if (!ctx || progress < 0.3) return out
  for (const m of frame.matchups) {
    if (m.status !== 'live') continue
    for (const { side, other, key } of sides(m)) {
      const mid = managerIdOf(ctx, side)
      if (!mid) continue
      const streak = ctx.season[mid]?.streak
      if (!streak) continue
      const n = Number(streak.slice(1))
      if (n < 3) continue
      const winning = side.score > other.score
      const kind = streak.startsWith('W')
      const id = idFor(frame, 'streak-story', `m${m.matchupId}${key}`)
      const line = pick(
        kind
          ? winning
            ? [
                '{owner} has won {n} straight and this one is trending toward {next}.',
                '{owner} keeps stacking them: {n} in a row with number {next} in reach.',
              ]
            : [
                'The {n} game win streak is wobbling. {owner} trails.',
                '{owner}’s {n} game heater is on the line and fading.',
              ]
          : winning
            ? [
                'After {n} straight losses, {owner} finally smells one.',
                'The skid stops here? {owner} leads after {n} straight defeats.',
              ]
            : [
                '{n} straight losses, and number {next} is slipping toward {owner} too.',
                'It is getting dark for {owner}: {n} losses with another on the way.',
              ],
        id,
      )
      out.push({
        id,
        kind: 'streak-story',
        category: 'history',
        severity: 56,
        headline: renderCopy(line, { owner: side.ownerName, n, next: n + 1 }),
        subline: null,
        refs: { matchupId: m.matchupId, rosterIds: [side.rosterId] },
      })
    }
  }
  return out
}

// ── League-context rules ─────────────────────────────────────────────────────

const topTwoCollide: Rule = ({ frame, ctx }) => {
  const out: Candidate[] = []
  if (!ctx) return out
  for (const m of frame.matchups) {
    const ma = managerIdOf(ctx, m.a)
    const mb = managerIdOf(ctx, m.b)
    const ra = ma ? ctx.power[ma]?.rank : undefined
    const rb = mb ? ctx.power[mb]?.rank : undefined
    if (ra == null || rb == null || ra > 3 || rb > 3) continue
    const id = idFor(frame, 'top-two-collide', `m${m.matchupId}`)
    const [hiRank, loRank] = ra < rb ? [ra, rb] : [rb, ra]
    out.push({
      id,
      kind: 'top-two-collide',
      category: 'league',
      severity: 60,
      headline: renderCopy(
        pick(
          [
            'Number {hi} versus number {lo}. The table said this was the main event.',
            'Heavyweight bout: the power poll’s {hi} and {lo} collide.',
            'Clear your afternoon. Numbers {hi} and {lo} in the poll square off.',
          ],
          id,
        ),
        { hi: hiRank, lo: loRank },
      ),
      subline: renderCopy('{a} vs {b}', { a: m.a.ownerName, b: m.b.ownerName }),
      refs: { matchupId: m.matchupId },
    })
  }
  return out
}

const throneShakes: Rule = ({ frame, ctx, progress }) => {
  const out: Candidate[] = []
  if (!ctx || progress < 0.4) return out
  for (const m of frame.matchups) {
    if (m.status !== 'live') continue
    for (const { side, other } of sides(m)) {
      const mid = managerIdOf(ctx, side)
      const oid = managerIdOf(ctx, other)
      const rank = mid ? ctx.power[mid] : undefined
      const oRank = oid ? ctx.power[oid] : undefined
      if (!rank || rank.rank !== 1 || !oRank) continue
      if (oRank.rank < oRank.total - 2) continue // opponent must be bottom-3
      if (side.score >= other.score) continue
      const id = idFor(frame, 'throne-shakes', `m${m.matchupId}`)
      out.push({
        id,
        kind: 'throne-shakes',
        category: 'league',
        severity: 72,
        headline: renderCopy(
          pick(
            [
              'The number one team in the power poll is losing to the basement.',
              'The throne is shaking. {owner} trails the number {oRank} team.',
              'Upstairs is nervous. The top seed trails the number {oRank} team.',
            ],
            id,
          ),
          { owner: side.ownerName, oRank: oRank.rank },
        ),
        subline: renderCopy('{other} {os}, {team} {ts}', {
          other: other.ownerName,
          os: fmt(other.score),
          team: side.ownerName,
          ts: fmt(side.score),
        }),
        refs: { matchupId: m.matchupId, rosterIds: [side.rosterId, other.rosterId] },
      })
    }
  }
  return out
}

const RULES: Rule[] = [
  nailbiter,
  comeback,
  blowout,
  upsetAlert,
  earthquake,
  photoFinish,
  winSealed,
  monsterGame,
  milestoneWatch,
  rankOvertake,
  dudAlert,
  benchRegret,
  redzoneStakes,
  manDown,
  freeAgentTaunt,
  revengeGame,
  newArrival,
  dropRegret,
  tradeScoreboard,
  grudgeMatch,
  seasonHighWatch,
  streakStory,
  topTwoCollide,
  throneShakes,
]
