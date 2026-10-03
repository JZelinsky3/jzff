// Posting to Threads as the brand account.
//
// Threads publishes in two steps: create a media container (Threads fetches
// the image from our public URL), wait for it to finish processing, then
// publish it. Posting straight after creating sometimes fails with "media not
// ready", which is why the status poll is there.
//
// Tokens: a long-lived token lasts 60 days and can be swapped for a fresh one
// once it is a day old. THREADS_ACCESS_TOKEN seeds social_tokens on first use;
// after that the Saturday plan job refreshes it every week and the stored
// copy is the one in use. The env value only matters again if the table row
// is deleted.

import { createAdminClient } from '@/lib/supabase/admin'

const GRAPH = 'https://graph.threads.net'

type Db = ReturnType<typeof createAdminClient>

export async function threadsToken(db: Db): Promise<string | null> {
  const { data } = await db.from('social_tokens').select('access_token').eq('platform', 'threads').maybeSingle()
  if (data?.access_token) return data.access_token as string
  const seed = process.env.THREADS_ACCESS_TOKEN
  if (!seed) return null
  await db.from('social_tokens').upsert({ platform: 'threads', access_token: seed, refreshed_at: new Date().toISOString() })
  return seed
}

async function graph<T>(path: string, params: Record<string, string>, method: 'GET' | 'POST' = 'POST'): Promise<T> {
  const url = new URL(`${GRAPH}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { method, cache: 'no-store' })
  const body = await res.text()
  if (!res.ok) throw new Error(`Threads ${res.status}: ${body.slice(0, 400)}`)
  return JSON.parse(body) as T
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function postToThreads(db: Db, text: string, imageUrl: string | null): Promise<{ id: string; url: string | null }> {
  const token = await threadsToken(db)
  if (!token) throw new Error('THREADS_ACCESS_TOKEN is not set')

  const container = await graph<{ id: string }>('/v1.0/me/threads', {
    access_token: token,
    text,
    ...(imageUrl ? { media_type: 'IMAGE', image_url: imageUrl } : { media_type: 'TEXT' }),
  })

  // Up to ~40s for Threads to fetch and process the card.
  for (let i = 0; i < 8; i++) {
    const st = await graph<{ status?: string; error_message?: string }>(
      `/v1.0/${container.id}`, { access_token: token, fields: 'status,error_message' }, 'GET',
    )
    if (st.status === 'FINISHED') break
    if (st.status === 'ERROR' || st.status === 'EXPIRED') {
      throw new Error(`Threads container ${st.status}: ${st.error_message ?? 'no detail'}`)
    }
    await sleep(5000)
  }

  const published = await graph<{ id: string }>('/v1.0/me/threads_publish', { access_token: token, creation_id: container.id })
  let url: string | null = null
  try {
    const p = await graph<{ permalink?: string }>(`/v1.0/${published.id}`, { access_token: token, fields: 'permalink' }, 'GET')
    url = p.permalink ?? null
  } catch {
    // The post is up; a missing permalink only costs the admin page a link.
  }
  return { id: published.id, url }
}

/** Swap the stored token for a fresh 60-day one. Safe to call weekly. */
export async function refreshThreadsToken(db: Db): Promise<{ ok: true; expiresAt: string } | { ok: false; error: string }> {
  const token = await threadsToken(db)
  if (!token) return { ok: false, error: 'no Threads token stored or in THREADS_ACCESS_TOKEN' }
  try {
    const r = await graph<{ access_token: string; expires_in: number }>(
      '/refresh_access_token', { grant_type: 'th_refresh_token', access_token: token }, 'GET',
    )
    const expiresAt = new Date(Date.now() + r.expires_in * 1000).toISOString()
    await db.from('social_tokens').upsert({
      platform: 'threads', access_token: r.access_token, expires_at: expiresAt, refreshed_at: new Date().toISOString(),
    })
    return { ok: true, expiresAt }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function threadsWhoAmI(db: Db): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  try {
    const token = await threadsToken(db)
    if (!token) return { ok: false, error: 'no token' }
    const me = await graph<{ username?: string }>('/v1.0/me', { access_token: token, fields: 'username' }, 'GET')
    return { ok: true, username: me.username ?? '?' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
