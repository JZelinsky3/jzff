'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BLOCKS,
  BLOCK_INDEX,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type BlockCategory,
} from './_lib/blocks'
import { STORAGE_KEY, type Deck, type SlideInstance, type Theme } from './_lib/types'

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function blankDeck(slug: string, leagueName: string): Deck {
  return { version: 1, leagueSlug: slug, leagueName, theme: 'cinematic', slides: [] }
}

function loadDeck(slug: string, leagueName: string): Deck {
  if (typeof window === 'undefined') return blankDeck(slug, leagueName)
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY(slug))
    if (!raw) return blankDeck(slug, leagueName)
    const parsed = JSON.parse(raw) as Deck
    if (parsed?.version === 1 && parsed.leagueSlug === slug) {
      // Always reflect the latest league name; the rest is user-authored.
      return { ...parsed, leagueName }
    }
  } catch {
    // Malformed storage — fall through to blank.
  }
  return blankDeck(slug, leagueName)
}

export function Builder({ slug, leagueName }: { slug: string; leagueName: string }) {
  const router = useRouter()
  const [deck, setDeck] = useState<Deck>(() => blankDeck(slug, leagueName))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from sessionStorage on mount only — server-rendered HTML always
  // starts from a blank deck so SSR and client agree.
  useEffect(() => {
    setDeck(loadDeck(slug, leagueName))
    setHydrated(true)
  }, [slug, leagueName])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.sessionStorage.setItem(STORAGE_KEY(slug), JSON.stringify(deck))
    } catch {
      // Storage full / private mode — silently ignore; the user can still present this session.
    }
  }, [deck, slug, hydrated])

  const grouped = useMemo(() => {
    const byCat: Record<BlockCategory, typeof BLOCKS> = {
      cover: [], standings: [], highlights: [], managers: [], rivalry: [], draft: [], custom: [],
    }
    for (const b of BLOCKS) byCat[b.category].push(b)
    return byCat
  }, [])

  const selected = selectedId ? deck.slides.find((s) => s.id === selectedId) ?? null : null
  const selectedDef = selected ? BLOCK_INDEX[selected.blockId] : null

  function addBlock(blockId: string) {
    const def = BLOCK_INDEX[blockId]
    if (!def) return
    const slide: SlideInstance = { id: newId(), blockId, values: def.defaults() }
    setDeck((d) => ({ ...d, slides: [...d.slides, slide] }))
    setSelectedId(slide.id)
  }

  function removeSlide(id: string) {
    setDeck((d) => ({ ...d, slides: d.slides.filter((s) => s.id !== id) }))
    if (selectedId === id) setSelectedId(null)
  }

  function moveSlide(id: string, dir: -1 | 1) {
    setDeck((d) => {
      const i = d.slides.findIndex((s) => s.id === id)
      if (i < 0) return d
      const j = i + dir
      if (j < 0 || j >= d.slides.length) return d
      const next = d.slides.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return { ...d, slides: next }
    })
  }

  function updateValue(id: string, key: string, value: string) {
    setDeck((d) => ({
      ...d,
      slides: d.slides.map((s) => (s.id === id ? { ...s, values: { ...s.values, [key]: value } } : s)),
    }))
  }

  function clearDeck() {
    if (!window.confirm('Clear all slides? This cannot be undone.')) return
    setDeck(blankDeck(slug, leagueName))
    setSelectedId(null)
  }

  function startPresenting() {
    if (deck.slides.length === 0) return
    router.push(`/league/${slug}/present/run`)
  }

  return (
    <div className="present-builder">
      <header className="present-builder-header">
        <div>
          <div className="present-builder-kicker">Presentation mode</div>
          <h1 className="present-builder-title">Build a deck</h1>
          <p className="present-builder-sub">
            Pick slides, edit them, then present. Nothing here saves — close the tab and it&apos;s gone.
          </p>
        </div>
        <div className="present-builder-actions">
          <label className="present-theme-toggle">
            <span>Theme</span>
            <select
              value={deck.theme}
              onChange={(e) => setDeck((d) => ({ ...d, theme: e.target.value as Theme }))}
            >
              <option value="cinematic">Cinematic</option>
              <option value="broadcast">Broadcast</option>
            </select>
          </label>
          <button type="button" className="present-btn present-btn--ghost" onClick={clearDeck}>
            Clear
          </button>
          <button
            type="button"
            className="present-btn present-btn--primary"
            onClick={startPresenting}
            disabled={deck.slides.length === 0}
          >
            Present ▶
          </button>
        </div>
      </header>

      <div className="present-builder-body">
        <aside className="present-catalog">
          <div className="present-catalog-title">Block catalog</div>
          {CATEGORY_ORDER.map((cat) => {
            const blocks = grouped[cat]
            if (blocks.length === 0) return null
            return (
              <div key={cat} className="present-catalog-group">
                <div className="present-catalog-group-label">{CATEGORY_LABELS[cat]}</div>
                {blocks.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="present-catalog-item"
                    onClick={() => addBlock(b.id)}
                  >
                    <div className="present-catalog-item-label">{b.label}</div>
                    <div className="present-catalog-item-desc">{b.description}</div>
                  </button>
                ))}
              </div>
            )
          })}
          <div className="present-catalog-footnote">
            More categories (standings, highlights, managers, rivalries, draft) light up as data
            blocks are added.
          </div>
        </aside>

        <section className="present-deck">
          <div className="present-deck-title">
            Deck <span className="present-deck-count">{deck.slides.length} slide{deck.slides.length === 1 ? '' : 's'}</span>
          </div>
          {deck.slides.length === 0 ? (
            <div className="present-deck-empty">
              Click a block from the catalog to start your deck.
            </div>
          ) : (
            <ol className="present-deck-list">
              {deck.slides.map((slide, idx) => {
                const def = BLOCK_INDEX[slide.blockId]
                const isSel = slide.id === selectedId
                return (
                  <li
                    key={slide.id}
                    className={`present-deck-item ${isSel ? 'is-selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="present-deck-item-main"
                      onClick={() => setSelectedId(slide.id)}
                    >
                      <span className="present-deck-item-idx">{idx + 1}</span>
                      <span className="present-deck-item-body">
                        <span className="present-deck-item-label">{def?.label ?? slide.blockId}</span>
                        <span className="present-deck-item-preview">
                          {previewText(slide.values) || <em>(no content yet)</em>}
                        </span>
                      </span>
                    </button>
                    <div className="present-deck-item-tools">
                      <button type="button" aria-label="Move up" onClick={() => moveSlide(slide.id, -1)}>↑</button>
                      <button type="button" aria-label="Move down" onClick={() => moveSlide(slide.id, 1)}>↓</button>
                      <button type="button" aria-label="Remove" onClick={() => removeSlide(slide.id)}>✕</button>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <section className="present-inspector">
          <div className="present-inspector-title">Edit slide</div>
          {!selected || !selectedDef ? (
            <div className="present-inspector-empty">Select a slide to edit its content.</div>
          ) : (
            <form className="present-inspector-form" onSubmit={(e) => e.preventDefault()}>
              <div className="present-inspector-blockname">{selectedDef.label}</div>
              <div className="present-inspector-blockdesc">{selectedDef.description}</div>
              {Object.entries(selectedDef.options).map(([key, opt]) => {
                const value = selected.values[key] ?? ''
                if (opt.kind === 'textarea') {
                  return (
                    <label key={key} className="present-field">
                      <span>{opt.label}</span>
                      <textarea
                        rows={opt.rows ?? 4}
                        placeholder={opt.placeholder}
                        value={value}
                        onChange={(e) => updateValue(selected.id, key, e.target.value)}
                      />
                    </label>
                  )
                }
                return (
                  <label key={key} className="present-field">
                    <span>{opt.label}</span>
                    <input
                      type={opt.kind === 'imageUrl' ? 'url' : 'text'}
                      placeholder={opt.placeholder}
                      value={value}
                      onChange={(e) => updateValue(selected.id, key, e.target.value)}
                    />
                  </label>
                )
              })}
            </form>
          )}
        </section>
      </div>

      <footer className="present-builder-footer">
        <Link href={`/league/${slug}`} className="present-builder-back">
          ← Back to {leagueName}
        </Link>
      </footer>
    </div>
  )
}

function previewText(values: Record<string, string>): string {
  const order = ['headline', 'label', 'number', 'body', 'eyebrow', 'caption', 'url', 'subtitle']
  for (const k of order) {
    const v = values[k]
    if (v && v.trim()) return v.length > 60 ? v.slice(0, 60) + '…' : v
  }
  const first = Object.values(values).find((v) => v && v.trim())
  return first ? (first.length > 60 ? first.slice(0, 60) + '…' : first) : ''
}
