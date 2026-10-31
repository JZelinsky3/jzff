// The stages behind the Pack Empire link previews. To redo one: copy
// og-stage-page.tsx.txt to src/app/games/pack-empire/og-art-temp/page.tsx, load
// it once so dev compiles it, run `node og-stages.mjs <dir> home builder ...`
// with puppeteer-core available, save each as public/og/pack-empire/stage-<name>.jpg
// at quality 88, LOOK at every one (a dev error page screenshots just fine), then
// delete the temp page and bump CARD_VERSION in lib/packEmpire/meta.ts.
import puppeteer from 'puppeteer-core'
const [,, out, ...scenes] = process.argv
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--force-device-scale-factor=1'] })
for (const s of scenes) {
  const p = await b.newPage()
  await p.setViewport({ width: s === 'photos' ? 1500 : 1200, height: s === 'photos' ? 460 : 630, deviceScaleFactor: 1 })
  await p.goto(`http://localhost:3000/games/pack-empire/og-art-temp/?s=${s}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await new Promise((r) => setTimeout(r, 1800))
  await p.screenshot({ path: `${out}/${s}.png`, type: 'png' })
  await p.close()
  console.log('shot', s)
}
await b.close()
