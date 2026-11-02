// /games/pack-empire/builder
//
// Empire Builder's front page: both ways to open the packs, all four difficulties,
// where each board stands today and where you stand on it. The table itself is
// /play/, which this page sends you to already set up.

import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { runLeaders } from '@/lib/packEmpire/boardRuns'
import { loadBuilderHub, type HubBoard } from '@/lib/packEmpire/builderHub'
import { peMeta } from '@/lib/packEmpire/meta'
import {
  BUILDER_FORMATS,
  DIFFICULTY_LOOK,
  FORMAT_LOOK,
  PACK_ART,
  WILD_PACK_ART,
  boardLabel,
  builderQuery,
  isDifficulty,
  type BuilderFormat,
  type Difficulty,
  type Player,
} from '@/lib/packEmpire/rules'
import mobileStyles from '../../mobile.module.css'
import { RunRow } from '../BoardRows'
import { PeChrome, PeDock } from '../chrome'
import { peFonts } from '../fonts'
import { TierBadge } from '../TierBadge'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#141311',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = peMeta({
  title: 'Empire Builder · Pack Empire',
  description:
    'Pick a captain, open eleven packs and keep one player from each. Classic or Mystery, four difficulties, eight boards.',
  card: { c: 'builder' },
  alt: 'Empire Builder',
  url: 'https://thesundaychronicle.app/games/pack-empire/builder/',
})

const play = (b: { diff: Difficulty; format: BuilderFormat }) => `/games/pack-empire/play/${builderQuery(b.diff, b.format)}`
const board = (b: { diff: Difficulty; format: BuilderFormat }) => `/games/pack-empire/board/${builderQuery(b.diff, b.format)}`
const here = (b: { diff: Difficulty; format: BuilderFormat }) => `/games/pack-empire/builder/${builderQuery(b.diff, b.format)}#today`

/** Classic is a hand of position packs; Mystery is the one black pack. */
function FormatArt({ format }: { format: BuilderFormat }) {
  if (format === 'mystery') {
    return (
      <span className="pe-bh-art pe-bh-art--mys" aria-hidden>
        <span className="pe-bh-pack" style={{ backgroundImage: `url(${WILD_PACK_ART})` }} />
      </span>
    )
  }
  return (
    <span className="pe-bh-art" aria-hidden>
      <span className="pe-bh-pack l" style={{ backgroundImage: `url(${PACK_ART.RB})` }} />
      <span className="pe-bh-pack r" style={{ backgroundImage: `url(${PACK_ART.WR})` }} />
      <span className="pe-bh-pack c" style={{ backgroundImage: `url(${PACK_ART.QB})` }} />
    </span>
  )
}

function BoardRowLine({ b, signedIn }: { b: HubBoard; signedIn: boolean }) {
  const top = b.today[0]
  return (
    <li className="pe-bh-row">
      <Link href={play(b)} className="pe-bh-row-main">
        <b>{DIFFICULTY_LOOK[b.diff].label}</b>
        <span>{DIFFICULTY_LOOK[b.diff].line}</span>
      </Link>
      <div className="pe-bh-row-stats">
        <span className="pe-bh-stat">
          <small>Top Today</small>
          {top ? <b>{top.score.toLocaleString()}</b> : <em>Nobody yet</em>}
        </span>
        {signedIn && (
          <span className="pe-bh-stat">
            <small>Your Best</small>
            {b.yourBest != null ? <b>{b.yourBest.toLocaleString()}</b> : <em>None yet</em>}
          </span>
        )}
      </div>
      <div className="pe-bh-row-go">
        <Link href={play(b)} className="pe-push pe-push--sm">
          Play
        </Link>
        <Link href={board(b)} className="pe-link">
          Board
        </Link>
      </div>
    </li>
  )
}

function Today({ boards, pick, leaders, viewerId }: { boards: HubBoard[]; pick: HubBoard; leaders: Map<string, Player>; viewerId: string | null }) {
  const total = boards.reduce((sum, b) => sum + b.runsToday, 0)
  return (
    <>
      <div className="pe-bh-tabs">
        {BUILDER_FORMATS.map((format) => (
          <nav key={format} className="pe-bh-tabrow" data-f={format} aria-label={`${FORMAT_LOOK[format].label} boards`}>
            <span className="pe-bh-tabfmt">{FORMAT_LOOK[format].label}</span>
            {boards
              .filter((b) => b.format === format)
              .map((b) => (
                <Link
                  key={b.diff}
                  href={here(b)}
                  scroll={false}
                  aria-current={b === pick ? 'page' : undefined}
                  className="pe-bh-tab"
                >
                  {DIFFICULTY_LOOK[b.diff].label}
                  {b.runsToday > 0 && <i>{b.runsToday}</i>}
                </Link>
              ))}
          </nav>
        ))}
      </div>

      {pick.today.length === 0 ? (
        <p className="pe-empty pe-bh-none">
          Nobody has posted a {boardLabel(pick.diff, pick.format)} run today. The first one takes the top spot.
        </p>
      ) : (
        <div className="pe-top pe-bh-list">
          {pick.today.map((r) => (
            <RunRow key={r.runId} row={r} led={leaders.get(r.runId)} face dated mine={viewerId != null && r.userId === viewerId} />
          ))}
        </div>
      )}
      <p className="pe-bh-foot">
        {total.toLocaleString()} {total === 1 ? 'run' : 'runs'} across every board since midnight ET. One run a person here, their best.{' '}
        <Link href={board(pick)} className="pe-link">
          Full {boardLabel(pick.diff, pick.format)} board
        </Link>
      </p>
    </>
  )
}

/** The best run anyone has posted today on any board, for the top of the page. */
function Leader({ boards }: { boards: HubBoard[] }) {
  const all = boards.flatMap((b) => b.today.slice(0, 1).map((r) => ({ b, r })))
  const lead = all.sort((x, y) => y.r.score - x.r.score)[0]
  if (!lead) return null
  return (
    <Link href={here(lead.b)} scroll={false} className="pe-bh-lead">
      <small>Best Today</small>
      <b>{lead.r.score.toLocaleString()}</b>
      <span>
        {lead.r.name} · {boardLabel(lead.b.diff, lead.b.format)}
      </span>
      <TierBadge score={lead.r.score} />
    </Link>
  )
}

export default async function BuilderHubPage({ searchParams }: { searchParams: Promise<{ diff?: string; f?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const viewerId = user?.id ?? null
  const mobile = (await getViewMode()) === 'mobile'

  const boards = await loadBuilderHub(viewerId).catch(() => [] as HubBoard[])
  const want = { diff: isDifficulty(sp.diff) ? sp.diff : 'open', format: sp.f === 'mystery' ? 'mystery' : 'classic' }
  // With nothing asked for, open on the busiest board today.
  const asked = sp.diff != null || sp.f != null
  const pick =
    boards.find((b) => b.diff === want.diff && b.format === want.format && asked) ??
    [...boards].sort((a, b) => b.runsToday - a.runsToday)[0]
  const leaders = pick ? await runLeaders(pick.today).catch(() => new Map<string, Player>()) : new Map<string, Player>()

  return (
    <main className={`pe-theme ${peFonts}${mobile ? ` ${mobileStyles.root}` : ''}`}>
      <PeChrome
        active="solo"
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/"
        backLabel="Pack Empire"
        kicker="Pack Empire"
        title="Empire"
        titleEm="Builder"
      />

      <div className="pe-wrap pe-bh">
        <header className="pe-bh-head">
          <div>
            {!mobile && <div className="pe-kicker">★ Solo · offense unit ★</div>}
            {!mobile && (
              <h1 className="pe-table-title">
                Empire <span className="pe-em">Builder.</span>
              </h1>
            )}
            <p className="pe-bh-lede">
              Pick a captain, open eleven packs and keep one player from each. Two ways to open them, four ways to see
              the cards, and every one is its own board.
            </p>
          </div>
          <Leader boards={boards} />
        </header>

        <section className="pe-sec">
          <div className="pe-sec-head">
            <span className="pe-sec-num">§ 01 · Tables</span>
            <span className="pe-sec-title">Pick a table</span>
          </div>
          <div className="pe-bh-formats">
            {BUILDER_FORMATS.map((format) => (
              <article key={format} className="pe-bh-fmt" data-f={format}>
                <header className="pe-bh-fmt-head">
                  <FormatArt format={format} />
                  <div>
                    <h2>{FORMAT_LOOK[format].label}</h2>
                    <p>{FORMAT_LOOK[format].line}</p>
                  </div>
                </header>
                <ul className="pe-bh-rows">
                  {boards
                    .filter((b) => b.format === format)
                    .map((b) => (
                      <BoardRowLine key={b.diff} b={b} signedIn={!!user} />
                    ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {pick && (
          <section className="pe-sec" id="today">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ 02 · Today</span>
              <span className="pe-sec-title">Top runs today</span>
              <span className="pe-sec-meta">Since midnight ET</span>
            </div>
            <Today boards={boards} pick={pick} leaders={leaders} viewerId={viewerId} />
          </section>
        )}
      </div>

      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
