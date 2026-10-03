// Shared pieces of the social pipeline: which platforms are switched on,
// how links are tagged, how X counts characters, and Eastern-time slots.
// Imported by the admin page's client controls too, so nothing server-only.

// Same value as lib/recap/links, which can't be imported here (node:crypto).
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://thesundaychronicle.app').replace(/\/$/, '')

export type Platform = 'x' | 'threads'
export const PLATFORMS: Platform[] = ['x', 'threads']

export const X_MAX = 280
export const THREADS_MAX = 500

// Nothing is ever sent unless SOCIAL_LIVE=1. Until then the publisher reports
// what it would have sent and leaves the queue alone, so the whole pipeline
// can run for a week against real crons before a single post goes out.
export function socialLive(): boolean {
  return process.env.SOCIAL_LIVE === '1'
}

export function xConfigured(): boolean {
  return !!(process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_SECRET)
}

// The env token only seeds social_tokens; see lib/social/threads.ts.
export function threadsSeeded(): boolean {
  return !!process.env.THREADS_ACCESS_TOKEN
}

export function absoluteUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

/** The post's link with first-touch attribution tags for /api/attribution. */
export function taggedLink(link: string, platform: Platform, campaign: string): string {
  const url = new URL(absoluteUrl(link))
  url.searchParams.set('utm_source', platform)
  url.searchParams.set('utm_medium', 'social')
  url.searchParams.set('utm_campaign', campaign)
  return url.toString()
}

// X counts every URL as 23 characters whatever its length. Our copy is plain
// ASCII, so everything else is one each.
export function xLength(text: string): number {
  return text.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length
}

export function textProblem(platform: Platform, text: string | null): string | null {
  if (!text || !text.trim()) return 'empty'
  if (/—/.test(text)) return 'has an em dash'
  if (platform === 'x' && xLength(text) > X_MAX) return `${xLength(text)}/${X_MAX} characters`
  if (platform === 'threads' && text.length > THREADS_MAX) return `${text.length}/${THREADS_MAX} characters`
  return null
}

export const SOCIAL_TZ = 'America/New_York'

/** `date` ("2026-10-06") at `hour`:`minute` Eastern, as a UTC Date. */
export function easternAt(date: string, hour: number, minute = 0): Date {
  const [y, m, d] = date.split('-').map(Number)
  // Guess with the wall time as if it were UTC, then correct by the zone's
  // offset at that instant. Posting hours are never inside a DST changeover.
  const guess = Date.UTC(y, m - 1, d, hour, minute)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SOCIAL_TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(guess))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return new Date(guess - (shown - guess))
}

/** "2026-10-06" for an instant, in Eastern time. */
export function easternDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SOCIAL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** 0 = Sunday, in Eastern time. */
export function easternWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function fmtEastern(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: SOCIAL_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}
