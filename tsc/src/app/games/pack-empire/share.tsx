'use client'

import { useState } from 'react'
import { useOrigin } from './clientStore'

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

/** A result's button: the score's own link behind a plain Share. */
export function ShareButton({
  path,
  title = 'Pack Empire',
  text,
  className = 'pe-btn pe-btn--ghost',
}: {
  path: string
  title?: string
  text: string
  className?: string
}) {
  const { copied, share } = useShare(path, title, text)
  return (
    <button type="button" className={className} onClick={share}>
      {copied ? 'Copied' : 'Share'}
    </button>
  )
}

/** The link to send, written out in full so it can be copied by hand if the
    button fails. */
export function ShareLink({ path, title, text }: { path: string; title: string; text: string }) {
  const { url, copied, share } = useShare(path, title, text)

  return (
    <div className="pe-share">
      <code>{url || path}</code>
      <button type="button" className="pe-btn pe-btn--sm" onClick={share}>
        {copied ? 'Copied' : 'Send it'}
      </button>
    </div>
  )
}
