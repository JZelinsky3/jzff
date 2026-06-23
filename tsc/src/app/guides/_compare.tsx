// Reusable layout primitives for /guides/* comparison + feature pages.
// The original guides rendered as a vertical wall of H2 sections — fine for
// AI ingestion but tedious to read. These components break the same content
// into scannable surfaces: a verdict callout at the top, a decision matrix,
// tool cards in a grid, and pull-quote callouts between prose blocks.
//
// All components are server components (no client interactivity needed) so
// the structured-data JSON-LD on each page still picks up the rendered HTML
// for crawlers. Visible structure mirrors what the schema asserts.

import Link from "next/link"

// Verdict block at the top of the page — the "if you only read one thing"
// summary. Replaces the convention of opening with a bolded "Short answer:"
// paragraph by giving it real visual weight.
export function Verdict({ children }: { children: React.ReactNode }) {
  return (
    <aside className="g-verdict" role="note" aria-label="Quick verdict">
      <div className="g-verdict-label">★ The verdict</div>
      <div className="g-verdict-body">{children}</div>
    </aside>
  )
}

// Decision matrix — a tight table that answers "if you need X → use Y".
// Better than prose for the "which tool when" question because the eye
// scans rows in parallel rather than reading sequentially.
export function DecisionMatrix({
  rows,
}: {
  rows: { need: string; pick: string; href?: string; note?: string }[]
}) {
  return (
    <div className="g-matrix-wrap" role="region" aria-label="Decision matrix">
      <table className="g-matrix">
        <thead>
          <tr>
            <th>If you need</th>
            <th>Use</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.need}>
              <td>{r.need}</td>
              <td>
                {r.href ? (
                  <Link href={r.href} className="g-matrix-pick">{r.pick}</Link>
                ) : (
                  <span className="g-matrix-pick">{r.pick}</span>
                )}
              </td>
              <td className="g-matrix-note">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Section heading with a kicker + serif title. Replaces the bare <H2>
// component on rework pages so each major break has more visual weight
// than a single typographic line.
export function SectionHead({
  kicker,
  title,
  children,
}: {
  kicker: string
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="g-secthead">
      <div className="g-secthead-kicker">§ {kicker}</div>
      <h2 className="g-secthead-title">{title}</h2>
      {children && <p className="g-secthead-blurb">{children}</p>}
    </div>
  )
}

// Tool card — replaces a vertical H2 + paragraph per tool with a card grid.
// Used inside <ToolGrid> so multiple tools sit side by side, comparable at
// a glance. Each card has a name, a "best for" tag, a short pitch, and a
// link out (internal or external).
export function ToolGrid({ children }: { children: React.ReactNode }) {
  return <div className="g-tool-grid">{children}</div>
}

export function ToolCard({
  name,
  bestFor,
  pitch,
  href,
  external,
  highlight,
  pricing,
}: {
  name: string
  bestFor: string
  pitch: React.ReactNode
  href?: string
  external?: boolean
  highlight?: boolean
  pricing?: string
}) {
  const inner = (
    <>
      {highlight && <span className="g-tool-card-flag">★ Our pick</span>}
      <div className="g-tool-card-name">{name}</div>
      <div className="g-tool-card-bestfor">
        <span className="g-tool-card-bestfor-label">Best for</span>
        <span className="g-tool-card-bestfor-text">{bestFor}</span>
      </div>
      <div className="g-tool-card-pitch">{pitch}</div>
      {pricing && (
        <div className="g-tool-card-pricing">{pricing}</div>
      )}
      {href && (
        <span className="g-tool-card-cta">
          {external ? "Visit site" : "Read more"} <span aria-hidden>→</span>
        </span>
      )}
    </>
  )

  if (href && external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`g-tool-card ${highlight ? "g-tool-card-hl" : ""}`}
      >
        {inner}
      </a>
    )
  }
  if (href) {
    return (
      <Link href={href} className={`g-tool-card ${highlight ? "g-tool-card-hl" : ""}`}>
        {inner}
      </Link>
    )
  }
  return (
    <div className={`g-tool-card g-tool-card-static ${highlight ? "g-tool-card-hl" : ""}`}>
      {inner}
    </div>
  )
}

// Pull-quote callout for breaking up prose. Used for the one-line claim
// you want a reader to remember even if they skim everything else.
export function Pullquote({ children, attribution }: { children: React.ReactNode; attribution?: string }) {
  return (
    <figure className="g-pullquote">
      <blockquote>{children}</blockquote>
      {attribution && <figcaption>— {attribution}</figcaption>}
    </figure>
  )
}

// Two-up callout for "for X / for Y" framing — e.g. "for dynasty / for
// redraft", "for new leagues / for legacy leagues". Replaces a sequence
// of paragraphs that say "if you're X, do A. If you're Y, do B." with
// a parallel visual structure.
export function Split({
  left,
  right,
}: {
  left: { label: string; body: React.ReactNode }
  right: { label: string; body: React.ReactNode }
}) {
  return (
    <div className="g-split">
      <div className="g-split-col">
        <div className="g-split-label">{left.label}</div>
        <div className="g-split-body">{left.body}</div>
      </div>
      <div className="g-split-col">
        <div className="g-split-label">{right.label}</div>
        <div className="g-split-body">{right.body}</div>
      </div>
    </div>
  )
}

// Lightweight bulleted checklist with an accented marker. Used for
// "what to look for" lists — replaces a sequence of <P><strong>...</strong></P>
// blocks that read as wall-of-text.
export function Checklist({ items }: { items: { title: string; body: React.ReactNode }[] }) {
  return (
    <ul className="g-checklist">
      {items.map((it) => (
        <li key={it.title}>
          <span className="g-checklist-mark" aria-hidden>◆</span>
          <div>
            <div className="g-checklist-title">{it.title}</div>
            <div className="g-checklist-body">{it.body}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

// Short prose block — for the connective tissue between visual sections.
// Wraps a paragraph in slightly tighter typography than the body article
// default so it reads as commentary, not as a primary section.
export function Lede({ children }: { children: React.ReactNode }) {
  return <p className="g-lede">{children}</p>
}
