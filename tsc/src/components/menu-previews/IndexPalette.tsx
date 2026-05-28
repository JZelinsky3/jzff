'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// Option E — Index palette. Small "Index ⌘K" trigger in the masthead;
// click or hit ⌘K from anywhere to open a centered overlay with a
// search input + grouped destinations. Arrow keys + Enter navigate.
// ESC closes. Modeled after Linear / Notion / Vercel command palettes.

type Item = { group: string; label: string; href: string }

const ITEMS: Item[] = [
  { group: 'Library', label: 'Your leagues', href: '#' },
  { group: 'Library', label: 'New archive', href: '#' },
  { group: 'Account', label: 'Profile & subscription', href: '#' },
  { group: 'Pages', label: 'Pricing', href: '#' },
  { group: 'Chapters', label: 'Standings', href: '#' },
  { group: 'Chapters', label: 'Seasons', href: '#' },
  { group: 'Chapters', label: 'Drafts', href: '#' },
  { group: 'Chapters', label: 'Records', href: '#' },
  { group: 'Chapters', label: 'Managers', href: '#' },
  { group: 'Chapters', label: 'Rivalries', href: '#' },
  { group: 'Chapters', label: "Pick'ems", href: '#' },
  { group: 'Chapters', label: 'Power Rankings', href: '#' },
]

export function IndexPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Centralize "open" so query/active reset happens before the effect runs.
  // (Resetting inside useEffect[open] tripped the set-state-in-effect lint.)
  const openPalette = () => {
    setQ('')
    setActive(0)
    setOpen(true)
  }

  // ⌘K from anywhere on the page opens; ESC closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (open) setOpen(false)
        else openPalette()
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Focus the input shortly after the palette mounts.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open])

  const filtered = useMemo(
    () =>
      q.trim()
        ? ITEMS.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()))
        : ITEMS,
    [q],
  )

  // Group filtered items while preserving the flat order for keyboard nav.
  const grouped = useMemo(() => {
    const out = new Map<string, Item[]>()
    for (const it of filtered) {
      if (!out.has(it.group)) out.set(it.group, [])
      out.get(it.group)!.push(it)
    }
    return Array.from(out.entries())
  }, [filtered])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      // In production this would navigate to filtered[active].href.
      setOpen(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="mp-palette-trigger"
        onClick={openPalette}
        aria-label="Open the chronicle index"
      >
        <span className="mp-palette-search-icon" aria-hidden="true">⌕</span>
        Index
        <kbd className="mp-palette-kbd">⌘K</kbd>
      </button>

      {open && (
        <>
          <div
            className="mp-palette-backdrop"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="mp-palette" role="dialog" aria-label="Index">
            <div className="mp-palette-input-wrap">
              <span className="mp-palette-search-icon" aria-hidden="true">⌕</span>
              <input
                ref={inputRef}
                type="text"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onKeyDown}
                placeholder="Search the chronicle…"
                className="mp-palette-input"
                aria-label="Search the chronicle"
              />
              <kbd className="mp-palette-esc">esc</kbd>
            </div>

            <div className="mp-palette-results">
              {grouped.length === 0 && (
                <div className="mp-palette-empty">No matches in the chronicle.</div>
              )}
              {grouped.map(([group, items]) => (
                <div key={group} className="mp-palette-group">
                  <div className="mp-palette-group-label">{group}</div>
                  {items.map((it) => {
                    const flatIdx = filtered.indexOf(it)
                    return (
                      <a
                        key={it.label}
                        href={it.href}
                        className={`mp-palette-item${flatIdx === active ? ' is-active' : ''}`}
                        onMouseEnter={() => setActive(flatIdx)}
                        onClick={(e) => {
                          e.preventDefault()
                          setOpen(false)
                        }}
                      >
                        <span className="mp-palette-item-label">{it.label}</span>
                        <span className="mp-palette-item-group">{it.group}</span>
                      </a>
                    )
                  })}
                </div>
              ))}
            </div>

            <div className="mp-palette-foot">
              <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
              <span><kbd>↵</kbd> select</span>
              <span><kbd>esc</kbd> close</span>
            </div>
          </div>
        </>
      )}
    </>
  )
}
