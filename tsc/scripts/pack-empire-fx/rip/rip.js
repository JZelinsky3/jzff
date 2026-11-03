// Pack Empire key art: a torn pack on a dark table, its cards rising out of it
// with daylight between them and the pack, lit from inside. Path traced, the same
// way as the Locker Room art (scripts/pack-empire-locker-art). ?mode=home|builder|
// daily|versus|league &view=og|wide
//
// What comes out: public/og/pack-empire/stage-<mode>.jpg (the link previews,
// 1200x630, subject right so the words have the left) and
// public/games/pack-empire/key-art-wide.webp (the /games card, 1600x640).
//
// None of this is part of the site's build. In a scratch folder with these files:
//
//   npm i three@0.170 three-gpu-pathtracer@0.0.23 three-mesh-bvh@0.8 puppeteer-core@23
//   esbuild rip.js --bundle --format=iife --outfile=rip.bundle.js
//   python3 -m http.server 8766     (index.html loads rip.bundle.js)
//
// Textures go in tex/: real PackCards captured flat by cap.mjs (it needs a temp
// page at src/app/games/pack-empire/og-art-temp/ rendering <PackCard> for
// ?ids=&blind=&back=1 at --pe-cs 2.6; write it, capture, delete it), and
// pack-<pos>.png converted from public/games/pack-empire/packs.
//
//   node render.mjs home og 1200 630 500 f-home.png
//   python3 post.py f-home.png p-home.png .76 .42 .8 ffc46a .75    (tint, left shade)
//   node render.mjs home wide 1600 640 500 f-wide.png
//   python3 post.py f-wide.png p-wide.png .5 .4 .8 ffc46a 0
//
// Keep materials on MeshStandardMaterial (the path tracer renders physical ones
// black) and keep the gap between the pack's mouth and the hand: cards jammed
// against the pack read as pasted on.
import * as THREE from 'three'
import { WebGLPathTracer, PhysicalCamera } from 'three-gpu-pathtracer'

const q = new URLSearchParams(location.search)
const MODE = q.get('mode') ?? 'home'
const VIEW = q.get('view') ?? 'og'
const W = Number(q.get('w') ?? 1200), H = Number(q.get('h') ?? 630), SPP = Number(q.get('spp') ?? 40)
const log = (m) => { document.title = m; console.log(m) }

const LOOK = {
  home: { hot: 0xffc46a, rimA: 0xff9a3c, rimB: 0xffd27a, pack: 'qb', cards: ['wr-jamarr-chase-2024', 'wr-randy-moss-2007-canton', 'qb-patrick-mahomes-2018', 'qb-lamar-jackson-2019', 'wr-tyreek-hill-2023'] },
  builder: { hot: 0xffc46a, rimA: 0xff9a3c, rimB: 0xffd27a, pack: 'wr', cards: ['wr-puka-nacua-2025', 'te-rob-gronkowski-2011', 'rb-christian-mccaffrey-2019', 'rb-marshall-faulk-2000', 'qb-josh-allen-2022'] },
  daily: { hot: 0x8ff5e0, rimA: 0x2fb39f, rimB: 0x9ae8ff, pack: 'wild', cards: ['blind-wr-justin-jefferson-2022', 'blind-te-travis-kelce-2020', 'blind-qb-tom-brady-2007', 'blind-rb-christian-mccaffrey-2019', 'back'] },
  league: { hot: 0xd9b8ff, rimA: 0x9b6cf0, rimB: 0xffc46a, pack: 'te', cards: ['wr-jerry-rice-1995', 'te-travis-kelce-2020', 'qb-patrick-mahomes-2018-canton', 'te-travis-kelce-2021', 'qb-josh-allen-2022'] },
  versus: { hot: 0xffd2a8, rimA: 0xff5a3c, rimB: 0x4fa8ff, pack: 'ot', pack2: 'og', cards: ['wr-jamarr-chase-2024', 'qb-patrick-mahomes-2018'], cards2: ['qb-josh-allen-2022', 'te-travis-kelce-2021'] },
}[MODE]

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true })
renderer.setPixelRatio(1)
renderer.setSize(W, H)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.15
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x030304)
{
  const w = 64, h = 32, d = new Float32Array(w * h * 4)
  const c = new THREE.Color(LOOK.rimA)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = y / (h - 1), i = (y * w + x) * 4, k = t > .5 ? (t - .5) * 2 : 0
    d[i] = .004 + .018 * k * c.r; d[i + 1] = .004 + .018 * k * c.g; d[i + 2] = .005 + .018 * k * c.b; d[i + 3] = 1
  }
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat, THREE.FloatType)
  t.mapping = THREE.EquirectangularReflectionMapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true
  scene.environment = t
}

const loader = new THREE.TextureLoader()
const tex = (url) => new Promise((res, rej) => loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t) }, undefined, rej))
const canvasTex = (w, h, draw, srgb = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t }
const std = (o) => new THREE.MeshStandardMaterial(o)
const mesh = (g, m, x = 0, y = 0, z = 0, parent = scene) => { g.clearGroups(); const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o }
const box = (w, h, d, m, x, y, z, parent) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent)
let seed = 11
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

// The table: dark lacquered wood, close enough to a mirror to hold the glow.
const woodTex = canvasTex(2048, 512, (g, w, h) => {
  g.fillStyle = '#15100c'; g.fillRect(0, 0, w, h)
  for (let i = 0; i < 1400; i++) { const y = rnd() * h; g.strokeStyle = `rgba(${50 + rnd() * 40},${30 + rnd() * 20},${16 + rnd() * 10},${.05 + rnd() * .14})`; g.lineWidth = .5 + rnd() * 2; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 80) g.lineTo(x, y + Math.sin(x * .006 + i) * 5); g.stroke() }
})
woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.repeat.set(2, 2)
const table = mesh(new THREE.PlaneGeometry(9, 3.2), std({ map: woodTex, roughness: .36, metalness: .05 }), 0, 0, -.4)
table.rotation.x = -Math.PI / 2
box(9, .06, .04, std({ color: 0x0a0807, roughness: .4 }), 0, -.03, 1.2)

// Out past the table: a stadium at night, all of it out of focus.
const bulb = (color, power) => std({ color: 0x000000, emissive: color, emissiveIntensity: power })
for (let bank = 0; bank < 7; bank++) {
  const bx = -7 + bank * 2.4 + rnd() * .6, by = 2.6 + rnd() * .9, bz = -9 - rnd() * 2
  const m = bulb(rnd() > .25 ? 0xfff1d6 : LOOK.rimB, 4 + rnd() * 4)
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) mesh(new THREE.SphereGeometry(.07, 12, 8), m, bx + c * .2, by + r * .2, bz)
}
for (let i = 0; i < 26; i++) mesh(new THREE.SphereGeometry(.03 + rnd() * .05, 10, 6), bulb(rnd() > .5 ? LOOK.rimA : LOOK.hot, 1 + rnd() * 3), -7 + rnd() * 14, .6 + rnd() * 2, -6 - rnd() * 4)

async function main() {
  const T = {}
  const want = new Set([...(LOOK.cards ?? []), ...(LOOK.cards2 ?? [])])
  await Promise.all([...want].map(async (n) => { T[n] = await tex(`tex/${n}.png`) }))
  for (const n of new Set([LOOK.pack, LOOK.pack2, 'rb', 'te', 'wr', 'qb', 'ot'].filter(Boolean))) T[`pack-${n}`] = await tex(`tex/pack-${n === 'wild' ? 'wild-hi' : n}.png`)

  // A card: rounded, thin, with a white core showing at the edge.
  const edge = std({ color: 0xe9e4d8, roughness: .55 })
  function card(name, w = .44) {
    const h = w * 1082 / 708, r = w * .032
    const sh = new THREE.Shape()
    sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
    sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); sh.lineTo(-w / 2 + r, h / 2)
    sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
    const grp = new THREE.Group()
    const face = new THREE.ShapeGeometry(sh, 6)
    const pos = face.attributes.position, uv = face.attributes.uv
    for (let k = 0; k < pos.count; k++) uv.setXY(k, (pos.getX(k) + w / 2) / w, (pos.getY(k) + h / 2) / h)
    const f = mesh(face, std({ map: T[name], roughness: .32, metalness: .12 }), 0, 0, .0016, grp)
    void f
    const core = mesh(new THREE.ExtrudeGeometry(sh, { depth: .003, bevelEnabled: false, curveSegments: 6 }), edge, 0, 0, -.0015, grp)
    void core
    return { grp, h }
  }

  // A pack: a foil pouch, bulged, its top torn off along a ragged line and the
  // mouth pulled open. `torn` is how much of the top is gone.
  function pack(name, w = .62, { torn = 0, bulge = .03, lean = 0 } = {}) {
    const h = w * 732 / 500, grp = new THREE.Group()
    const keep = 1 - torn
    const map = T[`pack-${name}`]
    const front = std({ map, roughness: .36, metalness: .22, transparent: true, alphaTest: .5 })
    const backMap = map.clone(); backMap.needsUpdate = true
    const back = std({ map: backMap, color: 0x5a5a5a, roughness: .35, metalness: .6, transparent: true, alphaTest: .5 })
    const rag = (u) => (Math.sin(u * 37) * .5 + Math.sin(u * 91 + 1.3) * .3 + Math.sin(u * 13) * .4) * .012
    for (const side of [1, -1]) {
      const g = new THREE.PlaneGeometry(w, h * keep, 30, 40)
      const p = g.attributes.position, uv = g.attributes.uv
      for (let k = 0; k < p.count; k++) {
        const u = p.getX(k) / (w / 2), yy = p.getY(k), v = yy / (h * keep / 2)
        const top = (v + 1) / 2 // 0 at the bottom, 1 at the tear
        let y = yy
        if (torn && top > .995) y += rag(u) * w
        const open = torn ? Math.pow(Math.max(0, top - .55) / .45, 2) * .055 * (1 - u * u * .6) : 0
        p.setY(k, y)
        p.setZ(k, side * (bulge * Math.pow(1 - u * u, .55) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(v) * 1.02, 8)), .6) + open) + .0012 * Math.sin(u * 11 + v * 17))
        uv.setXY(k, side === 1 ? uv.getX(k) : 1 - uv.getX(k), uv.getY(k) * keep * (y / yy || 1))
      }
      g.computeVertexNormals()
      const m = mesh(g, side === 1 ? front : back, 0, h * keep / 2, 0, grp)
      if (side === -1) m.material.side = THREE.DoubleSide
      front.side = THREE.DoubleSide
    }
    if (torn) {
      // Inside the pouch: the light the cards came out of.
      const glow = mesh(new THREE.PlaneGeometry(w * .86, .07), std({ color: 0, emissive: LOOK.hot, emissiveIntensity: 9 }), 0, h * keep - .03, 0, grp)
      glow.rotation.x = -Math.PI / 2
      const inner = mesh(new THREE.BoxGeometry(w * .9, h * keep * .7, .02), std({ color: 0xc9c3b6, roughness: .5, metalness: .7, emissive: LOOK.hot, emissiveIntensity: .25 }), 0, h * keep * .62, 0, grp)
      void inner
      // The torn edge itself, lit from behind: what reads as "just opened".
      const lip = mesh(new THREE.BoxGeometry(w * .94, .008, .004), std({ color: 0, emissive: LOOK.hot, emissiveIntensity: 7 }), 0, h * keep + .002, .03, grp)
      void lip
    }
    grp.rotation.x = lean
    return { grp, h: h * keep, w }
  }

  // The strip torn off the top, dropped on the table and curling.
  function strip(name, w = .62, torn = .16) {
    const h = w * 732 / 500 * torn
    const g = new THREE.PlaneGeometry(w, h, 30, 6)
    const p = g.attributes.position, uv = g.attributes.uv
    for (let k = 0; k < p.count; k++) {
      const u = p.getX(k) / (w / 2)
      p.setZ(k, Math.pow(u, 2) * .05 + Math.sin(u * 4) * .01)
      uv.setXY(k, uv.getX(k), 1 - torn + uv.getY(k) * torn)
    }
    g.computeVertexNormals()
    return new THREE.Mesh(g, std({ map: T[`pack-${name}`], roughness: .3, metalness: .5, transparent: true, alphaTest: .5, side: THREE.DoubleSide }))
  }

  function football(s = 1) {
    const pts = []
    for (let i = 0; i <= 40; i++) { const t = i / 40 * 2 - 1; pts.push(new THREE.Vector2(.0001 + .085 * s * Math.pow(1 - t * t, .78), t * .145 * s)) }
    const grp = new THREE.Group()
    const leather = canvasTex(512, 256, (c, w, h) => { c.fillStyle = '#5e2c12'; c.fillRect(0, 0, w, h); for (let i = 0; i < 26000; i++) { c.fillStyle = `rgba(${rnd() < .5 ? '30,12,4' : '150,86,44'},.1)`; c.fillRect(rnd() * w, rnd() * h, 2, 2) } })
    const m = mesh(new THREE.LatheGeometry(pts, 48), std({ map: leather, roughness: .5 }), 0, 0, 0, grp)
    m.rotation.z = Math.PI / 2
    const white = std({ color: 0xf1ece0, roughness: .6 })
    box(.1 * s, .004 * s, .006 * s, white, 0, .0855 * s, 0, grp)
    for (let i = -3; i <= 3; i++) box(.005 * s, .004 * s, .024 * s, white, i * .014 * s, .0858 * s, 0, grp)
    return grp
  }

  function trophy(s = 1) {
    const grp = new THREE.Group()
    const gold = std({ color: 0xe0b45a, metalness: 1, roughness: .18 })
    const pts = [[0, 0], [.16, 0], [.16, .03], [.11, .05], [.1, .1], [.05, .13], [.035, .3], [.06, .34], [.15, .4], [.2, .52], [.21, .66], [.2, .68], [.0001, .62]].map(([r, y]) => new THREE.Vector2(r * s, y * s))
    mesh(new THREE.LatheGeometry(pts, 64), gold, 0, 0, 0, grp)
    for (const sx of [1, -1]) { const hnd = mesh(new THREE.TorusGeometry(.08 * s, .014 * s, 12, 32, Math.PI * 1.2), gold, sx * .22 * s, .54 * s, 0, grp); hnd.rotation.z = sx === 1 ? -Math.PI * .6 : Math.PI * .6 + Math.PI * .2 }
    box(.36 * s, .12 * s, .36 * s, std({ color: 0x16110a, roughness: .3, metalness: .2 }), 0, -.06 * s, 0, grp)
    return grp
  }

  // Foil scraps and sparks in the air over the pack.
  const foil = [LOOK.hot, LOOK.rimA, LOOK.rimB, 0xffffff].map((c) => std({ color: c, metalness: 1, roughness: .15, emissive: c, emissiveIntensity: .35 }))
  function confetti(cx, cy, cz, n, spread) {
    for (let i = 0; i < n; i++) {
      const c = box(.022 + rnd() * .02, .001, .012 + rnd() * .012, foil[i % foil.length], cx + (rnd() - .5) * spread * 2, cy + rnd() * spread, cz + (rnd() - .5) * .6)
      c.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6)
    }
  }

  /** A hand of cards up out of a pack's mouth: a fan, a clear gap under it. */
  function burst(names, px, pz, mouth, { reach = .5, spread = 15, size = .44, gap = .14, yaw = 0, lean = 0 } = {}) {
    const mid = (names.length - 1) / 2
    const order = names.map((n, i) => ({ n, off: i - mid })).sort((a, b) => Math.abs(b.off) - Math.abs(a.off))
    order.forEach(({ n, off }, k) => {
      const { grp, h } = card(n, size * (off === 0 ? 1.06 : 1))
      const a = (off * spread + lean) * Math.PI / 180
      const piv = new THREE.Group(); piv.position.set(px, mouth + gap + h / 2, pz); piv.rotation.y = yaw; scene.add(piv)
      grp.position.set(Math.sin(a) * reach * .9, (Math.cos(a) - 1) * reach * .6 + Math.abs(off) * .02, .05 - Math.abs(off) * .045 + k * .002)
      grp.rotation.z = -a * .85
      grp.rotation.x = -.1 + Math.abs(off) * .03
      grp.rotation.y = -off * .08
      piv.add(grp)
    })
  }

  const area = (w, h, color, power, x, y, z, target) => { const l = new THREE.RectAreaLight(color, power, w, h); l.position.set(x, y, z); l.lookAt(...target); scene.add(l); return l }

  if (MODE === 'versus') {
    for (const [side, name, names, rim] of [[-1, LOOK.pack, LOOK.cards, LOOK.rimA], [1, LOOK.pack2, LOOK.cards2, LOOK.rimB]]) {
      const pk = pack(name, .56, { torn: .16, lean: -.06 })
      pk.grp.position.set(side * .43, 0, 0); pk.grp.rotation.y = -side * .32; pk.grp.rotation.z = side * .05; scene.add(pk.grp)
      burst(names, side * .43, .02, pk.h, { reach: .5, spread: 36, size: .38, gap: .12, yaw: -side * .32, lean: -side * 6 })
      area(.5, .05, rim, 40, side * .5, pk.h + .02, .05, [side * .4, 3, .1])
      area(1.4, 2.2, rim, 9, side * 2.4, 1.2, -1.2, [side * .4, .9, 0])
    }
    const s = strip(LOOK.pack, .56); s.position.set(-.05, .006, .5); s.rotation.set(-Math.PI / 2, 0, .4); scene.add(s)
    confetti(0, .9, 0, 40, .9)
  } else {
    const pk = pack(LOOK.pack, .62, { torn: .16, lean: -.07 })
    pk.grp.rotation.y = -.26
    scene.add(pk.grp)
    burst(LOOK.cards, 0, .03, pk.h, { reach: .62, spread: 19, size: .42, gap: .13, yaw: -.16 })
    const s = strip(LOOK.pack); s.position.set(.42, .006, .48); s.rotation.set(-Math.PI / 2, 0, -.5); scene.add(s)
    // Packs still sealed, around it.
    // On the og frame the left is the words' side, so nothing stands there.
    const others = ['rb', 'te', 'wr', 'qb'].filter((n) => n !== LOOK.pack).slice(0, 3)
    if (VIEW !== 'og') {
      others.forEach((n, i) => { const p = pack(MODE === 'daily' ? 'wild' : n, .56, { bulge: .02 }); p.grp.rotation.set(-Math.PI / 2, 0, .3 + i * .5); p.grp.position.set(-.56 + i * .03, .02 + i * .028, .5 - i * .02); scene.add(p.grp) })
      { const p = pack(MODE === 'daily' ? 'wild' : others[0], .56, { bulge: .025 }); p.grp.position.set(-.66, 0, -1.0); p.grp.rotation.set(-.25, .4, .06); scene.add(p.grp) }
    } else {
      { const p = pack(MODE === 'daily' ? 'wild' : others[0], .5, { bulge: .025 }); p.grp.position.set(.62, 0, -.75); p.grp.rotation.set(-.2, -.45, -.05); scene.add(p.grp) }
    }
    if (MODE === 'league') { const t = trophy(VIEW === 'og' ? .9 : 1.1); t.position.set(VIEW === 'og' ? .4 : -.82, .07, VIEW === 'og' ? .45 : .05); t.rotation.y = .3; scene.add(t) }
    else if (VIEW !== 'og') { const f = football(1.35); f.position.set(-1.25, .12, -.75); f.rotation.set(.1, .5, 0); scene.add(f) }
    confetti(0, .95, 0, 46, .8)
    area(.55, .06, LOOK.hot, 45, 0, pk.h + .03, .03, [0, 3, -.1])        // up out of the mouth
  }

  // Key, from over the camera's shoulder; a top light; rims in the room's colours.
  area(2.4, 1.6, 0xfff0dc, 3.4, .4, 2.8, 3.6, [0, 1, 0])
  area(.9, .9, 0xfff4e6, 9, 0, 3.1, .4, [0, .6, 0])
  area(1.2, .5, 0xffe2c0, 4, 0, .45, 1.6, [0, .4, 0])                   // a low fill on the pack's face
  if (MODE !== 'versus') {
    area(1.4, 2.4, LOOK.rimA, 9, -2.3, 1.5, -1.3, [0, 1.5, 0])
    area(1.4, 2.4, LOOK.rimB, 7, 2.3, 1.5, -1.3, [0, 1.5, 0])
  }
  area(6, .4, LOOK.rimA, 2.5, 0, .05, -2.2, [0, 1.6, 2])                // a lip of colour along the far edge

  // Camera: low, a little up at the cards. On the og frame the subject sits right
  // of centre so the words have the left.
  const og = VIEW === 'og'
  const cam = new PhysicalCamera(og ? 33 : 31, W / H, .05, 60)
  if (og && MODE === 'versus') { cam.position.set(-.62, .78, 3.4); cam.lookAt(-1.14, .74, 0) } else if (og) { cam.position.set(-.42, .78, 3.4); cam.lookAt(-.92, .74, 0) } else { cam.position.set(-.1, .72, 3.4); cam.lookAt(-.1, .84, 0) }
  cam.fStop = og ? .4 : .45
  cam.focusDistance = cam.position.distanceTo(new THREE.Vector3(0, .9, .05))
  cam.apertureBlades = 7
  scene.add(cam)

  const pt = new WebGLPathTracer(renderer)
  pt.bounces = 6
  pt.tiles.set(3, 3)
  pt.filterGlossyFactor = .5
  pt.renderScale = 1
  pt.dynamicLowRes = false
  pt.fadeDuration = 0
  pt.minSamples = 0
  pt.setScene(scene, cam)
  log('ready')
  const t0 = performance.now()
  const tick = () => {
    pt.renderSample()
    const s = Math.floor(pt.samples)
    if (s % 5 === 0) log(`spp ${s} ${(performance.now() - t0 | 0) / 1000}s`)
    if (s >= SPP) { window.__done = true; log('done'); return }
    requestAnimationFrame(tick)
  }
  tick()
}
main().catch((e) => { console.log('ERROR STACK ' + e.stack); log('ERROR ' + e.message) })
