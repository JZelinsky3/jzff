import type { HeadToHead } from '@/lib/friends'

/** A friend's Pack Empire record against you, in words. */
export function h2hLine(h: HeadToHead | null): { text: string; tone: 'lead' | 'trail' | null } {
  if (!h) return { text: "Haven't played yet", tone: null }
  const rec = h.t ? `${h.w}-${h.l}-${h.t}` : `${h.w}-${h.l}`
  if (h.w > h.l) return { text: `You lead ${rec}`, tone: 'lead' }
  if (h.w < h.l) return { text: `You trail ${rec}`, tone: 'trail' }
  return { text: `Level at ${rec}`, tone: null }
}
