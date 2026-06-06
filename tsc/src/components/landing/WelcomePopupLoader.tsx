'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { WELCOME_VERSION, WELCOME_STORAGE_KEY } from './welcomeMeta'

// Client-only wrapper that lazy-loads the heavy WelcomePopup module
// (~600 lines, eight inline SVGs) off the landing's critical path.
//
// Returning visitors who've already dismissed the current version see an
// inline ★ reopen button — the popup module is only fetched if they
// actually click to reopen. First-time / version-bumped visitors load it
// immediately so the popup can show on first paint.

const WelcomePopup = dynamic(
  () => import('./WelcomePopup').then((m) => m.WelcomePopup),
  { ssr: false },
)

type Phase = 'pending' | 'auto-show' | 'reopen-only' | 'force-show'

export function WelcomePopupLoader({ signedIn }: { signedIn: boolean }) {
  const [phase, setPhase] = useState<Phase>('pending')

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(WELCOME_STORAGE_KEY)
      setPhase(dismissed === WELCOME_VERSION ? 'reopen-only' : 'auto-show')
    } catch {
      // localStorage blocked — fall through to show. The full popup will
      // handle its own dismissal flow on click.
      setPhase('auto-show')
    }
  }, [])

  if (phase === 'pending') return null
  if (phase === 'auto-show') return <WelcomePopup signedIn={signedIn} />
  if (phase === 'force-show') return <WelcomePopup signedIn={signedIn} forceOpen />
  // Tiny inline reopen button — same class/markup the heavy module would
  // render once dismissed. Clicking flips us into 'force-show' which
  // triggers the dynamic import and bypasses the localStorage gate.
  return (
    <button
      type="button"
      className="lp-welcome-reopen"
      onClick={() => setPhase('force-show')}
      aria-label="Reopen what's new"
      title="What's new"
    >
      <span aria-hidden>★</span>
    </button>
  )
}
