// The "what's new" popup on the dashboard and the league setup pages.
//
// One announcement at a time, identified by WHATS_NEW_ID. It runs for a
// fixed window and then never shows again, so the next one starts by
// changing the id and the end date, nothing else.
//
// How often: once. Only signed-in league owners see it, and the account
// remembers that it was shown, so whichever page or device shows it first
// is the only time: closing it on the dashboard means it doesn't open again
// inside the league, or on their phone.
//
// Seen-state lives on auth.users.user_metadata.notices (see
// /api/me/whats-new). localStorage only saves the round trip on every page
// load.
//
// Client-safe: no server imports.

export const WHATS_NEW_ID = 'season-2026-recap'
// Through Friday October 16, Eastern.
export const WHATS_NEW_ENDS_AT = Date.parse('2026-10-17T04:00:00Z')

export type WhatsNewState = {
  // Times shown.
  n?: number
  // Last shown (ISO).
  at?: string
  // Closed, by any route (ISO).
  done?: string
}

export type WhatsNewPayload = {
  league: { name: string; slug: string }
  // Live Season is unlocked for this league (comp, paid, trial).
  full: boolean
  // The newest finished week with a recap, and its headline when the
  // Tuesday job has stored one.
  recap: { year: number; week: number; headline: string | null } | null
}

export type WhatsNewResponse =
  | { show: true; payload: WhatsNewPayload }
  // `retry` is when it's worth asking again; null means never.
  | { show: false; retry: string | null }

// Whether the server-side state still allows a showing, and if not, when
// to ask again (null = never).
export function whatsNewGate(state: WhatsNewState | undefined, now: number): { ok: true } | { ok: false; retry: string | null } {
  if (now >= WHATS_NEW_ENDS_AT) return { ok: false, retry: null }
  if (state?.done || (state?.n ?? 0) >= 1) return { ok: false, retry: null }
  return { ok: true }
}
