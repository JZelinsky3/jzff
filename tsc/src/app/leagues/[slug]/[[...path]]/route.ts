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
import { devCacheGet, devCacheSet } from '@/lib/devCache'

const TEMPLATE_ROOT = path.join(process.cwd(), 'src', 'templates', 'pams')

type LeagueMeta = {
  id: string
  name: string
  slug: string
  abbreviation: string | null
  founded: number | null
  published_at: string | null
  owner_id: string | null
}

async function loadLeagueMeta(slug: string): Promise<LeagueMeta | null> {
  const db = createAdminClient()
  // Try richest schema first; fall back when older migrations haven't run.
  let row: {
    id: string
    name: string
    slug: string
    abbreviation?: string | null
    published_at?: string | null
    owner_id?: string | null
  } | null = null
  const full = await db
    .from('leagues')
    .select('id, name, slug, abbreviation, published_at, owner_id')
    .eq('slug', slug)
    .maybeSingle()
  if (full.data) {
    row = full.data
  } else {
    const withAbbr = await db
      .from('leagues')
      .select('id, name, slug, abbreviation')
      .eq('slug', slug)
      .maybeSingle()
    if (withAbbr.data) {
      row = withAbbr.data
    } else {
      const bare = await db
        .from('leagues')
        .select('id, name, slug')
        .eq('slug', slug)
        .maybeSingle()
      row = bare.data
    }
  }
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
  }
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
function injectDcConfig(html: string, meta: LeagueMeta, isCommish: boolean): string {
  const config = `<script>window.__DC=${JSON.stringify({ slug: meta.slug, name: meta.name, isCommish })};</script>`
  if (/<body[^>]*>/.test(html)) {
    return html.replace(/<body[^>]*>/, (m) => `${m}\n${config}`)
  }
  return config + html
}

// Pin the document base URL to /leagues/<slug>/ so the template's relative
// hrefs (standings.html, seasons/index.html, data/league.json, etc.) resolve
// the same way regardless of whether the request URL has a trailing slash.
// Absolute paths (/pams-template/...) are unaffected.
function injectBaseTag(html: string, meta: LeagueMeta): string {
  const tag = `<base href="/leagues/${meta.slug}/">`
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n${tag}`)
  }
  return tag + html
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

// Memoize each league's full JSON bundle. Bust via revalidateTag(`league-<id>`).
// Prod: persistent unstable_cache with 1h TTL + tag bust on sync.
// Dev: in-memory cache (30s TTL, see @/lib/devCache) so a page with multiple
// data fetches (e.g. draft year tabs) doesn't re-run the full export per file.
// Dev cache is also busted explicitly by the sync route after each ingest.
function getBundle(leagueId: string): Promise<ExportBundle> {
  if (process.env.NODE_ENV !== 'production') {
    const cached = devCacheGet(leagueId)
    if (cached) return Promise.resolve(cached)
    return exportLeague(leagueId).then((bundle) => {
      devCacheSet(leagueId, bundle)
      return bundle
    })
  }
  return unstable_cache(
    async () => exportLeague(leagueId),
    ['pams-bundle', leagueId],
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
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; path?: string[] }> }
): Promise<Response> {
  const { slug, path: parts } = await params

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
    const html = injectDcConfig(injectBaseTag(applyTokens(raw, meta), meta), meta, isCommish)
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, max-age=60',
      },
    })
  }

  // data/<file> — serve from the export bundle
  const bundle = await getBundle(meta.id)
  const value = bundle[resolved.file]
  if (value === undefined) {
    return new NextResponse('Data not found', { status: 404 })
  }
  return NextResponse.json(value, {
    // Data files: browser 5 min, CDN 10 min, stale-while-revalidate 1h. The
    // server-side bundle cache is tag-busted on sync; clients may briefly see
    // stale data right after a sync but it self-heals within max-age.
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600' },
  })
}
