'use client'

// The face on a leaderboard row.
//
// A client component purely so a dead avatar URL can fall back to initials:
// manager avatars come off the platform and go stale when somebody deletes a
// picture, and a row of broken-image glyphs is worse than a row of monograms.
// Same idiom the game boards already use for headshots.
//
// Only league boards have faces at all. On the site pool there is no manager
// identity to draw, so this renders the monogram.

import { useState } from 'react'
import styles from './board.module.css'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function BoardFace({ name, avatar }: { name: string; avatar?: string | null }) {
  const [ok, setOk] = useState(true)
  return (
    <span className={styles.face}>
      {avatar && ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.faceImg}
          src={avatar}
          alt=""
          loading="lazy"
          onError={() => setOk(false)}
        />
      ) : (
        <span className={styles.faceInitials}>{initials(name)}</span>
      )}
    </span>
  )
}
