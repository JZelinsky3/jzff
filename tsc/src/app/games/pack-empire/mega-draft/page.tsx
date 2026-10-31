import type { Metadata, Viewport } from 'next'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { listMega } from '@/lib/packEmpire/mega'
import { friendPicker } from '@/lib/friends'
import mobileStyles from '../../mobile.module.css'
import { GameList } from '../GameList'
import { splitGames, type GameRow } from '../gameRows'
import { PeChrome, PeDock } from '../chrome'
import { peFonts } from '../fonts'
import { MegaLobby } from './MegaLobby'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = {
  title: 'Mega Draft · Pack Empire',
  description: 'A live two-player snake draft off one shared board of thirty-six players.',
}

const STATUS: Record<string, { label: string; color: string }> = {
  waiting: { label: 'Waiting for a seat', color: '#8d8473' },
  live: { label: 'Live', color: '#5fb3e8' },
  done: { label: 'Final', color: '#68a878' },
}

export default async function MegaDraftLobby() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const mobile = (await getViewMode()) === 'mobile'
  const [mine, friends] = user ? await Promise.all([listMega(user.id), friendPicker(user.id)]) : [[], []]

  const games = splitGames(
    mine.map(
      (d): GameRow => ({
        id: d.id,
        href: `/games/pack-empire/mega-draft/${d.id}/`,
        opponent: d.opponent ?? 'Anyone',
        status: d.waitingOnYou
          ? { label: 'Sent to you', color: '#e8a84b' }
          : d.yourPick
            ? { label: 'Your pick', color: '#e8a84b' }
            : STATUS[d.status],
        code: d.id,
        done: d.status === 'done',
        yours: d.yourScore,
        theirs: d.theirScore,
        canDelete: d.canDelete,
        onYou: d.waitingOnYou || d.yourPick,
      })
    )
  )

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()}>
      <PeChrome
        active="mega"
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/"
        backLabel="Pack Empire"
        kicker="Pack Empire"
        title="Mega"
        titleEm="Draft"
      />

      <div className="pe-wrap pe-wrap--narrow" style={{ margin: '0 auto' }}>
        <div className="pe-table-head">
          <div className="pe-kicker">★ Mode III · live ★</div>
          <h1 className="pe-table-title">
            One board, <span className="pe-em">two drafters.</span>
          </h1>
          <p className="pe-table-sub">
            Thirty-six players on the table, at least one star at every position. Snake order, eleven
            picks each, and every man you take is one they can&apos;t. Against a friend or the CPU.
          </p>
        </div>

        {games.onYou.length > 0 && (
          <section className="pe-sec pe-sec--first">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Now</span>
              <span className="pe-sec-title">Waiting On You</span>
            </div>
            <GameList api="/api/games/pack-empire/mega/" rows={games.onYou} />
          </section>
        )}

        <MegaLobby signedIn={!!user} friends={friends} />

        <section className="pe-sec">
          <div className="pe-sec-head">
            <span className="pe-sec-num">§ How it works</span>
          </div>
          <div className="pe-rules">
            <div className="pe-rule">
              <span>
                <b>The board is dealt when the draft opens:</b> four quarterbacks, four backs, eight receivers,
                four tight ends, six tackles, six guards and four centers.
              </span>
            </div>
            <div className="pe-rule">
              <span>
                <b>A coin decides who picks first,</b> then it snakes: one, two, two, one, one, two.
              </span>
            </div>
            <div className="pe-rule">
              <span>
                <b>Fill all eleven slots.</b> You can only take a man you have a slot for. Bigger total wins.
              </span>
            </div>
          </div>
        </section>

        {user && games.waiting.length > 0 && (
          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Out</span>
              <span className="pe-sec-title">In Progress</span>
            </div>
            <GameList api="/api/games/pack-empire/mega/" rows={games.waiting} />
          </section>
        )}

        {user && games.finished.length > 0 && (
          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Past</span>
              <span className="pe-sec-title">Finished</span>
              <span className="pe-sec-meta">{games.finished.length} played</span>
            </div>
            <GameList api="/api/games/pack-empire/mega/" rows={games.finished} />
          </section>
        )}
      </div>

      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
