import fs from 'fs'
const puppeteer = (await import('puppeteer-core')).default
const [view, w, h, spp, out] = process.argv.slice(2)
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 3000000, args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--disable-gpu-watchdog', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] })
const tab = await browser.newPage()
tab.on('console', (m) => { const t = m.text(); if (/ERROR|rror/.test(t)) console.log(t.slice(0, 900)) })
tab.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)))
await tab.setViewport({ width: Number(w), height: Number(h) })
const gl = await tab.goto(`http://localhost:8765/index.html?view=${view}&w=${w}&h=${h}&spp=${spp}`, { waitUntil: 'load', timeout: 60000 })
let last = ''
const t0 = Date.now()
for (;;) {
  await new Promise((r) => setTimeout(r, 2000))
  const s = await tab.evaluate(() => ({ t: document.title, d: !!window.__done }))
  if (s.t !== last && Date.now() % 1 === 0) { last = s.t; console.log(s.t) }
  if (s.d || s.t.startsWith('ERROR')) break
  if (Date.now() - t0 > 3000000) break
}
const url = await tab.evaluate(() => document.querySelector('canvas').toDataURL('image/png'))
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'))
console.log('\nsaved', out, `${(Date.now() - t0) / 1000 | 0}s`)
await browser.close()
