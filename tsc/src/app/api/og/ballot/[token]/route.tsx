// OG card for the win-total ballot link.
// URL: /api/og/ballot/<token>
//
// The link a manager gets is one address that means three different things
// depending on where the league is, so the card it unfurls into has to say
// which one, or somebody opens a "vote now" preview and lands on a results
// page. It resolves the token itself rather than taking the phase as a
// param: a preview scraped in January must not still be selling a ballot
// that closed in August.
//
// The composition lives in @/lib/og/ballotCard.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { PAMS_ROSTER } from '@/lib/winBallot'
import { leagueForToken, readBoard, submittedNames, votedNames } from '@/app/ballot/actions'
import { BallotCard, type CardPhase } from '@/lib/og/ballotCard'

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const fonts = await loadFonts()
  const { token } = await params

  const league = await leagueForToken(token)
  const board = league ? await readBoard(league.id) : null

  // A dead token gets a card that says so, rather than one that sells a
  // ballot the holder can't open.
  const phase: CardPhase = !league ? 'gone' : !board ? 'ballot' : board.revealed ? 'open' : 'vote'

  // Who has answered is already public on the page itself, which greys out
  // a name the moment it is used, so the card can show the same thing.
  const answered = !league ? [] : phase === 'ballot'
    ? await submittedNames(league.id)
    : await votedNames(league.id)

  const lines = board
    ? [...PAMS_ROSTER]
        .map((m) => ({ name: m.name, line: board.lines[m.name] ?? 0 }))
        .sort((a, b) => b.line - a.line)
    : []

  const room = PAMS_ROSTER.map((m) => ({ name: m.name, done: answered.includes(m.name) }))

  return new ImageResponse(
    <BallotCard phase={phase} turnout={answered.length} lines={lines} room={room} />,
    { width: 1200, height: 630, fonts },
  )
}
