// OG image generator for the public almanac pages.
// URL: /api/og/league/<slug>[?page=<chapter>]
//
// The bare URL renders the 1200x630 front-cover card — the landing card's
// navy/gold-sash editorial layout with the league's own masthead, book
// emboss, volume seal, champion, and career totals. Five chapters get
// their own bespoke scene cards, each themed to match its page:
//
//   ?page=standings — cream ledger paper, ink type, the all-time table
//   ?page=records   — deep-green trophy hall with a cream exhibit plate
//   ?page=managers  — navy Society membership card, fanned credentials
//   ?page=draft     — black-cloth Draft Annual with the Official Transcript
//   ?page=seasons   — mahogany volumes on a wooden shelf, one per season
//
// Remaining chapters (rivalries, live) reuse the front cover with a
// chapter stamp. Bump the ?v= query in the leagues route when a design
// here changes so crawlers refetch.
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

type DirectoryManager = {
  name: string
  wins: number
  losses: number
  ties: number
  total_record: string
  win_pct: number
  championships: number
  is_current: boolean
}

type RecordEntry = {
  season: number
  week: number
  owner: string
  score: number
  opp_owner: string | null
  opp_score: number | null
}

type SeasonEntry = { year: number; champion_name: string | null }
type DraftEntry = { year: number; total_picks: number; rounds: number }

// Vintage Creamery base palette (mirrors main.css :root)
const INK = '#0e1620'
const INK_DEEP = '#0a1119'
const INK_SOFT = '#16202c'
const INK_CARD = '#1a2532'
const INK_LINE = '#2a3645'
const CREAM = '#f4ebd8'
const CREAM_SOFT = '#c9c0ad'
const CREAM_MUTE = '#837b6a'
const GOLD = '#e8c889'
const GOLD_BRIGHT = '#f4d9a4'
const GOLD_DEEP = '#a88a4a'
const RUST = '#a04830'
const STEEL = '#6b8aa8'

const DOMAIN = 'THESUNDAYCHRONICLE.APP'

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

type Fonts = Awaited<ReturnType<typeof loadFonts>>

function imageOptions(fonts: Fonts) {
  return {
    width: 1200,
    height: 630,
    fonts,
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    },
  }
}

// The DM Serif / JetBrains TTFs don't carry U+2605, so a literal ★ renders
// as tofu. Draw the star as an inline SVG instead.
function Star({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2z" />
    </svg>
  )
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

function clip(s: string, max: number): string {
  const t = (s ?? '').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

function pct(p: number): string {
  if (!Number.isFinite(p)) return '.000'
  if (p >= 1) return '1.000'
  return `.${String(Math.round(p * 1000)).padStart(3, '0')}`
}

// Per-chapter stamp for the ?page= variants that still share the cover
// card (rivalries, live). The five almanac chapters above render bespoke
// scenes instead and never reach this map.
const CHAPTERS: Record<string, { label: string; accent: string }> = {
  rivalries: { label: 'The Rivalries', accent: '#c86848' }, // rust
  live: { label: 'The Live Season', accent: '#e8c850' },    // bright gold
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

  const fonts = await loadFonts()
  const pageKey = req.nextUrl.searchParams.get('page')

  switch (pageKey) {
    case 'standings': {
      const dir = bundle['managers_directory.json'] as { managers?: DirectoryManager[] } | undefined
      const managers = (dir?.managers ?? []).slice().sort((a, b) => b.wins - a.wins)
      if (managers.length > 0) return renderStandingsCard(data, managers, fonts)
      break
    }
    case 'records': {
      // record_book.json nests categories: { hub_records, full_book: { weekly: {...} } }
      const rb = bundle['record_book.json'] as
        | { full_book?: { weekly?: { highest_single_week_score?: RecordEntry[] } } }
        | undefined
      const top = rb?.full_book?.weekly?.highest_single_week_score?.[0]
      if (top) return renderRecordsCard(data, top, fonts)
      break
    }
    case 'managers': {
      const dir = bundle['managers_directory.json'] as { managers?: DirectoryManager[] } | undefined
      const managers = dir?.managers ?? []
      if (managers.length > 0) return renderManagersCard(data, managers, fonts)
      break
    }
    case 'draft': {
      const dd = bundle['drafts/drafts_directory.json'] as { drafts?: DraftEntry[] } | undefined
      const drafts = (dd?.drafts ?? []).slice().sort((a, b) => a.year - b.year)
      if (drafts.length > 0) return renderDraftCard(data, drafts, fonts)
      break
    }
    case 'seasons': {
      const sd = bundle['seasons_directory.json'] as { seasons?: SeasonEntry[] } | undefined
      const seasons = (sd?.seasons ?? []).slice().sort((a, b) => a.year - b.year)
      if (seasons.length > 0) return renderSeasonsCard(data, seasons, fonts)
      break
    }
  }

  // Front cover, rivalries/live stamps, and the data-missing fallback for
  // the bespoke chapters (new league mid-setup) all land here.
  const chapter = (pageKey && CHAPTERS[pageKey]) || null
  return renderLeagueCard(data, fonts, chapter)
}

/* ============================================================
   THE STANDINGS — cream ledger paper, ink type, and a winners'
   podium for the top three career records. Matches standings.html:
   cream body, ink nav, gold-deep italic.
   ============================================================ */
function renderStandingsCard(d: LeagueFile, managers: DirectoryManager[], fonts: Fonts) {
  const founded = d.founded ?? d.current_season ?? new Date().getFullYear()
  const top3 = managers.slice(0, 3)
  const stats = [
    `EST. ${founded}`,
    d.total_seasons != null ? `${d.total_seasons} SEASON${d.total_seasons === 1 ? '' : 'S'}` : null,
    d.total_matchups != null ? `${d.total_matchups} GAMES` : null,
  ].filter(Boolean).join('  ·  ')

  // Faint ledger ruling on the paper.
  const ruling = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><path d="M0 43.5h44" stroke="rgba(14,22,32,0.07)" stroke-width="1"/></svg>`
  )

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: CREAM,
          color: INK,
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            backgroundImage: `url("data:image/svg+xml;utf8,${ruling}")`,
            backgroundSize: '44px 44px',
          }}
        />
        {/* Ledger margin rule, rust, like an account book. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '76px',
            width: '1px',
            display: 'flex',
            background: 'rgba(160,72,48,0.3)',
          }}
        />

        {/* Ink sash — the page's navy nav bar. */}
        <div style={{ display: 'flex', height: '14px', background: INK }} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 60px 0 108px', gap: '44px' }}>
          {/* Left — masthead */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
                color: GOLD_DEEP,
              }}
            >
              <Star size={15} color={GOLD_DEEP} />
              <span style={{ display: 'flex' }}>The Sunday Chronicle</span>
              <Star size={15} color={GOLD_DEEP} />
            </div>

            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '92px', lineHeight: 1.02, color: INK, marginTop: '24px' }}>
              All-Time
            </div>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '92px', lineHeight: 1.02, color: GOLD_DEEP }}>
              Standings.
            </div>

            <div
              style={{
                display: 'flex',
                width: '120px',
                height: '3px',
                background: `linear-gradient(90deg, ${GOLD_DEEP}, transparent)`,
                marginTop: '28px',
              }}
            />

            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '30px',
                lineHeight: 1.3,
                color: '#55482e',
                marginTop: '22px',
                maxWidth: '560px',
              }}
            >
              The complete ledger of {clip(d.name, 34)}.
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: CREAM_MUTE,
                marginTop: '30px',
              }}
            >
              {stats}
            </div>
          </div>

          {/* Right — the winners' podium, top three by career wins */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '440px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px' }}>
              {[
                { m: top3[1], place: 2, h: 148, color: STEEL },
                { m: top3[0], place: 1, h: 214, color: GOLD_DEEP },
                { m: top3[2], place: 3, h: 112, color: RUST },
              ]
                .filter((p) => p.m)
                .map((p) => (
                  <div key={p.place} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '134px' }}>
                    {p.place === 1 && (
                      <div style={{ display: 'flex', marginBottom: '8px' }}>
                        <Star size={22} color={GOLD_DEEP} />
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        fontFamily: 'DMSerif',
                        fontSize: p.place === 1 ? '27px' : '23px',
                        color: INK,
                      }}
                    >
                      {clip(p.m!.name, 10)}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        fontSize: '12px',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        color: '#55482e',
                        marginTop: '3px',
                        marginBottom: '10px',
                      }}
                    >
                      {p.m!.total_record}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '134px',
                        height: `${p.h}px`,
                        background: p.color,
                        boxShadow: '0 14px 30px rgba(14,22,32,0.25)',
                        borderRadius: '3px 3px 0 0',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          fontFamily: 'DMSerif',
                          fontStyle: 'italic',
                          fontSize: p.place === 1 ? '64px' : '48px',
                          color: CREAM,
                        }}
                      >
                        {p.place}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          fontSize: '10px',
                          fontWeight: 700,
                          letterSpacing: '0.26em',
                          textTransform: 'uppercase',
                          color: 'rgba(244,235,216,0.75)',
                          marginTop: '2px',
                        }}
                      >
                        {pct(p.m!.win_pct)}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            {/* Podium base */}
            <div
              style={{
                display: 'flex',
                width: '440px',
                height: '12px',
                background: INK,
                borderRadius: '2px',
              }}
            />
            <div
              style={{
                display: 'flex',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: CREAM_MUTE,
                marginTop: '14px',
              }}
            >
              Ranked by career wins
            </div>
          </div>
        </div>

        {/* Bottom strip — ink, mirrors the nav. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '13px 60px',
            background: INK,
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex', color: CREAM_SOFT }}>Every win, loss, and point ever scored</span>
          <span style={{ display: 'flex', color: GOLD }}>{DOMAIN}</span>
        </div>
      </div>
    ),
    imageOptions(fonts),
  )
}

/* ============================================================
   THE RECORD BOOK — deep-green trophy hall, cream exhibit plate
   pinned at a tilt. Matches records.html: --rb-* felt + paper stock.
   ============================================================ */
function renderRecordsCard(d: LeagueFile, top: RecordEntry, fonts: Fonts) {
  const RB_BG = '#0b1a0f'
  const RB_SOFT = '#0e1f12'
  const RB_LINE = '#1c3b22'
  const RB_MUTE = '#a1c6aa'
  const PAPER = '#efe5cd'
  const PAPER_LINE = 'rgba(40,30,12,0.28)'
  const INK_PRINT = '#241c0e'
  const INK_PRINT_SOFT = '#55482e'
  const INK_PRINT_MUTE = '#7f7154'
  const GOLD_PRINT = '#7a5c14'
  const RUST_PRINT = '#8c2b1e'

  const founded = d.founded ?? d.current_season ?? new Date().getFullYear()
  const stats = [
    `EST. ${founded}`,
    d.total_seasons != null ? `${d.total_seasons} SEASON${d.total_seasons === 1 ? '' : 'S'}` : null,
    d.total_matchups != null ? `${d.total_matchups} GAMES ON RECORD` : null,
  ].filter(Boolean).join('  ·  ')

  const pinstripe = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><path d="M71.5 0v72" stroke="${RB_LINE}" stroke-width="1" opacity="0.45"/></svg>`
  )

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(160deg, ${RB_SOFT} 0%, ${RB_BG} 60%, #081208 100%)`,
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
            backgroundImage: `url("data:image/svg+xml;utf8,${pinstripe}")`,
            backgroundSize: '72px 72px',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 74% 46%, ${GOLD}22 0%, transparent 46%)`,
          }}
        />

        {/* Gold sash — the site's identity stripe. */}
        <div style={{ display: 'flex', height: '14px', background: GOLD }} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 64px 0 84px', gap: '30px' }}>
          {/* Left — masthead */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
                color: GOLD,
              }}
            >
              <Star size={15} color={GOLD} />
              <span style={{ display: 'flex' }}>The Trophy Room</span>
              <Star size={15} color={GOLD} />
            </div>

            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '92px', lineHeight: 1.02, color: CREAM, marginTop: '24px' }}>
              The Record
            </div>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '92px', lineHeight: 1.02, color: GOLD }}>
              Book.
            </div>

            <div
              style={{
                display: 'flex',
                width: '120px',
                height: '3px',
                background: `linear-gradient(90deg, ${GOLD_DEEP}, transparent)`,
                marginTop: '28px',
              }}
            />

            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '29px',
                lineHeight: 1.35,
                color: RB_MUTE,
                marginTop: '22px',
                maxWidth: '540px',
              }}
            >
              The records of record in {clip(d.name, 30)}.
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.26em',
                textTransform: 'uppercase',
                color: RB_MUTE,
                marginTop: '30px',
                opacity: 0.8,
              }}
            >
              {stats}
            </div>
          </div>

          {/* Right — Exhibit No. 001, the cream plate at a tilt */}
          <div style={{ display: 'flex', width: '430px', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '400px',
                background: `linear-gradient(160deg, rgba(255,255,255,0.4) 0%, ${PAPER} 32%)`,
                border: `1px solid ${PAPER_LINE}`,
                boxShadow: '0 26px 60px rgba(0,0,0,0.6)',
                transform: 'rotate(-2deg)',
                padding: '30px 32px 24px',
                position: 'relative',
              }}
            >
              {/* Double frame, drawn as two nested hairlines. */}
              <div
                style={{
                  position: 'absolute',
                  top: '9px',
                  left: '9px',
                  right: '9px',
                  bottom: '9px',
                  display: 'flex',
                  border: `1px solid ${PAPER_LINE}`,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '13px',
                  left: '13px',
                  right: '13px',
                  bottom: '13px',
                  display: 'flex',
                  border: `1px solid rgba(40,30,12,0.16)`,
                }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.3em',
                  textTransform: 'uppercase',
                  color: GOLD_PRINT,
                }}
              >
                <span style={{ display: 'flex' }}>Exhibit No. 001</span>
                <span style={{ display: 'flex', color: INK_PRINT_MUTE, letterSpacing: '0.18em' }}>Single Week</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontStyle: 'italic',
                  fontSize: '96px',
                  lineHeight: 1,
                  color: INK_PRINT,
                  marginTop: '16px',
                }}
              >
                {top.score.toFixed(2)}
              </div>

              <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '30px', color: INK_PRINT_SOFT, marginTop: '14px' }}>
                <span style={{ display: 'flex', fontStyle: 'italic', color: RUST_PRINT }}>{clip(top.owner, 18)}</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: INK_PRINT_MUTE,
                  marginTop: '12px',
                }}
              >
                Week {top.week} · {top.season}
                {top.opp_owner ? ` · vs ${clip(top.opp_owner, 12)}` : ''}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginTop: '18px',
                  paddingTop: '14px',
                  borderTop: `1px solid ${PAPER_LINE}`,
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.3em',
                  textTransform: 'uppercase',
                  color: INK_PRINT_MUTE,
                }}
              >
                Highest score ever posted
              </div>
            </div>

            {/* Brass mount pin */}
            <div
              style={{
                position: 'absolute',
                top: '18px',
                left: '50%',
                display: 'flex',
                width: '16px',
                height: '16px',
                marginLeft: '-8px',
                borderRadius: '16px',
                background: GOLD_DEEP,
                border: `2px solid ${GOLD}`,
                boxShadow: '0 3px 6px rgba(0,0,0,0.5)',
              }}
            />
          </div>
        </div>

        {/* Bottom strip — green felt with gold type. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '13px 64px',
            background: '#08130b',
            borderTop: `1px solid ${RB_LINE}`,
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex', color: RB_MUTE }}>Scorchers · Season Highs · Career Marks</span>
          <span style={{ display: 'flex', color: GOLD }}>{DOMAIN}</span>
        </div>
      </div>
    ),
    imageOptions(fonts),
  )
}

/* ============================================================
   THE MANAGERS — navy Society hall, the winningest member's
   credential card fanned over two others. Matches managers/index.html.
   ============================================================ */
function renderManagersCard(d: LeagueFile, managers: DirectoryManager[], fonts: Fonts) {
  const founded = d.founded ?? d.current_season ?? new Date().getFullYear()
  const current = managers.filter((m) => m.is_current).length
  const alumni = managers.length - current
  const byWins = managers.slice().sort((a, b) => b.wins - a.wins)
  const top = byWins[0]
  const initials = (top.name ?? '')
    .replace(/[^A-Za-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '★'

  const stats = [
    `${current} MEMBER${current === 1 ? '' : 'S'}`,
    alumni > 0 ? `${alumni} ALUMNI` : null,
    `EST. ${founded}`,
  ].filter(Boolean).join('  ·  ')

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
            background: `radial-gradient(circle at 24% 32%, ${GOLD}2b 0%, transparent 46%), radial-gradient(circle at 84% 78%, ${STEEL}30 0%, transparent 44%)`,
          }}
        />

        <div style={{ display: 'flex', height: '14px', background: GOLD }} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 40px 0 84px' }}>
          {/* Left — masthead */}
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
                color: GOLD,
              }}
            >
              <Star size={15} color={GOLD} />
              <span style={{ display: 'flex' }}>The Membership Roll</span>
              <Star size={15} color={GOLD} />
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '24px', marginTop: '24px' }}>
              <span style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '96px', lineHeight: 1.02, color: CREAM }}>The</span>
              <span style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '96px', lineHeight: 1.02, color: GOLD }}>Society.</span>
            </div>

            <div
              style={{
                display: 'flex',
                width: '120px',
                height: '3px',
                background: `linear-gradient(90deg, ${GOLD_DEEP}, transparent)`,
                marginTop: '28px',
              }}
            />

            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '30px',
                lineHeight: 1.35,
                color: CREAM_SOFT,
                marginTop: '22px',
                maxWidth: '560px',
              }}
            >
              Every manager who ever ran a team in {clip(d.name, 26)}.
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: STEEL,
                marginTop: '30px',
              }}
            >
              {stats}
            </div>
          </div>

          {/* Right — fanned membership credentials */}
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
                border: `1.5px solid ${GOLD_DEEP}`,
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
                Member No. 001
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '86px',
                  height: '86px',
                  borderRadius: '86px',
                  border: `2px solid ${GOLD}`,
                  boxShadow: `0 0 0 5px rgba(232,200,137,0.14)`,
                  fontFamily: 'DMSerif',
                  fontSize: '36px',
                  color: GOLD,
                  marginTop: '20px',
                }}
              >
                {initials}
              </div>

              <div
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontSize: '31px',
                  color: CREAM,
                  marginTop: '16px',
                }}
              >
                {clip(top.name, 14)}
              </div>

              <div
                style={{
                  display: 'flex',
                  width: '90px',
                  height: '2px',
                  background: `linear-gradient(90deg, transparent, ${GOLD_DEEP}, transparent)`,
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
                {top.total_record}
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
                {top.championships > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {Array.from({ length: Math.min(top.championships, 5) }).map((_, i) => (
                      <Star key={i} size={15} color={GOLD} />
                    ))}
                    <span
                      style={{
                        display: 'flex',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.22em',
                        textTransform: 'uppercase',
                        color: GOLD,
                        marginLeft: '4px',
                      }}
                    >
                      {top.championships} Title{top.championships === 1 ? '' : 's'}
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
                  color: GOLD_DEEP,
                  marginTop: 'auto',
                }}
              >
                In good standing since {founded}
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
            background: GOLD,
            color: INK,
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex' }}>Careers · Trophies · Head-to-Head Ledgers</span>
          <span style={{ display: 'flex' }}>{DOMAIN}</span>
        </div>
      </div>
    ),
    imageOptions(fonts),
  )
}

/* ============================================================
   THE DRAFT ARCHIVE — black-cloth Draft Annual: embossed hairline
   frame, crimson registrar's rule, the Official Transcript card.
   Matches draft/index.html: --an-* cloth palette.
   ============================================================ */
function renderDraftCard(d: LeagueFile, drafts: DraftEntry[], fonts: Fonts) {
  const AN_BG = '#0c0c0b'
  const AN_CARD = '#191917'
  const AN_LINE = '#3c3a34'
  const AN_MUTE = '#8a7a60'
  const CRIMSON = 'rgba(178,84,62,0.65)'

  const founded = d.founded ?? d.current_season ?? new Date().getFullYear()
  const totalPicks = drafts.reduce((a, b) => a + (b.total_picks || 0), 0)
  const rows = drafts.slice(-5).reverse()
  const stats = [
    `${drafts.length} DRAFT${drafts.length === 1 ? '' : 'S'} ON FILE`,
    `${totalPicks} PICKS RECORDED`,
  ].join('  ·  ')

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(160deg, #121211 0%, ${AN_BG} 55%, #0a0a09 100%)`,
          color: CREAM,
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        {/* Embossed cover frame */}
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            right: '16px',
            bottom: '16px',
            display: 'flex',
            border: `1px solid ${AN_LINE}`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '22px',
            left: '22px',
            right: '22px',
            bottom: '22px',
            display: 'flex',
            border: `1px solid rgba(60,58,52,0.4)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 28% 34%, ${GOLD}14 0%, transparent 46%)`,
          }}
        />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 72px 0 92px', gap: '40px' }}>
          {/* Left — the cover emboss */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  fontSize: '16px',
                  fontWeight: 700,
                  letterSpacing: '0.4em',
                  textTransform: 'uppercase',
                  color: GOLD,
                }}
              >
                <Star size={15} color={GOLD} />
                <span style={{ display: 'flex' }}>Office of the Registrar</span>
                <Star size={15} color={GOLD} />
              </div>
              {/* Crimson registrar's rule — two lines, like the page masthead */}
              <div style={{ display: 'flex', flexDirection: 'column', width: '340px', marginTop: '16px' }}>
                <div style={{ display: 'flex', height: '1px', background: CRIMSON }} />
                <div style={{ display: 'flex', height: '1px', background: CRIMSON, marginTop: '3px', opacity: 0.55 }} />
              </div>
            </div>

            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '96px', lineHeight: 1.02, color: CREAM, marginTop: '26px' }}>
              The Draft
            </div>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '96px', lineHeight: 1.02, color: GOLD }}>
              Annual.
            </div>

            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '29px',
                lineHeight: 1.35,
                color: AN_MUTE,
                marginTop: '26px',
                maxWidth: '540px',
              }}
            >
              Round by round, steal by steal, bust by bust in {clip(d.name, 26)}.
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.26em',
                textTransform: 'uppercase',
                color: AN_MUTE,
                marginTop: '30px',
              }}
            >
              {stats}
            </div>
          </div>

          {/* Right — the Official Transcript */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '380px',
              background: AN_CARD,
              border: `1px solid ${AN_LINE}`,
              boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 24px 16px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '44px',
                  height: '44px',
                  borderRadius: '44px',
                  border: `1.5px solid ${GOLD}`,
                  boxShadow: `0 0 0 4px rgba(232,200,137,0.16)`,
                }}
              >
                <Star size={17} color={GOLD} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    display: 'flex',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.3em',
                    textTransform: 'uppercase',
                    color: AN_MUTE,
                  }}
                >
                  {clip(d.name, 22)}
                </div>
                <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '24px', color: CREAM, marginTop: '3px' }}>
                  Official Transcript
                </div>
              </div>
            </div>

            {/* Crimson double rule under the transcript masthead */}
            <div style={{ display: 'flex', flexDirection: 'column', margin: '0 24px' }}>
              <div style={{ display: 'flex', height: '1px', background: CRIMSON }} />
              <div style={{ display: 'flex', height: '1px', background: CRIMSON, marginTop: '3px', opacity: 0.55 }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 24px 14px' }}>
              {rows.map((dr) => (
                <div key={dr.year} style={{ display: 'flex', alignItems: 'baseline', gap: '14px', padding: '10px 0' }}>
                  <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '25px', color: GOLD_BRIGHT }}>
                    {dr.year}
                  </div>
                  <div style={{ flex: 1, display: 'flex', borderBottom: `1px dashed ${AN_LINE}`, marginBottom: '6px' }} />
                  <div
                    style={{
                      display: 'flex',
                      fontSize: '12px',
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: CREAM_SOFT,
                    }}
                  >
                    {dr.rounds > 0 ? `${dr.rounds} RDS · ` : ''}{dr.total_picks} PICKS
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '11px 24px',
                borderTop: `1px solid ${AN_LINE}`,
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: AN_MUTE,
              }}
            >
              Graded against league history
            </div>
          </div>
        </div>

        {/* Bottom strip — inside the cloth, hairline above. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '15px 92px 30px',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex', color: AN_MUTE }}>Bound in black cloth · Est. {founded}</span>
          <span style={{ display: 'flex', color: GOLD }}>{DOMAIN}</span>
        </div>
      </div>
    ),
    imageOptions(fonts),
  )
}

/* ============================================================
   SEASON ARCHIVES — the bookshelf: one mahogany volume per season,
   champion's name on the band, all standing on a wooden plank.
   Matches seasons/index.html: .book / .shelf-plank styling.
   ============================================================ */
function renderSeasonsCard(d: LeagueFile, seasons: SeasonEntry[], fonts: Fonts) {
  const MAHOG = '#3a1d16'
  const MAHOG_DEEP = '#241009'
  const MAHOG_LITE = '#4d2a20'
  const PLANK = '#2b1812'

  const founded = d.founded ?? seasons[0]?.year ?? new Date().getFullYear()
  // Latest 5 volumes fit the compact shelf; volume numbers stay true to
  // the full run.
  const MAX_BOOKS = 5
  const offset = Math.max(0, seasons.length - MAX_BOOKS)
  const shelf = seasons.slice(-MAX_BOOKS)
  // Deterministic height variation so the shelf reads hand-filled.
  const HEIGHTS = [232, 212, 244, 220, 238]

  const bandText = (s: SeasonEntry): string => {
    const first = (s.champion_name ?? '').trim().split(/\s+/)[0] ?? ''
    return first ? clip(first, 8) : 'Champ'
  }

  const stats = [
    `${seasons.length} VOLUME${seasons.length === 1 ? '' : 'S'}`,
    `${seasons.length} CHAMPION${seasons.length === 1 ? '' : 'S'} CROWNED`,
    `EST. ${founded}`,
  ].join('  ·  ')

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(155deg, ${INK_SOFT} 0%, ${INK} 55%, ${INK_DEEP} 100%)`,
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
            background: `radial-gradient(circle at 78% 55%, ${GOLD}1c 0%, transparent 46%), radial-gradient(circle at 22% 30%, ${GOLD}18 0%, transparent 44%)`,
          }}
        />

        <div style={{ display: 'flex', height: '14px', background: GOLD }} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 64px 0 84px', gap: '30px' }}>
          {/* Left — masthead */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
                color: GOLD,
              }}
            >
              <Star size={15} color={GOLD} />
              <span style={{ display: 'flex' }}>The League Library</span>
              <Star size={15} color={GOLD} />
            </div>

            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '92px', lineHeight: 1.02, color: CREAM, marginTop: '24px' }}>
              Season
            </div>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '92px', lineHeight: 1.02, color: GOLD }}>
              Archives.
            </div>

            <div
              style={{
                display: 'flex',
                width: '120px',
                height: '3px',
                background: `linear-gradient(90deg, ${GOLD_DEEP}, transparent)`,
                marginTop: '28px',
              }}
            />

            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '30px',
                lineHeight: 1.35,
                color: CREAM_SOFT,
                marginTop: '22px',
                maxWidth: '560px',
              }}
            >
              Season by season through {clip(d.name, 26)}, bound and shelved.
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: CREAM_MUTE,
                marginTop: '30px',
              }}
            >
              {stats}
            </div>
          </div>

          {/* Right — the volumes, standing straight on their plank */}
          <div style={{ display: 'flex', flexDirection: 'column', width: '440px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '12px' }}>
                {shelf.map((s, i) => (
                  <div
                    key={s.year}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      width: '68px',
                      height: `${HEIGHTS[i % HEIGHTS.length]}px`,
                      background: `linear-gradient(90deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.02) 7%, transparent 15%, transparent 82%, rgba(0,0,0,0.35) 92%, rgba(0,0,0,0.5) 100%), linear-gradient(180deg, ${MAHOG_LITE} 0%, ${MAHOG} 30%, ${MAHOG_DEEP} 100%)`,
                      borderRadius: '2px 6px 6px 2px',
                      boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.06), 0 5px 12px rgba(0,0,0,0.45)',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', width: '68%', marginTop: '10px' }}>
                      <div style={{ display: 'flex', height: '1px', background: 'rgba(232,200,137,0.55)' }} />
                      <div style={{ display: 'flex', height: '1px', background: 'rgba(232,200,137,0.25)', marginTop: '2px' }} />
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        fontSize: '8px',
                        fontWeight: 700,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: GOLD,
                        marginTop: '7px',
                      }}
                    >
                      {toRoman(offset + i + 1)}
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div
                        style={{
                          display: 'flex',
                          transform: 'rotate(90deg)',
                          fontFamily: 'DMSerif',
                          fontStyle: 'italic',
                          fontSize: '28px',
                          letterSpacing: '0.08em',
                          color: GOLD_BRIGHT,
                        }}
                      >
                        {s.year}
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        width: '100%',
                        justifyContent: 'center',
                        padding: '6px 3px',
                        background: GOLD_DEEP,
                        color: 'rgba(10,10,12,0.85)',
                        fontSize: '9px',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {bandText(s)}
                    </div>
                  </div>
                ))}
              </div>
              {/* The plank */}
              <div
                style={{
                  display: 'flex',
                  height: '18px',
                  background: `linear-gradient(180deg, #4a2c1c 0%, ${PLANK} 35%, #1a0d08 100%)`,
                  borderTop: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '2px',
                  boxShadow: '0 10px 24px rgba(0,0,0,0.45)',
                }}
              />
            </div>
            {offset > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.26em',
                  textTransform: 'uppercase',
                  color: CREAM_MUTE,
                  marginTop: '12px',
                }}
              >
                + {offset} earlier volume{offset === 1 ? '' : 's'}
              </div>
            )}
          </div>
        </div>

        {/* Bottom strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '13px 60px',
            background: INK_DEEP,
            borderTop: `1px solid ${INK_LINE}`,
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex', color: CREAM_MUTE }}>Champions · Standings · The Stories Between</span>
          <span style={{ display: 'flex', color: GOLD }}>{DOMAIN}</span>
        </div>
      </div>
    ),
    imageOptions(fonts),
  )
}

/* ============================================================
   FRONT COVER — mirrors the landing card (/api/og/home): navy
   ink field, gold sash strips, masthead on the left and the
   leather league book on the right — but personalized. The
   league's own name is the masthead and the emboss on the book,
   the seal carries its real volume number, and the left column
   cites the defending champion and career totals.
   Used for the bare URL and the rivalries/live chapter stamps.
   ============================================================ */
function renderLeagueCard(
  d: LeagueFile,
  fonts: Fonts,
  chapter: { label: string; accent: string } | null,
) {
  const founded = d.founded ?? d.current_season ?? new Date().getFullYear()
  const currentSeason = d.current_season ?? founded
  const volume = Math.max(1, currentSeason - founded + 1)
  const yearSpan = currentSeason > founded ? `${founded}-${currentSeason}` : `${founded}`

  // Spell the league name as headlines do: split the last word off so the
  // masthead stacks head/tail like the almanac hero, tail in gold italic
  // with the landing card's closing period.
  const words = (d.name ?? '').trim().split(/\s+/).filter(Boolean)
  const head = words.length > 1 ? words.slice(0, -1).join(' ') : ''
  const tailWord = words.length > 0 ? words[words.length - 1] : (d.name ?? '')
  const tail = /[a-z0-9]$/i.test(tailWord) ? `${tailWord}.` : tailWord

  // Scale the masthead to the longest stacked line so long league names
  // stay inside the left column instead of colliding with the book.
  const maxLen = Math.max(head.length, tail.length)
  const nameSize = maxLen <= 10 ? 88 : maxLen <= 14 ? 70 : maxLen <= 19 ? 56 : maxLen <= 26 ? 44 : 36

  const stats = [
    d.total_seasons != null ? `${d.total_seasons} SEASON${d.total_seasons === 1 ? '' : 'S'}` : null,
    d.total_matchups != null ? `${d.total_matchups} GAMES` : null,
    d.current_members_count != null
      ? `${d.current_members_count} MANAGER${d.current_members_count === 1 ? '' : 'S'}`
      : null,
  ].filter(Boolean).join(' · ')

  const champ = d.defending_champion
  const champName = champ?.owner_name ? clip(champ.owner_name, 22) : null

  const sealAccent = chapter?.accent ?? RUST

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
          {/* Left — league masthead + champion + career totals */}
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
              <span style={{ display: 'flex' }}>The League Almanac · Est. {founded}</span>
              <Star size={16} color={GOLD} />
            </div>

            {head && (
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontSize: `${nameSize}px`,
                  lineHeight: 1.04,
                  color: CREAM,
                  marginTop: '26px',
                }}
              >
                {head}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: `${nameSize}px`,
                lineHeight: 1.04,
                color: GOLD,
                marginTop: head ? '0px' : '26px',
              }}
            >
              {tail}
            </div>

            <div
              style={{
                display: 'flex',
                width: '120px',
                height: '3px',
                background: `linear-gradient(90deg, ${GOLD_DEEP}, transparent)`,
                marginTop: '28px',
              }}
            />

            {/* Chapter stamps keep the italic strapline; the front cover
                features the defending champion as its own gold block. */}
            {chapter || !champName ? (
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontStyle: 'italic',
                  fontSize: '30px',
                  lineHeight: 1.3,
                  color: chapter ? chapter.accent : CREAM_SOFT,
                  marginTop: '22px',
                }}
              >
                {chapter ? `The Chronicle · ${chapter.label}` : 'The complete league history.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Star size={13} color={GOLD_DEEP} />
                  <span
                    style={{
                      display: 'flex',
                      fontSize: '14px',
                      fontWeight: 700,
                      letterSpacing: '0.32em',
                      textTransform: 'uppercase',
                      color: GOLD_DEEP,
                    }}
                  >
                    Defending Champion
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: '6px' }}>
                  <span
                    style={{
                      display: 'flex',
                      fontFamily: 'DMSerif',
                      fontStyle: 'italic',
                      fontSize: '40px',
                      lineHeight: 1.1,
                      color: GOLD,
                    }}
                  >
                    {champName}
                  </span>
                  {champ?.year && (
                    <span
                      style={{
                        display: 'flex',
                        fontSize: '17px',
                        fontWeight: 700,
                        letterSpacing: '0.2em',
                        color: CREAM_SOFT,
                        marginLeft: '16px',
                        marginTop: '10px',
                      }}
                    >
                      {champ.year}
                    </span>
                  )}
                </div>
              </div>
            )}

            {stats && (
              <div
                style={{
                  display: 'flex',
                  fontSize: '16px',
                  fontWeight: 700,
                  letterSpacing: '0.26em',
                  textTransform: 'uppercase',
                  color: CREAM_SOFT,
                  marginTop: '30px',
                }}
              >
                {stats}
              </div>
            )}
          </div>

          {/* Right — the league's book, tilted, cream page slipping out. */}
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
                    fontSize: clip(d.name ?? '', 40).length > 16 ? '28px' : '36px',
                    lineHeight: 1.15,
                    color: GOLD,
                    textAlign: 'center',
                    marginTop: '14px',
                  }}
                >
                  {clip(d.name ?? 'Your League', 40)}
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
                  {yearSpan}
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

            {/* Volume seal overlapping the cover corner — the league's real
                volume count; chapter stamps tint it their accent. */}
            <div
              style={{
                position: 'absolute',
                top: '76px',
                right: '30px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '92px',
                height: '92px',
                borderRadius: '92px',
                border: `3px solid ${sealAccent}`,
                background: `${CREAM}e6`,
                color: sealAccent,
                fontWeight: 700,
                textTransform: 'uppercase',
                transform: 'rotate(12deg)',
              }}
            >
              <span style={{ display: 'flex', fontSize: '12px', letterSpacing: '0.22em' }}>Vol.</span>
              <span style={{ display: 'flex', fontSize: '17px', letterSpacing: '0.1em', marginTop: '2px' }}>
                {toRoman(volume)}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom strip — chapters on gold, mirrors the top sash. */}
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
          <span style={{ display: 'flex' }}>Seasons · Records · Rivalries · Drafts</span>
          <span style={{ display: 'flex' }}>thesundaychronicle.app</span>
        </div>
      </div>
    ),
    {
      ...imageOptions(fonts),
      emoji: 'twemoji',
    },
  )
}
