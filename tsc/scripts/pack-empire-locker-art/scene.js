// The Locker Room card art on the Pack Empire front page: a path-traced 3D scene built
// from the game's own packs and cards. It's run by render.mjs and finished by post.py,
// and what comes out is public/games/pack-empire/locker-room-{wide,tall}.webp. Re-render
// it when the pack art or the card design changes enough to matter.
//
// None of this is part of the site's build. To run it, in a scratch folder with this
// directory's files in it:
//
//   npm i three@0.170 three-gpu-pathtracer@0.0.23 three-mesh-bvh@0.8 puppeteer-core@23
//   esbuild scene.js --bundle --format=iife --outfile=scene.bundle.js
//   python3 -m http.server 8765     (index.html loads scene.bundle.js)
//
// The textures it expects next to it: lk-0.png to lk-15.png, screenshots of LockerCards
// at 600px wide off the Collection page with the pool's top cards in it, and wild, qb,
// rb, wr, te and ot.png, the pack art converted from public/games/pack-empire/packs.
//
//   node render.mjs wide 1920 820 420 final-wide.png
//   python3 post.py final-wide.png locker-room-wide.webp .66 .42 .8
//   node render.mjs tall 1000 1250 380 final-tall.png
//   python3 post.py final-tall.png locker-room-tall.webp .5 .4 .55
//
// Keep the scene's materials on MeshStandardMaterial: this path tracer renders physical
// ones black, and clear a geometry's groups or its textures land on the wrong mesh.
import * as THREE from 'three'
import { WebGLPathTracer, PhysicalCamera } from 'three-gpu-pathtracer'

const q = new URLSearchParams(location.search)
const VIEW = q.get('view') ?? 'wide'
const W = Number(q.get('w') ?? 1000), H = Number(q.get('h') ?? 430), SPP = Number(q.get('spp') ?? 40)
const log = (m) => { document.title = m; console.log(m) }

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true })
renderer.setPixelRatio(1)
renderer.setSize(W, H)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.2
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x05090b)
scene.backgroundIntensity = 1
{
  // A dim teal room for the bounce light to sit in.
  const w = 64, h = 32, d = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = y / (h - 1), i = (y * w + x) * 4
    const k = t > .5 ? (t - .5) * 2 : 0
    d[i] = .004 + .03 * k; d[i + 1] = .007 + .055 * k; d[i + 2] = .009 + .07 * k; d[i + 3] = 1
  }
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat, THREE.FloatType)
  t.mapping = THREE.EquirectangularReflectionMapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true
  scene.environment = t
  scene.environmentIntensity = 1
}

const loader = new THREE.TextureLoader()
const tex = (url) => new Promise((res) => loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t) }))
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t }
const std = (o) => new THREE.MeshStandardMaterial(o)
const phys = ({ clearcoat, clearcoatRoughness, ...o }) => new THREE.MeshStandardMaterial(o)
const mesh = (g, m, x = 0, y = 0, z = 0, parent = scene) => { g.clearGroups(); const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o }
const box = (w, h, d, m, x, y, z, parent) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent)

// Materials
const paint = std({ color: 0x1b3d46, metalness: .55, roughness: .38 })
const paint2 = std({ color: 0x173540, metalness: .55, roughness: .42 })
const inside = std({ color: 0x20282a, metalness: .3, roughness: .55 })
const shelfMat = std({ color: 0x3a4348, metalness: .7, roughness: .4 })
const chrome = std({ color: 0xc9d0d4, metalness: 1, roughness: .16 })
const brass = std({ color: 0xdca94a, metalness: 1, roughness: .3 })
const blackout = std({ color: 0x050708, metalness: .2, roughness: .6 })
const floorMat = std({ color: 0x10161a, metalness: .15, roughness: .2 })
const wallMat = std({ color: 0x10191d, metalness: .1, roughness: .75 })
const tapeMat = std({ color: 0xece7da, roughness: .75 })
const edgeWhite = std({ color: 0xd8d3c4, roughness: .5 })

const woodTex = canvasTex(1024, 256, (g, w, h) => {
  g.fillStyle = '#7a4a26'; g.fillRect(0, 0, w, h)
  for (let i = 0; i < 900; i++) { const y = Math.random() * h; g.strokeStyle = `rgba(${40 + Math.random() * 60},${20 + Math.random() * 25},8,${.06 + Math.random() * .18})`; g.lineWidth = .5 + Math.random() * 1.6; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 60) g.lineTo(x, y + Math.sin(x * .01 + i) * 4); g.stroke() }
})
const wood = phys({ map: woodTex, roughness: .42, clearcoat: .6, clearcoatRoughness: .3 })

// Floor and walls
mesh(new THREE.PlaneGeometry(30, 30), floorMat, 0, 0, 0).rotation.x = -Math.PI / 2
box(30, 6, .1, wallMat, 0, 3, -.62)
box(30, .1, 30, blackout, 0, 3.2, 0)

// Lockers
const LW = .74, LH = 2.2, LD = .56, BASE = .14
const COLORS = { COMMON: '#d99a68', RARE: '#79d6ff', DYNASTY: '#ffdb6b', TRANSCENDENT: '#e98bff', IMMORTAL: '#45f5a6', CANTON: '#f5efe1', YOURS: '#ffb648' }
const plate = (text) => canvasTex(512, 96, (g, w, h) => {
  g.fillStyle = '#0a0d0f'; g.fillRect(0, 0, w, h)
  g.fillStyle = COLORS[text] ?? '#fff'; g.font = '700 60px "Helvetica Neue", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'
  if (g.letterSpacing !== undefined) g.letterSpacing = '6px'
  g.fillText(text, w / 2, h / 2 + 3)
})
const numberPlate = (text) => canvasTex(128, 96, (g, w, h) => {
  g.fillStyle = '#d7b15a'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1405'; g.font = '800 64px "Helvetica Neue", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4)
})

function doorFace(group, w, h, mat) {
  // A pressed steel door: panel, louvers top and bottom, handle and number plate.
  box(w, h, .022, mat, 0, 0, 0, group)
  for (const [y0, n] of [[h / 2 - .2, 5], [-h / 2 + .14, 4]]) {
    for (let i = 0; i < n; i++) {
      const s = box(w * .56, .018, .03, blackout, 0, y0 - i * .036, .006, group)
      s.rotation.x = .5
    }
  }
}

function locker(x, name, num, painted, open = false) {
  const g = new THREE.Group(); g.position.set(x, 0, 0); scene.add(g)
  box(LW, BASE, LD, blackout, 0, BASE / 2, 0, g)
  const top = BASE + LH
  box(.03, LH, LD, painted, -LW / 2 + .015, BASE + LH / 2, 0, g)
  box(.03, LH, LD, painted, LW / 2 - .015, BASE + LH / 2, 0, g)
  box(LW, .03, LD, painted, 0, top - .015, 0, g)
  box(LW, .03, LD, painted, 0, BASE + .015, 0, g)
  box(LW, LH, .02, inside, 0, BASE + LH / 2, -LD / 2 + .01, g)
  // Nameplate rail above the door
  box(LW, .16, .03, painted, 0, top + .08, LD / 2 - .015, g)
  const p = mesh(new THREE.PlaneGeometry(LW * .82, LW * .82 * 96 / 512), std({ map: plate(name), roughness: .4, emissiveMap: plate(name), emissive: 0xffffff, emissiveIntensity: open ? 1.6 : .8 }), 0, top + .08, LD / 2 + .002, g)
  void p
  const dw = LW - .05, dh = LH - .05
  if (!open) {
    const d = new THREE.Group(); d.position.set(0, BASE + LH / 2, LD / 2 - .012); g.add(d)
    doorFace(d, dw, dh, painted)
    box(.05, .11, .03, chrome, dw / 2 - .08, 0, .02, d)
    const np = mesh(new THREE.PlaneGeometry(.09, .068), std({ map: numberPlate(num), metalness: .85, roughness: .35 }), 0, .34, .014, d)
    void np
  }
  return g
}

const row = VIEW === 'tall' ? [-2.97, -2.23, -1.49, -.75, .75, 1.49, 2.23, 2.97] : [-4.45, -3.71, -2.97, -2.23, -1.49, -.75, 0, 1.49, 2.23, 2.97, 3.71]
const heroX = VIEW === 'tall' ? 0.0 : .75
const NAMES = ['COMMON', 'RARE', 'DYNASTY', 'TRANSCENDENT', 'IMMORTAL', 'CANTON']
const NUMS = ['12', '84', '7', '23', '54', '88', '19', '31', '4', '66']
row.forEach((x, i) => locker(x, NAMES[i % NAMES.length], NUMS[i % NUMS.length], i % 2 ? paint : paint2))

const hero = locker(heroX, 'YOURS', '1', paint, true)

async function main() {
  const cardTex = await Promise.all(Array.from({ length: 16 }, (_, i) => tex(`lk-${i}.png`)))
  const packTex = await Promise.all(['wild', 'qb', 'rb', 'wr', 'te', 'ot'].map((n) => tex(`${n}.png`)))

  // A card: rounded, thin, foil-coated.
  const cardMats = cardTex.map((map) => phys({ map, metalness: .22, roughness: .3, clearcoat: 1, clearcoatRoughness: .12 }))
  function card(i, s = 1) {
    const w = .24 * s, h = w * 826 / 600, r = .024 * s
    const sh = new THREE.Shape()
    sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
    sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); sh.lineTo(-w / 2 + r, h / 2)
    sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
    const g = new THREE.ExtrudeGeometry(sh, { depth: .002, bevelEnabled: false, curveSegments: 5 })
    const pos = g.attributes.position, uv = g.attributes.uv
    for (let k = 0; k < pos.count; k++) uv.setXY(k, (pos.getX(k) + w / 2) / w, (pos.getY(k) + h / 2) / h)
    g.clearGroups()
    return new THREE.Mesh(g, cardMats[i % cardMats.length])
  }

  // A pack: a foil pouch that bulges in the middle.
  const packMats = packTex.map((map) => phys({ map, metalness: .55, roughness: .3, clearcoat: .7, clearcoatRoughness: .2 }))
  function pack(i, s = 1, bulge = .016) {
    const w = .3 * s, h = w * 732 / 500, grp = new THREE.Group()
    for (const side of [1, -1]) {
      const g = new THREE.PlaneGeometry(w, h, 24, 36)
      const p = g.attributes.position, uv = g.attributes.uv
      for (let k = 0; k < p.count; k++) {
        const u = p.getX(k) / (w / 2), v = p.getY(k) / (h / 2)
        const wr = 1 + .012 * Math.sin(v * 40) * (Math.abs(v) > .9 ? 1 : 0)
        p.setX(k, p.getX(k) * wr)
        p.setZ(k, side * bulge * s * Math.pow(1 - u * u, .6) * Math.pow(Math.max(0, 1 - Math.pow(v * 1.04, 6)), .7) + .0015 * Math.sin(u * 9 + v * 14))
        uv.setXY(k, .02 + uv.getX(k) * .96, .015 + uv.getY(k) * .97)
      }
      g.computeVertexNormals()
      g.clearGroups()
      const m = new THREE.Mesh(g, packMats[i % packMats.length])
      grp.add(m)
    }
    return grp
  }

  // A football.
  function football(s = 1) {
    const pts = []
    for (let i = 0; i <= 40; i++) { const t = i / 40 * 2 - 1; pts.push(new THREE.Vector2(.0001 + .085 * s * Math.pow(1 - t * t, .78), t * .145 * s)) }
    const g = new THREE.LatheGeometry(pts, 48)
    const grp = new THREE.Group()
    const leather = canvasTex(512, 256, (c, w, h) => { c.fillStyle = '#6a3214'; c.fillRect(0, 0, w, h); for (let i = 0; i < 26000; i++) { c.fillStyle = `rgba(${Math.random() < .5 ? '30,12,4' : '150,86,44'},.1)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2) } })
    const m = mesh(g, phys({ map: leather, roughness: .48, clearcoat: .25 }), 0, 0, 0, grp)
    m.rotation.z = Math.PI / 2
    const white = std({ color: 0xf1ece0, roughness: .6 })
    box(.1 * s, .004 * s, .006 * s, white, 0, .0855 * s, 0, grp)
    for (let i = -3; i <= 3; i++) box(.005 * s, .004 * s, .024 * s, white, i * .014 * s, .0858 * s, 0, grp)
    return grp
  }

  // Inside the open locker.
  const inz = -LD / 2 + .03
  const back = (i, x, y, rz, s = 1.05) => { const c = card(i, s); c.position.set(x, y, inz); c.rotation.z = rz; hero.add(c); box(.05, .016, .001, tapeMat, x, y + .17 * s, inz + .004, hero) }
  back(11, -.2, 1.84, -.05); back(14, .17, 1.82, .06); back(13, -.02, 1.42, .02, 1.1)
  box(LW - .08, .02, LD - .06, shelfMat, 0, 1.08, -.0, hero)
  box(LW - .08, .02, LD - .06, shelfMat, 0, .58, .0, hero)
  for (let i = 0; i < 6; i++) { const p = pack(i, .92, .012); p.rotation.x = -Math.PI / 2 + (Math.random() - .5) * .02; p.rotation.z = (Math.random() - .5) * .3; p.position.set(-.13, 1.105 + i * .026, .03); hero.add(p) }
  { const f = football(.98); f.position.set(.17, 1.19, .05); f.rotation.y = .3; f.rotation.x = .4; hero.add(f) }
  for (let i = 0; i < 5; i++) { const p = pack(i + 1, .98, .014); p.position.set(-.21 + i * .1, .82, -.08 + i * .012); p.rotation.x = -.16; p.rotation.y = .14; hero.add(p) }
  for (let i = 0; i < 4; i++) { const p = pack(i + 2, .95, .014); p.position.set(-.16 + i * .12, .36, -.05); p.rotation.x = -.14; p.rotation.y = -.1; hero.add(p) }

  // The door, swung wide with cards taped inside it.
  const hinge = new THREE.Group(); hinge.position.set(LW / 2 - .01, BASE + LH / 2, LD / 2); hero.add(hinge)
  hinge.rotation.y = 2.1
  const door = new THREE.Group(); door.position.set(-(LW - .05) / 2, 0, 0); hinge.add(door)
  doorFace(door, LW - .05, LH - .05, paint)
  box(.05, .11, .03, chrome, -(LW - .05) / 2 + .08, 0, .02, door)
  const dc = (i, x, y, rz, s = 1) => { const c = card(i, s); c.position.set(x, y, -.013); c.rotation.y = Math.PI; c.rotation.z = rz; door.add(c); box(.05, .016, .001, tapeMat, x, y + .165 * s, -.0155, door) }
  dc(12, -.13, .46, .05, 1.08); dc(10, .15, .4, -.06, 1.08); dc(15, -.11, -.04, -.04, 1.08); dc(9, .16, -.1, .07, 1.08)

  // The cards bursting out of it. [card, x, y, z, size, spin]
  const flyers = VIEW === 'tall'
    ? [[1, -.02, 2.06, .9, 1.25, .1], [6, -.66, 1.98, 1.3, 1.34, -.28], [2, .64, 2.0, 1.25, 1.34, .3], [0, -.5, 1.5, 1.6, 1.38, .2], [3, .54, 1.46, 1.7, 1.38, -.24]]
    : [[6, .3, 2.0, .86, 1.2, -.2], [1, .02, 1.6, 1.1, 1.36, .22], [0, .5, 1.3, 1.4, 1.42, -.1], [2, -.22, 2.02, 1.26, 1.3, -.34], [5, 1.34, 1.92, 1.1, 1.3, .3], [3, 1.42, 1.16, 1.6, 1.46, -.26]]
  flyers.forEach(([i, x, y, z, size, spin], n) => {
    const c = card(i, size)
    c.position.set(x, y, z)
    c.lookAt(x * .4, 1.2, 5.5)
    c.rotateZ(spin)
    c.rotateX((n % 3 - 1) * .24)
    c.rotateY((n % 2 ? -1 : 1) * .3)
    scene.add(c)
  })
  const flyingPacks = VIEW === 'tall' ? [[0, -.3, 2.5, 1.0, .4, .9], [1, .34, 2.54, 1.1, -.4, .9]] : [[0, .92, 2.16, .9, -.4, 1.05], [1, .12, 2.3, .9, .5, .9], [4, 1.1, 1.5, 1.0, .5, .9]]
  flyingPacks.forEach(([i, x, y, z, rz, size]) => { const p = pack(i, size, .022); p.position.set(x, y, z); p.rotation.set(-.2, rz, rz * .7); scene.add(p) })

  // The bench out front, with what's been opened on it.
  const bx = VIEW === 'tall' ? 0 : .5, bz = VIEW === 'tall' ? 2.25 : 1.95
  const b = new THREE.Group(); b.position.set(bx, 0, bz); b.rotation.y = VIEW === 'tall' ? 0 : -.1; scene.add(b)
  box(3.4, .055, .5, wood, 0, .46, 0, b)
  for (const x of [-1.4, 1.4]) { box(.05, .44, .4, std({ color: 0x20282c, metalness: .8, roughness: .35 }), x, .22, 0, b) }
  // A hand of cards laid down, leaning up a little to be read.
  ;[[7, -.5, .4], [8, -.3, .2], [9, -.1, 0], [12, .1, -.2], [15, .3, -.4]].forEach(([i, x, r], n) => { const c = card(i, 1.06); c.rotation.set(-1.02, 0, 0); c.rotateZ(r * .55); c.position.set(x * .8 + .02, .59 + (1 - Math.abs(n - 2) * .32) * .02, -.05 + Math.abs(n - 2) * .02); b.add(c) })
  for (let i = 0; i < 6; i++) { const p = pack(i, .98, .012); p.rotation.x = -Math.PI / 2; p.rotation.z = .3 + (Math.random() - .5) * .22; p.position.set(-1.06, .504 + i * .022, .02); b.add(p) }
  { const p = pack(0, 1.05, .018); p.position.set(-.72, .69, -.1); p.rotation.set(-.12, .28, -.16); b.add(p) }
  { const f = football(1.3); f.position.set(1.02, .6, .02); f.rotation.y = .24; f.rotation.z = -.05; f.rotation.x = .5; b.add(f) }
  { const r = mesh(new THREE.TorusGeometry(.05, .02, 16, 40), tapeMat, .66, .557, .06, b); r.rotation.y = .5 }

  // Light: the locker is the sun in this room.
  const area = (w, h, color, power, x, y, z, target) => { const l = new THREE.RectAreaLight(color, power, w, h); l.position.set(x, y, z); l.lookAt(...target); scene.add(l); return l }
  area(LW - .12, 1.8, 0xffa040, 30, heroX, 1.25, .2, [heroX - .05, 1.1, 3])              // out of the open locker
  area(.56, .06, 0xffd9a0, 60, heroX, 2.27, .1, [heroX, .3, .15])
  const led = VIEW === 'tall' ? 42 : 66
  area(.035, 1.9, 0xffb860, led, heroX - LW / 2 + .05, 1.2, .14, [heroX + .6, 1.2, -.1])    // LED strips up the inner walls
  area(.035, 1.9, 0xffb860, led, heroX + LW / 2 - .05, 1.2, .14, [heroX - .6, 1.2, -.1])                          // the strip inside it
  area(7, 1.2, 0xa8dcff, 1.4, -1, 3.05, 1.6, [-.8, .6, .2])                               // cold overhead on the row
  area(3.6, .9, 0xffe6c8, 7, bx, 2.9, bz + .55, [bx, .4, bz])                             // a pool on the bench
  area(4, 3, 0xfff2e2, 2.2, 1, 1.6, 6.4, [.7, 1.2, .8])                                  // the key, from behind the camera
  area(1.8, 2.2, 0x4fc3b0, 3, -4.6, 1.4, 3, [0, 1, .6])                                   // teal rim from the left
  area(1.8, 2.2, 0xff7a3a, 4, 4.4, 1.2, 2.6, [0, 1, .6])                                  // ember rim from the right

  // Camera
  const cam = new PhysicalCamera(VIEW === 'tall' ? 42 : 33, W / H, .05, 40)
  if (VIEW === 'tall') { cam.position.set(0, 1.5, 5.1); cam.lookAt(0, 1.02, 0) } else { cam.position.set(-.42, 1.42, 5.2); cam.lookAt(-.42, 1.14, 0) }
  cam.fStop = .5
  cam.focusDistance = VIEW === 'tall' ? 3.7 : 3.9
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
