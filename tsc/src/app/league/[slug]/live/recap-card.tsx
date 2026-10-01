'use client'

import { useState, useTransition } from 'react'
import { emailMeTheRecap } from './actions'

// The weekly recap, on demand, for the owner. The Tuesday email is the
// normal way it arrives; this is for the commissioner who joined midweek
// (or on a trial) and wants to see it now rather than next Tuesday.
export function RecapCard({
  leagueId,
  slug,
  latest,
  published,
  variant = 'desktop',
}: {
  leagueId: string
  slug: string
  latest: { year: number; week: number } | null
  published: boolean
  variant?: 'desktop' | 'mobile'
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const cls = variant === 'mobile' ? 'mrc' : 'lo-rc'

  if (!latest) {
    return (
      <div className={`${cls}-empty`}>
        No finished week is synced yet. As soon as one is, its recap is ready here, and it lands in your inbox the
        Tuesday after every week.
      </div>
    )
  }

  function send() {
    setMsg(null)
    start(async () => {
      const r = await emailMeTheRecap(leagueId)
      setMsg(r.ok ? { ok: true, text: `Sent the week ${r.week} recap to ${r.to}.` } : { ok: false, text: r.error })
    })
  }

  return (
    <div className={cls}>
      <div className={`${cls}-copy`}>
        <div className={`${cls}-title`}>
          The week {latest.week} recap is <em>ready.</em>
        </div>
        <p className={`${cls}-text`}>
          It goes to your inbox every Tuesday after Monday night. No need to wait for the next one: read week{' '}
          {latest.week} now, or send yourself a copy to see the email.
          {published ? '' : ' Your almanac isn’t published yet, so for now only you can open it.'}
        </p>
      </div>
      <div className={`${cls}-actions`}>
        <a className="lo-btn" href={`/leagues/${slug}/recap/${latest.year}/${latest.week}/`} target="_blank" rel="noopener">
          Read the week {latest.week} recap
        </a>
        <button type="button" className="lo-btn-ghost" onClick={send} disabled={pending}>
          {pending ? 'Sending' : 'Email me a copy'}
        </button>
      </div>
      {msg ? <div className={msg.ok ? 'lo-msg-ok' : 'lo-msg-err'}>{msg.text}</div> : null}
    </div>
  )
}
