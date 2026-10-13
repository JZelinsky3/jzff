import Link from 'next/link'
import type { AdminData } from './data'
import { Accounts, Downloads, Library, NeedsYou, Rooms, Section, Tiles } from './parts'
import { LeagueList, MemberList } from './lists'
import { fmtDay } from './format'
import s from './admin.module.css'

// The control room on a phone, where Joey checks it most. App controls, not
// the desktop page squeezed: a slim bar, counters two by two, tappable rows,
// and a dock in place of the site's hamburger (hidden under .m in the CSS).

const DOCK: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: '#today', label: 'Today', icon: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></> },
  { href: '#members', label: 'Members', icon: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></> },
  { href: '#leagues', label: 'Leagues', icon: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><line x1="9" y1="9" x2="15" y2="9" /></> },
  { href: '#rooms', label: 'Pages', icon: <><rect x="5" y="3" width="14" height="18" rx="1" /><line x1="15" y1="12" x2="15" y2="12.01" /></> },
]

function needsLine(items: AdminData['attention']): string {
  if (items.length === 0) return 'All quiet.'
  const act = items.filter((a) => a.tone === 'rust').length
  return act ? `${act} to act on · ${items[0].title}` : items[0].title
}

export function MobileAdmin({ data, filter }: { data: AdminData; filter?: string }) {
  return (
    <main className={`${s.root} ${s.m}`}>
      <header className={s.mbar}>
        <Link href="/dashboard" className={s.mbarIco} aria-label="Your library">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 5.5C6.5 4 9.5 4 12 5.5v14c-2.5-1.5-5.5-1.5-8 0z" /><path d="M20 5.5C17.5 4 14.5 4 12 5.5v14c2.5-1.5 5.5-1.5 8 0z" />
          </svg>
        </Link>
        <div className={s.mbarTitle}>
          <span className={s.mbarKicker}>Site admin · {fmtDay(data.asOf, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          The <em>Overseer.</em>
        </div>
        <span className={s.mbarIco} aria-hidden />
      </header>

      <div className={s.wrap}>
        <section id="today" className={s.anchor}>
          <Tiles tiles={data.tiles} days={data.stripDays} />
        </section>

        {/* Closed by default on a phone: it's long and rarely urgent yet. The
            summary still says how many and whether any need acting on. */}
        <details className={`${s.drawerBox} ${s.needsDrawer}`}>
          <summary>
            <span className={s.needsHead}>
              <span className={s.kicker}>Needs you</span>
              {data.attention.length > 0 && <span className={s.countPill}>{data.attention.length}</span>}
              <svg className={s.drawerChev} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
            </span>
            <span className={s.drawerSub}>{needsLine(data.attention)}</span>
          </summary>
          <NeedsYou items={data.attention} />
        </details>

        <Section kicker="Accounts" side={<span className={s.sideNote}>{data.members.length} members</span>}>
          <Accounts a={data.accounts} />
        </Section>

        <Section kicker="Library">
          <Library lib={data.library} nudge={data.followNudge} />
        </Section>

        <Section id="members" kicker="Members" className={s.anchor}>
          <MemberList key={filter ?? 'all'} members={data.members} asOf={data.asOf} initial={20} initialFilter={filter} />
        </Section>

        <Section id="leagues" kicker="Leagues" side={<span className={s.sideNote}>{data.leagues.length} with data</span>} className={s.anchor}>
          <LeagueList leagues={data.leagues} asOf={data.asOf} initial={20} />
        </Section>

        <Section id="rooms" kicker="Pages" className={s.anchor}>
          <Rooms rooms={data.rooms} />
        </Section>

        {data.emptyLeagues.length > 0 && (
          <details id="empty" className={`${s.drawerBox} ${s.anchor}`}>
            <summary>
              <span className={s.kicker}>Empty leagues · {data.emptyLeagues.length}</span>
              <span className={s.drawerSub}>No data ever synced.</span>
            </summary>
            <LeagueList leagues={data.emptyLeagues} asOf={data.asOf} initial={10} empty />
          </details>
        )}

        <Section kicker="Downloads">
          <Downloads />
        </Section>
      </div>

      <nav className={s.dock} aria-label="Jump to">
        {DOCK.map((d) => (
          <a key={d.href} href={d.href} className={s.dockItem}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d.icon}</svg>
            <span>{d.label}</span>
          </a>
        ))}
      </nav>
    </main>
  )
}
