// Manager Hub catch-all route — owner-gated companion to the public leagues
// almanac. Serves HTML templates from src/templates/managers/ with {{MGR_*}}
// token substitution, and JSON data from a cached export bundle.
//
// URL → resolution:
//   /manager/<slug>                  → index.html        (Issue I · Front Page)
//   /manager/<slug>/legacy           → legacy/index.html  (Issue II — built in Phase 2)
//   /manager/<slug>/data/career.json → bundle['data/career.json']
//   …etc, mirroring the leagues route's resolveRequest() shape.
//
// Auth: the chronicle table is owner-scoped, so we 404 anyone who isn't the
// owner. (No public almanac for managers — that's a future call.)

import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { createClient } from '@/lib/supabase/server'
import { getManagerBundle } from '@/lib/manager/bundle'

const TEMPLATE_ROOT = path.join(process.cwd(), 'src', 'templates', 'managers')

type MgrMeta = {
  slug: string
  displayName: string
  subtitle: string | null
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

// Split the display name into "head + last word" so the hero title can render
// the last word italic-gold (matches the leagues "Name<br><em>Tail.</em>" trick).
function splitName(name: string): { head: string; tail: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length <= 1) return { head: '', tail: name }
  return { head: parts.slice(0, -1).join(' ') + ' ', tail: parts[parts.length - 1]! }
}

function applyTokens(html: string, meta: MgrMeta): string {
  const { head, tail } = splitName(meta.displayName)
  const subtitle = meta.subtitle ?? ''
  // Single-word display names: collapse the head span so we don't render a
  // dangling space before the italic tail.
  const out = head ? html : html.replaceAll('{{MGR_NAME_HEAD}}', '')
  return out
    .replaceAll('{{MGR_NAME_HEAD}}', escapeHtml(head))
    .replaceAll('{{MGR_NAME_TAIL}}', escapeHtml(tail))
    .replaceAll('{{MGR_NAME_UPPER}}', escapeHtml(meta.displayName.toUpperCase()))
    .replaceAll('{{MGR_NAME}}', escapeHtml(meta.displayName))
    .replaceAll('{{MGR_SUBTITLE}}', escapeHtml(subtitle))
    .replaceAll('{{MGR_SLUG}}', encodeURIComponent(meta.slug))
}

// Pin relative hrefs to /manager/<slug>/ so the template's relative fetches
// resolve consistently regardless of trailing slash.
function injectBaseTag(html: string, meta: MgrMeta): string {
  const tags =
    `<base href="/manager/${encodeURIComponent(meta.slug)}/">` +
    `\n<link rel="icon" href="/icon.svg" type="image/svg+xml">` +
    `\n<meta name="robots" content="noindex">`
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n${tags}`)
  }
  return tags + html
}

type Resolved = { kind: 'html' | 'data'; file: string }

function resolveRequest(parts: string[] | undefined): Resolved | null {
  const segs = parts ?? []
  if (segs.length === 0) return { kind: 'html', file: 'index.html' }
  const last = segs[segs.length - 1]!
  if (last === '') return { kind: 'html', file: [...segs.slice(0, -1), 'index.html'].join('/') }
  if (segs[0] === 'data') return { kind: 'data', file: segs.slice(1).join('/') }
  if (last.endsWith('.html')) return { kind: 'html', file: segs.join('/') }
  // Directory-style URL (e.g. /legacy, /seasons) — serve index.html inside.
  if (!last.includes('.')) return { kind: 'html', file: [...segs, 'index.html'].join('/') }
  // Anything with an extension we don't recognize: out of scope.
  return null
}

function safeTemplatePath(rel: string): string | null {
  const target = path.normalize(path.join(TEMPLATE_ROOT, rel))
  if (!target.startsWith(TEMPLATE_ROOT + path.sep) && target !== TEMPLATE_ROOT) return null
  return target
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; path?: string[] }> },
): Promise<Response> {
  const { slug, path: parts } = await params

  // Auth gate — chronicles are owner-only.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Sign in required', { status: 401 })

  const resolved = resolveRequest(parts)
  if (!resolved) return new NextResponse('Not found', { status: 404 })

  // Resolve the chronicle + bundle. getManagerBundle returns null when the
  // chronicle doesn't exist OR isn't owned by this user; collapse both to 404
  // so we don't leak existence to non-owners.
  const got = await getManagerBundle(slug, user.id)
  if (!got) return new NextResponse('Not found', { status: 404 })

  // Pull display name + subtitle for tokens. We re-fetch a tiny row here rather
  // than threading it through the bundle so the bundle stays purely JSON.
  const { data: meta } = await supabase
    .from('career_chronicles')
    .select('display_name, subtitle')
    .eq('id', got.chronicleId)
    .maybeSingle<{ display_name: string; subtitle: string | null }>()
  if (!meta) return new NextResponse('Not found', { status: 404 })
  const mgrMeta: MgrMeta = { slug, displayName: meta.display_name, subtitle: meta.subtitle }

  if (resolved.kind === 'html') {
    const filePath = safeTemplatePath(resolved.file)
    if (!filePath) return new NextResponse('Forbidden', { status: 403 })
    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf-8')
    } catch {
      return new NextResponse('Page not found', { status: 404 })
    }
    const html = injectBaseTag(applyTokens(raw, mgrMeta), mgrMeta)
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Owner-scoped page — no shared CDN cache.
        'Cache-Control': 'private, no-store',
      },
    })
  }

  // data/<file> — straight from the bundle.
  const value = got.bundle[resolved.file]
  if (value === undefined) {
    return new NextResponse('Data not found', { status: 404 })
  }
  return NextResponse.json(value, {
    headers: {
      'Cache-Control': 'private, max-age=60, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  })
}
