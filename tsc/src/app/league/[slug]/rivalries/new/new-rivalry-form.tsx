'use client'

import { useActionState, useState } from 'react'
import { createRivalry } from '../actions'

type Manager = { id: string; display_name: string }
type ActionResult = { ok: false; error: string } | { ok: true } | null

export function NewRivalryForm({
  leagueId,
  managers,
}: {
  leagueId: string
  managers: Manager[]
}) {
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    createRivalry as (prev: ActionResult, formData: FormData) => Promise<ActionResult>,
    null
  )
  const [autoName, setAutoName] = useState(true)

  return (
    <form action={formAction} className="dc-form">
      <input type="hidden" name="leagueId" value={leagueId} />

      <div className="dc-grid-2">
        <div className="dc-field">
          <label className="dc-label">Manager A</label>
          <select name="managerA" required className="dc-select">
            <option value="">Pick one…</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
        </div>
        <div className="dc-field">
          <label className="dc-label">Manager B</label>
          <select name="managerB" required className="dc-select">
            <option value="">Pick one…</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="dc-checkbox-row">
        <input
          type="checkbox"
          name="autoName"
          checked={autoName}
          onChange={(e) => setAutoName(e.target.checked)}
          value="true"
        />
        <span>
          Auto-name this rivalry
          <span className="dc-checkbox-hint">We&apos;ll pick a title automatically from a curated bank of fantasy-football rivalry names. The same manager pairing always proposes the same title.</span>
        </span>
      </label>

      {!autoName && (
        <div className="dc-field">
          <label className="dc-label">Rivalry name</label>
          <input name="name" placeholder="The Snake Draft Bowl" className="dc-input" />
        </div>
      )}

      <button type="submit" disabled={isPending} className="dc-btn dc-btn-block">
        {isPending ? 'Saving…' : 'Forge the rivalry →'}
      </button>

      {state && 'ok' in state && !state.ok && (
        <p className="dc-form-error">{state.error}</p>
      )}
    </form>
  )
}
