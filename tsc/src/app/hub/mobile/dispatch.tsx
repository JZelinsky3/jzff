import Link from 'next/link'
import { Reveal } from '../bits'
import { COMING_SOON, DISPATCH, type DispatchEntry } from '../dispatch-content'
import { DispatchList } from '../dispatch-list'

// Pocket Clubhouse — the Dispatch. The desktop timeline (dates in a left
// gutter, rule down the page) becomes a feed of inked cards: gold spine
// for shipped, rust spine for what's still on the press.

function Entry({ e }: { e: DispatchEntry }) {
  return (
    <Reveal>
      <article className={`mhb-entry${e.status === 'soon' ? ' is-soon' : ''}`}>
        <div className="mhb-entry-date">{e.date}</div>
        <h3 className="mhb-entry-title">
          {e.title} {e.titleEm && <em>{e.titleEm}</em>}
        </h3>
        <p className="mhb-entry-body" dangerouslySetInnerHTML={{ __html: e.body }} />
        {e.tags.length > 0 && (
          <div className="mhb-entry-tags">
            {e.tags.map((t) => (
              <span key={t.label} className={`hub-chip${t.tone ? ` ${t.tone}` : ''}`}>
                {t.label}
              </span>
            ))}
          </div>
        )}
      </article>
    </Reveal>
  )
}

export function MobileDispatch() {
  return (
    <main className="mhb">
      <section className="mhb-hero">
        <div className="mhb-hero-sup">★ Wing II · Hot off the press ★</div>
        <h1 className="mhb-hero-title">
          The <em>Dispatch.</em>
        </h1>
        <p className="mhb-hero-sub">
          Everything the press has shipped, dated and inked. New features land here first.
        </p>
        <div className="mhb-hero-meta">
          <span>{DISPATCH.length} entries on file</span>
          <span>{COMING_SOON.length} in the works</span>
        </div>
      </section>

      {/* ── Shipped ── */}
      <section className="mhb-sec">
        <div className="mhb-sec-head">
          <div>
            <span className="mhb-sec-num">§ 01 · What&apos;s new</span>
            <span className="mhb-sec-title">Already in your almanac</span>
          </div>
          <span className="mhb-sec-side">Newest first</span>
        </div>
        <DispatchList entries={DISPATCH} variant="mobile" initial={10} />
      </section>

      {/* ── On the way ── */}
      <section className="mhb-sec">
        <div className="mhb-sec-head">
          <div>
            <span className="mhb-sec-num">§ 02 · Coming soon</span>
            <span className="mhb-sec-title">Still on the press</span>
          </div>
          <span className="mhb-sec-side">Windows, not promises</span>
        </div>
        <div className="mhb-feed">
          {COMING_SOON.map((e) => (
            <Entry key={e.id} e={e} />
          ))}
        </div>
      </section>

      {/* ── Suggestion box ── */}
      <section className="mhb-sec">
        <Reveal>
          <div className="hub-promote">
            <div>
              <div className="hub-promote-title">The suggestion <em>box.</em></div>
              <p className="hub-promote-body">
                Most of this page started as a note from a commissioner. If your league needs
                something the almanac doesn&apos;t do yet, write in.
              </p>
            </div>
            <div className="hub-promote-side">
              <a href="mailto:jzffgames@gmail.com?subject=TSC%20suggestion" className="hub-btn">
                Write to the editor
              </a>
              <Link href="/hub" className="hub-btn-ghost">Back to the front desk</Link>
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  )
}
