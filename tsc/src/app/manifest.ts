import type { MetadataRoute } from 'next'

// PWA manifest — makes "add TSC to your home screen" real for the Sunday
// Live game-day companion. Icons live in public/icons/: the `any` pair are
// straight exports of the framed app icon; the `maskable` pair sit the mark
// at 80% on an opaque --ink canvas so Android's circle/squircle masks never
// clip the gold frame.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'The Sunday Chronicle',
    short_name: 'TSC',
    description:
      "Your fantasy football league's full history as a polished public almanac — plus the Sunday Live game-day companion.",
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0e1620',
    theme_color: '#0e1620',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Long-press app-icon shortcuts (Android; ignored elsewhere).
    shortcuts: [
      { name: 'My leagues', url: '/dashboard/' },
      { name: 'Clubhouse', url: '/hub/' },
    ],
  }
}
