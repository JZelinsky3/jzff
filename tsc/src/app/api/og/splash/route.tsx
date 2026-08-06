// iOS PWA startup-image generator. Wired into the document via
// metadata.appleWebApp.startupImage in src/app/layout.tsx so when a phone
// user taps the home-screen icon, iOS shows this masthead-style splash
// instead of the OS-default black/white. The image is STATIC (iOS renders
// it as a screenshot between icon-tap and first paint — no animation
// possible at the OS level), so the design leans into the print/almanac
// brand: ink field, gold hairline frame, serif wordmark, mono kickers.
//
// URL: /api/og/splash?w=1290&h=2796&league=PA+Milk+Society
//
// Query params:
//   w       — image width in CSS px (default 1290, iPhone Pro Max)
//   h       — image height in CSS px (default 2796)
//   league  — optional league name; when present it replaces the generic
//             "An almanac, kept faithfully." tagline so the splash reads
//             like "your league's app" instead of generic TSC chrome.
//             The /leagues/<slug>/ route handler injects this per league.
//
// CDN-cached for a year (immutable) — design changes need a new ?v= in
// the metadata href to bust crawler/iOS caches.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')
const INK = '#0e1620'
const CREAM = '#f4ebd8'
const CREAM_SOFT = '#d8cdb5'
const GOLD = '#e8c889'
const GOLD_DEEP = '#a88a4a'

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

export async function GET(req: Request) {
  const url = new URL(req.url)
  // Clamp to reasonable phone resolutions. Below 600 is too small for the
  // typography to read; above 1600 wastes bandwidth (no iPhone goes higher).
  const w = Math.min(Math.max(parseInt(url.searchParams.get('w') ?? '1290', 10) || 1290, 600), 1600)
  const h = Math.min(Math.max(parseInt(url.searchParams.get('h') ?? '2796', 10) || 2796, 600), 3200)
  // Clamp league name length so a goofy 80-character team name can't overflow
  // the masthead frame or hit a Satori layout edge case. Tested up to ~32 chars.
  const leagueRaw = url.searchParams.get('league')?.trim() ?? ''
  const league = leagueRaw.length > 36 ? `${leagueRaw.slice(0, 34).trim()}…` : leagueRaw

  // Scale typography off the shorter dimension so portrait/landscape both
  // read at the same visual size. The numbers below were tuned against
  // 1290x2796 (iPhone Pro Max) — everything else lerps around that.
  const base = Math.min(w, h)
  const px = (n: number) => Math.round(n * (base / 1290))
  const fonts = await loadFonts()

  return new ImageResponse(
    (
      <div
        style={{
          width: `${w}px`,
          height: `${h}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: INK,
          position: 'relative',
          fontFamily: 'JetBrains',
        }}
      >
        {/* Subtle radial vignette to give the flat ink some depth */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              `radial-gradient(ellipse at 50% 30%, rgba(232,200,137,0.10), transparent 55%),` +
              `radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.5), transparent 60%)`,
          }}
        />

        {/* Inner hairline frame.
            Geometry here is set by the hardware, not by taste. The display's
            own corner radius is ~55pt and it masks whatever sits under it,
            so the old 20pt inset with a 2.7pt radius had its mitred corners
            sliced off and read as a broken frame. This sits the frame inside
            the curve and gives it a radius that echoes the screen instead of
            fighting it. The top inset is larger than the sides because the
            Dynamic Island occupies roughly the first 59pt and would cut the
            top run in half. px(n) is device px at a 1290-wide reference, so
            divide by 3 for pt. */}
        <div
          style={{
            position: 'absolute',
            top: px(200), right: px(110), bottom: px(150), left: px(110),
            border: `${px(2)}px solid ${GOLD_DEEP}`,
            borderRadius: px(90),
            display: 'flex',
          }}
        />

        {/* Second, lighter rule inside the first. A double frame is the
            almanac/certificate device and it does the ornamenting on its own,
            which is why the ornaments below could get small enough to stop
            competing with the wordmark. */}
        <div
          style={{
            position: 'absolute',
            top: px(218), right: px(128), bottom: px(168), left: px(128),
            border: `${px(1.5)}px solid rgba(168,138,74,0.62)`,
            borderRadius: px(74),
            display: 'flex',
          }}
        />

        {/* Cartouches, centred astride the top and bottom runs where the
            frame is straight. (Four corner ornaments came first and the
            display's own radius ate them.)

            These were bare gold lozenges sitting ON the rule, and a rotated
            square straddling a line reads as a stray mark rather than as a
            device — two little stars nobody put there on purpose. Seating
            the same lozenge in an ink plate with its own hairline turns it
            into a jewel in a setting: the frame passes behind, the plate
            masks it, and the ornament is obviously intentional. */}
        {[
          { top: `${px(200) - px(30)}px` },
          { bottom: `${px(150) - px(30)}px` },
        ].map((pos, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              ...pos,
              left: `${Math.round(w / 2) - px(92)}px`,
              width: px(184),
              height: px(60),
              background: INK,
              border: `${px(1.5)}px solid ${GOLD_DEEP}`,
              borderRadius: px(30),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: px(16),
            }}
          >
            <div style={{ width: px(7), height: px(7), background: GOLD_DEEP, transform: 'rotate(45deg)', display: 'flex' }} />
            <div style={{ width: px(19), height: px(19), background: GOLD, transform: 'rotate(45deg)', display: 'flex' }} />
            <div style={{ width: px(7), height: px(7), background: GOLD_DEEP, transform: 'rotate(45deg)', display: 'flex' }} />
          </div>
        ))}

        {/* Centered masthead column */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: `${px(150)}px ${px(120)}px`,
          }}
        >
          {/* Top kicker — diamond bullets instead of ★ because JetBrains
              Mono ships without the U+2605 glyph (renders as tofu). */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: px(22),
              fontSize: px(36),
              fontWeight: 700,
              letterSpacing: px(8),
              textTransform: 'uppercase',
              color: GOLD,
            }}
          >
            <div style={{ width: px(14), height: px(14), background: GOLD, transform: 'rotate(45deg)', display: 'flex' }} />
            <span>Founded MMXXVI</span>
            <div style={{ width: px(14), height: px(14), background: GOLD, transform: 'rotate(45deg)', display: 'flex' }} />
          </div>

          <div
            style={{
              marginTop: px(50),
              width: px(420),
              height: px(2),
              background: GOLD_DEEP,
              display: 'flex',
            }}
          />

          {/* Main wordmark */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: px(80),
              fontFamily: 'DMSerif',
              lineHeight: 1,
            }}
          >
            <span style={{ color: CREAM, fontSize: px(158) }}>The Sunday</span>
            <span style={{ color: GOLD, fontStyle: 'italic', fontSize: px(192), marginTop: px(10) }}>
              Chronicle.
            </span>
          </div>

          <div
            style={{
              marginTop: px(80),
              width: px(320),
              height: px(2),
              background: GOLD_DEEP,
              display: 'flex',
            }}
          />

          {/* Tagline — when a league name is passed, the splash reads as
              "An almanac of <League Name>" (almanac-of-place binding style).
              Without a league it falls back to the generic site tagline. */}
          {league ? (
            <div
              style={{
                marginTop: px(70),
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                fontFamily: 'DMSerif',
                lineHeight: 1.05,
                textAlign: 'center',
                maxWidth: px(900),
              }}
            >
              <span style={{ fontStyle: 'italic', fontSize: px(60), color: CREAM_SOFT }}>
                An almanac of
              </span>
              <span style={{ fontStyle: 'italic', fontSize: px(110), color: GOLD, marginTop: px(18) }}>
                {league}
              </span>
            </div>
          ) : (
            <div
              style={{
                marginTop: px(70),
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: px(70),
                color: CREAM_SOFT,
                lineHeight: 1.15,
                textAlign: 'center',
              }}
            >
              <span>An almanac,</span>
              <span>kept faithfully.</span>
            </div>
          )}
        </div>

        {/* Bottom footer — volume + brand mark */}
        <div
          style={{
            position: 'absolute',
            bottom: px(180),
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: px(28),
          }}
        >
          <div
            style={{
              width: px(140),
              height: px(2),
              background: GOLD_DEEP,
              display: 'flex',
            }}
          />
          <div
            style={{
              fontSize: px(32),
              fontWeight: 700,
              letterSpacing: px(8),
              textTransform: 'uppercase',
              color: GOLD_DEEP,
              display: 'flex',
              alignItems: 'center',
              gap: px(18),
            }}
          >
            <div style={{ width: px(12), height: px(12), background: GOLD_DEEP, transform: 'rotate(45deg)', display: 'flex' }} />
            <span>Vol. II</span>
            <div style={{ width: px(12), height: px(12), background: GOLD_DEEP, transform: 'rotate(45deg)', display: 'flex' }} />
          </div>
        </div>
      </div>
    ),
    {
      width: w,
      height: h,
      fonts,
      headers: {
        // Immutable — bust by changing the ?v= query in metadata, not by editing this route.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  )
}
