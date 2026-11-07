// The defenses a Season offense plays (League Mode's Season variation). Pure data
// plus the seeded schedule; no imports beyond types, so the server, the pages and
// the sims all read the same fronts.
//
// A defense never scores and never drafts. It's a set of multipliers on what an
// offense can do: each lane it shuts (under 1) or gives up (over 1), how hard it
// gets after the quarterback (rush, on the line's protection), how often it takes
// the ball away, and COUNTERS, the kinds of player it's built to stop or that
// beat it. That's Joey's ask: a pass-heavy team with deep threats walks into good
// corners and struggles, the same team eats against a front stacked for the run.
// Every front is weak somewhere, so there's always a sub worth making.
//
// The schedule is fixed by the league's seed: every team in a league sees the same
// eight fronts in the same order, each with its points to beat, all shown before
// the season starts, so a team can be built for what's coming.

import type { ArchetypeTag } from './archetypes'

export type DefenseLanes = { run: number; short: number; deep: number; redZone: number }

export type Defense = {
  id: string
  name: string
  /** One line on how it plays. */
  blurb: string
  /** What it takes away and where it's soft, for the scouting report. */
  shuts: string
  soft: string
  lanes: DefenseLanes
  /** On the line's protection: under 1 is a pass rush that gets home. */
  rush: number
  /** Takeaways: over 1 picks off more passes and forces more fumbles. */
  takeaways: number
  /** Kinds of player this front is built to stop (under 1) or that beat it (over 1). */
  counters: Partial<Record<ArchetypeTag, number>>
}

export const DEFENSES: Defense[] = [
  {
    id: 'base',
    name: 'Base Four-Three',
    blurb: 'Nothing fancy, nothing missing.',
    shuts: 'Nothing in particular',
    soft: 'Nothing in particular',
    lanes: { run: 1.0, short: 1, deep: 1, redZone: 1 },
    rush: 1,
    takeaways: 1,
    counters: {},
  },
  {
    id: 'lockdown',
    name: 'Lockdown Corners',
    blurb: 'Two corners who take your best receivers out of the game.',
    shuts: 'Deep shots, Deep Threats, Gunslingers',
    soft: 'The run, Bell Cows, Road Graders',
    lanes: { run: 1.2, short: 0.81, deep: 0.48, redZone: 1 },
    rush: 1,
    takeaways: 1.05,
    counters: { 'Deep Threat': 0.61, Gunslinger: 0.74, 'Bell Cow': 1.2, 'Road Grader': 1.16 },
  },
  {
    id: 'two-high',
    name: 'Two-High Shell',
    blurb: 'Both safeties deep. Nothing gets over the top.',
    shuts: 'Deep shots, Seam Stretchers',
    soft: 'Underneath and the run',
    lanes: { run: 1.16, short: 1.16, deep: 0.48, redZone: 1 },
    rush: 1.05,
    takeaways: 1,
    counters: { 'Deep Threat': 0.74, 'Seam Stretcher': 0.68, Possession: 1.2, 'Safety Valve': 1.2, 'Bell Cow': 1.1 },
  },
  {
    id: 'box',
    name: 'Eight In The Box',
    blurb: 'A safety walks down. They dare you to throw.',
    shuts: 'The run, Bell Cows, Road Graders',
    soft: 'Play action and deep shots',
    lanes: { run: 0.48, short: 1, deep: 1.23, redZone: 0.94 },
    rush: 1,
    takeaways: 1,
    counters: { 'Bell Cow': 0.64, 'Road Grader': 0.74, 'Goal Line Back': 0.74, 'Seam Stretcher': 1.23, 'Deep Threat': 1.16 },
  },
  {
    id: 'edge',
    name: 'Edge Rushers',
    blurb: 'Two pass rushers who live in the backfield.',
    shuts: 'Slow-developing throws, a weak line',
    soft: 'Quarterbacks who run, screens, Pass Protectors',
    lanes: { run: 1.1, short: 0.94, deep: 0.84, redZone: 1 },
    rush: 0.48,
    takeaways: 1.08,
    counters: { Gunslinger: 0.74, 'Dual Threat': 1.32, 'Receiving Back': 1.2, 'Pass Protector': 1.26, Surgeon: 1.1 },
  },
  {
    id: 'blitz',
    name: 'Zero Blitz',
    blurb: 'Everybody comes. Somebody is open, if you find him fast.',
    shuts: 'Holding the ball, long-developing shots',
    soft: 'Quick throws, Surgeons, Safety Valves',
    lanes: { run: 1.03, short: 1.16, deep: 0.74, redZone: 1.03 },
    rush: 0.61,
    takeaways: 1.2,
    counters: { Surgeon: 1.26, 'Safety Valve': 1.26, Possession: 1.13, Gunslinger: 0.74, 'Deep Threat': 0.87 },
  },
  {
    id: 'hawks',
    name: 'Ball Hawks',
    blurb: 'A secondary that reads the quarterback and jumps routes.',
    shuts: 'Risky throws, Gunslingers',
    soft: 'The run, careful quarterbacks',
    lanes: { run: 1.08, short: 0.94, deep: 0.81, redZone: 1 },
    rush: 1,
    takeaways: 1.6,
    counters: { Gunslinger: 0.71, Surgeon: 1.16, 'Bell Cow': 1.1 },
  },
  {
    id: 'bend',
    name: "Bend Don't Break",
    blurb: 'Yards are easy. Touchdowns are not.',
    shuts: 'The red zone, Red Zone Targets, Goal Line Backs',
    soft: 'Moving the ball between the twenties',
    lanes: { run: 1.08, short: 1.13, deep: 1, redZone: 0.48 },
    rush: 1.05,
    takeaways: 1,
    counters: { 'Red Zone Target': 0.64, 'Goal Line Back': 0.64, Possession: 1.08, 'Bell Cow': 1.08 },
  },
  {
    id: 'zone',
    name: 'Cover Three Zone',
    blurb: 'Every short throw has a defender sitting on it.',
    shuts: 'Underneath, Possession receivers, Safety Valves',
    soft: 'Seams and deep shots',
    lanes: { run: 1.08, short: 0.61, deep: 0.94, redZone: 1 },
    rush: 1.03,
    takeaways: 1.05,
    counters: { Possession: 0.68, 'Safety Valve': 0.68, 'Receiving Back': 0.81, 'Deep Threat': 1.2, 'Seam Stretcher': 1.26 },
  },
  {
    id: 'nickel',
    name: 'Nickel Speed',
    blurb: 'Five defensive backs and a light front. Fast, and small.',
    shuts: 'The short passing game, Receiving Backs',
    soft: 'Running straight at them, Bell Cows, Road Graders',
    lanes: { run: 1.23, short: 0.81, deep: 0.87, redZone: 1 },
    rush: 1,
    takeaways: 1,
    counters: { 'Receiving Back': 0.74, Possession: 0.87, 'Bell Cow': 1.23, 'Road Grader': 1.16, 'Blocking TE': 1.2 },
  },
]

const BY_ID = new Map(DEFENSES.map((d) => [d.id, d]))

export function defenseById(id: string): Defense | null {
  return BY_ID.get(id) ?? null
}

/** A playoff front: the same defense, a step better everywhere. */
export const ELITE = 0.88

export function elite(d: Defense): Defense {
  const l = d.lanes
  return {
    ...d,
    name: `Elite ${d.name}`,
    lanes: { run: l.run * ELITE, short: l.short * ELITE, deep: l.deep * ELITE, redZone: l.redZone * ELITE },
    rush: d.rush * 0.95,
    takeaways: d.takeaways * 1.1,
  }
}

export const SEASON_GAMES = 8

/** What a week asks for: the front, and the points that beat it. */
export type ScheduleWeek = { week: number; defense: string; line: number }

/** The points to beat: LINE_BASE in week one, climbing LINE_RAMP a week because
    every game pays a pack and a roster that uses its bench gets better all season
    (about two points a week in sim/season-sim.ts), then a few either side so some
    weeks are harder than others even before the front. Without the climb nine in
    ten teams cleared the line by week eight and a slow start could never come back. */
export const LINE_BASE = 25
export const LINE_RAMP = 2.1
const LINE_SWING = [-3, -2, -1, 0, 0, 1, 2, 3]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** A small seeded generator (mulberry32). Deterministic, not secret: what a
    schedule holds is shown to everyone ahead of time anyway. */
export function rngFor(seed: string): () => number {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Eight weeks, eight different fronts. The base defense opens the season, so
    week one is the plain read and every front after it asks something. */
export function scheduleFor(seed: string): ScheduleWeek[] {
  const rnd = rngFor(`schedule|${seed}`)
  const rest = shuffle(
    DEFENSES.filter((d) => d.id !== 'base'),
    rnd
  ).slice(0, SEASON_GAMES - 1)
  const swings = shuffle(LINE_SWING, rnd)
  return ['base', ...rest.map((d) => d.id)].map((defense, i) => ({ week: i + 1, defense, line: Math.round(LINE_BASE + LINE_RAMP * i) + swings[i] }))
}
