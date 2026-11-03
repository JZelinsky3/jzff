import puppeteer from 'puppeteer-core'
const ids = 'qb-patrick-mahomes-2018-canton,qb-patrick-mahomes-2018,te-travis-kelce-2021,wr-jamarr-chase-2024,wr-justin-jefferson-2022,wr-tyreek-hill-2023,qb-lamar-jackson-2019,qb-josh-allen-2022,te-rob-gronkowski-2011,wr-jerry-rice-1995,rb-christian-mccaffrey-2019,rb-marshall-faulk-2000,wr-randy-moss-2007-canton,wr-puka-nacua-2025,rb-bijan-robinson-2025,qb-tom-brady-2007,te-travis-kelce-2020'
const blind = 'qb-tom-brady-2007,rb-christian-mccaffrey-2019,wr-justin-jefferson-2022,te-travis-kelce-2020'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' })
for (const [tag, q] of [['', `ids=${ids}&back=1`], ['blind-', `ids=${blind}&blind=${blind}`]]) {
  const p = await b.newPage()
  await p.setViewport({ width: 2400, height: 1400, deviceScaleFactor: 2 })
  await p.goto(`http://localhost:3000/games/pack-empire/og-art-temp/?${q}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await new Promise((r) => setTimeout(r, 2500))
  const missing = await p.$$eval('[data-missing]', (els) => els.map((e) => e.getAttribute('data-missing')))
  if (missing.length) console.log('missing', missing)
  for (const el of await p.$$('[data-id]')) {
    const id = await el.evaluate((e) => e.getAttribute('data-id'))
    const card = await el.$('.pe-card')
    await card.screenshot({ path: `tex/${tag}${id}.png`, omitBackground: true })
  }
  await p.close()
}
await b.close()
console.log('done')
