'use client'

import { useActionState, useEffect, useState } from 'react'
import { renameLinkedLeague } from './actions'

// Per-league display alias for the manager hub. Blank = use the archive name.
// Editable only when the user clicks "Rename"; collapsed state shows the
// current effective name + a small toggle.
export function AliasForm({
  slug,
  linkId,
  archiveName,
  currentAlias,
}: {
  slug: string
  linkId: string
  archiveName: string
  currentAlias: string | null
}) {
  const [state, action, pending] = useActionState(renameLinkedLeague, null)
  const [editing, setEditing] = useState(false)

  // Auto-close edit mode after a successful save (server action returns
  // error: '' on success). Effect so we don't set state during render.
  useEffect(() => {
    if (state?.error === '' && editing) setEditing(false)
  }, [state, editing])

  const effective = currentAlias?.trim() || archiveName
  const hasAlias = !!currentAlias?.trim()

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginTop: '.45rem' }}>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="dc-btn-ghost"
          style={{ fontSize: '.62rem', padding: '.25rem .65rem' }}
        >
          {hasAlias ? 'Edit hub alias' : 'Rename for hub'}
        </button>
        {hasAlias && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: '.55rem', letterSpacing: '.12em', color: 'var(--cream-mute)', textTransform: 'uppercase' }}>
            archive: <em style={{ color: 'var(--cream-soft)' }}>{archiveName}</em>
          </span>
        )}
      </div>
    )
  }

  return (
    <form action={action} style={{ marginTop: '.6rem', borderTop: '1px dotted var(--ink-line)', paddingTop: '.85rem' }}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="linkId" value={linkId} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        <label htmlFor={`alias-${linkId}`} style={{ fontFamily: 'var(--mono)', fontSize: '.55rem', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--cream-soft)' }}>
          Hub alias
        </label>
        <input
          id={`alias-${linkId}`}
          name="alias"
          defaultValue={currentAlias ?? ''}
          maxLength={120}
          placeholder={archiveName}
          className="dc-input"
          style={{ flex: '1 1 240px', minWidth: '180px' }}
          autoFocus
        />
        <button type="submit" disabled={pending} className="dc-btn" style={{ padding: '.4rem .85rem', fontSize: '.7rem' }}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="dc-btn-ghost"
          style={{ padding: '.4rem .65rem', fontSize: '.7rem' }}
        >
          Cancel
        </button>
      </div>
      <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '.85rem', color: 'var(--cream-mute)', margin: '.5rem 0 0', lineHeight: 1.5 }}>
        Renames this league only inside <em>{effective ? 'your' : 'your'}</em> manager hub.
        Public almanac at <code style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', color: 'var(--cream-soft)' }}>/leagues/&lt;slug&gt;/</code> keeps the original name. Leave blank to revert to <em style={{ color: 'var(--cream-soft)' }}>{archiveName}</em>.
      </p>
      {state?.error && state.error !== '' && (
        <p className="dc-form-error" style={{ margin: '.5rem 0 0' }}>{state.error}</p>
      )}
    </form>
  )
}
