// OG image generator for individual manager file pages.
// URL: /api/og/manager/<slug>/<uid>
//
// Renders a 1200x630 membership-credential card for one manager: the
// Society card itself on the right (monogram, career record, rings), two
// blank cards fanned behind it, and the manager's name + team as the
// masthead on the left. Alumni get the same card in steel with an
// ALUMNUS status line instead of gold. Shared when someone links
// managers/manager.html?id=.
//
// This design moved here from the managers *directory* card, which used to
// feature whoever sat at the top of the roll; the directory is now neutral
// to the whole league and this is the card that is genuinely about one
// person.
//
// CDN-cached per (slug, uid); busted only when the league bundle's
// `league-<id>` tag is revalidated by sync.

import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLeagueBundle } from '@/lib/leagueBundleCache'

export const runtime = 'nodejs'

type DirectoryManager = {
  user_id: string | null
  name: string
  team_latest: string | null
  is_current: boolean
  total_record: string
  win_pct: number
  ppg: number
  seasons_played: number
  playoff_appearances: number
  championships: number
  championship_seasons: number[] | null
  top_three_finishes: number
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
  { params }: { params: Promise<{ slug: string; uid: string }> }
) {
  const { slug, uid } = await params

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
  const dir = bundle['managers_directory.json'] as { managers?: DirectoryManager[] } | undefined
  const all = dir?.managers ?? []
  const m = all.find((x) => x.user_id === uid)
  if (!m) return new Response('Manager not found', { status: 404 })

  const fonts = await loadFonts()
  return renderManagerCard(league.name, m, all, fonts)
}


const INK       = '#0e1620'
const INK_DEEP  = '#0a1119'
const INK_SOFT  = '#16202c'
const INK_CARD  = '#18222f'
const INK_LINE  = '#24303f'
const INK_BAND  = '#101822'
const CREAM     = '#f4ebd8'
const CREAM_SOFT = '#c9c0ad'
const CREAM_MUTE = '#8b8676'
const GOLD      = '#e8c889'
const GOLD_DEEP = '#a88a4a'
const STEEL     = '#7fa8bd'
const STEEL_DEEP = '#4e7d94'
const DOMAIN    = 'thesundaychronicle.app'

function Star({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2z" />
    </svg>
  )
}

function monogram(name: string): string {
  return (
    (name ?? '')
      .replace(/[^A-Za-z\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '★'
  )
}

function clip(s: string, max: number): string {
  const t = (s ?? '').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1).trim()}…`
}

// Name size steps down as the name gets longer so the masthead never
// wraps into the credential card.
function nameSize(n: string): number {
  const len = (n ?? '').length
  return len <= 8 ? 96 : len <= 12 ? 78 : len <= 17 ? 62 : 50
}

function renderManagerCard(
  leagueName: string,
  m: DirectoryManager,
  all: DirectoryManager[],
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  const alum = !m.is_current
  // Alumni files read steel, current members read gold.
  const accent = alum ? STEEL : GOLD
  const accentDeep = alum ? STEEL_DEEP : GOLD_DEEP

  const champYears = (m.championship_seasons ?? []).filter((y) => Number.isFinite(y))
  const rings = Math.max(0, m.championships ?? 0)

  // File number = position on the roll, ordered by career wins, so the
  // same manager always gets the same number.
  const rank =
    all
      .slice()
      .sort((a, b) => (b.win_pct ?? 0) - (a.win_pct ?? 0))
      .findIndex((x) => x.user_id === m.user_id) + 1
  const fileNo = String(Math.max(1, rank)).padStart(3, '0')

  const stats = [
    m.total_record || '0-0',
    `${((m.win_pct ?? 0) * 100).toFixed(1)}%`,
    m.ppg ? `${m.ppg.toFixed(1)} PPG` : null,
    `${m.seasons_played ?? 0} SEASON${(m.seasons_played ?? 0) === 1 ? '' : 'S'}`,
  ].filter(Boolean).join('  ·  ')

  const size = nameSize(m.name)

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(155deg, ${INK_DEEP} 0%, ${INK} 48%, ${INK_SOFT} 100%)`,
          color: CREAM,
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 24% 32%, ${accent}2b 0%, transparent 46%), radial-gradient(circle at 84% 78%, ${STEEL}2a 0%, transparent 44%)`,
          }}
        />

        <div style={{ display: 'flex', height: '16px', background: INK_BAND }} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 40px 0 84px' }}>
          {/* Left — the manager's masthead */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingRight: '20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
                color: accent,
              }}
            >
              <Star size={15} color={accent} />
              <span style={{ display: 'flex' }}>{alum ? 'The Alumni File' : 'The Manager File'}</span>
              <Star size={15} color={accent} />
            </div>

            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontSize: `${size}px`,
                lineHeight: 1.02,
                color: CREAM,
                marginTop: '24px',
              }}
            >
              {clip(m.name, 22)}
            </div>

            {m.team_latest ? (
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontStyle: 'italic',
                  fontSize: `${Math.round(size * 0.42)}px`,
                  lineHeight: 1.1,
                  color: accent,
                  marginTop: '6px',
                }}
              >
                {clip(m.team_latest, 24)}
              </div>
            ) : null}

            <div
              style={{
                display: 'flex',
                width: '120px',
                height: '3px',
                background: `linear-gradient(90deg, ${accentDeep}, transparent)`,
                marginTop: '26px',
              }}
            />

            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '28px',
                lineHeight: 1.3,
                color: CREAM_SOFT,
                marginTop: '20px',
                maxWidth: '540px',
              }}
            >
              {rings > 0
                ? `${rings} ring${rings === 1 ? '' : 's'} in ${clip(leagueName, 24)}${champYears.length ? `, ${champYears.join(' and ')}` : ''}.`
                : alum
                  ? `${m.seasons_played ?? 0} season${(m.seasons_played ?? 0) === 1 ? '' : 's'} in ${clip(leagueName, 24)}, no rings.`
                  : `On the roll in ${clip(leagueName, 26)}, still chasing the first ring.`}
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: STEEL,
                marginTop: '28px',
              }}
            >
              {stats}
            </div>
          </div>

          {/* Right — the membership credential, two blanks fanned behind */}
          <div style={{ display: 'flex', width: '440px', height: '100%', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                display: 'flex',
                width: '250px',
                height: '330px',
                background: '#141d28',
                border: `1px solid ${INK_LINE}`,
                borderRadius: '10px',
                transform: 'rotate(-9deg) translateX(-72px)',
                boxShadow: '0 14px 34px rgba(0,0,0,0.45)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                display: 'flex',
                width: '250px',
                height: '330px',
                background: '#141d28',
                border: `1px solid ${INK_LINE}`,
                borderRadius: '10px',
                transform: 'rotate(8deg) translateX(74px)',
                boxShadow: '0 14px 34px rgba(0,0,0,0.45)',
              }}
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '278px',
                height: '386px',
                background: `linear-gradient(165deg, ${INK_CARD} 0%, #141d28 100%)`,
                border: `1.5px solid ${accentDeep}`,
                borderRadius: '10px',
                padding: '24px 24px 20px',
                boxShadow: '0 26px 60px rgba(0,0,0,0.65)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.32em',
                  textTransform: 'uppercase',
                  color: STEEL,
                }}
              >
                File No. {fileNo}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '86px',
                  height: '86px',
                  borderRadius: '86px',
                  border: `2px solid ${accent}`,
                  boxShadow: `0 0 0 5px ${accent}24`,
                  fontFamily: 'DMSerif',
                  fontSize: '36px',
                  color: accent,
                  marginTop: '20px',
                }}
              >
                {monogram(m.name)}
              </div>

              <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '31px', color: CREAM, marginTop: '16px' }}>
                {clip(m.name, 14)}
              </div>

              <div
                style={{
                  display: 'flex',
                  width: '90px',
                  height: '2px',
                  background: `linear-gradient(90deg, transparent, ${accentDeep}, transparent)`,
                  marginTop: '14px',
                }}
              />

              <div
                style={{
                  display: 'flex',
                  fontSize: '15px',
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  color: CREAM_SOFT,
                  marginTop: '16px',
                }}
              >
                {m.total_record || '0-0'}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.28em',
                  textTransform: 'uppercase',
                  color: CREAM_MUTE,
                  marginTop: '5px',
                }}
              >
                Career record
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
                {rings > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {Array.from({ length: Math.min(rings, 5) }).map((_, i) => (
                      <Star key={i} size={15} color={accent} />
                    ))}
                    <span
                      style={{
                        display: 'flex',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.22em',
                        textTransform: 'uppercase',
                        color: accent,
                        marginLeft: '4px',
                      }}
                    >
                      {rings} Title{rings === 1 ? '' : 's'}
                    </span>
                  </div>
                ) : (
                  <span
                    style={{
                      display: 'flex',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                      color: CREAM_MUTE,
                    }}
                  >
                    Chasing the first ring
                  </span>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontStyle: 'italic',
                  fontSize: '15px',
                  color: accentDeep,
                  marginTop: 'auto',
                }}
              >
                {alum
                  ? `Alumnus · ${m.seasons_played ?? 0} season${(m.seasons_played ?? 0) === 1 ? '' : 's'} on file`
                  : 'In good standing'}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom strip — gold, mirrors the landing card. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 84px',
            background: INK_BAND,
            color: accent,
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex' }}>{clip(leagueName, 30)} · Career · Rings · Ledger</span>
          <span style={{ display: 'flex' }}>{DOMAIN}</span>
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
