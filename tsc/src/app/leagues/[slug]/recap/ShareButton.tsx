'use client'

import { useState } from 'react'

// The phone's own share sheet where there is one (that's where the group chat
// is), otherwise copy the link.
export function ShareButton({ url, title, className }: { url: string; title: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
      setTimeout(() => setState('idle'), 2200)
    } catch {
      setState('failed')
    }
  }

  async function onClick() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
        return
      } catch (e) {
        // Closing the sheet is not a failure.
        if ((e as Error).name === 'AbortError') return
      }
    }
    await copy()
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {state === 'copied' ? 'Link copied' : state === 'failed' ? 'Copy the link from the address bar' : 'Send to the group chat'}
    </button>
  )
}
