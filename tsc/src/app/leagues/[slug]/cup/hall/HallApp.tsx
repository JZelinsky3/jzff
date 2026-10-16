'use client'

// The Cup Hall of Fame, four rooms:
//   Champions  the trophy's bands, a year each: who won it, from which
//              seed, the final, and the run that got them there
//   Managers   every manager's Cup career: titles, finals, record, scoring,
//              and a mark for how far they got each year
//   Records    the Cup's own records, struck as medallions
//   Challenge  the bracket challenge all-time, and the stamp collectors

import Link from 'next/link'
import { useState } from 'react'
import type { CupHall, HallBand, HallFinish, HallManager } from '@/lib/cup/hall'
import { trophy } from '@/lib/cup/trophy'
import cup from '../cup.module.css'
import h from './hall.module.css'

type Room = 'champions' | 'managers' | 'records' | 'challenge'

const ROOMS: [Room, string][] = [
  ['champions', 'Champions'],
  ['managers', 'Managers'],
  ['records', 'Records'],
  ['challenge', 'Challenge'],
]

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase()
}

const pts = (n: number | null) => (n == null ? '' : n.toFixed(2))

// ?room= opens a tab directly (the Cup's Leaders links to the Challenge).
const isRoom = (r: string | undefined): r is Room => ROOMS.some(([id]) => id === r)

export function HallApp({ hall, leagueName, cupHref, room: asked }: { hall: CupHall; leagueName: string; cupHref: string; room?: string }) {
  const [room, setRoomState] = useState<Room>(isRoom(asked) ? asked : 'champions')
  const setRoom = (r: Room) => {
    setRoomState(r)
    try {
      const u = new URL(window.location.href)
      if (r === 'champions') u.searchParams.delete('room')
      else u.searchParams.set('room', r)
      window.history.replaceState(null, '', u)
    } catch {}
  }
  const champions = hall.bands.filter((b) => b.champion)
  const running = hall.bands.find((b) => !b.champion) ?? null

  return (
    <div className={h.hall}>
      <header className={h.mast}>
        <div className={h.mastInner}>
          <div className={h.mastText}>
            <p className={h.kicker}>
              {leagueName} · Since {hall.since}
            </p>
            <h1 className={h.title}>
              {hall.name} <em>Hall of Fame</em>
            </h1>
            <p className={h.lede}>Every Cup, every champion, every record.</p>
            <dl className={h.tally}>
              <div>
                <dt>Cups</dt>
                <dd>{hall.years.length}</dd>
              </div>
              <div>
                <dt>Champions</dt>
                <dd>{new Set(champions.map((b) => b.champion!.name)).size}</dd>
              </div>
              <div>
                <dt>Games</dt>
                <dd>{hall.gamesPlayed}</dd>
              </div>
              <div>
                <dt>Stamps</dt>
                <dd>{hall.stampsTotal}</dd>
              </div>
            </dl>
          </div>
          <Monument bands={hall.bands} />
        </div>
      </header>

      <nav className={cup.tabs} aria-label="The Hall">
        <div className={cup.tabsInner}>
          {ROOMS.map(([id, label]) => (
            <button key={id} type="button" className={`${cup.tab} ${room === id ? cup.tabOn : ''}`} onClick={() => setRoom(id)} aria-pressed={room === id}>
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div className={h.body}>
        {room === 'champions' ? <Champions bands={hall.bands} running={running} cupHref={cupHref} /> : null}
        {room === 'managers' ? <Managers hall={hall} /> : null}
        {room === 'records' ? <Records hall={hall} running={running} /> : null}
        {room === 'challenge' ? <Challenge hall={hall} cupHref={cupHref} /> : null}
      </div>
    </div>
  )
}

// ── The trophy on its barrel: a band per year, oldest at the top ──

function Monument({ bands }: { bands: HallBand[] }) {
  // Always one blank band below the newest, for the year to come.
  const next = (bands[bands.length - 1]?.year ?? new Date().getFullYear()) + 1
  return (
    <div className={h.monument} aria-hidden>
      <span className={h.halo} />
      {trophy({ width: 112, brass: '#c8a35b', light: '#e6cb8e', dark: '#7d6230', plate: '#0d2a21' })}
      <div className={h.barrel}>
        {bands.map((b) => (
          <span key={b.year} className={`${h.band} ${b.champion ? '' : h.bandBlank}`}>
            <b>{b.year}</b>
            <span>{b.champion ? b.champion.name : b.round ? b.round.name : 'Drawn'}</span>
          </span>
        ))}
        <span className={`${h.band} ${h.bandBlank}`}>
          <b>{next}</b>
          <span>&nbsp;</span>
        </span>
      </div>
    </div>
  )
}

// ── Champions ──

function Champions({ bands, running, cupHref }: { bands: HallBand[]; running: HallBand | null; cupHref: string }) {
  const won = bands.filter((b) => b.champion)
  const titles = new Map<string, number>()
  for (const b of won) titles.set(b.champion!.name, (titles.get(b.champion!.name) ?? 0) + 1)
  const roll = [...titles.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
  return (
    <section className={h.room}>
      {roll.length ? (
        <div className={h.roll}>
          <span className={h.rollLabel}>Titles</span>
          {roll.map(([name, n]) => (
            <span key={name} className={h.rollChip}>
              {name}
              <b>{n > 1 ? `${n}×` : '1'}</b>
            </span>
          ))}
        </div>
      ) : null}

      <div className={h.plates}>
        {running ? (
          <Link href={running.href} className={`${h.plate} ${h.plateOpen}`}>
            <span className={h.plateYear}>{running.year}</span>
            <div className={h.plateMain}>
              <p className={h.plateKicker}>{running.state === 'before' ? 'Drawn' : 'Being played'}</p>
              <p className={h.plateName}>{running.round ? `The ${running.round.name.toLowerCase()}, week ${running.round.week}` : 'Round one is next'}</p>
              <p className={h.plateLine}>Still in: {running.alive.map((a) => `${a.name} (${a.seed})`).join(', ')}</p>
              <span className={h.plateGo}>Open the Cup</span>
            </div>
          </Link>
        ) : null}
        {[...won].reverse().map((b) => (
          <Link key={b.year} href={b.href} className={h.plate}>
            <span className={h.plateYear}>{b.year}</span>
            <div className={h.plateMain}>
              <p className={h.plateKicker}>
                {ordinal(b.champion!.seed)} seed{b.champion!.team && b.champion!.team !== b.champion!.name ? ` · ${b.champion!.team}` : ''}
              </p>
              <p className={h.plateName}>{b.champion!.name}</p>
              {b.final && b.runnerUp ? (
                <p className={h.plateLine}>
                  Beat {b.runnerUp.name} in the final, <b>{pts(b.final[0])}</b> to {pts(b.final[1])}
                </p>
              ) : null}
              <ol className={h.path}>
                {b.path.map((p, i) => (
                  <li key={i} className={p.opp ? '' : h.pathBye}>
                    <span className={h.pathRound}>{p.round}</span>
                    {p.opp ? (
                      <span className={h.pathGame}>
                        {p.opp} <small>({p.oppSeed})</small> <b>{pts(p.mine)}</b>-{pts(p.theirs)}
                      </span>
                    ) : (
                      <span className={h.pathGame}>Bye</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </Link>
        ))}
      </div>
      {!won.length ? <p className={h.empty}>No name on the trophy yet. The first goes on the week the final is played.</p> : null}
      <p className={h.note}>
        Every bracket stays up: <Link href={cupHref}>open the Cup</Link> and pick a year.
      </p>
    </section>
  )
}

// ── Managers ──

const FINISH_TEXT: Record<HallFinish, string> = { W: 'Won the Cup', F: 'Lost the final', SF: 'Out in the semifinals', QF: 'Out in the quarterfinals', R1: 'Out in an early round', IN: 'Still alive' }

function Mark({ f }: { f: HallFinish | null }) {
  if (!f) return <span className={`${h.mark} ${h.markNone}`} aria-label="Not in it" />
  const label = f === 'W' ? '★' : f === 'IN' ? '' : f
  return (
    <span className={`${h.mark} ${h[`mark${f}`]}`} title={FINISH_TEXT[f]} aria-label={FINISH_TEXT[f]}>
      {label}
    </span>
  )
}

function Managers({ hall }: { hall: CupHall }) {
  const current = hall.managers.filter((m) => m.current)
  const alumni = hall.managers.filter((m) => !m.current)
  const podium = current.filter((m) => m.titles || m.finals || m.w).slice(0, 3)
  return (
    <section className={h.room}>
      {podium.length ? (
        <div className={h.podium}>
          {podium.map((m, i) => (
            <div key={m.person} className={`${h.medal} ${[h.gold, h.silver, h.bronze][i]}`}>
              <span className={h.medalDisc}>{initials(m.name)}</span>
              <div className={h.medalText}>
                <span className={h.medalName}>{m.name}</span>
                <span className={h.medalLine}>
                  {m.titles ? `${m.titles} ${m.titles === 1 ? 'title' : 'titles'}` : `${m.finals} ${m.finals === 1 ? 'final' : 'finals'}`} · {m.w}-{m.l}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className={h.register}>
        <div className={h.regHead}>
          <span>Manager</span>
          <span className={h.regYears}>
            {hall.years.map((y) => (
              <span key={y}>&apos;{String(y).slice(2)}</span>
            ))}
          </span>
        </div>
        {current.map((m) => (
          <RegisterRow key={m.person} m={m} />
        ))}
        {alumni.length ? (
          <>
            <div className={h.regGroup}>Alumni</div>
            {alumni.map((m) => (
              <RegisterRow key={m.person} m={m} />
            ))}
          </>
        ) : null}
      </div>
      <p className={h.legend}>
        <Mark f="W" /> Won <Mark f="F" /> Final <Mark f="SF" /> Semis <Mark f="QF" /> Quarters <Mark f="R1" /> Earlier <Mark f="IN" /> Alive
      </p>
    </section>
  )
}

function RegisterRow({ m }: { m: HallManager }) {
  return (
    <div className={h.regRow}>
      <div className={h.regWho}>
        <span className={h.regName}>
          {m.name}
          {m.titles ? <span className={h.regStars}>{'★'.repeat(Math.min(m.titles, 4))}</span> : null}
        </span>
        <span className={h.regLine}>
          {m.w}-{m.l}
          {m.ppg != null ? ` · ${m.ppg.toFixed(1)} ppg` : ''}
          {m.finals ? ` · ${m.finals} ${m.finals === 1 ? 'final' : 'finals'}` : ''}
          {m.upsets ? ` · ${m.upsets} ${m.upsets === 1 ? 'upset' : 'upsets'}` : ''}
        </span>
      </div>
      <span className={h.regYears}>
        {m.years.map((y, i) => (
          <Mark key={i} f={y ? y.finish : null} />
        ))}
      </span>
    </div>
  )
}

// ── Records ──

function Records({ hall, running }: { hall: CupHall; running: HallBand | null }) {
  if (!hall.records.length) {
    return (
      <section className={h.room}>
        <p className={h.empty}>No Cup game is settled yet. The first records go up {running?.round ? `once week ${running.round.week} is final` : 'after round one'}.</p>
      </section>
    )
  }
  return (
    <section className={h.room}>
      <div className={h.medallions}>
        {hall.records.map((r) => (
          <article key={r.id} className={h.rec}>
            <div className={h.recCoin}>
              <span className={h.recValue}>{r.value}</span>
              <span className={h.recUnit}>{r.unit}</span>
            </div>
            <div className={h.recText}>
              <p className={h.recLabel}>{r.label}</p>
              <p className={h.recWho}>{r.who}</p>
              <p className={h.recLine}>{r.line}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

// ── Challenge ──

function Challenge({ hall, cupHref }: { hall: CupHall; cupHref: string }) {
  const board = hall.pickers
  const top = board[0]?.points ?? 0
  const collectors = [...board].filter((p) => p.stamps).sort((x, y) => y.stamps - x.stamps || y.gold - x.gold || x.name.localeCompare(y.name)).slice(0, 5)
  if (!board.length) {
    return (
      <section className={h.room}>
        <p className={h.empty}>No picks are settled yet. Points go up as each round finishes.</p>
        <p className={h.note}>
          <Link href={cupHref}>Make your picks in the Cup</Link>
        </p>
      </section>
    )
  }
  return (
    <section className={h.room}>
      <h2 className={h.head}>The Bracket Challenge, All Time</h2>
      <ol className={h.board}>
        {board.map((p, i) => (
          <li key={p.person} className={h.boardRow}>
            <span className={`${h.boardRank} ${i < 3 ? h[`rank${i + 1}`] : ''}`}>{i + 1}</span>
            <div className={h.boardWho}>
              <span className={h.boardName}>
                {p.name}
                {p.wins ? <span className={h.regStars} title="Bracket challenges won">{'★'.repeat(Math.min(p.wins, 4))}</span> : null}
              </span>
              <span className={h.boardBar}>
                <i style={{ width: `${top ? Math.max(4, (p.points / top) * 100) : 0}%` }} />
              </span>
              <span className={h.boardLine}>
                {p.decided ? `${p.correct} of ${p.decided} right` : 'No picks settled'}
                {p.calledIt ? ` · champion called${p.calledIt > 1 ? ` ×${p.calledIt}` : ''}` : ''}
              </span>
            </div>
            <span className={h.boardPts}>
              {p.points}
              <small>pts</small>
            </span>
          </li>
        ))}
      </ol>

      {collectors.length ? (
        <>
          <h2 className={h.head}>Stamp Collectors</h2>
          <div className={h.collectors}>
            {collectors.map((p) => (
              <div key={p.person} className={h.collector}>
                <span className={h.collectorNum}>{p.stamps}</span>
                <span className={h.collectorName}>{p.name}</span>
                <span className={h.collectorLine}>
                  {p.kinds} kinds{p.gold ? ` · ${p.gold} gold` : ''}
                </span>
              </div>
            ))}
          </div>
          <p className={h.note}>
            Every stamp book is in the Cup, under <Link href={cupHref}>Leaders</Link>.
          </p>
        </>
      ) : null}
    </section>
  )
}
