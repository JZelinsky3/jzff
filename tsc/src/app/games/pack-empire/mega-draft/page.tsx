import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { listMega } from '@/lib/packEmpire/mega'
import mobileStyles from '../../mobile.module.css'
import { PeChrome } from '../chrome'
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
  const mine = user ? await listMega(user.id) : []

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.boardRoot : ''}`.trim()}>
      <PeChrome
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
            picks each, and every man you take is one they can&apos;t.
          </p>
        </div>

        <MegaLobby signedIn={!!user} />

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

        {user && mine.length > 0 && (
          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ Yours</span>
              <span className="pe-sec-title">Your drafts</span>
            </div>
            <div className="pe-row-list">
              {mine.map((d) => {
                const st = STATUS[d.status]
                return (
                  <Link key={d.id} href={`/games/pack-empire/mega-draft/${d.id}/`} className="pe-row">
                    <span style={{ minWidth: 0 }}>
                      <span className="pe-row-name">vs {d.opponent ?? 'Anyone'}</span>
                      <span className="pe-row-sub">
                        <span className="pe-status" style={{ '--st': st.color } as React.CSSProperties}>
                          {st.label}
                        </span>
                        {' · '}
                        {d.id}
                      </span>
                    </span>
                    <span className="pe-row-side">
                      {d.yourScore != null && d.theirScore != null
                        ? `${d.yourScore.toLocaleString()} · ${d.theirScore.toLocaleString()}`
                        : '·'}
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>
        )}
      </div>

      {!mobile && <SiteFooter />}
    </main>
  )
}
