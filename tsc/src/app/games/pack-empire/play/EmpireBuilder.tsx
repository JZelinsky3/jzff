'use client'

// Empire Builder: one captain, eleven packs, one number.
//
// Played signed out, posted signed in, the same way every board on the Games
// Page works: a finished run posts its seed and its picks to /api/games/runs,
// which re-deals every pack and derives the score itself. Signed out, the run
// is banked on this device and claimed the moment you sign in.
//
// Three difficulties, each its own board. On the two blind ones the browser
// never holds a card's numbers: posting the run is what turns it over, and that
// post is final, so a player signed out gives a name first and sees the score
// after.

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  DIFFICULTY_LOOK,
  SALARY_CAP,
  TIERS,
  chemistryFor,
  difficultyFromSeed,
  isBlind,
  tierFor,
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
import { DifficultyPicker, DifficultyTabs } from '../Difficulty'
import { GuestName } from '../GuestName'
import { Bonds, Field, Ladder } from '../cards'
import { easeClimb, useCountUp } from '../stage'
import { storageChanged, useStored } from '../clientStore'

const SAVE_KEYS: Record<Difficulty, string> = {
  open: 'pe_solo_run_v1',
  range: 'pe_solo_run_range_v1',
  season: 'pe_solo_run_season_v1',
  cap: 'pe_solo_run_cap_v1',
}

/** The difficulty you last played, so a regular on Ball Knower stays there. */
const DIFF_KEY = 'pe_solo_difficulty_v1'

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
}

async function startSeed(captain: number, difficulty: Difficulty): Promise<string> {
  const res = await fetch('/api/games/pack-empire/deal/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start', captain, difficulty }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.seed) throw new Error(body?.error ?? 'Could not start a run. Try again.')
  return body.seed as string
}

function soloPayload(run: DraftDone) {
  const mode = DIFFICULTY_LOOK[difficultyFromSeed(run.seed)].mode
  return { game: 'pack-empire', mode, pool: 'site', seed: run.seed, picks: run.picks }
}

function shareText(score: number) {
  return `${score.toLocaleString()} in Empire Builder`
}

function readDifficulty(raw: string | null): Difficulty {
  return raw === 'range' || raw === 'season' || raw === 'cap' ? raw : 'open'
}

export function EmpireBuilder({ signedIn, initial }: { signedIn: boolean; initial?: Difficulty }) {
  const [run, setRun] = useState<DraftDone | null>(null)
  const [post, setPost] = useState<PostOutcome | 'posting' | 'banked' | null>(null)
  const [round, setRound] = useState(0)
  const [shared, setShared] = useState<'copied' | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [reveal, setReveal] = useState<RunReveal | null>(null)
  const stored = useStored(DIFF_KEY)
  const [chosen, setChosen] = useState<Difficulty | null>(initial ?? null)
  const difficulty = chosen ?? readDifficulty(stored)

  const choose = (d: Difficulty) => {
    setChosen(d)
    try {
      localStorage.setItem(DIFF_KEY, d)
      storageChanged()
    } catch {
      // Private browsing: it just won't be remembered.
    }
  }

  const start = useCallback((captain: number) => startSeed(captain, difficulty), [difficulty])

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
          key={`${difficulty}-${round}`}
          saveKey={SAVE_KEYS[difficulty]}
          startSeed={start}
          onDone={onDone}
          difficulty={difficulty}
          intro={<DifficultyPicker value={difficulty} onChange={choose} />}
          running={<DifficultyTabs value={difficulty} onChange={choose} />}
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

  return (
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
  )
}

/** How long the climb takes: longer the higher it goes, so a GOAT run gets
    its moment and a practice squad run doesn't make you wait. */
function climbMs(score: number): number {
  const rungs = TIERS.filter((t) => score >= t.min).length
  return Math.min(4200, 600 + rungs * 450)
}

const SIGN_IN_HREF = '/login?next=%2Fgames%2Fpack-empire%2Fplay%2F'

function boardHref(diff: Difficulty): string {
  return `/games/pack-empire/board/${diff === 'open' ? '' : `?diff=${diff}`}`
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
            <button type="button" className="pe-btn" onClick={onAgain}>
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
  const shown = useCountUp(run.score, climbMs(run.score), 0, easeClimb)
  const landed = shown === run.score
  const tier = tierFor(shown)
  const capped = difficultyFromSeed(run.seed) === 'cap'
  const chem = reveal?.chem ?? (capped ? chemistryFor(run.lineup, true) : null)
  const cards = reveal?.base ?? run.score - (chem?.total ?? 0)

  return (
    <div className="pe-table">
      <div className={`pe-recap${landed ? ' landed' : ''}`} style={{ '--tc': tier.color } as React.CSSProperties}>
        <div className="pe-kicker">§ Final roster</div>
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
          {post && typeof post === 'object' && post.ok && post.rank != null && (
            <>
              That is <b>{ordinal(post.rank)}</b> of {(post.total ?? post.rank).toLocaleString()} runs on the
              board.
              {post.newCards != null && (
                <>
                  {' '}
                  {post.newCards > 0 ? (
                    <>
                      <b>{post.newCards}</b> new {post.newCards === 1 ? 'card' : 'cards'} for your{' '}
                    </>
                  ) : (
                    'Nothing new for your '
                  )}
                  <Link className="pe-link" href="/games/pack-empire/binder/">
                    binder
                  </Link>
                  .
                </>
              )}
              {!signedIn && (
                <>
                  {' '}
                  <Link className="pe-link" href={SIGN_IN_HREF}>
                    Sign in
                  </Link>{' '}
                  to save your drafts and binder.
                </>
              )}
            </>
          )}
          {post && typeof post === 'object' && !post.ok && post.error}
        </p>

        {post === 'banked' && landed && <GuestName error={nameError} onPost={onGuestName} signIn={SIGN_IN_HREF} />}

        <div className="pe-recap-actions">
          <button type="button" className="pe-btn" onClick={onAgain}>
            New run
          </button>
          <button type="button" className="pe-btn pe-btn--ghost" onClick={onShare}>
            {shared === 'copied' ? 'Copied' : 'Share'}
          </button>
          <Link href={boardHref(difficultyFromSeed(run.seed))} className="pe-btn pe-btn--quiet">
            The board
          </Link>
        </div>
      </div>

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

      {chem && (
        <div className="pe-panel pe-recap-chem">
          <div className="pe-kicker">Chemistry</div>
          <Bonds chem={chem} />
        </div>
      )}
    </div>
  )
}
