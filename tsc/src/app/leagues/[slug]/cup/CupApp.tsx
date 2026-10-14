'use client'

// The Cup, interactive: the masthead, then four tabs.
//   Games    a round at a time: a ticket per game with the win odds and the
//            history between the two, and the pick (tap the team you think
//            wins). The round rail on top moves between rounds.
//   Bracket  the whole draw, sized to fit a phone without zooming
//   Odds     each team's chance to win the Cup, and who knocked out whom
//   Leaders  the league's bracket challenge: points, the board, the
//            champion picks
//
// Three things the first version left people guessing, now said on the page
// itself: what the Cup is (the start card and the "How it works" sheet, both
// at the top), that a pick means "who wins this game" (every open game asks
// it), and that picks save on their own (the bar at the bottom counts them
// and says so; there is nothing to submit).
//
// Who you are is the pick'ems honor system and the same saved choice
// (localStorage dc_pickems_user_<slug>), so anyone who has made pick'ems
// picks is already signed in here.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CupBracket, CupEntrant, CupMatch, CupNotes, CupRound, CupSide } from '@/lib/cup/bracket'
import type { CupExtras, CupMatchDetail, CupOdds, CupPicker } from '@/lib/cup/extras'
import { trophy } from '@/lib/cup/trophy'
import styles from './cup.module.css'

type Tab = 'games' | 'bracket' | 'odds' | 'leaders'

type Props = {
  slug: string
  cupId: string
  cupName: string
  leagueName: string
  year: number
  status: string
  bracket: CupBracket
  notes: CupNotes
  extras: CupExtras
  imageUrl: string
  seededThrough: number
}

type User = { profileId: string; name: string; teamId: string | null }
type Pending = { round: number; slot: number; managerId: string } | { champion: true }
type Sheet = { kind: 'how' } | { kind: 'who'; then: Pending | null } | { kind: 'champ' } | null

// ── Saved choices (who you are, the start card) ──

const storeEvent = 'tsc-cup-store'

function useStored(key: string): string | null | undefined {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(storeEvent, cb)
      window.addEventListener('storage', cb)
      return () => {
        window.removeEventListener(storeEvent, cb)
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
    // The server can't know; render nothing that depends on it.
    () => undefined,
  )
}

function writeStored(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* private mode: it just won't stick */
  }
  window.dispatchEvent(new Event(storeEvent))
}

function useUser(slug: string, pickers: CupPicker[]) {
  const key = `dc_pickems_user_${slug}`
  const raw = useStored(key)
  const user = useMemo(() => {
    if (!raw) return null
    try {
      const saved = JSON.parse(raw) as { profileId?: string }
      return saved?.profileId ? (pickers.find((p) => p.profileId === saved.profileId) ?? null) : null
    } catch {
      return null
    }
  }, [raw, pickers])
  const setUser = useCallback(
    (p: CupPicker | null) => writeStored(key, p ? JSON.stringify({ profileId: p.profileId, name: p.name, teamId: p.teamId }) : null),
    [key],
  )
  return { user, setUser, known: raw !== undefined }
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase()
}

// ── Small drawings (stroke icons; no emoji anywhere on the site) ──

function Icon({ name, size = 18 }: { name: 'help' | 'check' | 'close' | 'seed' | 'week' | 'tap' | 'cup' | 'share' | 'lock'; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (name) {
    case 'help':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M9.4 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.3-2.6 3.9" />
          <circle cx="12" cy="17.2" r=".6" fill="currentColor" />
        </svg>
      )
    case 'check':
      return (
        <svg {...p} strokeWidth={2.6}>
          <path d="M5 12.5l4.4 4.3L19 7.5" />
        </svg>
      )
    case 'close':
      return (
        <svg {...p} strokeWidth={2}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      )
    case 'seed':
      return (
        <svg {...p}>
          <path d="M9 20V8h6v12M3 20v-7h6M15 20v-9h6v9M2 20h20" />
        </svg>
      )
    case 'week':
      return (
        <svg {...p}>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      )
    case 'tap':
      return (
        <svg {...p}>
          <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-.6a5.4 5.4 0 0 1-4.5-2.4L4.6 15a1.5 1.5 0 0 1 2.4-1.8L9 15" />
        </svg>
      )
    case 'cup':
      return (
        <svg {...p}>
          <path d="M7 4h10v4.5a5 5 0 0 1-10 0z" />
          <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.6M17 6h2.5a2.5 2.5 0 0 1-2.6 3.6M12 13.5V17M8.5 20h7M9.5 17h5" />
        </svg>
      )
    case 'share':
      return (
        <svg {...p}>
          <path d="M12 3.5v11M8 7.5l4-4 4 4M6 11.5H5v8h14v-8h-1" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...p}>
          <rect x="5" y="10.5" width="14" height="10" rx="2" />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </svg>
      )
  }
}

// ── The app ──

export function CupApp(props: Props) {
  const { slug, cupId, bracket, notes, extras, imageUrl, seededThrough } = props
  const [tab, setTab] = useState<Tab>('games')
  const [round, setRound] = useState<number>(bracket.currentRound ?? bracket.rounds.length - 1)
  const { user, setUser, known } = useUser(slug, extras.pickers)
  // This browser's picks since the page loaded, over the saved ones.
  const [mine, setMine] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const say = useCallback((text: string, ok: boolean) => {
    setToast({ text, ok })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), ok ? 2200 : 3600)
  }, [])

  const nameOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of bracket.rounds) {
      for (const x of r.matches) for (const s of [x.a, x.b]) if (s.kind === 'team') m.set(s.entrant.managerId, s.entrant.name)
      for (const e of r.byes) m.set(e.managerId, e.name)
    }
    return m
  }, [bracket])

  const savedPick = useCallback(
    (profileId: string, r: number, slot: number) => extras.picks.find((p) => p.profileId === profileId && p.round === r && p.slot === slot)?.picked ?? null,
    [extras.picks],
  )
  const pickOf = useCallback(
    (u: User | null, r: number, slot: number) => {
      if (!u) return null
      const k = `${u.profileId}|${r}:${slot}`
      return k in mine ? mine[k] : savedPick(u.profileId, r, slot)
    },
    [mine, savedPick],
  )
  const myPick = useCallback((r: number, slot: number) => pickOf(user, r, slot), [pickOf, user])

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

  // Save one pick, as `who` (passed in so a pick made right after choosing a
  // name doesn't wait for the store to come round).
  const save = useCallback(
    async (who: User, r: number, slot: number, managerId: string) => {
      const k = `${who.profileId}|${r}:${slot}`
      const prev = pickOf(who, r, slot)
      if (prev === managerId) return
      setMine((x) => ({ ...x, [k]: managerId }))
      setSaving(k)
      try {
        const res = await fetch(`/leagues/${slug}/cup/pick/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: who.profileId, round: r, slot, picked_manager_id: managerId }),
        })
        const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
        if (!res.ok || !body?.ok) throw new Error(body?.error || 'The pick did not save. Try again.')
        const name = nameOf.get(managerId) ?? 'Your pick'
        say(r === -1 ? `Saved. ${name} to win the Cup.` : `Saved. ${name} to win.`, true)
      } catch (e) {
        setMine((x) => {
          const next = { ...x }
          if (prev == null) delete next[k]
          else next[k] = prev
          return next
        })
        say((e as Error).message, false)
      } finally {
        setSaving(null)
      }
    },
    [pickOf, slug, nameOf, say],
  )

  // A tap on a team: pick it, or ask who's picking first.
  const tapTeam = useCallback(
    (r: number, slot: number, managerId: string) => {
      if (!user) setSheet({ kind: 'who', then: { round: r, slot, managerId } })
      else void save(user, r, slot, managerId)
    },
    [user, save],
  )

  const chooseUser = useCallback(
    (p: CupPicker, then: Pending | null) => {
      setUser(p)
      if (then && 'champion' in then) setSheet({ kind: 'champ' })
      else {
        setSheet(null)
        if (then) void save(p, then.round, then.slot, then.managerId)
        else say(`Picking as ${p.name}.`, true)
      }
    },
    [setUser, save, say],
  )

  const openChampion = useCallback(() => setSheet(user ? { kind: 'champ' } : { kind: 'who', then: { champion: true } }), [user])

  // Champion votes: team -> who picked it, with this browser's latest pick.
  const championVotes = useMemo(() => {
    const by = new Map<string, string[]>()
    for (const p of extras.picks) {
      if (p.round !== -1 || (user && p.profileId === user.profileId)) continue
      by.set(p.picked, [...(by.get(p.picked) ?? []), p.profileId])
    }
    const mineNow = user ? myPick(-1, 0) : null
    if (user && mineNow) by.set(mineNow, [...(by.get(mineNow) ?? []), user.profileId])
    return by
  }, [extras.picks, user, myPick])

  const openGames = useMemo(
    () => (extras.hasPickTable ? bracket.rounds.flatMap((r) => r.matches).filter((m) => extras.details[m.id]?.open) : []),
    [bracket, extras],
  )
  const champOpen = extras.hasPickTable && extras.championOpen
  const toPick = openGames.length + (champOpen ? 1 : 0)
  const picked = user ? openGames.filter((m) => myPick(m.round, m.slot)).length + (champOpen && myPick(-1, 0) ? 1 : 0) : 0
  const lockAt = openGames.map((m) => extras.details[m.id]?.lockAt).find(Boolean) ?? (champOpen ? extras.championLockAt : null)

  // The pick bar, when it has something to say (it hides away from Games
  // once every pick is in). The panel above it gives up its bottom padding
  // so the bar sits evenly between the last card and the footer.
  const barShown = extras.hasPickTable && toPick > 0 && known && !(!!user && picked >= toPick && tab !== 'games')

  const goRound = (r: number) => {
    setRound(r)
    setTab('games')
  }

  return (
    <div className={`${styles.app} ${barShown ? styles.appBar : ''}`}>
      <header className={styles.mast}>
        <div className={styles.mastInner}>
          <div className={styles.mastText}>
            <p className={styles.kicker}>
              {props.leagueName} · {props.year}
            </p>
            <h1 className={styles.title}>{props.cupName}</h1>
            <p className={styles.status}>{props.status}</p>
            <div className={styles.mastActions}>
              <button type="button" className={styles.howBtn} onClick={() => setSheet({ kind: 'how' })}>
                <Icon name="help" size={16} />
                How it works
              </button>
              <span className={styles.mastMeta}>
                {bracket.field} teams · Weeks {bracket.startWeek} to {bracket.finalWeek}
              </span>
            </div>
          </div>
          <div className={styles.mastCup} aria-hidden>
            <span className={styles.mastHalo} />
            {trophy({ width: 120, brass: '#c8a35b', light: '#e6cb8e', dark: '#7d6230', plate: '#0d2a21' })}
            {bracket.champion ? <span className={styles.mastChamp}>{bracket.champion.name}</span> : null}
          </div>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="The Cup">
        <div className={styles.tabsInner}>
          {(
            [
              ['games', 'Games'],
              ['bracket', 'Bracket'],
              ['odds', 'Odds'],
              ['leaders', 'Leaders'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" className={`${styles.tab} ${tab === id ? styles.tabOn : ''}`} onClick={() => setTab(id)} aria-pressed={tab === id}>
              {label}
              {id === 'games' && user && toPick - picked > 0 ? <span className={styles.tabDot}>{toPick - picked}</span> : null}
            </button>
          ))}
        </div>
      </nav>

      <div className={styles.panel}>
        {tab === 'games' ? (
          <Games
            bracket={bracket}
            extras={extras}
            round={round}
            setRound={setRound}
            user={user}
            known={known}
            cupId={cupId}
            seededThrough={seededThrough}
            myPick={myPick}
            crowdOf={crowdOf}
            onTap={tapTeam}
            saving={saving}
            openCount={openGames.length}
            champOpen={champOpen}
            champName={user ? (nameOf.get(myPick(-1, 0) ?? '') ?? null) : null}
            onWho={() => setSheet({ kind: 'who', then: null })}
            onHow={() => setSheet({ kind: 'how' })}
            onChampion={openChampion}
          />
        ) : null}
        {tab === 'bracket' ? <BracketTab bracket={bracket} odds={extras.odds} user={user} imageUrl={imageUrl} slug={slug} title={`${props.cupName} · ${props.leagueName}`} onRound={goRound} /> : null}
        {tab === 'odds' ? <OddsTab bracket={bracket} odds={extras.odds} notes={notes} user={user} votes={championVotes} /> : null}
        {tab === 'leaders' ? <LeadersTab bracket={bracket} extras={extras} user={user} userIn={!!user && (extras.picks.some((p) => p.profileId === user.profileId) || Object.keys(mine).some((k) => k.startsWith(`${user.profileId}|`)))} votes={championVotes} champName={user ? (nameOf.get(myPick(-1, 0) ?? '') ?? null) : null} onChampion={openChampion} onWho={() => setSheet({ kind: 'who', then: null })} /> : null}
      </div>

      {extras.hasPickTable && toPick > 0 && known ? (
        <PickBar
          user={user}
          total={toPick}
          picked={picked}
          lockAt={lockAt}
          onGames={tab === 'games' ? null : () => setTab('games')}
          onWho={() => setSheet({ kind: 'who', then: null })}
        />
      ) : null}

      {sheet?.kind === 'how' ? (
        <SheetFrame title="How the Cup works" onClose={() => setSheet(null)}>
          <HowItWorks bracket={bracket} extras={extras} seededThrough={seededThrough} />
          <button type="button" className={styles.sheetCta} onClick={() => setSheet(null)}>
            Got it
          </button>
        </SheetFrame>
      ) : null}
      {sheet?.kind === 'who' ? (
        <SheetFrame title="Who are you?" sub="Your picks go under your name. Same name you use for pick’ems." onClose={() => setSheet(null)}>
          <div className={styles.whoGrid}>
            {extras.pickers.map((p) => (
              <button key={p.profileId} type="button" className={`${styles.whoBtn} ${user?.profileId === p.profileId ? styles.whoBtnOn : ''}`} onClick={() => chooseUser(p, sheet.then)}>
                <span className={styles.mono}>{initials(p.name)}</span>
                <span className={styles.whoName}>{p.name}</span>
              </button>
            ))}
          </div>
          {user ? (
            <button
              type="button"
              className={styles.sheetLink}
              onClick={() => {
                setUser(null)
                setSheet(null)
              }}
            >
              Not {user.name}? Sign out of picks
            </button>
          ) : null}
        </SheetFrame>
      ) : null}
      {sheet?.kind === 'champ' ? (
        <SheetFrame
          title="Pick your champion"
          sub={`The team you think wins it all. Worth ${extras.championBonus} points. Locks ${lockText(extras.championLockAt) ?? 'when round one starts'}.`}
          onClose={() => setSheet(null)}
        >
          <ChampionGrid
            bracket={bracket}
            odds={extras.odds}
            mine={myPick(-1, 0)}
            onPick={(id) => {
              if (user) void save(user, -1, 0, id)
              setSheet(null)
            }}
          />
        </SheetFrame>
      ) : null}

      {toast ? (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : ''}`} role="status">
          {toast.ok ? <Icon name="check" size={15} /> : null}
          {toast.text}
        </div>
      ) : null}
    </div>
  )
}

// ── Sheets ──

// Fixed over the whole screen. Rendered inside the app rather than portalled
// to the body so it keeps the page's colours and the Cup's numeral font;
// nothing above it on this page makes a stacking context.
function SheetFrame({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className={styles.sheetRoot} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className={styles.sheetGrip} aria-hidden />
        <div className={styles.sheetHead}>
          <div>
            <h2 className={styles.sheetTitle}>{title}</h2>
            {sub ? <p className={styles.sheetSub}>{sub}</p> : null}
          </div>
          <button type="button" className={styles.sheetX} onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className={styles.sheetBody}>{children}</div>
      </div>
    </div>
  )
}

function HowItWorks({ bracket, extras, seededThrough }: { bracket: CupBracket; extras: CupExtras; seededThrough: number }) {
  const byes = bracket.rounds[0]?.byes.length ?? 0
  const steps: { icon: 'seed' | 'week' | 'tap' | 'cup'; head: string; body: string }[] = [
    {
      icon: 'seed',
      head: 'Seeded from the standings',
      body: `The top ${bracket.field} after week ${seededThrough} are in.${byes ? ` Seeds 1 to ${byes} skip round one.` : ''}`,
    },
    {
      icon: 'week',
      head: 'One round a week',
      body: 'Your real score that week is your Cup score. The higher score moves on, whoever you play in the league. A tie goes to the higher seed.',
    },
    {
      icon: 'tap',
      head: 'Pick who wins each game',
      body: 'Tap the team you think wins. Picks save as you tap, and you can change them until kickoff Thursday night. There’s nothing to submit.',
    },
    {
      icon: 'cup',
      head: 'Score points',
      body: `A right pick is worth ${extras.points.map((p, i) => `${p} in the ${bracket.rounds[i]!.name.toLowerCase()}`).join(', ')}. Your champion is worth ${extras.championBonus} more if they win it all.`,
    },
  ]
  return (
    <ol className={styles.how}>
      {steps.map((s, i) => (
        <li key={s.head} className={styles.howStep}>
          <span className={styles.howIcon}>
            <Icon name={s.icon} size={20} />
          </span>
          <span className={styles.howText}>
            <span className={styles.howHead}>
              <span className={styles.howNum}>{i + 1}</span>
              {s.head}
            </span>
            <span className={styles.howBody}>{s.body}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function ChampionGrid({ bracket, odds, mine, onPick }: { bracket: CupBracket; odds: CupOdds[]; mine: string | null; onPick: (managerId: string) => void }) {
  const teams = entrantsOf(bracket)
  const oddsOf = new Map(odds.map((o) => [o.managerId, o.win]))
  return (
    <div className={styles.champGrid}>
      {teams.map((t) => (
        <button key={t.managerId} type="button" className={`${styles.champBtn} ${mine === t.managerId ? styles.champBtnOn : ''}`} onClick={() => onPick(t.managerId)} aria-pressed={mine === t.managerId}>
          <span className={styles.medal}>{t.seed}</span>
          <span className={styles.champName}>{t.name}</span>
          <span className={styles.champOdds}>{pct(oddsOf.get(t.managerId) ?? 0)}</span>
        </button>
      ))}
    </div>
  )
}

function entrantsOf(bracket: CupBracket): CupEntrant[] {
  return [...bracket.rounds[0]!.matches.flatMap((m) => [teamOf(m.a), teamOf(m.b)]), ...bracket.rounds[0]!.byes]
    .filter((e): e is CupEntrant => !!e)
    .sort((x, y) => x.seed - y.seed)
}

// ── The bar at the bottom: how many picks are in, and that they're saved ──

function PickBar({
  user,
  total,
  picked,
  lockAt,
  onGames,
  onWho,
}: {
  user: User | null
  total: number
  picked: number
  lockAt: string | null
  onGames: (() => void) | null
  onWho: () => void
}) {
  const done = !!user && picked >= total
  // Nothing to say away from the games once every pick is in.
  if (done && onGames) return null
  const lock = lockText(lockAt)
  return (
    <div className={`${styles.pickBar} ${done ? styles.pickBarDone : ''}`} role="status">
      <div className={styles.pickBarInner}>
        {!user ? (
          <>
            <span className={styles.pickBarText}>
              <b>Pick the winners</b>
              <span>
                {total} {total === 1 ? 'pick' : 'picks'} open{lock ? ` · locks ${lock}` : ''}
              </span>
            </span>
            <button type="button" className={styles.pickBarBtn} onClick={onWho}>
              Start picking
            </button>
          </>
        ) : done ? (
          <>
            <span className={styles.pickBarCheck}>
              <Icon name="check" size={16} />
            </span>
            <span className={styles.pickBarText}>
              <b>All {total} picks saved</b>
              <span>{lock ? `Change them until ${lock}` : 'You can change them until kickoff'}</span>
            </span>
          </>
        ) : (
          <>
            <span className={styles.pickDots} aria-hidden>
              {Array.from({ length: total }, (_, i) => (
                <span key={i} className={i < picked ? styles.pickDotOn : ''} />
              ))}
            </span>
            <span className={styles.pickBarText}>
              <b>
                {picked} of {total} picked
              </b>
              <span>Saved as you tap{lock ? ` · locks ${lock}` : ''}</span>
            </span>
            {onGames ? (
              <button type="button" className={styles.pickBarBtn} onClick={onGames}>
                Pick now
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

// ── Games ──

function Games(props: {
  bracket: CupBracket
  extras: CupExtras
  round: number
  setRound: (r: number) => void
  user: User | null
  known: boolean
  cupId: string
  seededThrough: number
  myPick: (r: number, slot: number) => string | null
  crowdOf: (m: CupMatch, d: CupMatchDetail) => { a: number; b: number }
  onTap: (r: number, slot: number, managerId: string) => void
  saving: string | null
  openCount: number
  champOpen: boolean
  champName: string | null
  onWho: () => void
  onHow: () => void
  onChampion: () => void
}) {
  const { bracket, extras, round, setRound, user, known } = props
  const r = bracket.rounds[round] ?? bracket.rounds[0]!
  const done = r.matches.length > 0 && r.matches.every((m) => m.state === 'final')
  const lockAt = r.matches.map((m) => extras.details[m.id]?.lockAt).find(Boolean) ?? null
  const open = extras.hasPickTable && r.matches.some((m) => extras.details[m.id]?.open)
  const anyOpen = props.openCount > 0 || props.champOpen
  const introKey = `tsc-cup-intro-${props.cupId}`
  const introGone = useStored(introKey)

  return (
    <>
      {known && !user && anyOpen ? (
        <StartCard bracket={bracket} onWho={props.onWho} onHow={props.onHow} />
      ) : known && !user && introGone == null && bracket.status !== 'done' ? (
        <StartCard bracket={bracket} onHow={props.onHow} onDismiss={() => writeStored(introKey, '1')} />
      ) : null}
      {user ? <YouRow bracket={bracket} extras={extras} user={user} onWho={props.onWho} /> : null}

      {props.champOpen && known ? (
        <button type="button" className={`${styles.champCard} ${props.champName ? styles.champCardSet : ''}`} onClick={props.onChampion}>
          <span className={styles.champCardIcon}>
            <Icon name="cup" size={22} />
          </span>
          <span className={styles.champCardText}>
            <span className={styles.champCardLabel}>Your champion · +{extras.championBonus}</span>
            <span className={styles.champCardName}>{props.champName ?? 'Who wins it all?'}</span>
          </span>
          <span className={styles.champCardGo}>{props.champName ? 'Change' : 'Choose'}</span>
        </button>
      ) : null}

      <RoundRail bracket={bracket} round={r.round} setRound={setRound} />

      <div className={styles.roundHead}>
        <h2 className={styles.roundName}>{r.name}</h2>
        <p className={styles.roundSub}>
          Week {r.week}
          {done ? ' · Final' : ''}
          {open && lockAt ? ` · Picks lock ${lockText(lockAt)}` : ''}
          {!open && !done && lockAt && r.matches.some((m) => extras.details[m.id]?.locked) ? ' · Picks locked' : ''}
        </p>
      </div>

      {done ? <RoundRecap round={r} /> : null}

      {r.byes.length ? (
        <p className={styles.byes}>
          <span className={styles.byesLabel}>Byes</span>
          {[...r.byes]
            .sort((x, y) => x.seed - y.seed)
            .map((e) => `${e.name} (${e.seed})`)
            .join(', ')}
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

// The first thing a newcomer sees: what the Cup is in three lines, and the
// way in. With picks open it ends on the button that starts them; between
// rounds it can be put away.
function StartCard({ bracket, onWho, onHow, onDismiss }: { bracket: CupBracket; onWho?: () => void; onHow: () => void; onDismiss?: () => void }) {
  return (
    <section className={styles.start}>
      <div className={styles.startHead}>
        <span className={styles.startTag}>New here?</span>
        {onDismiss ? (
          <button type="button" className={styles.startX} onClick={onDismiss} aria-label="Hide">
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>
      <h2 className={styles.startTitle}>A knockout bracket inside the season</h2>
      <ol className={styles.startSteps}>
        <li>
          <span>1</span>Your real score each week is your Cup score.
        </li>
        <li>
          <span>2</span>Outscore your Cup opponent to move on. {bracket.rounds.length} rounds, one a week.
        </li>
        <li>
          <span>3</span>Pick who wins each game for points.
        </li>
      </ol>
      <div className={styles.startActions}>
        {onWho ? (
          <button type="button" className={styles.btnGold} onClick={onWho}>
            Start picking
          </button>
        ) : null}
        <button type="button" className={styles.btnGhostDark} onClick={onHow}>
          Full rules
        </button>
      </div>
    </section>
  )
}

// Who's picking, and where their own team stands in the Cup.
function YouRow({ bracket, extras, user, onWho }: { bracket: CupBracket; extras: CupExtras; user: User; onWho: () => void }) {
  let line: string | null = null
  const o = user.teamId ? extras.odds.find((x) => x.managerId === user.teamId) : null
  if (o) {
    if (!o.alive && o.out) line = `Out in the ${o.out.round.toLowerCase()} to ${o.out.to}`
    else if (bracket.champion?.managerId === user.teamId) line = 'You won the Cup'
    else {
      const cur = bracket.currentRound != null ? bracket.rounds[bracket.currentRound] : null
      const game = cur?.matches.find((m) => teamOf(m.a)?.managerId === user.teamId || teamOf(m.b)?.managerId === user.teamId)
      const bye = cur?.byes.some((e) => e.managerId === user.teamId)
      if (game) {
        const side = teamOf(game.a)?.managerId === user.teamId ? 'a' : 'b'
        const opp = teamOf(game[side === 'a' ? 'b' : 'a'])
        const p = extras.details[game.id]?.probA
        const mine = p == null ? null : side === 'a' ? p : 1 - p
        line = opp ? `${ordinal(o.seed)} seed · v ${opp.name}${mine != null ? `, ${pct(mine * 100)} to win` : ''}` : `${ordinal(o.seed)} seed · still alive`
      } else if (bye) line = `${ordinal(o.seed)} seed · bye in the ${cur!.name.toLowerCase()}`
      else line = `${ordinal(o.seed)} seed · still alive`
      line += ` · ${pct(o.win)} to win the Cup`
    }
  }
  return (
    <div className={styles.you}>
      <span className={styles.mono}>{initials(user.name)}</span>
      <span className={styles.youText}>
        <span className={styles.youName}>
          <span className={styles.youLabel}>Picking as</span> {user.name}
        </span>
        {line ? <span className={styles.youLine}>{line}</span> : null}
      </span>
      <button type="button" className={styles.youChange} onClick={onWho}>
        Change
      </button>
    </div>
  )
}

function RoundRail({ bracket, round, setRound }: { bracket: CupBracket; round: number; setRound: (r: number) => void }) {
  return (
    <ol className={styles.rail} aria-label="Rounds">
      {bracket.rounds.map((x, i) => {
        const final = x.matches.length > 0 && x.matches.every((m) => m.state === 'final')
        const live = x.matches.some((m) => m.state === 'live')
        const on = x.round === round
        return (
          <li key={x.round} className={`${styles.railStep} ${final ? styles.railDone : ''} ${live ? styles.railLive : ''} ${on ? styles.railOn : ''}`}>
            <button type="button" onClick={() => setRound(x.round)} aria-current={on ? 'step' : undefined}>
              <span className={styles.railDot}>{final ? <Icon name="check" size={12} /> : i + 1}</span>
              <span className={styles.railName}>{x.short}</span>
              <span className={styles.railWeek}>{live ? 'This week' : `Week ${x.week}`}</span>
            </button>
          </li>
        )
      })}
    </ol>
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
        {upsets.length === 0 ? 'Every higher seed won.' : upsets.length === 1 ? 'One upset.' : `${upsets.length} upsets.`}
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
  onTap: (r: number, slot: number, managerId: string) => void
  saving: string | null
  extras: CupExtras
  bracket: CupBracket
}) {
  const { m, index, d, user } = props
  const a = teamOf(m.a)
  const b = teamOf(m.b)
  const mineNow = props.myPick(m.round, m.slot)
  // Open to a tap whether or not a name is chosen yet: a tap with no name
  // asks for one, then makes the pick.
  const pickable = d.open && props.extras.hasPickTable
  const crowd = props.crowdOf(m, d)
  const crowdTotal = crowd.a + crowd.b
  // The split is shown once you've picked (or the round has locked), and
  // only once a few people have, so it never reads "100%, 1 pick".
  const showCrowd = crowdTotal >= 3 && (!!mineNow || d.locked || m.state === 'final')
  const savingThis = !!user && props.saving === `${user.profileId}|${m.round}:${m.slot}`
  const winner = m.winner ? teamOf(m[m.winner]) : null
  const loser = m.winner ? teamOf(m[m.winner === 'a' ? 'b' : 'a']) : null
  const margin = winner && loser ? Math.abs((m.a.kind === 'team' ? (m.a.score ?? 0) : 0) - (m.b.kind === 'team' ? (m.b.score ?? 0) : 0)) : 0
  const winnerProb = m.winner && d.probA != null ? (m.winner === 'a' ? d.probA : 1 - d.probA) : null
  const pointsHere = props.extras.points[m.round] ?? 1
  const pickedName = mineNow ? (mineNow === a?.managerId ? a?.name : mineNow === b?.managerId ? b?.name : null) : null
  const other = mineNow && a && b ? (mineNow === a.managerId ? b.name : a.name) : null

  // The question, asked on every open game: this is a pick of who WINS.
  let prompt: React.ReactNode = null
  if (pickable && a && b) {
    prompt = pickedName ? (
      <>
        <b>Your pick: {pickedName}.</b> Tap {other} to switch.
      </>
    ) : (
      <>
        <b>Who wins?</b> Tap a team to pick it.
      </>
    )
  } else if (user && props.extras.hasPickTable && a && b && m.state !== 'upcoming') {
    if (m.state === 'final' && winner) {
      prompt = pickedName ? (
        winner.managerId === mineNow ? (
          <>
            <b className={styles.right}>You called it.</b> +{pointsHere} {pointsHere === 1 ? 'point' : 'points'}.
          </>
        ) : (
          <>
            <b className={styles.wrong}>Your pick: {pickedName}.</b> No points.
          </>
        )
      ) : (
        <>No pick on this one.</>
      )
    } else if (d.locked) {
      prompt = pickedName ? (
        <>
          <b>Your pick: {pickedName}.</b> Locked.
        </>
      ) : (
        <>Picks locked. You didn’t pick this one.</>
      )
    }
  }

  const row = (side: 'a' | 'b') => {
    const s = m[side]
    const e = teamOf(s)
    const prob = d.probA == null ? null : side === 'a' ? d.probA : 1 - d.probA
    const won = m.winner === side
    const lost = !!m.winner && !won
    const picked = !!e && mineNow === e.managerId
    const final = m.state === 'final'
    const cls = [
      styles.team,
      pickable && e ? styles.teamPickable : '',
      picked && !final ? styles.teamPicked : '',
      picked && final && won ? styles.teamRight : '',
      picked && final && lost ? styles.teamWrong : '',
      won ? styles.teamWon : '',
      lost ? styles.teamLost : '',
    ].join(' ')
    const inner = e ? (
      <>
        <span className={styles.medal}>{e.seed}</span>
        <span className={styles.teamWho}>
          <span className={styles.teamName}>
            <span className={styles.teamNameText}>{e.name}</span>
            {won ? <span className={styles.tagThrough}>Through</span> : null}
          </span>
          <span className={styles.teamMeta}>
            {e.team && e.team !== e.name ? `${e.team} · ` : ''}
            {e.record}
          </span>
        </span>
        {s.kind === 'team' && s.score != null ? (
          <span className={styles.teamScore}>{pts(s.score)}</span>
        ) : prob != null ? (
          <span className={styles.teamOdds}>
            <span className={styles.teamPct}>
              {Math.round(prob * 100) >= 100 ? '>99' : Math.round(prob * 100) <= 0 ? '<1' : Math.round(prob * 100)}
              <small>%</small>
            </span>
            <span className={styles.teamBar}>
              <span style={{ width: `${Math.round(prob * 100)}%` }} />
            </span>
          </span>
        ) : (
          <span />
        )}
        {pickable ? (
          <span className={styles.radio} aria-hidden>
            {picked ? <Icon name="check" size={13} /> : null}
          </span>
        ) : null}
      </>
    ) : (
      <>
        <span className={`${styles.medal} ${styles.medalEmpty}`} />
        <span className={styles.teamWho}>
          <span className={styles.tbd}>{s.kind === 'tbd' && s.options.length ? `${s.options[0]} or ${s.options[1]}` : 'To be decided'}</span>
        </span>
        <span />
      </>
    )
    return pickable && e ? (
      <button
        type="button"
        className={cls}
        onClick={() => props.onTap(m.round, m.slot, e.managerId)}
        aria-pressed={picked}
        aria-label={`Pick ${e.name} to win`}
        disabled={savingThis}
      >
        {inner}
      </button>
    ) : (
      <div className={cls}>{inner}</div>
    )
  }

  // Three short lines under the teams, each a box-score: the numbers first
  // (leader's number first), then who's ahead. One line each on a phone, and
  // no row starts with a name.
  type Fact = { label: string; score: string; who: string | null }
  const facts: Fact[] = []
  if (a && b) {
    const lead = (x: number, y: number) => (x > y ? a.name : y > x ? b.name : null)
    if (d.duel) {
      const [hi, lo] = d.duel.a >= d.duel.b ? [d.duel.a, d.duel.b] : [d.duel.b, d.duel.a]
      // "Weeks won" read like a season record. This is the two of them
      // side by side every week this season: who put up the higher score.
      facts.push({ label: 'Season duel', score: `${hi}-${lo}${d.duel.t ? `-${d.duel.t}` : ''}`, who: lead(d.duel.a, d.duel.b) ?? 'Even' })
    }
    if (d.formA.length && d.formB.length) {
      const avg = (l: number[]) => l.reduce((n, v) => n + v, 0) / l.length
      const [ma, mb] = [avg(d.formA), avg(d.formB)]
      const [hi, lo] = ma >= mb ? [ma, mb] : [mb, ma]
      facts.push({ label: 'Last 3 avg', score: `${hi.toFixed(1)} v ${lo.toFixed(1)}`, who: lead(ma, mb) ?? 'Even' })
    }
    if (d.series) {
      const [hi, lo] = d.series.w >= d.series.l ? [d.series.w, d.series.l] : [d.series.l, d.series.w]
      facts.push({ label: 'All-time', score: `${hi}-${lo}${d.series.t ? `-${d.series.t}` : ''}`, who: lead(d.series.w, d.series.l) ?? 'Even' })
    } else {
      facts.push({ label: 'All-time', score: '0-0', who: 'First meeting' })
    }
  }

  const stateChip =
    m.state === 'live' ? (
      <span className={styles.chipLive}>This week</span>
    ) : m.state === 'final' ? (
      <span className={styles.chipFinal}>Final</span>
    ) : m.state === 'waiting' ? (
      <span className={styles.chipFinal}>Awaiting scores</span>
    ) : (
      <span className={styles.chipWeek}>Week {m.week}</span>
    )

  return (
    <article className={`${styles.game} ${m.state === 'live' ? styles.gameLive : ''} ${pickable && !mineNow ? styles.gameAsk : ''}`}>
      <span className={styles.ghost} aria-hidden>
        {index + 1}
      </span>
      <header className={styles.gameHead}>
        <span className={styles.gameNum}>Game {index + 1}</span>
        {m.sameGame ? <span className={styles.flag}>Also their league game</span> : null}
        {m.state === 'final' && m.upsetBy >= UPSET_GAP ? <span className={styles.flagRed}>Upset</span> : null}
        {stateChip}
      </header>
      {prompt ? <p className={styles.prompt}>{prompt}</p> : null}
      <div className={styles.sides}>
        {row('a')}
        <span className={styles.vs} aria-hidden>
          <span>vs</span>
        </span>
        {row('b')}
      </div>
      {m.state === 'final' && winner ? (
        <p className={styles.result}>
          {winner.name} through by {pts(margin)}
          {m.tiebreak ? ', level on points and settled on seed' : ''}
          {winnerProb != null && winnerProb < 0.45 ? `, a ${pct(winnerProb * 100)} shot` : ''}.
        </p>
      ) : null}
      {a && b && facts.length ? (
        <dl className={styles.facts}>
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>
                <span className={styles.factScore}>{f.score}</span>
                {f.who ? <span className={styles.factWho}>{f.who}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {a && b && showCrowd ? (
        <div className={styles.crowd}>
          <span className={styles.crowdLabel}>League picks · {crowdTotal}</span>
          <span className={styles.crowdBar}>
            <span style={{ width: `${Math.round((crowd.a / crowdTotal) * 100)}%` }} />
          </span>
          <span className={styles.crowdNames}>
            <span className={styles.crowdSide}>
              <span className={styles.crowdName}>{a.name}</span>
              <span className={styles.crowdPct}>{Math.round((crowd.a / crowdTotal) * 100)}%</span>
            </span>
            <span className={styles.crowdSide}>
              <span className={styles.crowdPct}>{Math.round((crowd.b / crowdTotal) * 100)}%</span>
              <span className={styles.crowdName}>{b.name}</span>
            </span>
          </span>
        </div>
      ) : null}
    </article>
  )
}

// ── Bracket ──

function BracketTab({
  bracket,
  odds,
  user,
  imageUrl,
  slug,
  title,
  onRound,
}: {
  bracket: CupBracket
  odds: CupOdds[]
  user: User | null
  imageUrl: string
  slug: string
  title: string
  onRound: (r: number) => void
}) {
  const mine = user?.teamId ?? null
  const fav = bracket.champion ? null : ([...odds].filter((o) => o.alive).sort((x, y) => y.win - x.win)[0] ?? null)
  return (
    <>
      {/* The board: the same round track as Games across the top (a tap
          opens that round's games), then the draw under it, column for
          column. */}
      <div className={styles.board}>
        <RoundRail bracket={bracket} round={-1} setRound={onRound} />
        <div className={styles.bracket} style={{ ['--slots' as string]: bracket.size / 2, ['--cols' as string]: bracket.rounds.length }}>
          {bracket.rounds.map((r, ri) => (
            <div className={styles.col} key={r.round}>
              <div className={styles.colBody}>
                {pairsOf(r, ri > 0 ? bracket.rounds[ri - 1] : null).map((pair, pi) => (
                  <div className={`${styles.pair} ${pair.join ? styles[pair.join] : ''}`} key={pi}>
                    {pair.cells.map((cell, ci) => (
                      <div className={styles.cell} key={ci}>
                        {cell.match ? <MiniCard m={cell.match} fed={cell.fed} last={ri === bracket.rounds.length - 1} mine={mine} /> : null}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {mine && bracket.rounds.some((r) => r.matches.some((m) => teamOf(m.a)?.managerId === mine || teamOf(m.b)?.managerId === mine)) ? (
        <p className={styles.legendMine}>
          <span aria-hidden /> Your team
        </p>
      ) : null}

      <div className={styles.trophyCard}>
        <span className={styles.trophyArt} aria-hidden>
          {trophy({ width: 54, brass: '#a8823c', light: '#d9b66f', dark: '#6b5124', plate: '#e3cd95' })}
        </span>
        <span className={styles.trophyText}>
          <span className={styles.trophyLabel}>Champion · week {bracket.finalWeek}</span>
          <span className={styles.trophyName}>{bracket.champion ? bracket.champion.name : 'To be decided'}</span>
          <span className={styles.trophyLine}>
            {bracket.champion
              ? `The ${ordinal(bracket.champion.seed)} seed${bracket.runnerUp ? `, over ${bracket.runnerUp.name} in the final` : ''}`
              : fav
                ? `Favourite: ${fav.name}, ${pct(fav.win)}`
                : `Final in week ${bracket.finalWeek}`}
          </span>
        </span>
      </div>

      <div className={styles.bracketFoot}>
        <SaveImage url={imageUrl} filename={`${slug}-cup-bracket.png`} title={title} />
        <p className={styles.legend}>Struck through: knocked out. Each round is one week; a tie goes to the higher seed.</p>
      </div>
    </>
  )
}

// Saving the bracket picture. A plain download link opened the PNG on its
// own black screen, and from the home-screen app (no browser toolbar) there
// was no way back to the Cup. Now: phones get the share sheet with the image
// itself in it ("Save Image" is in there), computers download it, and
// anything else shows it over the page with a Close button, to press and hold.
function SaveImage({ url, filename, title }: { url: string; filename: string; title: string }) {
  const blob = useRef<Blob | null>(null)
  const [shown, setShown] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Fetched ahead of the tap: iOS only opens the share sheet straight out of
  // the tap, and drawing the image takes a few seconds.
  useEffect(() => {
    let dead = false
    fetch(url)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!dead && b) blob.current = b
      })
      .catch(() => {})
    return () => {
      dead = true
    }
  }, [url])

  async function onClick() {
    const touch = window.matchMedia('(pointer: coarse)').matches
    let b = blob.current
    if (!b && !touch) {
      setBusy(true)
      b = await fetch(url)
        .then((r) => (r.ok ? r.blob() : null))
        .catch(() => null)
      setBusy(false)
    }
    if (b && !touch) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      return
    }
    if (b) {
      const file = new File([b], filename, { type: 'image/png' })
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title })
          return
        } catch (e) {
          if ((e as Error).name === 'AbortError') return
        }
      }
    }
    setShown(b ? URL.createObjectURL(b) : url)
  }

  function close() {
    if (shown?.startsWith('blob:')) URL.revokeObjectURL(shown)
    setShown(null)
  }

  return (
    <>
      <button type="button" className={styles.btnGold} onClick={onClick} disabled={busy}>
        <Icon name="share" size={17} />
        {busy ? 'Getting the image' : 'Save the bracket image'}
      </button>
      {shown ? (
        <SheetFrame title="The bracket" sub="Press and hold the image to save it." onClose={close}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.savedImg} src={shown} alt="The Cup bracket" />
          <button type="button" className={styles.sheetCta} onClick={close}>
            Back to the Cup
          </button>
        </SheetFrame>
      ) : null}
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

function MiniCard({ m, fed, last, mine }: { m: CupMatch; fed: boolean; last: boolean; mine: string | null }) {
  const row = (side: 'a' | 'b') => {
    const s = m[side]
    const e = teamOf(s)
    const cls = `${styles.mRow} ${m.winner === side ? styles.mWon : ''} ${m.winner && m.winner !== side ? styles.mLost : ''} ${e && e.managerId === mine ? styles.mMine : ''}`
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

function VoteChip({ n }: { n: number }) {
  return (
    <span className={styles.votePill} title={`${n} champion ${n === 1 ? 'pick' : 'picks'}`}>
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M5 0.4l1.4 2.9 3.2.4-2.3 2.2.6 3.2L5 7.6 2.1 9.1l.6-3.2L.4 3.7l3.2-.4z" fill="currentColor" />
      </svg>
      {n}
    </span>
  )
}

function OddsTab({ bracket, odds, notes, user, votes }: { bracket: CupBracket; odds: CupOdds[]; notes: CupNotes; user: User | null; votes: Map<string, string[]> }) {
  const alive = odds.filter((o) => o.alive)
  // Knocked out, furthest run first (the beaten finalist, then the semis...).
  const depth = new Map(bracket.rounds.map((r) => [r.name, r.round]))
  const out = odds.filter((o) => !o.alive).sort((x, y) => (depth.get(y.out?.round ?? '') ?? 0) - (depth.get(x.out?.round ?? '') ?? 0) || x.seed - y.seed)
  // Labels for the "reach" figures: the last two rounds before the title
  // (the next round is near-certain for a top seed and says little).
  const later = bracket.rounds.slice(1).map((r) => r.short)
  const shown = later.map((label, i) => ({ label, i })).slice(-2)
  const finalIdx = bracket.rounds.length - 2
  // Bars scale to the favourite, so a 20% leader doesn't read as empty.
  const top = Math.max(1, ...alive.map((o) => o.win))
  // The three favourites get a card each; everyone after is a row.
  const podium = bracket.champion ? [] : alive.slice(0, 3)
  const rows = bracket.champion ? alive : alive.slice(3)
  const nVotes = (id: string) => votes.get(id)?.length ?? 0
  return (
    <>
      <h2 className={styles.sectionHead}>{bracket.champion ? 'Champion' : 'Who wins the Cup'}</h2>
      <p className={styles.sectionSub}>
        {bracket.champion
          ? `${bracket.champion.name} won it.`
          : `From 20,000 simulated Cups, played on each team’s scoring this season.${votes.size ? ' The star counts the league’s champion picks.' : ''}`}
      </p>

      {podium.length ? (
        <ol className={styles.podium}>
          {podium.map((o, i) => (
            <li key={o.managerId} className={`${styles.pod} ${i === 0 ? styles.podFirst : ''} ${user?.teamId === o.managerId ? styles.podMine : ''}`}>
              <span className={styles.podRank}>{i === 0 ? 'Favourite' : i === 1 ? '2nd' : '3rd'}</span>
              <span className={styles.medal}>{o.seed}</span>
              <span className={styles.podName}>{o.name}</span>
              <span className={styles.podPct}>
                {pct(o.win).replace('%', '')}
                <small>%</small>
              </span>
              <span className={styles.podFoot}>
                <span className={styles.podPath}>{finalIdx >= 0 ? `Final ${pct(o.reach[finalIdx] ?? 0)}` : `${ordinal(o.seed)} seed`}</span>
                {nVotes(o.managerId) ? <VoteChip n={nVotes(o.managerId)} /> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {rows.length ? (
        <ol className={styles.oddsList}>
          {rows.map((o) => (
            <li key={o.managerId} className={`${styles.oddsRow} ${user?.teamId === o.managerId ? styles.oddsMine : ''}`}>
              <span className={`${styles.medal} ${styles.medalSm}`}>{o.seed}</span>
              <span className={styles.oddsWho}>
                <span className={styles.oddsName}>
                  <span className={styles.oddsNameText}>{o.name}</span>
                  {nVotes(o.managerId) ? <VoteChip n={nVotes(o.managerId)} /> : null}
                </span>
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
      ) : null}

      {out.length ? (
        <>
          <h3 className={styles.subHead}>Knocked out</h3>
          <ul className={styles.outList}>
            {out.map((o) =>
              o.out ? (
                <li key={o.managerId} className={user?.teamId === o.managerId ? styles.oddsMine : ''}>
                  <span className={`${styles.medal} ${styles.medalSm} ${styles.medalOut}`}>{o.seed}</span>
                  <span className={styles.outWho}>
                    <span className={styles.outName}>{o.name}</span>
                    <span className={styles.outLine}>
                      {o.out.round} · lost to {o.out.to}
                    </span>
                  </span>
                  <span className={styles.outScore}>
                    {pts(o.out.mine)}
                    <small>{pts(o.out.theirs)}</small>
                  </span>
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

// ── Leaders: the bracket challenge ──

function LeadersTab({
  bracket,
  extras,
  user,
  userIn,
  votes,
  champName,
  onChampion,
  onWho,
}: {
  bracket: CupBracket
  extras: CupExtras
  user: User | null
  // This browser's picker has made a pick (saved before, or just now).
  userIn: boolean
  votes: Map<string, string[]>
  champName: string | null
  onChampion: () => void
  onWho: () => void
}) {
  if (!extras.hasPickTable) return <p className={styles.sectionSub}>The bracket challenge opens soon.</p>
  const teams = entrantsOf(bracket)
  const anyPoints = extras.board.some((r) => r.points > 0)
  const firstFinal = bracket.rounds.find((r) => r.matches.length)?.week
  const mineIdx = user ? extras.board.findIndex((r) => r.profileId === user.profileId) : -1
  const mine = mineIdx >= 0 ? extras.board[mineIdx] : null

  return (
    <>
      <h2 className={styles.sectionHead}>The bracket challenge</h2>
      <p className={styles.sectionSub}>Pick the winner of every Cup game. Points for each one you get right, more as the rounds go on.</p>

      <ol className={styles.ladder} aria-label="Points">
        {extras.points.map((p, i) => (
          <li key={i}>
            <span className={styles.ladderPts}>{p}</span>
            <span className={styles.ladderName}>{bracket.rounds[i]!.short}</span>
          </li>
        ))}
        <li className={styles.ladderChamp}>
          <span className={styles.ladderPts}>+{extras.championBonus}</span>
          <span className={styles.ladderName}>Champion</span>
        </li>
      </ol>

      {user ? (
        <div className={styles.meCard}>
          {mine && anyPoints ? <span className={styles.meRank}>{ordinal(mineIdx + 1)}</span> : <span className={`${styles.mono} ${styles.meMono}`}>{initials(user.name)}</span>}
          <span className={styles.meText}>
            <span className={styles.meName}>{user.name}</span>
            <span className={styles.meLine}>
              {mine?.decided ? `${mine.correct} of ${mine.decided} right` : 'No results yet'}
              {champName ? ` · Champion: ${champName}` : ''}
            </span>
          </span>
          <span className={styles.mePts}>
            {mine?.points ?? 0}
            <small>pts</small>
          </span>
        </div>
      ) : (
        <button type="button" className={styles.champCard} onClick={onWho}>
          <span className={styles.champCardIcon}>
            <Icon name="tap" size={22} />
          </span>
          <span className={styles.champCardText}>
            <span className={styles.champCardLabel}>Play along</span>
            <span className={styles.champCardName}>Choose your name to pick</span>
          </span>
          <span className={styles.champCardGo}>Start</span>
        </button>
      )}

      {extras.championOpen && user ? (
        <button type="button" className={`${styles.champCard} ${champName ? styles.champCardSet : ''}`} onClick={onChampion}>
          <span className={styles.champCardIcon}>
            <Icon name="cup" size={22} />
          </span>
          <span className={styles.champCardText}>
            <span className={styles.champCardLabel}>Your champion · +{extras.championBonus}</span>
            <span className={styles.champCardName}>{champName ?? 'Who wins it all?'}</span>
          </span>
          <span className={styles.champCardGo}>{champName ? 'Change' : 'Choose'}</span>
        </button>
      ) : null}

      <h3 className={styles.subHead}>Leaderboard</h3>
      {!anyPoints ? (
        // Before any game is decided a board of zeros says nothing. Who has
        // picked and who hasn't is the useful part (and the nudge).
        (() => {
          const inIds = new Set(extras.picks.map((p) => p.profileId))
          if (user && userIn) inIds.add(user.profileId)
          const isIn = extras.pickers.filter((p) => inIds.has(p.profileId))
          const out = extras.pickers.filter((p) => !inIds.has(p.profileId))
          return (
            <>
              <p className={styles.boardNote}>
                First points land once week {firstFinal} is final. {isIn.length} of {extras.pickers.length} have picks in.
              </p>
              <div className={styles.inList}>
                {isIn.map((p) => (
                  <span key={p.profileId} className={`${styles.inChip} ${user?.profileId === p.profileId ? styles.inChipMine : ''}`}>
                    <Icon name="check" size={12} />
                    {p.name}
                  </span>
                ))}
              </div>
              {out.length ? (
                <p className={styles.stillTo}>
                  <span>Still to pick</span> {out.map((p) => p.name).join(', ')}
                </p>
              ) : null}
            </>
          )
        })()
      ) : extras.board.length ? (
        <>
          <ol className={styles.board}>
            {extras.board.map((row, i) => {
              const medal = anyPoints && row.points > 0 && i < 3
              return (
                <li key={row.profileId} className={`${styles.boardRow} ${medal ? styles[`boardTop${i + 1}` as 'boardTop1'] : ''} ${user?.profileId === row.profileId ? styles.boardMine : ''}`}>
                  <span className={styles.boardRank}>{anyPoints ? i + 1 : ''}</span>
                  <span className={styles.boardWho}>
                    <span className={styles.boardName}>{row.name}</span>
                    <span className={styles.boardMeta}>
                      {row.decided ? `${row.correct} of ${row.decided} right` : 'Picks in, no results yet'}
                      {row.champion ? ` · Champion: ${row.champion}${row.championRight === true ? ' (right)' : row.championRight === false ? ' (out)' : ''}` : ''}
                    </span>
                  </span>
                  <span className={styles.boardPts}>{row.points}</span>
                </li>
              )
            })}
          </ol>
        </>
      ) : (
        <p className={styles.sectionSub}>No picks yet. Be the first.</p>
      )}

      <h3 className={styles.subHead}>Champion picks</h3>
      {(() => {
        const nameOf = new Map(extras.pickers.map((p) => [p.profileId, p.name]))
        const rows = teams
          .map((t) => ({ t, by: votes.get(t.managerId) ?? [] }))
          .filter((x) => x.by.length)
          .sort((x, y) => y.by.length - x.by.length || x.t.seed - y.t.seed)
        const total = rows.reduce((n, x) => n + x.by.length, 0)
        if (!total) return <p className={styles.sectionSub}>Nobody has picked a champion yet.</p>
        return (
          <>
            <ol className={styles.votes}>
              {rows.map(({ t, by }) => (
                <li key={t.managerId} className={styles.voteRow}>
                  <span className={styles.oddsSeed}>{t.seed}</span>
                  <span className={styles.voteWho}>
                    <span className={styles.voteName}>{t.name}</span>
                    {!extras.championOpen ? (
                      <span className={styles.voteBy}>
                        {by
                          .map((id) => nameOf.get(id) ?? 'Someone')
                          .sort()
                          .join(', ')}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.voteBar}>
                    <span style={{ width: `${Math.round((by.length / total) * 100)}%` }} />
                  </span>
                  <span className={styles.voteNum}>{by.length}</span>
                </li>
              ))}
            </ol>
            <p className={styles.voteNote}>
              {total} {total === 1 ? 'pick' : 'picks'}.{extras.championOpen ? ' Who picked whom shows once picks lock at kickoff.' : ''}
            </p>
          </>
        )
      })()}
    </>
  )
}
