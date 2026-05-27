import type { ReactNode } from 'react'
import type { BlockOption, BlockOptionValues, Theme } from './types'
import type { LeaguePresentationData } from './leagueData'
import {
  avatarForManager,
  biggestBlowout,
  closestGame,
  headToHead,
  highestScoringWeek,
  longestWinStreak,
  lowestScoringWeek,
  nameForManager,
  profileById,
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

// Picks a density class based on row count. Tables with 9+ rows get tighter
// padding so a 12-14 team standings table fits on one slide without scrolling.
function tableDensityClass(rowCount: number): string {
  if (rowCount >= 14) return 'is-very-dense'
  if (rowCount >= 9) return 'is-dense'
  return ''
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
        <table className={`present-table ${tableDensityClass(rows.length)}`}>
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
        <table className={`present-table ${tableDensityClass(rows.length)}`}>
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
        <table className={`present-table ${tableDensityClass(rows.length)}`}>
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
        <table className={`present-table ${tableDensityClass(rows.length)}`}>
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

// ─── Highlight slides (single big stat with context) ───────────────────────

function HighlightSlide({
  eyebrow,
  title,
  metric,
  metricLabel,
  primary,
  secondary,
  footnote,
}: {
  eyebrow: string
  title: string
  metric: string
  metricLabel: string
  primary: { name: string; avatarUrl: string | null }
  secondary?: { name: string; avatarUrl: string | null; label?: string } | null
  footnote: string
}) {
  return (
    <div className="present-slide present-slide--highlight">
      <div className="present-eyebrow">{eyebrow}</div>
      <h2 className="present-highlight-title">{title}</h2>
      <div className="present-highlight-metric">
        <div className="present-highlight-number">{metric}</div>
        <div className="present-highlight-metric-label">{metricLabel}</div>
      </div>
      <div className="present-highlight-actors">
        <div className="present-highlight-actor">
          <Avatar url={primary.avatarUrl} name={primary.name} size={72} />
          <div className="present-highlight-actor-name">{primary.name}</div>
        </div>
        {secondary ? (
          <>
            <div className="present-highlight-vs">{secondary.label ?? 'vs.'}</div>
            <div className="present-highlight-actor present-highlight-actor--muted">
              <Avatar url={secondary.avatarUrl} name={secondary.name} size={56} />
              <div className="present-highlight-actor-name">{secondary.name}</div>
            </div>
          </>
        ) : null}
      </div>
      <div className="present-footnote">{footnote}</div>
    </div>
  )
}

function gameContextSuffix(g: { isChampionship: boolean; isPlayoff: boolean }) {
  if (g.isChampionship) return ' (championship)'
  if (g.isPlayoff) return ' (playoffs)'
  return ''
}

const highestScoreBlock: BlockDef = {
  id: 'highest-score',
  label: 'Highest-scoring week',
  category: 'highlights',
  description: 'Single team-week with the most points in league history.',
  options: {
    title: { kind: 'text', label: 'Title', placeholder: 'Highest single week', default: '' },
  },
  defaults: () => ({ title: 'Highest single week' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    const hit = highestScoringWeek(data)
    if (!hit) return <MissingData reason="No scored matchups recorded yet." />
    return (
      <HighlightSlide
        eyebrow="Single-week record"
        title={values.title || 'Highest single week'}
        metric={hit.score.toFixed(1)}
        metricLabel="points"
        primary={{ name: nameForManager(data, hit.managerId), avatarUrl: avatarForManager(data, hit.managerId) }}
        secondary={{
          name: nameForManager(data, hit.opponentId),
          avatarUrl: avatarForManager(data, hit.opponentId),
          label: `vs. ${hit.opponentScore.toFixed(1)}`,
        }}
        footnote={`Week ${hit.week}, ${hit.year}${gameContextSuffix(hit)}`}
      />
    )
  },
}

const lowestScoreBlock: BlockDef = {
  id: 'lowest-score',
  label: 'Lowest-scoring week',
  category: 'highlights',
  description: 'The cellar — smallest single team-week on file.',
  options: {
    title: { kind: 'text', label: 'Title', placeholder: 'Lowest single week', default: '' },
  },
  defaults: () => ({ title: 'Lowest single week' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    const hit = lowestScoringWeek(data)
    if (!hit) return <MissingData reason="No scored matchups recorded yet." />
    return (
      <HighlightSlide
        eyebrow="Single-week low"
        title={values.title || 'Lowest single week'}
        metric={hit.score.toFixed(1)}
        metricLabel="points"
        primary={{ name: nameForManager(data, hit.managerId), avatarUrl: avatarForManager(data, hit.managerId) }}
        secondary={{
          name: nameForManager(data, hit.opponentId),
          avatarUrl: avatarForManager(data, hit.opponentId),
          label: `vs. ${hit.opponentScore.toFixed(1)}`,
        }}
        footnote={`Week ${hit.week}, ${hit.year}${gameContextSuffix(hit)}`}
      />
    )
  },
}

const biggestBlowoutBlock: BlockDef = {
  id: 'biggest-blowout',
  label: 'Biggest blowout',
  category: 'highlights',
  description: 'Largest margin of victory ever recorded.',
  options: {
    title: { kind: 'text', label: 'Title', placeholder: 'Biggest blowout', default: '' },
  },
  defaults: () => ({ title: 'Biggest blowout' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    const hit = biggestBlowout(data)
    if (!hit) return <MissingData reason="No completed matchups recorded yet." />
    return (
      <HighlightSlide
        eyebrow="Margin of victory"
        title={values.title || 'Biggest blowout'}
        metric={hit.margin.toFixed(1)}
        metricLabel="point margin"
        primary={{ name: nameForManager(data, hit.winnerId), avatarUrl: avatarForManager(data, hit.winnerId) }}
        secondary={{
          name: nameForManager(data, hit.loserId),
          avatarUrl: avatarForManager(data, hit.loserId),
          label: `def. ${hit.winnerScore.toFixed(1)}–${hit.loserScore.toFixed(1)}`,
        }}
        footnote={`Week ${hit.week}, ${hit.year}${gameContextSuffix(hit)}`}
      />
    )
  },
}

const closestGameBlock: BlockDef = {
  id: 'closest-game',
  label: 'Closest game',
  category: 'highlights',
  description: 'Smallest non-tie margin ever recorded.',
  options: {
    title: { kind: 'text', label: 'Title', placeholder: 'Closest finish', default: '' },
  },
  defaults: () => ({ title: 'Closest finish' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    const hit = closestGame(data)
    if (!hit) return <MissingData reason="No completed matchups recorded yet." />
    return (
      <HighlightSlide
        eyebrow="Heart attack"
        title={values.title || 'Closest finish'}
        metric={hit.margin.toFixed(2)}
        metricLabel="point margin"
        primary={{ name: nameForManager(data, hit.winnerId), avatarUrl: avatarForManager(data, hit.winnerId) }}
        secondary={{
          name: nameForManager(data, hit.loserId),
          avatarUrl: avatarForManager(data, hit.loserId),
          label: `def. ${hit.winnerScore.toFixed(1)}–${hit.loserScore.toFixed(1)}`,
        }}
        footnote={`Week ${hit.week}, ${hit.year}${gameContextSuffix(hit)}`}
      />
    )
  },
}

const longestStreakBlock: BlockDef = {
  id: 'longest-streak',
  label: 'Longest win streak',
  category: 'highlights',
  description: 'Longest consecutive regular-season wins, all-time.',
  options: {
    title: { kind: 'text', label: 'Title', placeholder: 'Longest win streak', default: '' },
  },
  defaults: () => ({ title: 'Longest win streak' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    const hit = longestWinStreak(data)
    if (!hit) return <MissingData reason="Not enough regular-season games yet." />
    const span = hit.startYear === hit.endYear ? `${hit.startYear}` : `${hit.startYear}–${hit.endYear}`
    return (
      <HighlightSlide
        eyebrow="Regular season"
        title={values.title || 'Longest win streak'}
        metric={String(hit.length)}
        metricLabel="straight wins"
        primary={{ name: hit.canonicalName, avatarUrl: hit.avatarUrl }}
        footnote={`${span}`}
      />
    )
  },
}

// ─── Manager spotlights ────────────────────────────────────────────────────

const careerCardBlock: BlockDef = {
  id: 'career-card',
  label: 'Career stat card',
  category: 'managers',
  description: 'Pick a manager — show their career W-L, points, seasons, and titles.',
  options: {
    profile: { kind: 'pick', label: 'Manager', source: 'manager' },
    title: { kind: 'text', label: 'Title override', placeholder: '(uses manager name)', default: '' },
  },
  defaults: () => ({ profile: '', title: '' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    const totals = profileTotals(data).find((t) => t.profileId === values.profile)
    if (!totals) return <MissingData reason="Pick a manager in the inspector to populate this slide." />
    const games = totals.wins + totals.losses + totals.ties
    const winPct = games > 0 ? totals.wins / games : 0
    return (
      <div className="present-slide present-slide--card">
        <div className="present-card-head">
          <Avatar url={totals.avatarUrl} name={totals.canonicalName} size={108} />
          <div className="present-card-head-text">
            <div className="present-eyebrow">Career</div>
            <h2 className="present-card-title">{values.title || totals.canonicalName}</h2>
          </div>
        </div>
        <div className="present-card-stats">
          <div className="present-card-stat">
            <div className="present-card-stat-num">{totals.wins}-{totals.losses}{totals.ties ? `-${totals.ties}` : ''}</div>
            <div className="present-card-stat-label">Record</div>
          </div>
          <div className="present-card-stat">
            <div className="present-card-stat-num">{(winPct * 100).toFixed(1)}%</div>
            <div className="present-card-stat-label">Win rate</div>
          </div>
          <div className="present-card-stat">
            <div className="present-card-stat-num">{totals.pointsFor.toFixed(0)}</div>
            <div className="present-card-stat-label">Total PF</div>
          </div>
          <div className="present-card-stat">
            <div className="present-card-stat-num">{totals.seasons}</div>
            <div className="present-card-stat-label">Seasons</div>
          </div>
          <div className="present-card-stat">
            <div className="present-card-stat-num">{totals.championships}</div>
            <div className="present-card-stat-label">Titles</div>
          </div>
        </div>
      </div>
    )
  },
}

const headToHeadBlock: BlockDef = {
  id: 'head-to-head',
  label: 'Head-to-head',
  category: 'managers',
  description: 'Pick two managers — show their all-time record against each other.',
  options: {
    profileA: { kind: 'pick', label: 'Manager A', source: 'manager' },
    profileB: { kind: 'pick', label: 'Manager B', source: 'manager' },
    title: { kind: 'text', label: 'Title', placeholder: 'Head to head', default: '' },
  },
  defaults: () => ({ profileA: '', profileB: '', title: 'Head to head' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    if (!values.profileA || !values.profileB) {
      return <MissingData reason="Pick two managers in the inspector." />
    }
    if (values.profileA === values.profileB) {
      return <MissingData reason="Pick two different managers." />
    }
    const h2h = headToHead(data, values.profileA, values.profileB)
    if (!h2h) return <MissingData reason="These two have never met." />
    return (
      <div className="present-slide present-slide--versus">
        <div className="present-eyebrow">{values.title || 'Head to head'}</div>
        <div className="present-versus">
          <div className="present-versus-side">
            <Avatar url={h2h.avatarA} name={h2h.nameA} size={120} />
            <div className="present-versus-name">{h2h.nameA}</div>
            <div className="present-versus-wins">{h2h.winsA}</div>
          </div>
          <div className="present-versus-divider">vs</div>
          <div className="present-versus-side">
            <Avatar url={h2h.avatarB} name={h2h.nameB} size={120} />
            <div className="present-versus-name">{h2h.nameB}</div>
            <div className="present-versus-wins">{h2h.winsB}</div>
          </div>
        </div>
        <div className="present-versus-line">
          {h2h.matchupCount} meetings · {h2h.pointsForA.toFixed(0)}–{h2h.pointsForB.toFixed(0)} points
          {h2h.ties ? ` · ${h2h.ties} tie${h2h.ties === 1 ? '' : 's'}` : ''}
        </div>
        {h2h.biggestMargin ? (
          <div className="present-footnote">
            Biggest swing: {h2h.biggestMargin.winnerId === h2h.profileAId ? h2h.nameA : h2h.nameB}
            {' '}by {h2h.biggestMargin.margin.toFixed(1)} (W{h2h.biggestMargin.week}, {h2h.biggestMargin.year})
          </div>
        ) : null}
      </div>
    )
  },
}

// ─── Rivalry slides ────────────────────────────────────────────────────────

function rivalryRecord(data: LeaguePresentationData, managerAId: string, managerBId: string) {
  // Rivalries are stored against manager rows (per-platform). Translate to
  // profiles so the record sweeps across both Sleeper + NFL identities.
  const profileOf = new Map(data.managers.map((m) => [m.id, m.profileId]))
  const pidA = profileOf.get(managerAId)
  const pidB = profileOf.get(managerBId)
  if (!pidA || !pidB) return null
  return headToHead(data, pidA, pidB)
}

const featuredRivalryBlock: BlockDef = {
  id: 'featured-rivalry',
  label: 'Featured rivalry',
  category: 'rivalry',
  description: 'Pick a curated rivalry — show its title and the all-time record.',
  options: {
    rivalry: { kind: 'pick', label: 'Rivalry', source: 'rivalry' },
  },
  defaults: () => ({ rivalry: '' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    if (data.rivalries.length === 0) {
      return <MissingData reason="No rivalries curated yet — add some on the Rivalries page." />
    }
    const r = data.rivalries.find((x) => x.id === values.rivalry)
    if (!r) return <MissingData reason="Pick a rivalry in the inspector." />
    const h2h = rivalryRecord(data, r.managerAId, r.managerBId)
    if (!h2h) return <MissingData reason="These two have never met." />
    return (
      <div className="present-slide present-slide--versus">
        <div className="present-eyebrow">Rivalry</div>
        <h2 className="present-card-title" style={{ marginBottom: '.5rem' }}>{r.name}</h2>
        <div className="present-versus">
          <div className="present-versus-side">
            <Avatar url={h2h.avatarA} name={h2h.nameA} size={120} />
            <div className="present-versus-name">{h2h.nameA}</div>
            <div className="present-versus-wins">{h2h.winsA}</div>
          </div>
          <div className="present-versus-divider">vs</div>
          <div className="present-versus-side">
            <Avatar url={h2h.avatarB} name={h2h.nameB} size={120} />
            <div className="present-versus-name">{h2h.nameB}</div>
            <div className="present-versus-wins">{h2h.winsB}</div>
          </div>
        </div>
        <div className="present-versus-line">
          {h2h.matchupCount} meetings
          {h2h.lastMeetingYear ? ` · last met ${h2h.lastMeetingYear}` : ''}
        </div>
      </div>
    )
  },
}

const mostLopsidedRivalryBlock: BlockDef = {
  id: 'most-lopsided-rivalry',
  label: 'Most lopsided rivalry',
  category: 'rivalry',
  description: 'Of the curated rivalries, the one with the biggest record gap.',
  options: {
    title: { kind: 'text', label: 'Title', placeholder: 'Most one-sided', default: '' },
  },
  defaults: () => ({ title: 'Most one-sided' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    if (data.rivalries.length === 0) {
      return <MissingData reason="No rivalries curated yet — add some on the Rivalries page." />
    }
    let bestGap = -1
    let bestRivalry: { name: string; h2h: NonNullable<ReturnType<typeof rivalryRecord>> } | null = null
    for (const r of data.rivalries) {
      const h2h = rivalryRecord(data, r.managerAId, r.managerBId)
      if (!h2h) continue
      const gap = Math.abs(h2h.winsA - h2h.winsB)
      if (gap > bestGap) {
        bestGap = gap
        bestRivalry = { name: r.name, h2h }
      }
    }
    if (!bestRivalry) return <MissingData reason="None of your rivalries have any meetings yet." />
    const { name, h2h } = bestRivalry
    const aLeads = h2h.winsA >= h2h.winsB
    return (
      <div className="present-slide present-slide--versus">
        <div className="present-eyebrow">{values.title || 'Most one-sided'}</div>
        <h2 className="present-card-title" style={{ marginBottom: '.5rem' }}>{name}</h2>
        <div className="present-versus">
          <div className={`present-versus-side ${aLeads ? '' : 'is-loser'}`}>
            <Avatar url={h2h.avatarA} name={h2h.nameA} size={120} />
            <div className="present-versus-name">{h2h.nameA}</div>
            <div className="present-versus-wins">{h2h.winsA}</div>
          </div>
          <div className="present-versus-divider">vs</div>
          <div className={`present-versus-side ${aLeads ? 'is-loser' : ''}`}>
            <Avatar url={h2h.avatarB} name={h2h.nameB} size={120} />
            <div className="present-versus-name">{h2h.nameB}</div>
            <div className="present-versus-wins">{h2h.winsB}</div>
          </div>
        </div>
        <div className="present-versus-line">
          {(aLeads ? h2h.nameA : h2h.nameB)} leads by {Math.abs(h2h.winsA - h2h.winsB)} across {h2h.matchupCount} meetings.
        </div>
      </div>
    )
  },
}

// Manager-of-the-year is purely owner-curated: pick a season + manager + caption.
const managerOfYearBlock: BlockDef = {
  id: 'manager-of-year',
  label: 'Manager of the year',
  category: 'managers',
  description: 'Owner-curated MVP slide — pick a season, pick a manager, write your case.',
  options: {
    season: { kind: 'pick', label: 'Season', source: 'season' },
    profile: { kind: 'pick', label: 'Manager', source: 'manager' },
    caption: { kind: 'text', label: 'One-line case', placeholder: 'Why they earned it', default: '' },
  },
  defaults: () => ({ season: '', profile: '', caption: '' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    const season = data.seasons.find((s) => s.id === values.season)
    const profile = profileById(data, values.profile)
    if (!season || !profile) {
      return <MissingData reason="Pick a season and a manager in the inspector." />
    }
    return (
      <div className="present-slide present-slide--mvp">
        <div className="present-eyebrow">Manager of the year · {season.year}</div>
        <Avatar url={profile.avatarUrl} name={profile.canonicalName} size={160} />
        <div className="present-card-title" style={{ fontSize: 'clamp(3rem, 8vw, 6rem)' }}>{profile.canonicalName}</div>
        {values.caption ? <div className="present-sub">{values.caption}</div> : null}
      </div>
    )
  },
}

// ─── Draft ─────────────────────────────────────────────────────────────────

const firstRoundBlock: BlockDef = {
  id: 'first-round-board',
  label: 'Round 1 board',
  category: 'draft',
  description: 'First-round picks for a chosen draft year.',
  options: {
    season: { kind: 'pick', label: 'Season', source: 'season' },
    title: { kind: 'text', label: 'Title', placeholder: 'Round 1', default: '' },
  },
  defaults: () => ({ season: '', title: 'Round 1' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    const season = data.seasons.find((s) => s.id === values.season)
    if (!season) return <MissingData reason="Pick a season in the inspector." />
    const draft = data.drafts.find((d) => d.seasonId === season.id)
    if (!draft) return <MissingData reason={`No draft on file for ${season.year}.`} />
    const picks = data.draftPicks
      .filter((p) => p.draftId === draft.id && p.round === 1)
      .slice()
      .sort((a, b) => a.pick - b.pick)
    if (picks.length === 0) return <MissingData reason={`Draft picks for ${season.year} haven't synced.`} />
    return (
      <div className="present-slide present-slide--table">
        <div className="present-eyebrow">{season.year} draft · Round 1</div>
        <h2 className="present-table-title">{values.title || 'Round 1'}</h2>
        <div className="present-draft-grid">
          {picks.map((p) => {
            const name = nameForManager(data, p.managerId)
            const avatar = avatarForManager(data, p.managerId)
            return (
              <div key={p.pick} className="present-draft-card">
                <div className="present-draft-pick">{p.pick}</div>
                <div className="present-draft-body">
                  <div className="present-draft-player">{p.playerName || '—'}</div>
                  <div className="present-draft-meta">
                    {[p.position, p.nflTeam].filter(Boolean).join(' · ') || '—'}
                  </div>
                  <div className="present-draft-team">
                    <Avatar url={avatar} name={name} size={22} />
                    <span>{name}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  },
}

const firstOverallHistoryBlock: BlockDef = {
  id: 'first-overall-history',
  label: 'First-overall history',
  category: 'draft',
  description: 'Every season’s 1.01 pick, year by year.',
  options: {
    title: { kind: 'text', label: 'Title', placeholder: 'First overall', default: '' },
  },
  defaults: () => ({ title: 'First overall' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    const seasonsById = new Map(data.seasons.map((s) => [s.id, s.year]))
    const draftsByYear = data.drafts
      .map((d) => ({ d, year: seasonsById.get(d.seasonId) }))
      .filter((x): x is { d: typeof x.d; year: number } => x.year != null)
      .sort((a, b) => b.year - a.year)
    type Row = { year: number; player: string; manager: string; avatar: string | null }
    const rows: Row[] = []
    for (const { d, year } of draftsByYear) {
      const first = data.draftPicks.find((p) => p.draftId === d.id && p.pick === 1)
      if (!first) continue
      rows.push({
        year,
        player: first.playerName || '—',
        manager: nameForManager(data, first.managerId),
        avatar: avatarForManager(data, first.managerId),
      })
    }
    if (rows.length === 0) return <MissingData reason="No draft picks synced yet." />
    return (
      <div className="present-slide present-slide--table">
        <div className="present-eyebrow">Draft history</div>
        <h2 className="present-table-title">{values.title || 'First overall'}</h2>
        <div className="present-champ-list">
          {rows.map((r) => (
            <div key={r.year} className="present-champ-row">
              <div className="present-champ-year">{r.year}</div>
              <div className="present-champ-manager" style={{ flex: 1 }}>
                <Avatar url={r.avatar} name={r.manager} size={36} />
                <span>
                  <span style={{ display: 'block' }}>{r.player}</span>
                  <span style={{ color: 'var(--p-fg-mute)', fontFamily: 'var(--p-mono-font)', fontSize: '.7em', letterSpacing: '.12em', textTransform: 'uppercase' }}>{r.manager}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  },
}

const curatedPickBlock: BlockDef = {
  id: 'curated-pick',
  label: 'Standout pick',
  category: 'draft',
  description: 'Owner-curated draft pick slide — name your steal or your bust.',
  options: {
    label: { kind: 'text', label: 'Label', placeholder: 'Steal of the draft', default: '' },
    player: { kind: 'text', label: 'Player', placeholder: 'Player name', default: '' },
    detail: { kind: 'text', label: 'Pick detail', placeholder: 'Round 7, pick 84', default: '' },
    profile: { kind: 'pick', label: 'Drafted by', source: 'manager' },
    caption: { kind: 'text', label: 'Why it stands out', placeholder: 'optional', default: '' },
  },
  defaults: () => ({ label: 'Steal of the draft', player: '', detail: '', profile: '', caption: '' }),
  render: ({ values, data }) => {
    if (!data) return <MissingData reason="Sync your league first." />
    const profile = profileById(data, values.profile)
    return (
      <div className="present-slide present-slide--mvp">
        {values.label ? <div className="present-eyebrow">{values.label}</div> : null}
        <div className="present-card-title" style={{ fontSize: 'clamp(2.5rem, 7vw, 5.5rem)' }}>
          {values.player || '—'}
        </div>
        {values.detail ? <div className="present-sub">{values.detail}</div> : null}
        {profile ? (
          <div className="present-highlight-actor" style={{ marginTop: '1rem' }}>
            <Avatar url={profile.avatarUrl} name={profile.canonicalName} size={80} />
            <div className="present-highlight-actor-name">{profile.canonicalName}</div>
          </div>
        ) : null}
        {values.caption ? <div className="present-footnote">{values.caption}</div> : null}
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
  highestScoreBlock,
  lowestScoreBlock,
  biggestBlowoutBlock,
  closestGameBlock,
  longestStreakBlock,
  careerCardBlock,
  managerOfYearBlock,
  headToHeadBlock,
  featuredRivalryBlock,
  mostLopsidedRivalryBlock,
  firstRoundBlock,
  firstOverallHistoryBlock,
  curatedPickBlock,
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
