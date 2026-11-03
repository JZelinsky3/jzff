'use client'

// Empire Builder: one captain, eleven packs, one number.
//
// Played signed out, posted signed in, the same way every board on the Games
// Page works: a finished run posts its seed and its picks to /api/games/runs,
// which re-deals every pack and derives the score itself. Signed out, the run
// is banked on this device and claimed the moment you sign in.
//
// Two formats, Classic and Mystery (see CaptainDraft), and four difficulties,
// each pair its own board. On the two blind ones the browser
// never holds the numbers of a card you kept: posting the run is what turns it
// over, and that post is final, so a player signed out gives a name first and
// sees the score after. The cards then turn over in the final reveal (see
// unveil.tsx), and the recap says what was left in the packs.

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  SALARY_CAP,
  TIERS,
  boardLabel,
  boardMode,
  builderQuery,
  chemistryFor,
  playHref,
  difficultyFromSeed,
  formatFromSeed,
  isBlind,
  tierFor,
  type BuilderFormat,
  type Difficulty,
  type Player,
} from '@/lib/packEmpire/rules'
import {
  bankRun,
  claimBank,
  guestPoster,
  postRun,
  readGuest,
  rememberGuest,
  unbankRun,
  type PostOutcome,
  type RunReveal,
} from '../../runBank'
import { CaptainDraft, type DraftDone } from '../CaptainDraft'
import { BuilderTabs } from '../Difficulty'
import { GuestName } from '../GuestName'
import { SocialChip } from '../share'
import { Face, Field, Ladder } from '../cards'
import { DraftReport, PackBoard } from '../report'
import { easeClimb, useCountUp } from '../stage'
import { Unveil } from '../unveil'
import { storageChanged, useStored } from '../clientStore'

const SAVE_KEYS: Record<Difficulty, string> = {
  open: 'pe_solo_run_v1',
  range: 'pe_solo_run_range_v1',
  season: 'pe_solo_run_season_v1',
  cap: 'pe_solo_run_cap_v1',
}

/** Each format keeps its own run at each difficulty. */
function saveKey(diff: Difficulty, format: BuilderFormat): string {
  return format === 'mystery' ? `pe_mystery_run_${diff}_v1` : SAVE_KEYS[diff]
}

/** The difficulty you last played, so a regular on Ball Knower stays there. */
const DIFF_KEY = 'pe_solo_difficulty_v1'

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
}

async function startSeed(captain: number, difficulty: Difficulty, format: BuilderFormat): Promise<string> {
  const res = await fetch('/api/games/pack-empire/deal/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start', captain, difficulty, format }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.seed) throw new Error(body?.error ?? 'Could not start a run. Try again.')
  return body.seed as string
}

function soloPayload(run: DraftDone) {
  const mode = boardMode(difficultyFromSeed(run.seed), formatFromSeed(run.seed))
  return { game: 'pack-empire', mode, pool: 'site', seed: run.seed, picks: run.picks }
}

function shareText(score: number) {
  return `${score.toLocaleString()} in Empire Builder`
}

function readDifficulty(raw: string | null): Difficulty {
  return raw === 'range' || raw === 'season' || raw === 'cap' ? raw : 'open'
}

export function EmpireBuilder({
  signedIn,
  initial,
  initialFormat = 'classic',
}: {
  signedIn: boolean
  initial?: Difficulty
  initialFormat?: BuilderFormat
}) {
  const [format, setFormat] = useState<BuilderFormat>(initialFormat)
  const [run, setRun] = useState<DraftDone | null>(null)
  const [post, setPost] = useState<PostOutcome | 'posting' | 'banked' | null>(null)
  const [round, setRound] = useState(0)
  const [shared, setShared] = useState<'copied' | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [reveal, setReveal] = useState<RunReveal | null>(null)
  /** The final reveal has played, or been skipped. */
  const [unveiled, setUnveiled] = useState(false)
  const stored = useStored(DIFF_KEY)
  const [chosen, setChosen] = useState<Difficulty | null>(initial ?? null)
  const difficulty = chosen ?? readDifficulty(stored)

  const choose = (d: Difficulty, f: BuilderFormat = format) => {
    setChosen(d)
    setFormat(f)
    // The address says what's on the table, so a refresh or a shared link lands here.
    window.history.replaceState(null, '', playHref(d, f))
    try {
      localStorage.setItem(DIFF_KEY, d)
      storageChanged()
    } catch {
      // Private browsing: it just won't be remembered.
    }
  }

  const start = useCallback((captain: number) => startSeed(captain, difficulty, format), [difficulty, format])

  // Runs played signed out on this device go up the moment there's an
  // account to post them as.
  useEffect(() => {
    if (signedIn) claimBank().catch(() => {})
  }, [signedIn])

  const onDone = useCallback(async (r: DraftDone) => {
    setRun(r)
    setPost('posting')
    setNameError(null)
    const payload = soloPayload(r)
    // A name already used on this device goes straight up.
    const guest = signedIn ? null : readGuest()
    const out = await postRun(guest ? { ...payload, guest } : payload)
    if (out.needsAuth || (guest && !out.ok)) {
      bankRun({ ...payload, at: Date.now() })
      setPost('banked')
      if (guest) setNameError(out.error ?? null)
    } else {
      if (out.reveal) setReveal(out.reveal)
      setPost(out)
    }
  }, [signedIn])

  /** The recap's name box. The run stays banked until a name is accepted. */
  const postAsGuest = async (name: string) => {
    if (!run) return
    setNameError(null)
    const guest = guestPoster(name)
    const out = await postRun({ ...soloPayload(run), guest })
    if (out.ok) {
      rememberGuest(guest)
      unbankRun(run.seed)
      if (out.reveal) setReveal(out.reveal)
      setPost(out)
    } else {
      setNameError(out.error ?? 'Could not reach the board.')
    }
  }

  const again = () => {
    setRun(null)
    setPost(null)
    setShared(null)
    setNameError(null)
    setReveal(null)
    setUnveiled(false)
    setRound((n) => n + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const share = async () => {
    if (!run) return
    // A run on the board has its own page, and its own preview. One that never
    // posted has nothing to point at but the game.
    const page = post && typeof post === 'object' && post.runId ? `run/${post.runId}/` : 'play/'
    const url = `${window.location.origin}/games/pack-empire/${page}`
    const text = shareText(reveal?.score ?? run.score)
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Pack Empire', text, url })
        return
      }
    } catch {
      return
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setShared('copied')
      window.setTimeout(() => setShared(null), 2200)
    } catch {
      // Nothing to fall back to.
    }
  }

  if (!run) {
    return (
      <div className="pe-table">
        <CaptainDraft
          key={`${format}-${difficulty}-${round}`}
          saveKey={saveKey(difficulty, format)}
          startSeed={start}
          onDone={onDone}
          difficulty={difficulty}
          mystery={format === 'mystery'}
          intro={<BuilderTabs difficulty={difficulty} format={format} onChange={choose} />}
          running={<BuilderTabs difficulty={difficulty} format={format} onChange={choose} />}
          restartable
        />
      </div>
    )
  }

  // A blind run has no numbers to show until the post comes back.
  if (isBlind(difficultyFromSeed(run.seed)) && !reveal) {
    return (
      <Sealed
        run={run}
        post={post}
        nameError={nameError}
        onGuestName={postAsGuest}
        onAgain={again}
      />
    )
  }

  const placed = post && typeof post === 'object' && post.ok && post.rank != null ? post : null
  return (
    <>
      <Recap
        key={reveal ? 'revealed' : 'open'}
        run={reveal ? { ...run, lineup: reveal.lineup, score: reveal.score } : run}
        reveal={reveal}
        post={post}
        shared={shared}
        signedIn={signedIn}
        nameError={nameError}
        onGuestName={postAsGuest}
        onAgain={again}
        onShare={share}
      />
      {reveal && !unveiled && (
        <Unveil
          lineup={reveal.lineup}
          table={run.lineup}
          captain={run.captain}
          chem={reveal.chem}
          score={reveal.score}
          line={
            placed && (
              <>
                <b>{ordinal(placed.rank as number)}</b> of {(placed.total ?? placed.rank)?.toLocaleString()} on the board
              </>
            )
          }
          onClose={() => setUnveiled(true)}
        />
      )}
    </>
  )
}

/** How long the climb takes: longer the higher it goes, so a GOAT run gets
    its moment and a practice squad run doesn't make you wait. */
function climbMs(score: number): number {
  const rungs = TIERS.filter((t) => score >= t.min).length
  return Math.min(4200, 600 + rungs * 450)
}

const SIGN_IN_HREF = '/login?next=%2Fgames%2Fpack-empire%2Fplay%2F'

function boardHref(seed: string): string {
  return `/games/pack-empire/board/${builderQuery(difficultyFromSeed(seed), formatFromSeed(seed))}`
}

/** A blind lineup, locked and not yet turned over. */
function Sealed({
  run,
  post,
  nameError,
  onGuestName,
  onAgain,
}: {
  run: DraftDone
  post: PostOutcome | 'posting' | 'banked' | null
  nameError: string | null
  onGuestName: (name: string) => Promise<void>
  onAgain: () => void
}) {
  const failed = post && typeof post === 'object' && !post.ok
  return (
    <div className="pe-table">
      <div className="pe-recap landed">
        <div className="pe-kicker">§ Lineup locked</div>
        <div className="pe-recap-tier">{post === 'banked' ? 'One step left.' : 'Turning them over.'}</div>
        <p className="pe-recap-post">
          {post === 'posting' && 'Scoring your eleven…'}
          {post === 'banked' && 'Add a name and your eleven turn over. This is final: a run only gets scored once.'}
          {failed && (post as PostOutcome).error}
        </p>
        {post === 'banked' && <GuestName error={nameError} onPost={onGuestName} signIn={SIGN_IN_HREF} />}
        {failed && (
          <div className="pe-recap-actions">
            <button type="button" className="pe-push" onClick={onAgain}>
              New run
            </button>
          </div>
        )}
      </div>
      <div className="pe-turf">
        <Field lineup={run.lineup as (Player | null)[]} view={(i) => ({ clickable: false, captain: i === run.captain })} />
      </div>
    </div>
  )
}

/** Most new-card faces a tile shows before it says how many more. */
const NEW_FACES = 5

/**
 * Where the run went, as two tiles under the score: its place on the board, and
 * what it added to the binder, with the faces of the cards that were new. The
 * binder tile is the way in, so it's the link; signed out, it's the sign-in.
 */
function RecapTiles({ post, lineup, signedIn, landed }: { post: PostOutcome; lineup: Player[]; signedIn: boolean; landed: boolean }) {
  const rank = post.rank as number
  const total = Math.max(post.total ?? rank, rank)
  // Share of the board this run finished ahead of, and the top slice it's in.
  const beat = total > 1 ? (total - rank) / (total - 1) : 1
  const top = Math.max(1, Math.ceil((rank / total) * 100))
  const fresh = (post.newIds ?? []).flatMap((id) => lineup.find((p) => p.id === id) ?? [])
  const count = post.newCards ?? fresh.length
  return (
    <div className={`pe-recap-tiles${landed ? '' : ' wait'}`}>
      <div className="pe-recap-tile">
        <small>On The Board</small>
        <b>{ordinal(rank)}</b>
        <span>of {total.toLocaleString()} runs</span>
        {/* Where it sits in the field, read like the board: 1st at the left end, last at the right. */}
        <span className="pe-recap-meter" aria-hidden>
          <i style={{ '--at': `${Math.round((1 - beat) * 100)}%` } as React.CSSProperties} />
        </span>
        <span className="pe-recap-tile-go pe-recap-tile-foot">{top <= 50 ? `Top ${top}%` : `Better than ${Math.round(beat * 100)}%`}</span>
      </div>
      {signedIn ? (
        <Link href="/games/pack-empire/binder/" className="pe-recap-tile pe-recap-tile--go" data-new={count > 0 ? '' : undefined}>
          <small>Your Binder</small>
          {count > 0 ? (
            <>
              <b>+{count}</b>
              <span className="pe-recap-faces">
                {[...fresh]
                  .sort((a, b) => b.score - a.score)
                  .slice(0, NEW_FACES)
                  .map((p) => (
                    <Face key={p.id} player={p} />
                  ))}
                {count > NEW_FACES && <em>+{count - NEW_FACES}</em>}
              </span>
            </>
          ) : (
            <>
              <b>0 New</b>
              <span>All eleven were already in it</span>
            </>
          )}
          <span className="pe-recap-tile-go">Open Binder</span>
        </Link>
      ) : (
        <Link href={SIGN_IN_HREF} className="pe-recap-tile pe-recap-tile--go">
          <small>Your Binder</small>
          <b>Not Saved</b>
          <span>These eleven aren&apos;t in a binder yet</span>
          <span className="pe-recap-tile-go">Sign In To Keep Them</span>
        </Link>
      )}
    </div>
  )
}

/**
 * The final roster. The total counts up from nothing and climbs the ladder
 * as it goes: each rung flashes as it's passed, the tier name above changes
 * with it, and the rung it stops on is stamped. Where it sits on the board
 * comes in once it lands.
 */
function Recap({
  run,
  reveal,
  post,
  shared,
  signedIn,
  nameError,
  onGuestName,
  onAgain,
  onShare,
}: {
  run: DraftDone
  /** A blind run's real cards, which is where its chemistry comes from. */
  reveal?: RunReveal | null
  post: PostOutcome | 'posting' | 'banked' | null
  shared: 'copied' | null
  signedIn: boolean
  nameError: string | null
  onGuestName: (name: string) => Promise<void>
  onAgain: () => void
  onShare: () => void
}) {
  // A blind run has just had the final reveal, so its number is already in.
  const shown = useCountUp(run.score, climbMs(run.score), reveal ? run.score : 0, easeClimb)
  const landed = shown === run.score
  const tier = tierFor(shown)
  const capped = difficultyFromSeed(run.seed) === 'cap'
  const chem = reveal?.chem ?? (capped ? chemistryFor(run.lineup, true) : null)
  const cards = reveal?.base ?? run.score - (chem?.total ?? 0)

  return (
    <div className="pe-table">
      <div className={`pe-recap${landed ? ' landed' : ''}`} style={{ '--tc': tier.color } as React.CSSProperties}>
        <div className="pe-kicker">§ Final roster · {boardLabel(difficultyFromSeed(run.seed), formatFromSeed(run.seed))}</div>
        <div key={tier.label} className="pe-recap-tier">
          {tier.label}
        </div>
        <div className="pe-recap-score" aria-label={`${run.score.toLocaleString()} accolades`}>
          {shown.toLocaleString()}
        </div>
        <div className="pe-recap-lbl pe-note">
          {chem
            ? `${cards.toLocaleString()} in cards, ${chem.total >= 0 ? '+' : '−'}${Math.abs(chem.total).toLocaleString()} chemistry`
            : 'Total accolades'}
          {capped && ` · $${run.spent}M of $${SALARY_CAP.own}M spent`}
        </div>

        <p className={`pe-recap-post${landed ? '' : ' wait'}`} aria-live="polite">
          {post === 'posting' && 'Putting it on the board…'}
          {post === 'banked' && 'Add your name to put this on the board.'}
          {post && typeof post === 'object' && !post.ok && post.error}
        </p>

        {post && typeof post === 'object' && post.ok && post.rank != null && (
          <RecapTiles post={post} lineup={run.lineup} signedIn={signedIn} landed={landed} />
        )}

        {post === 'banked' && landed && <GuestName error={nameError} onPost={onGuestName} signIn={SIGN_IN_HREF} />}

        <div className="pe-recap-actions pe-recap-actions--stack">
          <div className="pe-recap-row">
            <button type="button" className="pe-push" onClick={onAgain}>
              New run
            </button>
            <Link href={boardHref(run.seed)} className="pe-push pe-push--steel">
              The board
            </Link>
          </div>
          <SocialChip done={shared === 'copied'} onClick={onShare}>
            {shared === 'copied' ? 'Copied' : 'Share'}
          </SocialChip>
        </div>
      </div>

      {chem ? (
        <DraftReport
          lineup={run.lineup}
          chem={chem}
          captain={run.captain}
          missed={reveal?.missed}
          ladder={
            reveal ? (
              <div className="pe-rep-ladder">
                <Ladder score={shown} />
              </div>
            ) : (
              <Ladder score={shown} climb landed={landed} />
            )
          }
        />
      ) : (
        <div className="pe-recap-grid">
          <div className="pe-turf">
            <Field
              lineup={run.lineup as (Player | null)[]}
              view={(i) => ({
                clickable: false,
                captain: i === run.captain,
              })}
            />
          </div>
          <Ladder score={shown} climb landed={landed} />
        </div>
      )}

      {reveal?.missed && <PackBoard missed={reveal.missed} />}
    </div>
  )
}
