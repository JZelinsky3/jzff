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

const TEMPLATE_ROOT = path.join(process.cwd(), 'src', 'templates', 'pams')

type LeagueMeta = {
  id: string
  name: string
  slug: string
  abbreviation: string | null
  founded: number | null
  published_at: string | null
  owner_id: string | null
  created_during_testing: boolean
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
    .select('id, name, slug, abbreviation, published_at, owner_id, created_during_testing, trades_theme')
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
    created_during_testing: !!row.created_during_testing,
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
function injectDcConfig(
  html: string,
  meta: LeagueMeta,
  isCommish: boolean,
  isSignedIn: boolean,
  isBookmarked: boolean,
  tutorialDismissed: boolean,
  tutorialSeenPages: string[],
): string {
  const config = `<script>window.__DC=${JSON.stringify({
    id: meta.id,
    slug: meta.slug,
    name: meta.name,
    isCommish,
    isSignedIn,
    isBookmarked,
    isTestingLeague: meta.created_during_testing,
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

function injectBaseTag(html: string, meta: LeagueMeta, file: string): string {
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
  const preloads = (PRELOADS_BY_FILE[file] ?? [])
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
  const BUNDLE_VERSION = 'v71'
  return unstable_cache(
    async () => exportLeague(leagueId, { slug }),
    ['pams-bundle', BUNDLE_VERSION, leagueId, slug],
    { tags: [`league-${leagueId}`], revalidate: 3600 }
  )()
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

// Block traversal: only allow paths that stay inside TEMPLATE_ROOT.
function safeTemplatePath(rel: string): string | null {
  const target = path.normalize(path.join(TEMPLATE_ROOT, rel))
  if (!target.startsWith(TEMPLATE_ROOT + path.sep) && target !== TEMPLATE_ROOT) return null
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

  const meta = await loadLeagueMeta(slug)
  if (!meta) return new NextResponse('League not found', { status: 404 })

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

  if (resolved.kind === 'html') {
    const filePath = safeTemplatePath(resolved.file)
    if (!filePath) return new NextResponse('Forbidden', { status: 403 })
    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf-8')
    } catch {
      return new NextResponse('Page not found', { status: 404 })
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
    const html = injectDcConfig(
      injectBaseTag(applyTokens(raw, meta), meta, resolved.file),
      meta,
      isCommish,
      isSignedIn,
      isBookmarked,
      tutorialDismissed,
      tutorialSeenPages,
    )
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, max-age=60',
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
