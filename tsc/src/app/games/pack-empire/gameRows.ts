// A row in a mode's game list, and the three piles the lobbies sort them into.
// Kept apart from GameList.tsx because the lobbies are server pages and that's
// a client component: a server page can't call a function exported from one.

export type GameRow = {
  id: string
  href: string
  opponent: string
  status: { label: string; color: string }
  /** Printed after the status: a Mega Draft's code. */
  code?: string
  /** Printed after that: a Versus that isn't plain Classic. */
  format?: string | null
  done: boolean
  yours: number | null
  theirs: number | null
  canDelete: boolean
  /** The next move is yours. */
  onYou: boolean
}

/** The games the page should lead with, the ones out with someone else, and
    the record. */
export function splitGames(rows: GameRow[]) {
  const live = rows.filter((r) => !r.done)
  return {
    onYou: live.filter((r) => r.onYou),
    waiting: live.filter((r) => !r.onYou),
    finished: rows.filter((r) => r.done),
  }
}
