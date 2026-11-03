'use client'

// The binder: a row per man, his most valuable card first, each with its
// count. Pulled cards (the one you kept from a pack) are the real card; the
// ones still out there are face down, showing only the rarity and the year
// you're chasing. Up close, a card shows your count beside the whole site's.
//
// Cantons get the Hall at the top as well: each one stands lit in its own case
// on a plinth with its number engraved, the way an award is kept, and from up
// close it can be shared to its own page (canton/[card]/[serial]).

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import type { BinderCard, BinderMan, BinderOwned, BinderView, HallPiece } from '@/lib/packEmpire/binder'
import { CANTON_CARDS, POOL_KEYS, POOL_LABEL, RARITIES, RARITY_LOOK, type PoolKey } from '@/lib/packEmpire/rules'
import { claimBank } from '../../runBank'
import { PackCard } from '../cards'
import { useFace } from '../faces'
import { ShareButton } from '../share'

type Tab = 'ALL' | PoolKey
type Show = 'all' | 'have' | 'missing'
type Sort = 'best' | 'pulls' | 'name'

const PAGE = 40

const owned = (c: BinderCard): c is BinderOwned => c.pulls > 0

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function Binder({ view, mobile }: { view: BinderView; mobile: boolean }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('ALL')
  const [show, setShow] = useState<Show>(view.totals.owned > 0 ? 'have' : 'all')
  const [sort, setSort] = useState<Sort>('best')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<{ man: BinderMan; card: BinderCard } | null>(null)
  const [vaultOpen, setVaultOpen] = useState(false)

  // Runs played signed out on this device file into the binder once they're
  // claimed, so claim them here too and redraw if any went up.
  useEffect(() => {
    claimBank()
      .then((n) => {
        if (n > 0) router.refresh()
      })
      .catch(() => {})
  }, [router])

  // A new filter starts back at the top of the list.
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setLimit(PAGE)
  }
  const pickTab = filter(setTab)
  const pickShow = filter(setShow)
  const pickSort = filter(setSort)
  const pickQ = filter(setQ)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = view.men.filter((m) => {
      if (tab !== 'ALL' && m.pos !== tab) return false
      const has = m.cards.some(owned)
      if (show === 'have' && !has) return false
      if (show === 'missing' && m.cards.every(owned)) return false
      if (needle && !m.name.toLowerCase().includes(needle)) return false
      return true
    })
    if (sort === 'pulls') {
      const pulls = (m: BinderMan) => m.cards.reduce((s, c) => s + c.pulls, 0)
      return [...list].sort((a, b) => pulls(b) - pulls(a))
    }
    if (sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name))
    // Best card first, counting only the cards this view is about: a man whose
    // only pull is his common sorts as that common in Collected, however good
    // the immortal he's still missing. A missing card carries no score, so
    // Missing sorts by rarity, keeping the pool's order inside each.
    if (show === 'have') {
      const top = (m: BinderMan) => m.cards.find(owned)?.score ?? 0
      return [...list].sort((a, b) => top(b) - top(a))
    }
    if (show === 'missing') {
      const top = (m: BinderMan) => RARITIES.indexOf(m.cards.find((c) => !owned(c))?.rarity ?? 'common')
      return [...list].sort((a, b) => top(b) - top(a))
    }
    return list
  }, [view.men, tab, show, sort, q])

  const t = view.totals

  return (
    <div className="pe-bd">
      <section className="pe-bd-sum">
        <div className="pe-bd-sum-main">
          <div className="pe-bd-sum-num">
            {t.owned.toLocaleString()}
            <span>/{t.cards.toLocaleString()}</span>
          </div>
          <div className="pe-note">Cards collected</div>
          <div className="pe-bd-sum-sub">
            {t.menOwned.toLocaleString()} of {t.men.toLocaleString()} players · {t.pulls.toLocaleString()}{' '}
            {t.pulls === 1 ? 'pack' : 'packs'} opened. One card from each pack goes in: the one you keep.
          </div>
        </div>
        <div className="pe-bd-rar">
          {[...RARITIES].reverse().map((r) => {
            const x = t.byRarity[r]
            return (
              <div key={r} className="pe-bd-rar-row" style={{ '--rc': RARITY_LOOK[r].color } as React.CSSProperties}>
                <span className="pe-bd-rar-name">{RARITY_LOOK[r].label}</span>
                <span className="pe-bd-rar-bar">
                  <span style={{ width: `${x.of ? (100 * x.owned) / x.of : 0}%` }} />
                </span>
                <span className="pe-bd-rar-n">
                  {x.owned}
                  <em>/{x.of}</em>
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <CantonHall
        hall={view.hall}
        men={view.men.concat(view.vaulted)}
        onOpen={(man, card) => setOpen({ man, card })}
      />

      {t.owned === 0 && (
        <p className="pe-empty pe-bd-first">
          Nothing in here yet. Finish a run and the eleven players you kept land in the binder.{' '}
          <Link href="/games/pack-empire/builder/" className="pe-link">
            Open packs
          </Link>
        </p>
      )}

      <div className="pe-bd-tabs" role="tablist" aria-label="Position">
        {(['ALL', ...POOL_KEYS] as Tab[]).map((k) => {
          const c = k === 'ALL' ? { owned: t.owned, of: t.cards } : t.byPos[k]
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`pe-bd-tab${tab === k ? ' on' : ''}`}
              onClick={() => pickTab(k)}
            >
              <span>{k === 'ALL' ? 'All' : k}</span>
              <em>
                {c.owned}/{c.of}
              </em>
            </button>
          )
        })}
      </div>

      <div className="pe-bd-ctl">
        <div className="pe-bd-seg" role="group" aria-label="Show">
          {(
            [
              ['have', 'Collected'],
              ['missing', 'Missing'],
              ['all', 'All'],
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
            <option value="pulls">Most pulled</option>
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
        <p className="pe-empty">
          {show === 'have' ? 'None of these pulled yet.' : show === 'missing' ? 'Every one of these is in.' : 'No one by that name.'}
        </p>
      ) : (
        <div className="pe-bd-list">
          {rows.slice(0, limit).map((m) => (
            <ManRow key={m.pid} man={m} mobile={mobile} onOpen={(card) => setOpen({ man: m, card })} />
          ))}
        </div>
      )}

      {rows.length > limit && (
        <div className="pe-bd-more">
          <button type="button" className="pe-act" onClick={() => setLimit((n) => n + PAGE)}>
            Show more
          </button>
          <span className="pe-note">
            {limit} of {rows.length}
          </span>
        </div>
      )}

      {view.vaulted.length > 0 && (
        // A drawer, shut to start: it can run long, and it's the cards out of play.
        <details className="pe-bd-vault" onToggle={(e) => setVaultOpen(e.currentTarget.open)}>
          <summary className="pe-bd-vault-h">
            Vaulted <span>{vaultCount(view.vaulted)}</span>
          </summary>
          <p className="pe-bd-vault-p">Out of the packs for now. Yours to keep, and they don&apos;t count toward the set.</p>
          {vaultOpen && (
            <div className="pe-bd-list">
              {view.vaulted.map((m) => (
                <ManRow key={m.pid} man={m} mobile={mobile} onOpen={(card) => setOpen({ man: m, card })} />
              ))}
            </div>
          )}
        </details>
      )}

      {open && (
        <CardSheet
          man={open.man}
          card={open.card}
          onPick={(card) => setOpen({ man: open.man, card })}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

function ordinalDay(iso: string): string {
  const d = new Date(iso)
  const n = d.getDate()
  const v = n % 100
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()]} ${n}${suffix}`
}

/** A Canton's own page, by the number it was given. */
function cantonHref(id: string, serial: number): string {
  return `/games/pack-empire/canton/${id}/${serial}/`
}

/**
 * The Hall: every Canton you hold, each in its own lit case on a plinth with its
 * number engraved on a brass plate, first pulled first. With none yet, one empty
 * case, lit, waiting.
 */
function CantonHall({
  hall,
  men,
  onOpen,
}: {
  hall: HallPiece[]
  men: BinderMan[]
  onOpen: (man: BinderMan, card: BinderCard) => void
}) {
  const pieces = hall.flatMap((h) => {
    const man = men.find((m) => m.cards.some((c) => c.id === h.id))
    const card = man?.cards.find((c) => c.id === h.id)
    return man && card && owned(card) ? [{ h, man, card }] : []
  })
  return (
    <section className={`pe-hall${pieces.length ? '' : ' empty'}`} aria-label="The Hall">
      <div className="pe-hall-head">
        <span className="pe-kicker">★ The Hall ★</span>
        <span className="pe-hall-count">
          {pieces.length ? `${pieces.length} of ${CANTON_CARDS} Cantons` : `${CANTON_CARDS} Cantons in the game`}
        </span>
      </div>
      <div className="pe-hall-row">
        {pieces.length === 0 ? (
          <div className="pe-hall-bay">
            <div className="pe-hall-case">
              <span className="pe-hall-light" aria-hidden />
              <span className="pe-hall-ghost" aria-hidden>
                ?
              </span>
            </div>
            <div className="pe-hall-plinth" aria-hidden />
            <div className="pe-hall-plate">
              <b>Your first Canton</b>
              <span>stands here, numbered for good</span>
            </div>
          </div>
        ) : (
          pieces.map(({ h, man, card }) => (
            <button
              key={h.id}
              type="button"
              className="pe-hall-bay"
              onClick={() => onOpen(man, card)}
              aria-label={`${card.name} ${card.year}, Canton number ${h.serials.join(' and ')} of ${h.total}`}
            >
              <div className="pe-hall-case">
                <span className="pe-hall-light" aria-hidden />
                <span className="pe-hall-card">
                  <PackCard player={card} revealed serial={[h.serials[0], h.total]} />
                </span>
                <span className="pe-hall-glass" aria-hidden />
              </div>
              <div className="pe-hall-plinth" aria-hidden />
              <div className="pe-hall-plate">
                <b>
                  {card.name} <em>{card.year}</em>
                </b>
                <span>
                  {h.serials.map((n) => `No. ${n}`).join(' · ')} of {h.total} · {ordinalDay(h.at)}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  )
}

function vaultCount(men: BinderMan[]): string {
  const n = men.reduce((sum, m) => sum + m.cards.length, 0)
  return `${n} ${n === 1 ? 'card' : 'cards'}`
}

function ManRow({ man, mobile, onOpen }: { man: BinderMan; mobile: boolean; onOpen: (c: BinderCard) => void }) {
  const have = man.cards.filter(owned)
  const pulls = man.cards.reduce((s, c) => s + c.pulls, 0)
  return (
    <div className={`pe-bd-man${have.length ? '' : ' none'}`}>
      <div className="pe-bd-man-head">
        <span className="pe-bd-man-pos">{man.pos}</span>
        <span className="pe-bd-man-name">{man.name}</span>
        <span className="pe-bd-man-meta">
          {have.length}/{man.cards.length}
          {pulls > 0 && !mobile && <> · Pulled {pulls}</>}
        </span>
      </div>
      <div className="pe-bd-strip">
        {man.cards.map((c) => (
          <Tile key={c.id} card={c} onClick={() => onOpen(c)} />
        ))}
      </div>
    </div>
  )
}

function Tile({ card, onClick }: { card: BinderCard; onClick: () => void }) {
  const rc = RARITY_LOOK[card.rarity]
  const img = useFace(owned(card) ? card : { id: '', img: null })
  const style = { '--rc': rc.color, '--rg': rc.glow, '--art': rc.art } as React.CSSProperties
  const label = owned(card)
    ? `${card.name} ${card.year}, ${rc.label}, pulled ${card.pulls}`
    : `${card.name} ${card.year}, ${rc.label}, not pulled yet`
  return (
    <span className="pe-bd-slot">
      <button type="button" className={`pe-bd-tile${owned(card) ? '' : ' back'}`} data-r={card.rarity} style={style} onClick={onClick} aria-label={label}>
        <span className="pe-bd-tile-top">
          <span className="pe-bd-tile-year">{card.year}</span>
          <span className="pe-bd-tile-rar">{rc.short}</span>
        </span>
        <span className="pe-bd-tile-art">
          {owned(card) && img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" loading="lazy" decoding="async" onError={(e) => (e.currentTarget.style.display = 'none')} />
          ) : null}
          <span className="pe-bd-tile-initial">{owned(card) ? card.name.charAt(0) : '?'}</span>
          {owned(card) && <span className="pe-bd-tile-count">{card.serial ? card.serial.join('/') : `×${card.pulls}`}</span>}
        </span>
        <span className="pe-bd-tile-foot">{owned(card) ? card.score.toLocaleString() : 'Not pulled'}</span>
      </button>
    </span>
  )
}

function CardSheet({
  man,
  card,
  onPick,
  onClose,
}: {
  man: BinderMan
  card: BinderCard
  onPick: (c: BinderCard) => void
  onClose: () => void
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const rc = RARITY_LOOK[card.rarity]
  const i = man.cards.findIndex((c) => c.id === card.id)

  return (
    <div className="pe-bd-sheet" role="dialog" aria-modal="true" aria-label={`${man.name}, ${card.year}`} onClick={onClose}>
      <div className="pe-bd-sheet-in" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pe-bd-x" onClick={onClose} aria-label="Close" autoFocus>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="pe-bd-sheet-card">
          {owned(card) ? (
            <PackCard player={card} revealed serial={card.serial} />
          ) : (
            <div className="pe-bd-ghost" style={{ '--rc': rc.color, '--rg': rc.glow } as React.CSSProperties}>
              <span className="pe-bd-ghost-rar">{rc.label}</span>
              <span className="pe-bd-ghost-year">{card.year}</span>
              <span className="pe-bd-ghost-club">{card.club ?? POOL_LABEL[card.pos]}</span>
              <span className="pe-bd-ghost-q">?</span>
            </div>
          )}
        </div>

        <div className="pe-bd-sheet-body">
          <div className="pe-kicker" style={{ color: rc.color }}>
            {rc.label}
            {card.site.oneIn === 0 ? ' · Vaulted' : man.cards.length > 1 && ` · Card ${i + 1} of ${man.cards.length}`}
          </div>
          <div className="pe-bd-sheet-name">{man.name}</div>
          <div className="pe-bd-sheet-club">
            {card.year} {card.club}
          </div>
          <div className="pe-bd-counts">
            <div className="pe-bd-count you">
              <div className="pe-bd-count-head">You</div>
              {owned(card) ? (
                <dl className="pe-bd-stats">
                  <div>
                    <dt>Pulled</dt>
                    <dd>×{card.pulls}</dd>
                  </div>
                  <div>
                    <dt>First</dt>
                    <dd>{shortDate(card.firstAt)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="pe-bd-sheet-miss">
                  Not pulled yet. It comes out of the {POOL_LABEL[card.pos].toLowerCase()} pack.
                </p>
              )}
            </div>
            <div className="pe-bd-count site">
              <div className="pe-bd-count-head">Everyone</div>
              <dl className="pe-bd-stats">
                <div>
                  <dt>Pulled</dt>
                  <dd>×{card.site.pulls.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Pack odds</dt>
                  <dd>{card.site.oneIn ? `1 in ${card.site.oneIn.toLocaleString()}` : 'Vaulted'}</dd>
                </div>
              </dl>
            </div>
          </div>

          {owned(card) && card.rarity === 'canton' && card.serial && (
            <div className="pe-bd-sheet-share">
              <span>
                <b>No. {card.serial[0]}</b> of {card.serial[1]} ever pulled. Show it off.
              </span>
              <span className="pe-bd-sheet-share-acts">
                <ShareButton
                  path={cantonHref(card.id, card.serial[0])}
                  title={`${card.name} ${card.year} · Canton`}
                  text={`My Canton: ${card.name} ${card.year}, No. ${card.serial[0]} of ${card.serial[1]}`}
                />
                <Link href={cantonHref(card.id, card.serial[0])} className="pe-link">
                  Its page
                </Link>
              </span>
            </div>
          )}

          {man.cards.length > 1 && (
            <div className="pe-bd-sheet-vers" role="group" aria-label="His seasons">
              {man.cards.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`pe-bd-ver${c.id === card.id ? ' on' : ''}${owned(c) ? '' : ' back'}`}
                  style={{ '--rc': RARITY_LOOK[c.rarity].color } as React.CSSProperties}
                  onClick={() => onPick(c)}
                >
                  <span>{c.year}</span>
                  <em>{owned(c) ? `×${c.pulls}` : RARITY_LOOK[c.rarity].short}</em>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
