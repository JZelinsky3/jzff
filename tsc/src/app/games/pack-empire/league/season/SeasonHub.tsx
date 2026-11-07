'use client'

// A Season league's home (lib/packEmpire/season.ts): your next game and its
// scouting report, the pack the last game paid, how the last game went, the
// table, the schedule of fronts, the bracket once it's set, and the
// commissioner's switches. Every button is one server call that hands back the
// whole view.

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { SLOTS, WILD_PACK_ART, type Player } from '@/lib/packEmpire/rules'
import { BENCH_MAX, seasonPlayoffOptions } from '@/lib/packEmpire/seasonRules'
import type { MySeason, ScoutView, SeasonView, TableRow } from '@/lib/packEmpire/season'
import { PackStage, usePackStage } from '../../stage'

async function post(body: Record<string, unknown>): Promise<SeasonView | null> {
  const res = await fetch('/api/games/pack-empire/season/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Something went wrong.')
  return (out.view as SeasonView | null) ?? null
}

const LANE_LABEL = { run: 'Run', short: 'Short', deep: 'Deep', redZone: 'Red Zone' } as const

const laneWord = (eff: number) => (eff >= 1.1 ? 'Open' : eff <= 0.85 ? 'Shut' : 'Even')

function pocketWord(p: number) {
  if (p >= 1.1) return 'Clean pocket'
  if (p >= 0.9) return 'Normal pocket'
  if (p >= 0.7) return 'Under pressure'
  return 'Collapsing'
}

function edgeWord(expected: number, line: number | null) {
  if (line == null) return null
  const d = expected - line
  if (d >= 3) return { text: 'Favored', tone: 'up' }
  if (d <= -3) return { text: 'Tough Week', tone: 'down' }
  return { text: 'Toss-Up', tone: 'even' }
}

const gameHref = (league: string, team: string, phase: string, week: number) =>
  `/games/pack-empire/league/season/${league}/game/?t=${team}&p=${phase}&w=${week}`

export function SeasonHub({ initial }: { initial: SeasonView }) {
  const [view, setView] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const l = view.league
  const me = view.me

  const act = useCallback(
    async (key: string, body: Record<string, unknown>) => {
      setBusy(key)
      setError(null)
      try {
        const v = await post({ id: l.id, ...body })
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

  return (
    <div className="pe-sn">
      {error && <div className="pe-error">{error}</div>}

      {me && me.step !== 'season' && l.phase !== 'pregame' && (
        <section className="pe-sn-card pe-sn-call">
          <div className="pe-kicker">Draft Day</div>
          <h2 className="pe-sn-title">Build your team.</h2>
          <p className="pe-panel-text">
            Your Franchise Pack on a slot of your choosing, a pack for every slot, then three wild packs for the bench. Once it&apos;s done, the eight games are yours to play whenever you like.
          </p>
          <Link href={`/games/pack-empire/league/season/${l.id}/draft/`} className="pe-btn">
            {me.step === 'franchise' ? 'Start Draft Day' : 'Back To Draft Day'}
          </Link>
        </section>
      )}

      {me?.pending && <RewardPack key={`${me.games.length}`} leagueId={l.id} me={me} busy={busy} act={act} onView={setView} />}

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

      {me?.last && (
        <section className="pe-sn-card pe-sn-last" data-won={me.last.won == null ? undefined : String(me.last.won)}>
          <div className="pe-sn-head">
            <span className="pe-kicker">
              {me.last.phase === 'regular' ? `Game ${me.last.week}` : `Playoffs · Round ${me.last.week}`} · {me.last.defense}
            </span>
            {me.last.won != null && <span className="pe-sn-stamp">{me.last.won ? 'Win' : 'Loss'}</span>}
          </div>
          <div className="pe-sn-score">
            <b>{me.last.points}</b>
            <span>{me.last.line != null ? `needed ${me.last.line}` : me.last.opponent ? `vs ${me.last.opponent}` : ''}</span>
          </div>
          <div className="pe-sn-drives" aria-label="How each drive ended">
            {me.last.drives.map((d, i) => (
              <i key={i} data-end={d}>
                {d === 'td' ? 'TD' : d === 'fg' ? 'FG' : d === 'turnover' ? 'TO' : d === 'miss' ? 'MISS' : 'PUNT'}
              </i>
            ))}
          </div>
          <ul className="pe-sn-top">
            {me.last.top.map((b) => (
              <li key={b.id}>
                <span>{b.name}</span>
                <em>{statLine(b)}</em>
              </li>
            ))}
          </ul>
          <Link href={gameHref(l.id, me.id, me.last.phase, me.last.week)} className="pe-act pe-act--sm">
            Box Score
          </Link>
        </section>
      )}

      {me?.next && <NextGame me={me} busy={busy} act={act} />}

      {me?.waiting && (
        <section className="pe-sn-card pe-sn-wait">
          <div className="pe-kicker">{l.phase === 'regular' ? 'Season done' : 'Playoffs'}</div>
          <p className="pe-panel-text">{me.waiting}</p>
        </section>
      )}

      {me && l.phase === 'complete' && (
        <section className="pe-sn-card pe-sn-wait">
          <div className="pe-kicker">Final</div>
          <p className="pe-panel-text">
            {view.table.find((r) => r.champion)?.you
              ? 'You won it all.'
              : `${view.table.find((r) => r.champion)?.teamName ?? 'Nobody'} won it all. Your season is in the Stat Book.`}
          </p>
        </section>
      )}

      {me && me.step === 'season' && (
        <nav className="pe-sn-links">
          <Link href={`/games/pack-empire/league/season/${l.id}/team/`} className="pe-act">
            Your Team · Subs
          </Link>
          <Link href={`/games/pack-empire/league/season/${l.id}/book/`} className="pe-act">
            Stat Book
          </Link>
        </nav>
      )}

      {view.bracket && <Bracket view={view} />}

      <Table view={view} />

      <Schedule view={view} />

      {l.owner && <Commish view={view} busy={busy} act={act} />}
    </div>
  )
}

function statLine(b: { pos: string; passYds?: number; passTd?: number; int?: number; rushYds?: number; rushTd?: number; rec?: number; recYds?: number; recTd?: number }) {
  const parts: string[] = []
  if (b.passYds) parts.push(`${b.passYds} pass`)
  if (b.rushYds) parts.push(`${b.rushYds} rush`)
  if (b.recYds) parts.push(`${b.rec ?? 0}-${b.recYds}`)
  const td = (b.passTd ?? 0) + (b.rushTd ?? 0) + (b.recTd ?? 0)
  if (td) parts.push(`${td} TD`)
  if (b.int) parts.push(`${b.int} INT`)
  return parts.join(' · ') || 'Quiet day'
}

type Act = (key: string, body: Record<string, unknown>) => Promise<boolean>

function NextGame({ me, busy, act }: { me: MySeason; busy: string | null; act: Act }) {
  const n = me.next!
  const s: ScoutView = n.scouting
  const edge = edgeWord(s.expected, n.line)
  return (
    <section className="pe-sn-card pe-sn-scout">
      <div className="pe-sn-head">
        <span className="pe-kicker">{n.phase === 'regular' ? `Game ${n.week} of 8` : `Playoffs · Round ${n.week}`} · Scouting Report</span>
        {edge && <span className="pe-sn-edge" data-tone={edge.tone}>{edge.text}</span>}
      </div>
      <h2 className="pe-sn-title">{n.defense.name}</h2>
      <p className="pe-panel-text">{n.defense.blurb}</p>

      <dl className="pe-sn-spec">
        <div>
          <dt>Shuts down</dt>
          <dd>{n.defense.shuts}</dd>
        </div>
        <div>
          <dt>Soft against</dt>
          <dd>{n.defense.soft}</dd>
        </div>
      </dl>

      <div className="pe-sn-proj">
        <div>
          <small>Projected</small>
          <b>{s.expected.toFixed(1)}</b>
        </div>
        <div>
          <small>{n.line != null ? 'To win' : 'Opponent'}</small>
          <b>{n.line != null ? n.line : (n.opponent ?? 'TBD')}</b>
        </div>
        <div>
          <small>Your calls</small>
          <b>{Math.round(s.passShare * 100)}% pass</b>
        </div>
      </div>

      <div className="pe-sn-lanes">
        {s.lanes.map((x) => (
          <div key={x.lane} className="pe-sn-lane" data-word={laneWord(x.eff)}>
            <span>{LANE_LABEL[x.lane]}</span>
            <i>
              <em style={{ width: `${Math.min(100, (x.eff / 1.6) * 100)}%` }} />
            </i>
            <b>{laneWord(x.eff)}</b>
          </div>
        ))}
        <div className="pe-sn-lane" data-word={s.pocket >= 0.9 ? 'Even' : 'Shut'}>
          <span>Pocket</span>
          <i>
            <em style={{ width: `${Math.min(100, (s.pocket / 1.25) * 100)}%` }} />
          </i>
          <b>{pocketWord(s.pocket)}</b>
        </div>
      </div>

      {(s.stopped.length > 0 || s.helped.length > 0) && (
        <div className="pe-sn-chips">
          {s.stopped.map((name) => (
            <span key={`s${name}`} data-tone="down">
              {name}
            </span>
          ))}
          {s.helped.map((name) => (
            <span key={`h${name}`} data-tone="up">
              {name}
            </span>
          ))}
        </div>
      )}

      {s.sub && (
        <div className="pe-sn-sub">
          <span>
            Start <b>{s.sub.in.name}</b> over {s.sub.out.name} at {SLOTS[s.sub.slot].short}: about +{s.sub.gain} projected.
          </span>
          <button type="button" className="pe-act pe-act--sm" disabled={!!busy} onClick={() => act('sub', { action: 'sub', bench: s.sub!.in.id, slot: s.sub!.slot })}>
            {busy === 'sub' ? 'Subbing' : 'Make The Sub'}
          </button>
        </div>
      )}

      <button type="button" className="pe-push pe-sn-play" disabled={!!busy} onClick={() => act('play', { action: 'play' })}>
        {busy === 'play' ? 'Playing' : n.phase === 'regular' ? `Play Game ${n.week}` : 'Play The Playoff Game'}
      </button>
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
        next = await post({ id: leagueId, action: 'keep', card: c.id })
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
                Let {b.name} go
              </button>
            ))}
          </div>
          <button type="button" className="pe-act" disabled={!!busy} onClick={() => act('keep', { action: 'keep', card: null })}>
            Pass On This Pack
          </button>
        </>
      ) : (
        <>
          <p className="pe-panel-text">Five cards, one position. The one you keep goes to your bench.</p>
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

function Table({ view }: { view: SeasonView }) {
  const l = view.league
  const cut = l.phase === 'regular' || l.phase === 'pregame' ? Math.min(l.playoffSize, view.table.length) : null
  return (
    <section className="pe-sec pe-sn-sec">
      <div className="pe-sec-head">
        <span className="pe-sec-num">§ Table</span>
        <span className="pe-sec-title">Standings</span>
      </div>
      <div className="pe-sn-table" role="table">
        <div className="pe-sn-tr pe-sn-th" role="row">
          <span>#</span>
          <span>Team</span>
          <span>W-L</span>
          <span>Pts</span>
          <span>Played</span>
        </div>
        {view.table.map((r: TableRow, i) => (
          <div
            key={r.id}
            className={`pe-sn-tr${r.you ? ' you' : ''}${cut != null && i === cut - 1 ? ' cut' : ''}${r.eliminated ? ' out' : ''}`}
            role="row"
          >
            <span>{r.seed ?? i + 1}</span>
            <span className="pe-sn-team">
              <b>{r.teamName}</b>
              <small>
                {r.owner}
                {r.champion ? ' · Champion' : ''}
              </small>
            </span>
            <span>
              {r.wins}-{r.losses}
            </span>
            <span>{r.pointsFor}</span>
            <span>{r.drafted ? `${r.played} of 8` : l.phase === 'pregame' ? 'Waiting' : 'Drafting'}</span>
          </div>
        ))}
      </div>
      {cut != null && (
        <p className="pe-note">
          The top {cut} make the playoffs{cut < view.table.length && 2 ** Math.ceil(Math.log2(cut)) > cut ? ', the best seeds with byes' : ''}.
        </p>
      )}
    </section>
  )
}

function Schedule({ view }: { view: SeasonView }) {
  const mine = new Map((view.me?.games ?? []).filter((g) => g.phase === 'regular').map((g) => [g.week, g]))
  return (
    <section className="pe-sec pe-sn-sec">
      <div className="pe-sec-head">
        <span className="pe-sec-num">§ Schedule</span>
        <span className="pe-sec-title">Eight Fronts</span>
      </div>
      <ol className="pe-sn-sched">
        {view.schedule.map((w) => {
          const g = mine.get(w.week)
          return (
            <li key={w.week} data-won={g ? String(!!g.won) : undefined}>
              <span className="pe-sn-wk">{w.week}</span>
              <span className="pe-sn-front">
                <b>{w.defense.name}</b>
                <small>Shuts {w.defense.shuts.toLowerCase()}</small>
              </span>
              <span className="pe-sn-need">{g ? `${g.points} · ${g.won ? 'W' : 'L'}` : `Need ${w.line}`}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Bracket({ view }: { view: SeasonView }) {
  const rounds = view.bracket!.rounds
  const name = (r: number) => (rounds.length - r === 0 ? 'The Final' : rounds.length - r === 1 ? 'Semifinals' : rounds.length - r === 2 ? 'Quarterfinals' : `Round ${r}`)
  return (
    <section className="pe-sec pe-sn-sec">
      <div className="pe-sec-head">
        <span className="pe-sec-num">§ Playoffs</span>
        <span className="pe-sec-title">The Bracket</span>
      </div>
      <div className="pe-sn-bracket">
        {rounds.map((r) => (
          <div key={r.round} className="pe-sn-round">
            <div className="pe-sn-round-head">
              <b>{name(r.round)}</b>
              <small>vs {r.defense}</small>
            </div>
            {r.games.map((g, i) => (
              <div key={i} className="pe-sn-match">
                {(
                  [
                    [g.a, g.aPts],
                    [g.b, g.bPts],
                  ] as [TableRow | null, number | null][]
                ).map(([row, pts], k) => {
                  return (
                    <div key={k} className={`pe-sn-side${row && g.winner === row.id ? ' won' : ''}${row?.you ? ' you' : ''}`}>
                      <span>{row ? `${row.seed}. ${row.teamName}` : g.a || g.b ? 'Bye' : 'TBD'}</span>
                      <b>{pts ?? ''}</b>
                    </div>
                  )
                })}
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
    <section className="pe-sec pe-sn-sec">
      <div className="pe-sec-head">
        <span className="pe-sec-num">§ Commissioner</span>
        <span className="pe-sec-title">{l.kind === 'solo' ? 'Your Season' : 'Run The League'}</span>
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
            <span className="pe-setup-label">Playoffs</span>
            <div className="pe-sn-pick" role="radiogroup" aria-label="How many make the playoffs">
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
                await post({ id, action: 'delete' })
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
