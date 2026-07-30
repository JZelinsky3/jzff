// OG image generator for The All-Time Team (managers/all-time.html).
// URL: /api/og/alltime/<slug>[?id=<uid>]
//
// Renders the page's own scene: a lit display case, navy chrome, with three
// cards fanned on the shelf in the same cream card stock the page prints
// (paper tokens + position inks lifted from all-time.html). Text left,
// cards right.
//
//   no ?id=  — the house all-stars: the best season anyone in the league
//              ever got at QB, RB and WR, each stamped with whose roster it
//              was on. Neutral on purpose — a bare share shouldn't crown
//              one manager's squad, and the hook is that every manager has
//              a squad of their own to go and look at.
//   ?id=<uid> — that manager's own squad, so a link copied after switching
//              squads previews the squad the sharer was looking at.
//
// Squads are built by the same rules the browser uses: the shared
// all-time-team.js is loaded off disk and run here rather than re-ported,
// so the totals on the card can never drift from the totals on the page.
//
// CDN-cached per (slug, uid); busted only when the league bundle's
// `league-<id>` tag is revalidated by sync.

import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLeagueBundle } from '@/lib/leagueBundleCache'
import { isDemoSlug, loadDemoBundle, DEMO_NAME } from '@/lib/og/demoBundle'

export const runtime = 'nodejs'

type LeagueFile = {
  name: string
  founded: number | null
  current_season: number | null
  draft_scoring_profile?: string | null
  superflex?: boolean | null
}

type PoolPlayer = {
  name: string
  pos: string
  source: 'draft' | 'pickup'
  round?: number
  round_pick?: number
  overall?: number
}
type PoolSeason = { year: number; final_rank: number | null; players: PoolPlayer[] }
type PoolManager = { user_id: string; name: string; is_current: boolean; seasons: PoolSeason[] }

// The shapes all-time-team.js hands back (see its header comment).
type RankLookup = Record<string, unknown>
type SquadPlayer = {
  name: string
  pos: string
  year: number
  fpts: number
  posRank: number
  pid: string | null
  ppg: number
  src: 'draft' | 'pickup'
  round?: number
  roundPick?: number
  key: string
}
type SquadSlot = { slot: string; player: SquadPlayer | null }
type Squad = {
  uid: string
  name: string
  isCurrent: boolean
  seasonsScouted: number
  poolSize: number
  slots: SquadSlot[]
  total: number
  ppw: number
  captainKey: string | null
}
type SquadBuilder = {
  buildRankLookup: (players: unknown[]) => RankLookup
  buildAll: (
    managers: PoolManager[],
    opts: { ranks: Record<number, RankLookup>; superflex: boolean },
  ) => { teams: Record<string, Squad>; order: string[] }
}

/* ── Palette ──────────────────────────────────────────────────
   Display-case chrome from main.css's navy tokens; card stock and
   position inks from all-time.html's --paper / print set. */
const INK = '#0e1620'
const INK_DEEP = '#0a1119'
const INK_SOFT = '#16202c'
const INK_LINE = '#2a3645'
const CREAM = '#f4ebd8'
const CREAM_SOFT = '#c9c0ad'
const CREAM_MUTE = '#837b6a'
const GOLD = '#e8c889'
const GOLD_DEEP = '#a88a4a'

const PAPER = '#efe5cd'
const PAPER_SOFT = '#e6dabd'
const PAPER_LINE = 'rgba(40,30,12,0.22)'
const PAPER_LINE_SOFT = 'rgba(40,30,12,0.11)'
const INK_PRINT = '#241c0e'
const INK_PRINT_MUTE = '#7f7154'
const GOLD_PRINT = '#7a5c14'
const RUST_PRINT = '#8c2b1e'

const POS_INK: Record<string, string> = {
  QB: '#2c516b',
  RB: '#2d6842',
  WR: '#8a651c',
  TE: '#5f4380',
}

const DOMAIN = 'THESUNDAYCHRONICLE.APP'

const PROFILE_LABEL: Record<string, string> = {
  ppr_6pt: 'Full PPR · 6pt Pass TD',
  ppr_4pt: 'Full PPR · 4pt Pass TD',
  half_6pt: 'Half PPR · 6pt Pass TD',
  half_4pt: 'Half PPR · 4pt Pass TD',
  std_6pt: 'Standard · 6pt Pass TD',
  std_4pt: 'Standard · 4pt Pass TD',
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

type Fonts = Awaited<ReturnType<typeof loadFonts>>

// The DM Serif / JetBrains TTFs don't carry U+2605, so a literal ★ renders
// as tofu. Draw the star as an inline SVG instead.
function Star({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2z" />
    </svg>
  )
}

function clip(s: string, max: number): string {
  const t = (s ?? '').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

// Trading cards are 150px wide, so a full "Christian McCaffrey" never fits.
// Fall back to the initial + surname the way a real card front would.
function cardName(name: string, max: number): string {
  const full = (name ?? '').trim()
  if (full.length <= max) return full
  const parts = full.split(/\s+/)
  if (parts.length > 1) {
    const short = `${parts[0]![0]}. ${parts.slice(1).join(' ')}`
    if (short.length <= max) return short
    return clip(short, max)
  }
  return clip(full, max)
}

function pts(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

// Read a file out of public/, falling back to the CDN copy so a build that
// didn't trace the file into the function bundle still renders.
async function readPublic(rel: string, origin: string): Promise<string | null> {
  try {
    return await readFile(path.join(process.cwd(), 'public', rel), 'utf8')
  } catch {
    try {
      const r = await fetch(new URL(`/${rel}`, origin), { signal: AbortSignal.timeout(4000) })
      return r.ok ? await r.text() : null
    } catch {
      return null
    }
  }
}

// all-time-team.js is a browser IIFE that ends in
//   })(typeof window !== 'undefined' ? window : this)
// so running its source with `this` bound to a carrier object hands that
// object in as `root` and we get the same builder the page uses. Cached
// for the life of the lambda — the source never changes at runtime.
let cachedBuilder: SquadBuilder | null = null
async function loadSquadBuilder(origin: string): Promise<SquadBuilder | null> {
  if (cachedBuilder) return cachedBuilder
  const src = await readPublic('pams-template/assets/js/all-time-team.js', origin)
  if (!src) return null
  const carrier: { AllTimeTeam?: SquadBuilder } = {}
  try {
    new Function(src).call(carrier)
  } catch {
    return null
  }
  if (!carrier.AllTimeTeam) return null
  cachedBuilder = carrier.AllTimeTeam
  return cachedBuilder
}

async function loadRanks(
  years: number[],
  profile: string,
  builder: SquadBuilder,
  origin: string,
): Promise<Record<number, RankLookup>> {
  const ranks: Record<number, RankLookup> = {}
  await Promise.all(
    years.map(async (y) => {
      const raw = await readPublic(`data/fantasy_ranks/${profile}/${y}.json`, origin)
      if (!raw) return
      try {
        const parsed = JSON.parse(raw) as { players?: unknown[] }
        if (Array.isArray(parsed.players)) ranks[y] = builder.buildRankLookup(parsed.players)
      } catch {
        /* a malformed year just drops out of the scouting */
      }
    }),
  )
  return ranks
}

// Sleeper's headshot URLs end in .jpg and are served as image/jpeg, but the
// bytes are actually PNG. Satori picks its decoder off the data URI's mime,
// so trusting either would blow up the render — sniff the magic bytes.
function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

// Sleeper headshots, inlined as data URIs. Satori can fetch remote images
// itself, but a 404 there kills the whole render — pre-fetching lets a
// missing portrait fall back to the card's monogram instead.
async function loadPortrait(pid: string | null): Promise<string | null> {
  if (!pid) return null
  try {
    const r = await fetch(`https://sleepercdn.com/content/nfl/players/thumb/${pid}.jpg`, {
      signal: AbortSignal.timeout(2500),
    })
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.byteLength < 512) return null // Sleeper serves a stub for unknown ids
    const mime = sniffMime(buf)
    if (!mime) return null
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
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
  const data = bundle['league.json'] as LeagueFile | undefined
  if (!data) return new Response('No league data', { status: 404 })

  const fonts = await loadFonts()
  const profile = data.draft_scoring_profile ?? 'ppr_6pt'
  const superflex = !!data.superflex
  const shell = {
    leagueName: data.name,
    founded: data.founded ?? data.current_season ?? new Date().getFullYear(),
    profileLabel: PROFILE_LABEL[profile] ?? profile,
    superflex,
  }

  const origin = req.nextUrl.origin
  const pool = bundle['all_time_pool.json'] as { managers?: PoolManager[] } | undefined
  const managers = (pool?.managers ?? []).filter((m) => m && m.user_id)
  const builder = managers.length > 0 ? await loadSquadBuilder(origin) : null
  if (!builder) return renderCard({ ...shell, squadCount: 0, feature: null, portraits: {} }, fonts)

  const years = [...new Set(managers.flatMap((m) => (m.seasons ?? []).map((s) => s.year)))]
  const ranks = await loadRanks(years, profile, builder, origin)
  const { teams, order } = builder.buildAll(managers, { ranks, superflex })
  if (order.length === 0) {
    return renderCard({ ...shell, squadCount: 0, feature: null, portraits: {} }, fonts)
  }

  // Personal card only on an explicit &share=squad — see the header note on
  // why a bare ?id= can't be trusted as intent. Everything else, including
  // an unknown id, gets the house all-stars.
  const requested = req.nextUrl.searchParams.get('id')
  const wantsSquad = req.nextUrl.searchParams.get('share') === 'squad'
  const team = requested && wantsSquad ? teams[requested] : undefined
  const feature = team
    ? personalFeature(team, order.indexOf(team.uid) + 1, order.length)
    : houseFeature(teams, order.length, data.name)

  const portraitList = await Promise.all(feature.cards.map((c) => loadPortrait(c.player.pid)))
  const portraits: Record<string, string> = {}
  feature.cards.forEach((c, i) => {
    const url = portraitList[i]
    if (url) portraits[c.player.key] = url
  })

  return renderCard({ ...shell, squadCount: order.length, feature, portraits }, fonts)
}

// One card on the shelf. `owner` is set only on the house all-stars, where
// whose roster the season was on is the whole point.
type ShelfCard = { slot: string; player: SquadPlayer; owner?: string }

type Feature = {
  kick: string
  headline: string
  sub: string
  cards: ShelfCard[]
  captainKey: string | null
  stats: { lead: string; rest: string; restGold?: boolean }
}

// Best positional finish in the middle of the fan, the other two flanking
// it — the same "captain" rule the page stars a card with.
function arrangeFan(cards: ShelfCard[]): ShelfCard[] {
  const ranked = cards
    .slice()
    .sort((a, b) => a.player.posRank - b.player.posRank || b.player.fpts - a.player.fpts)
    .slice(0, 3)
  return ranked.length === 3 ? [ranked[1]!, ranked[0]!, ranked[2]!] : ranked
}

function bestFinish(cards: ShelfCard[]): string | null {
  let best: SquadPlayer | null = null
  for (const c of cards) {
    if (!best || c.player.posRank < best.posRank || (c.player.posRank === best.posRank && c.player.fpts > best.fpts)) {
      best = c.player
    }
  }
  return best?.key ?? null
}

// The neutral card: the single best season anyone in the league ever got at
// QB, RB and WR, each stamped with whose roster it was on. A season that's
// the league's best at a position is necessarily its owner's best there
// too, so it always sits in that manager's own starting slot.
function houseFeature(teams: Record<string, Squad>, squadCount: number, leagueName: string): Feature {
  const best = new Map<string, ShelfCard>()
  for (const team of Object.values(teams)) {
    for (const s of team.slots) {
      const p = s.player
      if (!p) continue
      const cur = best.get(p.pos)
      if (!cur || p.fpts > cur.player.fpts) best.set(p.pos, { slot: p.pos, player: p, owner: team.name })
    }
  }
  // TE stands in only if the league somehow never rostered one of the big three.
  const cards = ['QB', 'RB', 'WR', 'TE']
    .map((pos) => best.get(pos))
    .filter((c): c is ShelfCard => !!c)
    .slice(0, 3)

  return {
    kick: 'The house all-stars',
    headline: 'The best anyone ever had',
    sub: `The best season at every position, for every manager who ever ran a team in ${clip(leagueName, 24)}.`,
    cards: arrangeFan(cards),
    captainKey: bestFinish(cards),
    stats: {
      lead: `All ${squadCount} squads on file`,
      rest: '·  See yours',
      restGold: true,
    },
  }
}

// The personal card: the squad the sharer had open, its three best
// positional finishes on the shelf.
function personalFeature(team: Squad, rank: number, squadCount: number): Feature {
  const cards: ShelfCard[] = team.slots
    .filter((s): s is { slot: string; player: SquadPlayer } => !!s.player)
    .map((s) => ({ slot: s.slot, player: s.player }))

  return {
    kick: `${ordinal(rank)} of ${squadCount} squads`,
    headline: clip(team.name, 24),
    sub: `The best season at every position ever to play for ${clip(team.name, 22)}.`,
    cards: arrangeFan(cards),
    captainKey: team.captainKey,
    stats: {
      lead: `${pts(team.total)} PTS`,
      rest: `${team.ppw.toFixed(1)} PPG  ·  ${team.seasonsScouted} SEASON${team.seasonsScouted === 1 ? '' : 'S'} SCOUTED`,
    },
  }
}

type CardData = {
  leagueName: string
  founded: number
  profileLabel: string
  superflex: boolean
  squadCount: number
  feature: Feature | null
  portraits: Record<string, string>
}

/* ============================================================
   THE ALL-TIME TEAM — the display case: navy chrome, a lit shelf,
   and the squad's three best cards fanned on it in the page's own
   cream card stock. Matches all-time.html: --an-* navy case,
   --paper card front, position inks on the slot chips.
   ============================================================ */
// Portraits are the one part of the scene that comes from someone else's
// server. Satori decodes them while streaming, so a byte it can't parse
// kills the response mid-flight rather than throwing where we could catch
// it. Render to a buffer first, and if that fails, deal the same cards
// again with monograms instead of photos.
async function renderCard(d: CardData, fonts: Fonts) {
  try {
    return await materialize(renderCardInner(d, fonts))
  } catch {
    return await materialize(renderCardInner({ ...d, portraits: {} }, fonts))
  }
}

async function materialize(res: ImageResponse): Promise<Response> {
  const buf = await res.arrayBuffer()
  return new Response(buf, { headers: res.headers })
}

function renderCardInner(d: CardData, fonts: Fonts) {
  const f = d.feature
  const lineup = d.superflex ? 'eight' : 'seven'
  const fan = f?.cards ?? []
  const sub = f?.sub
    ?? `The best season at every position, for every manager who ever ran a team in ${clip(d.leagueName, 24)}.`

  // Kept to one line: the scoring profile already carries a middot.
  const wire = [
    d.squadCount > 0 ? `${d.squadCount} SQUAD${d.squadCount === 1 ? '' : 'S'} ON FILE` : null,
    d.profileLabel.toUpperCase(),
  ].filter(Boolean).join('  ·  ')

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(158deg, ${INK_SOFT} 0%, ${INK} 46%, ${INK_DEEP} 100%)`,
          color: CREAM,
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        {/* Case light: one lamp over the shelf, dark in the corners. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 74% 40%, rgba(232,200,137,0.20) 0%, transparent 52%), radial-gradient(circle at 8% 8%, rgba(232,200,137,0.10) 0%, transparent 42%)`,
          }}
        />

        {/* Gold band + hairline: the page's double rule, on the case lid. */}
        {/* Top sash in the same card stock as the foot strip, so the
            card is bracketed by one material rather than two. */}
        <div style={{ display: 'flex', height: '16px', background: PAPER }} />
        <div style={{ display: 'flex', height: '1px', background: GOLD_DEEP, marginTop: '3px', opacity: 0.6 }} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 56px 0 84px', gap: '34px' }}>
          {/* Left — masthead */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
                color: GOLD,
              }}
            >
              <Star size={14} color={GOLD} />
              <span style={{ display: 'flex' }}>From the Manager File</span>
              <Star size={14} color={GOLD} />
            </div>

            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '90px', lineHeight: 1.02, color: CREAM, marginTop: '24px' }}>
              The All-Time
            </div>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '90px', lineHeight: 1.02, color: GOLD }}>
              Team.
            </div>

            <div
              style={{
                display: 'flex',
                width: '120px',
                height: '3px',
                background: `linear-gradient(90deg, ${GOLD_DEEP}, transparent)`,
                marginTop: '24px',
              }}
            />

            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '27px',
                lineHeight: 1.34,
                color: CREAM_SOFT,
                marginTop: '22px',
                maxWidth: '500px',
              }}
            >
              {sub}
            </div>

            <div
              style={{
                display: 'flex',
                borderTop: `1px solid ${INK_LINE}`,
                borderBottom: `1px solid ${INK_LINE}`,
                padding: '9px 0',
                marginTop: '28px',
                maxWidth: '500px',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: CREAM_MUTE,
              }}
            >
              {wire}
            </div>
          </div>

          {/* Right — the shelf */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '486px' }}>
            <div
              style={{
                display: 'flex',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: GOLD,
              }}
            >
              {f ? f.kick : 'The case is being filled'}
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontSize: f && f.headline.length > 17 ? '32px' : '40px',
                lineHeight: 1.05,
                color: CREAM,
                marginTop: '8px',
              }}
            >
              {f ? f.headline : 'No squads yet'}
            </div>

            {/* The fan */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: '272px', marginTop: '18px' }}>
              {fan.length > 0
                ? fan.map((c, i) => {
                    const center = fan.length === 3 ? i === 1 : i === 0
                    return (
                      <TradingCard
                        key={c.player.key}
                        slot={c.slot}
                        p={c.player}
                        owner={c.owner ?? null}
                        captain={f?.captainKey === c.player.key}
                        portrait={d.portraits[c.player.key] ?? null}
                        scale={center ? 1.08 : 1}
                        tilt={fan.length === 3 ? [-6, 0, 6][i]! : 0}
                        lift={center ? 16 : 0}
                        overlap={i === 0 ? 0 : 6}
                        z={center ? 3 : i === 0 ? 1 : 2}
                      />
                    )
                  })
                : [0, 1, 2].map((i) => (
                    <EmptySlot
                      key={i}
                      tilt={[-6, 0, 6][i]!}
                      lift={i === 1 ? 16 : 0}
                      overlap={i === 0 ? 0 : 6}
                      z={i === 1 ? 3 : i === 0 ? 1 : 2}
                    />
                  ))}
            </div>

            {/* Shelf edge, lit from above. Sits clear of the tilted cards'
                bottom corners, which dip below their own boxes. */}
            <div style={{ display: 'flex', flexDirection: 'column', width: '440px', marginTop: '20px' }}>
              <div style={{ display: 'flex', height: '2px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
              <div style={{ display: 'flex', height: '14px', background: `linear-gradient(180deg, rgba(232,200,137,0.16), transparent)` }} />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginTop: '4px',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: CREAM_MUTE,
              }}
            >
              {f ? (
                <>
                  <span style={{ display: 'flex', color: CREAM }}>{f.stats.lead}</span>
                  <span style={{ display: 'flex', marginLeft: '14px', color: f.stats.restGold ? GOLD : CREAM_MUTE }}>
                    {f.stats.rest}
                  </span>
                </>
              ) : (
                <span style={{ display: 'flex' }}>Sync a draft or a season to deal the first squad</span>
              )}
            </div>
          </div>
        </div>

        {/* Bottom strip — card stock, ink type, like the fronts above it. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 84px',
            background: PAPER,
            color: INK_PRINT,
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.26em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex' }}>The starting {lineup} · One slot each · Est. {d.founded}</span>
          <span style={{ display: 'flex' }}>{DOMAIN}</span>
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

/* One card front: slot chip, year, portrait (or monogram), name, positional
   finish, points, and — on the house all-stars — whose roster the season was
   on, standing in for the draft-slot line. Same furniture as .tcard-face in
   all-time.html, scaled to fit the shelf. */
function TradingCard({
  slot,
  p,
  owner,
  captain,
  portrait,
  scale,
  tilt,
  lift,
  overlap,
  z,
}: {
  slot: string
  p: SquadPlayer
  owner: string | null
  captain: boolean
  portrait: string | null
  scale: number
  tilt: number
  lift: number
  overlap: number
  z: number
}) {
  const px = (n: number) => `${Math.round(n * scale)}px`
  const w = Math.round(150 * scale)
  const h = Math.round(228 * scale)
  const ink = POS_INK[p.pos] ?? GOLD_PRINT
  const photoH = Math.round(84 * scale)
  const photoW = w - Math.round(18 * scale)
  const acq = p.src === 'draft' && p.round ? `RD ${p.round} · PK ${p.roundPick ?? '—'}` : 'IN-SEASON ADD'
  // On the house all-stars the owner replaces the draft slot, and reads as
  // a possessive so a bare name can't be mistaken for the NFL team.
  const footNote = owner ? `${clip(owner, 10).toUpperCase()}'S` : acq

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: `${w}px`,
        height: `${h}px`,
        marginLeft: `${overlap}px`,
        marginBottom: `${lift}px`,
        zIndex: z,
        transform: `rotate(${tilt}deg)`,
        background: `linear-gradient(168deg, ${PAPER} 0%, ${PAPER} 72%, ${PAPER_SOFT} 100%)`,
        border: '1px solid #47402f',
        borderRadius: '7px',
        boxShadow: '0 18px 40px rgba(0,0,0,0.62)',
      }}
    >
      {/* Top: slot chip + season */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${px(7)} ${px(9)} ${px(4)}` }}>
        <div
          style={{
            display: 'flex',
            background: ink,
            color: PAPER,
            borderRadius: '2px',
            padding: `${px(2)} ${px(6)}`,
            fontSize: px(9),
            fontWeight: 700,
            letterSpacing: '0.18em',
          }}
        >
          {slot}
        </div>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: px(16), color: GOLD_PRINT }}>
          {p.year}
        </div>
      </div>

      {/* Portrait plate */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: `0 ${px(9)}`,
          width: `${photoW}px`,
          height: `${photoH}px`,
          background: PAPER_SOFT,
          border: `1px solid ${PAPER_LINE}`,
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        {portrait ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portrait}
            alt=""
            width={photoW}
            height={photoH}
            style={{ width: `${photoW}px`, height: `${photoH}px`, objectFit: 'cover', objectPosition: 'center top' }}
          />
        ) : (
          <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: px(40), color: GOLD_PRINT }}>
            {(p.name ?? '?').trim()[0]?.toUpperCase() ?? '?'}
          </div>
        )}
        {/* Paper tint over the photo so it sits in the stock, not on it. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: 'linear-gradient(170deg, rgba(239,229,205,0.24) 0%, rgba(122,92,20,0.16) 100%)',
          }}
        />
        {captain && (
          <div
            style={{
              position: 'absolute',
              top: px(5),
              right: px(5),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: px(24),
              height: px(24),
              borderRadius: '999px',
              background: GOLD_PRINT,
            }}
          >
            <Star size={Math.round(12 * scale)} color={PAPER} />
          </div>
        )}
      </div>

      {/* Name + finish */}
      <div
        style={{
          display: 'flex',
          padding: `${px(8)} ${px(9)} 0`,
          fontFamily: 'DMSerif',
          fontSize: px(16),
          lineHeight: 1.08,
          color: INK_PRINT,
        }}
      >
        {cardName(p.name, 13)}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: px(5), padding: `${px(3)} ${px(9)} 0` }}>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: px(21), lineHeight: 1, color: ink }}>
          {p.pos}{p.posRank}
        </div>
        <div style={{ display: 'flex', fontSize: px(8), fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: INK_PRINT_MUTE }}>
          that season
        </div>
      </div>

      {/* Agate footer */}
      <div
        style={{
          display: 'flex',
          marginTop: 'auto',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          padding: `${px(5)} ${px(9)} ${px(6)}`,
          borderTop: `1px solid ${PAPER_LINE_SOFT}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: px(3), fontSize: px(11), fontWeight: 700, color: INK_PRINT }}>
          <span style={{ display: 'flex' }}>{p.fpts.toFixed(1)}</span>
          <span style={{ display: 'flex', fontSize: px(8), color: INK_PRINT_MUTE, letterSpacing: '0.1em' }}>PTS</span>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: px(8),
            fontWeight: owner ? 700 : 400,
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
            color: owner ? GOLD_PRINT : p.src === 'draft' ? INK_PRINT_MUTE : RUST_PRINT,
          }}
        >
          {footNote}
        </div>
      </div>

      {/* The card's gold inner ring (an inset shadow on the real thing). */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', border: '5px solid rgba(122,92,20,0.16)', borderRadius: '7px' }} />
    </div>
  )
}

/* Empty case: a league with nothing scouted yet still gets the scene,
   just with the sleeves waiting to be filled. */
function EmptySlot({ tilt, lift, overlap, z }: { tilt: number; lift: number; overlap: number; z: number }) {
  return (
    <div
      style={{
        display: 'flex',
        width: '150px',
        height: '228px',
        marginLeft: `${overlap}px`,
        marginBottom: `${lift}px`,
        zIndex: z,
        transform: `rotate(${tilt}deg)`,
        borderRadius: '7px',
        border: `1px dashed ${INK_LINE}`,
        background: 'rgba(255,255,255,0.02)',
      }}
    />
  )
}
