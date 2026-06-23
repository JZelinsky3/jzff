// OG image generator for the marketing landing page (https://thesundaychronicle.app).
// URL: /api/og/home
//
// Renders a 1200x630 "front page" card: tight masthead bar, a stamped
// kicker, a punchy headline with a specimen content block (mock champion
// roll + record line) for visual proof, and a feature/platform footer.
// Designed to make a chat reader stop scrolling — the goal is "what is
// this?" not "another logo card."
//
// CDN-cached at the edge for a day with a 24h SWR window. Bump the version
// query in metadata when the design changes if you want crawlers to refetch.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')
const GOLD = '#e8c889'
const INK = '#0a0a0a'

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
  const gridiron = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><path d="M0 40h80M40 0v80" stroke="#1e1e1e" stroke-width="1"/></svg>`,
  )

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: INK,
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
            background: `radial-gradient(circle at 10% 12%, ${GOLD}3a 0%, transparent 46%), radial-gradient(circle at 90% 88%, ${GOLD}1f 0%, transparent 52%)`,
          }}
        />

        {/* Tight masthead bar — newspaper-style flagline. Brand lives in the
            big serif masthead below; this is just edition metadata. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '22px 56px',
            borderBottom: '1px solid #272727',
            fontSize: '12px',
            letterSpacing: '0.42em',
            color: '#9ca3af',
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex', color: GOLD }}>★ EST. MMXXVI</span>
          <span style={{ display: 'flex' }}>VOL. I · NO. 1</span>
          <span style={{ display: 'flex' }}>FOR COMMISSIONERS</span>
        </div>

        {/* Hero masthead — the brand is the visual focal point. Big serif,
            tight italic pull-quote below it so the tagline supports the name
            instead of replacing it. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '34px 80px 0',
            zIndex: 2,
            gap: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontSize: '92px',
              lineHeight: 1,
              color: '#f3f4f6',
              textAlign: 'center',
            }}
          >
            The Sunday Chronicle
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontStyle: 'italic',
              fontSize: '34px',
              color: GOLD,
              lineHeight: 1.1,
              textAlign: 'center',
              maxWidth: '1020px',
            }}
          >
            Every champion. Every grudge. Every draft steal.
          </div>
        </div>

        {/* Specimen "front page" block — mock data lines so readers see what
            the product actually outputs, not just a logo. Cells are sized to
            fill the body so the card doesn't trail into empty space. */}
        <div
          style={{
            display: 'flex',
            margin: '36px 56px 0',
            border: '1px solid #272727',
            background: 'rgba(20,20,20,0.55)',
            zIndex: 2,
          }}
        >
          {/* Left cell — champion roll */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '22px 26px',
              borderRight: '1px solid #272727',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.32em',
                color: GOLD,
                textTransform: 'uppercase',
              }}
            >
              ★ CHAMPION ROLL
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', fontFamily: 'DMSerif', fontSize: '26px', color: '#f3f4f6' }}>
              <span style={{ display: 'flex', color: '#9ca3af', fontFamily: 'JetBrains', fontSize: '15px' }}>&apos;25</span>
              <span style={{ display: 'flex' }}>Wright stays</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', fontFamily: 'DMSerif', fontSize: '24px', color: '#d1d5db' }}>
              <span style={{ display: 'flex', color: '#9ca3af', fontFamily: 'JetBrains', fontSize: '15px' }}>&apos;24</span>
              <span style={{ display: 'flex' }}>Holcomb&apos;s third</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', fontFamily: 'DMSerif', fontSize: '22px', color: '#9ca3af' }}>
              <span style={{ display: 'flex', color: '#6b7280', fontFamily: 'JetBrains', fontSize: '15px' }}>&apos;23</span>
              <span style={{ display: 'flex' }}>Wright again</span>
            </div>
          </div>
          {/* Middle cell — record */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '22px 26px',
              borderRight: '1px solid #272727',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.32em',
                color: GOLD,
                textTransform: 'uppercase',
              }}
            >
              ✦ RECORD BOOK
            </div>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '34px', color: '#f3f4f6', lineHeight: 1 }}>
              239.4 pts
            </div>
            <div style={{ display: 'flex', fontSize: '13px', fontWeight: 700, letterSpacing: '0.22em', color: '#9ca3af', textTransform: 'uppercase' }}>
              HIGHEST SINGLE WEEK
            </div>
            <div style={{ display: 'flex', fontSize: '13px', fontWeight: 700, letterSpacing: '0.22em', color: '#6b7280', textTransform: 'uppercase' }}>
              Slingers · W7 &apos;23
            </div>
          </div>
          {/* Right cell — rivalry */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '22px 26px',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.32em',
                color: GOLD,
                textTransform: 'uppercase',
              }}
            >
              ✺ RIVALRY
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', fontFamily: 'DMSerif', fontSize: '30px', color: '#f3f4f6', lineHeight: 1 }}>
              <span style={{ display: 'flex' }}>21–19</span>
            </div>
            <div style={{ display: 'flex', fontSize: '13px', fontWeight: 700, letterSpacing: '0.22em', color: '#9ca3af', textTransform: 'uppercase' }}>
              40 MEETINGS · SINCE 2009
            </div>
            <div style={{ display: 'flex', fontSize: '13px', fontWeight: 700, letterSpacing: '0.22em', color: '#6b7280', textTransform: 'uppercase' }}>
              LAST &apos;24 · 132.4 — 128.7
            </div>
          </div>
        </div>

        {/* Editorial pull-quote — fills the space between the specimen block
            and the bottom strips with a single load-bearing line. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '26px',
            padding: '0 80px',
            zIndex: 2,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontStyle: 'italic',
              fontSize: '24px',
              color: '#d1d5db',
              lineHeight: 1.2,
              textAlign: 'center',
              maxWidth: '900px',
            }}
          >
            One league ID in. Every season, every champion, every grudge — out.
          </div>
        </div>

        {/* Feature strip */}
        <div
          style={{
            position: 'absolute',
            left: 56,
            right: 56,
            bottom: 76,
            display: 'flex',
            justifyContent: 'center',
            gap: '34px',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.32em',
            color: '#d1d5db',
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex' }}>13+ SEASONS, ARCHIVED</span>
          <span style={{ display: 'flex', color: '#4b5563' }}>·</span>
          <span style={{ display: 'flex' }}>WEEKLY PICK&apos;EMS</span>
          <span style={{ display: 'flex', color: '#4b5563' }}>·</span>
          <span style={{ display: 'flex' }}>LIVE RECORDS WATCH</span>
        </div>

        {/* Bottom platform strip */}
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
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.3em',
            color: '#9ca3af',
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex' }}>SLEEPER · ESPN · NFL.COM · YAHOO</span>
          <span style={{ display: 'flex', color: GOLD }}>THESUNDAYCHRONICLE.APP</span>
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
