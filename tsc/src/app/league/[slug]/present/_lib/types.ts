// Types for the ephemeral presentation builder. Nothing here persists to the
// database — a Deck is built in the browser, lives in sessionStorage for the
// duration of one tab, and is gone when the user closes that tab.

export type Theme = 'cinematic' | 'broadcast'

// Each block in the catalog declares the option fields it needs. The builder
// renders one form input per option; the slide component reads `values` to
// produce its content. We only ship the option kinds the current catalog
// needs — adding `kind: 'manager' | 'season'` etc. happens in later commits
// when data-driven blocks come online.
export type BlockOption =
  | { kind: 'text'; label: string; placeholder?: string; default?: string }
  | { kind: 'textarea'; label: string; placeholder?: string; default?: string; rows?: number }
  | { kind: 'imageUrl'; label: string; placeholder?: string; default?: string }

export type BlockOptionValues = Record<string, string>

export type SlideInstance = {
  id: string         // local id (uuid-ish), only meaningful within this deck
  blockId: string    // references BlockDef.id in the registry
  values: BlockOptionValues
}

export type Deck = {
  version: 1
  leagueSlug: string
  leagueName: string
  theme: Theme
  slides: SlideInstance[]
}

export const STORAGE_KEY = (slug: string) => `present:${slug}:deck:v1`
