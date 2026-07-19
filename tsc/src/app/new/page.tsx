import { redirect } from 'next/navigation'

// The broadsheet landing developed here was promoted to the homepage on
// 2026-07-19 (component now at src/components/landing/NewLanding.tsx).
// Keep /new alive as a redirect so shared links and muscle memory land
// on the real thing.
export default function NewLandingAlias() {
  redirect('/')
}
