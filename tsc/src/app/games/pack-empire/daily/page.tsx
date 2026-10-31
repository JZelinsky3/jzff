import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { dailyLobby, type DailyBoard } from '@/lib/packEmpire/daily'
import { CHEM_LINES, DIFFICULTY_LOOK, SLOT_COUNT } from '@/lib/packEmpire/rules'
import mobileStyles from '../../mobile.module.css'
import { PeChrome, PeDock } from '../chrome'
import { peFonts } from '../fonts'
import { DailyTop, longDay, shortDay } from './parts'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = {
  title: 'The Daily · Pack Empire',
  description: 'One deal for everyone, one try. Blind cards, wild packs and a new rule every day.',
}

const VERSION_LINE: Record<DailyBoard['version'], string> = {
  range: 'A value range and the team on every card.',
  season: 'Just the name and the season. For real ball knowers.',
}

function PlayTile({ board, signedIn }: { board: DailyBoard; signedIn: boolean }) {
  const href = `/games/pack-empire/daily/play/?v=${board.version}`
  const done = board.yourStep === SLOT_COUNT
  const started = board.yourStep != null && !done
  return (
    <div className="pe-panel pe-dplay">
      <div className="pe-kicker">{done ? 'Played' : started ? 'In progress' : 'One try'}</div>
      <div className="pe-panel-title">{DIFFICULTY_LOOK[board.version].label}</div>
      <p className="pe-panel-text">{VERSION_LINE[board.version]}</p>
      <div className="pe-panel-foot">
        {done && board.you ? (
          <Link href={href} className="pe-dplay-done">
            <b>{board.you.score.toLocaleString()}</b>
            <span>
              {board.yourRank === 1 ? 'First' : `No. ${board.yourRank}`} of {board.entrants.toLocaleString()}
            </span>
          </Link>
        ) : signedIn ? (
          <Link href={href} className="pe-btn">
            {started ? `Pick up at pack ${(board.yourStep ?? 0) + 1}` : 'Play'}
          </Link>
        ) : (
          <Link href={`/login?next=${encodeURIComponent(href)}`} className="pe-btn">
            Sign in to play
          </Link>
        )}
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
  const lobby = await dailyLobby(user?.id ?? null)

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

        <div className="pe-twoup">
          {lobby.boards.map((b) => (
            <PlayTile key={b.version} board={b} signedIn={!!user} />
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

        <section className="pe-sec">
          <div className="pe-sec-head">
            <span className="pe-sec-num">§ How it works</span>
          </div>
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
          </div>
        </section>

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
