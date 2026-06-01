'use client'

// Source toggle — shared by the Trade Desk and Scout chapters.
//
// URL-driven so server re-renders pick up the choice cleanly. Click pushes
// `?source=<id>` (preserving other params); the parent server page reads it
// from searchParams and re-valuates. No client-side state needed.

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { AvailableSource } from '@/lib/values'

const STYLES = `
.src-toggle { display: flex; flex-direction: column; gap: .55rem; padding: 1rem 1.1rem; background: var(--ink-card); border: 1px solid var(--ink-line); border-left: 3px solid var(--gold); margin-bottom: 1.5rem; }
.src-toggle-row { display: flex; flex-wrap: wrap; gap: .4rem; }
.src-toggle-label { font-family: var(--mono); font-weight: 700; font-size: .55rem; letter-spacing: .28em; text-transform: uppercase; color: var(--gold); }
.src-toggle-pill { font-family: var(--mono); font-weight: 700; font-size: .65rem; letter-spacing: .12em; text-transform: uppercase; padding: .42rem .8rem; border: 1px solid var(--ink-line); color: var(--cream-mute); text-decoration: none; transition: background .15s, color .15s, border-color .15s; }
.src-toggle-pill:hover { color: var(--gold); border-color: var(--gold-deep); }
.src-toggle-pill.active { background: var(--gold); color: var(--ink); border-color: var(--gold); }
.src-toggle-pill.disabled { color: var(--cream-mute); opacity: .45; pointer-events: none; }
.src-toggle-note { font-family: var(--serif); font-style: italic; font-size: .78rem; color: var(--cream-mute); }
`

export function SourceToggle({
  active,
  options,
}: {
  active: string
  options: AvailableSource[]
}) {
  const pathname = usePathname() || ''
  const params = useSearchParams()

  const buildHref = (id: string) => {
    const next = new URLSearchParams(params?.toString() ?? '')
    if (id === 'consensus') {
      next.delete('source')   // consensus is the default — keep URL clean
    } else {
      next.set('source', id)
    }
    const qs = next.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="src-toggle">
        <div className="src-toggle-label">Values · pick a source</div>
        <div className="src-toggle-row">
          {options.map((opt) => {
            const isActive = opt.id === active
            const className = [
              'src-toggle-pill',
              isActive ? 'active' : '',
              !opt.configured ? 'disabled' : '',
            ].filter(Boolean).join(' ')
            if (!opt.configured) {
              return <span key={opt.id} className={className} title="Not configured">{opt.label}</span>
            }
            return (
              <Link key={opt.id} href={buildHref(opt.id)} className={className} scroll={false}>
                {opt.label}
              </Link>
            )
          })}
        </div>
        <div className="src-toggle-note">
          Consensus averages every configured source for this league&apos;s mode. Pick a single provider to spot-check what one grader thinks on its own.
        </div>
      </div>
    </>
  )
}
