'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { InviteOutcome, ListMember } from '@/lib/recap/subscribers'
import { inviteRecapReaders, removeRecapReader } from './actions'

// The league's recap mailing list, run by the commissioner: paste the
// league's addresses, each gets one email to confirm, and the confirmed
// ones get the paper every Tuesday. Members can still add themselves at
// the bottom of any recap page; this is for not waiting on them.

function listOf(items: string[]): string {
  if (items.length <= 2) return items.join(' and ')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function summarize(outcomes: InviteOutcome[]): { text: string; ok: boolean } {
  const by = (r: InviteOutcome['result']) => outcomes.filter((o) => o.result === r).map((o) => o.email)
  const sent = by('sent')
  const parts: string[] = []
  if (sent.length) parts.push(`Sent ${sent.length} ${sent.length === 1 ? 'invite' : 'invites'}.`)
  const already = by('already')
  if (already.length) parts.push(`${listOf(already)} ${already.length === 1 ? 'is' : 'are'} already on the list.`)
  const recent = by('recent')
  if (recent.length) parts.push(`${listOf(recent)} got an invite in the last few minutes.`)
  const left = by('left')
  if (left.length) parts.push(`${listOf(left)} left the list. They can rejoin from any recap.`)
  const blocked = by('blocked')
  if (blocked.length) parts.push(`We can't send to ${listOf(blocked)}.`)
  const invalid = by('invalid')
  if (invalid.length) parts.push(`Not an email address: ${listOf(invalid)}.`)
  if (by('you').length) parts.push('You already get it as the commissioner.')
  const full = by('full')
  if (full.length) parts.push(`The list is full, so ${listOf(full)} didn't go out.`)
  const failed = by('failed')
  if (failed.length) parts.push(`${listOf(failed)} didn't go out. Try again in a minute.`)
  return { text: parts.join(' '), ok: sent.length > 0 || (invalid.length === 0 && failed.length === 0 && blocked.length === 0) }
}

export function RecapList({
  leagueId,
  members,
  published,
  variant = 'desktop',
}: {
  leagueId: string
  members: ListMember[]
  published: boolean
  variant?: 'desktop' | 'mobile'
}) {
  const router = useRouter()
  const cls = variant === 'mobile' ? 'mml' : 'lo-ml'
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  // Removing takes two taps: the first arms the row, the second removes.
  const [armed, setArmed] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const active = members.filter((m) => m.status === 'active').length
  const waiting = members.length - active
  const cap = variant === 'mobile' ? 4 : 8
  const shown = showAll ? members : members.slice(0, cap)

  if (!published) {
    return (
      <div className={`${cls}-off`}>
        Publish your almanac to start a mailing list. Until then the recap is only visible to you.
      </div>
    )
  }

  function invite(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || pending) return
    setMsg(null)
    start(async () => {
      const r = await inviteRecapReaders(leagueId, text)
      if (!r.ok) {
        setMsg({ ok: false, text: r.error })
        return
      }
      setMsg(summarize(r.outcomes))
      // Keep only what still needs fixing in the box.
      setText(r.outcomes.filter((o) => o.result === 'invalid' || o.result === 'failed').map((o) => o.email).join(', '))
      router.refresh()
    })
  }

  function remove(id: string) {
    if (armed !== id) {
      setArmed(id)
      return
    }
    setArmed(null)
    start(async () => {
      const r = await removeRecapReader(leagueId, id)
      if (!r.ok) setMsg({ ok: false, text: r.error })
      router.refresh()
    })
  }

  return (
    <div className={cls}>
      <div className={`${cls}-head`}>
        <span className={`${cls}-title`}>The mailing list</span>
        <span className={`${cls}-count`}>
          {active} on the list{waiting ? ` · ${waiting} invited` : ''}
        </span>
      </div>
      <p className={`${cls}-text`}>
        {variant === 'mobile'
          ? "Add members' emails. Each gets one email to confirm, then the paper every Tuesday."
          : "Add your members' emails and the paper goes to them every Tuesday too. Each address gets one email to confirm first, and nothing else until they do. Members can also join at the bottom of any recap."}
      </p>

      <form className={`${cls}-form`} onSubmit={invite}>
        <label className="sr-only" htmlFor={`${cls}-emails`}>
          Email addresses
        </label>
        <textarea
          id={`${cls}-emails`}
          className="dc-input"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="joe@example.com, amy@example.com"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          disabled={pending}
        />
        <button type="submit" className="lo-btn" disabled={pending || !text.trim()}>
          {pending ? 'Sending' : 'Send invites'}
        </button>
      </form>
      {msg ? <div className={msg.ok ? 'lo-msg-ok' : 'lo-msg-err'}>{msg.text}</div> : null}

      {members.length > 0 ? (
        <ul className={`${cls}-list`}>
          {shown.map((m) => (
            <li key={m.id}>
              <span className={`${cls}-email`}>{m.email}</span>
              <span className={`${cls}-state ${m.status}`}>{m.status === 'active' ? 'On the list' : 'Invited'}</span>
              <button
                type="button"
                className={`${cls}-x${armed === m.id ? ' armed' : ''}`}
                onClick={() => remove(m.id)}
                onBlur={() => setArmed((a) => (a === m.id ? null : a))}
                disabled={pending}
                aria-label={armed === m.id ? `Confirm removing ${m.email}` : `Remove ${m.email}`}
              >
                {armed === m.id ? 'Remove' : '✕'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {members.length > cap ? (
        <button type="button" className={`${cls}-more`} onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show fewer' : `Show all ${members.length}`}
        </button>
      ) : null}
    </div>
  )
}
