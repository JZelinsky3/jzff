// OG card for the season-awards page.
// URL: /api/og/awards/<slug>/<year>
//
// Computed from the same loader the page renders, so the card can never sell
// a winner the page does not show. Three trophies make the card: the two that
// need a whole season of lineups to know (bench points, schedule luck) and the
// single loudest moment, which is what actually gets clicked.
//
// The composition lives in @/lib/og/awardsCard.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadSeasonAwards } from '@/lib/seasonAwards'
import { AwardsCard } from '@/lib/og/awardsCard'

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

// The three the card leads with, in order of preference. Anything missing
// (a season with no lineup coverage has no bench award) falls through to
// whatever else was handed out, so the card is never short.
const PREFERRED = ['bench-coat', 'horseshoe', 'woodshed', 'hard-luck', 'photo-finish', 'ceiling']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; year: string }> },
) {
  const fonts = await loadFonts()
  const { slug, year: rawYear } = await params
  const year = Number(rawYear)

  const db = createAdminClient()
  const { data: league } = await db.from('leagues').select('id, name').eq('slug', slug).maybeSingle()

  const result = league && Number.isInteger(year) ? await loadSeasonAwards(league.id as string, year) : null
  const awards = result?.awards ?? []

  const picked = [
    ...PREFERRED.map((k) => awards.find((a) => a.key === k)).filter((a) => !!a),
    ...awards.filter((a) => !PREFERRED.includes(a.key)),
  ].slice(0, 3)

  return new ImageResponse(
    <AwardsCard
      leagueName={(league?.name as string) ?? 'The Sunday Chronicle'}
      year={Number.isInteger(year) ? year : new Date().getFullYear()}
      headline={picked.map((a) => ({ title: a.title, winner: a.winner, value: a.value }))}
      count={awards.length}
    />,
    { width: 1200, height: 630, fonts },
  )
}
