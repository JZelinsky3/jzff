// Shared formatting for the broadcast. One place so every panel renders
// numbers identically (one decimal, no trailing .0, tabular everywhere).

export function fmtPts(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

// Signed delta for proj +/- chips: "+4.2" / "-3.1" / "0".
export function fmtDelta(n: number): string {
  const r = Math.round(n * 10) / 10
  if (r === 0) return '0'
  return r > 0 ? `+${fmtPts(r)}` : fmtPts(r)
}

export function fmtPct(p: number): string {
  return `${Math.round(p * 100)}%`
}

// "Jamarr Chase" -> "J. Chase" for tight rows.
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}

// Seconds since an ISO timestamp, rendered "12s" / "3m" / "1h 4m".
export function fmtSince(iso: string, now: number = Date.now()): string {
  const secs = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  return `${h}h ${mins % 60}m`
}

// Kickoff hour label from an ISO date, in ET.
export function fmtKickoff(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  })
}
