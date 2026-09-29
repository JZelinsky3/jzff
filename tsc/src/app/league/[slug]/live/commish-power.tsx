'use client'

// The commissioner's power rankings. Starts from the model's order for the
// week, the commish drags (or nudges) teams where they think they belong,
// adds an optional note, and publishes. The public Power Rankings page then
// shows both orders and where they disagree.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveCommishPower } from './actions'

type Team = { team_id: string; rank: number; team_name: string; manager: string; wins: number; losses: number; ties: number }
type Week = {
  id: string
  week: number
  label: string
  overall: Team[]
  commish?: { note: string | null; updated_at: string | null; order: { team_id: string }[] } | null
}

export function CommishPower({
  leagueId,
  seasonId,
  slug,
  variant = 'desktop',
}: {
  leagueId: string
  seasonId: string
  slug: string
  variant?: 'desktop' | 'mobile'
}) {
  const router = useRouter()
  const [weeks, setWeeks] = useState<Week[] | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [weekId, setWeekId] = useState<string | null>(null)
  const [order, setOrder] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const dragFrom = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/leagues/${slug}/live/powerrank/data/`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return
        if (!data) { setUnavailable('Power rankings aren’t on for this league.'); setWeeks([]); return }
        if (data.status !== 'ok' || !data.weeks?.length) {
          setUnavailable('Power rankings start once the live season has a week. Set one above.')
          setWeeks([])
          return
        }
        setWeeks(data.weeks)
        openWeek(data.weeks[data.weeks.length - 1])
      })
      .catch(() => { if (alive) { setUnavailable('Couldn’t load this week’s rankings.'); setWeeks([]) } })
    return () => { alive = false }
  }, [slug])

  const week = weeks?.find((w) => w.id === weekId) ?? null
  const byId = new Map((week?.overall ?? []).map((t) => [t.team_id, t]))

  // Opening a week loads its working order: the saved board for that week
  // if there is one, otherwise the model's order.
  function openWeek(w: Week) {
    const ids = new Set(w.overall.map((t) => t.team_id))
    const saved = w.commish?.order?.map((o) => o.team_id).filter((id) => ids.has(id)) ?? []
    const rest = w.overall.map((t) => t.team_id).filter((id) => !saved.includes(id))
    setWeekId(w.id)
    setOrder([...saved, ...rest])
    setNote(w.commish?.note ?? '')
    setMsg(null)
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return
    setMsg(null)
    setOrder((o) => {
      const next = [...o]
      const [x] = next.splice(from, 1)
      next.splice(to, 0, x)
      return next
    })
  }

  async function publish(clear = false) {
    if (!week) return
    setBusy(true); setMsg(null)
    const r = await saveCommishPower(leagueId, seasonId, week.week, clear ? [] : order, clear ? null : note.trim() || null)
    setBusy(false)
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return }
    setWeeks((ws) => ws && ws.map((w) => (w.id === week.id
      ? { ...w, commish: clear ? null : { note: note.trim() || null, updated_at: new Date().toISOString(), order: order.map((id) => ({ team_id: id })) } }
      : w)))
    if (clear) setOrder(week.overall.map((t) => t.team_id))
    setMsg({ ok: true, text: clear ? 'Removed. The page shows the model’s order only.' : `Published. It’s on the Power Rankings page for ${week.label}.` })
    router.refresh()
  }

  const cls = variant === 'mobile' ? 'mcp' : 'lo-cp'
  if (weeks == null) return <div className={`${cls}-empty`}>Loading this week’s rankings…</div>
  if (unavailable || !week) return <div className={`${cls}-empty`}>{unavailable ?? 'Nothing to rank yet.'}</div>

  const modelOrder = week.overall.map((t) => t.team_id)
  const sameAsModel = order.every((id, i) => modelOrder[i] === id)
  const published = !!week.commish
  const record = (t: Team) => `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ''}`

  return (
    <div className={cls}>
      <div className={`${cls}-bar`}>
        <label className={`${cls}-week`}>
          <span>Week</span>
          <select
            className="dc-select"
            value={weekId ?? ''}
            onChange={(e) => { const w = weeks.find((x) => x.id === e.target.value); if (w) openWeek(w) }}
            disabled={busy}
          >
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>{w.label}{w.commish ? ' · published' : ''}</option>
            ))}
          </select>
        </label>
        <span className={`${cls}-hint`}>
          {variant === 'mobile' ? 'Use the arrows to move a team.' : 'Drag a row, or use the arrows. The gap column is how far you are from the model.'}
        </span>
      </div>

      <ol className={`${cls}-list`}>
        {order.map((id, i) => {
          const t = byId.get(id)
          if (!t) return null
          const gap = t.rank - (i + 1)
          return (
            <li
              key={id}
              className={`${cls}-row`}
              draggable={variant === 'desktop' && !busy}
              onDragStart={() => { dragFrom.current = i }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragFrom.current != null) move(dragFrom.current, i); dragFrom.current = null }}
            >
              <span className={`${cls}-rank`}>{i + 1}</span>
              <span className={`${cls}-team`}>
                <b>{t.manager}</b>
                <small>{t.team_name} · {record(t)}</small>
              </span>
              <span className={`${cls}-model`}>Model #{t.rank}</span>
              <span className={`${cls}-gap ${gap > 0 ? 'up' : gap < 0 ? 'down' : 'even'}`}>
                {gap > 0 ? `↑${gap}` : gap < 0 ? `↓${-gap}` : '='}
              </span>
              <span className={`${cls}-arrows`}>
                <button type="button" onClick={() => move(i, i - 1)} disabled={busy || i === 0} aria-label={`Move ${t.manager} up`}>▲</button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={busy || i === order.length - 1} aria-label={`Move ${t.manager} down`}>▼</button>
              </span>
            </li>
          )
        })}
      </ol>

      <label className={`${cls}-note`}>
        <span>Commissioner’s note (optional)</span>
        <textarea
          className="dc-input"
          rows={variant === 'mobile' ? 3 : 2}
          maxLength={400}
          value={note}
          onChange={(e) => { setNote(e.target.value); setMsg(null) }}
          placeholder="Why your board looks the way it does."
          disabled={busy}
        />
      </label>

      <div className={`${cls}-actions`}>
        <button type="button" className="lo-btn" onClick={() => publish(false)} disabled={busy}>
          {busy ? 'Saving…' : published ? 'Update my ranking' : 'Publish my ranking'}
        </button>
        {!sameAsModel && (
          <button type="button" className="lo-btn-ghost" onClick={() => setOrder(modelOrder)} disabled={busy}>
            Start over from the model
          </button>
        )}
        {published && (
          <button type="button" className="lo-btn-quiet" onClick={() => publish(true)} disabled={busy}>
            Remove this week’s ranking
          </button>
        )}
        {msg && <span className={`${cls}-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}
