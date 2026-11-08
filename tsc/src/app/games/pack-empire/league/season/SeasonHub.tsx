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
import { useCallback, useEffect, useRef, useState } from 'react'
import { RARITY_LOOK, SLOTS, surname, type Player } from '@/lib/packEmpire/rules'
import { ARCH_ABBR, GAME_PLANS, PLAN_LOOK, roundName, type GamePlan } from '@/lib/packEmpire/seasonRules'
import type { MySeason, ScoutView, SeasonView, TableRow } from '@/lib/packEmpire/season'
import { Face } from '../../cards'
import { SetupSlider } from '../../SetupSlider'
import { GameCast } from './GameCast'
import { SeasonLineup, VsMark } from './SeasonLineup'
import { SeasonPack } from './SeasonPack'
import { gameHref, seasonHref, seasonPost } from './api'

const LANE_LABEL = { run: 'Run game', short: 'Short passes', deep: 'Deep passes', redZone: 'Red zone', protect: 'Protection' } as const

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
  // The game just played counts its score up, once, after it's been watched.
  const [fresh, setFresh] = useState<string | null>(null)
  const [watching, setWatching] = useState(false)
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

  const play = async (plan: GamePlan) => {
    const n = me?.games.length ?? 0
    if (await act('play', { action: 'play', plan })) {
      setFresh(String(n + 1))
      setWatching(true)
    }
  }


  return (
    <div className="pe-sn-hub">
      <div className="pe-sn-hub-main">
        {error && <div className="pe-error">{error}</div>}

        {me && me.step !== 'season' && l.phase !== 'pregame' && (
          <section className="pe-sn-card pe-sn-call">
            <div className="pe-kicker">{me.step === 'keepers' ? `Season ${l.seasonNumber} · The Offseason` : 'Draft Day'}</div>
            <h2 className="pe-sn-title">{me.step === 'keepers' ? 'Choose your keepers.' : 'Build your team.'}</h2>
            <p className="pe-panel-text">
              {me.step === 'keepers'
                ? `Keep up to three points of last season's eleven, then Draft Day: your ${me.special.label} on a spot of your choosing and a fresh pack everywhere else.`
                : `A pack for every spot on the field, your ${me.special.label} on the one you choose, and three bench packs. Then the eight games are yours to play whenever you like.`}
            </p>
            <Link href={seasonHref(l.id, 'draft')} className="pe-btn">
              {me.step === 'keepers' ? 'To The Offseason' : me.step === 'franchise' ? 'Start Draft Day' : 'Back To Draft Day'}
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

        {me?.last && (
          <LastGame key={`${me.last.phase}${me.last.week}`} leagueId={l.id} me={me} fresh={fresh === String(me.games.length) && !watching} onWatch={() => setWatching(true)} />
        )}

        {me?.pending && <SeasonPack key={`${me.pending.trade ? 't' : 'g'}${me.pending.week}`} leagueId={l.id} me={me} busy={busy} act={act} onView={setView} />}

        {me?.next && <GameCard key={`${me.next.phase}${me.next.week}`} me={me} busy={busy} act={act} play={play} />}

        {watching && me?.last?.replay && (
          <GameCast
            drives={me.last.replay}
            cast={me.last.cast}
            team={me.teamName}
            defense={me.last.defense}
            line={me.last.line}
            opponent={me.last.opponent}
            oppPoints={me.last.oppPoints}
            plan={me.last.plan}
            clicked={me.last.clicked}
            onDone={() => setWatching(false)}
          />
        )}

        {me?.waiting && (
          <section className="pe-sn-card pe-sn-wait">
            <div className="pe-kicker">{l.phase === 'regular' ? 'Your season is done' : 'Playoffs'}</div>
            <p className="pe-panel-text">{me.waiting}</p>
          </section>
        )}

        {me && l.phase === 'complete' && <Final view={view} busy={busy} act={act} />}

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

function LastGame({ leagueId, me, fresh, onWatch }: { leagueId: string; me: MySeason; fresh: boolean; onWatch: () => void }) {
  const g = me.last!
  const [star, ...rest] = g.top
  const tds = g.drives.filter((d) => d === 'td').length
  const fgs = g.drives.filter((d) => d === 'fg').length
  const face = (id: string) => {
    const c = g.cast[id]
    return c ? { id, img: c.img, rarity: c.rarity } : null
  }
  const theirs = g.line ?? g.oppPoints
  return (
    <section className={`pe-sn-gd-last${fresh ? ' is-fresh' : ''}`} data-won={g.won == null ? undefined : String(g.won)}>
      <div className="pe-sn-gd-kick">
        <span>
          {g.phase === 'regular' ? `Game ${g.week}` : `Playoffs${g.opponent ? ` · vs ${g.opponent}` : ''}`} · {g.defense}
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
        <div className="pe-sn-gd-vs">{theirs == null ? 'vs' : g.won ? 'beat' : g.won === false ? (g.line != null ? 'missed' : 'lost to') : 'vs'}</div>
        <div className="pe-sn-gd-score pe-sn-gd-score--line">
          <b>{theirs ?? '...'}</b>
          <small>{g.line != null ? 'To beat' : theirs != null ? (g.opponent ?? 'Opponent') : 'Not played yet'}</small>
        </div>
      </div>
      <div className="pe-sn-gd-drives" aria-label={`${tds} touchdowns, ${fgs} field goals on ${g.drives.length} drives`}>
        {g.drives.map((d, i) => (
          <i key={i} data-end={d} title={DRIVE_WORD[d]} />
        ))}
        <small>
          {tds} TD · {fgs} FG · {g.yards} yds
        </small>
        {g.plan !== 'balanced' && (
          <em className="pe-sn-gd-plan" data-click={String(g.clicked)}>
            {PLAN_LOOK[g.plan].name}: {g.clicked ? 'it worked' : "it didn't work"}
          </em>
        )}
      </div>
      {star && (
        <div className="pe-sn-gd-stars">
          <div className="pe-sn-gd-star">
            <Face player={face(star.id)} name={star.name} />
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
          {rest.length > 0 && (
            <div className="pe-sn-gd-next2">
              {rest.map((b) => (
                <div key={b.id} className="pe-sn-gd-mini">
                  <Face player={face(b.id)} name={b.name} />
                  <span>
                    <b>{surname(b.name)}</b>
                    <em>{statLine(b)}</em>
                  </span>
                  <strong>{b.pts}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="pe-sn-gd-acts">
        {g.replay && (
          <button type="button" className="pe-act pe-act--sm" onClick={onWatch}>
            Watch It
          </button>
        )}
        <Link href={gameHref(leagueId, me.id, g.phase, g.week)} className="pe-act pe-act--sm">
          Box Score
        </Link>
      </div>
    </section>
  )
}

/** A defense's marks: the kinds of player it's built to stop, or soft on. */
function Marks({ tags, vs }: { tags: string[]; vs: -1 | 1 }) {
  if (!tags.length) return null
  return (
    <span className="pe-sn-gd-marks">
      {tags.map((t) => (
        <abbr key={t} title={t} data-vs={vs > 0 ? 'up' : 'down'}>
          <VsMark vs={vs} />
          {ARCH_ABBR[t] ?? t}
        </abbr>
      ))}
    </span>
  )
}

function GameCard({ me, busy, act, play }: { me: MySeason; busy: string | null; act: Act; play: (plan: GamePlan) => void }) {
  const n = me.next!
  const s: ScoutView = n.scouting
  const [plan, setPlan] = useState<GamePlan>('balanced')
  const read = s.plans.find((r) => r.plan === plan) ?? s.plans[0]
  const proj = Math.round(read.expected)
  const edge = edgeWord(read.expected, n.line)
  const stopped = s.stopped.flatMap((id) => findCard(me, id) ?? [])
  const helped = s.helped.flatMap((id) => findCard(me, id) ?? [])
  const scale = Math.max(proj, n.line ?? 0, Math.round(read.clicks)) * 1.3 || 1
  const nameOf = (id: string) => surname(findCard(me, id)?.name ?? '')

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

      <div className="pe-sn-gd-read">
        <div data-tone="down">
          <small>They stop</small>
          <b>{n.defense.stops}</b>
          <Marks tags={n.defense.hurts} vs={-1} />
        </div>
        <div data-tone="up">
          <small>They allow</small>
          <b>{n.defense.allows}</b>
          <Marks tags={n.defense.helps} vs={1} />
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

      <div className="pe-sn-gd-plans">
        <div className="pe-sn-gd-planhead">
          <small>Game plan</small>
          {s.best !== plan && (
            <button type="button" className="pe-sn-gd-coach" onClick={() => setPlan(s.best)}>
              Coach likes {PLAN_LOOK[s.best].name}
            </button>
          )}
        </div>
        <div className="pe-sn-gd-planrow" role="radiogroup" aria-label="Game plan">
          {GAME_PLANS.map((id) => {
            const r = s.plans.find((x) => x.plan === id)
            return (
              <button key={id} type="button" role="radio" aria-checked={plan === id} onClick={() => setPlan(id)}>
                <b>{PLAN_LOOK[id].short}</b>
                <small>{id === 'balanced' ? 'Steady' : `${Math.round((r?.chance ?? 0) * 100)}% to work`}</small>
              </button>
            )
          })}
        </div>
        <p className="pe-sn-gd-planline">
          <b>{PLAN_LOOK[plan].name}.</b> {PLAN_LOOK[plan].line}
          {plan !== 'balanced' && (
            <>
              {' '}
              {read.fitters.length ? `${read.fitters.length} of your starters fit it: ${read.fitters.map(nameOf).join(', ')}.` : 'None of your starters fit it.'}
            </>
          )}
        </p>
      </div>

      <div className="pe-sn-gd-odds">
        <div className="pe-sn-gd-num">
          <b>{proj}</b>
          <small>Projected</small>
        </div>
        {n.line != null ? (
          <div className="pe-sn-gd-meter" data-tone={proj > n.line ? 'up' : 'down'} aria-hidden>
            <span key={plan} className="pe-sn-gd-fill" style={{ transform: `scaleX(${Math.min(1, proj / scale)})` }} />
            <span className="pe-sn-gd-mark" style={{ left: `${(n.line / scale) * 100}%` }} />
          </div>
        ) : (
          <p className="pe-sn-gd-po">Both teams face this defense. More points moves on.</p>
        )}
        {n.line != null && (
          <div className="pe-sn-gd-num pe-sn-gd-num--need">
            <b>{n.line}</b>
            <small>To beat</small>
          </div>
        )}
        {plan !== 'balanced' && (
          <p className="pe-sn-gd-swing">
            If it works <b>{Math.round(read.clicks)}</b> · if it doesn&apos;t <b>{Math.round(read.misses)}</b>
            {n.line != null && <> · {Math.round(read.win * 100)}% to win</>}
          </p>
        )}
        {plan === 'balanced' && n.line != null && <p className="pe-sn-gd-swing">{Math.round(read.win * 100)}% to win</p>}
      </div>

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

      <button type="button" className="pe-push pe-sn-gd-play" disabled={!!busy} onClick={() => play(plan)}>
        {busy === 'play' ? 'Kicking Off' : `${n.phase === 'regular' ? `Play Game ${n.week}` : 'Play The Playoff Game'}${plan !== 'balanced' ? `: ${PLAN_LOOK[plan].short}` : ''}`}
      </button>

      <details className="pe-sn-gd-more">
        <summary>Full Scouting Report</summary>
        <div className="pe-sn-lanes">
          {s.lanes.map((x) => (
            <Lane key={x.lane} label={LANE_LABEL[x.lane]} fill={x.eff / 1.6} word={laneWord(x.eff)} parts={s.parts[x.lane]} me={me} />
          ))}
          <Lane label="Pocket" fill={s.pocket / 1.25} word={s.pocket >= 0.9 ? 'Even' : 'Shut'} text={pocketWord(s.pocket)} parts={s.parts.protect} me={me} />
        </div>
        <p className="pe-note">
          Your play calling: {Math.round(s.passShare * 100)}% passes against this defense before any game plan. The marks are kinds of player:{' '}
          {[...n.defense.hurts, ...n.defense.helps].map((t) => `${ARCH_ABBR[t]} ${t}`).join(', ')}. Better players shake a bad matchup more easily: it costs a common the most
          and an Immortal the least.
        </p>
      </details>
    </section>
  )
}

/** A lane of the full report: how open it is, then who carries it. */
function Lane({ label, fill, word, text, parts, me }: { label: string; fill: number; word: string; text?: string; parts: { id: string; pct: number }[]; me: MySeason }) {
  return (
    <div className="pe-sn-lane" data-word={word}>
      <span>{label}</span>
      <i>
        <em style={{ transform: `scaleX(${Math.min(1, fill)})` }} />
      </i>
      <b>{text ?? word}</b>
      {parts.length > 0 && (
        <span className="pe-sn-lane-who">
          <span className="pe-sn-lane-split" aria-hidden>
            {parts.map((x) => {
              const c = findCard(me, x.id)
              return <u key={x.id} style={{ flexGrow: x.pct, background: c ? RARITY_LOOK[c.rarity].color : undefined }} />
            })}
          </span>
          {parts
            .slice(0, 4)
            .map((x) => `${surname(findCard(me, x.id)?.name ?? '')} ${x.pct}%`)
            .join(' · ')}
        </span>
      )}
    </div>
  )
}

function Final({ view, busy, act }: { view: SeasonView; busy: string | null; act: Act }) {
  const l = view.league
  const champ = view.table.find((r) => r.champion)
  return (
    <section className="pe-sn-card pe-sn-final" data-you={champ?.you ? 'true' : undefined}>
      <div className="pe-kicker">Season {l.seasonNumber} is over</div>
      <h2 className="pe-sn-title">{champ?.you ? 'Champions.' : `${champ?.teamName ?? 'Nobody'} won it all.`}</h2>
      <p className="pe-panel-text">
        The awards and every line are in the Stat Book. Run it back for Season {l.seasonNumber + 1}: keep up to three points of your eleven, and your finish buys a Standings Pack, the worse the finish, the
        better the pack.
      </p>
      <div className="pe-sn-acts">
        {l.owner ? (
          <button type="button" className="pe-push" disabled={!!busy} onClick={() => act('next', { action: 'next' })}>
            {busy === 'next' ? 'Starting' : `Start Season ${l.seasonNumber + 1}`}
          </button>
        ) : (
          <span className="pe-note">Waiting on the commissioner to start Season {l.seasonNumber + 1}.</span>
        )}
        <Link href={seasonHref(l.id, 'book')} className="pe-act">
          Open The Stat Book
        </Link>
      </div>
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
  const l = view.league
  // Opens on the round being played (the Final once it's over), the one before
  // it just to its left with its scores; it still scrolls both ways.
  const now = l.phase === 'complete' ? rounds.length : l.round
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    const col = el?.querySelector<HTMLElement>(`[data-round="${Math.max(1, now - 1)}"]`)
    if (el && col) el.scrollLeft = col.offsetLeft - el.offsetLeft
  }, [now])
  return (
    <section className="pe-sn-block">
      <div className="pe-sn-blockhead">
        <h2>Playoffs</h2>
        <small>{l.phase === 'complete' ? 'Final' : roundName(l.round, rounds.length)}</small>
      </div>
      <div className="pe-sn-bracket" ref={box}>
        {rounds.map((r) => (
          <div key={r.round} className="pe-sn-round" data-round={r.round} data-now={r.round === now ? 'true' : undefined}>
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
          <SetupSlider
            label="Playoff Teams"
            min={2}
            max={size}
            value={Math.min(l.playoffSize, size)}
            disabled={!!busy}
            onCommit={(n) => act('playoffs', { action: 'playoffs', size: n })}
          />
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
