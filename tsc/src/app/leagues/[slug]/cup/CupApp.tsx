'use client'

// The Cup, interactive: four tabs under the masthead.
//   Games    every Cup game by round, with win odds, the all-time series,
//            the last meeting and recent form; tap a team to pick it
//   Bracket  the whole draw, sized to fit a phone without zooming
//   Odds     each team's chance to win the Cup, and who knocked out whom
//   Picks    the league's bracket challenge: champion pick + leaderboard
//
// Who you are is the pick'ems honor system and the same saved choice
// (localStorage dc_pickems_user_<slug>), so anyone who has made pick'ems
// picks is already signed in here.

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import type { CupBracket, CupMatch, CupNotes, CupRound, CupSide } from '@/lib/cup/bracket'
import type { CupExtras, CupMatchDetail, CupOdds, CupPicker } from '@/lib/cup/extras'
import styles from './cup.module.css'

type Tab = 'games' | 'bracket' | 'odds' | 'picks'

type Props = {
  slug: string
  bracket: CupBracket
  notes: CupNotes
  extras: CupExtras
  imageUrl: string
  seededThrough: number
}

type User = { profileId: string; name: string; teamId: string | null }

// ── Who you are, shared with pick'ems ──

const userEvent = 'tsc-cup-user'

function readUser(key: string): User | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null')
    return v && typeof v.profileId === 'string' ? (v as User) : null
  } catch {
    return null
  }
}

function useUser(slug: string, pickers: CupPicker[]) {
  const key = `dc_pickems_user_${slug}`
  const raw = useSyncExternalStore(
    (cb) => {
      window.addEventListener(userEvent, cb)
      window.addEventListener('storage', cb)
      return () => {
        window.removeEventListener(userEvent, cb)
        window.removeEventListener('storage', cb)
      }
    },
    () => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    () => null,
  )
  const user = useMemo(() => {
    if (!raw) return null
    const saved = readUser(key)
    return saved ? (pickers.find((p) => p.profileId === saved.profileId) ?? null) : null
  }, [raw, key, pickers])
  const setUser = useCallback(
    (p: CupPicker | null) => {
      try {
        if (p) localStorage.setItem(key, JSON.stringify({ profileId: p.profileId, name: p.name, teamId: p.teamId }))
        else localStorage.removeItem(key)
      } catch {
        /* private mode: it just won't stick */
      }
      window.dispatchEvent(new Event(userEvent))
    },
    [key],
  )
  return { user, setUser }
}

// An 8 beating a 9 is a coin flip, not an upset.
const UPSET_GAP = 2

// ── Formatting ──

function pts(n: number): string {
  return n.toFixed(2)
}

function pct(p: number): string {
  if (p >= 99.5) return '>99%'
  if (p > 0 && p < 1) return '<1%'
  return `${Math.round(p)}%`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

// Eastern on both server and client, so the first render matches.
function lockText(iso: string | null): string | null {
  if (!iso) return null
  return `${new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`
}

function teamOf(s: CupSide) {
  return s.kind === 'team' ? s.entrant : null
}

// ── The app ──

export function CupApp({ slug, bracket, notes, extras, imageUrl, seededThrough }: Props) {
  const [tab, setTab] = useState<Tab>('games')
  const [round, setRound] = useState<number>(bracket.currentRound ?? bracket.rounds.length - 1)
  const { user, setUser } = useUser(slug, extras.pickers)
  // This browser's picks since the page loaded, over the saved ones.
  const [mine, setMine] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const savedPick = useCallback(
    (profileId: string, r: number, slot: number) => extras.picks.find((p) => p.profileId === profileId && p.round === r && p.slot === slot)?.picked ?? null,
    [extras.picks],
  )
  const myPick = useCallback(
    (r: number, slot: number) => {
      if (!user) return null
      const k = `${user.profileId}|${r}:${slot}`
      return k in mine ? mine[k] : savedPick(user.profileId, r, slot)
    },
    [user, mine, savedPick],
  )
  // Crowd counts with this browser's latest pick swapped in.
  const crowdOf = useCallback(
    (m: CupMatch, d: CupMatchDetail) => {
      const a = teamOf(m.a)?.managerId
      const b = teamOf(m.b)?.managerId
      let ca = d.crowd.a
      let cb = d.crowd.b
      if (user) {
        const before = savedPick(user.profileId, m.round, m.slot)
        const now = myPick(m.round, m.slot)
        if (before !== now) {
          if (before === a) ca--
          if (before === b) cb--
          if (now === a) ca++
          if (now === b) cb++
        }
      }
      return { a: Math.max(0, ca), b: Math.max(0, cb) }
    },
    [user, savedPick, myPick],
  )

  const pick = useCallback(
    async (r: number, slot: number, managerId: string) => {
      if (!user) return
      const k = `${user.profileId}|${r}:${slot}`
      const prev = myPick(r, slot)
      if (prev === managerId) return
      setMine((x) => ({ ...x, [k]: managerId }))
      setSaving(k)
      try {
        const res = await fetch(`/leagues/${slug}/cup/pick/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: user.profileId, round: r, slot, picked_manager_id: managerId }),
        })
        const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
        if (!res.ok || !body?.ok) throw new Error(body?.error || 'The pick did not save. Try again.')
      } catch (e) {
        setMine((x) => {
          const next = { ...x }
          if (prev == null) delete next[k]
          else next[k] = prev
          return next
        })
        setToast((e as Error).message)
        setTimeout(() => setToast(null), 3200)
      } finally {
        setSaving(null)
      }
    },
    [user, myPick, slug],
  )

  const openCount = bracket.rounds.flatMap((r) => r.matches).filter((m) => extras.details[m.id]?.open).length
  const unpicked = user
    ? bracket.rounds.flatMap((r) => r.matches).filter((m) => extras.details[m.id]?.open && !myPick(m.round, m.slot)).length +
      (extras.championOpen && !myPick(-1, 0) ? 1 : 0)
    : 0

  return (
    <div className={styles.app}>
      <nav className={styles.tabs} aria-label="The Cup">
        {(
          [
            ['games', 'Games'],
            ['bracket', 'Bracket'],
            ['odds', 'Odds'],
            ['picks', 'Picks'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" className={`${styles.tab} ${tab === id ? styles.tabOn : ''}`} onClick={() => setTab(id)} aria-pressed={tab === id}>
            {label}
            {id === 'picks' && user && unpicked > 0 ? <span className={styles.tabDot}>{unpicked}</span> : null}
          </button>
        ))}
      </nav>

      <div className={styles.panel}>
        {tab === 'games' ? (
          <Games
            bracket={bracket}
            extras={extras}
            round={round}
            setRound={setRound}
            user={user}
            setUser={setUser}
            myPick={myPick}
            crowdOf={crowdOf}
            onPick={pick}
            saving={saving}
            openCount={openCount}
          />
        ) : null}
        {tab === 'bracket' ? <BracketTab bracket={bracket} imageUrl={imageUrl} slug={slug} /> : null}
        {tab === 'odds' ? <OddsTab bracket={bracket} odds={extras.odds} notes={notes} user={user} /> : null}
        {tab === 'picks' ? (
          <PicksTab bracket={bracket} extras={extras} user={user} setUser={setUser} myPick={myPick} onPick={pick} saving={saving} seededThrough={seededThrough} goGames={() => setTab('games')} />
        ) : null}
      </div>

      {toast ? (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

// ── Who are you ──

function WhoAreYou({ pickers, user, setUser, compact = false }: { pickers: CupPicker[]; user: User | null; setUser: (p: CupPicker | null) => void; compact?: boolean }) {
  return (
    <label className={`${styles.who} ${compact ? styles.whoCompact : ''}`}>
      <span className={styles.whoLabel}>{user ? 'Picking as' : 'Who are you?'}</span>
      <select
        className={styles.whoSelect}
        value={user?.profileId ?? ''}
        onChange={(e) => setUser(pickers.find((p) => p.profileId === e.target.value) ?? null)}
      >
        <option value="">Choose your name</option>
        {pickers.map((p) => (
          <option key={p.profileId} value={p.profileId}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  )
}

// ── Games ──

function Games(props: {
  bracket: CupBracket
  extras: CupExtras
  round: number
  setRound: (r: number) => void
  user: User | null
  setUser: (p: CupPicker | null) => void
  myPick: (r: number, slot: number) => string | null
  crowdOf: (m: CupMatch, d: CupMatchDetail) => { a: number; b: number }
  onPick: (r: number, slot: number, managerId: string) => void
  saving: string | null
  openCount: number
}) {
  const { bracket, extras, round, setRound, user, setUser } = props
  const r = bracket.rounds[round] ?? bracket.rounds[0]!
  const live = r.matches.some((m) => m.state === 'live')
  const done = r.matches.length > 0 && r.matches.every((m) => m.state === 'final')
  const lockAt = r.matches.map((m) => extras.details[m.id]?.lockAt).find(Boolean) ?? null
  const open = r.matches.some((m) => extras.details[m.id]?.open)
  const nextRound = bracket.rounds[r.round + 1]

  return (
    <>
      <YourCup bracket={bracket} extras={extras} user={user} />

      <div className={styles.chips} role="tablist" aria-label="Rounds">
        {bracket.rounds.map((x) => (
          <button
            key={x.round}
            type="button"
            role="tab"
            aria-selected={x.round === r.round}
            className={`${styles.chip} ${x.round === r.round ? styles.chipOn : ''}`}
            onClick={() => setRound(x.round)}
          >
            <span>{x.short}</span>
            <span className={styles.chipWeek}>
              Wk {x.week}
              {x.matches.some((m) => m.state === 'live') ? <span className={styles.liveDot} aria-label="this week" /> : null}
            </span>
          </button>
        ))}
      </div>

      <div className={styles.roundHead}>
        <div>
          <h2 className={styles.roundName}>{r.name}</h2>
          <p className={styles.roundSub}>
            Week {r.week}
            {done ? ' · Final' : live ? ' · This week' : ''}
            {open && lockAt ? ` · Picks close ${lockText(lockAt)}` : ''}
            {!open && !done && lockAt && r.matches.some((m) => extras.details[m.id]?.locked) ? ' · Picks locked' : ''}
          </p>
        </div>
        {live ? <span className={styles.now}>This week</span> : null}
      </div>

      {done ? <RoundRecap round={r} /> : null}

      {open && extras.hasPickTable ? (
        user ? (
          <p className={styles.pickHint}>Tap a team to pick it. You can change a pick until kickoff.</p>
        ) : (
          <div className={styles.pickPrompt}>
            <p>Pick the winners. Points for every right call, more each round.</p>
            <WhoAreYou pickers={extras.pickers} user={user} setUser={setUser} compact />
          </div>
        )
      ) : null}

      {r.byes.length ? (
        <p className={styles.byes}>
          Byes: {r.byes.map((e) => `${e.name} (${e.seed})`).join(', ')}. They wait in the {nextRound?.name.toLowerCase() ?? 'next round'}.
        </p>
      ) : null}

      <div className={styles.games}>
        {r.matches.map((m, i) => (
          <GameCard key={m.id} m={m} index={i} d={extras.details[m.id]!} {...props} />
        ))}
      </div>
    </>
  )
}

function RoundRecap({ round }: { round: CupRound }) {
  const upsets = round.matches.filter((m) => m.upsetBy >= UPSET_GAP)
  let top: { name: string; score: number } | null = null
  for (const m of round.matches) {
    for (const s of [m.a, m.b]) {
      if (s.kind === 'team' && s.score != null && (!top || s.score > top.score)) top = { name: s.entrant.name, score: s.score }
    }
  }
  const winners = round.matches
    .map((m) => (m.winner ? m[m.winner] : null))
    .filter((s): s is Extract<CupSide, { kind: 'team' }> => s?.kind === 'team')
    .map((s) => `${s.entrant.name} (${s.entrant.seed})`)
  return (
    <div className={styles.recap}>
      <p>
        <b>Through:</b> {winners.join(', ')}.
      </p>
      <p>
        {upsets.length === 0
          ? 'Every higher seed won.'
          : upsets.length === 1
            ? 'One upset.'
            : `${upsets.length} upsets.`}
        {top ? ` Top Cup score: ${top.name}, ${pts(top.score)}.` : ''}
      </p>
    </div>
  )
}

function GameCard(props: {
  m: CupMatch
  index: number
  d: CupMatchDetail
  user: User | null
  myPick: (r: number, slot: number) => string | null
  crowdOf: (m: CupMatch, d: CupMatchDetail) => { a: number; b: number }
  onPick: (r: number, slot: number, managerId: string) => void
  saving: string | null
  extras: CupExtras
}) {
  const { m, index, d, user } = props
  const a = teamOf(m.a)
  const b = teamOf(m.b)
  const mineNow = props.myPick(m.round, m.slot)
  const canPick = !!user && d.open && props.extras.hasPickTable
  const crowd = props.crowdOf(m, d)
  const crowdTotal = crowd.a + crowd.b
  // The split is shown once you've picked (or the round has locked), and
  // only once a few people have, so it never reads "100%, 1 pick".
  const showCrowd = crowdTotal >= 3 && (!!mineNow || d.locked || m.state === 'final')
  const savingThis = !!user && props.saving === `${user.profileId}|${m.round}:${m.slot}`
  const winner = m.winner ? teamOf(m[m.winner]) : null
  const loser = m.winner ? teamOf(m[m.winner === 'a' ? 'b' : 'a']) : null
  const margin = winner && loser && m.winner ? Math.abs((m.a.kind === 'team' ? m.a.score ?? 0 : 0) - (m.b.kind === 'team' ? m.b.score ?? 0 : 0)) : 0
  const winnerProb = m.winner && d.probA != null ? (m.winner === 'a' ? d.probA : 1 - d.probA) : null

  const row = (side: 'a' | 'b') => {
    const s = m[side]
    const e = teamOf(s)
    const prob = d.probA == null ? null : side === 'a' ? d.probA : 1 - d.probA
    const won = m.winner === side
    const lost = !!m.winner && !won
    const picked = !!e && mineNow === e.managerId
    const cls = `${styles.side} ${won ? styles.sideWon : ''} ${lost ? styles.sideLost : ''} ${picked ? styles.sidePicked : ''} ${canPick ? styles.sidePickable : ''}`
    const inner = e ? (
      <>
        <span className={styles.seed}>{e.seed}</span>
        <span className={styles.sideWho}>
          <span className={styles.sideName}>
            {e.name}
            {picked ? <span className={styles.yourPick}>{d.locked || m.state === 'final' ? 'Your pick' : 'Picked'}</span> : null}
          </span>
          <span className={styles.sideTeam}>
            {e.team && e.team !== e.name ? `${e.team} · ` : ''}
            {e.record}
          </span>
        </span>
        {s.kind === 'team' && s.score != null ? (
          <span className={styles.sideScore}>{pts(s.score)}</span>
        ) : prob != null ? (
          <span className={styles.prob}>
            <span className={styles.probNum}>{pct(prob * 100)}</span>
            <span className={styles.probBar}>
              <span style={{ width: `${Math.round(prob * 100)}%` }} />
            </span>
          </span>
        ) : (
          <span />
        )}
      </>
    ) : (
      <>
        <span className={styles.seed} />
        <span className={styles.sideWho}>
          <span className={styles.tbd}>{s.kind === 'tbd' && s.options.length ? `${s.options[0]} or ${s.options[1]}` : 'To be decided'}</span>
        </span>
        <span />
      </>
    )
    return canPick && e ? (
      <button type="button" className={cls} onClick={() => props.onPick(m.round, m.slot, e.managerId)} aria-pressed={picked} disabled={savingThis}>
        {inner}
      </button>
    ) : (
      <div className={cls}>{inner}</div>
    )
  }

  const series = d.series && a && b ? seriesLine(d.series, a.name, b.name) : a && b ? 'First meeting' : null
  const last = d.series?.last && a && b ? lastLine(d.series.last, a.name, b.name) : null

  return (
    <article className={`${styles.game} ${m.state === 'live' ? styles.gameLive : ''}`}>
      <header className={styles.gameHead}>
        <span>
          Game {index + 1} · Week {m.week}
        </span>
        {m.sameGame ? <span className={styles.flag}>Also their league game</span> : null}
        {m.state === 'final' && m.upsetBy >= UPSET_GAP ? <span className={styles.flagRed}>Upset</span> : null}
      </header>
      {row('a')}
      {row('b')}
      {m.state === 'final' && winner ? (
        <p className={styles.result}>
          {winner.name} through by {pts(margin)}
          {m.tiebreak ? ', level on points and settled on seed' : ''}
          {winnerProb != null && winnerProb < 0.45 ? `, a ${pct(winnerProb * 100)} shot` : ''}.
        </p>
      ) : null}
      {a && b ? (
        <dl className={styles.facts}>
          {series ? (
            <div>
              <dt>Series</dt>
              <dd>{series}</dd>
            </div>
          ) : null}
          {last ? (
            <div>
              <dt>Last met</dt>
              <dd>{last}</dd>
            </div>
          ) : null}
          {d.formA.length || d.formB.length ? (
            <div>
              <dt>Form</dt>
              <dd>
                <span className={styles.formLine}>
                  {a.name} {d.formA.map((x) => Math.round(x)).join(' · ')}
                </span>
                <span className={styles.formLine}>
                  {b.name} {d.formB.map((x) => Math.round(x)).join(' · ')}
                </span>
              </dd>
            </div>
          ) : null}
          {showCrowd ? (
            <div>
              <dt>Picks</dt>
              <dd>
                <span className={styles.crowd}>
                  <span className={styles.crowdBar}>
                    <span style={{ width: `${Math.round((crowd.a / crowdTotal) * 100)}%` }} />
                  </span>
                  <span className={styles.crowdText}>
                    {a.name} {Math.round((crowd.a / crowdTotal) * 100)}% · {b.name} {Math.round((crowd.b / crowdTotal) * 100)}% · {crowdTotal}{' '}
                    {crowdTotal === 1 ? 'pick' : 'picks'}
                  </span>
                </span>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </article>
  )
}

function seriesLine(s: NonNullable<CupMatchDetail['series']>, a: string, b: string): string {
  const tie = s.t ? `-${s.t}` : ''
  if (s.w === s.l) return `Even at ${s.w}-${s.l}${tie} all-time`
  return s.w > s.l ? `${a} leads ${s.w}-${s.l}${tie} all-time` : `${b} leads ${s.l}-${s.w}${tie} all-time`
}

function lastLine(l: NonNullable<NonNullable<CupMatchDetail['series']>['last']>, a: string, b: string): string {
  const when = `${l.year}, week ${l.week}${l.playoff ? ' (playoffs)' : ''}`
  if (l.winner === 'tie') return `${when}: a tie, ${l.sa.toFixed(1)} each`
  const [w, hi, lo] = l.winner === 'a' ? [a, l.sa, l.sb] : [b, l.sb, l.sa]
  return `${when}: ${w} won ${hi.toFixed(1)} to ${lo.toFixed(1)}`
}

// Your own team's Cup, when the name you picked has a team in it.
function YourCup({ bracket, extras, user }: { bracket: CupBracket; extras: CupExtras; user: User | null }) {
  if (!user?.teamId) return null
  const o = extras.odds.find((x) => x.managerId === user.teamId)
  if (!o) return null
  let line: string
  if (!o.alive && o.out) {
    line = `Out in the ${o.out.round.toLowerCase()} to ${o.out.to}, ${pts(o.out.mine)} to ${pts(o.out.theirs)}.`
  } else if (bracket.champion?.managerId === user.teamId) {
    line = 'You won the Cup.'
  } else {
    const cur = bracket.currentRound != null ? bracket.rounds[bracket.currentRound] : null
    const game = cur?.matches.find((m) => teamOf(m.a)?.managerId === user.teamId || teamOf(m.b)?.managerId === user.teamId)
    const bye = cur?.byes.some((e) => e.managerId === user.teamId)
    let now = ''
    if (game) {
      const side = teamOf(game.a)?.managerId === user.teamId ? 'a' : 'b'
      const opp = teamOf(game[side === 'a' ? 'b' : 'a'])
      const p = extras.details[game.id]?.probA
      const mine = p == null ? null : side === 'a' ? p : 1 - p
      now = opp ? ` ${cur!.name} v ${opp.name} (${opp.seed}), ${mine != null ? `${pct(mine * 100)} to win` : 'week ' + game.week}.` : ''
    } else if (bye) now = ` Bye in the ${cur!.name.toLowerCase()}.`
    line = `${ordinal(o.seed)} seed, still alive.${now} ${pct(o.win)} to win the Cup.`
  }
  return (
    <div className={styles.yours}>
      <span className={styles.yoursLabel}>Your Cup</span>
      <p>{line}</p>
    </div>
  )
}

// ── Bracket ──

function BracketTab({ bracket, imageUrl, slug }: { bracket: CupBracket; imageUrl: string; slug: string }) {
  return (
    <>
      <div className={styles.bracketWrap}>
        <div className={styles.bracket} style={{ ['--slots' as string]: bracket.size / 2, ['--cols' as string]: bracket.rounds.length }}>
          {bracket.rounds.map((r, ri) => (
            <div className={styles.col} key={r.round}>
              <div className={styles.colHead}>
                <span className={styles.colName}>{r.short}</span>
                <span className={styles.colWeek}>Wk {r.week}</span>
              </div>
              <div className={styles.colBody}>
                {pairsOf(r, ri > 0 ? bracket.rounds[ri - 1] : null).map((pair, pi) => (
                  <div className={`${styles.pair} ${pair.join ? styles[pair.join] : ''}`} key={pi}>
                    {pair.cells.map((cell, ci) => (
                      <div className={styles.cell} key={ci}>
                        {cell.match ? <MiniCard m={cell.match} fed={cell.fed} last={ri === bracket.rounds.length - 1} /> : null}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.champ}>
        <span className={styles.champLabel}>Champion</span>
        <span className={styles.champName}>{bracket.champion ? bracket.champion.name : `Decided week ${bracket.finalWeek}`}</span>
      </div>
      <div className={styles.bracketFoot}>
        <a className={styles.btn} href={imageUrl} download={`${slug}-cup-bracket.png`}>
          Save the bracket image
        </a>
        <p className={styles.legend}>Struck through: knocked out. Each round is one week; a tie goes to the higher seed.</p>
      </div>
    </>
  )
}

type Cell = { match: CupMatch | null; fed: boolean }
type Pair = { cells: Cell[]; join: 'joinBoth' | 'joinTop' | 'joinBottom' | null }

function pairsOf(r: CupRound, prev: CupRound | null): Pair[] {
  const at = new Map(r.matches.map((m) => [m.slot, m]))
  const fedBy = (slot: number) => !!prev && prev.matches.some((m) => m.slot === slot * 2 || m.slot === slot * 2 + 1)
  const cells: Cell[] = Array.from({ length: r.slots }, (_, s) => ({ match: at.get(s) ?? null, fed: fedBy(s) }))
  if (r.slots === 1) return [{ cells, join: null }]
  const out: Pair[] = []
  for (let i = 0; i < cells.length; i += 2) {
    const top = !!cells[i].match
    const bottom = !!cells[i + 1]?.match
    out.push({ cells: cells.slice(i, i + 2), join: top && bottom ? 'joinBoth' : top ? 'joinTop' : bottom ? 'joinBottom' : null })
  }
  return out
}

function MiniCard({ m, fed, last }: { m: CupMatch; fed: boolean; last: boolean }) {
  const row = (side: 'a' | 'b') => {
    const s = m[side]
    const e = teamOf(s)
    const cls = `${styles.mRow} ${m.winner === side ? styles.mWon : ''} ${m.winner && m.winner !== side ? styles.mLost : ''}`
    return (
      <div className={cls}>
        <span className={styles.mSeed}>{e?.seed ?? ''}</span>
        <span className={e ? styles.mName : styles.mTbd}>{e ? e.name : s.kind === 'tbd' && s.options.length ? `${s.options[0]}/${s.options[1]}` : 'TBD'}</span>
        <span className={styles.mScore}>{s.kind === 'team' && s.score != null ? Math.round(s.score) : ''}</span>
      </div>
    )
  }
  return (
    <div className={`${styles.mCard} ${fed ? styles.fed : ''} ${last ? '' : styles.feeds} ${m.state === 'live' ? styles.mLive : ''}`}>
      {row('a')}
      {row('b')}
    </div>
  )
}

// ── Odds ──

function OddsTab({ bracket, odds, notes, user }: { bracket: CupBracket; odds: CupOdds[]; notes: CupNotes; user: User | null }) {
  const alive = odds.filter((o) => o.alive)
  // Knocked out, furthest run first (the beaten finalist, then the semis...).
  const depth = new Map(bracket.rounds.map((r) => [r.name, r.round]))
  const out = odds.filter((o) => !o.alive).sort((x, y) => (depth.get(y.out?.round ?? '') ?? 0) - (depth.get(x.out?.round ?? '') ?? 0) || x.seed - y.seed)
  // Labels for the "reach" figures: the last two rounds before the title
  // (the next round is near-certain for a top seed and says little).
  const later = bracket.rounds.slice(1).map((r) => r.short)
  const shown = later.map((label, i) => ({ label, i })).slice(-2)
  // Bars scale to the favourite, so a 20% leader doesn't read as empty.
  const top = Math.max(1, ...alive.map((o) => o.win))
  return (
    <>
      <h2 className={styles.sectionHead}>{bracket.champion ? 'Champion' : 'Who wins the Cup'}</h2>
      <p className={styles.sectionSub}>
        {bracket.champion
          ? `${bracket.champion.name} won it.`
          : 'From 20,000 simulated Cups, played on each team’s scoring this season.'}
      </p>
      <ol className={styles.oddsList}>
        {alive.map((o) => (
          <li key={o.managerId} className={`${styles.oddsRow} ${user?.teamId === o.managerId ? styles.oddsMine : ''}`}>
            <span className={styles.seed}>{o.seed}</span>
            <span className={styles.oddsWho}>
              <span className={styles.oddsName}>{o.name}</span>
              <span className={styles.oddsPath}>
                {bracket.champion ? `${ordinal(o.seed)} seed · won the Cup` : shown.map(({ label, i }) => `${label} ${pct(o.reach[i] ?? 0)}`).join(' · ')}
              </span>
            </span>
            <span className={styles.oddsBar}>
              <span style={{ width: `${Math.max(2, Math.min(100, (o.win / top) * 100))}%` }} />
            </span>
            <span className={styles.oddsNum}>{bracket.champion ? 'Won' : pct(o.win)}</span>
          </li>
        ))}
      </ol>

      {out.length ? (
        <>
          <h3 className={styles.subHead}>Knocked out</h3>
          <ul className={styles.outList}>
            {out.map((o) =>
              o.out ? (
                <li key={o.managerId}>
                  <span className={styles.outName}>{o.name}</span> ({o.seed}), {o.out.round.toLowerCase()}, to {o.out.to}, {pts(o.out.mine)} to {pts(o.out.theirs)}
                </li>
              ) : null,
            )}
          </ul>
        </>
      ) : null}

      {notes.top || notes.closest || notes.upset ? (
        <>
          <h3 className={styles.subHead}>Cup records</h3>
          <div className={styles.notes}>
            {notes.top ? (
              <div className={styles.note}>
                <span className={styles.noteLabel}>Top score</span>
                <span className={styles.noteBig}>{pts(notes.top.score)}</span>
                <span className={styles.noteLine}>
                  {notes.top.name}, {notes.top.round.toLowerCase()}
                </span>
              </div>
            ) : null}
            {notes.closest ? (
              <div className={styles.note}>
                <span className={styles.noteLabel}>Closest game</span>
                <span className={styles.noteBig}>{notes.closest.margin === 0 ? 'Level' : pts(notes.closest.margin)}</span>
                <span className={styles.noteLine}>
                  {notes.closest.winner} over {notes.closest.loser}
                </span>
              </div>
            ) : null}
            {notes.upset ? (
              <div className={styles.note}>
                <span className={styles.noteLabel}>Biggest upset</span>
                <span className={styles.noteBig}>{notes.upset.by} seeds</span>
                <span className={styles.noteLine}>
                  {notes.upset.winner} over {notes.upset.loser}
                </span>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  )
}

// ── Picks ──

function PicksTab(props: {
  bracket: CupBracket
  extras: CupExtras
  user: User | null
  setUser: (p: CupPicker | null) => void
  myPick: (r: number, slot: number) => string | null
  onPick: (r: number, slot: number, managerId: string) => void
  saving: string | null
  seededThrough: number
  goGames: () => void
}) {
  const { bracket, extras, user, setUser } = props
  const champ = props.myPick(-1, 0)
  const teams = [...bracket.rounds[0]!.matches.flatMap((m) => [teamOf(m.a), teamOf(m.b)]), ...bracket.rounds[0]!.byes]
    .filter((e): e is NonNullable<typeof e> => !!e)
    .sort((x, y) => x.seed - y.seed)
  const champName = champ ? teams.find((t) => t.managerId === champ)?.name : null
  const open = bracket.rounds.flatMap((r) => r.matches).filter((m) => extras.details[m.id]?.open)
  const pickedOpen = open.filter((m) => props.myPick(m.round, m.slot)).length

  if (!extras.hasPickTable) return <p className={styles.sectionSub}>Picks open soon.</p>

  return (
    <>
      <h2 className={styles.sectionHead}>The bracket challenge</h2>
      <p className={styles.sectionSub}>
        Pick the winner of every Cup game before Thursday kickoff. A right pick is worth{' '}
        {extras.points.map((p, i) => `${p} in the ${bracket.rounds[i]!.name.toLowerCase()}`).join(', ')}, and your champion pick is worth {extras.championBonus}{' '}
        more.
      </p>

      <WhoAreYou pickers={extras.pickers} user={user} setUser={setUser} />

      {user ? (
        <>
          {open.length ? (
            <button type="button" className={styles.openCard} onClick={props.goGames}>
              <span className={styles.openLabel}>Open now</span>
              <span className={styles.openText}>
                {pickedOpen} of {open.length} {open.length === 1 ? 'game' : 'games'} picked
              </span>
              <span className={styles.openGo}>Go to the games</span>
            </button>
          ) : null}

          <h3 className={styles.subHead}>Your champion</h3>
          {extras.championOpen ? (
            <>
              <p className={styles.sectionSub}>
                Locks {lockText(extras.championLockAt) ?? 'when round one starts'}. Worth {extras.championBonus} if they win it all.
              </p>
              <div className={styles.champGrid}>
                {teams.map((t) => (
                  <button
                    key={t.managerId}
                    type="button"
                    className={`${styles.champBtn} ${champ === t.managerId ? styles.champBtnOn : ''}`}
                    onClick={() => props.onPick(-1, 0, t.managerId)}
                    aria-pressed={champ === t.managerId}
                  >
                    <span className={styles.seed}>{t.seed}</span>
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className={styles.sectionSub}>{champName ? `${champName}. Locked.` : 'You didn’t make one. They locked at round one kickoff.'}</p>
          )}
        </>
      ) : (
        <p className={styles.sectionSub}>Choose your name to make picks. It’s the same name you use for pick’ems.</p>
      )}

      <h3 className={styles.subHead}>Leaderboard</h3>
      {extras.board.length ? (
        <ol className={styles.board}>
          {extras.board.map((row, i) => (
            <li key={row.profileId} className={`${styles.boardRow} ${user?.profileId === row.profileId ? styles.boardMine : ''}`}>
              <span className={styles.boardRank}>{i + 1}</span>
              <span className={styles.boardWho}>
                <span className={styles.boardName}>{row.name}</span>
                <span className={styles.boardMeta}>
                  {row.decided ? `${row.correct} of ${row.decided} right` : 'No results yet'}
                  {row.champion ? ` · Champion: ${row.champion}${row.championRight === true ? ' (right)' : row.championRight === false ? ' (out)' : ''}` : ''}
                </span>
              </span>
              <span className={styles.boardPts}>{row.points}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.sectionSub}>No picks yet. Be the first.</p>
      )}

      <h3 className={styles.subHead}>How the Cup works</h3>
      <ul className={styles.rules}>
        <li>Seeded by the standings after week {props.seededThrough}. Top seeds get byes when the field isn’t 8 or 16.</li>
        <li>One round a week. Your real score that week is your Cup score, whoever you play in the league.</li>
        <li>A tie goes to the higher seed. Nothing to sign up for: every team is in.</li>
      </ul>
    </>
  )
}
