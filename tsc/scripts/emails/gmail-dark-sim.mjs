#!/usr/bin/env node
// Simulate what Gmail's dark theme does to an HTML email, so a palette can be
// checked before a send instead of after.
//
// Gmail does not honour prefers-color-scheme and, in dark theme, rewrites the
// colours in the message itself. The transform is a LIGHTNESS INVERSION in
// HSL that KEEPS hue and saturation: L -> 1-L. That is why a navy #0e1620
// page comes back as pale blue and a light gold #e8c889 comes back as dark
// bronze — same hue, flipped lightness.
//
// The practical consequence, and the reason this file exists: you cannot stop
// the flip, but you choose the hue it lands on. A blue-black background
// inverts to pale blue. A warm-black background inverts to cream.
//
//   node scripts/emails/gmail-dark-sim.mjs scripts/emails/launch-notice.html
//
// Writes <name>.gmail-dark.html next to the input. Open both in a browser:
// the original is what a light inbox shows, the sim is roughly what Gmail
// dark theme shows. It is an approximation of colour only — Gmail also has
// per-client quirks — but it predicts the palette accurately enough to pick
// one, which is the decision this is for.

import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

function hexToRgb(hex) {
  const h = hex.length === 4
    ? hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
    : hex.slice(1)
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0))
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const seg = Math.floor(((h % 360) + 360) % 360 / 60)
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg]
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

export function invert(hex) {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex))
  return hslToHex(h, s, 1 - l)
}

// Run as a script (not when imported for the palette table below).
if (process.argv[1] && basename(process.argv[1]) === 'gmail-dark-sim.mjs') {
  const src = process.argv[2]
  if (!src) {
    console.error('usage: node gmail-dark-sim.mjs <file.html>')
    process.exit(1)
  }
  const html = readFileSync(src, 'utf8')
  const seen = new Map()
  // Six-digit hex only, and never one preceded by & — &#9733; is a star
  // entity, not a colour, and rewriting it turns the stars into mojibake.
  const out = html.replace(/(?<!&)#[0-9a-fA-F]{6}\b/g, (hex) => {
    const next = invert(hex)
    seen.set(hex.toLowerCase(), next)
    return next
  })
  const dest = src.replace(/\.html$/, '.gmail-dark.html')
  writeFileSync(dest, out)
  console.log(`wrote ${dest}\n`)
  for (const [from, to] of [...seen].sort()) console.log(`  ${from}  ->  ${to}`)
}
