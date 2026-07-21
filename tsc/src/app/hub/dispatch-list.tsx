'use client'

// The shipped-entries timeline with a "See more / Show less" collapse so the
// page never scrolls forever. Shows `initial` entries, then reveals `step`
// more per click; "Show less" folds back to `initial`. Shared by the desktop
// timeline (variant="desktop") and the Pocket Clubhouse feed (variant="mobile").

import { useState } from 'react'
import { Reveal } from './bits'
import type { DispatchEntry } from './dispatch-content'

function Entry({ e, variant }: { e: DispatchEntry; variant: 'desktop' | 'mobile' }) {
  if (variant === 'mobile') {
    return (
      <Reveal>
        <article className={`mhb-entry${e.status === 'soon' ? ' is-soon' : ''}`}>
          <div className="mhb-entry-date">{e.date}</div>
          <h3 className="mhb-entry-title">
            {e.title} {e.titleEm && <em>{e.titleEm}</em>}
          </h3>
          <p className="mhb-entry-body" dangerouslySetInnerHTML={{ __html: e.body }} />
          {e.tags.length > 0 && (
            <div className="mhb-entry-tags">
              {e.tags.map((t) => (
                <span key={t.label} className={`hub-chip${t.tone ? ` ${t.tone}` : ''}`}>
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </article>
      </Reveal>
    )
  }
  return (
    <Reveal>
      <article className={`hub-entry${e.status === 'soon' ? ' is-soon' : ''}`}>
        <div className="hub-entry-date">{e.date}</div>
        <div className="hub-entry-dot" />
        <div>
          <h3 className="hub-entry-title">
            {e.title} {e.titleEm && <em>{e.titleEm}</em>}
          </h3>
          <p
            className="hub-entry-body"
            dangerouslySetInnerHTML={{ __html: e.body }}
          />
          {e.tags.length > 0 && (
            <div className="hub-entry-tags">
              {e.tags.map((t) => (
                <span key={t.label} className={`hub-chip${t.tone ? ` ${t.tone}` : ''}`}>
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>
    </Reveal>
  )
}

export function DispatchList({
  entries,
  variant,
  initial = 12,
  step = 10,
}: {
  entries: DispatchEntry[]
  variant: 'desktop' | 'mobile'
  initial?: number
  step?: number
}) {
  const [visible, setVisible] = useState(initial)
  const shown = entries.slice(0, visible)
  const remaining = entries.length - visible
  const canExpand = remaining > 0
  const canCollapse = visible > initial

  return (
    <>
      <div className={variant === 'mobile' ? 'mhb-feed' : 'hub-dispatch'}>
        {shown.map((e) => (
          <Entry key={e.id} e={e} variant={variant} />
        ))}
      </div>
      {(canExpand || canCollapse) && (
        <div className="hub-dispatch-more">
          {canExpand && (
            <button
              type="button"
              className="hub-btn-ghost"
              onClick={() => setVisible((v) => Math.min(entries.length, v + step))}
            >
              See more ({remaining} older)
            </button>
          )}
          {canCollapse && (
            <button type="button" className="hub-btn-ghost" onClick={() => setVisible(initial)}>
              Show less
            </button>
          )}
        </div>
      )}
    </>
  )
}
