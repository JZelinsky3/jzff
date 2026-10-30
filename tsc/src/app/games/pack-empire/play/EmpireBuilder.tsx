'use client'

// Empire Builder: one captain, eleven packs, one number.
//
// Played signed out, posted signed in, the same way every board on the Games
// Page works: a finished run posts its seed and its picks to /api/games/runs,
// which re-deals every pack and derives the score itself. Signed out, the run
// is banked on this device and claimed the moment you sign in.

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { TIERS, tierFor, type Player } from '@/lib/packEmpire/rules'
import { bankRun, claimBank, postRun, type PostOutcome } from '../../runBank'
import { CaptainDraft, type DraftDone } from '../CaptainDraft'
import { Field, Ladder } from '../cards'
import { easeClimb, useCountUp } from '../stage'

const SAVE_KEY = 'pe_solo_run_v1'

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
}

async function startSeed(captain: number): Promise<string> {
  const res = await fetch('/api/games/pack-empire/deal/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start', captain }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.seed) throw new Error(body?.error ?? 'Could not start a run. Try again.')
  return body.seed as string
}

function shareText(score: number) {
  const t = tierFor(score)
  return `Pack Empire · ${t.label} · ${score.toLocaleString()} accolades`
}

export function EmpireBuilder({ signedIn }: { signedIn: boolean }) {
  const [run, setRun] = useState<DraftDone | null>(null)
  const [post, setPost] = useState<PostOutcome | 'posting' | 'banked' | null>(null)
  const [round, setRound] = useState(0)
  const [shared, setShared] = useState<'copied' | null>(null)

  // Runs played signed out on this device go up the moment there's an
  // account to post them as.
  useEffect(() => {
    if (signedIn) claimBank().catch(() => {})
  }, [signedIn])

  const onDone = useCallback(async (r: DraftDone) => {
    setRun(r)
    setPost('posting')
    const payload = {
      game: 'pack-empire',
      mode: 'offense',
      pool: 'site',
      seed: r.seed,
      picks: r.picks,
    }
    const out = await postRun(payload)
    if (out.needsAuth) {
      bankRun({ ...payload, at: Date.now() })
      setPost('banked')
    } else {
      setPost(out)
    }
  }, [])

  const again = () => {
    setRun(null)
    setPost(null)
    setShared(null)
    setRound((n) => n + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const share = async () => {
    if (!run) return
    const url = `${window.location.origin}/games/pack-empire/`
    const text = shareText(run.score)
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
        <CaptainDraft key={round} saveKey={SAVE_KEY} startSeed={startSeed} onDone={onDone} />
      </div>
    )
  }

  return <Recap run={run} post={post} shared={shared} onAgain={again} onShare={share} />
}

/** How long the climb takes: longer the higher it goes, so a GOAT run gets
    its moment and a practice squad run doesn't make you wait. */
function climbMs(score: number): number {
  const rungs = TIERS.filter((t) => score >= t.min).length
  return Math.min(4200, 600 + rungs * 450)
}

/**
 * The final roster. The total counts up from nothing and climbs the ladder
 * as it goes: each rung flashes as it's passed, the tier name above changes
 * with it, and the rung it stops on is stamped. Where it sits on the board
 * comes in once it lands.
 */
function Recap({
  run,
  post,
  shared,
  onAgain,
  onShare,
}: {
  run: DraftDone
  post: PostOutcome | 'posting' | 'banked' | null
  shared: 'copied' | null
  onAgain: () => void
  onShare: () => void
}) {
  const shown = useCountUp(run.score, climbMs(run.score), 0, easeClimb)
  const landed = shown === run.score
  const tier = tierFor(shown)

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
        <div className="pe-recap-lbl pe-note">Total accolades</div>

        <p className={`pe-recap-post${landed ? '' : ' wait'}`} aria-live="polite">
          {post === 'posting' && 'Putting it on the board…'}
          {post === 'banked' && (
            <>
              Saved on this device.{' '}
              <Link className="pe-link" href="/login?next=%2Fgames%2Fpack-empire%2Fplay%2F">
                Sign in
              </Link>{' '}
              and it goes on the board.
            </>
          )}
          {post && typeof post === 'object' && post.ok && post.rank != null && (
            <>
              That is <b>{ordinal(post.rank)}</b> of {(post.total ?? post.rank).toLocaleString()} runs on the
              board.
            </>
          )}
          {post && typeof post === 'object' && !post.ok && post.error}
        </p>

        <div className="pe-recap-actions">
          <button type="button" className="pe-btn" onClick={onAgain}>
            New run
          </button>
          <button type="button" className="pe-btn pe-btn--ghost" onClick={onShare}>
            {shared === 'copied' ? 'Copied' : 'Share'}
          </button>
          <Link href="/games/pack-empire/board/" className="pe-btn pe-btn--quiet">
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
              flag: i === run.captain ? { text: 'CAP' } : null,
              tone: i === run.captain ? 'cap' : null,
            })}
          />
        </div>
        <Ladder score={shown} climb landed={landed} />
      </div>
    </div>
  )
}
