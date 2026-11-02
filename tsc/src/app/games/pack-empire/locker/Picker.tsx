'use client'

// A dropdown that's ours from top to bottom. A native <select> draws itself: on an
// iPhone that's the system's own box and sheet whatever the CSS says, which is why they
// never matched the room. This opens under its button on a desktop and as a sheet from
// the bottom on a phone. It's portalled out to <main> so the tokens still reach it and
// nothing on the page can clip it or sit over it.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type PickerOption = { id: string; label: string; note?: string }
export type PickerGroup = { label?: string; options: PickerOption[] }

export function Picker({ value, groups, onChange, label, prefix }: { value: string; groups: PickerGroup[]; onChange: (id: string) => void; label: string; prefix?: string }) {
  const [host, setHost] = useState<Element | null>(null)
  const open = !!host
  const [at, setAt] = useState({ x: 0, y: 0 })
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const options = groups.flatMap((g) => g.options)
  const current = options.find((o) => o.id === value)

  const close = () => {
    setHost(null)
    button.current?.focus()
  }

  const show = () => {
    const box = button.current?.getBoundingClientRect()
    if (box) setAt({ x: Math.max(8, Math.min(box.left, window.innerWidth - 248)), y: box.bottom + 6 })
    setHost(button.current?.closest('main') ?? document.body)
  }

  useEffect(() => {
    if (!open) return
    const on = list.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.current?.querySelector<HTMLElement>('button')
    on?.focus()
    on?.scrollIntoView({ block: 'nearest' })
    const leave = () => setHost(null)
    window.addEventListener('resize', leave)
    return () => window.removeEventListener('resize', leave)
  }, [open])

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return close()
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const all = [...(list.current?.querySelectorAll<HTMLElement>('button') ?? [])]
    const here = all.indexOf(document.activeElement as HTMLElement)
    all[(here + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus()
  }

  return (
    <>
      <button ref={button} type="button" className="pe-lkpick" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${current?.label ?? ''}`} onClick={show}>
        {prefix && <small>{prefix}</small>}
        <b>{current?.label}</b>
        <svg viewBox="0 0 12 8" width="10" height="7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m1 1.500 5 5 5-5" />
        </svg>
      </button>
      {host &&
        createPortal(
          <div className="pe-lkpick-layer" onClick={(e) => e.target === e.currentTarget && close()} onKeyDown={keys}>
            <div ref={list} className="pe-lkpick-list" role="listbox" aria-label={label} style={{ '--x': `${at.x}px`, '--y': `${at.y}px` } as React.CSSProperties}>
              {groups.map((g, i) => (
                <div key={g.label ?? i} role="group" aria-label={g.label}>
                  {g.label && <div className="pe-lkpick-group">{g.label}</div>}
                  {g.options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="option"
                      aria-selected={o.id === value}
                      onClick={() => {
                        onChange(o.id)
                        close()
                      }}
                    >
                      <span>{o.label}</span>
                      {o.note && <small>{o.note}</small>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>,
          host
        )}
    </>
  )
}
