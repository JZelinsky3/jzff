const path = require('path')
const { createJiti } = require('jiti')
const jiti = createJiti(path.resolve('.run-jiti.cjs'), { alias: { '@': path.resolve('src') } })
jiti.import(path.resolve(process.argv[2])).catch((e) => { console.error(e); process.exit(1) })
