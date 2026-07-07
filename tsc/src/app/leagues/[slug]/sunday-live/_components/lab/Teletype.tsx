'use client'

// CONCEPT: the storyline feed as a wire-service teletype. Copy already on the
// wire when you arrive is simply there, printed; only bulletins that LAND
// while you're watching type themselves out character by character. (On the
// bench, scrub the Sunday slider forward: the new lines are the ones that
// print.) The one place on the network where the page goes full cream.

import { useEffect, useState } from 'react'
import type { SlLeague } from '@/lib/sundayLive/types'

const CHAR_MS = 14

type WireLine = { kicker: string; copy: string }

function linesOf(frame: SlLeague): WireLine[] {
  return frame.storylines.slice(0, 12).map((s) => ({
    kicker: `BULLETIN · ${s.kind.replace(/-/g, ' ').toUpperCase()}`,
    copy: s.subline ? `${s.headline} ${s.subline}` : s.headline,
  }))
}

export function Teletype({ frame }: { frame: SlLeague }) {
  const lines = linesOf(frame)

  // Copy present at mount is pre-printed; only later arrivals get typed.
  const [printed, setPrinted] = useState<Set<string>>(() => new Set(lines.map((l) => l.copy)))
  // Print-head position, tagged with the copy it belongs to so a new bulletin
  // starts from zero without any effect-body setState.
  const [head, setHead] = useState<{ forKey: string; typed: number }>({ forKey: '', typed: 0 })

  const queue = lines.filter((l) => !printed.has(l.copy))
  const currentKey = queue[0]?.copy ?? ''
  const typed = currentKey && head.forKey === currentKey ? head.typed : 0

  useEffect(() => {
    if (!currentKey) return
    const id = setInterval(() => {
      setHead((h) => {
        const n = h.forKey === currentKey ? h.typed : 0
        if (n >= currentKey.length) return h
        return { forKey: currentKey, typed: n + 1 }
      })
    }, CHAR_MS)
    return () => clearInterval(id)
  }, [currentKey])

  // A finished line settles onto the page, then the head moves to the next.
  useEffect(() => {
    if (!currentKey || typed < currentKey.length) return
    const t = setTimeout(() => {
      setPrinted((p) => new Set(p).add(currentKey))
    }, 500)
    return () => clearTimeout(t)
  }, [currentKey, typed])

  const visible = lines.filter((l) => printed.has(l.copy) || l.copy === currentKey)

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="lab-paper px-10 py-8">
        <div className="border-b-2 border-double border-[#2a2318]/50 pb-3 text-center">
          <div className="sl-num text-[11px] tracking-[0.3em]">THE SUNDAY WIRE</div>
          <div className="sl-num mt-1 text-[10px] tracking-[0.18em] opacity-70">
            {frame.league.name.toUpperCase()} · WEEK {frame.league.week} · BULLETINS PRINT AS THEY LAND
          </div>
        </div>
        {visible.length === 0 ? (
          <p className="sl-num py-10 text-center text-[12px] opacity-60">
            THE WIRE IS QUIET. HOLD FOR BULLETINS.
          </p>
        ) : (
          <div className="space-y-5 pt-5">
            {visible.map((l) => {
              const isTyping = l.copy === currentKey && !printed.has(l.copy)
              const shown = isTyping ? l.copy.slice(0, typed) : l.copy
              return (
                <div key={l.copy}>
                  <div className="sl-num text-[10px] font-bold tracking-[0.2em] opacity-70">
                    {l.kicker}
                  </div>
                  <p className="sl-num mt-1 text-[13.5px] leading-relaxed whitespace-pre-wrap">
                    {shown.toUpperCase()}
                    {isTyping && <span className="lab-caret ml-0.5" />}
                  </p>
                </div>
              )
            })}
            {!currentKey && (
              <div className="sl-num pt-2 text-[10px] tracking-[0.25em] opacity-60">
                STANDING BY <span className="lab-caret ml-1" />
              </div>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-sl-dim">
        Scrub the Sunday slider forward: only newly landed bulletins type out.
      </p>
    </div>
  )
}
