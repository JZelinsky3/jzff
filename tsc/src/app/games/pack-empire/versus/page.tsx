import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { listVersus } from '@/lib/packEmpire/versus'
import { friendPicker } from '@/lib/friends'
import { formatLine } from '@/lib/packEmpire/rules'
import mobileStyles from '../../mobile.module.css'
import { GameList } from '../GameList'
import { splitGames, type GameRow } from '../gameRows'
import { PeChrome, PeDock } from '../chrome'
import { peFonts } from '../fonts'
import { ChallengePanels } from './NewChallenge'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = {
  title: 'Versus Challenge · Pack Empire',
  description: 'Send a friend a link. You each open eleven packs, and the bigger offense wins.',
}

const STATUS: Record<string, { label: string; color: string }> = {
  open: { label: 'Waiting for someone', color: '#8d8473' },
  playing: { label: 'In progress', color: '#e8a84b' },
  done: { label: 'Final', color: '#68a878' },
}

export default async function VersusLobby() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const mobile = (await getViewMode()) === 'mobile'
  const [mine, friends] = user ? await Promise.all([listVersus(user.id), friendPicker(user.id)]) : [[], []]

  const games = splitGames(
    mine.map(
      (c): GameRow => ({
        id: c.id,
        href: `/games/pack-empire/versus/${c.id}/`,
        opponent: c.opponent ?? 'Anyone',
        status: c.waitingOnYou
          ? { label: 'Sent to you', color: '#e8a84b' }
          : c.status !== 'done' && c.yourScore == null
            ? { label: 'Your draft', color: '#e8a84b' }
            : STATUS[c.status],
        format: formatLine(c.format, c.difficulty, true),
        done: c.status === 'done',
        yours: c.yourScore,
        theirs: c.theirScore,
        canDelete: c.canDelete,
        // Sent to you, or you've sat down and haven't locked your eleven in.
        onYou: c.waitingOnYou || (c.status !== 'done' && c.yourScore == null),
      })
    )
  )

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()}>
      <PeChrome
        active="versus"
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/"
        backLabel="Pack Empire"
        kicker="Pack Empire"
        title="Versus"
        titleEm="Challenge"
      />

      <div className="pe-wrap pe-wrap--narrow" style={{ margin: '0 auto' }}>
        <div className="pe-table-head">
          <div className="pe-kicker">★ Mode II · two players ★</div>
          <h1 className="pe-table-title">
            Draft against <span className="pe-em">a friend.</span>
          </h1>
          <p className="pe-table-sub">
            You each open your own eleven packs, and whoever builds the bigger offense wins. Send it to a
            friend, or play the CPU.
          </p>
        </div>

        {games.onYou.length > 0 && (
          <section className="pe-sec pe-sec--first">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Now</span>
              <span className="pe-sec-title">Waiting On You</span>
            </div>
            <GameList api="/api/games/pack-empire/versus/" rows={games.onYou} />
          </section>
        )}

        {user ? (
          <ChallengePanels friends={friends} />
        ) : (
          <div className="pe-panel" style={{ textAlign: 'center' }}>
            <p className="pe-panel-text" style={{ marginBottom: '1rem' }}>
              Starting a challenge needs an account, so it has somewhere to come back to. Answering one
              doesn&apos;t: if a friend sent you a link, just open it.
            </p>
            <Link href="/login?next=%2Fgames%2Fpack-empire%2Fversus%2F" className="pe-btn">
              Sign in to start one
            </Link>
          </div>
        )}

        <section className="pe-sec">
          <div className="pe-sec-head">
            <span className="pe-sec-num">§ How it works</span>
          </div>
          <div className="pe-rules">
            <div className="pe-rule">
              <span>
                <b>Open a challenge</b> and draft your eleven: a captain, then eleven packs, one keeper each.
              </span>
            </div>
            <div className="pe-rule">
              <span>
                <b>Send the link.</b> Your friend sees your total and gets their own eleven packs.
              </span>
            </div>
            <div className="pe-rule">
              <span>
                <b>Bigger accolades total wins.</b> Both lineups go up side by side when the second one lands.
              </span>
            </div>
            <div className="pe-rule">
              <span>
                <b>Even</b> gives you both the same eleven packs and no captain. The cards cancel out, so
                chemistry decides it.
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
            <GameList api="/api/games/pack-empire/versus/" rows={games.waiting} />
          </section>
        )}

        {user && (
          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Past</span>
              <span className="pe-sec-title">Finished</span>
              <span className="pe-sec-meta">{games.finished.length ? `${games.finished.length} played` : 'None yet'}</span>
            </div>
            {games.finished.length === 0 ? (
              <p className="pe-empty">Nothing finished yet. Open one and send it to somebody.</p>
            ) : (
              <GameList api="/api/games/pack-empire/versus/" rows={games.finished} />
            )}
          </section>
        )}
      </div>

      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
