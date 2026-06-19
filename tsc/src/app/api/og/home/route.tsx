// OG image generator for the marketing landing page (https://thesundaychronicle.app).
// URL: /api/og/home
//
// Renders a 1200x630 editorial card: masthead kicker, big serif title, italic
// subhead, and two strip lines (what you get, what we import from). Designed
// to be clickable when dropped into a group chat or social post — the goal
// is to read like the front page of a newspaper, not a generic logo card.
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
            background: `radial-gradient(circle at 14% 18%, ${GOLD}30 0%, transparent 50%), radial-gradient(circle at 86% 82%, ${GOLD}18 0%, transparent 50%)`,
          }}
        />

        {/* Top masthead — vintage broadsheet kicker */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '34px 56px 0',
            fontSize: '14px',
            letterSpacing: '0.4em',
            color: GOLD,
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex' }}>EST. MMXXVI · VOL. I</span>
          <span style={{ display: 'flex', color: '#9ca3af', letterSpacing: '0.42em' }}>
            FOR COMMISSIONERS
          </span>
        </div>

        {/* Rules above + below the title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: '70px',
            padding: '0 80px',
            gap: '14px',
            zIndex: 2,
          }}
        >
          <div style={{ display: 'flex', width: '100%', height: '1px', background: '#272727' }} />
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontSize: '108px',
              lineHeight: 1,
              color: '#f3f4f6',
              textAlign: 'center',
            }}
          >
            The Sunday Chronicle
          </div>
          <div style={{ display: 'flex', width: '100%', height: '1px', background: '#272727' }} />
        </div>

        {/* Italic subhead — the editorial pull quote */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '28px',
            padding: '0 100px',
            zIndex: 2,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontStyle: 'italic',
              fontSize: '40px',
              color: GOLD,
              lineHeight: 1.2,
              textAlign: 'center',
            }}
          >
            Your league&apos;s history, archived for good.
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
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '0.32em',
            color: '#d1d5db',
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex' }}>CHAMPIONS</span>
          <span style={{ display: 'flex', color: '#4b5563' }}>·</span>
          <span style={{ display: 'flex' }}>DRAFTS</span>
          <span style={{ display: 'flex', color: '#4b5563' }}>·</span>
          <span style={{ display: 'flex' }}>RIVALRIES</span>
          <span style={{ display: 'flex', color: '#4b5563' }}>·</span>
          <span style={{ display: 'flex' }}>RECORDS</span>
          <span style={{ display: 'flex', color: '#4b5563' }}>·</span>
          <span style={{ display: 'flex' }}>PICK&apos;EMS</span>
        </div>

        {/* Bottom platform strip */}
        <div
          style={{
            position: 'absolute',
            left: 56,
            right: 56,
            bottom: 30,
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
