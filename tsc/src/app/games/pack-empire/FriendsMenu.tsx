'use client'

// Friends on the desktop nav. Hovering shows who you have and your record
// against each; clicking goes to the whole list on the profile, the same as
// it did before this existed. The list loads on the first hover rather than
// with the page, since most page views never open it.

import Link from 'next/link'
import { useState } from 'react'
import { h2hLine } from '@/components/account/h2h'
import type { FriendsBrief } from '@/lib/friends'

const FRIENDS = '/account/#friends'

export function FriendsMenu({ children }: { children: React.ReactNode }) {
  const [brief, setBrief] = useState<FriendsBrief | 'loading' | 'failed' | null>(null)

  const load = async () => {
    if (brief === 'loading' || (brief && brief !== 'failed')) return
    setBrief('loading')
    try {
      const res = await fetch('/api/friends/?brief=1')
      const body = await res.json().catch(() => null)
      setBrief(res.ok && body?.brief ? (body.brief as FriendsBrief) : 'failed')
    } catch {
      setBrief('failed')
    }
  }

  return (
    <div className="pe-fm" onMouseEnter={load} onFocus={load}>
      <Link href={FRIENDS} className="pe-nav-tool">
        {children}
      </Link>
      <div className="pe-fm-drop">
        <div className="pe-fm-panel">
          <div className="pe-fm-head">
            <span>Your Friends</span>
            {brief && typeof brief === 'object' && <em>{brief.friends.length}</em>}
          </div>

          {brief === 'loading' && <p className="pe-fm-note">Loading</p>}
          {brief === 'failed' && <p className="pe-fm-note">Couldn&apos;t load your friends just now.</p>}

          {brief && typeof brief === 'object' && (
            <>
              {brief.waiting > 0 && (
                <Link href={FRIENDS} className="pe-fm-waiting">
                  {brief.waiting} waiting on you
                </Link>
              )}
              {brief.friends.length === 0 ? (
                <p className="pe-fm-note">Nobody yet. Your invite link is on your profile.</p>
              ) : (
                <ul className="pe-fm-list">
                  {brief.friends.map((f) => {
                    const h = h2hLine(f.h2h)
                    return (
                      <li key={f.id}>
                        <span className="pe-fm-mono" aria-hidden>
                          {(f.name.trim()[0] ?? '?').toUpperCase()}
                        </span>
                        <span className="pe-fm-name">{f.name}</span>
                        <span className={`pe-fm-rec${h.tone ? ` ${h.tone}` : ''}`}>{h.text}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}

          <Link href={FRIENDS} className="pe-fm-all">
            View all friends
          </Link>
        </div>
      </div>
    </div>
  )
}
