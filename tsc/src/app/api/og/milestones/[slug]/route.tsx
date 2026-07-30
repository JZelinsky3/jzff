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

// The live export ships pre-formatted *_html; the demo tree ships the same
// facts as plain fields. Accept both so one renderer serves both.
type Crossed = {
  glyph: string
  tier: string
  name: string
  achievement_html?: string
  achievement?: string
  meta_html?: string
  when?: string
  context?: string
}
type Approach = {
  glyph: string
  name: string
  copy_html?: string
  copy?: string
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
  return s
    // Sibling spans carry separate facts ("W17 · 120.5 pts vs Connie" and
    // "5-5 H2H") with no separator between them, so stripping tags ran the
    // two together. Put the separator back before the tags go.
    .replace(/<\/span>\s*<span/g, '</span> · <span')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+·/g, ' ·')
    .trim()
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
  const data = bundle['milestones.json'] as MilestonesFile | undefined

  const fonts = await loadFonts()

  if (!data || !data.meter) {
    return renderQuietCard(leagueName, fonts)
  }

  // Picking the featured item:
  //   1. Most recent crossing (sorted highest-tier-first within this week
  //      by the builder)
  //   2. Otherwise the closest imminent chase across all three categories,
  //      picking the one with the highest progress (highest eta %)
  //   3. Otherwise the top horizon chase
  const featured = pickFeatured(data)
  return renderCard(leagueName, data.meter, featured, fonts)
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
      achievement: stripTags(c.achievement_html) || c.achievement || '',
      meta: stripTags(c.meta_html) || [c.when, c.context].filter(Boolean).join(' · '),
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
      copy: stripTags(a.copy_html) || a.copy || '',
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
      copy: stripTags(h.copy_html) || h.copy || '',
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

// Lifted straight from the milestones page's :root so the share reads as
// the same room: violet-black canvas, violet accent, bronze for the plate.
const GRAPHITE      = '#110a18'  // --ml-bg
const GRAPHITE_SOFT = '#1c1428'  // --ml-card
const BRASS_HI      = '#ebbf8e'  // --ml-bronze-hi
const BRASS_MID     = '#d4a574'  // --ml-bronze
const BRASS_LOW     = '#a07845'  // bronze, darkened for the plate's low side
const VIOLET        = '#b58cff'  // --ml-violet
const VIOLET_HI     = '#cdb1ff'  // --ml-violet-hi
const VIOLET_DEEP   = '#7d50d4'  // --ml-violet-deep
const ENGRAVE       = '#f4ebd8'  // plate type, cream on deep violet
const MCREAM        = '#f4ebd8'  // --ml-cream
const MCREAM_SOFT   = '#c2b6d6'  // --ml-mute

function MStar({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2z" />
    </svg>
  )
}

function mcut(s: string, max: number): string {
  const t = (s ?? '').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1).trim()}…`
}

function renderCard(
  leagueName: string,
  meter: NonNullable<MilestonesFile>['meter'],
  f: Featured,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  // THE PLAQUE — a struck brass plate on a graphite wall. Whatever the
  // page is currently featuring gets engraved on it.
  const kicker =
    f.mode === 'crossed' ? 'Just crossed'
      : f.mode === 'imminent' ? 'On the brink'
        : f.mode === 'horizon' ? 'On the horizon'
          : 'The watchlist'

  const name = f.mode === 'empty' ? '' : f.name
  const line = f.mode === 'crossed' ? f.achievement : f.mode === 'empty' ? '' : f.copy
  const sub  = f.mode === 'crossed' ? f.meta : f.mode === 'empty' ? '' : f.stats
  const eta  = f.mode === 'imminent' || f.mode === 'horizon' ? f.eta : ''

  const nameSize = name.length > 14 ? 40 : name.length > 10 ? 48 : 58

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(155deg, #121417 0%, ${GRAPHITE} 46%, ${GRAPHITE_SOFT} 100%)`,
          color: MCREAM,
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 22% 28%, ${VIOLET}22 0%, transparent 46%), radial-gradient(circle at 84% 82%, ${VIOLET_DEEP}2e 0%, transparent 44%)`,
          }}
        />

        <div style={{ display: 'flex', height: '16px', background: VIOLET }} />

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
                color: VIOLET,
              }}
            >
              <MStar size={15} color={VIOLET} />
              <span style={{ display: 'flex' }}>{mcut(leagueName, 22)}</span>
              <MStar size={15} color={VIOLET} />
            </div>

            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '92px', lineHeight: 1.02, color: MCREAM, marginTop: '24px' }}>
              The
            </div>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '92px', lineHeight: 1.02, color: VIOLET_HI }}>
              Milestones.
            </div>

            <div
              style={{
                display: 'flex',
                width: '120px',
                height: '3px',
                background: `linear-gradient(90deg, ${VIOLET_DEEP}, transparent)`,
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
                color: MCREAM_SOFT,
                marginTop: '20px',
                maxWidth: '440px',
              }}
            >
              Career marks, struck as they fall.
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.26em',
                textTransform: 'uppercase',
                color: MCREAM_SOFT,
                marginTop: '26px',
              }}
            >
              THROUGH {meter.through.toUpperCase()}{meter.imminent ? ` · ${meter.imminent} IMMINENT` : ''}
            </div>
          </div>

          {/* Right — the brass plaque */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '470px',
              padding: '6px',
              background: `linear-gradient(150deg, #8a5ee0 0%, #6b3fc0 48%, #452a80 100%)`,
              borderRadius: '4px',
              boxShadow: '0 28px 62px rgba(0,0,0,0.65)',
            }}
          >
            {/* Inner bevel: the engraved face */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '26px 28px 24px',
                border: `1px solid ${ENGRAVE}3d`,
                borderRadius: '2px',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.34em',
                  textTransform: 'uppercase',
                  color: ENGRAVE,
                  opacity: 0.75,
                }}
              >
                {kicker}
              </span>

              <span
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontSize: `${nameSize}px`,
                  lineHeight: 1.05,
                  color: ENGRAVE,
                  marginTop: '10px',
                }}
              >
                {mcut(name, 20)}
              </span>

              <div style={{ display: 'flex', height: '1px', background: `${ENGRAVE}3d`, marginTop: '14px' }} />

              <span
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontStyle: 'italic',
                  fontSize: '25px',
                  lineHeight: 1.28,
                  color: ENGRAVE,
                  marginTop: '14px',
                }}
              >
                {mcut(line, 70)}
              </span>

              {sub ? (
                <span
                  style={{
                    display: 'flex',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: ENGRAVE,
                    opacity: 0.72,
                    marginTop: '16px',
                  }}
                >
                  {mcut(sub, 44)}
                </span>
              ) : null}

              {eta ? (
                <span
                  style={{
                    display: 'flex',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.24em',
                    textTransform: 'uppercase',
                    color: ENGRAVE,
                    opacity: 0.9,
                    marginTop: '10px',
                  }}
                >
                  ETA {mcut(eta, 24)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 84px',
            background: VIOLET,
            color: '#1a1024',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex' }}>Crossed · Imminent · On the Horizon</span>
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
