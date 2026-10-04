// Minifies the static trees that are served as-is (public/ and the almanac
// templates the league route reads at request time), so production gets the
// same treatment the Next bundles already do: no comments, no whitespace.
//
// Rewrites files IN PLACE, so it only runs on a Vercel build, where the
// checkout is thrown away afterwards. A local `npm run build` skips it and the
// working copies keep their comments. STRIP_SERVED_SOURCE=1 forces a run, for
// testing against a scratch copy of the app, never the repo itself.
//
// Fails the build rather than ship a page it may have broken: any file that
// won't parse, or whose {{LEAGUE_*}} tokens come out different, stops it.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { transform } from 'esbuild'
import { minify as minifyHtml } from 'html-minifier-terser'

const TREES = [
  'src/templates/pams',
  'src/templates/pams-mobile',
  'public/pams-template',
  'public/demo',
  'public/demo-m',
  'public/design',
  'public/league-demo',
  'public/draftday',
]

if (!process.env.VERCEL && !process.env.STRIP_SERVED_SOURCE) {
  console.log('strip-served-source: skipped (local build keeps the commented sources)')
  process.exit(0)
}

const root = process.cwd()

async function* walk(dir) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else yield p
  }
}

const js = async (code) => (await transform(code, { loader: 'js', minify: true, legalComments: 'none' })).code.trim()
const css = async (code) => (await transform(code, { loader: 'css', minify: true, legalComments: 'none' })).code.trim()

// Inline <script> blocks go through esbuild too, so one parser decides what
// is valid JS. A block it can't parse fails the file instead of quietly
// shipping with its comments. Event-handler attributes are left alone.
const html = (code) => minifyHtml(code, {
  removeComments: true,
  collapseWhitespace: true,
  conservativeCollapse: true,
  minifyJS: (text, inline) => (inline ? text : js(text)),
  minifyCSS: (text, type) => (type ? text : css(text)),
})

const MINIFIERS = { '.js': js, '.mjs': js, '.css': css, '.html': html }

// The route swaps these in per league; a minifier that rewrote one would
// leave a raw placeholder on every almanac page. Tokens inside a comment are
// meant to go with it, so those aren't counted.
const tokens = (s) => (s.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, '').match(/\{\{[A-Z_]+\}\}/g) ?? []).sort().join(',')
const headBreaks = (s) => s.split('{{LEAGUE_NAME_HEAD}}<br>').length

let files = 0
let before = 0
let after = 0
const failures = []

for (const tree of TREES) {
  for await (const file of walk(path.join(root, tree))) {
    const ext = path.extname(file)
    const run = MINIFIERS[ext]
    if (!run || file.endsWith(`.min${ext}`)) continue
    const src = await fs.readFile(file, 'utf8')
    const rel = path.relative(root, file)
    try {
      const out = await run(src)
      if (tokens(out) !== tokens(src) || headBreaks(out) !== headBreaks(src)) {
        throw new Error('template tokens changed')
      }
      await fs.writeFile(file, out)
      files++
      before += Buffer.byteLength(src)
      after += Buffer.byteLength(out)
    } catch (err) {
      failures.push(`${rel}: ${err.message.split('\n')[0]}`)
    }
  }
}

if (failures.length) {
  console.error(`strip-served-source: ${failures.length} file(s) failed`)
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}

const kb = (n) => `${Math.round(n / 1024)}KB`
console.log(`strip-served-source: ${files} files, ${kb(before)} -> ${kb(after)}`)
