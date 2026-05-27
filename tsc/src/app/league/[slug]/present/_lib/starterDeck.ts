// One-click starter deck. Generates a ~13-slide showcase from whatever data
// the league has. Slides are produced as fully-populated SlideInstance values,
// so the owner can hit Present immediately without editing anything.
//
// Slides are dropped gracefully when the underlying data isn't there — e.g.
// the rivalry section is omitted entirely if the league has no curated
// rivalries, so the deck never produces empty-state slides.

import { BLOCK_INDEX } from './blocks'
import type { LeaguePresentationData } from './leagueData'
import type { SlideInstance } from './types'

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function makeSlide(blockId: string, overrides: Record<string, string> = {}): SlideInstance | null {
  const def = BLOCK_INDEX[blockId]
  if (!def) return null
  return { id: newId(), blockId, values: { ...def.defaults(), ...overrides } }
}

export function buildStarterDeck(data: LeaguePresentationData, leagueName: string): SlideInstance[] {
  const finishedSeasons = data.seasons.filter((s) => s.isFinished).slice().sort((a, b) => b.year - a.year)
  const mostRecentFinished = finishedSeasons[0] ?? null
  const allFinished = finishedSeasons.slice().sort((a, b) => a.year - b.year)
  const yearRange = allFinished.length > 0
    ? (allFinished.length === 1
        ? String(allFinished[0].year)
        : `${allFinished[0].year}–${allFinished[allFinished.length - 1].year}`)
    : 'A league retrospective'

  const out: SlideInstance[] = []
  const push = (s: SlideInstance | null) => { if (s) out.push(s) }

  // 1 · Cover
  push(makeSlide('title', {
    kicker: '★ Volume One ★',
    headline: leagueName,
    subtitle: yearRange,
  }))

  // 2 · State-of-the-league divider
  push(makeSlide('section', {
    label: 'State of the League',
    sub: 'The story so far',
  }))

  // 3-4 · Banner room (champion roll + championships leaderboard)
  push(makeSlide('champion-roll', { title: 'Champions' }))
  push(makeSlide('championships-leaderboard', { title: 'Most championships', limit: '8' }))

  // 5 · Most-recent finished season recap (final standings)
  if (mostRecentFinished) {
    push(makeSlide('final-standings', {
      season: mostRecentFinished.id,
      title: `${mostRecentFinished.year} final standings`,
      limit: '0',
    }))
  }

  // 6-7 · All-time leaderboards
  push(makeSlide('all-time-wins', { title: 'All-time wins', limit: '8' }))
  push(makeSlide('all-time-points', { title: 'All-time points', limit: '8' }))

  // 8 · Moments divider
  push(makeSlide('section', {
    label: 'Defining Moments',
    sub: 'The games we still talk about',
  }))

  // 9-12 · Highlight reel
  push(makeSlide('highest-score', { title: 'Highest single week' }))
  push(makeSlide('biggest-blowout', { title: 'Biggest blowout' }))
  push(makeSlide('closest-game', { title: 'Closest finish' }))
  push(makeSlide('longest-streak', { title: 'Longest win streak' }))

  // 13-14 · Rivalries — only if curated
  if (data.rivalries.length > 0) {
    push(makeSlide('section', {
      label: 'The Feuds',
      sub: 'Bad blood, on the record',
    }))
    push(makeSlide('most-lopsided-rivalry', { title: 'Most one-sided' }))
    // Feature the first curated rivalry alphabetically
    const firstRivalry = data.rivalries.slice().sort((a, b) => a.name.localeCompare(b.name))[0]
    if (firstRivalry) {
      push(makeSlide('featured-rivalry', { rivalry: firstRivalry.id }))
    }
  }

  // Closing
  push(makeSlide('closing', {
    headline: "That's the league.",
    signoff: 'The Commissioner',
  }))

  return out
}
