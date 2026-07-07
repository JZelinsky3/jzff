'use client'

import { useState, type ReactNode } from 'react'
import { AddLeagueForm, type ArchiveDraft } from './add-league-form'

const PLAT_LABELS: Record<ArchiveDraft['platform'], string> = {
  sleeper: 'Sleeper',
  nfl: 'NFL.com',
  espn: 'ESPN',
  yahoo: 'Yahoo',
}

const EMPTY_DRAFT: ArchiveDraft = {
  platform: 'sleeper',
  externalId: '',
  name: '',
  slug: '',
  slugStatus: 'idle',
  abbreviation: '',
  divisionCount: 0,
  divisionTerm: 'division',
  divisionNames: [],
  leagueFound: false,
}

// Desktop /dashboard/new spread: the form on the left, and "the binding
// press" on the right — a live preview book whose cover typesets itself
// as the user works, plus a catalog card and a progress ledger. The rail
// hides below 1020px; the mobile tree has its own page around the same
// form. `children` carries the server-rendered help/back-link block so it
// stays in the form column.
export function NewArchiveStudio({
  yahooConnected,
  children,
}: {
  yahooConnected: boolean
  children?: ReactNode
}) {
  const [draft, setDraft] = useState<ArchiveDraft>(EMPTY_DRAFT)
  return (
    <div className="dc-press">
      <div className="dc-press-main">
        {/* The manuscript: a cream paper leaf on the dark desk. Remapped
            CSS variables inside .dc-press-page flip every dc-* control to
            ink-on-paper. */}
        <div className="dc-press-page">
          <header className="dc-press-page-head">
            <span className="dc-press-page-kicker">✦ The front matter ✦</span>
            <h2 className="dc-press-page-title">Write the opening <em>pages.</em></h2>
            <p className="dc-press-page-sub">Four short passages. The press binds the rest.</p>
          </header>
          <AddLeagueForm yahooConnected={yahooConnected} onDraftChange={setDraft} />
        </div>
      </div>
      <BindingPreview draft={draft} />
      {/* Help + back link live in a second grid row so the sticky rail's
          containing block (its row-1 grid area) ends with the paper page:
          the book and ledger can never travel below the page bottom. */}
      {children && <div className="dc-press-after">{children}</div>}
    </div>
  )
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4)
}

function splitName(name: string): { head: string; tail: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { head: '', tail: parts[0] }
  return { head: parts.slice(0, -1).join(' '), tail: parts[parts.length - 1] }
}

function BindingPreview({ draft }: { draft: ArchiveDraft }) {
  const name = draft.name.trim()
  const monogram = (draft.abbreviation.trim() || initials(name)) || '§'
  const slugOk = draft.slugStatus === 'available'
  const found = draft.leagueFound
  const ready = found && slugOk
  const { head, tail } = splitName(name)

  const slugValue =
    draft.slug.length > 0 ? `/leagues/${draft.slug}/` : 'To be assigned'
  const slugTone =
    draft.slugStatus === 'available' ? 'is-ok'
    : draft.slugStatus === 'taken' || draft.slugStatus === 'invalid' ? 'is-err'
    : ''

  const divisionsValue =
    draft.divisionCount === 0
      ? 'None'
      : `${draft.divisionCount} ${draft.divisionTerm}${draft.divisionCount > 1 ? 's' : ''}`

  const steps: { label: string; done: boolean; detail: string }[] = [
    { label: 'Pick a platform', done: true, detail: PLAT_LABELS[draft.platform] },
    { label: 'Find your league', done: found, detail: found ? 'Located' : 'Waiting' },
    {
      label: 'Title & address',
      done: slugOk,
      detail:
        slugOk ? 'Reserved'
        : draft.slugStatus === 'taken' ? 'URL taken'
        : draft.slugStatus === 'invalid' ? 'Fix the URL'
        : 'Waiting',
    },
    { label: 'Bind the volume', done: false, detail: ready ? 'Ready to press' : 'Awaiting the above' },
  ]

  return (
    // Sticky-stop wrapper: browsers cap a sticky grid item at the grid
    // container, not its grid area, so the rail would ride all the way
    // down past the help/back-link row. The wrapper is the grid item
    // instead — stretched to row 1's height (= the paper page) — and the
    // rail sticks inside it, so it can never travel past the page bottom.
    <div className="dc-press-railwrap">
    <aside className="dc-press-rail">
      <div className="dc-press-kicker">★ The binding press ★</div>

      {/* The book. Cover text re-keys on change so each edit re-runs the
          small "letterpress settle" animation instead of just swapping.
          data-steps drives the page-block thickness: the volume visibly
          gains leaves as the form fills in. */}
      <div
        className={`dc-press-book${ready ? ' is-ready' : ''}`}
        data-steps={1 + (found ? 1 : 0) + (slugOk ? 1 : 0)}
        aria-hidden
      >
        <span className="dc-press-pages" />
        <span className="dc-press-cover">
          <span className="dc-press-plat">{PLAT_LABELS[draft.platform]} · League Almanac</span>
          <span className="dc-press-rule" />
          <span className="dc-press-glyph" key={`g-${monogram}`}>{monogram}</span>
          <span
            className={`dc-press-title${name ? '' : ' is-empty'}`}
            key={`t-${name || 'blank'}`}
            style={{ fontSize: name.length > 26 ? '1.05rem' : undefined }}
          >
            {name ? (
              <>{head && <>{head} </>}<em>{tail}.</em></>
            ) : (
              'Your league here'
            )}
          </span>
          <span className="dc-press-rule" />
          <span className="dc-press-foot">Vol. I · Bound {new Date().getFullYear()}</span>
        </span>
      </div>

      {/* Catalog card: the facts the press will set in type. */}
      <div className="dc-press-card">
        <div className="dc-press-card-head">Catalog card</div>
        <div className="dc-press-line">
          <span>Shelf address</span>
          <span className="dc-press-line-dots" aria-hidden />
          <span className={`dc-press-line-val mono ${slugTone}`}>{slugValue}</span>
        </div>
        <div className="dc-press-line">
          <span>Source</span>
          <span className="dc-press-line-dots" aria-hidden />
          <span className="dc-press-line-val">{PLAT_LABELS[draft.platform]}</span>
        </div>
        <div className="dc-press-line">
          <span>Divisions</span>
          <span className="dc-press-line-dots" aria-hidden />
          <span className="dc-press-line-val">{divisionsValue}</span>
        </div>
        {draft.divisionNames.slice(0, draft.divisionCount).map((n, i) =>
          n.trim() ? (
            <div className="dc-press-line is-sub" key={i}>
              <span>Ch. {toRoman(i + 1)}</span>
              <span className="dc-press-line-dots" aria-hidden />
              <span className="dc-press-line-val">{n}</span>
            </div>
          ) : null
        )}
      </div>

      {/* Progress ledger. */}
      <ol className="dc-press-steps">
        {steps.map((s, i) => (
          <li key={s.label} className={`dc-press-step${s.done ? ' is-done' : ''}`}>
            <span className="dc-press-step-dot" aria-hidden />
            <span className="dc-press-step-label">
              {toRoman(i + 1)}. {s.label}
            </span>
            <span className="dc-press-step-detail">{s.detail}</span>
          </li>
        ))}
      </ol>
    </aside>
    </div>
  )
}

function toRoman(n: number): string {
  return ['I', 'II', 'III', 'IV'][n - 1] ?? String(n)
}
