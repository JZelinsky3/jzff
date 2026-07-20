'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import s from './new.module.css'

// ---------------------------------------------------------------------------
// Editorial landing candidate, take two: a broadsheet front page instead of
// a single column of labeled sections. Full-width 12-column spread with
// newspaper column rules, artifacts that bleed off the viewport edges (the
// bound almanac off the right, a draft clipping off the left), a moving wire
// ticker, and IntersectionObserver scroll reveals. Same tokens as main.css.
// ---------------------------------------------------------------------------

const TICKER = [
  'Shaw takes sole possession of first',
  'Rivera comeback falls 1.44 short, still disputed',
  'Torres rides a four game heater into week 15',
  'Record watch: 212.44 survives a fifth season',
  'Ryan benches the wrong quarterback again',
  'Trade deadline passes without a single phone call',
]

const AGATE = [
  { rk: 1, team: 'Shaw', rec: '11-3', pf: '1,642.8' },
  { rk: 2, team: 'Torres', rec: '10-4', pf: '1,590.1' },
  { rk: 3, team: 'Rivera', rec: '8-6', pf: '1,533.6' },
  { rk: 4, team: 'Okafor', rec: '8-6', pf: '1,488.2' },
  { rk: 5, team: 'Diaz', rec: '7-7', pf: '1,451.9' },
  { rk: 6, team: 'Grant', rec: '6-8', pf: '1,402.4' },
  { rk: 7, team: 'Ryan', rec: '6-8', pf: '1,344.0' },
  { rk: 8, team: 'Cruz', rec: '4-10', pf: '1,296.5' },
  { rk: 9, team: 'Bell', rec: '4-10', pf: '1,254.3' },
  { rk: 10, team: 'Mason', rec: '3-11', pf: '1,187.6' },
]

const DRAFT = [
  { pick: '1.01', mgr: 'Shaw', player: "Ja'Marr Chase" },
  { pick: '1.02', mgr: 'Ryan', player: 'Bijan Robinson' },
  { pick: '1.03', mgr: 'Torres', player: 'Justin Jefferson' },
  { pick: '1.04', mgr: 'Rivera', player: 'CeeDee Lamb' },
  { pick: '1.05', mgr: 'Okafor', player: 'Amon-Ra St. Brown' },
]

// PPG figures agree with the agate PF column (PF / 14 weeks).
const FORM = [
  { team: 'Shaw', rec: '11-3', ppg: '117.3', run: ['w', 'w', 'w', 'l', 'w'] },
  { team: 'Torres', rec: '10-4', ppg: '113.6', run: ['w', 'l', 'w', 'w', 'w'] },
  { team: 'Rivera', rec: '8-6', ppg: '109.5', run: ['l', 'w', 'l', 'w', 'w'] },
  { team: 'Ryan', rec: '6-8', ppg: '96.0', run: ['l', 'l', 'w', 'l', 'l'] },
]

const WIRE = [
  { time: '4:02', tag: 'Swing', line: 'Shaw retakes the lead on a 61 yard score, WP 42 to 68' },
  { time: '4:07', tag: 'Dud watch', line: 'Ryan’s WR1 is on pace for 3.1 and falling' },
  { time: '4:15', tag: 'Record watch', line: 'Torres needs 19.6 to take the weekly high' },
  { time: '4:22', tag: 'Comeback math', line: 'Rivera needs 12.4 from two players still alive' },
]

const BUGS = [
  { a: 'SHAW', as: '92.1', b: 'RIVERA', bs: '87.4', meta: 'Q3 · WP 68%' },
  { a: 'TORRES', as: '104.9', b: 'RYAN', bs: '71.0', meta: 'Q4 · WP 94%' },
  { a: 'OKAFOR', as: '66.2', b: 'BELL', bs: '64.8', meta: 'HALF · WP 51%' },
  { a: 'GRANT', as: '88.0', b: 'DIAZ', bs: '90.3', meta: 'Q3 · WP 44%' },
  { a: 'MASON', as: '51.7', b: 'CRUZ', bs: '49.9', meta: 'Q2 · WP 53%' },
]

const CLUB_ROOMS = [
  {
    numeral: 'II',
    name: 'The Dispatch',
    blurb: 'What just shipped and what is coming down the wire, written like news.',
    href: '/hub/whats-new',
  },
  {
    numeral: 'III',
    name: 'The Census',
    blurb: 'The whole network in numbers: points, picks, trades, blowouts.',
    href: '/hub/numbers',
  },
  {
    numeral: 'IV',
    name: 'The Hall',
    blurb: 'Site-wide records with real names on the plaques.',
    href: '/hub/records',
  },
  {
    numeral: 'V',
    name: 'The Trade Room',
    blurb: 'Verdicts on any trade, no league required. Post it, let the room vote.',
    href: '/hub/analyzer',
  },
  {
    numeral: 'VI',
    name: 'The Newsstand',
    blurb: 'Every public almanac on one rack. Browse, search, bookmark.',
    href: '/hub/explore',
  },
]

const RATES = [
  {
    name: 'UDFA',
    price: '$0',
    per: '/forever',
    yearly: 'no card required',
    leagues: 'One league',
    note: 'A free chapter of your league\'s history.',
  },
  {
    name: 'Rookie',
    price: '$3',
    per: '/mo',
    yearly: 'or $15/yr',
    leagues: 'One league',
    note: 'A single league, kept in print and in sync.',
  },
  {
    name: 'Veteran',
    price: '$5',
    per: '/mo',
    yearly: 'or $25/yr',
    leagues: 'Three leagues',
    note: 'Run every league you keep from one account.',
    flag: 'Most subscribed',
  },
  {
    name: 'All-Pro',
    price: '$15',
    per: '/mo',
    yearly: 'or $50/yr',
    leagues: 'Ten leagues',
    note: 'The whole shelf, plus first look at new features.',
  },
]

export function NewLanding({ signedIn = false }: { signedIn?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [slim, setSlim] = useState(false)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const els = root.querySelectorAll('[data-reveal]')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add(s.in)
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Brand collapse: past the masthead the nameplate letters slide away and
  // leave TSC., same mechanism as the mobile landing's top bar.
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setSlim(window.scrollY > 120)
        ticking = false
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div ref={rootRef} className={s.root}>
      {/* ------------------------------------------------------------ nav */}
      <header className={`${s.nav} ${slim ? s.navSlim : ''}`}>
        <Link href="/" className={s.brand} aria-label="The Sunday Chronicle">
          <span aria-hidden>
            T<span className={s.brandFade}>{'he '}</span>S
            <span className={s.brandFade}>{'unday '}</span>
            <em>
              C<span className={s.brandFade}>hronicle</span>.
            </em>
          </span>
        </Link>
        <nav className={s.navLinks}>
          <Link href="/demo/">Demo</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/guides">Guides</Link>
          <Link href="/about">About</Link>
          {signedIn ? (
            <Link href="/hub" className={s.navLogin}>
              Clubhouse
            </Link>
          ) : (
            <Link href="/login" className={s.navLogin}>
              Login
            </Link>
          )}
          <Link
            href={signedIn ? '/dashboard' : '/login?mode=signup'}
            className={s.navCta}
          >
            {signedIn ? 'Your library' : 'Start free'}
          </Link>
        </nav>
      </header>

      {/* ------------------------------------------------------- masthead */}
      <section className={s.masthead}>
        <div className={s.mastBar}>
          <span>Vol. II · No. 118</span>
          <span className={s.mastBarMid}>★ Sleeper · ESPN · Yahoo · NFL.com ★</span>
          <span className={s.mastBarRight}>Price: one league ID</span>
        </div>
        <h1 className={s.mastTitle}>
          The Sunday <em>Chronicle.</em>
        </h1>
        <div className={s.mastFlourish} aria-hidden />
        <div className={s.mastDeckRow}>
          <p className={s.deck}>The record book your league never kept.</p>
        </div>
        <div className={s.mastBottom}>
          <div className={s.ctas}>
            <Link
              href={signedIn ? '/dashboard' : '/login?mode=signup'}
              className={s.btnGold}
            >
              {signedIn ? 'Open your library' : 'Start your chronicle'}
            </Link>
            <Link href="/demo/" className={s.btnGhost}>
              Read the demo league
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- wire ticker */}
      <div className={s.ticker} aria-hidden>
        <div className={s.tickerTrack}>
          {[0, 1].map((copy) => (
            <span key={copy} className={s.tickerCopy}>
              {TICKER.map((t) => (
                <span key={t} className={s.tickerItem}>
                  <i className={s.tickerStar}>★</i>
                  {t}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------ front page, row 1 */}
      <section className={s.spread}>
        <div className={s.pageGrid}>
          {/* left rail: agate standings */}
          <div className={s.colRail} data-reveal>
            <div className={s.agate}>
              <p className={s.kicker}>The agate page</p>
              <p className={s.agateHead}>Final standings · 2025</p>
              <table className={s.agateTable}>
                <tbody>
                  {AGATE.map((r) => (
                    <tr key={r.team}>
                      <td className={s.agateRk}>{r.rk}</td>
                      <td className={s.agateTeam}>{r.team}</td>
                      <td className={s.agateRec}>{r.rec}</td>
                      <td className={s.agatePf}>{r.pf}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={s.agateNote}>
                Compiled by the Chronicle. Standings, points, and every box score
                back to year one, for as many seasons as your league has played.
              </p>
            </div>
          </div>

          {/* center: lead story + ledger clipping */}
          <div className={s.colLead}>
            <article data-reveal>
              <p className={s.kicker}>From the archive desk</p>
              <h2 className={s.leadTitle}>
                Every season, <em>back to the beginning.</em>
              </h2>
              <p className={s.lede}>
                The full history of the league, walked back to year one and bound
                in one place: the champions and the last-place finishes, every
                draft board, every rivalry ledger, and a records wall that never
                stops arguing. Import once and the Chronicle prints the whole
                paper trail.
              </p>
              <p className={s.topics}>Seasons · Records · Rivalries · Drafts · Managers</p>
              <Link href="/demo/" className={s.textLink}>
                Tour the demo almanac
              </Link>
            </article>

            <figure className={s.ledger} data-reveal>
              <figcaption className={s.ledgerHead}>
                <span>All-time records</span>
                <span className={s.ledgerHeadMeta}>from the record book</span>
              </figcaption>
              <ul className={s.ledgerList}>
                <li>
                  <span>Most points, week</span>
                  <b>212.44</b>
                  <i>2021 · wk 11</i>
                </li>
                <li>
                  <span>Longest win streak</span>
                  <b>13</b>
                  <i>2019 to 2020</i>
                </li>
                <li>
                  <span>Title game margin</span>
                  <b>1.44</b>
                  <i>still disputed</i>
                </li>
              </ul>
              <span className={s.ledgerStamp}>★ Certified</span>
            </figure>
          </div>

          {/* right: the bound almanac, bleeding off the page */}
          <div className={s.colBook}>
            <div className={s.book} data-reveal>
              <div className={s.bookSpine}>
                <span>The Sunday Chronicle</span>
              </div>
              <div className={s.bookCover}>
                <span className={s.bookCrest}>★</span>
                <span className={s.bookLeague}>Your League</span>
                <span className={s.bookRule} />
                <span className={s.bookSub}>The Complete History</span>
                <span className={s.bookYears}>Est. 2018 · Eight Seasons</span>
                <span className={s.bookRule} />
                <span className={s.bookFt}>Vol. II</span>
              </div>
            </div>
            <p className={s.bookCaption} data-reveal>
              Bound and kept current. Every import adds a season to the shelf.
            </p>
          </div>
        </div>

        {/* ---------------------------------------------------- spread rule */}
        <div className={s.spreadRule} aria-hidden>
          <span>✦</span>
        </div>

        {/* ------------------------------------------------ front page, row 2 */}
        <div className={s.pageGrid}>
          {/* left: draft clipping bleeding off the page */}
          <div className={s.colDraft}>
            <figure className={s.draftClip} data-reveal>
              <figcaption className={s.draftHead}>
                <span>The draft board</span>
                <span className={s.ledgerHeadMeta}>2022 · round one</span>
              </figcaption>
              <ul className={s.draftList}>
                {DRAFT.map((p) => (
                  <li key={p.pick}>
                    <b>{p.pick}</b>
                    <span>{p.mgr}</span>
                    <i>{p.player}</i>
                  </li>
                ))}
              </ul>
            </figure>
          </div>

          {/* center: beat coverage story */}
          <div className={s.colBeat}>
            <article data-reveal>
              <p className={s.kicker}>Beat coverage</p>
              <h2 className={s.leadTitle}>
                The season, <em>covered like a beat.</em>
              </h2>
              <p className={s.lede}>
                During the year the Chronicle stays on the story. Standings and
                form refresh with every week, matchups get previewed before they
                are played, and the record watch flags history while there is
                still time to see it happen.
              </p>
              <p className={s.topics}>Standings · Form · Previews · Best Coach · Records Watch</p>
              <Link href="/demo/seasons/" className={s.textLink}>
                See a season in motion
              </Link>
            </article>
          </div>

          {/* right: the form sheet */}
          <div className={s.colForm}>
            <figure className={s.form} data-reveal>
              <figcaption className={s.formHead}>
                <span>The form sheet</span>
                <span className={s.ledgerHeadMeta}>week 14</span>
              </figcaption>
              <ul className={s.formList}>
                {FORM.map((t) => (
                  <li key={t.team}>
                    <span className={s.formTeam}>{t.team}</span>
                    <span className={s.formRec}>{t.rec}</span>
                    <span className={s.formRun}>
                      {t.run.map((r, i) => (
                        <i key={i} className={r === 'w' ? s.w : s.l} />
                      ))}
                    </span>
                    <span className={s.formPpg}>
                      {t.ppg}
                      <i>ppg</i>
                    </span>
                  </li>
                ))}
              </ul>
            </figure>
          </div>
        </div>

        {/* ------------------------------------------------------ pull quote */}
        <blockquote className={s.pull} data-reveal>
          <p>
            Every argument your league ever had, <em>settled in print.</em>
          </p>
        </blockquote>
      </section>

      {/* ------------------------------------------------------ sunday live */}
      <section className={s.sunday}>
        <div className={s.sundayGrid}>
          <div className={s.sundayText} data-reveal>
            <p className={`${s.kicker} ${s.sundayKicker}`}>
              <span className={s.bugDot} aria-hidden />
              Sunday Live
              <span className={s.newChip}>New for 2026</span>
            </p>
            <h2 className={s.sundayTitle}>
              Sundays, <em>broadcast in print.</em>
            </h2>
            <p className={s.lede}>
              On game day the Chronicle opens the desk: every matchup live, win
              probability moving with the afternoon, the wire calling out swings
              as they happen. The week&rsquo;s history, written while it is still
              being played.
            </p>
            <Link href="/demo/live/" className={s.btnLive}>
              <span className={s.btnLiveTag}>
                <i className={s.bugDot} aria-hidden /> Live
              </span>
              Tour game day in the demo
            </Link>
          </div>

          <div className={s.sundaySide}>
            <div className={s.wireCard} data-reveal>
              <p className={s.wireHead}>
                The Wire <span>Sunday · 4:22 PM</span>
              </p>
              <ul className={s.wireList}>
                {WIRE.map((w) => (
                  <li key={w.time}>
                    <b>{w.time}</b>
                    <span className={s.wireTag}>{w.tag}</span>
                    <span className={s.wireLine}>{w.line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={s.wpCard} data-reveal>
              <p className={s.wireHead}>
                Win probability <span>Shaw at Rivera</span>
              </p>
              <svg
                className={s.wpSvg}
                viewBox="0 0 320 72"
                preserveAspectRatio="none"
                aria-hidden
              >
                <line x1="0" y1="36" x2="320" y2="36" className={s.wpMid} />
                <polyline
                  className={s.wpLine}
                  pathLength={1}
                  points="0,44 28,40 52,46 76,34 104,38 128,24 152,30 180,48 208,42 232,52 260,30 288,22 320,16"
                />
              </svg>
              <p className={s.wpMeta}>
                <span>1:00</span>
                <span>WP 68% and climbing</span>
              </p>
            </div>
          </div>
        </div>

        {/* scorebug marquee */}
        <div className={s.bugStrip} aria-hidden>
          <div className={s.bugTrack}>
            {[0, 1].map((copy) => (
              <span key={copy} className={s.bugCopy}>
                {BUGS.map((g) => (
                  <span key={g.a} className={s.bug}>
                    <span className={s.bugLive}>
                      <i className={s.bugDot} /> Live
                    </span>
                    <span className={s.bugScore}>
                      {g.a} <b>{g.as}</b>
                    </span>
                    <span className={s.bugAt}>at</span>
                    <span className={s.bugScore}>
                      {g.b} <b>{g.bs}</b>
                    </span>
                    <span className={s.bugMeta}>{g.meta}</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ the clubhouse
          Members' wing: a big engraved entrance on the dark wall, five cream
          membership cards hung at a tilt behind it, and a brass plaque with
          the door handle. */}
      <section className={s.club}>
        <div className={s.clubHead} data-reveal>
          <p className={s.clubKicker}>✦ Members&rsquo; entrance · Est. 2026 ✦</p>
          <h2 className={s.clubTitle}>
            The <em>Clubhouse.</em>
          </h2>
          <p className={s.clubSub}>
            Behind every almanac is the room where the members read. One door,
            every league on your shelf, and the whole network&rsquo;s numbers
            up on the wall.
          </p>
        </div>

        <div className={s.clubCards} data-reveal>
          {CLUB_ROOMS.map((r) => (
            <Link key={r.numeral} href={r.href} className={s.clubCard}>
              <span className={s.clubCardWing}>Wing {r.numeral}</span>
              <span className={s.clubCardNum}>{r.numeral}</span>
              <span className={s.clubCardName}>{r.name}</span>
              <span className={s.clubCardRule} />
              <span className={s.clubCardBlurb}>{r.blurb}</span>
              <span className={s.clubCardCta}>Open the door</span>
            </Link>
          ))}
        </div>

        <div className={s.clubPlaque} data-reveal>
          <span className={s.clubShine} aria-hidden />
          <p className={s.clubPlaqueLine}>
            One membership <span>·</span> Every league on one shelf
            <span>·</span> The whole network on the wall
          </p>
          <Link href="/hub" className={s.btnHead}>
            Step inside.
          </Link>
          <p className={s.clubFine}>Included with every account</p>
        </div>
      </section>

      {/* -------------------------------------------------- subscription desk */}
      <section className={s.rates}>
        <div className={s.ratesHead} data-reveal>
          <p className={`${s.kicker} ${s.kickerCenter}`}>The subscription desk</p>
          <h2 className={s.ratesTitle}>
            Take the <em>paper.</em>
          </h2>
          <p className={s.ratesSub}>
            One league is free forever, no card. Paid editions add shelves and
            keep every one of them in print.
          </p>
        </div>
        <div className={s.rateGrid} data-reveal>
          {RATES.map((r) => (
            <div key={r.name} className={`${s.rateCard} ${r.flag ? s.rateFeatured : ''}`}>
              {r.flag && <span className={s.rateFlag}>★ {r.flag}</span>}
              <p className={s.rateName}>{r.name}</p>
              <p className={s.ratePrice}>
                {r.price}
                <span>{r.per}</span>
              </p>
              <p className={s.rateYearly}>{r.yearly}</p>
              <span className={s.rateRule} />
              <p className={s.rateLeagues}>{r.leagues}</p>
              <p className={s.rateNote}>{r.note}</p>
            </div>
          ))}
        </div>
        <div className={s.ratesFoot} data-reveal>
          <p className={s.rateFree}>Every paid plan starts with a free trial.</p>
          <div className={s.ctas}>
            <Link href="/pricing" className={s.btnHead}>
              See full pricing.
            </Link>
            <Link href="/pricing/plans" className={s.btnHeadGhost}>
              Compare plans.
            </Link>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- closing */}
      <section className={s.closing}>
        <p className={s.kicker} data-reveal>
          The last word
        </p>
        <h2 className={s.closeTitle} data-reveal>
          <span className={s.closeLine1}>The only place built</span>
          <span className={s.closeLine2}>
            to <em>immortalize</em> your league!
          </span>
        </h2>
        <div className={s.closeRow} data-reveal>
          <p className={s.closeMeta}>
            Your league, bound forever <span>·</span> No card to start
            <span>·</span> Five minutes to import
          </p>
          <div className={s.ctas}>
            <Link
              href={signedIn ? '/dashboard' : '/login?mode=signup'}
              className={s.btnGold}
            >
              {signedIn ? 'Open your library' : 'Start your chronicle'}
            </Link>
            <Link href="/demo/" className={s.btnGhost}>
              Read the demo league
            </Link>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- footer */}
      <footer className={s.footer}>
        <p className={s.footBrand}>
          The Sunday <em>Chronicle.</em>
        </p>
        <nav className={s.footLinks}>
          <Link href="/demo/">Demo league</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/pricing/plans">Plans</Link>
          <Link href="/guides">Guides</Link>
          <Link href="/about">About</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  )
}
