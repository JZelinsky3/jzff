// OG card for THE MILK EXAM link.
// URL: /api/og/exam/<token>
//
// The card resolves the token itself rather than taking turnout as a param,
// so a preview scraped on day one and re-read a week later reports what is
// actually true then. A dead token gets a card that says so rather than one
// selling a game the holder cannot open.
//
// The composition lives in @/lib/og/examCard.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { QUESTIONS, ROSTER, standings } from '@/lib/milkExam'
import { leagueForToken, readRuns } from '@/app/exam/actions'
import { ExamCard, type ExamPhase } from '@/lib/og/examCard'

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
  const runs = league ? await readRuns(league.id) : []

  const phase: ExamPhase = !league
    ? 'gone'
    : runs.length === 0
    ? 'fresh'
    : runs.length >= ROSTER.length
    ? 'full'
    : 'running'

  // Scores are already on the page for anyone holding the link, so the card
  // can show the same board without leaking anything new.
  const top = standings(runs).map((r) => ({ name: r.name, score: r.score }))

  return new ImageResponse(
    <ExamCard
      phase={phase}
      count={QUESTIONS.length}
      turnout={runs.length}
      seats={ROSTER.length}
      top={top}
    />,
    { width: 1200, height: 630, fonts },
  )
}
