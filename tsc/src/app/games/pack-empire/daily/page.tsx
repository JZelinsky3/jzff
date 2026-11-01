import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { dailyLobby, dailyScoreLine, dailySpec, type DailyBoard } from '@/lib/packEmpire/daily'
import { dailyViewer } from '@/lib/packEmpire/dailyWho'
import { maskCard } from '@/lib/packEmpire/deal'
import { peMeta } from '@/lib/packEmpire/meta'
import { playerById } from '@/lib/packEmpire/pool'
import { readDaily } from '@/lib/packEmpire/share'
import { CHEM_LINES, DAILY_PACK_SECONDS, DIFFICULTY_LOOK, SLOT_COUNT } from '@/lib/packEmpire/rules'
import mobileStyles from '../../mobile.module.css'
import { PackCard } from '../cards'
import { HowItWorks, PeChrome, PeDock } from '../chrome'
import { peFonts } from '../fonts'
import { DailyTop, longDay, shortDay } from './parts'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ r?: string }> }): Promise<Metadata> {
  const { r } = await searchParams
  const score = readDaily(r)
  const rule = dailySpec(score?.day ?? null)
  if (score) {
    return peMeta({
      title: `${score.score.toLocaleString('en-US')} on ${dailyScoreLine(score.day)}`,
      card: { c: 'day', r },
      alt: 'A score on the Daily',
    })
  }
  return peMeta({
    title: 'The Daily · Pack Empire',
    description: `Today's rule: ${rule.title}. One deal for everyone, one try.`,
    card: { c: 'daily', d: rule.day },
    alt: 'The Daily',
  })
}

const VERSION_LINE: Record<DailyBoard['version'], string> = {
  range: 'A value range and the team on every card. Some ranges are tight, some barely help.',
  season: 'Just the name and the season. No team, no value. For real ball knowers.',
}

/** The card on each game's cover, masked the way it would be dealt. */
const COVER: Record<DailyBoard['version'], string> = {
  range: 'wr-justin-jefferson-2022',
  season: 'qb-tom-brady-2007',
}

function PlayTile({ board }: { board: DailyBoard }) {
  const href = `/games/pack-empire/daily/play/?v=${board.version}`
  const done = board.yourStep === SLOT_COUNT
  const started = board.yourStep != null && !done
  const cover = playerById(COVER[board.version])
  return (
    <div className="pe-dgame" data-v={board.version}>
      {cover && (
        <div className="pe-dgame-art" aria-hidden>
          <PackCard player={maskCard(cover, board.version)} revealed still />
        </div>
      )}
      <div className="pe-dgame-body">
        <div className="pe-dgame-kicker">{done ? 'Played' : started ? 'In Progress' : 'One Try'}</div>
        <h2 className="pe-dgame-title">{DIFFICULTY_LOOK[board.version].label}</h2>
        <p className="pe-dgame-line">{VERSION_LINE[board.version]}</p>
        <div className="pe-dgame-foot">
          {done && board.you ? (
            <Link href={href} className="pe-dplay-done">
              <b>{board.you.score.toLocaleString()}</b>
              <span>
                {board.yourRank === 1 ? 'First' : `No. ${board.yourRank}`} of {board.entrants.toLocaleString()}
              </span>
            </Link>
          ) : (
            <Link href={href} className="pe-btn">
              {started ? `Pick Up At Pack ${(board.yourStep ?? 0) + 1}` : 'Play'}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export default async function DailyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const mobile = (await getViewMode()) === 'mobile'
  const lobby = await dailyLobby(await dailyViewer(user?.id ?? null))

  const rules = (
    <div className="pe-rules">
      <div className="pe-rule">
        <span>
          <b>Everybody opens the same packs in the same order,</b> and you only get one try at each version.
        </span>
      </div>
      <div className="pe-rule">
        <span>
          <b>Every card is blind.</b> No rarity colours, no stats, no running total. It all turns over on your
          last pick.
        </span>
      </div>
      <div className="pe-rule">
        <span>
          <b>The clock runs.</b> You get {DAILY_PACK_SECONDS} seconds a pack from the moment you rip it. Run out
          and the first card that fits signs. There&apos;s no clock between packs.
        </span>
      </div>
      <div className="pe-rule">
        <span>
          <b>Big names aren&apos;t always big seasons.</b> Stars turn up in their worst years here, on purpose.
          On Range, some ranges are tight and some barely tell you anything.
        </span>
      </div>
      <div className="pe-rule">
        <span>
          <b>Packs are wild.</b> Five positions in each. Keep one you have a slot for, and it takes that slot.
          The others stay on the table so you can see what you passed up.
        </span>
      </div>
      <div className="pe-rule">
        <span>
          <b>You can&apos;t get stuck.</b>{' '}
          If nothing in a pack fits, one card is swapped for a reserve at the
          position you need. It&apos;s the same reserve for everyone, and it&apos;s never a star, so leaving a
          position late costs you.
        </span>
      </div>
      <div className="pe-rule">
        <span>
          <b>Chemistry counts double.</b> {CHEM_LINES[1]} One real team is hidden across the packs every day.
        </span>
      </div>
      <div className="pe-rule">
        <span>
          <b>It&apos;s all for the board.</b> Everyone gets these same packs, so nothing from the Daily goes in
          your binder.
        </span>
      </div>
    </div>
  )

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()}>
      <PeChrome
        active="daily"
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/"
        backLabel="Pack Empire"
        kicker="Pack Empire"
        title="The"
        titleEm="Daily"
      />

      <div className="pe-wrap pe-wrap--narrow" style={{ margin: '0 auto' }}>
        <div className="pe-table-head">
          <div className="pe-kicker">★ {longDay(lobby.day)} ★</div>
          <h1 className="pe-table-title">
            Today: <span className="pe-em">{lobby.rule.title}.</span>
          </h1>
          <p className="pe-table-sub">{lobby.rule.line}</p>
        </div>

        <div className="pe-dgames">
          {lobby.boards.map((b) => (
            <PlayTile key={b.version} board={b} />
          ))}
        </div>

        <section className="pe-sec">
          <div className="pe-sec-head">
            <span className="pe-sec-num">§ Today</span>
            <span className="pe-sec-title">Top Lineups</span>
            <span className="pe-sec-meta">New Daily at midnight ET</span>
          </div>
          <div className="pe-twoup">
            {lobby.boards.map((b) => (
              <DailyTop key={b.version} board={b} empty="Nobody has finished this one yet." />
            ))}
          </div>
        </section>

        <HowItWorks mobile={mobile}>{rules}</HowItWorks>

        {lobby.yours.length > 0 && (
          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Yours</span>
              <span className="pe-sec-title">Your Dailies</span>
            </div>
            <div className="pe-row-list">
              {lobby.yours.map((r) => (
                <Link key={`${r.day}-${r.version}`} href={`/games/pack-empire/daily/${r.day}/`} className="pe-row">
                  <span style={{ minWidth: 0 }}>
                    <span className="pe-row-name">{shortDay(r.day)} · {r.title}</span>
                    <span className="pe-row-sub">{DIFFICULTY_LOOK[r.version].label}</span>
                  </span>
                  <span className="pe-row-side">{r.score.toLocaleString()}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {lobby.past.length > 0 && (
          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Past</span>
              <span className="pe-sec-title">Past Days</span>
            </div>
            <div className="pe-row-list">
              {lobby.past.map((d) => (
                <Link key={d.day} href={`/games/pack-empire/daily/${d.day}/`} className="pe-row">
                  <span style={{ minWidth: 0 }}>
                    <span className="pe-row-name">{shortDay(d.day)} · {d.rule.title}</span>
                    <span className="pe-row-sub">
                      {d.winners.map((w) => `${DIFFICULTY_LOOK[w.version].label}: ${w.name}`).join(' · ')}
                    </span>
                  </span>
                  <span className="pe-row-side">{d.winners[0]?.score.toLocaleString()}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
