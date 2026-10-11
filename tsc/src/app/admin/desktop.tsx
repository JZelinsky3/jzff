import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import type { AdminData } from './data'
import { Accounts, Downloads, Library, NeedsYou, Rooms, Section, Tiles, asOfLine } from './parts'
import { LeagueList, MemberList } from './lists'
import s from './admin.module.css'

// The control room on a desktop: today up top; what needs a hand and the other
// admin pages beside the money and the library; then the two long lists.

export function DesktopAdmin({ data, filter }: { data: AdminData; filter?: string }) {
  return (
    <main className={s.root}>
      <nav className="nav">
        <Link href="/dashboard" className="dc-nav-icon" aria-label="Back to your library">
          <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <div className="nav-center">
          <div className="nav-kicker">Site admin</div>
          <div className="nav-title">The <em>Overseer.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: 'hidden' }} />
      </nav>

      <div className={s.wrap}>
        <div className={s.dateline}>
          <span>{asOfLine(data.asOf)}</span>
          <span>Your own accounts are left out of every count</span>
        </div>

        <section id="today" className={s.anchor}>
          <Tiles tiles={data.tiles} days={data.stripDays} />
        </section>

        <div className={s.split}>
          <div className={s.splitSide}>
            <Section kicker="Needs you" title={data.attention.length ? <>{data.attention.length} <em>{data.attention.length === 1 ? 'thing' : 'things'}</em></> : <>All <em>quiet</em></>}>
              <NeedsYou items={data.attention} />
            </Section>
            <Section id="rooms" kicker="Rooms" title={<>Every <em>page</em></>} side={<Downloads />} className={`${s.anchor} ${s.roomsTwo}`}>
              <Rooms rooms={data.rooms} />
            </Section>
          </div>
          <div className={s.splitSide}>
            <Section kicker="Accounts" title={<>{data.members.length} <em>members</em></>}>
              <Accounts a={data.accounts} />
            </Section>
            <Section kicker="Library">
              <Library lib={data.library} />
            </Section>
          </div>
        </div>

        <Section id="members" kicker="Members" title={<>Every <em>profile</em></>} className={s.anchor}>
          <MemberList key={filter ?? 'all'} members={data.members} asOf={data.asOf} initial={25} initialFilter={filter} />
        </Section>

        <Section id="leagues" kicker="Leagues" title={<>{data.leagues.length} with <em>data</em></>} className={s.anchor}>
          <LeagueList leagues={data.leagues} asOf={data.asOf} initial={25} />
        </Section>

        {data.emptyLeagues.length > 0 && (
          <details id="empty" className={`${s.drawerBox} ${s.anchor}`}>
            <summary>
              <span className={s.kicker}>Empty leagues · {data.emptyLeagues.length}</span>
              <span className={s.drawerSub}>Never synced any managers. Owners listed for outreach.</span>
            </summary>
            <LeagueList leagues={data.emptyLeagues} asOf={data.asOf} initial={15} empty />
          </details>
        )}
      </div>

      <SiteFooter />
    </main>
  )
}
