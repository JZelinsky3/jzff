// The demo league's recap: /leagues/demo/recap/ for people who haven't
// signed up, so there's one paper to send around. It is a real pams edition
// with every name swapped for a Lakeside League one (see
// scripts/build-demo-recap.mjs, which writes demo-recap.json), rendered by
// the same page as every league's. There is no `demo` row in leagues; the
// page, its loader and its OG card check isDemoRecap first and never touch
// the database for it.

import type { RecapFacts } from './facts'
import demo from './demo-recap.json'

export const DEMO_SLUG = 'demo'

export const DEMO_LEAGUE = {
  id: 'demo',
  name: 'The Lakeside League',
  slug: DEMO_SLUG,
  owner_id: null,
  published_at: '2026-01-01T00:00:00Z',
}

export const DEMO_RECAP = demo as unknown as { year: number; week: number; intro: string; subject: string; facts: RecapFacts }

export function isDemoRecap(slugOrId: string): boolean {
  return slugOrId === DEMO_SLUG
}
