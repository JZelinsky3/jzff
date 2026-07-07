'use client'

import { useEffect, useState } from 'react'

// "On this page" rail for guide articles. Builds itself from the rendered
// .guide-h2 headings after mount (assigning anchor ids where missing), so
// no guide has to declare a TOC by hand. Highlights the section currently
// in view via IntersectionObserver. Renders nothing for short pieces.

export function GuideToc() {
  const [items, setItems] = useState<{ id: string; text: string }[]>([])
  const [active, setActive] = useState('')

  useEffect(() => {
    const heads = Array.from(
      document.querySelectorAll<HTMLHeadingElement>('.guide-article .guide-h2')
    )
    const list = heads.map((h, i) => {
      if (!h.id) {
        const slug = (h.textContent ?? '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60)
        h.id = slug || `section-${i + 1}`
      }
      return { id: h.id, text: h.textContent ?? '' }
    })
    setItems(list)

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive((e.target as HTMLElement).id)
        }
      },
      { rootMargin: '-15% 0px -75% 0px' }
    )
    heads.forEach((h) => obs.observe(h))
    return () => obs.disconnect()
  }, [])

  if (items.length < 2) return null

  return (
    <nav className="guide-toc" aria-label="On this page">
      <div className="guide-toc-kicker">On this page</div>
      <ol>
        {items.map((it, i) => (
          <li key={it.id}>
            <a href={`#${it.id}`} className={active === it.id ? 'is-active' : undefined}>
              <span className="guide-toc-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="guide-toc-text">{it.text}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
