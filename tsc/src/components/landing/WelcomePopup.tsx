'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// Bump WELCOME_VERSION when the slides below change in a way that
// readers should see again. Cosmetic/typo fixes — leave it alone, the
// popup stays dismissed for returning visitors. Material additions
// (new feature slides, reordered narrative) — bump it, and everyone
// sees the popup once on their next landing.
const WELCOME_VERSION = '2026-06-05-8'
const STORAGE_KEY = 'tsc-welcome-dismissed-v'

const PROMO_CODE = 'FIRST50'
const PROMO_TAGLINE = '50% off your first issue'

type FeatureSlide = {
  kind: 'feature'
  badge: string
  kicker: string
  title: React.ReactNode
  body: React.ReactNode
  hero: React.ReactNode
}

type Slide =
  | { kind: 'greet' }
  | FeatureSlide
  | { kind: 'promo' }
  | { kind: 'closing' }

// ── Hero illustrations (one per slide) ──────────────────────────────
// Inline SVGs kept here so each is self-contained and the popup has no
// external image dependency. Almanac/editorial aesthetic — warm gold +
// deep ink on parchment.
function GreetHero() {
  return (
    <svg viewBox="0 0 360 220" className="lp-welcome-hero-svg" aria-hidden>
      <defs>
        <linearGradient id="grHeroSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1410" />
          <stop offset="1" stopColor="#3a2a1a" />
        </linearGradient>
      </defs>
      {/* night sky panel */}
      <rect x="20" y="20" width="320" height="180" rx="6" fill="url(#grHeroSky)" />
      {/* stars */}
      {[[40,40,2],[80,30,1.4],[120,50,2.2],[170,28,1.6],[220,42,2],[270,32,1.4],[310,50,1.8],[50,80,1.4],[140,90,2.2],[200,76,1.6],[280,84,1.4],[100,140,1.8],[180,130,2.4],[260,150,1.6],[320,138,1.4],[60,170,1.6],[160,180,2],[240,170,1.4],[300,180,1.8]].map(([x,y,r],i)=>(
        <circle key={i} cx={x as number} cy={y as number} r={r as number} fill="#e8c889" opacity={(i%3===0)?0.9:(i%2===0)?0.6:0.35} />
      ))}
      {/* big rising star */}
      <g transform="translate(180 118)">
        <circle r="44" fill="#e8c889" opacity=".08" />
        <circle r="28" fill="#e8c889" opacity=".15" />
        <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z" fill="#e8c889" />
      </g>
      {/* horizon rule */}
      <path d="M20 200 L340 200" stroke="#e8c889" strokeWidth=".8" opacity=".5" />
      {/* corner ornaments */}
      <path d="M20 20 L20 32 M20 20 L32 20" stroke="#e8c889" strokeWidth="1" />
      <path d="M340 20 L340 32 M340 20 L328 20" stroke="#e8c889" strokeWidth="1" />
      <path d="M20 200 L20 188 M20 200 L32 200" stroke="#e8c889" strokeWidth="1" />
      <path d="M340 200 L340 188 M340 200 L328 200" stroke="#e8c889" strokeWidth="1" />
      {/* masthead text */}
      <text x="180" y="60" fontFamily="Georgia, serif" fontSize="11" letterSpacing="3" fill="#e8c889" textAnchor="middle" opacity=".75">VOL. II · EST. 2026</text>
      <text x="180" y="184" fontFamily="Georgia, serif" fontSize="9" letterSpacing="4" fill="#e8c889" textAnchor="middle" opacity=".6">THE SUNDAY CHRONICLE</text>
    </svg>
  )
}

function UdfaHero() {
  return (
    <svg viewBox="0 0 360 220" className="lp-welcome-hero-svg" aria-hidden>
      {/* parchment ticket */}
      <defs>
        <linearGradient id="udfaParch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0e2c2" />
          <stop offset="1" stopColor="#dcc89c" />
        </linearGradient>
      </defs>
      {/* perforated edges */}
      {[...Array(14)].map((_, i) => (
        <circle key={`l${i}`} cx={60} cy={36 + i * 12} r={3} fill="#1b1612" opacity=".08" />
      ))}
      {[...Array(14)].map((_, i) => (
        <circle key={`r${i}`} cx={300} cy={36 + i * 12} r={3} fill="#1b1612" opacity=".08" />
      ))}
      <rect x="70" y="28" width="220" height="164" rx="8" fill="url(#udfaParch)" stroke="#a04830" strokeDasharray="3 3" strokeWidth="1.4" />
      {/* trophy ribbon */}
      <g transform="translate(180 90)">
        <circle r="38" fill="none" stroke="#a04830" strokeWidth="1.6" />
        <circle r="30" fill="none" stroke="#a04830" strokeWidth=".8" strokeDasharray="2 3" />
        <text y="6" fontFamily="Georgia, serif" fontSize="22" fontStyle="italic" fontWeight="700" fill="#a04830" textAnchor="middle">FREE</text>
      </g>
      {/* ribbon tails */}
      <path d="M150 130 L180 116 L210 130 L210 158 L195 148 L180 158 L165 148 L150 158 Z" fill="#a04830" />
      <text x="180" y="184" fontFamily="ui-monospace, monospace" fontSize="9" letterSpacing="3" fill="#1b1612" textAnchor="middle" opacity=".7">UDFA · ONE LEAGUE · FOREVER</text>
    </svg>
  )
}

function LiveHero() {
  return (
    <svg viewBox="0 0 360 220" className="lp-welcome-hero-svg" aria-hidden>
      {/* stadium silhouette under stadium lights */}
      <defs>
        <radialGradient id="liveLight" cx="50%" cy="0%" r="80%">
          <stop offset="0" stopColor="#e8c889" stopOpacity=".55" />
          <stop offset="1" stopColor="#e8c889" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="360" height="220" fill="#1a1410" />
      {/* light flares */}
      <ellipse cx="80" cy="0" rx="80" ry="120" fill="url(#liveLight)" />
      <ellipse cx="280" cy="0" rx="80" ry="120" fill="url(#liveLight)" />
      {/* light towers */}
      <path d="M70 80 L90 80 L92 30 L68 30 Z" fill="#e8c889" opacity=".9" />
      <path d="M270 80 L290 80 L292 30 L268 30 Z" fill="#e8c889" opacity=".9" />
      <line x1="80" y1="80" x2="80" y2="200" stroke="#e8c889" strokeWidth="2" />
      <line x1="280" y1="80" x2="280" y2="200" stroke="#e8c889" strokeWidth="2" />
      {/* field — perspective trapezoid */}
      <path d="M40 200 L320 200 L260 130 L100 130 Z" fill="#0f2418" stroke="#3a6b3a" strokeWidth="1.2" />
      <path d="M100 130 L260 130" stroke="#e8c889" strokeWidth=".6" opacity=".4" />
      <path d="M70 200 L290 200" stroke="#e8c889" strokeWidth=".6" opacity=".4" />
      {/* midfield star */}
      <g transform="translate(180 165)">
        <path d="M0 -8 L2.4 -2.4 L8 0 L2.4 2.4 L0 8 L-2.4 2.4 L-8 0 L-2.4 -2.4 Z" fill="#e8c889" />
      </g>
      {/* scoreboard */}
      <rect x="148" y="48" width="64" height="32" fill="#0a0a0a" stroke="#e8c889" strokeWidth="1" />
      <text x="180" y="65" fontFamily="ui-monospace, monospace" fontSize="8" fill="#e8c889" textAnchor="middle" letterSpacing="2">SUNDAY</text>
      <text x="180" y="76" fontFamily="ui-monospace, monospace" fontSize="9" fill="#e8c889" textAnchor="middle" fontWeight="700" letterSpacing="3">1:00 ET</text>
    </svg>
  )
}

function ManagerHero() {
  return (
    <svg viewBox="0 0 360 220" className="lp-welcome-hero-svg" aria-hidden>
      <rect x="0" y="0" width="360" height="220" fill="#f4ead0" />
      {/* stack of six bound books — one per Manager Hub issue */}
      {[
        { y: 180, w: 220, h: 16, c: '#1a3a5c', label: 'I · DYNASTY' },
        { y: 162, w: 210, h: 16, c: '#5c1a2a', label: 'II · WIRE' },
        { y: 144, w: 230, h: 16, c: '#2a4a2a', label: 'III · RECORDS' },
        { y: 126, w: 215, h: 16, c: '#5c3a1a', label: 'IV · RIVALRIES' },
        { y: 108, w: 225, h: 16, c: '#3a2a5c', label: 'V · LEGACY' },
        { y: 90,  w: 200, h: 16, c: '#5c4a1a', label: 'VI · FUTURE' },
      ].map((b, i) => (
        <g key={i}>
          <rect x={(360 - b.w) / 2} y={b.y} width={b.w} height={b.h} fill={b.c} stroke="#1a1410" strokeWidth=".8" />
          {/* spine bands */}
          <rect x={(360 - b.w) / 2 + 4} y={b.y + 4} width={b.w - 8} height="1" fill="#e8c889" opacity=".7" />
          <rect x={(360 - b.w) / 2 + 4} y={b.y + b.h - 5} width={b.w - 8} height="1" fill="#e8c889" opacity=".7" />
          <text x="180" y={b.y + 11} fontFamily="Georgia, serif" fontSize="8" fill="#e8c889" textAnchor="middle" letterSpacing="2">{b.label}</text>
        </g>
      ))}
      {/* shelf */}
      <path d="M40 200 L320 200" stroke="#1a1410" strokeWidth="1.4" />
      <path d="M40 200 L60 210 L320 210 L320 200" stroke="#1a1410" strokeWidth=".8" fill="#d4c08c" />
      {/* nameplate */}
      <rect x="140" y="40" width="80" height="32" fill="none" stroke="#a04830" strokeWidth="1.2" />
      <text x="180" y="55" fontFamily="Georgia, serif" fontSize="9" fill="#a04830" textAnchor="middle" letterSpacing="3">MANAGER</text>
      <text x="180" y="66" fontFamily="Georgia, serif" fontSize="11" fontStyle="italic" fontWeight="700" fill="#a04830" textAnchor="middle">Hub.</text>
    </svg>
  )
}

function PlatformsHero() {
  return (
    <svg viewBox="0 0 360 220" className="lp-welcome-hero-svg" aria-hidden>
      <rect x="0" y="0" width="360" height="220" fill="#1a1410" />
      {/* central chronicle book */}
      <g transform="translate(180 110)">
        <rect x="-32" y="-44" width="64" height="88" fill="#a04830" stroke="#e8c889" strokeWidth="1.2" />
        <path d="M-26 -38 L26 -38 M-26 -30 L26 -30 M-26 38 L26 38" stroke="#e8c889" strokeWidth=".5" opacity=".5" />
        <text y="2" fontFamily="Georgia, serif" fontSize="22" fontStyle="italic" fontWeight="700" fill="#e8c889" textAnchor="middle">§</text>
      </g>
      {/* connection lines */}
      <path d="M180 60 L80 30  M180 60 L280 30  M180 160 L80 190  M180 160 L280 190" stroke="#e8c889" strokeWidth="1" strokeDasharray="3 3" opacity=".55" />
      {/* platform tiles */}
      {[
        { x: 50, y: 14, label: 'SLEEPER' },
        { x: 250, y: 14, label: 'ESPN' },
        { x: 50, y: 174, label: 'YAHOO' },
        { x: 250, y: 174, label: 'NFL.COM' },
      ].map((p) => (
        <g key={p.label} transform={`translate(${p.x} ${p.y})`}>
          <rect width="60" height="32" rx="4" fill="#2a1f15" stroke="#e8c889" strokeWidth="1" />
          <text x="30" y="20" fontFamily="ui-monospace, monospace" fontSize="9" letterSpacing="2" fill="#e8c889" textAnchor="middle" fontWeight="700">{p.label}</text>
        </g>
      ))}
    </svg>
  )
}

function PromoHero() {
  return (
    <svg viewBox="0 0 360 220" className="lp-welcome-hero-svg" aria-hidden>
      <rect x="0" y="0" width="360" height="220" fill="#1a1410" />
      {/* coupon body — left and right panels widened so text fits */}
      <g>
        {/* shadow */}
        <rect x="24" y="44" width="312" height="132" rx="10" fill="#000" opacity=".25" />
        {/* perforation circles between panels */}
        {[...Array(10)].map((_, i) => (
          <circle key={`p${i}`} cx="180" cy={50 + i * 14} r="3.5" fill="#1a1410" />
        ))}
        {/* left panel — wider */}
        <rect x="20" y="40" width="156" height="132" rx="10" fill="#f4ead0" />
        {/* right panel — wider */}
        <rect x="184" y="40" width="156" height="132" rx="10" fill="#f4ead0" />

        {/* left side: tagline */}
        <text x="98" y="78" fontFamily="Georgia, serif" fontSize="10" letterSpacing="3" fill="#a04830" textAnchor="middle">SUNDAY CHRONICLE</text>
        <text x="98" y="120" fontFamily="Georgia, serif" fontSize="34" fontStyle="italic" fontWeight="700" fill="#1a1410" textAnchor="middle">50%</text>
        <text x="98" y="142" fontFamily="Georgia, serif" fontSize="11" fontStyle="italic" fill="#1a1410" textAnchor="middle">off your first issue</text>
        <text x="98" y="160" fontFamily="ui-monospace, monospace" fontSize="7" letterSpacing="2" fill="#a04830" textAnchor="middle">★ ONE PER READER</text>

        {/* right side: code */}
        <text x="262" y="74" fontFamily="ui-monospace, monospace" fontSize="8" letterSpacing="3" fill="#a04830" textAnchor="middle">PROMO CODE</text>
        {/* dashed box — longer + taller, wraps the code generously */}
        <rect x="198" y="86" width="128" height="48" rx="6" fill="none" stroke="#a04830" strokeWidth="1.6" strokeDasharray="3 3" />
        <text x="262" y="118" fontFamily="ui-monospace, monospace" fontSize="20" letterSpacing="4" fontWeight="700" fill="#1a1410" textAnchor="middle">FIRST50</text>
        <text x="262" y="155" fontFamily="Georgia, serif" fontSize="9" fontStyle="italic" fill="#1a1410" textAnchor="middle">apply at checkout</text>
      </g>
    </svg>
  )
}

function ClosingHero() {
  return (
    <svg viewBox="0 0 360 220" className="lp-welcome-hero-svg" aria-hidden>
      <rect x="0" y="0" width="360" height="220" fill="#f4ead0" />
      {/* open book */}
      <g transform="translate(180 110)">
        {/* shadow */}
        <ellipse cx="0" cy="78" rx="130" ry="8" fill="#000" opacity=".15" />
        {/* left page */}
        <path d="M0 -70 L-110 -60 L-110 60 L0 70 Z" fill="#fff8e6" stroke="#1a1410" strokeWidth="1.2" />
        {/* right page */}
        <path d="M0 -70 L110 -60 L110 60 L0 70 Z" fill="#fff8e6" stroke="#1a1410" strokeWidth="1.2" />
        {/* spine */}
        <path d="M0 -70 L0 70" stroke="#1a1410" strokeWidth="1.2" />
        {/* page text lines left */}
        {[-45,-35,-25,-15,-5,5,15,25,35,45].map((y) => (
          <line key={`l${y}`} x1="-100" y1={y} x2="-12" y2={y} stroke="#1a1410" strokeWidth=".5" opacity=".35" />
        ))}
        {/* right page chapter mark + lines */}
        <text x="60" y="-35" fontFamily="Georgia, serif" fontSize="14" fontStyle="italic" fontWeight="700" fill="#a04830" textAnchor="middle">§</text>
        <text x="60" y="-18" fontFamily="ui-monospace, monospace" fontSize="6" letterSpacing="2" fill="#1a1410" textAnchor="middle" opacity=".7">CHAPTER ONE</text>
        {[0, 10, 20, 30, 40].map((y) => (
          <line key={`r${y}`} x1="12" y1={y} x2="100" y2={y} stroke="#1a1410" strokeWidth=".5" opacity=".35" />
        ))}
        {/* bookmark */}
        <path d="M60 -70 L60 -38 L66 -44 L72 -38 L72 -70 Z" fill="#a04830" />
      </g>
    </svg>
  )
}

const FEATURE_SLIDES: FeatureSlide[] = [
  {
    kind: 'feature',
    badge: 'NEW',
    kicker: 'UDFA · Free forever',
    title: (
      <>
        Your first league —<br />
        <em>on the house.</em>
      </>
    ),
    body: (
      <>
        One league. No card. No expiration. Run the whole almanac for free.
        Upgrade to <strong>Vol. II</strong> when you want Pick&apos;ems, Power
        Rankings, the Live Season Hub, and the Manager Hub.
      </>
    ),
    hero: <UdfaHero />,
  },
  {
    kind: 'feature',
    badge: 'LIVE',
    kicker: 'Live Season Hub',
    title: (
      <>
        The almanac,<br />
        <em>week by week.</em>
      </>
    ),
    body: (
      <>
        <strong>Matchup Preview</strong> lays out the slate with form, narrative,
        and rivalry weight. <strong>Best Coach Tracker</strong> grades start/sit
        decisions league-wide. Off-season chronicle, Sunday voice.
      </>
    ),
    hero: <LiveHero />,
  },
  {
    kind: 'feature',
    badge: 'NEW',
    kicker: 'Manager Hub',
    title: (
      <>
        A career chronicle<br />
        <em>for every manager.</em>
      </>
    ),
    body: (
      <>
        Six issues — Dynasty, Wire, Records, Rivalries, Legacy, Future —
        across every league a manager touches. Personal. Editorial.
        Pulling live data through per-chronicle aliases.
      </>
    ),
    hero: <ManagerHero />,
  },
  {
    kind: 'feature',
    badge: 'EXPANDED',
    kicker: 'Platforms',
    title: (
      <>
        Now reading<br />
        <em>Yahoo & ESPN.</em>
      </>
    ),
    body: (
      <>
        Sleeper, Yahoo, ESPN, and NFL.com all bind into the same almanac.
        Bring a league ID — we walk every season back to the beginning.
      </>
    ),
    hero: <PlatformsHero />,
  },
]

const ALL_SLIDES: Slide[] = [
  { kind: 'greet' },
  ...FEATURE_SLIDES,
  { kind: 'promo' },
  { kind: 'closing' },
]

export function WelcomePopup({ signedIn }: { signedIn: boolean }) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [hasDismissed, setHasDismissed] = useState(false)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setMounted(true)
    try {
      const dismissed = window.localStorage.getItem(STORAGE_KEY)
      if (dismissed === WELCOME_VERSION) setHasDismissed(true)
      else setOpen(true)
    } catch {
      setOpen(true)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss()
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(ALL_SLIDES.length - 1, i + 1))
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function dismiss() {
    try { window.localStorage.setItem(STORAGE_KEY, WELCOME_VERSION) } catch {}
    setOpen(false)
    setHasDismissed(true)
    setIndex(0)
  }

  function reopen() {
    setIndex(0)
    setOpen(true)
  }

  if (!mounted) return null

  if (!open) {
    if (!hasDismissed) return null
    return (
      <button
        type="button"
        className="lp-welcome-reopen"
        onClick={reopen}
        aria-label="Reopen what's new"
        title="What's new"
      >
        <span aria-hidden>★</span>
      </button>
    )
  }

  const slide = ALL_SLIDES[index]
  const isFirst = index === 0
  const isLast = index === ALL_SLIDES.length - 1

  return (
    <div
      className="lp-welcome-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lp-welcome-heading"
      onClick={dismiss}
    >
      {/* External arrows — Arc-style, floating outside the card.
          Left arrow hidden on slide 1 (no previous to go to). */}
      {!isFirst && (
        <button
          type="button"
          className="lp-welcome-arrow-ext lp-welcome-arrow-ext-left"
          onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.max(0, i - 1)) }}
          aria-label="Previous"
        >
          <svg width="18" height="18" viewBox="0 0 14 14" aria-hidden>
            <path d="M9 1L3 7l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
      )}
      <button
        type="button"
        className="lp-welcome-arrow-ext lp-welcome-arrow-ext-right"
        onClick={(e) => {
          e.stopPropagation()
          if (isLast) dismiss()
          else setIndex((i) => Math.min(ALL_SLIDES.length - 1, i + 1))
        }}
        aria-label={isLast ? 'Done' : 'Next'}
      >
        {isLast ? (
          <svg width="18" height="18" viewBox="0 0 14 14" aria-hidden>
            <path d="M2 7.5l3.2 3.2L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 14 14" aria-hidden>
            <path d="M5 1l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        )}
      </button>

      <div className="lp-welcome-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="lp-welcome-close"
          aria-label="Close"
          onClick={dismiss}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        {/* Hero illustration — top of every slide */}
        <div className="lp-welcome-hero">
          {slide.kind === 'greet' && <GreetHero />}
          {slide.kind === 'feature' && slide.hero}
          {slide.kind === 'promo' && <PromoHero />}
          {slide.kind === 'closing' && <ClosingHero />}
        </div>

        <div className="lp-welcome-body">
          {slide.kind === 'greet' && (
            <div className="lp-welcome-stage">
              <div className="lp-welcome-eyebrow">★ A note from the desk</div>
              <h2 className="lp-welcome-title" id="lp-welcome-heading">
                {signedIn ? <>Welcome <em>back</em> to the issue.</> : <>The next issue<br /><em>is here.</em></>}
              </h2>
              <p className="lp-welcome-text">
                A free tier, a Live Season Hub, a six-issue Manager Hub, two new
                platforms — and a discount waiting at the end. Turn the page.
              </p>
              {PROMO_CODE && (
                <button
                  type="button"
                  className="lp-welcome-promo-tease"
                  onClick={() => {
                    // Jump to the promo slide (kind === 'promo') so the
                    // user has to turn the page for the actual code —
                    // tease + reveal beats giving it away on slide 1.
                    const promoIdx = ALL_SLIDES.findIndex((s) => s.kind === 'promo')
                    if (promoIdx !== -1) setIndex(promoIdx)
                  }}
                >
                  <span className="lp-welcome-promo-tease-icon" aria-hidden>★</span>
                  <span className="lp-welcome-promo-tease-text">
                    <span className="lp-welcome-promo-tease-line">
                      A <strong>50% off</strong> promo code is hiding in this issue.
                    </span>
                    <span className="lp-welcome-promo-tease-hint">Tap to reveal →</span>
                  </span>
                </button>
              )}
            </div>
          )}

          {slide.kind === 'feature' && (
            <div className="lp-welcome-stage">
              <div className="lp-welcome-row">
                <span className="lp-welcome-badge">{slide.badge}</span>
                <span className="lp-welcome-counter">
                  {String(index).padStart(2, '0')} / {String(ALL_SLIDES.length - 2).padStart(2, '0')}
                </span>
              </div>
              <div className="lp-welcome-kicker">★ {slide.kicker}</div>
              <h2 className="lp-welcome-title" id="lp-welcome-heading">{slide.title}</h2>
              <p className="lp-welcome-text">{slide.body}</p>
              {/* UDFA slide gets a "Start today" CTA so signed-out
                  readers can act on the free-tier pitch immediately. */}
              {slide.kicker === 'UDFA · Free forever' && !signedIn && (
                <Link
                  href="/login?mode=signup"
                  className="lp-welcome-cta lp-welcome-cta-small"
                  onClick={dismiss}
                >
                  Start today →
                </Link>
              )}
            </div>
          )}

          {slide.kind === 'promo' && (
            <div className="lp-welcome-stage">
              <div className="lp-welcome-eyebrow">★ A note from the publisher</div>
              <h2 className="lp-welcome-title" id="lp-welcome-heading">
                Half off your<br /><em>first issue.</em>
              </h2>
              <p className="lp-welcome-text">
                A welcome gift. Apply <strong>{PROMO_CODE}</strong> at checkout
                for <strong>{PROMO_TAGLINE.toLowerCase()}</strong> — good on any
                paid tier, the first time you upgrade. One per reader.
              </p>
              <Link
                href="/pricing"
                className="lp-welcome-cta lp-welcome-cta-small"
                onClick={dismiss}
              >
                See pricing →
              </Link>
            </div>
          )}

          {slide.kind === 'closing' && (
            <div className="lp-welcome-stage">
              <div className="lp-welcome-eyebrow">★ Open the book</div>
              <h2 className="lp-welcome-title" id="lp-welcome-heading">
                {signedIn ? <>Pick up where<br />you <em>left off.</em></> : <>Start your<br /><em>archive.</em></>}
              </h2>
              <p className="lp-welcome-text">
                {signedIn
                  ? 'Your library is waiting — every feature above is live in your dashboard.'
                  : 'Bring a league ID and we walk every season back to the beginning. Free forever to start. No card.'}
              </p>
              <Link
                href={signedIn ? '/dashboard' : '/login?mode=signup'}
                className="lp-welcome-cta"
                onClick={dismiss}
              >
                {signedIn ? 'Open dashboard →' : 'Start your archive →'}
              </Link>
            </div>
          )}
        </div>

        <div className="lp-welcome-foot">
          <div className="lp-welcome-dots" aria-hidden>
            {ALL_SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`lp-welcome-dot${i === index ? ' is-active' : ''}`}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <div className="lp-welcome-foot-meta">
            {index + 1} / {ALL_SLIDES.length}
          </div>
        </div>
      </div>
    </div>
  )
}
