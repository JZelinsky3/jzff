// The lab's color worlds: the two that survived, MIDNIGHT ALMANAC (night,
// now the base palette that ships) and THE PRESS BOX (day). Each world
// overrides BOTH custom-property families (the raw --sl-* aliases used by
// hand-written CSS and the --color-sl-* vars behind the Tailwind sl
// utilities), so wrapping any subtree re-skins it exactly as the whole desk
// would look repainted. Booth and Phosphor are deleted per Joey.

export type World = { id: WorldId; name: string; why: string; vars: Record<string, string> }
export type WorldId = 'almanac' | 'press'

function w(vals: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(vals)) {
    out[`--sl-${k}`] = v
    out[`--color-sl-${k}`] = v
  }
  return out
}

export const WORLDS: World[] = [
  {
    id: 'almanac',
    name: 'Midnight Almanac',
    why: 'What ships: the Chronicle inkwell after dark, brass trim.',
    vars: {},
  },
  {
    id: 'press',
    name: 'The Press Box',
    why: 'Daylight cream: ink black, almanac blue, and gold on paper.',
    // Joey's color law for daylight (2026-07-04/05): on cream, ink is BLUE
    // or BLACK, never the deep gold (it reads brown). Gold only lives on
    // blue or black surfaces (the wall's sets pin their own bright amber).
    // electric = ink black (kickers, WP needle end), glow = almanac blue
    // (scores, pips, WP fill, tags).
    // Joey swap (2026-07-05): the darker cream is the PAGE, the lighter
    // cream is the CARD. WP meter calmed to two families: side A blue into
    // deep blue (electric is a deep ink-blue now), side B a warm neutral
    // via the meter overrides.
    vars: w({
      // Page clearly darker than the cards: the panels read as bright paper
      // sitting on a deeper cream desk (Joey pushed the gap wider twice).
      'void': '#e3d7b7', 'studio': '#dbcda9', 'panel': '#f6efdd', 'panel-2': '#e8ddbf',
      'line': '#c4b391', 'text': '#282217', 'mute': '#5d5138', 'dim': '#77684a',
      'electric': '#334970', 'glow': '#3f5a86', 'live': '#b03a28',
      'up': '#4f7247', 'down': '#a05a3c', 'gold': '#8a651f',
      'navy': '#3f5a86', 'navy-2': '#c9bd9f', 'cream': '#31435f', 'pick': '#a34a68',
      // The power banner runs almanac blue in daylight (inverse of the night
      // brass), per Joey. Featured names/scores go ink-navy, form losses go
      // full black.
      'banner': '#3f5a86',
      'heading': '#31435f',
      'form-l': '#282217',
      'form-bg': '#e8ddbf',
      // The night form plate's deep inset would look like a hole punched in
      // paper; daylight gets only a whisper of recess.
      'form-shadow': 'inset 0 1px 2px rgba(40, 34, 23, 0.18)',
      // Raised cards are the BRIGHTEST paper in daylight (panel-2 is a
      // darker wash there, unlike at night). Wire separators brighten to
      // cream instead of the dark line tone.
      'panel-raised': '#faf4e4',
      'wire-line': '#f2e9d1',
      // Side B of the meter: a light warm tan with barely any fade (Joey:
      // less gradient, lighter gold). Paper numerals lose the phosphor halo.
      'meter-b1': '#bfb191', 'meter-b2': '#cfc3a3',
      'phosphor-glow': '0%',
    }),
  },
]
