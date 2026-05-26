import type { ReactNode } from 'react'
import type { BlockOption, BlockOptionValues, Theme } from './types'

// The catalog of block types the presentation builder can offer. Each block
// declares: its display metadata, the option fields the builder should
// render (with defaults), and a `render` function that turns option values
// into a slide.
//
// This file ships the structural + custom blocks for the first commit. Data-
// driven blocks (standings, all-time leaders, rivalries, etc.) will be added
// as additional registry entries in later commits — the contract here stays
// stable, so adding a block is just declaring metadata + render.

export type BlockCategory =
  | 'cover'
  | 'standings'
  | 'highlights'
  | 'managers'
  | 'rivalry'
  | 'draft'
  | 'custom'

export type SlideRenderContext = {
  values: BlockOptionValues
  theme: Theme
  leagueName: string
}

export type BlockDef = {
  id: string
  label: string
  category: BlockCategory
  description: string
  options: Record<string, BlockOption>
  defaults: () => BlockOptionValues
  render: (ctx: SlideRenderContext) => ReactNode
}

const titleBlock: BlockDef = {
  id: 'title',
  label: 'Title slide',
  category: 'cover',
  description: 'Big opening — league name, subtitle, optional kicker.',
  options: {
    kicker: { kind: 'text', label: 'Kicker', placeholder: 'A presentation', default: '' },
    headline: { kind: 'text', label: 'Headline', placeholder: 'League name', default: '' },
    subtitle: { kind: 'text', label: 'Subtitle', placeholder: 'Season recap, awards, etc.', default: '' },
  },
  defaults: () => ({ kicker: '★ A Presentation ★', headline: '', subtitle: '' }),
  render: ({ values, leagueName }) => (
    <div className="present-slide present-slide--cover">
      {values.kicker ? <div className="present-kicker">{values.kicker}</div> : null}
      <h1 className="present-display">{values.headline || leagueName}</h1>
      {values.subtitle ? <p className="present-sub">{values.subtitle}</p> : null}
    </div>
  ),
}

const sectionBlock: BlockDef = {
  id: 'section',
  label: 'Section divider',
  category: 'cover',
  description: 'Big single-line label between sections, e.g. "AWARDS".',
  options: {
    label: { kind: 'text', label: 'Section label', placeholder: 'AWARDS', default: '' },
    sub: { kind: 'text', label: 'Sub-label', placeholder: 'optional', default: '' },
  },
  defaults: () => ({ label: 'Awards', sub: '' }),
  render: ({ values }) => (
    <div className="present-slide present-slide--section">
      <div className="present-section-rule" aria-hidden />
      <h2 className="present-section-label">{values.label || 'Section'}</h2>
      {values.sub ? <p className="present-sub">{values.sub}</p> : null}
      <div className="present-section-rule" aria-hidden />
    </div>
  ),
}

const closingBlock: BlockDef = {
  id: 'closing',
  label: 'Closing slide',
  category: 'cover',
  description: 'Sign-off slide for the end of the deck.',
  options: {
    headline: { kind: 'text', label: 'Headline', placeholder: "That's a wrap.", default: '' },
    signoff: { kind: 'text', label: 'Sign-off', placeholder: 'Commissioner', default: '' },
  },
  defaults: () => ({ headline: "That's a wrap.", signoff: '' }),
  render: ({ values }) => (
    <div className="present-slide present-slide--cover">
      <h1 className="present-display">{values.headline || "That's a wrap."}</h1>
      {values.signoff ? <p className="present-sub">— {values.signoff}</p> : null}
    </div>
  ),
}

const customCalloutBlock: BlockDef = {
  id: 'custom-callout',
  label: 'Stat callout',
  category: 'custom',
  description: 'Giant number + caption. The escape hatch for any stat the catalog does not cover.',
  options: {
    eyebrow: { kind: 'text', label: 'Eyebrow', placeholder: 'category', default: '' },
    number: { kind: 'text', label: 'Big number / value', placeholder: 'e.g. 187.4', default: '' },
    caption: { kind: 'text', label: 'Caption', placeholder: 'what the number means', default: '' },
    footnote: { kind: 'text', label: 'Footnote', placeholder: 'optional context', default: '' },
  },
  defaults: () => ({ eyebrow: '', number: '', caption: '', footnote: '' }),
  render: ({ values }) => (
    <div className="present-slide present-slide--callout">
      {values.eyebrow ? <div className="present-eyebrow">{values.eyebrow}</div> : null}
      <div className="present-bignum">{values.number || '—'}</div>
      {values.caption ? <div className="present-caption">{values.caption}</div> : null}
      {values.footnote ? <div className="present-footnote">{values.footnote}</div> : null}
    </div>
  ),
}

const customTextBlock: BlockDef = {
  id: 'custom-text',
  label: 'Quote / text',
  category: 'custom',
  description: 'Multi-line text or quote on its own slide.',
  options: {
    eyebrow: { kind: 'text', label: 'Eyebrow', placeholder: 'optional', default: '' },
    body: { kind: 'textarea', label: 'Body text', placeholder: 'Type or paste a quote…', default: '', rows: 5 },
    attribution: { kind: 'text', label: 'Attribution', placeholder: 'optional', default: '' },
  },
  defaults: () => ({ eyebrow: '', body: '', attribution: '' }),
  render: ({ values }) => (
    <div className="present-slide present-slide--text">
      {values.eyebrow ? <div className="present-eyebrow">{values.eyebrow}</div> : null}
      <div className="present-body">{values.body || '—'}</div>
      {values.attribution ? <div className="present-attrib">— {values.attribution}</div> : null}
    </div>
  ),
}

const customImageBlock: BlockDef = {
  id: 'custom-image',
  label: 'Image slide',
  category: 'custom',
  description: 'Full-bleed image from any URL. Nothing uploaded — pure URL paste.',
  options: {
    url: { kind: 'imageUrl', label: 'Image URL', placeholder: 'https://…', default: '' },
    caption: { kind: 'text', label: 'Caption', placeholder: 'optional', default: '' },
  },
  defaults: () => ({ url: '', caption: '' }),
  render: ({ values }) => (
    <div className="present-slide present-slide--image">
      {values.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={values.url} alt={values.caption || ''} className="present-image" />
      ) : (
        <div className="present-image-empty">Add an image URL to populate this slide.</div>
      )}
      {values.caption ? <div className="present-caption">{values.caption}</div> : null}
    </div>
  ),
}

export const BLOCKS: BlockDef[] = [
  titleBlock,
  sectionBlock,
  closingBlock,
  customCalloutBlock,
  customTextBlock,
  customImageBlock,
]

export const BLOCK_INDEX: Record<string, BlockDef> = Object.fromEntries(
  BLOCKS.map((b) => [b.id, b]),
)

export const CATEGORY_ORDER: BlockCategory[] = [
  'cover',
  'standings',
  'highlights',
  'managers',
  'rivalry',
  'draft',
  'custom',
]

export const CATEGORY_LABELS: Record<BlockCategory, string> = {
  cover: 'Cover & structure',
  standings: 'Standings & records',
  highlights: 'Highlights & lowlights',
  managers: 'Manager spotlights',
  rivalry: 'Rivalries',
  draft: 'Draft',
  custom: 'Custom',
}
