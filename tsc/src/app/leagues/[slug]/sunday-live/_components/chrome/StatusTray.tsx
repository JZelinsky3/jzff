'use client'

// "updated 12s ago" + error notice. The age is only rendered after mount (the
// server can't know how old the frame will be when the client wakes up, and
// guessing caused hydration mismatches); a 5s heartbeat keeps it honest
// without the whole desk re-rendering.

import { useEffect, useState } from 'react'
import { useSl } from '../SlProvider'
import { fmtSince } from '../../_lib/format'

export function StatusTray() {
  const { health } = useSl()
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = setInterval(tick, 5_000)
    return () => clearInterval(id)
  }, [])

  if (health.status === 'error') {
    return (
      <span className="sl-chip border-sl-down/50 text-sl-down" title="Retrying with backoff">
        FEED RETRY
      </span>
    )
  }
  return (
    <span className="sl-num inline-block min-w-[52px] text-[11px] text-sl-dim" title="Time since the last data frame">
      {now != null ? `upd ${fmtSince(health.lastOkAt, now)}` : ''}
    </span>
  )
}
