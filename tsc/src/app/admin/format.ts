// Formatting shared by the admin page's server and client halves. Dates are
// Joey's timezone, and "ago" counts from when the page was read (asOf), not
// the browser's clock, so the server and client render the same text.

export const ADMIN_TZ = 'America/New_York'

export const PLATFORM_LABEL: Record<string, string> = { sleeper: 'Sleeper', espn: 'ESPN', yahoo: 'Yahoo', nfl: 'NFL.com' }

export function fmtDay(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: ADMIN_TZ, ...opts })
}

export function ago(iso: string, asOf: string): string {
  const mins = Math.round((Date.parse(asOf) - Date.parse(iso)) / 60_000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days}d ago`
  return fmtDay(iso)
}

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}
