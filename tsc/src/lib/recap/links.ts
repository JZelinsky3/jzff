// Absolute links for recap emails, and the signed token behind the
// unsubscribe link.
//
// The token is the user id plus an HMAC of it, so the link works without
// signing in (people unsubscribe from their phone's mail app, not from a
// browser session) and can't be forged for somebody else's account.

import { createHmac, timingSafeEqual } from 'node:crypto'

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://thesundaychronicle.app').replace(/\/$/, '')

// Trailing slashes throughout: next.config sets trailingSlash, and a mail
// provider's one-click POST to the slashless form would get a 308 it may not
// follow.
export function recapPageUrl(slug: string, year: number, week: number, src?: string): string {
  const base = `${SITE_URL}/leagues/${slug}/recap/${year}/${week}/`
  return src ? `${base}?utm_source=recap&utm_medium=${src}&utm_campaign=w${week}` : base
}

function signingSecret(): string | null {
  return process.env.RECAP_SIGNING_SECRET || process.env.CRON_SECRET || null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sign(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`recap-unsubscribe:${userId}`).digest('base64url').slice(0, 32)
}

export function unsubscribeToken(userId: string): string | null {
  const secret = signingSecret()
  if (!secret || !UUID.test(userId)) return null
  return `${userId}.${sign(userId, secret)}`
}

// The user id the token was issued for, or null if it doesn't check out.
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  const secret = signingSecret()
  if (!secret || !token) return null
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const userId = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!UUID.test(userId)) return null
  const expected = Buffer.from(sign(userId, secret))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  return userId
}

export function unsubscribePageUrl(token: string): string {
  return `${SITE_URL}/recap/unsubscribe/?t=${encodeURIComponent(token)}`
}

// Where the List-Unsubscribe-Post one-click request lands.
export function unsubscribeApiUrl(token: string): string {
  return `${SITE_URL}/api/recap/unsubscribe/?t=${encodeURIComponent(token)}`
}
