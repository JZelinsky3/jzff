// OG card for the greatest-team bracket link.
// URL: /api/og/goat/<token>
//
// The link is one address that means different things as the tournament runs,
// so the card it unfurls into has to say which, or somebody opens a "vote now"
// preview and lands on a settled bracket. It resolves the token itself rather
// than taking a phase in a query string: a preview scraped in round one must
// not still be selling a round that closed a week ago.
//
// The composition lives in @/lib/og/goatCard.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import {
  ROOM_SIZE, ROUNDS, buildBracket, gamesInRound, label, record, winnerOf,
} from '@/lib/greatestTeam'
import { leagueForToken, readBracket, votedNames } from '@/app/goat/actions'
import { GoatCard, type GoatPhase } from '@/lib/og/goatCard'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

async function loadFonts() {
  const [serif, serifItalic, mono, monoBold] = await Promise.all([
    readFile(path.join(FONT_DIR, 'DMSerifDisplay-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'DMSerifDisplay-Italic.ttf')),
    readFile(path.join(FONT_DIR, 'JetBrainsMono-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'JetBrainsMono-Bold.ttf')),
  ])
  return [
    { name: 'DMSerif', data: serif, style: 'normal' as const, weight: 400 as const },
    { name: 'DMSerif', data: serifItalic, style: 'italic' as const, weight: 400 as const },
    { name: 'JetBrains', data: mono, style: 'normal' as const, weight: 400 as const },
    { name: 'JetBrains', data: monoBold, style: 'normal' as const, weight: 700 as const },
  ]
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const fonts = await loadFonts()
  const { token } = await params

  const league = await leagueForToken(token)

  // A dead token gets a card that says so, rather than one selling a bracket
  // the holder cannot open.
  if (!league) {
    return new ImageResponse(
      <GoatCard phase="gone" roundName={null} turnout={0} roomSize={ROOM_SIZE} ties={[]} champion={null} />,
      { width: 1200, height: 630, fonts },
    )
  }

  const state = await readBracket(league.id)
  const bracket = buildBracket(state.results)
  const champ = winnerOf(bracket)

  const phase: GoatPhase = champ ? 'crowned' : state.openRound ? 'open' : 'between'
  const roundName = state.openRound ? ROUNDS.find((r) => r.id === state.openRound)?.name ?? null : null

  // Who has voted is already public on the page, which greys out a name the
  // moment it is used, so the card can show the same count.
  const turnout = state.openRound ? (await votedNames(league.id, state.openRound)).length : 0

  // While a round is live the card shows its games with no winner marked: a
  // running count on a live round is a bandwagon, and the page seals it too.
  // Between rounds it shows the last round that actually settled.
  const source = state.openRound
    ? gamesInRound(bracket, state.openRound).filter((g) => g.ready)
    : [...ROUNDS].reverse().map((r) => gamesInRound(bracket, r.id).filter((g) => g.winner !== null)).find((g) => g.length) ?? []

  const ties = source.slice(0, 4).map((g) => ({
    seedA: g.home?.seed ?? 0,
    nameA: g.home ? label(g.home) : 'TBD',
    seedB: g.away?.seed ?? 0,
    nameB: g.away ? label(g.away) : 'TBD',
    wonA: !state.openRound && g.winner !== null && g.winner === g.home?.seed,
    wonB: !state.openRound && g.winner !== null && g.winner === g.away?.seed,
  }))

  return new ImageResponse(
    <GoatCard
      phase={phase}
      roundName={roundName}
      turnout={turnout}
      roomSize={ROOM_SIZE}
      ties={champ ? [] : ties}
      champion={champ ? { name: label(champ), team: champ.team, record: record(champ) } : null}
    />,
    { width: 1200, height: 630, fonts },
  )
}
