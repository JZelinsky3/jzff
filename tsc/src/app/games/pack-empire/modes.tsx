// The four ways to play, described once for both front pages.
//
// Peers that must not look alike: each mode carries its own colour and its
// own drawing, because four cards in one shape with four different sentences
// read as one list.

import { PACK_ART } from '@/lib/packEmpire/rules'

export type ModeDef = {
  id: 'solo' | 'versus' | 'mega' | 'league'
  no: string
  name: string
  nameEm: string
  line: string
  chip: string
  href: string
  color: string
}

export const MODES: ModeDef[] = [
  {
    id: 'solo',
    no: 'I.',
    name: 'Empire',
    nameEm: 'Builder',
    line: 'Pick a captain, open eleven packs and post your best offense to the board.',
    chip: 'No account',
    href: '/games/pack-empire/play/',
    color: '#e8a84b',
  },
  {
    id: 'versus',
    no: 'II.',
    name: 'Versus',
    nameEm: 'Challenge',
    line: 'Send a friend the link. You each draft your own eleven and the bigger total wins.',
    chip: 'Two players',
    href: '/games/pack-empire/versus/',
    color: '#e2725b',
  },
  {
    id: 'mega',
    no: 'III.',
    name: 'Mega',
    nameEm: 'Draft',
    line: 'One shared board of thirty-six. A live snake draft, and every pick is one they don’t get.',
    chip: 'Live',
    href: '/games/pack-empire/mega-draft/',
    color: '#5fb3e8',
  },
  {
    id: 'league',
    no: 'IV.',
    name: 'League',
    nameEm: 'Mode',
    line: 'Eight weeks of drafts with keepers, chemistry and boosted packs, then a Gauntlet and a Final.',
    chip: '4 to 12 players',
    href: '/games/pack-empire/league/',
    color: '#b48cf0',
  },
]

/** The desktop card's art plate: the moment each mode puts you in. */
export function ModeMark({ id }: { id: ModeDef['id'] }) {
  if (id === 'solo') {
    // A hand of packs, the middle one lifted and lit: the run you're about to
    // open, big enough to fill its plate.
    return (
      <span className="pe-mk pe-mk-fan">
        <span className="pe-mk-fan-glow" />
        <span className="pe-mk-pack l" style={{ backgroundImage: `url(${PACK_ART.RB})` }} />
        <span className="pe-mk-pack r" style={{ backgroundImage: `url(${PACK_ART.WR})` }} />
        <span className="pe-mk-pack c" style={{ backgroundImage: `url(${PACK_ART.QB})` }} />
      </span>
    )
  }
  if (id === 'versus') {
    return (
      <span className="pe-mk pe-mk-vs">
        <span className="pe-mk-vs-row win">
          <span>You</span>
          <b>14,220</b>
        </span>
        <span className="pe-mk-vs-bar">VS</span>
        <span className="pe-mk-vs-row">
          <span>Them</span>
          <b>12,985</b>
        </span>
      </span>
    )
  }
  if (id === 'mega') {
    const tones = ['#c87840', '#42c0f8', '#ffd700', '#c87840', '#e040ff', '#42c0f8', '#28dc78', '#c87840']
    return (
      <span className="pe-mk pe-mk-grid">
        {Array.from({ length: 24 }, (_, i) => (
          <span
            key={i}
            className={[3, 8, 14, 15, 21].includes(i) ? 'taken' : undefined}
            style={{ '--c': tones[(i * 5) % tones.length] } as React.CSSProperties}
          />
        ))}
      </span>
    )
  }
  return (
    <span className="pe-mk pe-mk-table">
      <span className="pe-mk-table-week">Week 6 of 8</span>
      {[
        ['1', '78%'],
        ['2', '64%'],
        ['3', '55%'],
        ['4', '41%'],
      ].map(([n, w]) => (
        <span key={n} className="pe-mk-table-row">
          <span>{n}</span>
          <i style={{ width: w }} />
          <span>{n === '1' ? 'Elite' : ''}</span>
        </span>
      ))}
    </span>
  )
}

/** The phone row's icon: the same idea at 19px. */
export function ModeGlyph({ id }: { id: ModeDef['id'] }) {
  const paths: Record<ModeDef['id'], React.ReactNode> = {
    solo: (
      <>
        <path d="M6.5 3.5h11l-.8 1.6.8 1.6v10.6l-.8 1.6.8 1.6h-11l.8-1.6-.8-1.6V6.7l.8-1.6z" />
        <path d="m12 9.2.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" />
      </>
    ),
    versus: (
      <>
        <path d="M4 5.5h7v13H4z" />
        <path d="M13 5.5h7v13h-7z" />
        <path d="M7.5 12h0M16.5 12h0" />
      </>
    ),
    mega: (
      <>
        <path d="M4 4h4.5v5.5H4zM9.75 4h4.5v5.5h-4.5zM15.5 4H20v5.5h-4.5z" />
        <path d="M4 14.5h4.5V20H4zM15.5 14.5H20V20h-4.5z" />
      </>
    ),
    league: (
      <>
        <path d="M7 4.5h10v3.5a5 5 0 0 1-10 0z" />
        <path d="M12 13v3.5M8.5 19.5h7" />
        <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3M17 6h2.5a2.5 2.5 0 0 1-2.6 3" />
      </>
    ),
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[id]}
    </svg>
  )
}
