import Link from 'next/link'
import { Reveal } from '../bits'
import { COMING_SOON, DISPATCH, type DispatchEntry } from '../dispatch-content'

export const metadata = { title: 'The Clubhouse · The Dispatch' }

function Entry({ e }: { e: DispatchEntry }) {
  return (
    <Reveal>
      <article className={`hub-entry${e.status === 'soon' ? ' is-soon' : ''}`}>
        <div className="hub-entry-date">{e.date}</div>
        <div className="hub-entry-dot" />
        <div>
          <h3 className="hub-entry-title">
            {e.title} {e.titleEm && <em>{e.titleEm}</em>}
          </h3>
          <p className="hub-entry-body">{e.body}</p>
          {e.tags.length > 0 && (
            <div className="hub-entry-tags">
              {e.tags.map((t) => (
                <span key={t.label} className={`hub-chip${t.tone ? ` ${t.tone}` : ''}`}>
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>
    </Reveal>
  )
}

export default function DispatchPage() {
  return (
    <main>
      <section className="hub-hero">
        <div className="hub-hero-sup">★ Wing II · Hot off the press ★</div>
        <h1 className="hub-hero-title">
          The <em>Dispatch.</em>
        </h1>
        <p className="hub-hero-sub">
          Everything the press has shipped, dated and inked — and the stories still being set.
          New features land here first, usually before the landing page hears about them.
        </p>
        <div className="hub-hero-meta">
          <span>{DISPATCH.length} entries on file</span>
          <span>·</span>
          <span>{COMING_SOON.length} in the works</span>
        </div>
      </section>

      {/* ─── Shipped ──────────────────────────────────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">§ 01 · What&apos;s new</span>
          <span className="hub-section-title">Already in your almanac —</span>
          <span className="hub-section-meta">Newest first</span>
        </div>
        <div className="hub-dispatch">
          {DISPATCH.map((e) => (
            <Entry key={e.id} e={e} />
          ))}
        </div>
      </div>

      {/* ─── On the way ───────────────────────────────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">§ 02 · Coming soon</span>
          <span className="hub-section-title">Still on the press —</span>
          <span className="hub-section-meta">Windows, not promises</span>
        </div>
        <div className="hub-dispatch">
          {COMING_SOON.map((e) => (
            <Entry key={e.id} e={e} />
          ))}
        </div>
      </div>

      {/* ─── Suggestion box ───────────────────────────────── */}
      <div className="hub-section">
        <Reveal>
          <div className="hub-promote">
            <div>
              <div className="hub-promote-title">The suggestion <em>box.</em></div>
              <p className="hub-promote-body">
                Most of what&apos;s on this page started as a note from a commissioner. If your
                league needs something the almanac doesn&apos;t do yet — or something here is
                misbehaving — write in. Short notes welcome; screenshots adored.
              </p>
            </div>
            <div className="hub-promote-side">
              <a href="mailto:jzffgames@gmail.com?subject=TSC%20suggestion" className="hub-btn">
                Write to the editor →
              </a>
              <Link href="/hub" className="hub-btn-ghost">Back to the front desk</Link>
            </div>
          </div>
        </Reveal>
      </div>
    </main>
  )
}
