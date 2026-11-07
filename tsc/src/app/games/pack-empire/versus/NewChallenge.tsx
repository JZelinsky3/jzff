'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DIFFICULTY_LOOK, SALARY_CAP, type Difficulty, type Player } from '@/lib/packEmpire/rules'
import { MatchSetup } from '../MatchSetup'
import { SetupSwitch } from '../SetupSwitch'

type Friend = { id: string; name: string }

type Base = 'classic' | 'even'

const FORMATS: { id: Base; label: string; line: string }[] = [
  { id: 'classic', label: 'Classic', line: 'Your own eleven packs and a captain each. The better pulls win.' },
  { id: 'even', label: 'Even', line: 'The same eleven packs, no captain. Chemistry and three Battles decide it.' },
]

/** Mystery is a switch on either format (Joey, 2026-11-07): packs in a line of
    mixed positions instead of one a slot. What the card calls each with it on. */
const MYSTERY: Record<Base, { label: string; line: string }> = {
  classic: { label: 'Mystery', line: 'Your own captain, then ten packs of mixed positions. Plan for what you need.' },
  even: { label: 'Even Mystery', line: 'The same eleven packs of mixed positions for both of you, no captain. Plan for what you need; three Battles settle it.' },
}

/** What the felt says along the top. */
const TAG: Record<Base, [string, string]> = {
  classic: ['Your own packs each', 'Captain, then ten mystery packs'],
  even: ['Same packs, both sides', 'Same mystery packs, both sides'],
}

async function open(body: Record<string, unknown>): Promise<string> {
  const res = await fetch('/api/games/pack-empire/versus/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', ...body }),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Could not open a challenge.')
  return out.id as string
}

const room = (id: string) => `/games/pack-empire/versus/${id}/`

/**
 * Starting a challenge (MatchSetup): the format and the cards, then the CPU, a
 * friend, or a link for anyone. The CPU and a friend drop you straight into your
 * own draft; a link is made in the sheet so it can be copied first.
 */
export function ChallengePanels({
  friends,
  hands,
  signedIn,
}: {
  friends: Friend[]
  hands: Record<string, Player[]>
  signedIn: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [format, setFormat] = useState<Base>('classic')
  const [mystery, setMystery] = useState(false)
  const [difficulty, setDifficulty] = useState<Difficulty>('open')
  // The felt deals Mystery's hands (three positions) whichever format it's on.
  const shown = mystery ? Object.fromEntries(Object.entries(hands).flatMap(([k, v]) => (k.startsWith('mystery:') ? [[`${format}:${k.slice(8)}`, v]] : []))) : hands

  const go = async (key: string, body: Record<string, unknown>) => {
    setBusy(key)
    setError(null)
    try {
      router.push(room(await open({ ...body, format, mystery, difficulty })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a challenge.')
      setBusy(null)
    }
  }

  const makeLink = async () => {
    setBusy('link')
    setError(null)
    try {
      return room(await open({ format, mystery, difficulty }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a challenge.')
      return null
    } finally {
      setBusy(null)
    }
  }

  const cardsLine =
    difficulty === 'cap'
      ? `Every card has a salary and you each get $${format === 'even' ? SALARY_CAP.shared : SALARY_CAP.own}M for all eleven.`
      : DIFFICULTY_LOOK[difficulty].line

  return (
    <MatchSetup
      kind="Versus Challenge"
      color="#e2725b"
      formats={FORMATS}
      format={format}
      onFormat={setFormat}
      difficulty={difficulty}
      onDifficulty={setDifficulty}
      cardsLine={cardsLine}
      hands={shown}
      tag={TAG[format][mystery ? 1 : 0]}
      named={mystery ? MYSTERY[format] : undefined}
      switches={
        <SetupSwitch
          label="Mystery"
          options={[
            { id: 'off', label: 'Off' },
            { id: 'on', label: 'On' },
          ]}
          value={mystery ? 'on' : 'off'}
          onChange={(v) => setMystery(v === 'on')}
        />
      }
      opponent="Them"
      friends={friends}
      signedIn={signedIn}
      locked={
        signedIn ? undefined : (
          <div className="pe-match-locked">
            <p className="pe-setup-line">
              Starting one needs an account, so it has somewhere to come back to. Answering one doesn&apos;t: if a friend
              sent you a link, just open it.
            </p>
            <Link href="/login?next=%2Fgames%2Fpack-empire%2Fversus%2F" className="pe-btn">
              Sign in to start one
            </Link>
          </div>
        )
      }
      busy={busy}
      error={error}
      onCpu={() => go('cpu', { cpu: true })}
      onFriend={(id) => go(`f:${id}`, { friend: id })}
      makeLink={makeLink}
      roomLabel="Draft your eleven"
      linkLine="Whoever opens it first takes the other seat. No account needed on their end."
      friendLine="Their seat is held and it waits in their challenges. You draft yours straight away."
    />
  )
}
