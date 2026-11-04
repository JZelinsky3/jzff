'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DIFFICULTY_LOOK, SALARY_CAP, type Difficulty, type Player } from '@/lib/packEmpire/rules'
import type { VersusFormat } from '@/lib/packEmpire/versus'
import { MatchSetup } from '../MatchSetup'

type Friend = { id: string; name: string }

const FORMATS: { id: VersusFormat; label: string; line: string }[] = [
  { id: 'classic', label: 'Classic', line: 'Your own eleven packs and a captain each. The better pulls win.' },
  { id: 'even', label: 'Even', line: 'The same eleven packs, no captain. Chemistry and three Battles decide it.' },
  { id: 'mystery', label: 'Mystery', line: 'Your own captain, then ten packs of mixed positions. Plan for what you need.' },
]

/** What the felt says along the top, per format. */
const TAG: Record<VersusFormat, string> = {
  classic: 'Your own packs each',
  even: 'Same packs, both sides',
  mystery: 'Captain, then ten mystery packs',
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
  const [format, setFormat] = useState<VersusFormat>('classic')
  const [difficulty, setDifficulty] = useState<Difficulty>('open')

  const go = async (key: string, body: Record<string, unknown>) => {
    setBusy(key)
    setError(null)
    try {
      router.push(room(await open({ ...body, format, difficulty })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a challenge.')
      setBusy(null)
    }
  }

  const makeLink = async () => {
    setBusy('link')
    setError(null)
    try {
      return room(await open({ format, difficulty }))
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
      hands={hands}
      tag={TAG[format]}
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
