// The rotating designs for the stat cards (history and regret), each on its
// own stock. See content.ts for which week gets which.
//
//   bars      salmon   a bar per player, the leader in red
//   poster    night    one giant number, the rest in a strip underneath
//   columns   navy     the best game in this week of every season (history)
//   timeline  graph    the top 20 games plotted by season (history)
//   scatter   graph    leagues that dropped him against what he scored (regret)
//
// Satori rules: every div is flex, no text inside SVG (so labels are
// absolutely placed divs), helpers called as plain functions.

import type { Card, Dot, Drop, Row } from '@/lib/social/content'
import { GOLD, doubleRule, flag, type Stock } from './socialParts'

type HistoryCard = Extract<Card, { template: 'history' }>
type RegretCard = Extract<Card, { template: 'regret' }>
type StatCard = HistoryCard | RegretCard

/** The body's width inside the card's padding. */
const W = 936

function fmt1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1)
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${fmt1(n / 1_000_000)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  return n.toLocaleString('en-US')
}

function lastName(name: string): string {
  const parts = name.split(' ')
  return parts.length > 1 ? parts.slice(1).join(' ') : name
}

function head(s: Stock, card: StatCard, title: string, dek?: string) {
  const label = card.template === 'history' ? 'This week in fantasy history' : 'The Drop Regret Index'
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {flag(s, label, `Week ${card.week}`)}
      {doubleRule(s)}
      <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 72, lineHeight: 1.02, color: s.ink, marginTop: 34 }}>{title}</div>
      {dek ? (
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: 36, color: s.mute, marginTop: 12 }}>{dek}</div>
      ) : null}
    </div>
  )
}

function mono(s: Stock, text: string, opts: { size?: number; color?: string; bold?: boolean; spacing?: number } = {}) {
  return (
    <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: opts.bold ? 700 : 400, fontSize: opts.size ?? 22, letterSpacing: opts.spacing ?? 1, color: opts.color ?? s.mute }}>
      {text}
    </div>
  )
}

// ── Bars ─────────────────────────────────────────────────────────────────

export function barsCard(s: Stock, card: StatCard) {
  const items: { name: string; meta: string; pts: number }[] = card.template === 'history'
    ? (card.field?.length ? card.field.slice(0, 8).map((d) => ({ name: d.name, meta: `${d.pos} · ${d.year}`, pts: d.pts }))
      : [card.hero, ...card.rows].map((r) => ({ name: r.name, meta: r.meta, pts: Number(r.value) })))
    : card.rows.map((r) => ({ name: r.name, meta: [r.meta, r.note ? `${r.note} leagues` : ''].filter(Boolean).join('  ·  '), pts: Number(r.value) }))
  const max = Math.max(...items.map((i) => i.pts))
  const big = items.length <= 6
  const track = W - 130

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {card.template === 'history'
        ? head(s, card, `Top Week ${card.week} Games Ever`, `The best PPR games in Week ${card.week} since 2009.`)
        : head(s, card, 'You Let Them Go.', 'Most dropped on Sleeper, then what they scored.')}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: big ? 44 : 34, borderLeft: `3px solid ${s.ink}`, paddingLeft: 0 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', padding: big ? '14px 0' : '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', paddingLeft: 20 }}>
              <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: big ? 42 : 36, color: s.ink, lineHeight: 1 }}>{it.name}</div>
              <div style={{ display: 'flex', marginLeft: 16 }}>{mono(s, it.meta, { size: 20 })}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
              <div
                style={{
                  display: 'flex',
                  width: Math.max(8, Math.round((it.pts / max) * track)),
                  height: big ? 40 : 32,
                  background: i === 0 ? s.accent : s.ink,
                  borderRadius: '0 4px 4px 0',
                }}
              />
              <div style={{ display: 'flex', marginLeft: 14 }}>{mono(s, fmt1(it.pts), { size: big ? 34 : 30, bold: true, color: i === 0 ? s.accent : s.ink })}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 16 }}>
        {mono(s, card.template === 'history' ? 'PPR points. QB, RB, WR and TE.' : 'PPR points. Drops across all Sleeper leagues, Tuesday to Saturday.', { size: 20 })}
      </div>
    </div>
  )
}

// ── Poster ───────────────────────────────────────────────────────────────

/** "7 rec, 167 yds, 3 TD" as tiles; a "yds" after "rec" is receiving yards. */
function statTiles(line: string): { n: string; label: string }[] {
  const out: { n: string; label: string }[] = []
  for (const part of line.split(', ')) {
    const m = /^(\d+)\s+(.+)$/.exec(part)
    if (!m) continue
    const prev = out[out.length - 1]
    const label = m[2] === 'yds' && prev?.label === 'rec' ? 'rec yds' : m[2]
    out.push({ n: m[1], label })
  }
  return out.slice(0, 4)
}

function strip(s: Stock, rows: { name: string; meta: string; value: string }[], start: number) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', borderTop: `1px solid ${s.rule}`, padding: '13px 0' }}>
          <div style={{ display: 'flex', width: 56 }}>{mono(s, String(start + i), { size: 24, bold: true, color: s.accent })}</div>
          <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 36, color: s.ink, flex: 1 }}>{r.name}</div>
          <div style={{ display: 'flex', marginRight: 26 }}>{mono(s, r.meta, { size: 20 })}</div>
          {mono(s, r.value, { size: 30, bold: true, color: s.ink })}
        </div>
      ))}
    </div>
  )
}

export function posterCard(s: Stock, card: StatCard) {
  if (card.template === 'history') {
    const tiles = statTiles(card.hero.line)
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {flag(s, 'This week in fantasy history', `Week ${card.week}`)}
        {doubleRule(s)}
        <div style={{ display: 'flex', marginTop: 44 }}>{mono(s, `The best Week ${card.week} ever`.toUpperCase(), { size: 26, bold: true, color: GOLD, spacing: 5 })}</div>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 104, lineHeight: 1, color: s.ink, marginTop: 14 }}>{card.hero.name}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 4 }}>
          <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 300, lineHeight: 0.92, color: GOLD, letterSpacing: -6 }}>{card.hero.value}</div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 26, marginBottom: 40 }}>
            {mono(s, 'PPR', { size: 30, bold: true, color: s.ink, spacing: 4 })}
            {mono(s, 'POINTS', { size: 30, bold: true, color: s.ink, spacing: 4 })}
            <div style={{ display: 'flex', marginTop: 10 }}>{mono(s, card.hero.meta.toUpperCase(), { size: 22, spacing: 3 })}</div>
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 26, marginBottom: 40 }}>
          {tiles.map((t, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', flex: 1, borderLeft: `3px solid ${i === 0 ? s.accent : s.rule}`, paddingLeft: 18 }}>
              <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 64, lineHeight: 1, color: s.ink }}>{t.n}</div>
              <div style={{ display: 'flex', marginTop: 6 }}>{mono(s, t.label.toUpperCase(), { size: 20, spacing: 3 })}</div>
            </div>
          ))}
        </div>
        {mono(s, 'THE REST OF THE TOP SIX', { size: 20, bold: true, spacing: 4 })}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 12 }}>{strip(s, card.rows, 2)}</div>
      </div>
    )
  }

  const top = card.rows[0]
  const drops = card.field?.find((d) => d.name === top.name)?.drops
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {flag(s, 'The Drop Regret Index', `Week ${card.week}`)}
      {doubleRule(s)}
      <div style={{ display: 'flex', marginTop: 44 }}>{mono(s, 'YOU LET HIM GO', { size: 26, bold: true, color: GOLD, spacing: 5 })}</div>
      <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 104, lineHeight: 1, color: s.ink, marginTop: 14 }}>{top.name}</div>
      <div style={{ display: 'flex', marginTop: 12 }}>{mono(s, top.meta.toUpperCase(), { size: 24, spacing: 3 })}</div>
      <div style={{ display: 'flex', marginTop: 40, marginBottom: 44 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderLeft: `3px solid ${s.rule}`, paddingLeft: 22 }}>
          {mono(s, 'DROPPED IN', { size: 22, bold: true, spacing: 4 })}
          <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 150, lineHeight: 1, color: s.ink, marginTop: 6 }}>{drops ? compact(drops) : (top.note ?? '').replace('dropped ', '')}</div>
          {mono(s, 'SLEEPER LEAGUES', { size: 22, spacing: 4 })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderLeft: `3px solid ${s.accent}`, paddingLeft: 22 }}>
          {mono(s, 'THEN SCORED', { size: 22, bold: true, spacing: 4 })}
          <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 150, lineHeight: 1, color: GOLD, marginTop: 6 }}>{top.value}</div>
          {mono(s, 'PPR POINTS', { size: 22, spacing: 4 })}
        </div>
      </div>
      {mono(s, 'ALSO DROPPED, ALSO SCORED', { size: 20, bold: true, spacing: 4 })}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 12 }}>
        {strip(s, card.rows.slice(1).map((r: Row) => ({ name: r.name, meta: `${r.meta}  ·  ${(r.note ?? '').replace('dropped ', '')} drops`, value: r.value })), 2)}
      </div>
    </div>
  )
}

// ── Plot frame shared by the three charts ────────────────────────────────

type Tick = { at: number; label: string }

/**
 * A plot area `w` x `h` with horizontal gridlines at `yTicks` (values mapped
 * by `y`), labels down the left gutter, and children placed absolutely
 * inside. Returns the frame; the caller maps data with the same `y`.
 */
function plot(s: Stock, opts: { w: number; h: number; gutter: number; yTicks: Tick[]; y: (v: number) => number; xTicks?: { x: number; label: string }[]; xLabel?: string; yLabel?: string; children: React.ReactNode }) {
  const { w, h, gutter } = opts
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {opts.yLabel ? <div style={{ display: 'flex', marginBottom: 14 }}>{mono(s, opts.yLabel, { size: 18, bold: true, spacing: 3 })}</div> : null}
      <div style={{ display: 'flex', position: 'relative', width: w, height: h }}>
        {opts.yTicks.map((t) => (
          <div key={`g${t.at}`} style={{ display: 'flex', position: 'absolute', left: gutter, top: opts.y(t.at), width: w - gutter, height: t.at === opts.yTicks[0].at ? 2 : 1, background: t.at === opts.yTicks[0].at ? s.ink : s.grid }} />
        ))}
        {opts.yTicks.map((t) => (
          <div key={`t${t.at}`} style={{ display: 'flex', position: 'absolute', left: 0, top: opts.y(t.at) - 13, width: gutter - 14, justifyContent: 'flex-end', fontFamily: 'JetBrains', fontSize: 18, color: s.mute }}>
            {t.label}
          </div>
        ))}
        {opts.children}
      </div>
      {opts.xTicks ? (
        <div style={{ display: 'flex', position: 'relative', width: w, height: 30, marginTop: 10 }}>
          {opts.xTicks.map((t, i) => (
            <div key={i} style={{ display: 'flex', position: 'absolute', left: t.x - 30, top: 0, width: 60, justifyContent: 'center', fontFamily: 'JetBrains', fontSize: 18, color: s.mute }}>
              {t.label}
            </div>
          ))}
        </div>
      ) : null}
      {opts.xLabel ? <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>{mono(s, opts.xLabel, { size: 18, bold: true, spacing: 3 })}</div> : null}
    </div>
  )
}

function ticks(lo: number, hi: number, step: number, fmt: (v: number) => string = String): Tick[] {
  const out: Tick[] = []
  for (let v = lo; v <= hi + 1e-9; v += step) out.push({ at: v, label: fmt(v) })
  return out
}

function stat(s: Stock, label: string, big: string, sub: string, accent?: boolean) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderLeft: `3px solid ${accent ? s.accent : s.rule}`, paddingLeft: 18, marginRight: 18 }}>
      {mono(s, label, { size: 18, bold: true, spacing: 3 })}
      <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 56, lineHeight: 1.05, color: accent ? s.accent : s.ink, marginTop: 6 }}>{big}</div>
      <div style={{ display: 'flex', marginTop: 4 }}>{mono(s, sub, { size: 20 })}</div>
    </div>
  )
}

/**
 * Places a label beside each dot: right if it is clear, else left, else
 * nudged up or down until it clears. Clear means off every other label and
 * every dot. Label boxes are `h` tall and centred on their dot.
 */
function placeLabels(
  labels: { cx: number; cy: number; w: number; r: number }[],
  dots: { x: number; y: number; r: number }[],
  limit: number,
  h = 30,
): { x: number; y: number; left: boolean }[] {
  const boxes: { x: number; y: number; w: number }[] = []
  const hits = (x: number, y: number, w: number) =>
    x < 0 || x + w > limit ||
    boxes.some((b) => x < b.x + b.w && b.x < x + w && y < b.y + h && b.y < y + h) ||
    dots.some((d) => d.x + d.r > x && d.x - d.r < x + w && d.y + d.r > y && d.y - d.r < y + h)
  return labels.map((l) => {
    for (let dy = 0; dy <= 90; dy += 6) {
      for (const sign of dy ? [1, -1] : [1]) {
        const y = l.cy - h / 2 + dy * sign
        const spots: [number, boolean][] = [[l.cx + l.r + 10, false], [l.cx - l.r - 10 - l.w, true]]
        for (const [x, left] of spots) {
          if (!hits(x, y, l.w)) { boxes.push({ x, y, w: l.w }); return { x, y, left } }
        }
      }
    }
    const x = l.cx + l.r + 10
    boxes.push({ x, y: l.cy - h / 2, w: l.w })
    return { x, y: l.cy - h / 2, left: false }
  })
}

// ── Columns: the best game in this week of every season ──────────────────

export function columnsCard(s: Stock, card: HistoryCard) {
  const seasons = card.seasons ?? []
  const max = Math.max(...seasons.map((d) => d.pts))
  const top = Math.ceil(max / 10) * 10
  const gutter = 56
  const h = 560
  const pad = 40 // headroom above the tallest column for its label
  const y = (v: number) => pad + (h - pad) * (1 - v / top)
  const n = seasons.length
  const gap = 8
  const colW = Math.floor((W - gutter - gap * (n - 1)) / n)
  const x = (i: number) => gutter + i * (colW + gap)
  const best = seasons.reduce((a, b) => (b.pts > a.pts ? b : a), seasons[0])
  const bestI = seasons.indexOf(best)
  const last = seasons[n - 1]
  const avg = seasons.reduce((t, d) => t + d.pts, 0) / n
  const calloutW = 330
  const calloutX = Math.min(Math.max(x(bestI) + colW / 2 - calloutW / 2, gutter), W - calloutW)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {head(s, card, `Week ${card.week}'s Best, Every Year`, `The top PPR game in Week ${card.week} of every season since ${seasons[0]?.year ?? 2009}.`)}
      <div style={{ display: 'flex', marginTop: 46 }}>
        {plot(s, {
          w: W, h, gutter, y,
          yTicks: ticks(0, top, 10),
          xTicks: seasons.map((d, i) => ({ x: x(i) + colW / 2, label: `'${String(d.year).slice(2)}` })),
          children: [
            ...seasons.map((d, i) => (
              <div key={`c${i}`} style={{ display: 'flex', position: 'absolute', left: x(i), top: y(d.pts), width: colW, height: y(0) - y(d.pts), background: i === bestI ? s.accent : '#4d6190', borderRadius: '4px 4px 0 0' }} />
            )),
            ...seasons.map((d, i) => (
              <div key={`v${i}`} style={{ display: 'flex', position: 'absolute', left: x(i) - 10, top: y(d.pts) - 28, width: colW + 20, justifyContent: 'center', fontFamily: 'JetBrains', fontWeight: i === bestI ? 700 : 400, fontSize: 16, color: i === bestI ? s.accent : s.mute }}>
                {i === bestI ? '' : String(Math.round(d.pts))}
              </div>
            )),
            <div key="callout" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: calloutX, top: y(best.pts) - 30, width: calloutW }}>
              <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: 700, fontSize: 24, color: s.accent }}>{`${fmt1(best.pts)} · ${best.name}`}</div>
            </div>,
          ],
        })}
      </div>
      <div style={{ display: 'flex', marginTop: 44 }}>
        {stat(s, 'THE RECORD', fmt1(best.pts), `${best.name}, ${best.year}`, true)}
        {stat(s, 'LAST SEASON', fmt1(last.pts), last.name)}
        {stat(s, 'AVERAGE BEST', fmt1(avg), `over ${n} seasons`)}
      </div>
    </div>
  )
}

// ── Timeline: the top 20 games ever, by season ───────────────────────────

const POS_ORDER = ['QB', 'RB', 'WR', 'TE']

export function timelineCard(s: Stock, card: HistoryCard) {
  const field: Dot[] = card.field ?? []
  const years = field.map((d) => d.year)
  const first = 2009
  const lastYear = Math.max(...years, first + 1)
  const lo = Math.floor(Math.min(...field.map((d) => d.pts)) / 5) * 5
  const hi = Math.ceil(Math.max(...field.map((d) => d.pts)) / 5) * 5
  const gutter = 56
  const h = 560
  const pad = 30
  const inner = W - gutter - 40
  const x = (yr: number) => gutter + 20 + ((yr - first) / (lastYear - first)) * inner
  const y = (v: number) => pad + (h - pad * 2) * (1 - (v - lo) / (hi - lo))
  const R = 13

  const dotR = (d: Dot) => (d === field[0] ? R + 4 : R) + 2
  const labelled = field.slice(0, 3).map((d) => ({ d, text: `${d.name}  ${fmt1(d.pts)}`, w: `${d.name}  ${fmt1(d.pts)}`.length * 13.5 + 6 }))
  const spots = placeLabels(
    labelled.map((l) => ({ cx: x(l.d.year), cy: y(l.d.pts), w: l.w, r: dotR(l.d) })),
    field.map((d) => ({ x: x(d.year), y: y(d.pts), r: dotR(d) })),
    W,
  )

  const byPos = POS_ORDER.map((p) => ({ p, n: field.filter((d) => d.pos === p).length }))
  const perYear = new Map<number, number>()
  for (const d of field) perYear.set(d.year, (perYear.get(d.year) ?? 0) + 1)
  const [busyYear, busyN] = [...perYear.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [0, 0]
  const xYears = Array.from({ length: Math.floor((lastYear - first) / 2) + 1 }, (_, i) => first + i * 2)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {head(s, card, `The ${field.length} Best Week ${card.week} Games`, 'Every one since 2009, by the season it came in.')}
      <div style={{ display: 'flex', marginTop: 40 }}>
        {plot(s, {
          w: W, h, gutter, y,
          yLabel: 'PPR POINTS',
          yTicks: ticks(lo, hi, 5),
          xTicks: xYears.map((yr) => ({ x: x(yr), label: String(yr) })),
          children: [
            ...field.slice().reverse().map((d, i) => {
              const lead = d === field[0]
              const r = lead ? R + 4 : R
              return (
                <div key={`d${i}`} style={{ display: 'flex', position: 'absolute', left: x(d.year) - r - 2, top: y(d.pts) - r - 2, width: (r + 2) * 2, height: (r + 2) * 2, borderRadius: r + 2, background: lead ? s.accent : s.ink, border: `2px solid ${s.bg}` }} />
              )
            }),
            ...labelled.map((l, i) => (
              <div key={`l${i}`} style={{ display: 'flex', position: 'absolute', left: spots[i].x, top: spots[i].y, width: l.w, height: 30, alignItems: 'center', justifyContent: spots[i].left ? 'flex-end' : 'flex-start', fontFamily: 'JetBrains', fontWeight: 700, fontSize: 22, color: i === 0 ? s.accent : s.ink }}>
                {l.text}
              </div>
            )),
          ],
        })}
      </div>
      <div style={{ display: 'flex', marginTop: 36 }}>
        {byPos.map((b) => (
          <div key={b.p} style={{ display: 'flex', flexDirection: 'column', flex: 1, borderLeft: `3px solid ${s.rule}`, paddingLeft: 18 }}>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 64, lineHeight: 1, color: s.ink }}>{String(b.n)}</div>
            <div style={{ display: 'flex', marginTop: 4 }}>{mono(s, b.p, { size: 22, bold: true, spacing: 3 })}</div>
          </div>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 2, borderLeft: `3px solid ${s.accent}`, paddingLeft: 18 }}>
          <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 64, lineHeight: 1, color: s.accent }}>{String(busyYear)}</div>
          <div style={{ display: 'flex', marginTop: 4 }}>{mono(s, `${busyN} OF THE ${field.length}`, { size: 22, bold: true, spacing: 3 })}</div>
        </div>
      </div>
    </div>
  )
}

// ── Scatter: leagues that dropped him against what he scored ─────────────

export function scatterCard(s: Stock, card: RegretCard) {
  const field: Drop[] = card.field ?? []
  const maxDrops = Math.max(...field.map((d) => d.drops))
  const step = maxDrops > 400_000 ? 100_000 : maxDrops > 150_000 ? 50_000 : maxDrops > 60_000 ? 20_000 : 10_000
  const xHi = Math.ceil(maxDrops / step) * step
  const yHi = Math.ceil(Math.max(...field.map((d) => d.pts)) / 5) * 5
  const gutter = 56
  const h = 540
  const pad = 20
  const right = 20
  const x = (v: number) => gutter + 16 + (v / xHi) * (W - gutter - 16 - right)
  const y = (v: number) => pad + (h - pad) * (1 - v / yHi)
  const R = 13

  const dotR = (d: Drop) => (d === field[0] ? R + 4 : R) + 2
  const labelled = field.slice(0, 5).map((d, i) => ({ i, text: lastName(d.name), w: lastName(d.name).length * 15 + 6 }))
  const spots = placeLabels(
    labelled.map((l) => ({ cx: x(field[l.i].drops), cy: y(field[l.i].pts), w: l.w, r: dotR(field[l.i]) })),
    field.map((d) => ({ x: x(d.drops), y: y(d.pts), r: dotR(d) })),
    W,
    32,
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {head(s, card, 'Dropped, Then Scored.', 'Each dot is a most-dropped player on Sleeper.')}
      <div style={{ display: 'flex', marginTop: 40 }}>
        {plot(s, {
          w: W, h, gutter, y,
          yLabel: 'PPR POINTS THE NEXT WEEK',
          xLabel: 'SLEEPER LEAGUES THAT DROPPED HIM',
          yTicks: ticks(0, yHi, 5),
          xTicks: ticks(0, xHi, step).map((t) => ({ x: x(t.at), label: t.at ? compact(t.at) : '0' })),
          children: [
            // The corner that hurts: dropped the most, scored the most.
            <div key="q" style={{ display: 'flex', position: 'absolute', left: x(xHi / 2), top: y(yHi), width: x(xHi) - x(xHi / 2), height: y(yHi / 2) - y(yHi), background: s.accent, opacity: 0.08 }} />,
            <div key="ql" style={{ display: 'flex', position: 'absolute', left: x(xHi) - 260, top: y(yHi) + 10, width: 250, justifyContent: 'flex-end', fontFamily: 'JetBrains', fontWeight: 700, fontSize: 18, letterSpacing: 3, color: s.accent }}>
              MOST REGRET
            </div>,
            ...field.slice().reverse().map((d, i) => {
              const lead = d === field[0]
              const r = lead ? R + 4 : R
              return (
                <div key={`d${i}`} style={{ display: 'flex', position: 'absolute', left: x(d.drops) - r - 2, top: y(d.pts) - r - 2, width: (r + 2) * 2, height: (r + 2) * 2, borderRadius: r + 2, background: lead ? s.accent : s.ink, border: `2px solid ${s.bg}` }} />
              )
            }),
            ...labelled.map((l, k) => (
              <div key={`l${k}`} style={{ display: 'flex', position: 'absolute', left: spots[k].x, top: spots[k].y, width: l.w, height: 32, alignItems: 'center', justifyContent: spots[k].left ? 'flex-end' : 'flex-start', fontFamily: 'DMSerif', fontSize: 28, color: l.i === 0 ? s.accent : s.ink }}>
                {l.text}
              </div>
            )),
          ],
        })}
      </div>
      <div style={{ display: 'flex', marginTop: 30 }}>
        {field.slice(0, 3).map((d, i) => stat(s, i === 0 ? 'MOST POINTS' : `NO. ${i + 1}`, lastName(d.name), `${fmt1(d.pts)} pts · ${compact(d.drops)} drops`, i === 0))}
      </div>
    </div>
  )
}
