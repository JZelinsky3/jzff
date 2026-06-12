// OG image generator for the public almanac landing page.
// URL: /api/og/league/<slug>
//
// Renders a 1200x630 "book cover" card for the league's almanac. This is
// the default share image when someone links a league for the first time
// (e.g. "check out my league on TSC: jzff.online/leagues/<slug>"), so it
// has to read as identity-of-the-league, not as a stat dashboard.
//
// CDN-cached per slug; busted only when the league bundle's `league-<id>`
// tag is revalidated by sync.

import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLeagueBundle } from '@/lib/leagueBundleCache'

export const runtime = 'nodejs'

type LeagueFile = {
  name: string
  founded: number | null
  current_season: number | null
  total_matchups: number | null
  total_seasons: number | null
  current_members_count: number | null
  defending_champion: {
    owner_name: string | null
    team_name: string | null
    year: number | null
  } | null
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

// Per-chapter stamp for ?page= variants: the shared cover card swaps its
// subtitle ("The Chronicle · The Standings") and accent so each page's
// link preview reads as its own chapter rather than a generic cover.
const CHAPTERS: Record<string, { label: string; accent: string }> = {
  standings: { label: 'The Standings', accent: '#7fa8bd' },   // steel
  records: { label: 'The Record Book', accent: '#e8c889' },   // gold
  managers: { label: 'The Managers', accent: '#e8c889' },     // gold
  draft: { label: 'The Draft Archive', accent: '#c8a464' },   // brass
  rivalries: { label: 'The Rivalries', accent: '#c86848' },   // rust
  seasons: { label: 'The Seasons', accent: '#7fa8bd' },       // steel
  live: { label: 'The Live Season', accent: '#e8c850' },      // bright gold
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

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
  const data = bundle['league.json'] as LeagueFile | undefined
  if (!data) return new Response('No league data', { status: 404 })

  const pageKey = req.nextUrl.searchParams.get('page')
  const chapter = (pageKey && CHAPTERS[pageKey]) || null

  const fonts = await loadFonts()
  return renderLeagueCard(data, fonts, chapter)
}

function renderLeagueCard(
  d: LeagueFile,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
  chapter: { label: string; accent: string } | null,
) {
  const accent = chapter?.accent ?? '#e8c889' // editorial gold for the front cover
  const founded = d.founded ?? d.current_season ?? new Date().getFullYear()
  const currentSeason = d.current_season ?? founded
  const volume = Math.max(1, currentSeason - founded + 1)

  // Spell the league name as headlines do: split the last word so the
  // typography can balance head/tail just like the actual almanac hero.
  const words = (d.name ?? '').trim().split(/\s+/).filter(Boolean)
  const head = words.length > 1 ? words.slice(0, -1).join(' ') : ''
  const tail = words.length > 0 ? words[words.length - 1] : d.name

  const stats = [
    d.total_seasons != null ? `${d.total_seasons} SEASON${d.total_seasons === 1 ? '' : 'S'}` : null,
    d.total_matchups != null ? `${d.total_matchups} GAMES` : null,
    d.current_members_count != null
      ? `${d.current_members_count} MANAGER${d.current_members_count === 1 ? '' : 'S'}`
      : null,
  ].filter(Boolean).join('  ·  ')

  const champ = d.defending_champion
  const defender = champ?.owner_name
    ? `Defender: ${champ.owner_name}${champ.year ? ` · ${champ.year}` : ''}`
    : null

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
        {/* Warm halo around the center to feel like a book cover */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(ellipse at 50% 50%, ${accent}1f 0%, transparent 55%)`,
          }}
        />

        {/* Top masthead */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '30px 56px 0',
            fontSize: '15px',
            letterSpacing: '0.4em',
            color: accent,
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <div style={{ display: 'flex', width: '36px', height: '1px', background: accent }} />
            <span style={{ display: 'flex' }}>THE SUNDAY CHRONICLE</span>
            <div style={{ display: 'flex', width: '36px', height: '1px', background: accent }} />
          </div>
        </div>

        {/* Main cover content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '0 60px',
            zIndex: 2,
          }}
        >
          {/* League name (head + tail stacked the way the almanac hero does) */}
          {head && (
            <div
              style={{
                fontFamily: 'DMSerif',
                fontSize: '54px',
                lineHeight: 1,
                color: '#d1d5db',
                marginBottom: '6px',
                display: 'flex',
              }}
            >
              {head}
            </div>
          )}
          <div
            style={{
              fontFamily: 'DMSerif',
              fontSize: '120px',
              lineHeight: 1,
              color: '#f3f4f6',
              textAlign: 'center',
              maxWidth: '1080px',
              display: 'flex',
            }}
          >
            {tail}
          </div>

          {/* Subtitle: "The Chronicle · Volume V" on the front cover, or
              "The Chronicle · <Chapter>" on per-page variants */}
          <div
            style={{
              marginTop: '22px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              fontFamily: 'DMSerif',
              fontStyle: 'italic',
              fontSize: '28px',
              color: accent,
            }}
          >
            <span style={{ display: 'flex' }}>The Chronicle</span>
            <span style={{ display: 'flex', color: '#374151', fontStyle: 'normal' }}>·</span>
            <span style={{ display: 'flex' }}>{chapter ? chapter.label : `Volume ${toRoman(volume)}`}</span>
          </div>

          {/* Decorative rule */}
          <div
            style={{
              display: 'flex',
              width: '120px',
              height: '1px',
              background: `${accent}55`,
              margin: '28px 0 22px',
            }}
          />

          {/* Stats line */}
          {stats && (
            <div
              style={{
                display: 'flex',
                fontFamily: 'JetBrains',
                fontWeight: 700,
                fontSize: '16px',
                letterSpacing: '0.28em',
                color: '#d1d5db',
                textTransform: 'uppercase',
              }}
            >
              EST. {founded}  ·  {stats}
            </div>
          )}

          {/* Defending champion */}
          {defender && (
            <div
              style={{
                marginTop: '14px',
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '20px',
                color: '#9ca3af',
              }}
            >
              {defender}
            </div>
          )}
        </div>

        {/* Footer */}
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
          <span style={{ display: 'flex' }}>FOUNDED {toRoman(founded)}</span>
          <span style={{ display: 'flex', color: accent, fontWeight: 700 }}>JZFF.ONLINE</span>
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
