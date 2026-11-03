'use client'

import { useState, type ReactNode } from 'react'
import { useOrigin } from './clientStore'

const GLYPHS = {
  share: (
    <>
      <circle cx="17" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="17" cy="18.5" r="2.5" />
      <path d="M8.2 10.8 14.8 6.7M8.2 13.2l6.6 4.1" />
    </>
  ),
  link: <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L11.7 6M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5" />,
  friend: (
    <>
      <circle cx="9.5" cy="8" r="3.5" />
      <path d="M3 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M19 8v6M16 11h6" />
    </>
  ),
  again: <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7M20 4v4.7h-4.7M20 12a8 8 0 0 1-13.7 5.6L4 15.3M4 20v-4.7h4.7" />,
  done: <path d="m5 12.5 4.5 4.5L19 7.5" />,
} as const

export type Glyph = keyof typeof GLYPHS

/** The stroke icons on the in-game chips. */
export function ChipGlyph({ name }: { name: Glyph }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {GLYPHS[name]}
    </svg>
  )
}

/** Sending the game out: the icon in its coin, ticked once it's done. A plain Share
    goes without one (Joey: the share mark read oddly), and turns green when copied. */
export function SocialChip({
  icon = null,
  done = false,
  small = false,
  onClick,
  disabled,
  children,
}: {
  icon?: Glyph | null
  done?: boolean
  small?: boolean
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`pe-act pe-act--social${icon ? '' : ' pe-act--bare'}${small ? ' pe-act--sm' : ''}`}
      data-done={done ? '' : undefined}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && (
        <span className="pe-act-coin">
          <ChipGlyph name={done ? 'done' : icon} />
        </span>
      )}
      {children}
    </button>
  )
}

/** The phone's own share sheet, or a copy to the clipboard where there isn't
    one. A link preview is what sells it, so nothing but the URL is needed. */
function useShare(path: string, title: string, text: string) {
  const [copied, setCopied] = useState(false)
  const origin = useOrigin()
  const url = `${origin}${path}`

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url })
        return
      }
    } catch {
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Nothing else to try.
    }
  }

  return { url, copied, share }
}

/** A result's button: the score's own link behind a plain Share. `plain` is the
    quiet one, a text link with the share mark, for a line that's already busy. */
export function ShareButton({
  path,
  title = 'Pack Empire',
  text,
  plain = false,
}: {
  path: string
  title?: string
  text: string
  plain?: boolean
}) {
  const { copied, share } = useShare(path, title, text)
  if (plain) {
    return (
      <button type="button" className="pe-share-plain" data-done={copied ? '' : undefined} onClick={share}>
        <ChipGlyph name={copied ? 'done' : 'share'} />
        {copied ? 'Copied' : 'Share'}
      </button>
    )
  }
  return (
    <SocialChip done={copied} onClick={share}>
      {copied ? 'Copied' : 'Share'}
    </SocialChip>
  )
}

/** The link to send, written out in full so it can be copied by hand if the
    button fails. */
export function ShareLink({ path, title, text }: { path: string; title: string; text: string }) {
  const { url, copied, share } = useShare(path, title, text)

  return (
    <div className="pe-share">
      <code>{url || path}</code>
      <SocialChip icon="link" done={copied} onClick={share}>
        {copied ? 'Copied' : 'Send it'}
      </SocialChip>
    </div>
  )
}
