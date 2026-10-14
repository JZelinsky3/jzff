// Copied from the Milk Cup cover (~/Desktop/pams 2026 season/milk cup/
// _source) for the League Cup launch post (cup.html). opts.monogram puts
// initials in the cartouche; without it the cartouche carries a star.
//
// Draws the Milk Cup trophy into an <svg> (viewBox 0 0 400 560): a lidded
// championship cup in polished brass on a two-tier plinth. Every turned
// part is a body of revolution, so each is built from its right-hand
// profile and mirrored, and shaded with a horizontal metal gradient (dark
// edges, a bright highlight left of centre, reflected light at the right).
function drawTrophy(svg, opts) {
  const o = Object.assign({ plate: '2026', ink: '#3b2a0c', wood: '#0f2e24', wood2: '#1d4436', paper: '#f3ecda' }, opts || {})
  const ns = 'http://www.w3.org/2000/svg'
  const CX = 200
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(ns, tag)
    for (const k in attrs) e.setAttribute(k, attrs[k])
    ;(parent || svg).appendChild(e)
    return e
  }

  // ── Paints ──
  const defs = el('defs', {})
  const metal = (id, stops) => {
    const g = el('linearGradient', { id, x1: '0', x2: '1', y1: '0', y2: '0' }, defs)
    for (const [off, color] of stops) el('stop', { offset: off, 'stop-color': color }, g)
  }
  metal('brass', [
    [0, '#5c4114'], [0.08, '#8a6427'], [0.2, '#c9a35a'], [0.3, '#f4e1a6'], [0.36, '#e2c27a'],
    [0.5, '#b88f42'], [0.68, '#94692a'], [0.84, '#6e4d1a'], [0.92, '#a98140'], [1, '#5a3f12'],
  ])
  metal('brassSoft', [
    [0, '#6e4f1c'], [0.2, '#b48c45'], [0.32, '#ead193'], [0.5, '#c39b50'], [0.8, '#8a6427'], [0.93, '#b38b47'], [1, '#664817'],
  ])
  metal('wood', [[0, '#081c15'], [0.3, o.wood2], [0.45, '#245443'], [0.7, o.wood], [1, '#06150f']])
  const vshade = el('linearGradient', { id: 'vshade', x1: '0', x2: '0', y1: '0', y2: '1' }, defs)
  el('stop', { offset: 0, 'stop-color': '#fff6d8', 'stop-opacity': 0.18 }, vshade)
  el('stop', { offset: 0.45, 'stop-color': '#000', 'stop-opacity': 0 }, vshade)
  el('stop', { offset: 1, 'stop-color': '#2a1a04', 'stop-opacity': 0.45 }, vshade)
  const blur = el('filter', { id: 'soft', x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs)
  el('feGaussianBlur', { stdDeviation: '1.6' }, blur)
  const shadow = el('filter', { id: 'shadow', x: '-30%', y: '-80%', width: '160%', height: '260%' }, defs)
  el('feGaussianBlur', { stdDeviation: '9' }, shadow)

  // ── Geometry helpers ──
  // A smooth curve through points (Catmull-Rom as cubic Béziers).
  const smooth = (pts) => {
    let d = ''
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2] || p2
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
      d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
    }
    return d
  }
  // A turned part from its right-hand profile [[halfWidth, y], ...], top to
  // bottom: down the right side, straight across, back up the left.
  const turned = (profile) => {
    const right = profile.map(([w, y]) => [CX + w, y])
    const left = [...profile].reverse().map(([w, y]) => [CX - w, y])
    return `M${CX} ${profile[0][1]} L${right[0][0]} ${right[0][1]}` + smooth(right) + ` L${left[0][0]} ${left[0][1]}` + smooth(left) + ' Z'
  }
  const part = (d, fill, extra) => el('path', Object.assign({ d, fill, stroke: o.ink, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, extra || {}))
  const band = (y, h, w, fill) => {
    el('rect', { x: CX - w, y, width: w * 2, height: h, rx: Math.min(h / 2, 3), fill: fill || 'url(#brass)', stroke: o.ink, 'stroke-width': 1.3 })
  }

  // ── Shadow on the paper ──
  el('ellipse', { cx: CX, cy: 516, rx: 150, ry: 14, fill: '#3b2a10', opacity: 0.28, filter: 'url(#shadow)' })

  // ── Plinth: two tiers of dark wood, brass trim, an engraved plate ──
  el('rect', { x: CX - 136, y: 464, width: 272, height: 48, rx: 3, fill: 'url(#wood)', stroke: '#04110c', 'stroke-width': 1.4 })
  el('rect', { x: CX - 136, y: 464, width: 272, height: 3, fill: '#c9a35a', opacity: 0.85 })
  el('rect', { x: CX - 118, y: 430, width: 236, height: 36, rx: 2, fill: 'url(#wood)', stroke: '#04110c', 'stroke-width': 1.4 })
  el('rect', { x: CX - 118, y: 430, width: 236, height: 2.5, fill: '#c9a35a', opacity: 0.85 })
  // The plate: brass, bevelled, with the year and a line left for the name.
  el('rect', { x: CX - 70, y: 474, width: 140, height: 30, rx: 2, fill: 'url(#brassSoft)', stroke: o.ink, 'stroke-width': 1.2 })
  el('rect', { x: CX - 66, y: 477, width: 132, height: 24, rx: 1.5, fill: 'none', stroke: '#fff2c6', 'stroke-opacity': 0.45, 'stroke-width': 0.8 })
  const plate = el('text', { x: CX, y: 489.5, 'text-anchor': 'middle', 'font-family': 'JBM', 'font-weight': 700, 'font-size': 9.5, 'letter-spacing': 2.2, fill: '#3b2a0c' })
  plate.textContent = o.plate
  el('line', { x1: CX - 40, x2: CX + 40, y1: 497, y2: 497, stroke: '#3b2a0c', 'stroke-width': 0.8, 'stroke-dasharray': '2 2.4', opacity: 0.7 })

  // ── Foot: a flared trumpet on a stepped rim ──
  band(418, 12, 86)
  part(turned([[12, 340], [16, 356], [30, 380], [58, 400], [80, 412], [82, 418]]), 'url(#brass)')
  band(404, 6, 70, 'url(#brassSoft)')

  // ── Stem and knop ──
  part(turned([[12, 316], [11, 330], [12, 342]]), 'url(#brass)')
  el('ellipse', { cx: CX, cy: 310, rx: 27, ry: 13, fill: 'url(#brass)', stroke: o.ink, 'stroke-width': 1.4 })
  el('ellipse', { cx: CX, cy: 306, rx: 18, ry: 4, fill: '#fff4cf', opacity: 0.35, filter: 'url(#soft)' })
  part(turned([[24, 280], [18, 290], [14, 298]]), 'url(#brass)')

  // ── Handles: scrolled ears from the lip to the lower bowl ──
  const handle = (sx) => {
    const g = el('g', { transform: sx < 0 ? `translate(${CX * 2} 0) scale(-1 1)` : '' })
    const d = `M${CX + 96} 132 C${CX + 150} 118 ${CX + 176} 150 ${CX + 160} 188 C${CX + 148} 216 ${CX + 112} 226 ${CX + 82} 238`
    el('path', { d, fill: 'none', stroke: o.ink, 'stroke-width': 17, 'stroke-linecap': 'round' }, g)
    el('path', { d, fill: 'none', stroke: 'url(#brassSoft)', 'stroke-width': 13.5, 'stroke-linecap': 'round' }, g)
    el('path', { d: `M${CX + 104} 127 C${CX + 148} 118 ${CX + 168} 146 ${CX + 157} 180`, fill: 'none', stroke: '#fff3c8', 'stroke-width': 2.4, 'stroke-linecap': 'round', opacity: 0.75 }, g)
    // The scroll where it meets the lip.
    el('circle', { cx: CX + 160, cy: 152, r: 9, fill: 'url(#brassSoft)', stroke: o.ink, 'stroke-width': 1.3 }, g)
    el('circle', { cx: CX + 160, cy: 152, r: 3.6, fill: '#6e4d1a' }, g)
    el('path', { d: `M${CX + 86} 241 q -8 6 -18 4`, fill: 'none', stroke: o.ink, 'stroke-width': 1.3 }, g)
  }
  handle(1)
  handle(-1)

  // ── The bowl: a tulip urn, shaded, with a beaded band and a cartouche ──
  const bowlD = turned([[96, 120], [100, 150], [98, 186], [86, 226], [62, 258], [38, 274], [26, 282]])
  part(bowlD, 'url(#brass)')
  const clip = el('clipPath', { id: 'bowlClip' }, defs)
  el('path', { d: bowlD }, clip)
  const over = el('g', { 'clip-path': 'url(#bowlClip)' })
  el('rect', { x: CX - 110, y: 118, width: 220, height: 170, fill: 'url(#vshade)' }, over)
  // A long specular streak and a softer one beside it.
  el('path', { d: `M${CX - 48} 132 C${CX - 52} 176 ${CX - 44} 220 ${CX - 22} 262`, fill: 'none', stroke: '#fffaf0', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.55, filter: 'url(#soft)' }, over)
  el('path', { d: `M${CX - 30} 134 C${CX - 32} 170 ${CX - 28} 206 ${CX - 14} 240`, fill: 'none', stroke: '#fffaf0', 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: 0.4 }, over)
  // Engraved band with beads.
  el('rect', { x: CX - 110, y: 146, width: 220, height: 12, fill: '#000', opacity: 0.12 }, over)
  el('line', { x1: CX - 110, x2: CX + 110, y1: 146, y2: 146, stroke: o.ink, 'stroke-width': 1, opacity: 0.6 }, over)
  el('line', { x1: CX - 110, x2: CX + 110, y1: 158, y2: 158, stroke: o.ink, 'stroke-width': 1, opacity: 0.6 }, over)
  for (let x = -96; x <= 96; x += 8) {
    el('circle', { cx: CX + x, cy: 152, r: 2.1, fill: '#f6e3a8', stroke: o.ink, 'stroke-width': 0.6, opacity: 0.9 }, over)
  }
  // Cartouche: an engraved oval with the league's initials.
  el('ellipse', { cx: CX + 4, cy: 202, rx: 34, ry: 24, fill: 'none', stroke: o.ink, 'stroke-width': 1.3, opacity: 0.75 }, over)
  el('ellipse', { cx: CX + 4, cy: 202, rx: 29, ry: 19.5, fill: 'none', stroke: o.ink, 'stroke-width': 0.7, opacity: 0.55 }, over)
  if (o.monogram) {
    const mono = el('text', { x: CX + 4, y: 209, 'text-anchor': 'middle', 'font-family': 'DMS', 'font-style': 'italic', 'font-size': 21, fill: o.ink, opacity: 0.8 }, over)
    mono.textContent = o.monogram
  } else {
    // No league initials on a public post: an engraved five-point star.
    const pts = []
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 5.6 : 13
      const a = (Math.PI / 5) * i - Math.PI / 2
      pts.push(`${(CX + 4 + r * Math.cos(a)).toFixed(2)} ${(202 + r * Math.sin(a)).toFixed(2)}`)
    }
    el('path', { d: 'M' + pts.join(' L') + ' Z', fill: o.ink, opacity: 0.72 }, over)
  }
  // Gadrooning: the lobes round the base of the bowl.
  for (let i = -5; i <= 5; i++) {
    const x = CX + i * 9.5
    el('path', { d: `M${x} 286 Q${x + i * 1.2} 262 ${x + i * 2.8} 240`, fill: 'none', stroke: o.ink, 'stroke-width': 0.9, opacity: 0.45 }, over)
  }

  // ── Lip, lid and finial ──
  band(110, 13, 104)
  el('rect', { x: CX - 100, y: 112, width: 200, height: 3, fill: '#fff3c8', opacity: 0.5 })
  part(turned([[8, 56], [26, 66], [54, 80], [80, 94], [92, 104], [94, 110]]), 'url(#brass)')
  el('path', { d: `M${CX - 60} 84 C${CX - 40} 74 ${CX - 20} 68 ${CX} 66`, fill: 'none', stroke: '#fffaf0', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.5, filter: 'url(#soft)' })
  band(50, 7, 12, 'url(#brassSoft)')
  part(turned([[5, 30], [8, 38], [9, 44], [6, 50]]), 'url(#brass)')
  el('circle', { cx: CX, cy: 22, r: 11, fill: 'url(#brass)', stroke: o.ink, 'stroke-width': 1.4 })
  el('circle', { cx: CX - 4, cy: 18, r: 3.2, fill: '#fffaf0', opacity: 0.75, filter: 'url(#soft)' })
}

// The wreath round the cup, in the plinth's bottle green with a brass berry
// at each tip (the Milk Cup cover's final cut). Draws into an <svg> 600x600;
// both branches grow from behind the plinth.
function drawLaurel(svg) {
  const ns = 'http://www.w3.org/2000/svg'
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(ns, tag)
    for (const k in attrs) e.setAttribute(k, attrs[k])
    ;(parent || svg).appendChild(e)
    return e
  }
  const defs = el('defs', {})
  const grad = (id, stops) => {
    const g = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs)
    for (const [off, color] of stops) el('stop', { offset: off, 'stop-color': color }, g)
  }
  grad('lfA', [[0, '#0b241c'], [0.4, '#3f6e5b'], [0.58, '#2a5545'], [1, '#0a2119']])
  grad('lfB', [[0, '#0a2119'], [0.45, '#33604e'], [0.62, '#1f4637'], [1, '#081a14']])

  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const rad = (d) => (d * Math.PI) / 180
  const cx = 300, cy = 262, R = 232
  const leafPath = (L, W) =>
    `M0 0 C${L * 0.22} ${-W} ${L * 0.68} ${-W * 0.95} ${L} 0 C${L * 0.68} ${W * 0.95} ${L * 0.22} ${W} 0 0 Z`
  const leaf = (g, x, y, angle, L, W, fill) => {
    const t = el('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})` }, g)
    el('path', { d: leafPath(L, W), fill, stroke: '#061510', 'stroke-width': 0.8, 'stroke-linejoin': 'round' }, t)
    el('path', { d: `M${L * 0.08} 0 Q${L * 0.5} ${-W * 0.1} ${L * 0.84} 0`, fill: 'none', stroke: '#9cc2b0', 'stroke-width': 0.9, opacity: 0.45 }, t)
  }
  const branch = (from, to) => {
    const g = el('g', {})
    const N = 60
    const pts = []
    for (let k = 0; k <= N; k++) {
      const phi = rad(from + (to - from) * (k / N))
      const r = R - (k / N) * 10
      pts.push([cx + r * Math.cos(phi), cy + r * Math.sin(phi)])
    }
    el('path', {
      d: 'M' + pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(' L'),
      fill: 'none', stroke: '#16382c', 'stroke-width': 3, 'stroke-linecap': 'round',
    }, g)
    for (let k = 3; k < N - 2; k += 4) {
      const [x, y] = pts[k]
      const [x2, y2] = pts[k + 1]
      const dir = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI
      const s = 1.08 - (k / N) * 0.5
      const L = 42 * s * (0.92 + rnd() * 0.16)
      const W = 11 * s
      leaf(g, x, y, dir - (38 + rnd() * 10), L, W, 'url(#lfA)')
      leaf(g, x, y, dir + (36 + rnd() * 10), L * 0.94, W * 0.95, 'url(#lfB)')
    }
    const [tx, ty] = pts[N]
    const [px, py] = pts[N - 1]
    leaf(g, tx, ty, (Math.atan2(ty - py, tx - px) * 180) / Math.PI, 26, 8, 'url(#lfA)')
    // The brass berry just past the tip.
    const a = Math.atan2(ty - py, tx - px)
    el('circle', { cx: (tx + Math.cos(a) * 30).toFixed(1), cy: (ty + Math.sin(a) * 30).toFixed(1), r: 5.2, fill: '#c9a35a', stroke: '#7c5d23', 'stroke-width': 0.8 }, g)
  }
  branch(117, 240)
  branch(63, -60)
}
