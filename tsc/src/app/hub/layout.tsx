import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import '@/styles/hub.css'
import { HubTabs, HubThemeToggle } from './hub-chrome'

export const metadata: Metadata = {
  title: 'The Clubhouse',
  description:
    'The Sunday Chronicle clubhouse — what’s new on the press, the network-wide census, the sitewide Hall of Records, and the Newsstand of public league almanacs.',
}

// Keep this list fresh-ish: it's the slim marquee every Clubhouse page
// carries. New = shipped; Soon = on the bench warming up.
const STRIP_ITEMS = [
  'New · Trade Desk — four rooms: Grader, Analyzer, Finder, Rumor Mill',
  'New · Sunday Live — five-page game-day companion',
  'New · Manager DNA — tendencies + tells, per manager',
  'New · UDFA free tier — one league, forever',
  'Soon · Weekly Recap — Monday-morning paper',
  'Soon · The Field — cross-league player trends',
  'Sleeper · ESPN · Yahoo · NFL.com',
]

// Theme note: night mode is keyed off <html data-hub-theme="night">, set
// pre-paint by a script in the ROOT layout and toggled by HubThemeToggle.
// Nothing theme-related renders here, so client-side navigation can't
// reset it.

// Browsable signed-out: guests see every wing (the data is published-league
// or anonymous-aggregate anyway) with a Login button where members get the
// library shortcut. Per-user touches inside the pages degrade gracefully.
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedIn = !!user

  return (
    <div className="hub-root">

      {/* Ticker rides on top (like the league almanacs) and scrolls away;
          the masthead + tab rail below stick together. */}
      <div className="hub-strip" aria-hidden>
        <div className="hub-strip-track">
          {[0, 1].map((dup) => (
            <div className="hub-strip-group" key={dup}>
              {STRIP_ITEMS.map((t, i) => (
                <span key={`${dup}-${i}`} className="hub-strip-item">
                  <span className="star">★</span> {t}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="hub-topbar">
        <header className="hub-masthead">
          {signedIn ? (
            <Link href="/dashboard" className="hub-masthead-back" aria-label="Back to your library" title="Your library">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {/* bookshelf: two spines + one leaning */}
                <path d="M4 4.5h3.4v15H4z" />
                <path d="M8.6 7h3.4v12.5H8.6z" />
                <path d="M13.7 6.2l3.3-1 4.1 13.9-3.3 1z" />
                <path d="M3 19.5h18.5" />
              </svg>
            </Link>
          ) : (
            <Link href="/login" className="hub-masthead-login">
              Login
            </Link>
          )}
          <div className="hub-masthead-center">
            <div className="hub-masthead-kicker">Vol. II · Members Only</div>
            <div className="hub-masthead-title">The <em>Clubhouse.</em></div>
          </div>
          <div className="hub-masthead-right">
            <HubThemeToggle />
          </div>
        </header>

        <HubTabs />
      </div>

      {children}

      <footer className="hub-footer">
        <em>The Sunday Chronicle</em> · The Clubhouse · Members since kickoff
      </footer>
    </div>
  )
}
