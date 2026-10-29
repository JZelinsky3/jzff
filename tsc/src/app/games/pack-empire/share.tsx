'use client'

import { useState } from 'react'
import { useOrigin } from './clientStore'

/** The link to send, with the phone's own share sheet behind the button and
    a copy to the clipboard where there isn't one. The URL is written out in
    full so it can be copied by hand if both fail. */
export function ShareLink({ path, title, text }: { path: string; title: string; text: string }) {
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
      // Nothing else to try; the link is on screen to copy by hand.
    }
  }

  return (
    <div className="pe-share">
      <code>{url || path}</code>
      <button type="button" className="pe-btn pe-btn--sm" onClick={share}>
        {copied ? 'Copied' : 'Send it'}
      </button>
    </div>
  )
}
