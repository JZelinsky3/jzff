'use client'

import { useState } from 'react'

// Copies the absolute URL, since the point is pasting it into a text.
export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      onClick={() => {
        const url = `${window.location.origin}${path}`
        navigator.clipboard.writeText(url).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
      style={{
        padding: '7px 12px',
        border: '1px solid #a88a4a',
        background: 'transparent',
        borderRadius: 6,
        color: '#e8c889',
        fontSize: 11,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        font: 'inherit',
        fontWeight: 700,
      }}
    >
      {copied ? 'Copied' : 'Copy link'}
    </button>
  )
}
