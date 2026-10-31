'use client'

// The red circle on Friends: challenges and friend requests waiting on you.
// Asked for in the browser rather than on every page's render, since the
// masthead sits on pages that don't otherwise touch the database, and held a
// minute so moving around the game doesn't re-ask each time.

import { useEffect, useState } from 'react'

const HOLD_MS = 60_000

let known: { count: number; at: number } | null = null

export function WaitingBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (known && Date.now() - known.at < HOLD_MS) {
      const held = known.count
      const t = window.setTimeout(() => setCount(held), 0)
      return () => window.clearTimeout(t)
    }
    let gone = false
    fetch('/api/friends/?waiting=1', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (gone || typeof body?.waiting !== 'number') return
        known = { count: body.waiting, at: Date.now() }
        setCount(body.waiting)
      })
      .catch(() => {})
    return () => {
      gone = true
    }
  }, [])

  if (count === 0) return null
  return (
    <span className="pe-noti" role="status" aria-label={`${count} waiting on you`}>
      {count > 9 ? '9+' : count}
    </span>
  )
}
