// GET /api/admin/audience  →  CSV of every registered account
//
// Feeds the Resend Audience import for one-off announcement sends. Export
// here, import there, send the broadcast from Resend so unsubscribes,
// bounces, and suppression are handled by the provider rather than by a
// hand-rolled loop in this codebase.
//
// Filters, for topping up an audience after a broadcast has already gone out
// instead of re-importing the whole site:
//   ?days=7              registered in the last 7 days
//   ?since=2026-08-01    registered on or after that date (or full ISO stamp)
//   ?limit=2             newest N accounts only
// Rows come back newest-first so the latest signups are at the top of the file.
//
// Columns match Resend's Contacts import format (email, first_name,
// last_name, unsubscribed) plus a few extras Resend ignores on import but
// which make the file useful to eyeball before sending.
//
// Site admins only. Unconfirmed accounts are excluded: sending to an address
// nobody proved they own is how a sending domain gets its reputation burned.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'

// Excel and Sheets interpret a leading =, +, -, or @ as a formula. Prefixing
// with an apostrophe defuses that; quotes are doubled per RFC 4180.
function csvCell(value: string | null | undefined): string {
  const raw = (value ?? '').replace(/\r?\n/g, ' ').trim()
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}

// "Joey Zelinsky" → first "Joey", last "Zelinsky". Single-word names put
// everything in first_name so the greeting never renders a stray surname.
function splitName(displayName: string | null, email: string): { first: string; last: string } {
  const name = (displayName ?? '').trim()
  // Supabase seeds display_name with the email when there's no full_name, so
  // an @ means we never got a real name — fall back to the local part.
  if (!name || name.includes('@')) {
    return { first: email.split('@')[0] ?? '', last: '' }
  }
  const parts = name.split(/\s+/)
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

// ?since= accepts a plain date or a full ISO stamp; ?days= is a convenience
// wrapper on top of it. An unparseable value is ignored rather than silently
// exporting zero contacts.
function cutoffFrom(params: URLSearchParams): Date | null {
  const since = params.get('since')
  if (since) {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(since) ? `${since}T00:00:00Z` : since)
    if (!Number.isNaN(d.getTime())) return d
  }
  const days = Number(params.get('days'))
  if (Number.isFinite(days) && days > 0) {
    return new Date(Date.now() - days * 86_400_000)
  }
  return null
}

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isSiteAdmin(user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const db = createAdminClient()
  const [profilesRes, authRes] = await Promise.all([
    db.from('profiles').select('id, display_name, created_at'),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ])
  if (authRes.error) {
    console.error('[admin/audience] listUsers failed:', authRes.error)
    return NextResponse.json({ error: 'Could not read the user list.' }, { status: 500 })
  }

  const profileById = new Map(
    (profilesRes.data ?? []).map((p) => [p.id as string, p as { display_name: string | null; created_at: string }]),
  )

  const params = new URL(request.url).searchParams
  const cutoff = cutoffFrom(params)
  const limitRaw = Number(params.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : null

  let skipped = 0
  const contacts: { registered: string; cells: string }[] = []
  for (const u of authRes.data.users) {
    if (!u.email) { skipped++; continue }
    // Never mail an address that was never confirmed.
    if (!u.email_confirmed_at) { skipped++; continue }
    const profile = profileById.get(u.id)
    const registered = profile?.created_at ?? u.created_at
    if (cutoff && new Date(registered) < cutoff) continue
    const { first, last } = splitName(profile?.display_name ?? null, u.email)
    contacts.push({
      registered,
      cells: [
        csvCell(u.email),
        csvCell(first),
        csvCell(last),
        csvCell('false'),
        csvCell(u.id),
        csvCell(registered),
      ].join(','),
    })
  }

  // Newest first, so ?limit= takes the most recent signups and an unfiltered
  // export still opens on whoever just joined.
  contacts.sort((a, b) => b.registered.localeCompare(a.registered))
  const kept = limit ? contacts.slice(0, limit) : contacts

  const rows = [['email', 'first_name', 'last_name', 'unsubscribed', 'user_id', 'registered_at']
    .map(csvCell).join(',')]
  for (const c of kept) rows.push(c.cells)

  // 1000 is the listUsers page cap. Past that this needs pagination, and a
  // silently truncated audience is worse than a loud one.
  const truncated = authRes.data.users.length >= 1000
  if (truncated) console.warn('[admin/audience] hit the 1000-user page cap; export is incomplete')

  const stamp = new Date().toISOString().slice(0, 10)
  const suffix = cutoff || limit ? '-new' : ''
  return new NextResponse(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tsc-audience${suffix}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
      'X-Contact-Count': String(rows.length - 1),
      'X-Skipped-Unconfirmed': String(skipped),
      'X-Truncated': String(truncated),
    },
  })
}
