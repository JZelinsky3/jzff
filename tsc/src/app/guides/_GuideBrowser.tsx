"use client"

// Client-side search + grouped browse for the /guides/ index. Renders the
// search bar at the top and two modes underneath:
//   - empty query: the original grouped-by-section card grid
//   - query present: a flat ranked list of matches with snippets
//
// Search is a simple in-memory scan — title + tagline + snippet + curated
// search terms. With 15 guides total there is no need for an index, a
// worker, or a fuzzy library; substring matching across the corpus runs in
// well under a millisecond on any device. Multi-word queries match all
// tokens (AND), not any (OR), so typing "espn private" narrows to the
// guides that handle both terms instead of widening to everything ESPN.

import Link from "next/link"
import { useMemo, useState } from "react"
import { ALL_GUIDES, SECTIONS, type Guide } from "./_data"

type Ranked = Guide & { sectionKicker: string; score: number; matchedFields: string[] }

// Scoring weights — title hits matter most because that's what a reader is
// typing the noun of, snippet matches less so. Search-term hits are bonus
// signal because we curated them; they should bump a guide up without
// dominating natural-language matches.
const W = { title: 8, tagline: 4, snippet: 2, terms: 3 }

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
}

function scoreGuide(g: Guide & { sectionKicker: string }, tokens: string[]): Ranked | null {
  const haystacks = {
    title: g.title.toLowerCase(),
    tagline: g.tagline.toLowerCase(),
    snippet: g.snippet.toLowerCase(),
    terms: g.searchTerms.join(" ").toLowerCase(),
  }

  let total = 0
  const matchedFields = new Set<string>()

  for (const token of tokens) {
    let tokenHit = false
    for (const [field, weight] of [
      ["title", W.title],
      ["tagline", W.tagline],
      ["snippet", W.snippet],
      ["terms", W.terms],
    ] as const) {
      if (haystacks[field].includes(token)) {
        total += weight
        matchedFields.add(field)
        tokenHit = true
      }
    }
    // AND semantics — if any token doesn't hit anywhere, the guide is out.
    // Prevents single-word matches on a multi-word query.
    if (!tokenHit) return null
  }

  return { ...g, score: total, matchedFields: [...matchedFields] }
}

// Highlight matched tokens in the visible snippet by wrapping them in
// <mark>. Operates on the original-cased text so the highlight respects
// the snippet's typography. Tokens are matched case-insensitively.
function highlight(text: string, tokens: string[]): React.ReactNode {
  if (tokens.length === 0) return text
  // Build a single regex with all tokens, escaped, joined with |.
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const re = new RegExp(`(${escaped.join("|")})`, "gi")
  const parts = text.split(re)
  return parts.map((part, i) =>
    re.test(part) ? <mark key={i} className="g-search-mark">{part}</mark> : <span key={i}>{part}</span>,
  )
}

export function GuideBrowser() {
  const [query, setQuery] = useState("")
  const tokens = useMemo(() => tokenize(query), [query])
  const hasQuery = tokens.length > 0

  const results = useMemo(() => {
    if (!hasQuery) return []
    return ALL_GUIDES
      .map((g) => scoreGuide(g, tokens))
      .filter((r): r is Ranked => r !== null)
      .sort((a, b) => b.score - a.score)
  }, [tokens, hasQuery])

  return (
    <>
      <div className="section" style={{ maxWidth: "1080px", margin: "0 auto", paddingTop: 0, paddingBottom: 0 }}>
        <div className="g-search">
          <label htmlFor="guide-search" className="g-search-label">
            Search the guides
          </label>
          <div className="g-search-wrap">
            <svg className="g-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              id="guide-search"
              type="search"
              className="g-search-input"
              placeholder="Search by problem, tool, or platform"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                className="g-search-clear"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                ×
              </button>
            )}
          </div>
          {hasQuery && (
            <div className="g-search-meta">
              {results.length === 0
                ? `No guides match "${query}"`
                : `${results.length} ${results.length === 1 ? "guide" : "guides"} match "${query}"`}
            </div>
          )}
        </div>
      </div>

      {hasQuery ? (
        <div className="section" id="guides-results" style={{ maxWidth: "1080px", margin: "0 auto" }}>
          {results.length > 0 ? (
            <div className="g-search-results">
              {results.map((r) => (
                <Link key={r.slug} href={`/guides/${r.slug}/`} className="g-search-result">
                  <div className="g-search-result-meta">
                    {r.chip && <span className="g-search-result-chip">{r.chip}</span>}
                    <span className="g-search-result-section">§ {r.sectionKicker}</span>
                  </div>
                  <div className="g-search-result-title">{highlight(r.title, tokens)}</div>
                  <div className="g-search-result-snippet">{highlight(r.snippet, tokens)}</div>
                  <span className="g-search-result-cta">
                    Read <span aria-hidden>→</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="g-search-empty">
              <div className="g-search-empty-title">No matches.</div>
              <p>
                Try a broader term like &quot;espn&quot;, &quot;trade&quot;, or &quot;recap&quot;, or browse the categories below.
              </p>
              <button type="button" className="dc-btn-ghost" onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* In-page TOC + grouped grid — the default browse view. Same
              markup as the previous implementation; rendered inside this
              client component so the search bar can swap it cleanly when
              the query changes. */}
          <div className="section" style={{ maxWidth: "1080px", margin: "0 auto", paddingTop: ".5rem" }}>
            <nav aria-label="Guide categories" className="guides-toc">
              {SECTIONS.map((s) => (
                <a key={s.kicker} href={`#${slugify(s.kicker)}`} className="guides-toc-link">
                  <span className="guides-toc-num">·</span>
                  <span className="guides-toc-label">{s.kicker}</span>
                  <span className="guides-toc-count">{s.guides.length}</span>
                </a>
              ))}
            </nav>
          </div>

          {SECTIONS.map((s, si) => (
            <div
              key={s.kicker}
              className="section guides-section"
              id={slugify(s.kicker)}
              style={{ maxWidth: "1080px", margin: "0 auto" }}
            >
              {si > 0 && <div className="guides-orn" aria-hidden>✦ ✦ ✦</div>}
              <div className="guides-sec-head">
                <span className="guides-sec-icon" aria-hidden>
                  <SectionGlyph kicker={s.kicker} />
                </span>
                <div className="section-header" style={{ flex: 1 }}>
                  <span className="section-num">§ {s.kicker}</span>
                  <span className="section-title">{s.title}</span>
                  <span className="section-meta">{s.titleEm}</span>
                </div>
              </div>
              <p className="guides-section-blurb">{s.blurb}</p>
              <div className="guides-card-grid">
                {s.guides.map((g, gi) => (
                  <Link key={g.slug} href={`/guides/${g.slug}/`} className="guide-card">
                    <span className="guide-card-ch" aria-hidden>
                      Ch. {String(gi + 1).padStart(2, "0")}
                    </span>
                    {g.chip && <span className="guide-card-chip">{g.chip}</span>}
                    <div className="guide-card-title">{g.title}</div>
                    <div className="guide-card-desc">{g.tagline}</div>
                    <span className="guide-card-cta">
                      Read <span className="guide-card-arrow" aria-hidden>→</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  )
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

// Stroke glyph for each shelf, keyed off the section kicker: scales for
// buyer's guides, a loupe for deep-dives, a chain for platform how-tos,
// and a pen nib for the editorial shelf.
function SectionGlyph({ kicker }: { kicker: string }) {
  const k = kicker.toLowerCase()
  const common = {
    viewBox: "0 0 32 32",
    width: 26,
    height: 26,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  }
  if (k.includes("buyer")) {
    return (
      <svg {...common}>
        <path d="M16 6v20M10 26h12" />
        <path d="M16 8l-8 2M16 8l8-2" />
        <path d="M8 10l-3.5 8a4.5 3.5 0 0 0 7 0L8 10zM24 6l-3.5 8a4.5 3.5 0 0 0 7 0L24 6z" />
      </svg>
    )
  }
  if (k.includes("deep")) {
    return (
      <svg {...common}>
        <circle cx="14" cy="14" r="8" />
        <path d="M20 20l7 7" />
        <path d="M10.5 13.5a4 4 0 0 1 3-3" />
      </svg>
    )
  }
  if (k.includes("platform")) {
    return (
      <svg {...common}>
        <path d="M13 19l6-6" />
        <path d="M15.5 21.5l-2.4 2.4a4.2 4.2 0 0 1-6-6l2.4-2.4" />
        <path d="M16.5 10.5l2.4-2.4a4.2 4.2 0 0 1 6 6l-2.4 2.4" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M6 26c8-1 14-7 17-16l3-4-4 3C13 12 7 18 6 26z" />
      <path d="M6 26l7-7" />
      <circle cx="14.5" cy="17.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}
