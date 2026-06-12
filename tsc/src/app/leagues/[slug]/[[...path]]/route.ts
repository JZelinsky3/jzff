// Per-league static site: serves the tokenized pams template HTML/JSON for any
// league synced into Dynasty Codex. Pages live at src/templates/pams/ with
// {{LEAGUE_*}} placeholders; data is computed from Supabase via exportLeague().
//
// Route examples (slug = "pa-milk-society"):
//   /leagues/pa-milk-society/                         → index.html
//   /leagues/pa-milk-society/standings.html           → standings.html
//   /leagues/pa-milk-society/seasons/index.html       → seasons/index.html
//   /leagues/pa-milk-society/data/managers/123.json   → exported JSON
//
// Caching: per-league bundle is memoized via unstable_cache with tag
// `league-<id>`. The sync route bumps that tag.

import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { exportLeague, type ExportBundle } from '@/lib/export/pams'
import { devBundleGet, devBundleSet, devMetaGet, devMetaSet } from '@/lib/devCache'
import { resolveLeagueTier, getLockReason, classifyLockedPath } from '@/lib/leagueTier'
import { getUserSubscription, isSubscriptionActive } from '@/lib/stripe'

const TEMPLATE_ROOT = path.join(process.cwd(), 'src', 'templates', 'pams')
// Mobile-first rebuilds of the same pages. Phones get the file from here when
// it exists; anything not yet rebuilt falls back to the desktop template, so
// the tree can fill in page by page without breaking partial coverage.
const MOBILE_TEMPLATE_ROOT = path.join(process.cwd(), 'src', 'templates', 'pams-mobile')
// 'desktop' | 'mobile' — explicit user choice ("View desktop site" link /
// switch-back pill). Beats user-agent sniffing in both directions.
const VIEW_COOKIE = 'dc_view'

type LeagueMeta = {
  id: string
  name: string
  slug: string
  abbreviation: string | null
  founded: number | null
  published_at: string | null
  owner_id: string | null
  is_udfa: boolean
  created_at: string | null
  trades_theme: 'tribunal' | 'wire' | 'floor' | 'cards'
}

const VALID_THEMES = ['tribunal', 'wire', 'floor', 'cards'] as const
function normalizeTradesTheme(v: unknown): LeagueMeta['trades_theme'] {
  return typeof v === 'string' && (VALID_THEMES as readonly string[]).includes(v)
    ? (v as LeagueMeta['trades_theme'])
    : 'cards'
}

// Meta lookup. Slug→row + the league's first season year for the masthead
// "EST." line. Two queries on a cold call; in dev they're deduped by
// devMetaGet so the hub's 5 parallel data fetches share one round-trip.
async function loadLeagueMetaUncached(slug: string): Promise<LeagueMeta | null> {
  const db = createAdminClient()
  const { data: row } = await db
    .from('leagues')
    .select('id, name, slug, abbreviation, published_at, owner_id, is_udfa, created_at, trades_theme')
    .eq('slug', slug)
    .maybeSingle()
  if (!row) return null
  const { data: firstSeason } = await db
    .from('seasons')
    .select('year')
    .eq('league_id', row.id)
    .order('year', { ascending: true })
    .limit(1)
    .maybeSingle()
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    abbreviation: row.abbreviation ?? null,
    founded: firstSeason?.year ?? null,
    published_at: row.published_at ?? null,
    owner_id: row.owner_id ?? null,
    is_udfa: !!row.is_udfa,
    created_at: (row.created_at as string | null) ?? null,
    trades_theme: normalizeTradesTheme(row.trades_theme),
  }
}

function loadLeagueMeta(slug: string): Promise<LeagueMeta | null> {
  // Dev: dedupe parallel lookups. Every request to /leagues/<slug>/... (HTML
  // and every data file) needs meta, and the hub fires 5+ of those in
  // close succession — without this, each one pays the Supabase floor.
  // Prod: skip the in-memory cache. Reads here are fast against the
  // hosted Postgres and we'd rather not hand-roll TTL invalidation on
  // settings changes; trust the platform.
  if (process.env.NODE_ENV === 'production') return loadLeagueMetaUncached(slug)
  const cached = devMetaGet<LeagueMeta>(slug)
  if (cached) return cached
  const fresh = loadLeagueMetaUncached(slug)
  devMetaSet(slug, fresh)
  return fresh
}

function toRoman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  const numerals: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let out = ''
  let v = Math.floor(n)
  for (const [val, sym] of numerals) {
    while (v >= val) { out += sym; v -= val }
  }
  return out
}

function abbreviate(name: string): string {
  const initials = name
    .replace(/[^A-Za-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return initials || name.slice(0, 4).toUpperCase()
}

function applyTokens(html: string, meta: LeagueMeta): string {
  const founded = meta.founded ?? new Date().getFullYear()
  const parts = meta.name.trim().split(/\s+/)
  const head = parts.length > 1 ? parts.slice(0, -1).join(' ') : ''
  const tail = parts[parts.length - 1] ?? meta.name
  const abbr = meta.abbreviation?.trim() || abbreviate(meta.name)
  // Single-word names: collapse the "{{LEAGUE_NAME_HEAD}}<br>" pattern so the
  // hero title doesn't leave a phantom blank line above the league name.
  const out = head
    ? html
    : html.replaceAll('{{LEAGUE_NAME_HEAD}}<br>', '')
  return out
    .replaceAll('{{LEAGUE_NAME}}', meta.name)
    .replaceAll('{{LEAGUE_NAME_UPPER}}', meta.name.toUpperCase())
    .replaceAll('{{LEAGUE_NAME_HEAD}}', head)
    .replaceAll('{{LEAGUE_NAME_TAIL}}', tail)
    .replaceAll('{{LEAGUE_ABBR}}', abbr)
    .replaceAll('{{LEAGUE_FOUNDED_ROMAN}}', toRoman(founded))
    .replaceAll('{{LEAGUE_FOUNDED}}', String(founded))
    .replaceAll('{{LEAGUE_SLUG}}', meta.slug)
}

// Inject a small config script with the current league's context so nav.js
// can wire absolute links to the Dynasty Codex dashboard and management view.
async function injectDcConfig(
  html: string,
  meta: LeagueMeta,
  isCommish: boolean,
  isSignedIn: boolean,
  isBookmarked: boolean,
  tutorialDismissed: boolean,
  tutorialSeenPages: string[],
  pageLocked: boolean,
): Promise<string> {
  const leagueTier = await resolveLeagueTier(meta.id, meta.owner_id)
  // Surface the owner's *actual* subscription tier (tier1/2/3) so the
  // hub can show a "Rookie · Upgrade" line under the totals. Only
  // matters for non-comp owners; for comp/no-owner we leave it null
  // and the hub script falls back to a tier-from-leagueTier label.
  let paidTier: 'tier1' | 'tier2' | 'tier3' | null = null
  if (meta.owner_id && leagueTier !== 'comp') {
    const sub = await getUserSubscription(meta.owner_id)
    if (isSubscriptionActive(sub) && sub) paidTier = sub.tier
  }
  const config = `<script>window.__DC=${JSON.stringify({
    id: meta.id,
    slug: meta.slug,
    name: meta.name,
    isCommish,
    isSignedIn,
    isBookmarked,
    isUdfaLeague: meta.is_udfa,
    leagueTier,
    paidTier,
    pageLocked,
    tradesTheme: meta.trades_theme,
    tutorialDismissed,
    tutorialSeenPages,
  })};</script>`
  // Stamp the theme as a body data-attribute so theme CSS applies during the
  // first paint without waiting for JS. We only do this when the template
  // actually has a <body> tag (every page does, but defensive).
  if (/<body[^>]*>/.test(html)) {
    return html.replace(/<body(\b[^>]*)?>/, (_m, attrs) =>
      `<body data-trades-theme="${meta.trades_theme}"${attrs ?? ''}>\n${config}`,
    )
  }
  return config + html
}

// Pin the document base URL to /leagues/<slug>/ so the template's relative
// hrefs (standings.html, seasons/index.html, data/league.json, etc.) resolve
// the same way regardless of whether the request URL has a trailing slash.
// Absolute paths (/pams-template/...) are unaffected.
// Pages that fetch a known set of data/*.json files. We emit
// <link rel="preload"> hints for those files so the browser starts the
// network requests as soon as it parses <head> — instead of waiting until
// the body's inline script runs and calls fetch(). Shaves the parse +
// script-eval delay off the start of every data load.
//
// Only the hub is wired up so far; other pages can opt in by adding a
// matching entry here. We deliberately don't preload EVERY data file on
// every page — preloading something the page doesn't fetch wastes
// bandwidth and triggers a console warning.
const PRELOADS_BY_FILE: Record<string, string[]> = {
  'index.html': [
    'data/league.json',
    'data/record_book.json',
    'data/managers_directory.json',
    'data/rivalries.json',
    'data/seasons_directory.json',
  ],
}

// Same idea, separate map for the mobile templates — file names collide
// across the two trees but the pages don't necessarily fetch the same files.
const MOBILE_PRELOADS_BY_FILE: Record<string, string[]> = {
  'index.html': [
    'data/league.json',
    'data/record_book.json',
    'data/managers_directory.json',
    'data/rivalries.json',
    'data/seasons_directory.json',
  ],
}

function injectBaseTag(html: string, meta: LeagueMeta, file: string, servedMobile = false): string {
  // <base> pins relative hrefs to /leagues/<slug>/; favicon link points at
  // the absolute /icon.svg the Next.js root layout serves (templates don't
  // inherit from the layout so they don't get the favicon automatically).
  // Meta description is injected for crawlers — without it Bing flags
  // every almanac page as missing one.
  const safeName = escapeHtml(meta.name)
  const description = `Public almanac for ${safeName} — full fantasy football league history, season archives, draft results, head-to-head records, rivalries, and weekly pick'ems.`
  // The preload hints MUST come after <base> so the browser resolves them
  // against /leagues/<slug>/ — otherwise a relative href like
  // data/league.json resolves against the document URL and can hit a path
  // that doesn't exist (e.g. on a sub-route).
  const preloads = ((servedMobile ? MOBILE_PRELOADS_BY_FILE : PRELOADS_BY_FILE)[file] ?? [])
    .map((href) => `<link rel="preload" as="fetch" crossorigin href="${href}">`)
    .join('\n')
  const tags =
    `<base href="/leagues/${meta.slug}/">` +
    `\n<link rel="icon" href="/icon.svg" type="image/svg+xml">` +
    `\n<meta name="description" content="${description}">` +
    (preloads ? `\n${preloads}` : '')
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n${tags}`)
  }
  return tags + html
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

// Inject Open Graph + Twitter card meta tags so shared links produce rich
// previews in iMessage, Slack, Discord, Twitter, etc. The og:image URL is
// page-specific where it's worth it (e.g. rivalry detail pages get a card
// per rivalry) and falls back to a generic league-level image otherwise.
//
// Generic image route is not built yet; we render only the rivalry-specific
// tags for now. Other pages keep their pre-OG behavior until the rest land.
function injectOgTags(html: string, meta: LeagueMeta, file: string, req: NextRequest): string {
  const ogImage = buildOgImageUrl(meta, file, req)
  if (!ogImage) return html

  const pageUrl = new URL(req.nextUrl.pathname + req.nextUrl.search, req.nextUrl.origin).toString()
  const safeName = escapeHtml(meta.name)
  const safeTitle = escapeHtml(ogImage.title)
  const safeDesc = escapeHtml(ogImage.description)

  const tags = [
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="The Sunday Chronicle">`,
    `<meta property="og:title" content="${safeTitle}">`,
    `<meta property="og:description" content="${safeDesc}">`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}">`,
    `<meta property="og:image" content="${escapeHtml(ogImage.url)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${safeName} — ${safeTitle}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${safeTitle}">`,
    `<meta name="twitter:description" content="${safeDesc}">`,
    `<meta name="twitter:image" content="${escapeHtml(ogImage.url)}">`,
  ].join('\n')

  let out = /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (m) => `${m}\n${tags}`)
    : tags + html

  // Share UI is hidden site-wide for now. Flip back to
  // `file === 'rivalries/rivalry.html'` to restore the global share button.
  const skipShareInjection = true
  if (!skipShareInjection) {
    const shareBlock = `${shareModuleMarkup()}\n${shareInitScript(ogImage, meta, req)}`
    if (/<\/body>/i.test(out)) {
      out = out.replace(/<\/body>/i, `${shareBlock}\n</body>`)
    } else {
      out = `${out}\n${shareBlock}`
    }
  }

  return out
}

type OgImage = { url: string; title: string; description: string; downloadName?: string; shareSub?: string }

// Markup injected by the public-almanac route into every page that has an
// OG image. Avoids hand-rolling the same share dialog into each template;
// the JS module at /pams-template/assets/js/share.js handles the dialog
// behaviour and gets initialized with this page's metadata via a tiny
// inline <script> we also inject.
function shareModuleMarkup(): string {
  return `
<link rel="stylesheet" href="/pams-template/assets/css/share.css">
<button type="button" class="tsc-share-btn" id="tsc-share-btn" hidden aria-label="Share this page">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
  <span>Share</span>
</button>
<dialog class="tsc-share-dialog" id="tsc-share-dialog" aria-labelledby="tsc-share-title">
  <div class="tsc-share-kicker">Share this page</div>
  <div class="tsc-share-title" id="tsc-share-title">&nbsp;</div>
  <div class="tsc-share-sub" id="tsc-share-sub">&nbsp;</div>
  <img class="tsc-share-preview" id="tsc-share-preview" alt="Card preview">
  <div class="tsc-share-actions">
    <button type="button" class="tsc-share-action" id="tsc-share-copy">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      <span id="tsc-share-copy-label">Copy link</span>
    </button>
    <button type="button" class="tsc-share-action" id="tsc-share-download">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>Download card</span>
    </button>
  </div>
  <button type="button" class="tsc-share-close" id="tsc-share-close">Close</button>
</dialog>
<script src="/pams-template/assets/js/share.js" defer></script>`
}

function shareInitScript(og: OgImage, meta: LeagueMeta, req: NextRequest): string {
  // Strip origin from the OG URL so we pass a path to share.js (it'll
  // resolve against window.location.origin client-side — keeps the
  // dialog working on preview/prod without baking in an origin).
  let ogPath = og.url
  try { ogPath = new URL(og.url).pathname } catch { /* og.url is already a path */ }
  const shareUrl = new URL(req.nextUrl.pathname + req.nextUrl.search, req.nextUrl.origin).toString()
  const cfg = {
    ogPath,
    shareUrl,
    title: og.title,
    sub: og.shareSub ?? `A clipping from ${meta.name}'s almanac`,
    downloadName: og.downloadName ?? og.title,
  }
  // Set config inline (runs immediately when parsed); share.js loads
  // deferred and picks the config up on DOMContentLoaded. Calling
  // TSCShare.init() directly here would race the defer load.
  return `<script>window.__TSCShareConfig=${JSON.stringify(cfg)};</script>`
}

function buildOgImageUrl(meta: LeagueMeta, file: string, req: NextRequest): OgImage | null {
  // Rivalry detail: /leagues/<slug>/rivalries/rivalry.html?id=<rivalryId>
  if (file === 'rivalries/rivalry.html') {
    const rivalryId = req.nextUrl.searchParams.get('id')
    if (!rivalryId) return null
    const url = new URL(`/api/og/rivalry/${meta.slug}/${encodeURIComponent(rivalryId)}`, req.nextUrl.origin).toString()
    return {
      url,
      title: `${meta.name} · Head-to-Head`,
      description: `A fantasy football rivalry tracked in ${meta.name}'s almanac on The Sunday Chronicle.`,
    }
  }
  // Season detail: /leagues/<slug>/seasons/season.html?year=YYYY
  if (file === 'seasons/season.html') {
    const yearStr = req.nextUrl.searchParams.get('year')
    const year = yearStr ? Number(yearStr) : NaN
    if (!Number.isFinite(year)) return null
    const url = new URL(`/api/og/season/${meta.slug}/${year}`, req.nextUrl.origin).toString()
    return {
      url,
      title: `${meta.name} · ${year} Champion`,
      description: `The ${year} season of ${meta.name}, chronicled on The Sunday Chronicle.`,
    }
  }
  // Default: league-level "almanac front cover" for every other public
  // almanac page. Means any share — landing, standings, records, draft —
  // gets the league's identity card in the link preview rather than a
  // generic site-default. Page-specific routes above override this.
  const url = new URL(`/api/og/league/${meta.slug}`, req.nextUrl.origin).toString()
  return {
    url,
    title: `${meta.name} · The Almanac`,
    description: `The full history of ${meta.name} — seasons, champions, rivalries, records — on The Sunday Chronicle.`,
  }
}

// Memoize each league's full JSON bundle. Bust via revalidateTag(`league-<id>`).
// Prod: persistent unstable_cache with 1h TTL + tag bust on sync.
// Dev: in-memory cache (30s TTL, see @/lib/devCache) so a page with multiple
// data fetches (e.g. draft year tabs) doesn't re-run the full export per file.
// Dev cache is also busted explicitly by the sync route after each ingest.
function getBundle(leagueId: string, slug: string): Promise<ExportBundle> {
  // Slug is included alongside leagueId because the jake-only live-season
  // previews (records_watch.json, milestones.json) are computed inside
  // exportLeague when slug === 'jake'. Cache key is (leagueId, slug) so a
  // future slug rename rebuilds the bundle without waiting for revalidation.
  if (process.env.NODE_ENV !== 'production') {
    const cacheKey = `${leagueId}|${slug}`
    // Cache the in-flight Promise itself, not just the resolved bundle.
    // Hub renders trigger 5 parallel data/*.json requests; without this,
    // each one that arrived before the first build finished kicked off
    // its own exportLeague() call (~4s each). Now they all await one.
    const inflight = devBundleGet(cacheKey)
    if (inflight) return inflight
    const fresh = exportLeague(leagueId, { slug })
    devBundleSet(cacheKey, fresh)
    return fresh
  }
  // Bundle schema version. Bump this when the bundle shape changes in a
  // way that the templates need to see immediately — adding a new field,
  // renaming an existing one, etc. Bumping forces unstable_cache to
  // recompute on the next request instead of waiting out the 1h TTL.
  const BUNDLE_VERSION = 'v72'
  return unstable_cache(
    async () => exportLeague(leagueId, { slug }),
    ['pams-bundle', BUNDLE_VERSION, leagueId, slug],
    { tags: [`league-${leagueId}`], revalidate: 3600 }
  )()
}

// Phone detection. Chromium ships an explicit client hint; everything else
// falls back to a deliberately narrow UA regex: iPadOS 13+ presents as
// Macintosh and Android tablets omit the "Mobile" token, so tablets get the
// desktop almanac on purpose (the desktop layout works at tablet widths).
function isMobileUA(req: NextRequest): boolean {
  // Hint OR regex — a "?0" hint is deliberately NOT trusted as desktop,
  // because UA-override tools (devtools, headless testing) swap the UA
  // string without swapping the client hints. Spoofing an iPhone UA should
  // get you the iPhone site.
  if (req.headers.get('sec-ch-ua-mobile') === '?1') return true
  const ua = req.headers.get('user-agent') ?? ''
  return /\b(iPhone|iPod)\b/.test(ua)
    || (/\bAndroid\b/.test(ua) && /\bMobile\b/.test(ua))
    || /\bWindows Phone\b/.test(ua)
}

type ViewPref = 'mobile' | 'desktop'
function resolveViewPref(req: NextRequest): ViewPref {
  const cookie = req.cookies.get(VIEW_COOKIE)?.value
  if (cookie === 'desktop') return 'desktop'
  // 'mobile' cookie also lets a desktop browser force the mobile view (testing).
  if (cookie === 'mobile') return 'mobile'
  return isMobileUA(req) ? 'mobile' : 'desktop'
}

// Switch-back affordance for phone users who chose the desktop view: a small
// fixed pill above the desktop footer chrome. Injected ONLY when the request
// is from a mobile UA with the desktop cookie set, so desktop-browser
// responses stay byte-identical. The href must be absolute-path based — the
// injected <base> would send a relative "?view=mobile" to the league root.
function injectMobileSwitchPill(html: string, req: NextRequest): string {
  const target = req.nextUrl.pathname + (req.nextUrl.search ? req.nextUrl.search + '&' : '?') + 'view=mobile'
  const pill =
    `<a href="${escapeHtml(target)}" style="position:fixed;left:50%;transform:translateX(-50%);bottom:calc(1rem + env(safe-area-inset-bottom));z-index:80;` +
    `background:rgb(14,22,32);color:#e8c889;border:1px solid #2a3645;border-radius:999px;padding:.55rem 1.1rem;` +
    `font-family:'JetBrains Mono',monospace;font-size:.62rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;` +
    `text-decoration:none;box-shadow:0 4px 18px rgba(0,0,0,.45);">Switch to mobile site</a>`
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${pill}\n</body>`)
  return html + pill
}

// Resolve the request path under /leagues/<slug>/...
// Returns one of: { kind: 'html', file } | { kind: 'data', file } | null
function resolveRequest(parts: string[] | undefined): { kind: 'html' | 'data'; file: string } | null {
  const segs = parts ?? []

  // Default: /leagues/<slug>/ → index.html
  if (segs.length === 0) return { kind: 'html', file: 'index.html' }
  const last = segs[segs.length - 1]
  // Trailing slash → directory index (Next normally strips this, but guard anyway)
  if (last === '') {
    const dirParts = segs.slice(0, -1)
    return { kind: 'html', file: [...dirParts, 'index.html'].join('/') }
  }
  // data/<anything>.json
  if (segs[0] === 'data') {
    return { kind: 'data', file: segs.slice(1).join('/') }
  }
  // *.html
  if (last.endsWith('.html')) {
    return { kind: 'html', file: segs.join('/') }
  }
  // Directory-style URL (e.g. /pickems, /rivalries) — serve index.html inside.
  // We treat anything with no file extension as a directory request.
  if (!last.includes('.')) {
    return { kind: 'html', file: [...segs, 'index.html'].join('/') }
  }
  // Anything else (assets, fonts, etc.) is out of scope — those live at
  // /pams-template/assets/... and Next.js serves them directly.
  return null
}

function setupPlaceholderHtml(meta: LeagueMeta): string {
  const name = escapeHtml(meta.name)
  const slug = escapeHtml(meta.slug)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${name} · Setup in progress</title>
<link rel="stylesheet" href="/pams-template/assets/css/main.css">
</head>
<body>
<main>
  <section class="hero" style="text-align:center;padding:6rem 1.5rem 4rem;">
    <div class="hero-sup">★ Setup in progress ★</div>
    <h1 class="hero-title">${name}</h1>
    <p class="hero-sub" style="margin-top:1.5rem;">
      The commissioner is still putting the almanac together — merging cross-platform
      identities, reviewing alumni, finalizing the roster. Check back once it's published.
    </p>
    <p style="margin-top:2rem;font-family:var(--mono);font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:var(--cream-mute);">
      /leagues/${slug}/
    </p>
  </section>
</main>
</body>
</html>`
}

// Branded 404 for HTML requests — almanac links get shared in group chats,
// and a typo'd slug shouldn't land on a stark default error. Mirrors the
// Corrections Desk styling of the app-router not-found.tsx (route handlers
// bypass that boundary, so we serve our own document). Data/JSON requests
// keep their plain-text 404s — the template JS only checks the status.
function notFoundHtml(slug: string): string {
  const safeSlug = escapeHtml(slug)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Edition not found · The Sunday Chronicle</title>
<link rel="stylesheet" href="/pams-template/assets/css/main.css">
</head>
<body>
<main>
  <section class="hero" style="text-align:center;padding:6rem 1.5rem 4rem;">
    <div class="hero-sup">★ Corrections Desk · No. 404 ★</div>
    <h1 class="hero-title">This edition <em>doesn't exist.</em></h1>
    <p class="hero-sub" style="margin-top:1.5rem;">
      No almanac is printed at this address — the link may have a typo,
      or the league hasn't published yet.
    </p>
    <p style="margin-top:2rem;font-family:var(--mono);font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:var(--cream-mute);">
      /leagues/${safeSlug}/
    </p>
    <p style="margin-top:2.5rem;">
      <a href="/" style="color:var(--gold);">Front page</a>
      &nbsp;·&nbsp;
      <a href="/hub/explore/" style="color:var(--gold);">Browse published almanacs</a>
    </p>
  </section>
</main>
</body>
</html>`
}

// Block traversal: only allow paths that stay inside the given template root.
// The `root + path.sep` prefix check also keeps the sibling roots honest —
// "…/pams-mobile/x" does not start with "…/pams/" so neither tree can reach
// into the other.
function safeTemplatePath(rel: string, root: string): string | null {
  const target = path.normalize(path.join(root, rel))
  if (!target.startsWith(root + path.sep) && target !== root) return null
  return target
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; path?: string[] }> }
): Promise<Response> {
  const { slug, path: parts } = await params

  // Legacy URL redirect: pickems/powerrank moved under /live-season/ as part
  // of the in-season hub IA. Permanent 301 keeps bookmarks, shares, and any
  // pre-existing back-button history working. Preserves trailing path bits
  // (e.g. /pickems/data → /live-season/pickems/data) and query string.
  if (parts && parts.length > 0 && (parts[0] === 'pickems' || parts[0] === 'powerrank')) {
    const newPath = ['live-season', ...parts].join('/')
    const target = new URL(`/leagues/${slug}/${newPath}`, req.url)
    target.search = req.nextUrl.search
    return NextResponse.redirect(target, 301)
  }

  const resolved = resolveRequest(parts)
  if (!resolved) return new NextResponse('Not found', { status: 404 })

  // View toggle: any HTML URL with ?view=desktop|mobile sets the preference
  // cookie and redirects to the same URL with the param stripped (other params
  // like ?year= survive). Server-side so the cookie is set before the next
  // render decides which template tree to read.
  const viewParam = req.nextUrl.searchParams.get('view')
  if (resolved.kind === 'html' && (viewParam === 'desktop' || viewParam === 'mobile')) {
    const clean = new URL(req.nextUrl)
    clean.searchParams.delete('view')
    const res = NextResponse.redirect(clean, 302)
    res.cookies.set(VIEW_COOKIE, viewParam, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
      httpOnly: true,
    })
    res.headers.set('Cache-Control', 'no-store')
    return res
  }

  const meta = await loadLeagueMeta(slug)
  if (!meta) {
    if (resolved.kind === 'html') {
      return new NextResponse(notFoundHtml(slug), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }
    return new NextResponse('League not found', { status: 404 })
  }

  // Gate: pre-publish, the public almanac is hidden behind a setup placeholder.
  // Owners reach the management UI via /league/<slug>; non-owners see "in progress".
  if (!meta.published_at) {
    if (resolved.kind === 'data') {
      return new NextResponse('Setup in progress', { status: 404 })
    }
    return new NextResponse(setupPlaceholderHtml(meta), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  // UDFA gate: certain pages and data files are locked behind the upgrade
  // wall. Locked HTML pages still render their own template (so the user
  // sees the chrome + tabs + section layout); we signal the lock via
  // __DC.pageLocked and nav.js overlays a "Locked · Upgrade" badge.
  // Locked data files 404 so stats stay empty — the user sees the page
  // structure without the gated numbers. (The manager DNA + top-perf
  // cards have their own in-place locked variants triggered by the same
  // JSON 404.)
  const lockReason = await getLockReason(meta.id, meta.owner_id)
  const lockKind = classifyLockedPath(resolved.file, lockReason)
  if (lockKind === 'data') {
    return new NextResponse('Locked', { status: 404 })
  }
  const pageLocked = lockKind === 'page'

  if (resolved.kind === 'html') {
    // Mobile fork: phones (or anyone with the mobile cookie) get the template
    // from pams-mobile/ when it exists; otherwise everyone shares the desktop
    // file. readFile's failure IS the existence check — no stat round-trip.
    const viewPref = resolveViewPref(req)
    let raw: string | null = null
    let servedMobile = false
    if (viewPref === 'mobile') {
      const mobilePath = safeTemplatePath(resolved.file, MOBILE_TEMPLATE_ROOT)
      if (mobilePath) {
        try {
          raw = await fs.readFile(mobilePath, 'utf-8')
          servedMobile = true
        } catch { /* no mobile build for this page yet — fall back to desktop */ }
      }
    }
    if (raw === null) {
      const filePath = safeTemplatePath(resolved.file, TEMPLATE_ROOT)
      if (!filePath) return new NextResponse('Forbidden', { status: 403 })
      try {
        raw = await fs.readFile(filePath, 'utf-8')
      } catch {
        return new NextResponse(notFoundHtml(slug), {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        })
      }
    }
    // Auth-aware: only the league owner should see the "Manage league /
    // Library" admin links in the public almanac dropdown. Everyone else gets
    // the visitor CTA group. Because this depends on the request's auth
    // cookie, we drop CDN caching for HTML responses (data/*.json stay
    // CDN-cached since they don't vary by user).
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const isCommish = !!user && !!meta.owner_id && user.id === meta.owner_id
    const isSignedIn = !!user
    let isBookmarked = false
    if (isSignedIn && !isCommish) {
      const { data: bm } = await supabase
        .from('league_bookmarks')
        .select('league_id')
        .eq('user_id', user.id)
        .eq('league_id', meta.id)
        .maybeSingle()
      isBookmarked = !!bm
    }
    // Tour state lives in user_metadata.tutorials:
    //   • leagues       — ISO timestamp of global dismissal (✕ / Skip).
    //   • leagues_seen  — array of data-page values the user has already
    //                     completed a tour for. Per-page tours are
    //                     suppressed once their page is in this list.
    // Anonymous viewers get falsy/empty values and the client falls back
    // to localStorage so per-device suppression still works.
    const tutorialsMeta = (user?.user_metadata as { tutorials?: Record<string, unknown> } | null)
      ?.tutorials ?? {}
    const tutorialDismissed = isSignedIn && !!tutorialsMeta['leagues']
    const tutorialSeenPages =
      isSignedIn && Array.isArray(tutorialsMeta['leagues_seen'])
        ? (tutorialsMeta['leagues_seen'] as string[])
        : []
    let html = await injectDcConfig(
      injectOgTags(
        injectBaseTag(applyTokens(raw, meta), meta, resolved.file, servedMobile),
        meta,
        resolved.file,
        req,
      ),
      meta,
      isCommish,
      isSignedIn,
      isBookmarked,
      tutorialDismissed,
      tutorialSeenPages,
      pageLocked,
    )
    // Phone user who explicitly chose the desktop view: give them a way back.
    if (!servedMobile && isMobileUA(req) && req.cookies.get(VIEW_COOKIE)?.value === 'desktop') {
      html = injectMobileSwitchPill(html, req)
    }
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Desktop keeps the 60s browser cache. Mobile-UA responses are
        // no-cache because the dc_view cookie can flip which variant a URL
        // returns mid-session — a cached copy would serve the wrong tree for
        // up to a minute after a toggle. (No Vary needed while these stay
        // `private`; if HTML ever becomes CDN-cacheable, add
        // `Vary: Sec-CH-UA-Mobile, User-Agent` and rethink the cookie.)
        'Cache-Control': isMobileUA(req) ? 'private, no-cache' : 'private, max-age=60',
      },
    })
  }

  // data/<file> — serve from the export bundle
  const bundle = await getBundle(meta.id, meta.slug)
  const value = bundle[resolved.file]
  if (value === undefined) {
    return new NextResponse('Data not found', { status: 404 })
  }
  return NextResponse.json(value, {
    // Data files: browser caches briefly so a single page load can fetch many
    // JSONs without repeating work, but we keep Vercel's CDN OUT of the loop
    // because `revalidateTag('league-<id>')` only busts the in-memory
    // `unstable_cache` entry — it does NOT purge an edge-cached response.
    // Without that purge, settings changes / syncs took up to s-maxage to
    // show up on the public almanac even after the server bundle rebuilt.
    headers: {
      'Cache-Control': 'public, max-age=60, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  })
}
