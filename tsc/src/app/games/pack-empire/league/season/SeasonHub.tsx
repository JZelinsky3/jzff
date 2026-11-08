'use client'

// A Season league's home (lib/packEmpire/season.ts). The main column is the
// game: how the last one went, the pack it paid, the next one and your lineup
// (subs right here). The side column is the league: the bracket once it's set,
// the table and the schedule of defenses, and the commissioner's switches.
//
// Joey, 2026-11-07: the first look has to be easy. So the game card says three
// things, the points you're projected for, the points to win, and what this
// defense stops and allows, with your players it hits marked on their faces.
// Everything a strategist wants (lanes, the pocket, the pass rate) is folded
// under Full Scouting Report.

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { SLOTS, WILD_PACK_ART, surname, type Player } from '@/lib/packEmpire/rules'
import { BENCH_MAX, roundName, seasonPlayoffOptions } from '@/lib/packEmpire/seasonRules'
import type { MySeason, ScoutView, SeasonView, TableRow } from '@/lib/packEmpire/season'
import { Face } from '../../cards'
import { PackStage, usePackStage } from '../../stage'
import { SeasonLineup, VsMark } from './SeasonLineup'
import { gameHref, seasonHref, seasonPost } from './api'

const LANE_LABEL = { run: 'Run game', short: 'Short passes', deep: 'Deep passes', redZone: 'Red zone' } as const

const laneWord = (eff: number) => (eff >= 1.1 ? 'Open' : eff <= 0.85 ? 'Shut' : 'Even')

function pocketWord(p: number) {
  if (p >= 1.1) return 'Clean'
  if (p >= 0.9) return 'Normal'
  if (p >= 0.7) return 'Pressured'
  return 'Collapsing'
}

function edgeWord(expected: number, line: number | null) {
  if (line == null) return null
  const d = expected - line
  if (d >= 3) return { text: 'Favored', tone: 'up' }
  if (d <= -3) return { text: 'Underdog', tone: 'down' }
  return { text: 'Toss-Up', tone: 'even' }
}

type Act = (key: string, body: Record<string, unknown>) => Promise<boolean>

export function SeasonHub({ initial }: { initial: SeasonView }) {
  const [view, setView] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The game just played counts its score up, once.
  const [fresh, setFresh] = useState<string | null>(null)
  const l = view.league
  const me = view.me

  const act = useCallback<Act>(
    async (key, body) => {
      setBusy(key)
      setError(null)
      try {
        const { view: v } = await seasonPost({ id: l.id, ...body })
        if (v) setView(v)
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
        return false
      } finally {
        setBusy(null)
      }
    },
    [l.id]
  )

  const play = async () => {
    const n = me?.games.length ?? 0
    if (await act('play', { action: 'play' })) setFresh(String(n + 1))
  }


  return (
    <div className="pe-sn-hub">
      <div className="pe-sn-hub-main">
        {error && <div className="pe-error">{error}</div>}

        {me && me.step !== 'season' && l.phase !== 'pregame' && (
          <section className="pe-sn-card pe-sn-call">
            <div className="pe-kicker">Draft Day</div>
            <h2 className="pe-sn-title">Build your team.</h2>
            <p className="pe-panel-text">
              A pack for every spot on the field, your Franchise Pack on the one you choose, and three bench packs. Then the eight games are yours to play whenever you like.
            </p>
            <Link href={seasonHref(l.id, 'draft')} className="pe-btn">
              {me.step === 'franchise' ? 'Start Draft Day' : 'Back To Draft Day'}
            </Link>
          </section>
        )}

        {!me && l.kind === 'league' && l.phase === 'pregame' && l.visibility === 'public' && (
          <section className="pe-sn-card pe-sn-call">
            <div className="pe-kicker">Taking teams</div>
            <p className="pe-panel-text">
              {view.table.length} of {l.maxPlayers} teams so far. Join before the commissioner starts the season.
            </p>
            <button type="button" className="pe-push" disabled={!!busy} onClick={() => act('join', { action: 'join' })}>
              {busy === 'join' ? 'Joining' : 'Join This League'}
            </button>
          </section>
        )}

        {me?.last && <LastGame key={`${me.last.phase}${me.last.week}`} leagueId={l.id} me={me} fresh={fresh === String(me.games.length)} />}

        {me?.pending && <RewardPack key={`${me.games.length}`} leagueId={l.id} me={me} busy={busy} act={act} onView={setView} />}

        {me?.next && <GameCard me={me} busy={busy} act={act} play={play} />}

        {me?.waiting && (
          <section className="pe-sn-card pe-sn-wait">
            <div className="pe-kicker">{l.phase === 'regular' ? 'Your season is done' : 'Playoffs'}</div>
            <p className="pe-panel-text">{me.waiting}</p>
          </section>
        )}

        {me && l.phase === 'complete' && <Final view={view} />}

        {me && me.step === 'season' && (
          <section className="pe-sn-block">
            <div className="pe-sn-blockhead">
              <h2>Your Lineup</h2>
              <nav>
                <Link href={seasonHref(l.id, 'team')} className="pe-act pe-act--sm">
                  Full Lineup
                </Link>
                <Link href={seasonHref(l.id, 'book')} className="pe-act pe-act--sm">
                  Stat Book
                </Link>
              </nav>
            </div>
            <SeasonLineup leagueId={l.id} me={me} size="mini" onView={setView} onError={setError} />
          </section>
        )}
      </div>

      <aside className="pe-sn-hub-side">
        {view.bracket && <Bracket view={view} />}
        <Table view={view} />
        <Schedule view={view} />
        {l.owner && <Commish view={view} busy={busy} act={act} />}
      </aside>
    </div>
  )
}

/** A number that counts up from zero when it's new. */
function CountUp({ to, run }: { to: number; run: boolean }) {
  const [n, setN] = useState(run ? 0 : to)
  useEffect(() => {
    if (!run) return
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 900)
      setN(Math.round(to * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, run])
  return <>{n}</>
}

function statLine(b: { passYds?: number; passTd?: number; int?: number; car?: number; rushYds?: number; rushTd?: number; rec?: number; recYds?: number; recTd?: number }) {
  const parts: string[] = []
  if (b.passYds) parts.push(`${b.passYds} pass yds`)
  if (b.recYds) parts.push(`${b.rec ?? 0} rec, ${b.recYds} yds`)
  if (b.rushYds) parts.push(`${b.rushYds} rush yds`)
  const td = (b.passTd ?? 0) + (b.rushTd ?? 0) + (b.recTd ?? 0)
  if (td) parts.push(`${td} TD`)
  if (b.int) parts.push(`${b.int} INT`)
  return parts.join(', ') || 'A quiet day'
}

const findCard = (me: MySeason, id: string): Player | null => me.lineup.find((p) => p?.id === id) ?? me.bench.find((p) => p.id === id) ?? null

const DRIVE_WORD = { td: 'TD', fg: 'FG', miss: 'Missed FG', punt: 'Punt', turnover: 'Turnover' } as const

function LastGame({ leagueId, me, fresh }: { leagueId: string; me: MySeason; fresh: boolean }) {
  const g = me.last!
  const star = g.top[0]
  const starCard = star ? findCard(me, star.id) : null
  const tds = g.drives.filter((d) => d === 'td').length
  const fgs = g.drives.filter((d) => d === 'fg').length
  return (
    <section className={`pe-sn-gd-last${fresh ? ' is-fresh' : ''}`} data-won={g.won == null ? undefined : String(g.won)}>
      <div className="pe-sn-gd-kick">
        <span>
          {g.phase === 'regular' ? `Game ${g.week}` : 'Playoffs'} · {g.defense}
        </span>
        {g.won != null && <b className="pe-sn-gd-stamp">{g.won ? 'Win' : 'Loss'}</b>}
      </div>
      <div className="pe-sn-gd-board">
        <div className="pe-sn-gd-score">
          <b>
            <CountUp to={g.points} run={fresh} />
          </b>
          <small>Your points</small>
        </div>
        <div className="pe-sn-gd-vs">{g.line != null ? (g.won ? 'beat' : 'missed') : 'vs'}</div>
        <div className="pe-sn-gd-score pe-sn-gd-score--line">
          <b>{g.line ?? '?'}</b>
          <small>{g.line != null ? 'To win' : (g.opponent ?? 'Opponent')}</small>
        </div>
      </div>
      <div className="pe-sn-gd-drives" aria-label={`${tds} touchdowns, ${fgs} field goals on ${g.drives.length} drives`}>
        {g.drives.map((d, i) => (
          <i key={i} data-end={d} title={DRIVE_WORD[d]} />
        ))}
        <small>
          {tds} TD · {fgs} FG · {g.yards} yds
        </small>
      </div>
      {star && (
        <div className="pe-sn-gd-star">
          <Face player={starCard} name={star.name} />
          <span>
            <small>Player of the game</small>
            <b>{star.name}</b>
            <em>{statLine(star)}</em>
          </span>
          <strong>
            {star.pts}
            <small>pts</small>
          </strong>
        </div>
      )}
      <Link href={gameHref(leagueId, me.id, g.phase, g.week)} className="pe-act pe-act--sm">
        Box Score
      </Link>
    </section>
  )
}

function GameCard({ me, busy, act, play }: { me: MySeason; busy: string | null; act: Act; play: () => void }) {
  const n = me.next!
  const s: ScoutView = n.scouting
  const edge = edgeWord(s.expected, n.line)
  const stopped = s.stopped.flatMap((id) => findCard(me, id) ?? [])
  const helped = s.helped.flatMap((id) => findCard(me, id) ?? [])
  const proj = Math.round(s.expected)
  const scale = Math.max(proj, n.line ?? 0) * 1.35 || 1

  return (
    <section className="pe-sn-gd-next">
      <div className="pe-sn-gd-kick">
        <span>{n.phase === 'regular' ? `Game ${n.week} of 8` : `Playoffs · ${n.opponent ? `vs ${n.opponent}` : 'This round'}`}</span>
        {edge && (
          <b className="pe-sn-edge" data-tone={edge.tone}>
            {edge.text}
          </b>
        )}
      </div>
      <h2 className="pe-sn-gd-title">
        <small>vs</small> {n.defense.name}
      </h2>
      <p className="pe-sn-gd-blurb">{n.defense.blurb}</p>

      <div className="pe-sn-gd-odds">
        <div className="pe-sn-gd-num">
          <b>{proj}</b>
          <small>You&apos;re projected</small>
        </div>
        {n.line != null ? (
          <div className="pe-sn-gd-meter" data-tone={proj >= n.line ? 'up' : 'down'} aria-hidden>
            <span className="pe-sn-gd-fill" style={{ transform: `scaleX(${Math.min(1, proj / scale)})` }} />
            <span className="pe-sn-gd-mark" style={{ left: `${(n.line / scale) * 100}%` }} />
          </div>
        ) : (
          <p className="pe-sn-gd-po">Both teams face this defense. More points moves on.</p>
        )}
        {n.line != null && (
          <div className="pe-sn-gd-num pe-sn-gd-num--need">
            <b>{n.line}</b>
            <small>To win</small>
          </div>
        )}
      </div>

      <div className="pe-sn-gd-read">
        <div data-tone="down">
          <small>They stop</small>
          <b>{n.defense.stops}</b>
        </div>
        <div data-tone="up">
          <small>They allow</small>
          <b>{n.defense.allows}</b>
        </div>
      </div>

      {(stopped.length > 0 || helped.length > 0) && (
        <div className="pe-sn-gd-who">
          {stopped.map((p) => (
            <span key={p.id} data-tone="down">
              <Face player={p} />
              {surname(p.name)}
              <VsMark vs={-1} />
            </span>
          ))}
          {helped.map((p) => (
            <span key={p.id} data-tone="up">
              <Face player={p} />
              {surname(p.name)}
              <VsMark vs={1} />
            </span>
          ))}
        </div>
      )}

      {s.sub && (
        <div className="pe-sn-gd-tip">
          <span>
            <small>Coach&apos;s call</small>
            Start <b>{surname(s.sub.in.name)}</b> over {surname(s.sub.out.name)} at {SLOTS[s.sub.slot].short}, about +{s.sub.gain} points.
          </span>
          <button type="button" className="pe-act pe-act--sm" disabled={!!busy} onClick={() => act('sub', { action: 'sub', bench: s.sub!.in.id, slot: s.sub!.slot })}>
            {busy === 'sub' ? 'Subbing' : 'Make The Sub'}
          </button>
        </div>
      )}

      <button type="button" className="pe-push pe-sn-gd-play" disabled={!!busy} onClick={play}>
        {busy === 'play' ? 'Playing' : n.phase === 'regular' ? `Play Game ${n.week}` : 'Play The Playoff Game'}
      </button>

      <details className="pe-sn-gd-more">
        <summary>Full Scouting Report</summary>
        <div className="pe-sn-lanes">
          {s.lanes.map((x) => (
            <div key={x.lane} className="pe-sn-lane" data-word={laneWord(x.eff)}>
              <span>{LANE_LABEL[x.lane]}</span>
              <i>
                <em style={{ transform: `scaleX(${Math.min(1, x.eff / 1.6)})` }} />
              </i>
              <b>{laneWord(x.eff)}</b>
            </div>
          ))}
          <div className="pe-sn-lane" data-word={s.pocket >= 0.9 ? 'Even' : 'Shut'}>
            <span>Pocket</span>
            <i>
              <em style={{ transform: `scaleX(${Math.min(1, s.pocket / 1.25)})` }} />
            </i>
            <b>{pocketWord(s.pocket)}</b>
          </div>
        </div>
        <p className="pe-note">
          Your play calling: {Math.round(s.passShare * 100)}% passes against this defense. Built to stop {n.defense.shuts.toLowerCase()}; soft against {n.defense.soft.toLowerCase()}. Better
          players shake a bad matchup more easily: it costs a common the most and an Immortal the least.
        </p>
      </details>
    </section>
  )
}

function RewardPack({
  leagueId,
  me,
  busy,
  act,
  onView,
}: {
  leagueId: string
  me: MySeason
  busy: string | null
  act: Act
  onView: (v: SeasonView) => void
}) {
  const p = me.pending!
  const full = me.bench.length >= BENCH_MAX
  const { stage, open, tear, reveal, revealAll, skip, pick, dismiss } = usePackStage()
  const slot = Math.max(0, SLOTS.findIndex((s) => s.pool === p.cards[0]?.pos))

  const onCard = (i: number) => {
    if (!stage?.cards) return
    if (!stage.revealed[i]) {
      reveal(i)
      return
    }
    // The view only changes once the card has left the stage: swapping it in
    // mid-pick would take the stage down under the animation.
    let next: SeasonView | null = null
    pick(
      i,
      async (c: Player) => {
        next = (await seasonPost({ id: leagueId, action: 'keep', card: c.id })).view
      },
      -1
    ).then((ok) => {
      if (ok && next) onView(next)
    })
  }

  return (
    <section className="pe-sn-card pe-sn-reward" style={{ '--rw': p.color } as React.CSSProperties}>
      <div className="pe-kicker">The game paid a pack</div>
      <h2 className="pe-sn-title">{p.label}</h2>
      {full ? (
        <>
          <p className="pe-panel-text">Your bench is full ({BENCH_MAX}). Let one go to make room, or pass on this pack.</p>
          <div className="pe-sn-release">
            {me.bench.map((b) => (
              <button key={b.id} type="button" className="pe-act pe-act--sm" disabled={!!busy} onClick={() => act('release', { action: 'release', bench: b.id })}>
                Let {surname(b.name)} go
              </button>
            ))}
          </div>
          <button type="button" className="pe-act" disabled={!!busy} onClick={() => act('keep', { action: 'keep', card: null })}>
            Pass On This Pack
          </button>
        </>
      ) : (
        <>
          <p className="pe-panel-text">Five cards, five positions. Keep one for your bench.</p>
          <button type="button" className="pe-push" disabled={!!busy || !!stage} onClick={() => open(slot, async () => p.cards)}>
            Open It
          </button>
        </>
      )}
      {stage && (
        <PackStage
          stage={stage}
          tag={{ text: p.label, color: p.color }}
          onCard={onCard}
          onRevealAll={revealAll}
          onDismiss={dismiss}
          onTear={tear}
          onSkip={skip}
          wild={{ art: WILD_PACK_ART, first: p.label.split(' ')[0], rest: 'Pack' }}
        />
      )}
    </section>
  )
}

function Final({ view }: { view: SeasonView }) {
  const champ = view.table.find((r) => r.champion)
  return (
    <section className="pe-sn-card pe-sn-final" data-you={champ?.you ? 'true' : undefined}>
      <div className="pe-kicker">Season over</div>
      <h2 className="pe-sn-title">{champ?.you ? 'Champions.' : `${champ?.teamName ?? 'Nobody'} won it all.`}</h2>
      <p className="pe-panel-text">The awards and every line from your season are in the Stat Book.</p>
      <Link href={seasonHref(view.league.id, 'book')} className="pe-btn">
        Open The Stat Book
      </Link>
    </section>
  )
}

function Table({ view }: { view: SeasonView }) {
  const l = view.league
  const cut = l.phase === 'regular' || l.phase === 'pregame' ? Math.min(l.playoffSize, view.table.length) : null
  return (
    <section className="pe-sn-block">
      <div className="pe-sn-blockhead">
        <h2>Standings</h2>
        {view.through != null && <small>Through game {view.through}</small>}
      </div>
      <div className="pe-sn-table" role="table">
        <div className="pe-sn-tr pe-sn-th" role="row">
          <span>#</span>
          <span>Team</span>
          <span>W-L</span>
          <span>Pts</span>
        </div>
        {view.table.map((r: TableRow, i) => (
          <div key={r.id} className={`pe-sn-tr${r.you ? ' you' : ''}${cut != null && i === cut - 1 ? ' cut' : ''}${r.eliminated ? ' out' : ''}`} role="row">
            <span>{r.seed ?? i + 1}</span>
            <span className="pe-sn-team">
              <b>{r.teamName}</b>
              <small>
                {r.champion ? 'Champion' : r.owner}
                {l.phase === 'regular' && !r.drafted ? ' · drafting' : ''}
              </small>
            </span>
            <span>
              {r.wins}-{r.losses}
            </span>
            <span>{r.pointsFor}</span>
          </div>
        ))}
      </div>
      {cut != null && (
        <p className="pe-note">
          Top {cut} make the playoffs{cut < view.table.length && 2 ** Math.ceil(Math.log2(cut)) > cut ? ', the best seeds with byes' : ''}.
          {view.through != null ? ' Everyone shows through your games played, so the table fills in as you go.' : ''}
        </p>
      )}
    </section>
  )
}

function Schedule({ view }: { view: SeasonView }) {
  const mine = new Map((view.me?.games ?? []).filter((g) => g.phase === 'regular').map((g) => [g.week, g]))
  const nextWeek = view.me?.next?.phase === 'regular' ? view.me.next.week : null
  return (
    <section className="pe-sn-block">
      <div className="pe-sn-blockhead">
        <h2>Schedule</h2>
        <small>8 defenses</small>
      </div>
      <ol className="pe-sn-sched">
        {view.schedule.map((w) => {
          const g = mine.get(w.week)
          return (
            <li key={w.week} data-won={g ? String(!!g.won) : undefined} data-next={w.week === nextWeek ? 'true' : undefined}>
              <span className="pe-sn-wk">{w.week}</span>
              <span className="pe-sn-front">
                <b>{w.defense.name}</b>
                <small>Stops {w.defense.stops.toLowerCase()}</small>
              </span>
              <span className="pe-sn-need">{g ? `${g.points} ${g.won ? 'W' : 'L'}` : `${w.line} to win`}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Bracket({ view }: { view: SeasonView }) {
  const rounds = view.bracket!.rounds
  return (
    <section className="pe-sn-block">
      <div className="pe-sn-blockhead">
        <h2>Playoffs</h2>
      </div>
      <div className="pe-sn-bracket">
        {rounds.map((r) => (
          <div key={r.round} className="pe-sn-round">
            <div className="pe-sn-round-head">
              <b>{roundName(r.round, rounds.length)}</b>
              <small>vs {r.defense}</small>
            </div>
            {r.games.map((g, i) => (
              <div key={i} className="pe-sn-match">
                {(
                  [
                    [g.a, g.aPts],
                    [g.b, g.bPts],
                  ] as [TableRow | null, number | null][]
                ).map(([row, pts], k) => (
                  <div key={k} className={`pe-sn-side${row && g.winner === row.id ? ' won' : ''}${row?.you ? ' you' : ''}`}>
                    <span>{row ? `${row.seed}. ${row.teamName}` : g.a || g.b ? 'Bye' : 'TBD'}</span>
                    <b>{pts ?? ''}</b>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function Commish({ view, busy, act }: { view: SeasonView; busy: string | null; act: Act }) {
  const l = view.league
  const [arming, setArming] = useState(false)
  const cpus = view.table.filter((r) => r.cpu).length
  const size = l.phase === 'pregame' ? l.maxPlayers : view.table.length
  return (
    <section className="pe-sn-block">
      <div className="pe-sn-blockhead">
        <h2>{l.kind === 'solo' ? 'Your Season' : 'Commissioner'}</h2>
      </div>
      <div className="pe-sn-card pe-sn-commish">
        {l.kind === 'league' && l.joinCode && l.phase === 'pregame' && (
          <div className="pe-sn-code">
            <small>Join code</small>
            <b>{l.joinCode}</b>
          </div>
        )}

        {(l.phase === 'pregame' || l.phase === 'regular') && (
          <div className="pe-setup-row">
            <span className="pe-setup-label">Playoff Teams</span>
            <div className="pe-sn-pick" role="radiogroup" aria-label="How many teams make the playoffs">
              {seasonPlayoffOptions(size).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={n === Math.min(l.playoffSize, size)}
                  disabled={!!busy}
                  onClick={() => act('playoffs', { action: 'playoffs', size: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {l.phase === 'pregame' && (
          <div className="pe-sn-acts">
            <span className="pe-note">
              {view.table.length} of {l.maxPlayers} teams{cpus ? `, ${cpus} CPU` : ''}.
            </span>
            {view.table.length < l.maxPlayers ? (
              <button type="button" className="pe-act" disabled={!!busy} onClick={() => act('cpus', { action: 'cpus', fill: true })}>
                Fill With CPU Teams
              </button>
            ) : cpus > 0 ? (
              <button type="button" className="pe-act" disabled={!!busy} onClick={() => act('cpus', { action: 'cpus', fill: false })}>
                Take The CPUs Out
              </button>
            ) : null}
            <button type="button" className="pe-push" disabled={!!busy || view.table.length < 2} onClick={() => act('start', { action: 'start' })}>
              {busy === 'start' ? 'Starting' : 'Start The Season'}
            </button>
          </div>
        )}

        {l.kind === 'league' && (l.phase === 'regular' || l.phase === 'playoffs') && (
          <div className="pe-sn-acts">
            <span className="pe-note">Someone stalling? Their games play with the lineup they have.</span>
            {arming ? (
              <button type="button" className="pe-act" disabled={!!busy} onClick={() => act('force', { action: 'force' }).then(() => setArming(false))}>
                {l.phase === 'regular' ? 'Yes, Finish The Regular Season' : 'Yes, Finish This Round'}
              </button>
            ) : (
              <button type="button" className="pe-act" onClick={() => setArming(true)}>
                {l.phase === 'regular' ? 'Finish The Regular Season' : 'Finish This Round'}
              </button>
            )}
          </div>
        )}

        {(l.kind === 'solo' || l.phase === 'pregame') && <DeleteSeason id={l.id} />}
      </div>
    </section>
  )
}

function DeleteSeason({ id }: { id: string }) {
  const [arming, setArming] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <div className="pe-sn-acts">
      {arming ? (
        <>
          <span className="pe-note">Delete it for good?</span>
          <button
            type="button"
            className="pe-act pe-act--sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await seasonPost({ id, action: 'delete' })
                window.location.href = '/games/pack-empire/league/'
              } catch {
                setBusy(false)
              }
            }}
          >
            Delete
          </button>
          <button type="button" className="pe-act pe-act--sm" onClick={() => setArming(false)}>
            Keep It
          </button>
        </>
      ) : (
        <button type="button" className="pe-act pe-act--sm" onClick={() => setArming(true)}>
          Delete This Season
        </button>
      )}
    </div>
  )
}
