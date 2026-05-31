'use client'

import { useActionState } from 'react'
import { renameChronicle } from './actions'

export function RenameForm({
  slug,
  displayName,
  subtitle,
}: {
  slug: string
  displayName: string
  subtitle: string | null
}) {
  const [state, action, pending] = useActionState(renameChronicle, null)
  return (
    <form action={action} className="dc-form">
      <input type="hidden" name="slug" value={slug} />
      <div className="dc-field">
        <label htmlFor="displayName" className="dc-label">Chronicle title</label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          maxLength={120}
          required
          className="dc-input"
        />
      </div>
      <div className="dc-field">
        <label htmlFor="subtitle" className="dc-label">Subtitle (optional)</label>
        <input
          id="subtitle"
          name="subtitle"
          defaultValue={subtitle ?? ''}
          maxLength={160}
          placeholder="e.g. Ten years, three leagues, one obsession."
          className="dc-input"
        />
      </div>
      <button type="submit" disabled={pending} className="dc-btn">
        {pending ? 'Saving…' : 'Save'}
      </button>
      {state?.error === '' && <p className="dc-form-ok" style={{ margin: '.4rem 0 0' }}>Saved.</p>}
      {state?.error && <p className="dc-form-error" style={{ margin: '.4rem 0 0' }}>{state.error}</p>}
    </form>
  )
}
