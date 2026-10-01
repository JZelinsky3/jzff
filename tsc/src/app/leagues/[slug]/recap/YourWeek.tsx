'use client'

import { useEffect, useSyncExternalStore } from 'react'
import styles from './recap.module.css'

// "Your week": the reader's own result at the top of the paper, and a link
// down to the story about their game. It deliberately repeats none of that
// story, only points at it.
//
// Identity is the same name claim The Weekly and Pick'ems use, under the same
// localStorage key and in pick'ems' shape ({ profileId, name, teamId }), so a
// name claimed on any of the three is recognised on the other two. Nothing is
// rendered on the server: the claim only exists in the reader's browser.

export type YourWeekTeam = {
  managerId: string
  profileId: string | null
  name: string
  avatar: string | null
  score: string
  result: 'W' | 'L' | 'T' | null
  // "2-1 · 4th place"
  standing: string | null
  // The story about their game.
  anchor: string | null
  headline: string | null
  next: string | null
}

type Claim = { profileId?: string; name?: string; teamId?: string }

// Claims change in this tab (the picker below) and in others (pick'ems open
// in a second tab), so listen for both. The custom event is how this tab's
// own writes reach the store; 'storage' only fires in other tabs.
const CLAIM_EVENT = 'dc-claim'
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(CLAIM_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CLAIM_EVENT, onChange)
  }
}

export function YourWeek({ slug, teams }: { slug: string; teams: YourWeekTeam[] }) {
  const key = `dc_pickems_user_${slug}`
  // The raw stored string. undefined on the server and while hydrating, so
  // the first paint matches the server's (which renders nothing here).
  const raw = useSyncExternalStore<string | null | undefined>(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key)
      } catch {
        // Blocked storage reads as "nobody", which still shows the picker.
        return null
      }
    },
    () => undefined,
  )

  let mine: string | null | undefined = undefined
  if (raw !== undefined) {
    mine = null
    try {
      const saved = JSON.parse(raw || 'null') as Claim | null
      if (saved?.teamId && teams.some((t) => t.managerId === saved.teamId)) mine = saved.teamId
    } catch {}
  }

  // Mark the story about their game so it carries the "You" treatment.
  const anchor = mine ? teams.find((x) => x.managerId === mine)?.anchor : null
  useEffect(() => {
    if (!anchor) return
    const el = document.getElementById(anchor)
    el?.setAttribute('data-you', 'true')
    return () => el?.removeAttribute('data-you')
  }, [anchor])

  function claim(managerId: string) {
    const t = teams.find((x) => x.managerId === managerId)
    if (!t) return
    try {
      localStorage.setItem(key, JSON.stringify({ profileId: t.profileId ?? undefined, name: t.name, teamId: t.managerId }))
    } catch {}
    window.dispatchEvent(new Event(CLAIM_EVENT))
  }

  function forget() {
    try {
      localStorage.removeItem(key)
    } catch {}
    window.dispatchEvent(new Event(CLAIM_EVENT))
  }

  if (mine === undefined) return null

  const t = mine ? teams.find((x) => x.managerId === mine) : null
  if (!t) {
    return (
      <label className={styles.findTeam}>
        <span>Find your team</span>
        <select defaultValue="" onChange={(e) => e.target.value && claim(e.target.value)}>
          <option value="">Pick your name</option>
          {[...teams]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((x) => (
              <option key={x.managerId} value={x.managerId}>
                {x.name}
              </option>
            ))}
        </select>
      </label>
    )
  }

  return (
    <div className={styles.yourWeek}>
      <div className={styles.yourHead}>
        <span className={styles.yourKicker}>Your week</span>
        <button type="button" className={styles.yourSwitch} onClick={forget}>
          Not {t.name}?
        </button>
      </div>
      <div className={styles.yourBody}>
        {t.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.yourAvatar} src={t.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className={styles.yourAvatar} aria-hidden>
            {t.name.charAt(0)}
          </span>
        )}
        <span className={styles.yourMain}>
          <span className={styles.yourName}>{t.name}</span>
          {t.standing ? <span className={styles.yourLine}>{t.standing}</span> : null}
        </span>
        <span className={styles.yourScore} data-result={t.result ?? undefined}>
          {t.result ? <em>{t.result}</em> : null}
          {t.score}
        </span>
      </div>
      {t.anchor && t.headline ? (
        <a className={styles.yourStory} href={`#${t.anchor}`}>
          <span>Your game</span>
          {t.headline}
        </a>
      ) : null}
      {t.next ? <div className={styles.yourNext}>{t.next}</div> : null}
    </div>
  )
}
