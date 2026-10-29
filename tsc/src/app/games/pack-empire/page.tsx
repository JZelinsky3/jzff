import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { loadBoard, type BestRow } from '@/lib/minigames/leaderboard'
import { POOL, POOL_SIZE } from '@/lib/packEmpire/pool'
import {
  RARITIES,
  RARITY_LOOK,
  SLOTS,
  SOLO_WEIGHTS,
  packOdds,
  type Player,
  type Rarity,
} from '@/lib/packEmpire/rules'
import { MobileGamesDock } from '../MobileGamesDock'
import { Chevron } from '../MobileGameBar'
import mobileStyles from '../mobile.module.css'
import { Ladder, PackCard } from './cards'
import { PeChrome } from './chrome'
import { peFonts } from './fonts'
import { MODES, ModeGlyph, ModeMark } from './modes'

export const dynamic = 'force-dynamic'

// The room is charcoal, so the browser chrome is too.
export const viewport: Viewport = {
  themeColor: '#141311',
  width: 'device-width',
  initialScale: 1,
}

const TITLE = 'Pack Empire · Open packs, build an offense'
const DESC =
  'Open eleven card packs, keep one player from each and build the highest-scoring offense on the board. Solo, head-to-head, a live snake draft, or a full league season.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: 'https://thesundaychronicle.app/games/pack-empire/' },
  openGraph: {
    type: 'website',
    url: 'https://thesundaychronicle.app/games/pack-empire/',
    title: TITLE,
    description: DESC,
    siteName: 'The Sunday Chronicle',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
}

/** One face per rarity for the index: the best skill player at each. */
function showcase(): Player[] {
  const skill = [...POOL.QB, ...POOL.RB, ...POOL.WR, ...POOL.TE]
  return RARITIES.map((r) => {
    const of = skill.filter((p) => p.rarity === r && p.img)
    return of.sort((a, b) => b.score - a.score)[0]
  }).filter(Boolean) as Player[]
}

/** The chance any one card is a given rarity, averaged over the eleven
    packs, off the pool as it actually is. */
function oddsBySlot(weights: Record<Rarity, number>): Record<Rarity, number> {
  const acc: Record<Rarity, number> = { common: 0, rare: 0, dynasty: 0, transcendent: 0, immortal: 0 }
  for (const s of SLOTS) {
    const o = packOdds(POOL[s.pool], weights)
    for (const r of RARITIES) acc[r] += o[r] / SLOTS.length
  }
  return acc
}

const pct = (n: number) => `${n < 0.1 ? (n * 100).toFixed(1) : Math.round(n * 100)}%`

const FAN: { pool: keyof typeof POOL; r: number; y: number }[] = [
  { pool: 'OT', r: -27, y: 24 },
  { pool: 'TE', r: -18, y: 10 },
  { pool: 'RB', r: -9, y: 2 },
  { pool: 'QB', r: 0, y: 0 },
  { pool: 'WR', r: 9, y: 2 },
  { pool: 'OG', r: 18, y: 10 },
  { pool: 'C', r: 27, y: 24 },
]

function PackFan() {
  return (
    <div className="pe-fan" aria-hidden>
      {FAN.map((f, i) => (
        <span
          key={f.pool}
          className="pe-fan-pack"
          style={{ '--r': `${f.r}deg`, '--y': `${f.y}px`, zIndex: i === 3 ? 8 : 7 - Math.abs(3 - i) } as React.CSSProperties}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/games/pack-empire/packs/${f.pool.toLowerCase()}.webp`} alt="" />
        </span>
      ))}
    </div>
  )
}

function BoardTop({ rows }: { rows: BestRow[] }) {
  if (rows.length === 0) {
    return <p className="pe-empty">Nothing on the board yet. The first finished run takes the top spot.</p>
  }
  return (
    <div className="pe-top">
      {rows.map((r) => (
        <div key={r.runId} className="pe-top-row">
          <span className="pe-top-rank">{r.rank}</span>
          <span style={{ minWidth: 0 }}>
            <span className="pe-top-name">{r.name}</span>
            <span className="pe-top-tier">{r.display.tier ?? ''}</span>
          </span>
          <span className="pe-top-score">{Number(r.display.accolades ?? r.score).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

export default async function PackEmpireHome() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const mobile = (await getViewMode()) === 'mobile'

  const board = await loadBoard(
    'best',
    { game: 'pack-empire', mode: 'offense', poolId: 'site' },
    user?.id ?? null,
    { limit: 5 }
  ).catch(() => null)
  const top = board && board.kind !== 'career' ? board.rows.slice(0, mobile ? 3 : 5) : []

  const cards = showcase()
  const normal = oddsBySlot(SOLO_WEIGHTS.normal)
  const captain = oddsBySlot(SOLO_WEIGHTS.captain)

  const index = (
    <div className="pe-index">
      {cards.map((p) => (
        <div key={p.rarity} className="pe-index-item">
          <PackCard player={p} revealed />
          <div className="pe-index-odds">
            <span className="pe-index-name" style={{ color: RARITY_LOOK[p.rarity].color }}>
              {RARITY_LOOK[p.rarity].label}
            </span>
            <span className="pe-index-row">
              <span>Any pack</span>
              <b>{pct(normal[p.rarity])}</b>
            </span>
            <span className="pe-index-row">
              <span>Captain pack</span>
              <b>{pct(captain[p.rarity])}</b>
            </span>
          </div>
        </div>
      ))}
    </div>
  )

  if (mobile) {
    return (
      <main className={`pe-theme ${peFonts} ${mobileStyles.root}`}>
        <PeChrome
          mobile
          signedIn={!!user}
          back="/games/"
          backLabel="All games"
          kicker="The Games Page"
          title="Pack"
          titleEm="Empire"
          home
        />

        <div className="pe-wrap">
          <section className="pe-m-hero">
            <div className="pe-kicker">★ Open packs · build an eleven ★</div>
            <h1 className="pe-m-hero-title">
              Pack <span className="pe-em">Empire.</span>
            </h1>
            <p className="pe-m-hero-sub">Eleven packs, five cards in each. Keep one from every pack.</p>
            <PackFan />
            <Link href="/games/pack-empire/play/" className="pe-btn pe-m-cta">
              Build an offense
            </Link>
            <div className="pe-hero-meta">
              <span className="pe-chip">No account</span>
              <span className="pe-chip">{POOL_SIZE} players</span>
              <span className="pe-chip">Five rarities</span>
            </div>
          </section>

          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ 01 · Modes</span>
              <span className="pe-sec-title">Four ways to play</span>
            </div>
            <div className="pe-m-rows">
              {MODES.map((m) => (
                <Link
                  key={m.id}
                  href={m.href}
                  className="pe-m-row"
                  style={{ '--mode': m.color } as React.CSSProperties}
                >
                  <span className="pe-m-ico">
                    <ModeGlyph id={m.id} />
                  </span>
                  <span className="pe-m-row-body">
                    <span className="pe-m-row-name">
                      {m.name} <em>{m.nameEm}</em>
                    </span>
                    <span className="pe-m-row-line">{m.line}</span>
                  </span>
                  <span className="pe-m-row-go">
                    <Chevron />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ 02 · Index</span>
              <span className="pe-sec-title">Five rarities</span>
            </div>
            {index}
          </section>

          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ 03 · Ladder</span>
              <span className="pe-sec-title">Eight tiers</span>
            </div>
            <Ladder score={-1} />
          </section>

          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ 04 · Board</span>
              <span className="pe-sec-title">Best offenses</span>
              <Link href="/games/pack-empire/board/" className="pe-sec-meta pe-link">
                All
              </Link>
            </div>
            <BoardTop rows={top} />
          </section>
        </div>

        <MobileGamesDock signedIn={!!user} boardHref="/games/pack-empire/board/" />
      </main>
    )
  }

  return (
    <main className={`pe-theme ${peFonts}`}>
      <PeChrome
        mobile={false}
        signedIn={!!user}
        back="/games/"
        backLabel="Back"
        kicker="The Games Page"
        title="Pack"
        titleEm="Empire"
        home
      />

      <div className="pe-wrap">
        <header className="pe-hero">
          <div>
            <div className="pe-kicker">★ Open packs · build an eleven ★</div>
            <h1 className="pe-hero-title">
              Pack
              <br />
              <span className="pe-em">Empire.</span>
            </h1>
            <p className="pe-hero-lede">
              Eleven positions, eleven sealed packs, five cards in each. Keep one from every pack, stack
              the rarities, and see how high your offense climbs.
            </p>
            <div className="pe-hero-ctas">
              <Link href="/games/pack-empire/play/" className="pe-btn">
                Build an offense
              </Link>
              <Link href="/games/pack-empire/board/" className="pe-btn pe-btn--ghost">
                The board
              </Link>
            </div>
            <div className="pe-hero-meta">
              <span className="pe-chip">No account to play</span>
              <span className="pe-chip">{POOL_SIZE} players</span>
              <span className="pe-chip">Five rarities</span>
            </div>
          </div>
          <PackFan />
        </header>

        <section className="pe-sec">
          <div className="pe-sec-head">
            <span className="pe-sec-num">§ 01 · Modes</span>
            <span className="pe-sec-title">Four ways to play</span>
            <span className="pe-sec-meta">Offense unit</span>
          </div>
          <div className="pe-modes">
            {MODES.map((m) => (
              <Link
                key={m.id}
                href={m.href}
                className="pe-mode"
                style={{ '--mode': m.color } as React.CSSProperties}
              >
                <span className="pe-mode-art">
                  <ModeMark id={m.id} />
                </span>
                <span className="pe-mode-body">
                  <span className="pe-mode-no">{m.no}</span>
                  <span className="pe-mode-name">
                    {m.name} <em>{m.nameEm}</em>
                  </span>
                  <span className="pe-mode-line">{m.line}</span>
                  <span className="pe-mode-foot">
                    <span className="pe-chip">{m.chip}</span>
                    <span className="pe-mode-go">Play</span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="pe-sec">
          <div className="pe-sec-head">
            <span className="pe-sec-num">§ 02 · Index</span>
            <span className="pe-sec-title">Five rarities</span>
            <span className="pe-sec-meta">Odds per card</span>
          </div>
          {index}
          <p className="pe-index-foot">
            Every card in a pack is drawn on its own, weighted by rarity, and one card in every pack draws
            off a richer table. The captain pack deals off the captain table for all five. These are the
            real figures off today&apos;s pool, averaged over the eleven packs.
          </p>
        </section>

        <div className="pe-twoup pe-sec">
          <section>
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ 03 · Ladder</span>
              <span className="pe-sec-title">Eight tiers</span>
            </div>
            <Ladder score={-1} />
          </section>
          <section>
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ 04 · Board</span>
              <span className="pe-sec-title">Best offenses</span>
              <Link href="/games/pack-empire/board/" className="pe-sec-meta pe-link">
                Full board
              </Link>
            </div>
            <BoardTop rows={top} />
          </section>
        </div>

        <div className="pe-soon">
          <span className="pe-chip">In development</span>
          <span>
            <b>Defense unit.</b> Linemen, linebackers and the secondary, eleven packs of them.
          </span>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
