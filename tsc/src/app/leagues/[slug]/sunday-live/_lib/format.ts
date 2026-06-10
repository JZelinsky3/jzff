// Display helpers — pure functions, safe to call in render.

export function fmtScore(n: number): string {
  return Number(n ?? 0).toFixed(1)
}

export function fmtProj(n: number): string {
  return `proj ${Number(n ?? 0).toFixed(1)}`
}

export function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${Math.round(n * 100)}%`
}

// "5m ago" / "12s ago" — small mono timestamp for the wire + status strip.
export function fmtSince(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

// Quarter clock as "Q3 4:18" — already shaped by the platform layer, this is
// just a defensive null guard.
export function fmtClock(s: string | null): string {
  if (!s) return '—'
  return s
}

// Sweat → tier label that data-tier on .sl-sweat keys off of.
export function sweatTier(n: number): 'hot' | 'warm' | 'cool' | 'cold' {
  if (n >= 75) return 'hot'
  if (n >= 50) return 'warm'
  if (n >= 25) return 'cool'
  return 'cold'
}

// Player initials for the avatar fallback circle.
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return (parts[0]?.[0] ?? '?').toUpperCase()
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase()
}
