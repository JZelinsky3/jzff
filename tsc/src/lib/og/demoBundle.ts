// Lets the OG card routes render The Lakeside League from the static demo
// tree, using slug "demo" where they would otherwise take a league slug.
//
// Why: the share hub's landing pages (/see/<key>) are shown to people with
// no league of their own, so their hero images need *some* league. Pointing
// them at a real one would put that league's managers and scores on a
// public marketing page, and it would not match the demo those same pages
// send visitors to next. The demo tree already carries a full set of
// export files, so the same renderers can read it directly.
//
// The demo is static JSON on disk, not a DB league, so there is no bundle
// cache to consult and nothing to revalidate — a demo resync updates these
// files and the next render picks them up.

import { readFile } from 'fs/promises'
import path from 'path'

export const DEMO_SLUG = 'demo'
export const DEMO_NAME = 'The Lakeside League'

const DEMO_DIR = path.join(process.cwd(), 'public', 'demo', 'data')

// Keyed exactly as getLeagueBundle() keys a real league's bundle, so the
// card renderers cannot tell the difference.
const DEMO_FILES = [
  'league.json',
  'managers_directory.json',
  'record_book.json',
  'rivalries.json',
  'seasons_directory.json',
  'milestones.json',
  'records_watch.json',
  'matchup_preview.json',
  'all_time_pool.json',
  'drafts/drafts_directory.json',
] as const

export function isDemoSlug(slug: string): boolean {
  return slug === DEMO_SLUG
}

export async function loadDemoBundle(): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    DEMO_FILES.map(async (name) => {
      try {
        const raw = await readFile(path.join(DEMO_DIR, name), 'utf8')
        return [name, JSON.parse(raw)] as const
      } catch {
        // A missing file just means that chapter falls back the same way it
        // would for a league mid-setup.
        return [name, undefined] as const
      }
    })
  )
  return Object.fromEntries(entries)
}
