'use client'

// The name a player goes by on site-wide boards, to friends and at the Pack
// Empire table. Lives in a drawer on the desktop credential card and in its
// own section on the phone.

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { updateBoardName } from '@/app/account/actions'
import styles from './play.module.css'

export function BoardNameForm({
  initial,
  fallback,
  onDone,
}: {
  initial: string
  /** What people see when no board name is set. */
  fallback: string
  onDone?: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(initial)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const save = (value: string) => {
    setError(null)
    setOk(null)
    start(async () => {
      const r = await updateBoardName({ name: value })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setOk(r.message ?? 'Saved.')
      router.refresh()
      onDone?.()
    })
  }

  return (
    <form
      className={styles.nameForm}
      onSubmit={(e) => {
        e.preventDefault()
        save(name)
      }}
    >
      <p className={styles.nameHint}>
        What friends and the site-wide boards call you. League boards keep your manager name.
        {!initial && <> Right now you show up as <b>{fallback}</b>.</>}
      </p>
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setOk(null)
        }}
        maxLength={24}
        placeholder={fallback}
        aria-label="Board name"
        autoComplete="nickname"
      />
      <div className={styles.nameButtons}>
        <button type="submit" className={styles.btn} disabled={pending || name.trim() === initial}>
          {pending ? 'Saving' : 'Save'}
        </button>
        {initial && (
          <button
            type="button"
            className={styles.btnQuiet}
            disabled={pending}
            onClick={() => {
              setName('')
              save('')
            }}
          >
            Clear
          </button>
        )}
      </div>
      {error && <p className={styles.err}>{error}</p>}
      {ok && <p className={styles.note}>{ok}</p>}
    </form>
  )
}
