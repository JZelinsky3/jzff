import { Barlow_Condensed, Orbitron } from 'next/font/google'

// The cards' own type, and only the cards'. Orbitron sets the numbers and
// Barlow Condensed the names, exactly as the original printed them; the room
// around the cards uses the site's DM Serif, Inter and JetBrains Mono.
//
// Exposed as variables on each page's <main> rather than wrapped around the
// tree in a layout: the games section hides the site's hamburger with a
// sibling selector (<main> ~ .msm-root), and a wrapping div breaks that.

const display = Orbitron({
  subsets: ['latin'],
  weight: ['600', '700', '900'],
  variable: '--pe-font-display',
  display: 'swap',
})

const cond = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--pe-font-cond',
  display: 'swap',
})

export const peFonts = `${display.variable} ${cond.variable}`
