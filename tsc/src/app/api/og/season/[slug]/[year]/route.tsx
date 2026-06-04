// OG image generator for season champion pages.
// URL: /api/og/season/<slug>/<year>
//
// Renders a 1200x630 "coronation card" highlighting that year's champion.
// Theme is picked by HOW they won — first-time/dynasty/threepeat/underdog/
// juggernaut — so the art carries product signal, not just decoration.
//
// CDN-cached per (slug, year); busted only when the league bundle's
// `league-<id>` tag is revalidated by sync.

import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLeagueBundle } from '@/lib/leagueBundleCache'
import { pickChampionTheme, type ChampionInput } from '@/lib/og/championTheme'

export const runtime = 'nodejs'

type ChampionRow = {
  team_name: string | null
  owner_name: string | null
  owner_user_id: string | null
  record: string
  points_for: number
}

type RunnerUpRow = {
  team_name: string | null
  owner_name: string | null
}

type SeasonStanding = {
  final_rank: number | null
  reg_season_rank: number | null
  owner_name: string | null
  owner_user_id: string | null
  wins: number
  losses: number
  ties: number
  points_for: number
}

type SeasonFile = {
  year: number
  total_teams: number
  champion: ChampionRow | null
  runner_up: RunnerUpRow | null
  standings: SeasonStanding[]
}

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

function toRoman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  const map: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let out = ''
  let v = Math.floor(n)
  for (const [val, sym] of map) {
    while (v >= val) { out += sym; v -= val }
  }
  return out
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; year: string }> }
) {
  const { slug, year: yearStr } = await params
  const year = Number(yearStr)
  if (!Number.isFinite(year)) {
    return new Response('Bad year', { status: 400 })
  }

  const db = createAdminClient()
  const { data: league } = await db
    .from('leagues')
    .select('id, name, slug, published_at')
    .eq('slug', slug)
    .maybeSingle()
  if (!league || !league.published_at) {
    return new Response('Not found', { status: 404 })
  }

  const bundle = await getLeagueBundle(league.id, league.slug)
  const season = bundle[`seasons/${year}.json`] as SeasonFile | undefined
  if (!season || !season.champion) {
    return new Response('No champion on record', { status: 404 })
  }

  // Pull all season files we already have in the bundle so we can spot
  // back-to-back/threepeat/first-time-ever titles without an extra DB hit.
  const seasonByYear = new Map<number, SeasonFile>()
  for (const [key, value] of Object.entries(bundle)) {
    const m = /^seasons\/(\d{4})\.json$/.exec(key)
    if (m) seasonByYear.set(Number(m[1]), value as SeasonFile)
  }
  const allYears = Array.from(seasonByYear.keys()).sort((a, b) => a - b)
  const championStreak = computeChampionStreak(year, season.champion.owner_user_id, seasonByYear, allYears)
  const isFirstTimeChamp = computeIsFirstTimeChamp(year, season.champion.owner_user_id, seasonByYear, allYears)

  const champStanding = season.standings.find(
    (r) => r.owner_user_id === season.champion!.owner_user_id
  )
  const isJuggernaut = champStanding?.reg_season_rank === 1

  const input: ChampionInput = {
    year,
    championOwnerId: season.champion.owner_user_id,
    championRegSeasonRank: champStanding?.reg_season_rank ?? null,
    championWins: champStanding?.wins ?? 0,
    championLosses: champStanding?.losses ?? 0,
    totalTeams: season.total_teams,
    isJuggernaut,
    isBackToBack: championStreak >= 2,
    isThreepeatPlus: championStreak >= 3,
    isFirstTimeChamp,
  }

  const { theme, glyph } = pickChampionTheme(input)
  const fonts = await loadFonts()

  return renderChampionCard(league.name, season, glyph, theme, allYears, fonts)
}

function computeChampionStreak(
  year: number,
  ownerId: string | null,
  seasonByYear: Map<number, SeasonFile>,
  allYears: number[],
): number {
  if (!ownerId) return 1
  let streak = 1
  for (let y = year - 1; allYears.includes(y); y--) {
    const prev = seasonByYear.get(y)
    if (!prev?.champion || prev.champion.owner_user_id !== ownerId) break
    streak++
  }
  return streak
}

function computeIsFirstTimeChamp(
  year: number,
  ownerId: string | null,
  seasonByYear: Map<number, SeasonFile>,
  allYears: number[],
): boolean {
  if (!ownerId) return false
  for (const y of allYears) {
    if (y >= year) break
    if (seasonByYear.get(y)?.champion?.owner_user_id === ownerId) return false
  }
  return true
}

function renderChampionCard(
  leagueName: string,
  season: SeasonFile,
  glyph: string,
  theme: ReturnType<typeof pickChampionTheme>['theme'],
  allYears: number[],
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  const champion = season.champion!
  const teamName = (champion.team_name ?? champion.owner_name ?? 'Champion').toString()
  const ownerName = (champion.owner_name ?? '').toString()
  const record = champion.record || ''
  const pf = champion.points_for ? champion.points_for.toFixed(1) : null
  const defeatedLine = season.runner_up?.owner_name
    ? `defeated ${season.runner_up.owner_name}`
    : null

  // Volume number relative to league's first recorded year — keeps the
  // editorial "Volume X · MMXXV" framing the templates use everywhere.
  const firstYear = allYears.length > 0 ? allYears[0] : season.year
  const volume = Math.max(1, season.year - firstYear + 1)

  const gridiron = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><path d="M0 40h80M40 0v80" stroke="#1e1e1e" stroke-width="1"/></svg>`
  )

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: '#0a0a0a',
          color: '#f3f4f6',
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        {/* Gridiron rule overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            opacity: 0.5,
            backgroundImage: `url("data:image/svg+xml;utf8,${gridiron}")`,
            backgroundSize: '80px 80px',
          }}
        />
        {/* Theme-accent radial halo behind the glyph */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 50% 45%, ${theme.accent}33 0%, transparent 38%), radial-gradient(circle at 10% 90%, ${theme.accent}1a 0%, transparent 45%), radial-gradient(circle at 90% 10%, ${theme.accent}1a 0%, transparent 45%)`,
          }}
        />

        {/* TOP BAR */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '32px 56px 0',
            fontSize: '17px',
            letterSpacing: '0.3em',
            color: theme.accent,
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex' }}>{leagueName.toUpperCase()} · CHAMPION</span>
          <span style={{ display: 'flex', color: '#9ca3af', letterSpacing: '0.32em' }}>
            THE SUNDAY CHRONICLE
          </span>
        </div>

        {/* THEME BANNER */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '14px',
            zIndex: 2,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '7px 22px',
              border: `1px solid ${theme.accent}66`,
              background: `${theme.accent}12`,
              fontSize: '15px',
              letterSpacing: '0.4em',
              color: theme.accent,
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            <div style={{ display: 'flex', width: '24px', height: '1px', background: theme.accent }} />
            <span style={{ display: 'flex' }}>{theme.label} · {season.year}</span>
            <div style={{ display: 'flex', width: '24px', height: '1px', background: theme.accent }} />
          </div>
        </div>

        {/* MAIN — single-focus coronation */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 60px',
            zIndex: 2,
          }}
        >
          {/* Trophy/crown glyph in glowing ring */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '210px',
              height: '210px',
              borderRadius: '50%',
              border: `3px solid ${theme.accent}`,
              background: `radial-gradient(circle, ${theme.accent}33 0%, #0a0a0a 70%)`,
              boxShadow: `0 0 80px ${theme.accent}66`,
              fontSize: '140px',
              lineHeight: 1,
              marginBottom: '24px',
            }}
          >
            {glyph}
          </div>

          {/* Team name (huge serif) */}
          <div
            style={{
              fontFamily: 'DMSerif',
              fontSize: '64px',
              lineHeight: 1,
              color: '#f3f4f6',
              textAlign: 'center',
              maxWidth: '1000px',
              display: 'flex',
              marginBottom: '8px',
            }}
          >
            {teamName}
          </div>

          {/* Owner */}
          {ownerName && (
            <div
              style={{
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '26px',
                color: theme.accent,
                marginBottom: '20px',
                display: 'flex',
              }}
            >
              {ownerName}
            </div>
          )}

          {/* Record line */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '18px',
              fontFamily: 'JetBrains',
              fontSize: '17px',
              letterSpacing: '0.28em',
              color: '#d1d5db',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            {record && <span style={{ display: 'flex' }}>{record}</span>}
            {record && pf && <span style={{ display: 'flex', color: '#374151' }}>·</span>}
            {pf && <span style={{ display: 'flex' }}>{pf} PF</span>}
          </div>

          {/* Defeated line */}
          {defeatedLine && (
            <div
              style={{
                marginTop: '10px',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '20px',
                color: '#9ca3af',
                display: 'flex',
              }}
            >
              {defeatedLine}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 56px 28px',
            fontSize: '13px',
            letterSpacing: '0.28em',
            color: '#6b7280',
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex' }}>VOLUME {toRoman(volume)} · {toRoman(season.year)}</span>
          <span style={{ display: 'flex', color: theme.accent, fontWeight: 700 }}>JZFF.ONLINE</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
      emoji: 'twemoji',
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    },
  )
}
