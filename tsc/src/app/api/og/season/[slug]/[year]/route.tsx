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

  // Only the theme is used. Its emoji glyphs are deliberately dropped:
  // a colour-emoji crown reads cheap next to the rest of the almanac.
  const { theme } = pickChampionTheme(input)
  const fonts = await loadFonts()

  return renderChampionCard(league.name, season, theme, allYears, fonts)
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

const MAHOG      = '#2a140e'
const MAHOG_DEEP = '#1b0d09'
const MAHOG_SOFT = '#381c13'
const SGOLD      = '#e8c889'
const SGOLD_DEEP = '#a88a4a'
const SCREAM     = '#f4ebd8'
const SCREAM_SOFT = '#c2b49c'
const SCREAM_MUTE = '#9a7f68'

function SStar({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2z" />
    </svg>
  )
}

function scut(s: string, max: number): string {
  const t = (s ?? '').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1).trim()}…`
}

function roman(n: number): string {
  const table: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let v = Math.max(1, Math.floor(n))
  let out = ''
  for (const [num, sym] of table) {
    while (v >= num) { out += sym; v -= num }
  }
  return out
}

function renderChampionCard(
  leagueName: string,
  season: SeasonFile,
  theme: ReturnType<typeof pickChampionTheme>['theme'],
  allYears: number[],
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  // THE VOLUME — the season as a bound mahogany volume with a gold plate
  // struck on the cover. The detail view of the Seasons bookshelf card.
  const champion = season.champion!
  const teamName = (champion.team_name ?? champion.owner_name ?? 'Champion').toString()
  const ownerName = (champion.owner_name ?? '').toString()
  const record = champion.record || ''
  const pf = champion.points_for ? champion.points_for.toFixed(1) : null
  const defeated = season.runner_up?.owner_name ?? null

  const firstYear = allYears.length > 0 ? allYears[0] : season.year
  const volume = Math.max(1, season.year - firstYear + 1)

  // Plate inner width, less its horizontal padding.
  const PLATE_TEXT_W = 232

  // A flat average advance is not good enough here: DM Serif runs ~0.42em
  // for a lowercase-heavy word like "Rizzlers" but ~0.56em for "Bateman",
  // which is how "Bateman" ended up breaking its final "n" onto a third
  // line. Weight per character class instead and solve for the size that
  // fits the longest single word (a word cannot wrap, so it sets the cap).
  const advance = (ch: string): number => {
    if (/[A-Z]/.test(ch)) return 0.68
    if (/[mw]/.test(ch)) return 0.85
    if (/[iljtfr]/.test(ch)) return 0.32
    if (/[ .'-]/.test(ch)) return 0.28
    return 0.52
  }
  const wordWidth = (word: string) =>
    word.split('').reduce((sum, ch) => sum + advance(ch), 0)

  const longestWord = teamName.split(/\s+/).reduce((a, b) => (wordWidth(b) > wordWidth(a) ? b : a), '')
  // 1.08 keeps a little air rather than sitting exactly on the boundary.
  const fitForWord = Math.floor(PLATE_TEXT_W / (Math.max(0.5, wordWidth(longestWord)) * 1.08))
  const fitForWhole = teamName.length > 18 ? 40 : teamName.length > 13 ? 50 : 60
  const teamSize = Math.max(20, Math.min(fitForWhole, fitForWord))

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(155deg, ${MAHOG_DEEP} 0%, ${MAHOG} 48%, ${MAHOG_SOFT} 100%)`,
          color: SCREAM,
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 24% 30%, ${SGOLD}1e 0%, transparent 46%), radial-gradient(circle at 84% 82%, ${theme.accent}1c 0%, transparent 44%)`,
          }}
        />

        <div style={{ display: 'flex', height: '16px', background: SGOLD }} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 56px 0 84px' }}>
          {/* Left — the season masthead */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingRight: '28px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '0.38em',
                textTransform: 'uppercase',
                color: SGOLD,
              }}
            >
              <SStar size={14} color={SGOLD} />
              <span style={{ display: 'flex' }}>{scut(leagueName, 20)} · {theme.label}</span>
              <SStar size={14} color={SGOLD} />
            </div>

            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '104px', lineHeight: 1.0, color: SCREAM, marginTop: '20px' }}>
              {season.year}
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '44px',
                lineHeight: 1.05,
                color: SGOLD,
                marginTop: '2px',
              }}
            >
              Champion.
            </div>

            <div
              style={{
                display: 'flex',
                width: '120px',
                height: '3px',
                background: `linear-gradient(90deg, ${SGOLD_DEEP}, transparent)`,
                marginTop: '24px',
              }}
            />

            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '27px',
                lineHeight: 1.3,
                color: SCREAM_SOFT,
                marginTop: '20px',
                maxWidth: '430px',
              }}
            >
              {defeated ? `${ownerName || teamName} defeated ${defeated}.` : `${ownerName || teamName} took the title.`}
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.26em',
                textTransform: 'uppercase',
                color: SCREAM_MUTE,
                marginTop: '24px',
              }}
            >
              {[record, pf ? `${pf} PF` : null, `${season.total_teams} TEAMS`].filter(Boolean).join('  ·  ')}
            </div>
          </div>

          {/* Right — the bound volume with its struck plate */}
          <div
            style={{
              display: 'flex',
              width: '392px',
              height: '430px',
              transform: 'rotate(2deg)',
              boxShadow: '0 30px 70px rgba(0,0,0,0.7)',
              borderRadius: '5px',
            }}
          >
            {/* Spine */}
            <div
              style={{
                display: 'flex',
                width: '26px',
                background: 'linear-gradient(180deg, #4a1f14 0%, #2a110b 40%, #3a1810 72%, #4a1f14 100%)',
                borderRadius: '5px 0 0 5px',
                border: '1px solid #5a2a1a',
                borderRight: 'none',
              }}
            />
            {/* Cover */}
            <div
              style={{
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(150deg, #4a2016 0%, #33150e 52%, #24100a 100%)',
                border: `1px solid ${SGOLD_DEEP}66`,
                borderRadius: '0 5px 5px 0',
                padding: '26px',
              }}
            >
              {/* The struck plate */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: '272px',
                  padding: '22px 20px 20px',
                  background: `linear-gradient(150deg, ${SGOLD} 0%, #d3b071 44%, ${SGOLD_DEEP} 100%)`,
                  borderRadius: '3px',
                  boxShadow: '0 10px 26px rgba(0,0,0,0.45)',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.34em',
                    textTransform: 'uppercase',
                    color: '#3a2a10',
                    opacity: 0.8,
                  }}
                >
                  Volume {roman(volume)}
                </span>

                <div style={{ display: 'flex', width: '48px', height: '1px', background: '#3a2a1099', marginTop: '12px' }} />

                <span
                  style={{
                    display: 'flex',
                    fontFamily: 'DMSerif',
                    fontSize: `${teamSize}px`,
                    lineHeight: 1.06,
                    color: '#2b1e0b',
                    marginTop: '12px',
                    textAlign: 'center',
                    // Backstop for a pathological single word.
                    maxWidth: `${PLATE_TEXT_W}px`,
                    overflowWrap: 'break-word',
                    wordBreak: 'break-word',
                  }}
                >
                  {scut(teamName, 26)}
                </span>

                {ownerName ? (
                  <span
                    style={{
                      display: 'flex',
                      fontFamily: 'DMSerif',
                      fontStyle: 'italic',
                      fontSize: '22px',
                      color: '#4a3714',
                      marginTop: '6px',
                    }}
                  >
                    {scut(ownerName, 18)}
                  </span>
                ) : null}

                <div style={{ display: 'flex', width: '48px', height: '1px', background: '#3a2a1099', marginTop: '14px' }} />

                <span
                  style={{
                    display: 'flex',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: '#3a2a10',
                    marginTop: '12px',
                  }}
                >
                  {season.year} · {record}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 84px',
            background: SGOLD,
            color: '#22120b',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex' }}>Standings · Champions · The Stories Between</span>
          <span style={{ display: 'flex' }}>thesundaychronicle.app</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
      headers: {
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    },
  )
}
