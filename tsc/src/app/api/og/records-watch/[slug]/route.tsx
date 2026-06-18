// OG image generator for the live records-watch page.
// URL: /api/og/records-watch/<slug>
//
// Renders a 1200x630 card featuring the league's most pressing record chase:
// a broken mark if there is one, otherwise the brink leader, otherwise the
// best on-pace item, otherwise a just-missed entry. Footer carries the meter
// strip (broken / on pace / brink / just missed / through-week). Falls back
// to a quiet card when the bundle has no records to surface.
//
// CDN-cached per slug; busted when the league bundle's `league-<id>` tag is
// revalidated by sync.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLeagueBundle } from '@/lib/leagueBundleCache'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')
const GOLD = '#e8c889'
const RED = '#dc2626'

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

type WatchItem = {
  category: string
  pct: number
  flag: string
  title_html: string
  holder: string
  record_value: string
  holder_when: string
  chaser: string
  chaser_value: string
  chaser_when: string
  chaser_projection?: string
  chaser_sub?: string
  realized?: boolean
}

type RecordsWatchFile = {
  meter: { broken: number; on_pace: number; brink: number; just_missed: number; through: string }
  broken: WatchItem[]
  on_pace: WatchItem[]
  brink: WatchItem[]
  just_missed: WatchItem[]
} | null

function stripTags(s: string | undefined): string {
  if (!s) return ''
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

export async function GET(
  _req: Request,
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
  const data = bundle['records_watch.json'] as RecordsWatchFile | undefined

  const fonts = await loadFonts()

  if (!data || !data.meter) {
    return renderQuietCard(league.name, fonts)
  }

  const featured = pickFeatured(data)
  return renderCard(league.name, data.meter, featured, fonts)
}

type Mode = 'broken' | 'brink' | 'on_pace' | 'just_missed'
type Featured =
  | { mode: Mode; item: WatchItem }
  | { mode: 'empty' }

function pickFeatured(data: NonNullable<RecordsWatchFile>): Featured {
  if (data.broken?.length) return { mode: 'broken', item: data.broken[0] }
  if (data.brink?.length) return { mode: 'brink', item: data.brink[0] }
  if (data.on_pace?.length) return { mode: 'on_pace', item: data.on_pace[0] }
  if (data.just_missed?.length) return { mode: 'just_missed', item: data.just_missed[0] }
  return { mode: 'empty' }
}

function kickerFor(mode: Mode): { label: string; color: string } {
  switch (mode) {
    case 'broken':      return { label: 'RECORD BROKEN', color: RED }
    case 'brink':       return { label: 'AT THE BRINK',  color: GOLD }
    case 'on_pace':     return { label: 'ON PACE',       color: GOLD }
    case 'just_missed': return { label: 'JUST MISSED',   color: '#9ca3af' }
  }
}

function renderCard(
  leagueName: string,
  meter: NonNullable<RecordsWatchFile>['meter'],
  f: Featured,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  const gridiron = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><path d="M0 40h80M40 0v80" stroke="#1e1e1e" stroke-width="1"/></svg>`
  )
  const isEmpty = f.mode === 'empty'
  const kicker = isEmpty ? null : kickerFor((f as { mode: Mode }).mode)
  const accent = isEmpty ? GOLD : kicker!.color
  const item = isEmpty ? null : (f as { item: WatchItem }).item

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
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 14% 22%, ${accent}26 0%, transparent 50%), radial-gradient(circle at 86% 82%, ${accent}14 0%, transparent 50%)`,
          }}
        />

        {/* Top bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '32px 56px 0',
            fontSize: '17px',
            letterSpacing: '0.3em',
            color: GOLD,
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex' }}>{leagueName.toUpperCase()} · RECORDS WATCH</span>
          <span style={{ display: 'flex', color: '#9ca3af', letterSpacing: '0.32em' }}>
            THE SUNDAY CHRONICLE
          </span>
        </div>

        {/* Kicker badge */}
        {kicker && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: '36px',
              zIndex: 2,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '8px 22px',
                border: `2px solid ${accent}88`,
                fontSize: '17px',
                fontWeight: 700,
                letterSpacing: '0.4em',
                color: accent,
                textTransform: 'uppercase',
              }}
            >
              <div style={{ display: 'flex', width: '8px', height: '8px', background: accent, transform: 'rotate(45deg)' }} />
              <span style={{ display: 'flex' }}>{kicker.label}</span>
              <div style={{ display: 'flex', width: '8px', height: '8px', background: accent, transform: 'rotate(45deg)' }} />
            </div>
          </div>
        )}

        {/* Feature block */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: isEmpty ? '120px 96px 0' : '24px 80px 0',
            zIndex: 2,
            textAlign: 'center',
            gap: '12px',
          }}
        >
          {item && (
            <>
              <div
                style={{
                  display: 'flex',
                  fontSize: '15px',
                  fontWeight: 700,
                  letterSpacing: '0.32em',
                  color: '#9ca3af',
                  textTransform: 'uppercase',
                }}
              >
                {item.category}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontSize: '62px',
                  lineHeight: 1.05,
                  color: '#f3f4f6',
                  maxWidth: '1020px',
                }}
              >
                {stripTags(item.title_html)}
              </div>
              {/* Holder line */}
              <div
                style={{
                  display: 'flex',
                  marginTop: '10px',
                  alignItems: 'baseline',
                  gap: '14px',
                  fontFamily: 'DMSerif',
                  fontStyle: 'italic',
                  fontSize: '30px',
                  color: '#d1d5db',
                }}
              >
                <span style={{ display: 'flex' }}>{item.holder}</span>
                <span
                  style={{
                    display: 'flex',
                    fontFamily: 'JetBrains',
                    fontStyle: 'normal',
                    fontSize: '15px',
                    fontWeight: 700,
                    letterSpacing: '0.28em',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                  }}
                >
                  {item.holder_when}
                </span>
              </div>
              {/* Chaser line */}
              <div
                style={{
                  display: 'flex',
                  marginTop: '14px',
                  alignItems: 'baseline',
                  gap: '14px',
                  fontFamily: 'DMSerif',
                  fontSize: '34px',
                  color: accent,
                }}
              >
                <span style={{ display: 'flex' }}>{item.chaser}</span>
                <span
                  style={{
                    display: 'flex',
                    fontFamily: 'JetBrains',
                    fontSize: '16px',
                    fontWeight: 700,
                    letterSpacing: '0.22em',
                    color: '#9ca3af',
                    textTransform: 'uppercase',
                  }}
                >
                  {item.chaser_value}
                </span>
              </div>
              {item.chaser_projection && (
                <div
                  style={{
                    display: 'flex',
                    marginTop: '2px',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.28em',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                  }}
                >
                  {item.chaser_projection}
                </div>
              )}
            </>
          )}
          {isEmpty && (
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '76px', color: '#f3f4f6' }}>
              No records in reach.
            </div>
          )}
        </div>

        {/* Meter strip */}
        <div
          style={{
            position: 'absolute',
            left: 56,
            right: 56,
            bottom: 28,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '14px',
            borderTop: '1px solid #272727',
            zIndex: 2,
          }}
        >
          <div style={{ display: 'flex', gap: '28px' }}>
            {meterCell(meter.broken,      'BROKEN',      RED)}
            {meterCell(meter.on_pace,     'ON PACE',     GOLD)}
            {meterCell(meter.brink,       'BRINK',       GOLD)}
            {meterCell(meter.just_missed, 'JUST MISSED', '#9ca3af')}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '0.3em',
              color: '#6b7280',
              textTransform: 'uppercase',
            }}
          >
            THROUGH {meter.through.toUpperCase()}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    },
  )
}

function meterCell(value: number, label: string, valColor: string) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '36px', color: valColor, lineHeight: 1 }}>
        {value}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.28em',
          color: '#9ca3af',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
    </div>
  )
}

function renderQuietCard(
  leagueName: string,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
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
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          color: '#f3f4f6',
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
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
        <div
          style={{
            display: 'flex',
            fontSize: '16px',
            letterSpacing: '0.4em',
            color: GOLD,
            textTransform: 'uppercase',
            marginBottom: '26px',
          }}
        >
          {leagueName.toUpperCase()} · RECORDS WATCH
        </div>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '84px', lineHeight: 1 }}>
          The watch is quiet.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '20px',
            fontFamily: 'DMSerif',
            fontStyle: 'italic',
            fontSize: '28px',
            color: '#9ca3af',
          }}
        >
          Records watch returns when the season does — The Sunday Chronicle
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}
