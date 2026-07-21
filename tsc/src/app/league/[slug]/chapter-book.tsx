'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ChapterKey =
  | 'toc'
  | 'sources'
  | 'members'
  | 'rivalries'
  | 'season'
  | 'settings'

type ChapterDef = {
  key: Exclude<ChapterKey, 'toc'>
  numeral: string
  tab: string
  title: ReactNode
  desc: string
}

export const CHAPTERS: ChapterDef[] = [
  {
    key: 'sources',
    numeral: 'I',
    tab: 'Sources',
    title: <>The <em>Sources.</em></>,
    desc: 'Connect league IDs and pull your history in.',
  },
  {
    key: 'members',
    numeral: 'II',
    tab: 'Members',
    title: <>The <em>Members.</em></>,
    desc: 'Merge duplicate accounts, mark alumni, hide throwaways.',
  },
  {
    key: 'rivalries',
    numeral: 'III',
    tab: 'Feuds',
    title: <>The <em>Feuds.</em></>,
    desc: 'Two managers, one grudge, its own page in the almanac.',
  },
  {
    key: 'season',
    numeral: 'IV',
    tab: 'Season',
    title: <>Current <em>Season.</em></>,
    desc: 'Mark the year in progress and the source that refreshes weekly.',
  },
  {
    key: 'settings',
    numeral: 'V',
    tab: 'Settings',
    title: <>The <em>Settings.</em></>,
    desc: 'Name, abbreviation, public URL, prize pool, draft scoring.',
  },
]

// ───────────────────────────────────────────────────────────────────
// Dirty/save registry.
//
// A chapter that holds pending edits registers a save handler and its
// dirty flag here. The book uses that for three things: the pip on the
// tab, the state line + Save button in the foot, and the prompt shown
// when you try to turn the page (or close the tab) with edits pending.
//
// Chapters whose actions commit immediately — adding a source, hiding a
// member, deleting a feud — simply never register, so they're never
// "unsaved" and the guard leaves them alone. That's accurate rather
// than a gap: there is nothing pending to lose.

type Registration = {
  dirty: boolean
  save?: () => Promise<boolean> | boolean
}

type BookApi = {
  register: (key: string, reg: Registration | null) => void
}

const BookCtx = createContext<BookApi | null>(null)

/**
 * Register a chapter's unsaved state with the surrounding book.
 * `save` should return false (or throw) if the save failed, so the book
 * can keep the reader on the page.
 */
export function useChapterEdits(
  key: string,
  dirty: boolean,
  save?: () => Promise<boolean> | boolean,
) {
  const api = useContext(BookCtx)
  // Keep the latest save closure in a ref so re-registering on every
  // keystroke isn't necessary: only `dirty` drives the registration
  // effect. The ref is written in its own effect rather than during
  // render, which would be a render-phase side effect.
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })

  useEffect(() => {
    if (!api) return
    api.register(key, { dirty, save: () => saveRef.current?.() ?? true })
    return () => api.register(key, null)
  }, [api, key, dirty])
}

// ───────────────────────────────────────────────────────────────────

export function ChapterBook({
  slug,
  counts,
  reviewed,
  panels,
}: {
  slug: string
  // Plain data, not JSX. These used to be fragments built on the server
  // page and rendered inside ChapterBook's chapter .map(), which is
  // exactly the shape React's missing-key warning complains about
  // ("passed a child from LeagueOverviewPage"). Keeping element creation
  // on this side of the boundary avoids it entirely.
  counts: Record<string, { value?: string; unit: string }>
  // Per-chapter "has this been dealt with" signal. Each key carries its
  // own real criterion (see the hub page) rather than a single invented
  // notion of done, and the tick's tooltip states which one applied.
  reviewed: Record<string, { done: boolean; why: string }>
  panels: Partial<Record<Exclude<ChapterKey, 'toc'>, ReactNode>>
}) {
  const [active, setActive] = useState<ChapterKey>('toc')
  const [turning, setTurning] = useState(false)
  const [regs, setRegs] = useState<Record<string, Registration>>({})
  const [pending, setPending] = useState<ChapterKey | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const register = useCallback((key: string, reg: Registration | null) => {
    setRegs((prev) => {
      if (!reg) {
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        return next
      }
      const cur = prev[key]
      if (cur && cur.dirty === reg.dirty && cur.save === reg.save) return prev
      return { ...prev, [key]: reg }
    })
  }, [])

  const api = useMemo<BookApi>(() => ({ register }), [register])

  const activeReg = active === 'toc' ? undefined : regs[active]
  const activeDirty = !!activeReg?.dirty
  const anyDirty = Object.values(regs).some((r) => r.dirty)

  // Native guard for closing the tab / navigating away entirely.
  useEffect(() => {
    if (!anyDirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [anyDirty])

  function turnTo(next: ChapterKey) {
    if (next === active) return
    setSaveErr(null)
    // Only the chapter you're leaving can lose work.
    if (activeDirty) {
      setPending(next)
      return
    }
    commitTurn(next)
  }

  function commitTurn(next: ChapterKey) {
    setPending(null)
    setTurning(true)
    window.setTimeout(() => {
      setActive(next)
      // Let the leaf land before clearing, so the sheet covers the swap.
      window.setTimeout(() => setTurning(false), 60)
    }, 260)
  }

  async function saveActive(): Promise<boolean> {
    const reg = activeReg
    if (!reg?.save) return true
    setSaving(true)
    setSaveErr(null)
    try {
      const ok = await reg.save()
      setSaving(false)
      if (!ok) {
        setSaveErr('Could not save. Check the chapter for details.')
        return false
      }
      return true
    } catch (err) {
      setSaving(false)
      setSaveErr(err instanceof Error ? err.message : 'Could not save.')
      return false
    }
  }

  async function saveThenTurn() {
    const ok = await saveActive()
    if (ok && pending) commitTurn(pending)
  }

  const activeDef = CHAPTERS.find((c) => c.key === active)

  return (
    <BookCtx.Provider value={api}>
      <div className="lo-book">
        <div className="lo-book-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={active === 'toc'}
            className={`lo-book-tab${active === 'toc' ? ' active' : ''}`}
            onClick={() => turnTo('toc')}
          >
            Contents
          </button>
          {CHAPTERS.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={active === c.key}
              className={`lo-book-tab lo-book-tab--${c.key}${active === c.key ? ' active' : ''}`}
              onClick={() => turnTo(c.key)}
            >
              <span className="num">{c.numeral}</span>
              {c.tab}
              {regs[c.key]?.dirty && <span className="pip" aria-label="unsaved changes" />}
            </button>
          ))}
        </div>

        <div className={`lo-book-stage${turning ? ' is-turning' : ''}`}>
          <div className="lo-book-sheet" aria-hidden />
          <div className={`lo-book-paper lo-page--${active === 'toc' ? 'sources' : active}`}>
            {active === 'toc' ? (
              <>
                <div className="lo-leaf-head">
                  <span className="lo-leaf-no" aria-hidden>0</span>
                  <span className="lo-leaf-title">Table of <em>Contents.</em></span>
                  <span className="lo-leaf-meta">Turn to any chapter</span>
                </div>
                <div className="lo-toc">
                  {CHAPTERS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className={`lo-toc-entry lo-toc-entry--${c.key}`}
                      onClick={() => turnTo(c.key)}
                    >
                      <span className="lo-toc-num">{c.numeral}</span>
                      <span className="lo-toc-body">
                        <span className="lo-toc-name">
                          <span
                            className={`lo-toc-mark${reviewed[c.key]?.done ? ' done' : ''}`}
                            title={reviewed[c.key]?.why}
                            aria-label={reviewed[c.key]?.why}
                          >
                            ✓
                          </span>
                          {c.title}
                        </span>
                        <span className="lo-toc-desc" style={{ display: 'block' }}>{c.desc}</span>
                      </span>
                      <span className="lo-toc-count">
                        {counts[c.key]?.value ? <strong>{counts[c.key].value}</strong> : null}
                        {counts[c.key]?.value ? ' ' : ''}
                        {counts[c.key]?.unit}
                      </span>
                    </button>
                  ))}
                  {/* Presentation mode is a full-screen builder, so it
                      leaves the book rather than opening as a leaf. */}
                  <a
                    href={`/league/${slug}/present`}
                    className="lo-toc-entry lo-toc-entry--present"
                  >
                    <span className="lo-toc-num">VI</span>
                    <span className="lo-toc-body">
                      <span className="lo-toc-name">
                        <span className="lo-toc-mark" title="Decks are built per session and never saved" aria-hidden>✓</span>
                        Presentation <em>Mode.</em>
                      </span>
                      <span className="lo-toc-desc" style={{ display: 'block' }}>
                        Build a slide deck and present it full-screen. Opens on its own.
                      </span>
                    </span>
                    <span className="lo-toc-count">Open</span>
                  </a>
                </div>
              </>
            ) : (
              <>
                <div className="lo-leaf-head">
                  <span className="lo-leaf-no" aria-hidden>{activeDef?.numeral}</span>
                  <span className="lo-leaf-title">{activeDef?.title}</span>
                  <span className="lo-leaf-meta">
                    {counts[active]?.value ? `${counts[active].value} ` : ''}
                    {counts[active]?.unit}
                  </span>
                </div>
                {panels[active] ?? null}
                <div className="lo-book-foot">
                  <span className={`lo-book-foot-state${activeDirty ? ' dirty' : ''}`}>
                    {saveErr
                      ? saveErr
                      : activeDirty
                      ? 'Unsaved changes on this page'
                      : activeReg
                      ? 'All changes saved'
                      : 'Changes here save as you make them'}
                  </span>
                  <span className="lo-book-foot-acts">
                    <button type="button" className="lo-btn-ghost sm" onClick={() => turnTo('toc')}>
                      Back to contents
                    </button>
                    {activeReg?.save && (
                      <button
                        type="button"
                        className="lo-btn sm"
                        onClick={saveActive}
                        disabled={!activeDirty || saving}
                      >
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {pending !== null && (
        <div className="lo-guard" role="dialog" aria-modal="true">
          <div className="lo-guard-card">
            <div className="lo-guard-kicker">★ Unsaved changes ★</div>
            <div className="lo-guard-title">Turn the page anyway?</div>
            <div className="lo-guard-body">
              You have edits on this chapter that haven&apos;t been saved yet.
              Turning to another chapter will discard them.
            </div>
            {saveErr && <p className="lo-msg-err" style={{ marginTop: '.8rem' }}>{saveErr}</p>}
            <div className="lo-guard-acts">
              {activeReg?.save && (
                <button type="button" className="lo-btn sm" onClick={saveThenTurn} disabled={saving}>
                  {saving ? 'Saving…' : 'Save and continue'}
                </button>
              )}
              <button
                type="button"
                className="lo-btn-ghost sm"
                onClick={() => commitTurn(pending)}
                disabled={saving}
              >
                Discard and continue
              </button>
              <button
                type="button"
                className="lo-btn-quiet"
                onClick={() => { setPending(null); setSaveErr(null) }}
                disabled={saving}
              >
                Stay here
              </button>
            </div>
          </div>
        </div>
      )}
    </BookCtx.Provider>
  )
}
