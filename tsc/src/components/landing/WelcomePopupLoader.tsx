'use client'

import dynamic from 'next/dynamic'

// Client-only wrapper so `dynamic({ ssr: false })` can defer the heavy
// popup module off the landing page's critical path. Server Components
// (the landing page) can't use `ssr: false` directly — this thin client
// boundary is the official escape hatch.
const WelcomePopup = dynamic(
  () => import('./WelcomePopup').then((m) => m.WelcomePopup),
  { ssr: false },
)

export function WelcomePopupLoader({ signedIn }: { signedIn: boolean }) {
  return <WelcomePopup signedIn={signedIn} />
}
