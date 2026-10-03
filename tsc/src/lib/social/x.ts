// Posting to X as the brand account.
//
// OAuth 1.0a user context: the app's consumer key/secret plus the access
// token/secret generated for the brand account on developer.x.com (the
// "Authentication Tokens" panel, with the app set to Read and Write). No
// callback flow is needed because there is only ever one account.
//
// Two calls per post: upload the card image, then create the post with the
// media id. Neither request's body goes into the OAuth signature: one is
// multipart, the other JSON, and OAuth 1.0a only signs form-encoded bodies.

import { createHmac, randomBytes } from 'crypto'
import { xConfigured } from './config'

const API = 'https://api.x.com/2'

function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

function authHeader(method: string, url: string): string {
  const consumerKey = process.env.X_API_KEY!
  const consumerSecret = process.env.X_API_SECRET!
  const token = process.env.X_ACCESS_TOKEN!
  const tokenSecret = process.env.X_ACCESS_SECRET!

  const oauth: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: '1.0',
  }
  const u = new URL(url)
  const params: [string, string][] = [...Object.entries(oauth), ...u.searchParams.entries()]
  const paramString = params
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const base = [method.toUpperCase(), rfc3986(`${u.origin}${u.pathname}`), rfc3986(paramString)].join('&')
  const signature = createHmac('sha1', `${rfc3986(consumerSecret)}&${rfc3986(tokenSecret)}`).update(base).digest('base64')

  return 'OAuth ' + Object.entries({ ...oauth, oauth_signature: signature })
    .map(([k, v]) => `${rfc3986(k)}="${rfc3986(v)}"`)
    .join(', ')
}

async function readError(res: Response): Promise<string> {
  const body = (await res.text().catch(() => '')).slice(0, 400)
  return `X ${res.status}: ${body}`
}

async function uploadImage(imageUrl: string): Promise<string> {
  const img = await fetch(imageUrl, { cache: 'no-store' })
  if (!img.ok) throw new Error(`card image ${img.status} at ${imageUrl}`)
  const type = img.headers.get('content-type')?.split(';')[0] || 'image/png'
  const bytes = await img.arrayBuffer()

  const form = new FormData()
  form.append('media', new Blob([bytes], { type }), 'card.png')
  form.append('media_category', 'tweet_image')
  form.append('media_type', type)

  const url = `${API}/media/upload`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader('POST', url) },
    body: form,
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as { data?: { id?: string }; id?: string; media_id_string?: string }
  const id = data.data?.id ?? data.id ?? data.media_id_string
  if (!id) throw new Error(`X media upload returned no id: ${JSON.stringify(data).slice(0, 200)}`)
  return id
}

export async function postToX(text: string, imageUrl: string | null): Promise<{ id: string; url: string }> {
  const mediaId = imageUrl ? await uploadImage(imageUrl) : null
  const url = `${API}/tweets`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader('POST', url), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, ...(mediaId ? { media: { media_ids: [mediaId] } } : {}) }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as { data?: { id?: string } }
  const id = data.data?.id
  if (!id) throw new Error(`X returned no post id: ${JSON.stringify(data).slice(0, 200)}`)
  return { id, url: xPostUrl(id) }
}

export function xPostUrl(id: string): string {
  return `https://x.com/i/web/status/${id}`
}

/** Reads the brand account back. The admin page uses it to prove the keys work. */
export async function xWhoAmI(): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  if (!xConfigured()) return { ok: false, error: 'X keys are not set' }
  try {
    const url = `${API}/users/me`
    const res = await fetch(url, { headers: { Authorization: authHeader('GET', url) }, cache: 'no-store' })
    if (!res.ok) return { ok: false, error: await readError(res) }
    const data = (await res.json()) as { data?: { username?: string } }
    return { ok: true, username: data.data?.username ?? '?' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
