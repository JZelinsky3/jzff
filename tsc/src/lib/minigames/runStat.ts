// What a posted run prints, per game: one big figure and one small line.
//
// Shared by the leaderboards and the profile's record book, so a run reads
// the same on both. Display only; the score itself is always server-derived.

import type { GameId, RunDisplay } from './leaderboard'

export function runStat(game: GameId, d: RunDisplay, score: number): { big: string; small: string } {
  switch (game) {
    case 'roulette':
      return { big: d.record ?? String(score), small: `${d.ppg ?? score} PPG` }
    case 'gauntlet':
      return d.streak != null
        ? { big: String(d.streak), small: 'straight' }
        : { big: `${d.correct ?? score}/${d.asked ?? 10}`, small: 'correct' }
    case 'redraft':
      return { big: d.record ?? String(score), small: `${d.margin ?? 0} a game` }
    case 'multiverse':
      // Never `score`: that one is a packed sort key (wins, then win rate,
      // then scoring) and printing it would put a ten-digit number on the
      // board. The record is the display and it always exists.
      return { big: d.record ?? '·', small: `${d.ppg ?? 0} PPG` }
    case 'pack-empire':
      return { big: (d.accolades ?? score).toLocaleString(), small: d.tier ?? 'accolades' }
    default:
      return { big: `${d.correct ?? score}/${d.asked ?? 10}`, small: 'correct' }
  }
}
