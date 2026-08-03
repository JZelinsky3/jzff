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
import { isDemoSlug, loadDemoBundle, DEMO_NAME } from '@/lib/og/demoBundle'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')
const GOLD = '#e8c889'

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

// Same two shapes as milestones: the live export has title_html, the demo
// tree carries the plain category instead.
type WatchItem = {
  category: string
  pct?: number
  flag: string
  title_html?: string
  holder?: string
  record_value?: string
  holder_when?: string
  chaser: string
  chaser_value: string
  chaser_when: string
  chaser_projection?: string
  chaser_sub?: string
  realized?: boolean
  // Demo-tree spellings for the same facts.
  previous?: string
  when?: string
  copy?: string
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

  // Slug "demo" renders the static demo tree instead of a DB league, so
  // the share hub's landing pages can lead with The Lakeside League rather
  // than putting a real league's managers on a public marketing page.
  let leagueName: string
  let bundle: Record<string, unknown>
  if (isDemoSlug(slug)) {
    leagueName = DEMO_NAME
    bundle = await loadDemoBundle()
  } else {
    const db = createAdminClient()
    const { data: league } = await db
      .from('leagues')
      .select('id, name, slug, published_at')
      .eq('slug', slug)
      .maybeSingle()
    if (!league || !league.published_at) {
      return new Response('Not found', { status: 404 })
    }
    leagueName = league.name
    bundle = await getLeagueBundle(league.id, league.slug)
  }
  const data = bundle['records_watch.json'] as RecordsWatchFile | undefined

  const fonts = await loadFonts()

  if (!data || !data.meter) {
    return renderQuietCard(leagueName, fonts)
  }

  const featured = pickFeatured(data)
  return renderCard(leagueName, data.meter, featured, fonts)
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

// Lifted from the records-watch page's :root: carbon-maroon canvas with
// the cool blue tracker accent, not the midnight blue I had invented.
const NIGHT      = '#0f0a0c'  // --rw-bg
const NIGHT_SOFT = '#1d141a'  // --rw-card
const RW_CREAM   = '#f4ebd8'  // --rw-cream
const RW_MUTE    = '#c6a89e'  // --rw-mute
const RW_LINE    = '#3a2128'  // --rw-line

function RWStar({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2z" />
    </svg>
  )
}

function rcut(s: string, max: number): string {
  const t = (s ?? '').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1).trim()}…`
}

// The pace board's accent per mode. The old kicker palette was web red /
// grey; these sit in the same room as the rest of the site.
function paceAccent(mode: Mode | 'empty'): { label: string; color: string } {
  switch (mode) {
    case 'broken':      return { label: 'Record broken', color: '#a4c4d6' }  // --rw-ember-hi
    case 'brink':       return { label: 'At the brink',  color: '#7fa8bd' }  // --rw-ember
    case 'on_pace':     return { label: 'On pace',       color: '#7fa8bd' }
    case 'just_missed': return { label: 'Just missed',   color: '#4a7d96' }  // --rw-ember-deep
    default:            return { label: 'The watch',     color: '#7fa8bd' }
  }
}

function renderCard(
  leagueName: string,
  meter: NonNullable<RecordsWatchFile>['meter'],
  f: Featured,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  // THE PACE BOARD — the chase drawn as a bar running at the record line.
  const isEmpty = f.mode === 'empty'
  const item = isEmpty ? null : (f as { item: WatchItem }).item
  const { label, color } = paceAccent(f.mode)

  // Not every source carries a percentage: the demo tree's broken records
  // record the fact, not the chase. Draw the track only when there is a
  // real number, and treat an already-broken record as a full bar.
  const rawPct = item && Number.isFinite(item.pct) ? Number(item.pct) : null
  const pct = rawPct != null
    ? Math.max(4, Math.min(100, Math.round(rawPct)))
    : f.mode === 'broken' ? 100 : null

  // "Tyler · Crosstown Comets" in the demo, a bare name in the live export.
  const chaserName = item ? (item.chaser ?? '').split('·')[0].trim() : ''
  // Who held it: the live export names the holder, the demo puts the old
  // mark in `previous`.
  const holderLine = item
    ? item.holder
      ? `${rcut(item.holder, 10)} ${rcut(item.holder_when ?? '', 6)}`.trim()
      : rcut(item.previous ?? '', 22)
    : ''
  const footLine = item ? (item.record_value || item.copy || item.previous || '') : ''

  const counts: Array<[number, string]> = [
    [meter.broken, 'Broken'],
    [meter.on_pace, 'On pace'],
    [meter.brink, 'Brink'],
    [meter.just_missed, 'Just missed'],
  ]

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(155deg, #0a0608 0%, ${NIGHT} 46%, ${NIGHT_SOFT} 100%)`,
          color: RW_CREAM,
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 22% 28%, ${color}22 0%, transparent 46%), radial-gradient(circle at 84% 84%, ${color}18 0%, transparent 44%)`,
          }}
        />

        <div style={{ display: 'flex', height: '16px', background: color }} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 56px 0 84px' }}>
          {/* Left — masthead */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingRight: '28px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
                color: color,
              }}
            >
              <RWStar size={15} color={color} />
              <span style={{ display: 'flex' }}>{rcut(leagueName, 22)}</span>
              <RWStar size={15} color={color} />
            </div>

            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '86px', lineHeight: 1.02, color: RW_CREAM, marginTop: '22px' }}>
              Records
            </div>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '86px', lineHeight: 1.02, color: color }}>
              Watch.
            </div>

            <div
              style={{
                display: 'flex',
                width: '120px',
                height: '3px',
                background: `linear-gradient(90deg, ${color}, transparent)`,
                marginTop: '24px',
              }}
            />

            {/* Meter counts */}
            <div style={{ display: 'flex', gap: '30px', marginTop: '24px' }}>
              {counts.map(([n, cl]) => (
                <div key={cl} style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '34px', color: n > 0 ? RW_CREAM : RW_MUTE }}>
                    {n}
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      color: RW_MUTE,
                      marginTop: '4px',
                    }}
                  >
                    {cl}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.26em',
                textTransform: 'uppercase',
                color: RW_MUTE,
                marginTop: '26px',
              }}
            >
              THROUGH {meter.through.toUpperCase()}
            </div>
          </div>

          {/* Right — the pace board */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '470px',
              padding: '24px 26px 22px',
              background: 'rgba(29,20,26,0.78)',
              border: `1px solid ${RW_LINE}`,
              borderRadius: '10px',
              boxShadow: '0 26px 60px rgba(0,0,0,0.6)',
            }}
          >
            <span
              style={{
                display: 'flex',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.32em',
                textTransform: 'uppercase',
                color: color,
              }}
            >
              {label}
            </span>

            <span
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontSize: '30px',
                lineHeight: 1.14,
                color: RW_CREAM,
                marginTop: '10px',
              }}
            >
              {item ? rcut(stripTags(item.title_html) || item.category, 46) : 'Nothing on the board yet'}
            </span>

            <div style={{ display: 'flex', height: '1px', background: RW_LINE, marginTop: '16px' }} />

            {/* The chase track: fill to the chaser's pace, record line at 100% */}
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: '18px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: RW_MUTE,
                }}
              >
                <span style={{ display: 'flex' }}>{item ? rcut(chaserName, 16) : '·'}</span>
                <span style={{ display: 'flex' }}>{pct != null ? `${pct}% of record` : item?.when ?? ''}</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  width: '418px',
                  height: '16px',
                  background: 'rgba(244,235,216,0.08)',
                  borderRadius: '2px',
                  marginTop: '9px',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    width: `${Math.round(418 * ((pct ?? 0) / 100))}px`,
                    height: '16px',
                    background: color,
                    borderRadius: '2px',
                  }}
                />
                {/* The record line itself */}
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '-5px',
                    display: 'flex',
                    width: '2px',
                    height: '26px',
                    background: RW_CREAM,
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: RW_MUTE,
                  marginTop: '9px',
                }}
              >
                <span style={{ display: 'flex' }}>{item ? rcut(item.chaser_value ?? '', 26) : ''}</span>
                <span style={{ display: 'flex', color: RW_CREAM }}>{holderLine}</span>
              </div>
            </div>

            <div style={{ display: 'flex', height: '1px', background: RW_LINE, marginTop: '18px' }} />

            <span
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '20px',
                color: RW_MUTE,
                marginTop: '14px',
              }}
            >
              {footLine ? rcut(footLine, 46) : 'Check back once the season is running.'}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 84px',
            background: color,
            color: '#0f0a0c',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex' }}>Broken · On Pace · At the Brink</span>
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
          Records watch returns when the season does, The Sunday Chronicle
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}
