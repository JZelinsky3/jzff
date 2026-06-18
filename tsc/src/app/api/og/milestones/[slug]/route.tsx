// OG image generator for the live milestones page.
// URL: /api/og/milestones/<slug>
//
// Renders a 1200x630 card featuring the league's most relevant milestone
// moment: a "just achieved" crossing this week if there is one, otherwise the
// closest imminent chase. Footer carries the meter strip (this week / season /
// imminent / through-week). Falls back to a quiet card when the bundle has no
// milestones to show.
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

type Crossed = {
  glyph: string
  tier: string
  name: string
  achievement_html?: string
  meta_html?: string
  when?: string
}
type Approach = {
  glyph: string
  name: string
  copy_html?: string
  stats_html?: string
  eta?: string
  eta_unit?: string
}
type MilestonesFile = {
  meter: { week: number; season: number; imminent: number; through: string }
  crossed: Crossed[]
  imminent_by_category: { wins: Approach[]; points: Approach[]; streak: Approach[] }
  horizon_by_category:  { wins: Approach[]; points: Approach[]; streak: Approach[] }
} | null

// `copy_html` / `achievement_html` come pre-formatted with <em>…</em> emphasis
// for the template. Satori doesn't render arbitrary HTML, so we strip tags
// for the OG render — the underlying text still reads cleanly.
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
  const data = bundle['milestones.json'] as MilestonesFile | undefined

  const fonts = await loadFonts()

  if (!data || !data.meter) {
    return renderQuietCard(league.name, fonts)
  }

  // Picking the featured item:
  //   1. Most recent crossing (sorted highest-tier-first within this week
  //      by the builder)
  //   2. Otherwise the closest imminent chase across all three categories,
  //      picking the one with the highest progress (highest eta %)
  //   3. Otherwise the top horizon chase
  const featured = pickFeatured(data)
  return renderCard(league.name, data.meter, featured, fonts)
}

type Featured =
  | { mode: 'crossed'; name: string; achievement: string; meta: string }
  | { mode: 'imminent'; name: string; copy: string; stats: string; eta: string }
  | { mode: 'horizon'; name: string; copy: string; stats: string; eta: string }
  | { mode: 'empty' }

function pickFeatured(data: NonNullable<MilestonesFile>): Featured {
  if (data.crossed?.length) {
    const c = data.crossed[0]
    return {
      mode: 'crossed',
      name: c.name,
      achievement: stripTags(c.achievement_html),
      meta: stripTags(c.meta_html),
    }
  }
  // Imminent: pick the highest-progress (highest eta %) item across cats.
  const imminentAll: Approach[] = [
    ...(data.imminent_by_category?.wins ?? []),
    ...(data.imminent_by_category?.points ?? []),
    ...(data.imminent_by_category?.streak ?? []),
  ]
  if (imminentAll.length) {
    imminentAll.sort((a, b) => etaPct(b.eta) - etaPct(a.eta))
    const a = imminentAll[0]
    return {
      mode: 'imminent',
      name: a.name,
      copy: stripTags(a.copy_html),
      stats: stripTags(a.stats_html),
      eta: a.eta ?? '',
    }
  }
  const horizonAll: Approach[] = [
    ...(data.horizon_by_category?.wins ?? []),
    ...(data.horizon_by_category?.points ?? []),
    ...(data.horizon_by_category?.streak ?? []),
  ]
  if (horizonAll.length) {
    horizonAll.sort((a, b) => etaPct(b.eta) - etaPct(a.eta))
    const h = horizonAll[0]
    return {
      mode: 'horizon',
      name: h.name,
      copy: stripTags(h.copy_html),
      stats: stripTags(h.stats_html),
      eta: h.eta ?? '',
    }
  }
  return { mode: 'empty' }
}

function etaPct(eta: string | undefined): number {
  if (!eta) return 0
  const m = eta.match(/(\d+)/)
  return m ? Number(m[1]) : 0
}

function renderCard(
  leagueName: string,
  meter: NonNullable<MilestonesFile>['meter'],
  f: Featured,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  const gridiron = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><path d="M0 40h80M40 0v80" stroke="#1e1e1e" stroke-width="1"/></svg>`
  )
  const kicker =
    f.mode === 'crossed' ? 'CROSSED THIS WEEK'
    : f.mode === 'imminent' ? 'ON THE BRINK'
    : f.mode === 'horizon' ? 'ON THE WATCHLIST'
    : 'NOTHING IMMINENT'

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
            background: `radial-gradient(circle at 88% 18%, ${GOLD}26 0%, transparent 50%), radial-gradient(circle at 12% 88%, ${GOLD}14 0%, transparent 50%)`,
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
          <span style={{ display: 'flex' }}>{leagueName.toUpperCase()} · MILESTONES</span>
          <span style={{ display: 'flex', color: '#9ca3af', letterSpacing: '0.32em' }}>
            THE SUNDAY CHRONICLE
          </span>
        </div>

        {/* Kicker */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '54px',
            fontSize: '16px',
            fontWeight: 700,
            letterSpacing: '0.4em',
            color: GOLD,
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          {kicker}
        </div>

        {/* Feature block */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '24px 96px 0',
            zIndex: 2,
            textAlign: 'center',
            gap: '14px',
          }}
        >
          {f.mode !== 'empty' && (
            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontSize: '76px',
                lineHeight: 1.05,
                color: '#f3f4f6',
              }}
            >
              {f.name}
            </div>
          )}
          {f.mode === 'crossed' && (
            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '38px',
                color: GOLD,
                lineHeight: 1.2,
                maxWidth: '900px',
                textAlign: 'center',
              }}
            >
              {f.achievement}
            </div>
          )}
          {(f.mode === 'imminent' || f.mode === 'horizon') && (
            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '40px',
                color: GOLD,
                lineHeight: 1.2,
                maxWidth: '980px',
                textAlign: 'center',
              }}
            >
              {f.copy}
            </div>
          )}
          {(f.mode === 'imminent' || f.mode === 'horizon') && f.stats && (
            <div
              style={{
                display: 'flex',
                marginTop: '6px',
                fontSize: '17px',
                fontWeight: 700,
                letterSpacing: '0.22em',
                color: '#9ca3af',
                textTransform: 'uppercase',
              }}
            >
              {f.stats}
            </div>
          )}
          {f.mode === 'crossed' && f.meta && (
            <div
              style={{
                display: 'flex',
                marginTop: '6px',
                fontSize: '17px',
                fontWeight: 700,
                letterSpacing: '0.22em',
                color: '#9ca3af',
                textTransform: 'uppercase',
              }}
            >
              {f.meta}
            </div>
          )}
          {f.mode === 'empty' && (
            <div
              style={{
                display: 'flex',
                marginTop: '40px',
                fontFamily: 'DMSerif',
                fontSize: '68px',
                color: '#f3f4f6',
              }}
            >
              Nothing imminent.
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
          <div style={{ display: 'flex', gap: '32px' }}>
            {meterCell(meter.week, 'THIS WEEK')}
            {meterCell(meter.season, 'THIS SEASON')}
            {meterCell(meter.imminent, 'IMMINENT')}
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

function meterCell(value: number, label: string) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '38px', color: GOLD, lineHeight: 1 }}>
        {value}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: '12px',
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
          {leagueName.toUpperCase()} · MILESTONES
        </div>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '84px', lineHeight: 1 }}>
          The board is quiet.
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
          Milestones return when the season does — The Sunday Chronicle
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}
