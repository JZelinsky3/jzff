// Content moderation for user-chosen league identifiers (name, abbreviation,
// URL slug). The bar here is narrow and deliberate: we block hate speech —
// racial, ethnic, and religious slurs plus a few unambiguous identity slurs —
// and we DO NOT block ordinary profanity. A league called "Shit Kickers" or
// "Fuckin' Ferdas" is fine; a league whose name is a racial slur is not.
//
// Matching is evasion-aware without being a general-purpose profanity filter:
//   - unicode confusables (Cyrillic/Greek lookalikes) are folded to Latin
//   - each slur letter accepts its common leetspeak forms (0->o, 1->i, 3->e...)
//   - repeated letters ("niiigger") and separators ("n.i.g.g.e.r") are absorbed
//   - matches are anchored to word boundaries so slurs can't fire as innocent
//     substrings (e.g. "spic" never matches "despicable" or "spice")
//
// No filter is perfect: this stops casual and obvious attempts, not a
// determined adversary. The blocklist below is intentionally easy to extend —
// add a lowercase stem to HATE_TERMS.

// Unicode lookalikes people paste to dodge naive filters. Folded to Latin
// before matching. Digits/symbols are intentionally NOT folded here — the
// per-letter classes below handle leetspeak inside a slur only, so benign
// text like "Level 100" or "Route 66" can't be twisted into letters.
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  'а': 'a', 'в': 'b', 'с': 'c', 'е': 'e', 'н': 'h',
  'к': 'k', 'м': 'm', 'о': 'o', 'р': 'p', 'т': 't',
  'у': 'y', 'х': 'x', 'і': 'i', 'ѕ': 's', 'ј': 'j',
  'ԁ': 'd',
  // Greek
  'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k',
  'ο': 'o', 'ρ': 'p', 'τ': 't', 'ν': 'v', 'υ': 'u',
  'χ': 'x', 'γ': 'y',
}

function normalize(input: string): string {
  return input
    .normalize('NFKC')
    // strip zero-width + bidi control chars used to break up words
    .replace(/[​-‏‪-‮⁠-⁯﻿]/g, '')
    .toLowerCase()
    // fold Cyrillic + Greek confusable ranges to Latin
    .replace(/[Ѐ-ӿͰ-Ͽ]/g, (ch) => CONFUSABLES[ch] ?? ch)
}

// Leetspeak / symbol variants accepted for each letter of a slur.
const LETTER_VARIANTS: Record<string, string> = {
  a: 'a4@',
  b: 'b8',
  c: 'c(',
  e: 'e3',
  g: 'g9',
  i: 'i1!|',
  l: 'l1|',
  o: 'o0',
  s: 's5$',
  t: 't7',
  z: 'z2',
}

// Separators tolerated between letters (spaces, dots, dashes, common
// obfuscators). Bounded length so we don't match letters scattered across an
// otherwise-innocent name.
const SEP = '[\\s._\\-*+#/\\\\|~]{0,3}'

function escapeForClass(s: string): string {
  return s.replace(/[\]\\^-]/g, '\\$&')
}

type HateTerm = {
  word: string
  // Whether the match must end on a word boundary. True by default so short
  // slurs don't fire inside longer innocent words. Set false for stems whose
  // suffixes vary (plurals, "-er"/"-a" endings) where we still want a hit.
  boundEnd?: boolean
}

// Compile a slur stem into a boundary-anchored, evasion-tolerant regex.
function compile({ word, boundEnd = true }: HateTerm): RegExp {
  const body = [...word.replace(/\s+/g, '')]
    .map((ch) => {
      const variants = LETTER_VARIANTS[ch] ?? ch
      return `[${escapeForClass(variants)}]+`
    })
    .join(SEP)
  // (?<![a-z0-9]) start boundary; digits included so leetspeak like "n1gger"
  // isn't treated as mid-"word". End boundary optional per-term.
  const tail = boundEnd ? '(?![a-z0-9])' : ''
  return new RegExp(`(?<![a-z0-9])${body}${tail}`, 'i')
}

// The blocklist. Lowercase stems; the compiler adds leet/spacing/boundary
// handling. Grouped only for readability. This is a hate-speech blocklist,
// NOT a profanity list — do not add ordinary swearing here.
const HATE_TERMS: HateTerm[] = [
  // Anti-Black. Stems left open-ended so plurals / "-er"/"-a" endings hit
  // (this also flags the unrelated word "niggardly", which we accept).
  { word: 'nigger', boundEnd: false },
  { word: 'nigga', boundEnd: false },
  { word: 'niggah', boundEnd: false },
  { word: 'niglet', boundEnd: false },
  { word: 'coon' },
  { word: 'jigaboo' },
  { word: 'porch monkey' },
  { word: 'jungle bunny' },
  { word: 'spearchucker' },
  { word: 'tarbaby' },
  // Anti-Hispanic / Latino
  { word: 'spic' },
  { word: 'spick' },
  { word: 'wetback' },
  { word: 'beaner' },
  { word: 'greaseball' },
  // Anti-Asian
  { word: 'chink' },
  { word: 'gook' },
  { word: 'chinaman' },
  // "jap" stays end-anchored so "Japan"/"jape" are safe; plural listed apart.
  { word: 'jap' },
  { word: 'japs' },
  { word: 'coolie' },
  // Anti-South-Asian / Middle-Eastern
  { word: 'paki' },
  { word: 'raghead' },
  { word: 'towelhead' },
  { word: 'sandnigger', boundEnd: false },
  { word: 'camel jockey' },
  // Anti-Jewish
  { word: 'kike' },
  { word: 'heeb' },
  // Anti-Native-American / Indigenous
  { word: 'redskin', boundEnd: false },
  { word: 'injun' },
  { word: 'squaw' },
  { word: 'abo' },
  // Anti-European ethnic
  { word: 'wop' },
  { word: 'dago' },
  { word: 'kraut' },
  // Hate organizations / neo-Nazi codes
  { word: 'kkk' },
  { word: '1488' },
  { word: 'heil hitler' },
  { word: 'white power' },
  { word: 'sieg heil' },
  // Unambiguous anti-LGBTQ identity slurs (ordinary profanity stays allowed;
  // these are targeted slurs, not swearing)
  { word: 'faggot', boundEnd: false },
  { word: 'tranny' },
]

const HATE_PATTERNS: RegExp[] = HATE_TERMS.map(compile)

/** True if the text contains a blocked hate term. */
export function containsHateSpeech(text: string | null | undefined): boolean {
  if (!text) return false
  const normalized = normalize(text)
  return HATE_PATTERNS.some((re) => re.test(normalized))
}

export type LeagueTextFields = {
  name?: string | null
  abbreviation?: string | null
  slug?: string | null
}

export type ModerationResult =
  | { ok: true }
  | { ok: false; field: 'name' | 'abbreviation' | 'slug'; error: string }

const FIELD_LABEL: Record<'name' | 'abbreviation' | 'slug', string> = {
  name: 'league name',
  abbreviation: 'abbreviation',
  slug: 'league URL',
}

// Screen the user-controlled league identifiers. Returns the first offending
// field with a user-facing message that never echoes the term back.
export function screenLeagueText(fields: LeagueTextFields): ModerationResult {
  for (const field of ['name', 'abbreviation', 'slug'] as const) {
    const value = fields[field]
    if (containsHateSpeech(value)) {
      return {
        ok: false,
        field,
        error: `That ${FIELD_LABEL[field]} contains language we don't allow. Swearing is fine, but slurs and hate speech aren't. Please choose something else.`,
      }
    }
  }
  return { ok: true }
}
