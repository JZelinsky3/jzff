'use client'

import Link from 'next/link'
import { Oswald } from 'next/font/google'
import { useEffect, useRef, useState } from 'react'
import s from './gameday.module.css'

// ---------------------------------------------------------------------------
// "The Drive": the page plays out as one scoring drive down a football field.
// Each section is a down (draft room, record book, rivalry file, manager DNA,
// then the two-minute drill), a broadcast-style scorebug HUD tracks field
// position as you scroll, and the signup CTA lives in the end zone. Visual
// language is deliberately analog: chalk playbook, box scores, scouting
// reports, stamped verdicts. Hard rectangles everywhere, nothing pill-shaped.
// ---------------------------------------------------------------------------

const oswald = Oswald({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-oswald',
})

// Field position labels shown in the HUD as the drive progresses. The drive
// starts on the own 20 and covers 80 yards across the scrollable section.
function ballSpot(p: number): string {
  const yard = Math.min(99, Math.round(20 + p * 80))
  if (yard < 50) return `OWN ${yard}`
  if (yard === 50) return 'MIDFIELD'
  return `OPP ${100 - yard}`
}

const DOWN_LABELS = ['1ST & 10', '2ND & 6', '3RD & 2', '4TH & INCHES', '2-MIN DRILL']

const GAME_BOOK = [
  { col: 'STANDINGS', line: 'Twelve seasons of tables', href: '/demo/standings.html' },
  { col: 'SEASONS', line: 'Every year, week by week', href: '/demo/seasons/' },
  { col: 'DRAFTS', line: 'Boards, grades, hindsight', href: '/demo/draft/' },
  { col: 'RECORDS', line: 'The wall of arguments', href: '/demo/records.html' },
  { col: 'MANAGERS', line: 'Careers and tendencies', href: '/demo/managers/' },
  { col: 'RIVALRIES', line: 'Head to head, all time', href: '/demo/rivalries/' },
]

export function GamedayLanding() {
  const [hud, setHud] = useState({ down: 0, spot: 'OWN 20', pct: 0 })
  const [hudOn, setHudOn] = useState(false)
  const driveRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Scroll loop: track drive progress for the scorebug HUD.
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const el = driveRef.current
        if (!el) return
        const vh = window.innerHeight
        const rect = el.getBoundingClientRect()
        const total = el.offsetHeight + vh * 0.5
        const p = Math.min(1, Math.max(0, (vh * 0.75 - rect.top) / total))
        const inDrive = rect.top < vh * 0.8 && rect.bottom > vh * 0.25
        setHudOn(inDrive)
        if (inDrive) {
          setHud({
            down: Math.min(DOWN_LABELS.length - 1, Math.floor(p * DOWN_LABELS.length)),
            spot: ballSpot(p),
            pct: p,
          })
        }
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // Reveal-on-scroll for everything tagged data-reveal.
  useEffect(() => {
    const nodes = rootRef.current?.querySelectorAll('[data-reveal]')
    if (!nodes?.length) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add(s.revealed)
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.18 },
    )
    nodes.forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [])

  return (
    <div ref={rootRef} className={`${s.gameday} ${oswald.variable}`}>
      {/* ---------------------------------------------- scorebug top bar */}
      <header className={s.topbar}>
        <Link href="/gameday" className={s.bug}>
          <span className={s.bugMark}>TSC</span>
          <span className={s.bugName}>The Sunday Chronicle</span>
        </Link>
        <nav className={s.topLinks}>
          <Link href="/pricing">Pricing</Link>
          <Link href="/guides">Guides</Link>
          <Link href="/demo/">Demo</Link>
          <Link href="/about">About</Link>
        </nav>
        <div className={s.topActions}>
          <Link href="/login" className={s.topSignIn}>
            Sign in
          </Link>
          <Link href="/login?mode=signup" className={s.topCta}>
            Start your chronicle
          </Link>
        </div>
      </header>

      {/* ---------------------------------------------------- kickoff hero */}
      <section className={s.hero}>
        <div className={s.heroField} aria-hidden />
        <div className={s.heroInner}>
          <p className={s.heroChip}>
            <span className={s.chipBox}>Kickoff</span>
            <span className={s.chipText}>A record book for fantasy leagues</span>
          </p>
          <h1 className={s.heroTitle}>
            Twelve seasons of bad beats, robberies, and dynasties.
          </h1>
          <p className={s.heroScript}>Finally written down.</p>
          <p className={s.heroBody}>
            The Sunday Chronicle pulls your league&rsquo;s full history off Sleeper, ESPN,
            Yahoo, or NFL.com and prints it like it mattered. Because it did.
          </p>
          <div className={s.heroCtas}>
            <Link href="/login?mode=signup" className={s.btnSolid}>
              Start your chronicle
            </Link>
            <Link href="/demo/" className={s.btnOutline}>
              Tour the demo league
            </Link>
          </div>
          <p className={s.heroFine}>Free tier: one league, forever. No card required.</p>
        </div>
        <div className={s.heroYard} aria-hidden>
          <span>2 0</span>
          <span className={s.heroYardArrow}>◄</span>
        </div>
      </section>

      {/* ------------------------------------------------------ the drive */}
      <div ref={driveRef} className={s.drive}>
        {/* 1st down: the draft room */}
        <section className={s.down}>
          <YardLine num="3 0" />
          <div className={s.downGrid}>
            <div className={s.downLead} data-reveal>
              <p className={s.downTag}>1st &amp; 10 · own 30</p>
              <h2 className={s.downTitle}>The Draft Room</h2>
              <p className={s.downBody}>
                Every board your league ever drafted, kept like game film. Round by round,
                pick by pick, with the reaches and the steals graded in hindsight.
              </p>
              <Link href="/demo/draft/" className={s.btnChalk}>
                Open the draft archive
              </Link>
            </div>
            <figure className={s.playCard} data-reveal>
              <figcaption className={s.playCardHead}>
                <span>Play 001</span>
                <span>Trips right · draft heist</span>
              </figcaption>
              <svg viewBox="0 0 360 220" className={s.playSvg} role="img" aria-label="Chalk play diagram">
                {/* scrimmage */}
                <line x1="20" y1="150" x2="340" y2="150" className={s.chalkLine} />
                {/* offense */}
                {[70, 110, 150, 190, 230].map((x) => (
                  <circle key={x} cx={x} cy="170" r="9" className={s.chalkO} />
                ))}
                <circle cx="150" cy="196" r="9" className={s.chalkO} />
                <circle cx="300" cy="170" r="9" className={s.chalkOStar} />
                {/* defense */}
                {[90, 130, 170, 210, 250, 300].map((x) => (
                  <g key={x} className={s.chalkX}>
                    <line x1={x - 7} y1="121" x2={x + 7} y2="135" />
                    <line x1={x + 7} y1="121" x2={x - 7} y2="135" />
                  </g>
                ))}
                {/* route: the star receiver breaks deep */}
                <path d="M300 160 C 302 120, 290 92, 255 70 S 190 38, 150 34" className={s.chalkRoute} />
                <path d="M162 42 L 148 33 L 160 24" className={s.chalkRouteHead} />
                <text x="120" y="30" className={s.chalkNote}>
                  rd 9 steal
                </text>
              </svg>
            </figure>
          </div>
        </section>

        {/* 2nd down: the record book */}
        <section className={s.down}>
          <YardLine num="4 5" />
          <div className={s.downGrid}>
            <figure className={`${s.boxScore} ${s.orderFirst}`} data-reveal>
              <figcaption className={s.boxHead}>
                <span>Official league records</span>
                <span>Demo league · all time</span>
              </figcaption>
              <table className={s.boxTable}>
                <tbody>
                  <tr>
                    <td>Most pts, week</td>
                    <td className={s.boxNum}>212.44</td>
                    <td>2021 · wk 11</td>
                  </tr>
                  <tr>
                    <td>Longest win streak</td>
                    <td className={s.boxNum}>13</td>
                    <td>2019 to 2020</td>
                  </tr>
                  <tr>
                    <td>Worst blown lead</td>
                    <td className={s.boxNum}>41.2</td>
                    <td>2023 · wk 14</td>
                  </tr>
                  <tr>
                    <td>Fewest pts, season</td>
                    <td className={s.boxNum}>988.1</td>
                    <td>2017 · last place</td>
                  </tr>
                  <tr>
                    <td>Benched points, career</td>
                    <td className={s.boxNum}>1,204</td>
                    <td>ongoing tragedy</td>
                  </tr>
                </tbody>
              </table>
              <span className={`${s.stamp} ${s.stampGold}`}>Certified</span>
            </figure>
            <div className={s.downLead} data-reveal>
              <p className={s.downTag}>2nd &amp; 6 · own 45</p>
              <h2 className={s.downTitle}>The Record Book</h2>
              <p className={s.downBody}>
                Highest weeks, longest streaks, worst collapses. Carved into a records wall
                that updates itself every week and never forgets a thing.
              </p>
              <Link href="/demo/records.html" className={s.btnChalk}>
                See the records wall
              </Link>
            </div>
          </div>
        </section>

        {/* 3rd down: the rivalry file */}
        <section className={s.down}>
          <YardLine num="5 0" mid />
          <div className={s.downGrid}>
            <div className={s.downLead} data-reveal>
              <p className={s.downTag}>3rd &amp; 2 · midfield</p>
              <h2 className={s.downTitle}>The Rivalry File</h2>
              <p className={s.downBody}>
                Every head-to-head your league has ever played, scored like a title fight.
                Who owns whom, by how much, and what happened last time.
              </p>
              <Link href="/demo/rivalries/" className={s.btnChalk}>
                Read the rivalry files
              </Link>
            </div>
            <figure className={s.tape} data-reveal>
              <figcaption className={s.tapeHead}>Tale of the tape</figcaption>
              <div className={s.tapeRow}>
                <span className={s.tapeSide}>The Champ</span>
                <span className={s.tapeVs}>vs</span>
                <span className={s.tapeSide}>The Runner-Up</span>
              </div>
              <dl className={s.tapeStats}>
                <div>
                  <dt>All-time</dt>
                  <dd>14 to 9</dd>
                </div>
                <div>
                  <dt>Avg margin</dt>
                  <dd>6.8 pts</dd>
                </div>
                <div>
                  <dt>Playoff meetings</dt>
                  <dd>4, all ugly</dd>
                </div>
                <div>
                  <dt>Last meeting</dt>
                  <dd>decided on MNF</dd>
                </div>
              </dl>
              <span className={`${s.stamp} ${s.stampRed}`}>Blood feud</span>
            </figure>
          </div>
        </section>

        {/* 4th down: manager DNA */}
        <section className={s.down}>
          <YardLine num="3 0" flip />
          <div className={s.downGrid}>
            <figure className={`${s.scout} ${s.orderFirst}`} data-reveal>
              <figcaption className={s.scoutHead}>
                <span>Scouting report</span>
                <span>File 07 of 12</span>
              </figcaption>
              <div className={s.scoutBody}>
                <p>
                  <span className={s.scoutKey}>Subject</span> League manager, 9th season
                </p>
                <p>
                  <span className={s.scoutKey}>Titles</span> 2, will mention both
                </p>
                <p>
                  <span className={s.scoutKey}>Tendencies</span> drafts RBs early, panic
                  trades by week 5, streams defenses like a maniac
                </p>
                <p>
                  <span className={s.scoutKey}>Verdict</span> dangerous when losing
                </p>
              </div>
              <span className={`${s.stamp} ${s.stampInk}`}>DNA on file</span>
            </figure>
            <div className={s.downLead} data-reveal>
              <p className={s.downTag}>4th &amp; inches · opp 30</p>
              <h2 className={s.downTitle}>Manager DNA</h2>
              <p className={s.downBody}>
                Careers, tendencies, tells. The Chronicle profiles every manager in your
                league from a decade of decisions they thought nobody was tracking.
              </p>
              <Link href="/demo/managers/" className={s.btnChalk}>
                Pull the manager files
              </Link>
            </div>
          </div>
        </section>

        {/* two-minute drill: sunday live */}
        <section className={s.down}>
          <YardLine num="1 0" flip />
          <div className={s.drill} data-reveal>
            <p className={s.downTag}>Two-minute drill · opp 10</p>
            <h2 className={s.downTitle}>Sunday Live</h2>
            <p className={s.downBody}>
              On game day the Chronicle goes to the booth: live scores, win probability,
              sweat meters, and the wire. History, written in real time.
            </p>
            <div className={s.liveBug}>
              <span className={s.liveDot} aria-hidden />
              <span className={s.liveLabel}>Live</span>
              <span className={s.liveScore}>MURPHY 87.4</span>
              <span className={s.liveSep}>at</span>
              <span className={s.liveScore}>SAMS 92.1</span>
              <span className={s.liveMeta}>Q3 · WP 42%</span>
            </div>
            <Link href="/demo/pickems/" className={s.btnChalk}>
              Watch a live Sunday
            </Link>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------ end zone */}
      <section className={s.endzone}>
        <div className={s.endzoneStripes} aria-hidden />
        <div className={s.endzoneInner} data-reveal>
          <h2 className={s.endzoneWord}>Touchdown</h2>
          <p className={s.endzoneBody}>
            That drive ran on the public demo league. Connect yours and the Chronicle
            writes every season you have ever played, tonight.
          </p>
          <div className={s.heroCtas}>
            <Link href="/login?mode=signup" className={s.btnSolid}>
              Start your chronicle
            </Link>
            <Link href="/pricing" className={s.btnOutline}>
              The extra point: pricing
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ game book */}
      <section className={s.gameBook}>
        <div className={s.gameBookHead} data-reveal>
          <h2>The full game book</h2>
          <p>Six wings of the demo league, open to the public. Nothing is mocked.</p>
        </div>
        <div className={s.gameBookTable} data-reveal>
          {GAME_BOOK.map((g) => (
            <Link key={g.col} href={g.href} className={s.gameBookRow}>
              <span className={s.gameBookCol}>{g.col}</span>
              <span className={s.gameBookLine}>{g.line}</span>
              <span className={s.gameBookGo}>View</span>
            </Link>
          ))}
        </div>
        <p className={s.partners} data-reveal>
          Broadcast partners: Sleeper · ESPN · Yahoo · NFL.com
        </p>
      </section>

      {/* ------------------------------------------------------ post-game */}
      <footer className={s.postgame}>
        <span className={s.finalBox}>Final</span>
        <nav className={s.postLinks}>
          <Link href="/pricing">Pricing</Link>
          <Link href="/guides">Guides</Link>
          <Link href="/about">About</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/">Current homepage</Link>
        </nav>
        <span className={s.postMark}>The Sunday Chronicle</span>
      </footer>

      {/* ------------------------------------------- scorebug HUD (fixed) */}
      <aside className={`${s.hud} ${hudOn ? s.hudOn : ''}`} aria-hidden={!hudOn}>
        <span className={s.hudBrand}>TSC</span>
        <span className={s.hudDown}>{DOWN_LABELS[hud.down]}</span>
        <span className={s.hudSpot}>Ball on {hud.spot}</span>
        <span className={s.hudChain}>
          <span className={s.hudChainFill} style={{ width: `${hud.pct * 100}%` }} />
        </span>
      </aside>
    </div>
  )
}

// Painted yard-line divider between downs. `mid` marks the 50 with the star,
// `flip` renders the number mirrored like the far side of midfield.
function YardLine({ num, mid, flip }: { num: string; mid?: boolean; flip?: boolean }) {
  return (
    <div className={s.yardLine} aria-hidden>
      <span className={`${s.yardNum} ${flip ? s.yardFlip : ''}`}>{num}</span>
      <span className={s.yardRule} />
      {mid ? <span className={s.yardStar}>★</span> : null}
      <span className={`${s.yardNum} ${s.yardNumRight} ${flip ? s.yardFlip : ''}`}>{num}</span>
    </div>
  )
}
