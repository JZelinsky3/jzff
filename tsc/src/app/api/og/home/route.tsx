// OG image generator for the marketing landing page (https://thesundaychronicle.app).
// URL: /api/og/home
//
// Renders a 1200x630 editorial card: gold sash strips top and bottom, the
// masthead + tagline on the left, and the league book itself (leather
// cover, gold emboss, cream page peeking out, rust volume seal) on the
// right. No stats, no specimen data — the brand and the object. Palette is
// the site's Vintage Creamery navy/cream/gold/rust rather than flat black.
//
// CDN-cached at the edge for a day with a 24h SWR window. Bump the version
// query in metadata when the design changes so crawlers refetch.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

const INK = '#0e1620'
const INK_DEEP = '#0a1119'
const INK_SOFT = '#16202c'
const CREAM = '#f4ebd8'
const CREAM_SOFT = '#c9c0ad'
const GOLD = '#e8c889'
const GOLD_DEEP = '#a88a4a'
const RUST = '#a04830'

// The DM Serif / JetBrains TTFs in public/og/fonts don't carry U+2605, so a
// literal ★ renders as tofu. Draw the star as an inline SVG instead.
function Star({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2z" />
    </svg>
  )
}

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

export async function GET() {
  const fonts = await loadFonts()

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
        {/* Warm glows — gold behind the masthead, rust under the book. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 24% 30%, ${GOLD}30 0%, transparent 48%), radial-gradient(circle at 86% 82%, ${RUST}2e 0%, transparent 46%)`,
          }}
        />

        {/* Gold sash strips — the site's identity stripe, top and bottom. */}
        <div style={{ display: 'flex', height: '14px', background: GOLD }} />

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 0 0 84px' }}>
          {/* Left — masthead + tagline */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingRight: '30px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontSize: '17px',
                fontWeight: 700,
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
                color: GOLD,
              }}
            >
              <Star size={16} color={GOLD} />
              <span style={{ display: 'flex' }}>The League Almanac · Est. 2026</span>
              <Star size={16} color={GOLD} />
            </div>

            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontSize: '96px',
                lineHeight: 1.02,
                color: CREAM,
                marginTop: '26px',
              }}
            >
              The Sunday
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '96px',
                lineHeight: 1.02,
                color: GOLD,
              }}
            >
              Chronicle.
            </div>

            <div
              style={{
                display: 'flex',
                width: '120px',
                height: '3px',
                background: `linear-gradient(90deg, ${GOLD_DEEP}, transparent)`,
                marginTop: '30px',
              }}
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '34px',
                lineHeight: 1.3,
                color: CREAM_SOFT,
                marginTop: '24px',
              }}
            >
              <span style={{ display: 'flex' }}>Your league&apos;s history.</span>
              <span style={{ display: 'flex' }}>Bound in one book.</span>
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: CREAM_SOFT,
                marginTop: '34px',
              }}
            >
              Sleeper · ESPN · NFL.com · Yahoo
            </div>
          </div>

          {/* Right — the book, tilted, with a cream page slipping out. */}
          <div
            style={{
              display: 'flex',
              width: '430px',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            {/* Cream page peeking out from behind the cover */}
            <div
              style={{
                position: 'absolute',
                display: 'flex',
                width: '290px',
                height: '404px',
                background: `linear-gradient(165deg, #f7efdc 0%, #eee1c8 100%)`,
                borderRadius: '4px',
                transform: 'rotate(9deg) translateX(38px)',
                boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
              }}
            />

            {/* The book: spine + cover */}
            <div
              style={{
                display: 'flex',
                transform: 'rotate(3deg)',
                boxShadow: '0 26px 70px rgba(0,0,0,0.65)',
                borderRadius: '6px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: '26px',
                  height: '420px',
                  background: 'linear-gradient(180deg, #3a2c14 0%, #1a1208 40%, #2a1e0e 70%, #3a2c14 100%)',
                  border: `1px solid #4a3a1e`,
                  borderRight: 'none',
                  borderRadius: '6px 0 0 6px',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: '304px',
                  height: '420px',
                  background: 'linear-gradient(165deg, #1e1608 0%, #100e08 50%, #1a1408 100%)',
                  border: `2px solid ${GOLD_DEEP}`,
                  borderLeft: 'none',
                  borderRadius: '0 6px 6px 0',
                  padding: '34px 26px 26px',
                  position: 'relative',
                }}
              >
                {/* Inner frame line */}
                <div
                  style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    right: '10px',
                    bottom: '10px',
                    display: 'flex',
                    border: `1px solid ${GOLD_DEEP}55`,
                    borderRadius: '2px',
                  }}
                />
                <div style={{ display: 'flex', marginTop: '10px' }}>
                  <Star size={30} color={GOLD} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'DMSerif',
                    fontStyle: 'italic',
                    fontSize: '40px',
                    color: GOLD,
                    marginTop: '14px',
                  }}
                >
                  Your League
                </div>
                <div
                  style={{
                    display: 'flex',
                    width: '90px',
                    height: '2px',
                    background: `linear-gradient(90deg, transparent, ${GOLD_DEEP}, transparent)`,
                    marginTop: '18px',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    fontSize: '13px',
                    fontWeight: 700,
                    letterSpacing: '0.3em',
                    textTransform: 'uppercase',
                    color: GOLD_DEEP,
                    marginTop: '20px',
                  }}
                >
                  The Complete History
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: '15px',
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    color: CREAM_SOFT,
                    marginTop: '10px',
                  }}
                >
                  2018-2024
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'DMSerif',
                    fontStyle: 'italic',
                    fontSize: '17px',
                    color: GOLD_DEEP,
                    marginTop: 'auto',
                  }}
                >
                  The Sunday Chronicle
                </div>
              </div>
            </div>

            {/* Rust volume seal overlapping the cover corner */}
            <div
              style={{
                position: 'absolute',
                top: '76px',
                right: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '92px',
                height: '92px',
                borderRadius: '92px',
                border: `3px solid ${RUST}`,
                background: `${CREAM}e6`,
                color: RUST,
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                transform: 'rotate(12deg)',
              }}
            >
              Vol. II
            </div>
          </div>
        </div>

        {/* Bottom strip — domain on gold, mirrors the top sash. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 84px',
            background: GOLD,
            color: INK,
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex' }}>Free to start · One league free forever</span>
          <span style={{ display: 'flex' }}>thesundaychronicle.app</span>
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
