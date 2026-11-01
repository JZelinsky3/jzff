import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { loadBoard, type BestRow } from '@/lib/minigames/leaderboard'
import { peMeta } from '@/lib/packEmpire/meta'
import { POOL, POOL_SIZE, cardWeight, playerById } from '@/lib/packEmpire/pool'
import { parseSoloPicks } from '@/lib/packEmpire/solo'
import { binderTotals, type BinderTotals } from '@/lib/packEmpire/binder'
import { loadFaces, type FaceMap } from '@/lib/packEmpire/faces'
import { dayKey } from '@/lib/packEmpire/daily'
import { ruleForDay } from '@/lib/packEmpire/dayRules'
import {
  RARITIES,
  RARITY_LOOK,
  SLOTS,
  SOLO_WEIGHTS,
  packOdds,
  type Player,
  type Rarity,
  type Weights,
} from '@/lib/packEmpire/rules'
import { Chevron } from '../MobileGameBar'
import mobileStyles from '../mobile.module.css'
import { Ladder, PackCard, RarityGem } from './cards'
import { PeChrome, PeDock } from './chrome'
import { peFonts } from './fonts'
import { MODES, ModeGlyph, ModeMark } from './modes'
import { TierBadge } from './TierBadge'

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

export const metadata: Metadata = peMeta({
  title: TITLE,
  description: DESC,
  card: { c: 'home' },
  alt: 'Pack Empire',
  url: 'https://thesundaychronicle.app/games/pack-empire/',
})

/** One face per rarity for the index: the best recent skill player at each. */
function showcase(): Player[] {
  const skill = [...POOL.QB, ...POOL.RB, ...POOL.WR, ...POOL.TE]
  return RARITIES.map((r) => {
    const of = skill.filter((p) => p.rarity === r && p.img && (p.year ?? 0) >= 2000)
    return of.sort((a, b) => b.score - a.score)[0]
  }).filter(Boolean) as Player[]
}

/** The chance any one card is a given rarity, averaged over the eleven
    packs, off the pool as it actually is. Base odds only: the boosted card in
    each pack is a bonus the page doesn't print (Joey's call). */
function oddsBySlot(weights: Weights): Record<Rarity, number> {
  const acc: Record<Rarity, number> = { common: 0, rare: 0, dynasty: 0, transcendent: 0, immortal: 0, canton: 0 }
  for (const s of SLOTS) {
    const o = packOdds(POOL[s.pool], (p) => cardWeight(p, weights))
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

/** The best card in each run, off the picks it posted. A run from an older
    pool has ids that no longer resolve, so it just doesn't get one. */
async function runLeaders(rows: BestRow[]): Promise<Map<string, Player>> {
  const out = new Map<string, Player>()
  if (rows.length === 0) return out
  const [{ data }, faces] = await Promise.all([
    createAdminClient()
      .from('game_runs')
      .select('id, detail')
      .in(
        'id',
        rows.map((r) => r.runId)
      ),
    loadFaces().catch(() => ({} as FaceMap)),
  ])
  for (const run of (data ?? []) as { id: string; detail: { picks?: unknown } | null }[]) {
    const cards = (parseSoloPicks(run.detail?.picks) ?? []).flatMap((p) => playerById(p.id) ?? [])
    const best = cards.sort((a, b) => b.score - a.score)[0]
    if (best) out.set(run.id, { ...best, img: faces[best.id] ?? best.img })
  }
  return out
}

function BoardTop({ rows, leaders }: { rows: BestRow[]; leaders?: Map<string, Player> }) {
  if (rows.length === 0) {
    return <p className="pe-empty">Nothing on the board yet. The first finished run takes the top spot.</p>
  }
  return (
    <div className="pe-top">
      {rows.map((r) => {
        const led = leaders?.get(r.runId)
        return (
          <div
            key={r.runId}
            className={`pe-top-row${leaders ? ' pe-top-row--card' : ''}`}
            style={led ? ({ '--rc': RARITY_LOOK[led.rarity].color } as React.CSSProperties) : undefined}
          >
            <span className="pe-top-rank">{r.rank}</span>
            {leaders && (
              <span className="pe-top-face" aria-hidden>
                {led?.img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={led.img} alt="" loading="lazy" />
                ) : (
                  (r.name.trim()[0] ?? '?').toUpperCase()
                )}
              </span>
            )}
            <span className="pe-top-who">
              <span className="pe-top-name">{r.name}</span>
              {led && (
                <span className="pe-top-led">
                  Led by <b>{led.name}</b>
                  {led.year ? ` ${led.year}` : ''}
                </span>
              )}
            </span>
            <span className="pe-top-run">
              <span className="pe-top-score">{Number(r.display.accolades ?? r.score).toLocaleString()}</span>
              <TierBadge score={r.score} />
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Where the binder stands, or what it is if there's nobody to keep one for. */
function BinderStrip({ totals }: { totals: BinderTotals | null }) {
  if (!totals) {
    return (
      <div className="pe-bd-strip-home">
        <p>
          The card you keep from every pack goes in a binder, each player&apos;s cards best to worst, with
          how many times you&apos;ve pulled each one.
        </p>
        <Link href="/login?next=%2Fgames%2Fpack-empire%2Fbinder%2F" className="pe-btn pe-btn--ghost pe-btn--sm">
          Sign in to keep one
        </Link>
      </div>
    )
  }
  return (
    <Link href="/games/pack-empire/binder/" className="pe-bd-strip-home pe-bd-strip-home--in">
      <span className="pe-bd-strip-home-num">
        {totals.owned.toLocaleString()}
        <em>/{totals.cards.toLocaleString()}</em>
      </span>
      <span className="pe-bd-strip-home-rar">
        {[...RARITIES].reverse().map((r) => (
          <span key={r} style={{ color: RARITY_LOOK[r].color }}>
            {RARITY_LOOK[r].short} {totals.byRarity[r].owned}/{totals.byRarity[r].of}
          </span>
        ))}
      </span>
      <span className="pe-btn pe-btn--ghost pe-btn--sm">Open the binder</span>
    </Link>
  )
}

/** Today's rule on the front page: the Daily's whole pitch is that it changed. */
function DailyStrip() {
  const rule = ruleForDay(dayKey())
  return (
    <Link href="/games/pack-empire/daily/" className="pe-today">
      <span className="pe-today-ico">
        <ModeGlyph id="daily" />
      </span>
      <span className="pe-today-body">
        <span className="pe-today-kicker">Today&apos;s Daily · {rule.title}</span>
        <span className="pe-today-line">
          {rule.line} Blind cards, wild packs, one try.
        </span>
      </span>
      <span className="pe-btn pe-btn--sm pe-today-go">Play</span>
    </Link>
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

  const binder = user ? await binderTotals(user.id).catch(() => null) : null
  const leaders = mobile ? undefined : await runLeaders(top).catch(() => new Map<string, Player>())

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
              <RarityGem rarity={p.rarity} />
              {RARITY_LOOK[p.rarity].label}
            </span>
            <span className="pe-index-row">
              <span>Each card</span>
              <b>{pct(normal[p.rarity])}</b>
            </span>
            <span className="pe-index-row">
              <span>Captain card</span>
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
            <div className="pe-kicker">★ Open packs · build an offense ★</div>
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
              <span className="pe-chip">{POOL_SIZE} cards</span>
              <span className="pe-chip">Five rarities</span>
            </div>
          </section>

          <DailyStrip />

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

          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ 05 · Binder</span>
              <span className="pe-sec-title">Your cards</span>
            </div>
            <BinderStrip totals={binder} />
          </section>
        </div>

        <PeDock signedIn={!!user} />
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
            <div className="pe-kicker">★ Open packs · build an offense ★</div>
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
              <span className="pe-chip">{POOL_SIZE} cards</span>
              <span className="pe-chip">Five rarities</span>
            </div>
          </div>
          <PackFan />
        </header>

        <DailyStrip />

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
            Every card in a pack is drawn on its own, weighted by rarity. The captain pack deals off the
            captain table for all five. These are the base odds off today&apos;s pool, averaged over the
            eleven packs.
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
            <BoardTop rows={top} leaders={leaders} />
          </section>
        </div>

        <section className="pe-sec">
          <div className="pe-sec-head">
            <span className="pe-sec-num">§ 05 · Binder</span>
            <span className="pe-sec-title">Your cards</span>
            <span className="pe-sec-meta">Every card you&apos;ve pulled</span>
          </div>
          <BinderStrip totals={binder} />
        </section>

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
