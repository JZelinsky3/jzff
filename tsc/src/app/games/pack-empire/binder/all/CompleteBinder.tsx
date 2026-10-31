'use client'

// Every man and every card, face up, for going through the set. Tap a card to
// see it at full size and put a photo on it. A new photo shows on the real card
// first and only goes live on Save, because it goes live for everyone.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { BinderMan, BinderOwned, BinderView } from '@/lib/packEmpire/binder'
import { POOL_KEYS, POOL_LABEL, RARITY_LOOK, type PoolKey } from '@/lib/packEmpire/rules'
import { PackCard } from '../../cards'
import { FacesProvider, useFaces } from '../../faces'

type Tab = 'ALL' | PoolKey
type Show = 'all' | 'none' | 'uploaded'
type Sort = 'best' | 'name'

const PAGE = 40

/** Longest side kept. A card draws a photo about 130px tall, 3x on a phone. */
const MAX_SIDE = 720

/** Every card arrives whole here; see loadCompleteBinder. */
const whole = (man: BinderMan) => man.cards as BinderOwned[]

async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // Safari can't write WebP and hands back a PNG, which is fine: both keep a
  // cut-out's transparent background.
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/webp', 0.88))
  if (!blob) throw new Error('unreadable')
  return blob
}

export function CompleteBinder({ view }: { view: BinderView }) {
  const server = useFaces()
  // Saved this visit. Null means taken back off.
  const [saved, setSaved] = useState<Record<string, string | null>>({})
  const faces = useMemo(() => {
    const out = { ...server }
    for (const [id, img] of Object.entries(saved)) {
      if (img) out[id] = img
      else delete out[id]
    }
    return out
  }, [server, saved])

  const [tab, setTab] = useState<Tab>('ALL')
  const [show, setShow] = useState<Show>('all')
  const [sort, setSort] = useState<Sort>('best')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<{ man: BinderMan; id: string } | null>(null)

  const faceless = (c: BinderOwned) => !c.img && !faces[c.id]
  const counts = useMemo(() => {
    const cards = view.men.flatMap(whole)
    return {
      all: cards.length,
      none: cards.filter((c) => !c.img && !faces[c.id]).length,
      uploaded: cards.filter((c) => faces[c.id]).length,
    }
  }, [view.men, faces])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = view.men.filter((m) => {
      if (tab !== 'ALL' && m.pos !== tab) return false
      if (show === 'none' && !whole(m).some((c) => !c.img && !faces[c.id])) return false
      if (show === 'uploaded' && !whole(m).some((c) => faces[c.id])) return false
      return !needle || m.name.toLowerCase().includes(needle)
    })
    return sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list
  }, [view.men, tab, show, sort, q, faces])

  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setLimit(PAGE)
  }
  const pickTab = filter(setTab)
  const pickShow = filter(setShow)
  const pickSort = filter(setSort)
  const pickQ = filter(setQ)

  return (
    <FacesProvider faces={faces}>
      <div className="pe-bd">
        <p className="pe-bd-all-sum">
          {view.totals.cards.toLocaleString()} cards · {view.totals.men.toLocaleString()} players
        </p>

        <div className="pe-bd-tabs" role="tablist" aria-label="Position">
          {(['ALL', ...POOL_KEYS] as Tab[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`pe-bd-tab${tab === k ? ' on' : ''}`}
              onClick={() => pickTab(k)}
            >
              <span>{k === 'ALL' ? 'All' : k}</span>
              <em>{k === 'ALL' ? view.totals.cards : view.totals.byPos[k].of}</em>
            </button>
          ))}
        </div>

        <div className="pe-bd-ctl">
          <div className="pe-bd-seg" role="group" aria-label="Show">
            {(
              [
                ['all', 'All'],
                ['none', `No Photo ${counts.none}`],
                ['uploaded', `Uploaded ${counts.uploaded}`],
              ] as [Show, string][]
            ).map(([k, label]) => (
              <button key={k} type="button" className={show === k ? 'on' : ''} onClick={() => pickShow(k)}>
                {label}
              </button>
            ))}
          </div>
          <label className="pe-bd-sort">
            <span className="pe-note">Sort</span>
            <select value={sort} onChange={(e) => pickSort(e.target.value as Sort)}>
              <option value="best">Best card</option>
              <option value="name">Name</option>
            </select>
          </label>
          <input
            className="pe-input pe-bd-q"
            type="search"
            placeholder="Find a player"
            value={q}
            onChange={(e) => pickQ(e.target.value)}
            aria-label="Find a player"
          />
        </div>

        {rows.length === 0 ? (
          <p className="pe-empty">{show === 'none' ? 'Every card has a photo.' : 'No one matches that.'}</p>
        ) : (
          <div className="pe-bd-list">
            {rows.slice(0, limit).map((m) => (
              <div key={m.pid} className="pe-bd-man">
                <div className="pe-bd-man-head">
                  <span className="pe-bd-man-pos">{m.pos}</span>
                  <span className="pe-bd-man-name">{m.name}</span>
                  <span className="pe-bd-man-meta">
                    {m.cards.length} {m.cards.length === 1 ? 'card' : 'cards'}
                  </span>
                </div>
                <div className="pe-bd-strip">
                  {whole(m).map((c) => (
                    <Tile key={c.id} card={c} img={faces[c.id] ?? c.img} missing={faceless(c)} onClick={() => setOpen({ man: m, id: c.id })} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {rows.length > limit && (
          <div className="pe-bd-more">
            <button type="button" className="pe-btn pe-btn--quiet pe-btn--sm" onClick={() => setLimit((n) => n + PAGE)}>
              Show more
            </button>
            <span className="pe-note">
              {limit} of {rows.length}
            </span>
          </div>
        )}

        {open && (
          <CardSheet
            man={open.man}
            id={open.id}
            onPick={(id) => setOpen({ man: open.man, id })}
            onSaved={(ids, img) => setSaved((s) => ({ ...s, ...Object.fromEntries(ids.map((i) => [i, img])) }))}
            onClose={() => setOpen(null)}
          />
        )}
      </div>
    </FacesProvider>
  )
}

function Tile({ card, img, missing, onClick }: { card: BinderOwned; img: string | null; missing: boolean; onClick: () => void }) {
  const rc = RARITY_LOOK[card.rarity]
  const style = { '--rc': rc.color, '--rg': rc.glow, '--art': rc.art } as React.CSSProperties
  return (
    <span className="pe-bd-slot">
      <button
        type="button"
        className={`pe-bd-tile${missing ? ' nophoto' : ''}`}
        style={style}
        onClick={onClick}
        aria-label={`${card.name} ${card.year}, ${rc.label}${missing ? ', no photo' : ''}`}
      >
        <span className="pe-bd-tile-top">
          <span className="pe-bd-tile-year">{card.year}</span>
          <span className="pe-bd-tile-rar">{rc.short}</span>
        </span>
        <span className="pe-bd-tile-art">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" loading="lazy" decoding="async" onError={(e) => (e.currentTarget.style.display = 'none')} />
          ) : null}
          <span className="pe-bd-tile-initial">{card.name.charAt(0)}</span>
        </span>
        <span className="pe-bd-tile-foot">{missing ? 'No Photo' : card.score.toLocaleString()}</span>
      </button>
    </span>
  )
}

function CardSheet({
  man,
  id,
  onPick,
  onSaved,
  onClose,
}: {
  man: BinderMan
  id: string
  onPick: (id: string) => void
  onSaved: (ids: string[], img: string | null) => void
  onClose: () => void
}) {
  const faces = useFaces()
  const input = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<{ blob: Blob; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearDraft = () =>
    setDraft((d) => {
      if (d) URL.revokeObjectURL(d.url)
      return null
    })

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const cards = whole(man)
  const card = cards.find((c) => c.id === id) ?? cards[0]
  const rc = RARITY_LOOK[card.rarity]
  const uploaded = !!faces[card.id]
  const others = cards.filter((c) => c.id !== card.id && !c.img && !faces[c.id]).length

  const pick = (nextId: string) => {
    clearDraft()
    setError(null)
    onPick(nextId)
  }

  const choose = async (file: File | undefined) => {
    if (input.current) input.current.value = ''
    if (!file) return
    setError(null)
    try {
      const blob = await shrink(file)
      clearDraft()
      setDraft({ blob, url: URL.createObjectURL(blob) })
    } catch {
      setError('Could not read that image. Try a JPG or PNG.')
    }
  }

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.set('cardId', card.id)
    form.set('file', new File([draft.blob], 'face', { type: draft.blob.type }))
    try {
      const res = await fetch('/api/games/pack-empire/faces/', { method: 'POST', body: form })
      const out = await res.json()
      if (!out.ok) throw new Error(out.error)
      onSaved(out.ids, out.img)
      clearDraft()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The upload failed.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/games/pack-empire/faces/?id=${encodeURIComponent(card.id)}`, { method: 'DELETE' })
      const out = await res.json()
      if (!out.ok) throw new Error(out.error)
      onSaved(out.ids, null)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not remove that photo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pe-bd-sheet" role="dialog" aria-modal="true" aria-label={`${man.name}, ${card.year}`} onClick={onClose}>
      <div className="pe-bd-sheet-in" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pe-bd-x" onClick={onClose} aria-label="Close" autoFocus>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="pe-bd-sheet-card">
          <FacesProvider faces={draft ? { ...faces, [card.id]: draft.url } : faces}>
            <PackCard key={card.id} player={card} revealed />
          </FacesProvider>
        </div>

        <div className="pe-bd-sheet-body">
          <div className="pe-kicker" style={{ color: rc.color }}>
            {rc.label}
            {cards.length > 1 && ` · Card ${cards.findIndex((c) => c.id === card.id) + 1} of ${cards.length}`}
          </div>
          <div className="pe-bd-sheet-name">{man.name}</div>
          <div className="pe-bd-sheet-club">
            {card.year} {card.club ?? POOL_LABEL[card.pos]}
          </div>
          <div className="pe-bd-counts">
            <div className="pe-bd-count site">
              <div className="pe-bd-count-head">Everyone</div>
              <dl className="pe-bd-stats">
                <div>
                  <dt>Pulled</dt>
                  <dd>×{card.site.pulls.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Pack odds</dt>
                  <dd>1 in {card.site.oneIn.toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          </div>

          {cards.length > 1 && (
            <div className="pe-bd-sheet-vers" role="group" aria-label="His seasons">
              {cards.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`pe-bd-ver${c.id === card.id ? ' on' : ''}`}
                  style={{ '--rc': RARITY_LOOK[c.rarity].color } as React.CSSProperties}
                  onClick={() => pick(c.id)}
                >
                  <span>{c.year}</span>
                  <em>{RARITY_LOOK[c.rarity].short}</em>
                </button>
              ))}
            </div>
          )}

          <div className="pe-bd-photo">
            <div className="pe-bd-count-head">Photo</div>
            <p className="pe-bd-photo-line">
              {draft
                ? others > 0
                  ? `Preview. Saving also fills his ${others === 1 ? 'other card' : `${others} other cards`} with no photo.`
                  : 'Preview. Nobody else sees it until you save.'
                : uploaded
                  ? 'Your upload, live for everyone.'
                  : card.img
                    ? 'The photo from the player database.'
                    : 'No photo. He shows as the drawn portrait.'}
            </p>
            <input
              ref={input}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => choose(e.target.files?.[0])}
              aria-label={`Photo for ${man.name}`}
            />
            <div className="pe-bd-photo-acts">
              {draft ? (
                <>
                  <button type="button" className="pe-btn pe-btn--sm" onClick={save} disabled={busy}>
                    {busy ? 'Saving' : 'Save Photo'}
                  </button>
                  <button type="button" className="pe-btn pe-btn--ghost pe-btn--sm" onClick={clearDraft} disabled={busy}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="pe-btn pe-btn--sm" onClick={() => input.current?.click()} disabled={busy}>
                    {uploaded || card.img ? 'Replace Photo' : 'Upload Photo'}
                  </button>
                  {uploaded && (
                    <button type="button" className="pe-btn pe-btn--ghost pe-btn--sm" onClick={remove} disabled={busy}>
                      {busy ? 'Removing' : 'Remove'}
                    </button>
                  )}
                </>
              )}
            </div>
            {error && <p className="pe-bd-photo-error">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
