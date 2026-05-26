import type { ReactNode } from 'react'
import type { BlockOption, BlockOptionValues, Theme } from './types'
import type { LeaguePresentationData } from './leagueData'
import {
  avatarForManager,
  nameForManager,
  profileTotals,
} from './leagueData'

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
  data: LeaguePresentationData | null
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

// ─── Shared block helpers ──────────────────────────────────────────────────

function MissingData({ reason }: { reason: string }) {
  return (
    <div className="present-slide present-slide--text">
      <div className="present-eyebrow">No data yet</div>
      <div className="present-body" style={{ fontSize: 'clamp(1rem, 2vw, 1.4rem)' }}>{reason}</div>
    </div>
  )
}

function Avatar({ url, name, size = 44 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="present-avatar"
        style={{ width: size, height: size }}
      />
    )
  }
  const initials = name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  return (
    <span
      className="present-avatar present-avatar--initials"
      style={{ width: size, height: size, lineHeight: `${size}px`, fontSize: size * 0.35 }}
      aria-hidden
    >
      {initials}
    </span>
  )
}

// ─── Data-driven: standings + leaderboards ─────────────────────────────────

const finalStandingsBlock: BlockDef = {
  id: 'final-standings',
  label: 'Final standings',
  category: 'standings',
  description: 'Final standings table for a chosen season — wins, losses, points-for.',
  options: {
    season: { kind: 'pick', label: 'Season', source: 'season' },
    title: { kind: 'text', label: 'Title', placeholder: 'Final standings', default: '' },
  },
  defaults: () => ({ season: '', title: 'Final standings' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first to populate standings." />
    const seasonId = values.season
    const season = data.seasons.find((s) => s.id === seasonId)
    if (!season) {
      return <MissingData reason="Pick a season in the inspector to populate this slide." />
    }
    const rows = data.standings
      .filter((r) => r.seasonId === season.id)
      .slice()
      .sort((a, b) => {
        if (a.finalRank != null && b.finalRank != null) return a.finalRank - b.finalRank
        if (b.wins !== a.wins) return b.wins - a.wins
        return b.pointsFor - a.pointsFor
      })
    if (rows.length === 0) {
      return <MissingData reason={`No standings recorded for ${season.year}.`} />
    }
    return (
      <div className="present-slide present-slide--table">
        <div className="present-eyebrow">{season.year} season</div>
        <h2 className="present-table-title">{values.title || 'Final standings'}</h2>
        <table className="present-table">
          <thead>
            <tr>
              <th style={{ width: '3rem' }}>#</th>
              <th>Manager</th>
              <th style={{ textAlign: 'right' }}>W</th>
              <th style={{ textAlign: 'right' }}>L</th>
              <th style={{ textAlign: 'right' }}>PF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const name = nameForManager(data, r.managerId)
              const avatar = avatarForManager(data, r.managerId)
              const isChamp = season.championManagerId === r.managerId
              return (
                <tr key={r.managerId} className={isChamp ? 'is-champion' : ''}>
                  <td className="present-table-rank">{r.finalRank ?? i + 1}</td>
                  <td>
                    <span className="present-table-manager">
                      <Avatar url={avatar} name={name} size={32} />
                      <span>{name}{isChamp ? ' 🏆' : ''}</span>
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{r.wins}</td>
                  <td style={{ textAlign: 'right' }}>{r.losses}</td>
                  <td style={{ textAlign: 'right' }}>{r.pointsFor.toFixed(1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  },
}

const allTimeWinsBlock: BlockDef = {
  id: 'all-time-wins',
  label: 'All-time wins leaderboard',
  category: 'standings',
  description: 'Career win totals across every recorded season, per real person.',
  options: {
    title: { kind: 'text', label: 'Title', placeholder: 'All-time wins', default: '' },
    limit: { kind: 'number', label: 'Show top N', placeholder: '10', default: '10', min: 3, max: 30 },
  },
  defaults: () => ({ title: 'All-time wins', limit: '10' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    const limit = Math.max(3, Math.min(30, parseInt(values.limit || '10', 10) || 10))
    const rows = profileTotals(data).sort((a, b) => b.wins - a.wins).slice(0, limit)
    if (rows.length === 0) return <MissingData reason="No standings rows in this league yet." />
    return (
      <div className="present-slide present-slide--table">
        <div className="present-eyebrow">All time</div>
        <h2 className="present-table-title">{values.title || 'All-time wins'}</h2>
        <table className="present-table">
          <thead>
            <tr>
              <th style={{ width: '3rem' }}>#</th>
              <th>Manager</th>
              <th style={{ textAlign: 'right' }}>W</th>
              <th style={{ textAlign: 'right' }}>L</th>
              <th style={{ textAlign: 'right' }}>Sea</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.profileId} className={i === 0 ? 'is-leader' : ''}>
                <td className="present-table-rank">{i + 1}</td>
                <td>
                  <span className="present-table-manager">
                    <Avatar url={r.avatarUrl} name={r.canonicalName} size={32} />
                    <span>{r.canonicalName}</span>
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>{r.wins}</td>
                <td style={{ textAlign: 'right' }}>{r.losses}</td>
                <td style={{ textAlign: 'right' }}>{r.seasons}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  },
}

const allTimePointsBlock: BlockDef = {
  id: 'all-time-points',
  label: 'All-time points-for leaderboard',
  category: 'standings',
  description: 'Career total points scored, per real person.',
  options: {
    title: { kind: 'text', label: 'Title', placeholder: 'All-time points-for', default: '' },
    limit: { kind: 'number', label: 'Show top N', placeholder: '10', default: '10', min: 3, max: 30 },
  },
  defaults: () => ({ title: 'All-time points-for', limit: '10' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    const limit = Math.max(3, Math.min(30, parseInt(values.limit || '10', 10) || 10))
    const rows = profileTotals(data).sort((a, b) => b.pointsFor - a.pointsFor).slice(0, limit)
    if (rows.length === 0) return <MissingData reason="No standings rows in this league yet." />
    return (
      <div className="present-slide present-slide--table">
        <div className="present-eyebrow">All time</div>
        <h2 className="present-table-title">{values.title || 'All-time points-for'}</h2>
        <table className="present-table">
          <thead>
            <tr>
              <th style={{ width: '3rem' }}>#</th>
              <th>Manager</th>
              <th style={{ textAlign: 'right' }}>PF</th>
              <th style={{ textAlign: 'right' }}>Avg/Sea</th>
              <th style={{ textAlign: 'right' }}>Sea</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.profileId} className={i === 0 ? 'is-leader' : ''}>
                <td className="present-table-rank">{i + 1}</td>
                <td>
                  <span className="present-table-manager">
                    <Avatar url={r.avatarUrl} name={r.canonicalName} size={32} />
                    <span>{r.canonicalName}</span>
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>{r.pointsFor.toFixed(1)}</td>
                <td style={{ textAlign: 'right' }}>{r.seasons > 0 ? (r.pointsFor / r.seasons).toFixed(1) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{r.seasons}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  },
}

const championRollBlock: BlockDef = {
  id: 'champion-roll',
  label: 'Champion roll call',
  category: 'standings',
  description: 'Every season, listed with its champion.',
  options: {
    title: { kind: 'text', label: 'Title', placeholder: 'Champions', default: '' },
  },
  defaults: () => ({ title: 'Champions' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    const rows = data.seasons.slice().sort((a, b) => b.year - a.year)
    if (rows.length === 0) return <MissingData reason="No seasons recorded yet." />
    return (
      <div className="present-slide present-slide--table">
        <div className="present-eyebrow">Banner room</div>
        <h2 className="present-table-title">{values.title || 'Champions'}</h2>
        <div className="present-champ-list">
          {rows.map((s) => {
            const name = nameForManager(data, s.championManagerId)
            const avatar = avatarForManager(data, s.championManagerId)
            return (
              <div key={s.id} className="present-champ-row">
                <div className="present-champ-year">{s.year}</div>
                <div className="present-champ-manager">
                  <Avatar url={avatar} name={name} size={40} />
                  <span>{name}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  },
}

const playoffApsBlock: BlockDef = {
  id: 'championships-leaderboard',
  label: 'Championships leaderboard',
  category: 'standings',
  description: 'Most rings in league history, per real person.',
  options: {
    title: { kind: 'text', label: 'Title', placeholder: 'Most championships', default: '' },
    limit: { kind: 'number', label: 'Show top N', placeholder: '10', default: '10', min: 3, max: 30 },
  },
  defaults: () => ({ title: 'Most championships', limit: '10' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    const limit = Math.max(3, Math.min(30, parseInt(values.limit || '10', 10) || 10))
    const rows = profileTotals(data)
      .filter((r) => r.championships > 0)
      .sort((a, b) => b.championships - a.championships || b.wins - a.wins)
      .slice(0, limit)
    if (rows.length === 0) return <MissingData reason="No champions on file yet." />
    return (
      <div className="present-slide present-slide--table">
        <div className="present-eyebrow">All time</div>
        <h2 className="present-table-title">{values.title || 'Most championships'}</h2>
        <table className="present-table">
          <thead>
            <tr>
              <th style={{ width: '3rem' }}>#</th>
              <th>Manager</th>
              <th style={{ textAlign: 'right' }}>🏆</th>
              <th style={{ textAlign: 'right' }}>Sea</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.profileId} className={i === 0 ? 'is-leader' : ''}>
                <td className="present-table-rank">{i + 1}</td>
                <td>
                  <span className="present-table-manager">
                    <Avatar url={r.avatarUrl} name={r.canonicalName} size={32} />
                    <span>{r.canonicalName}</span>
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>{r.championships}</td>
                <td style={{ textAlign: 'right' }}>{r.seasons}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  },
}

export const BLOCKS: BlockDef[] = [
  titleBlock,
  sectionBlock,
  closingBlock,
  finalStandingsBlock,
  allTimeWinsBlock,
  allTimePointsBlock,
  championRollBlock,
  playoffApsBlock,
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
