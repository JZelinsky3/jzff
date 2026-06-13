import type { MetadataRoute } from 'next'

// PWA manifest — makes "add TSC to your home screen" real for the Sunday
// Live game-day companion. Icons live in public/icons/ and mirror the brand
// wordmark in public/tsc-logo.svg: "TS" upright cream + "C." italic gold on
// an ink field, no frame (the OS rounds the corners itself). The `any` pair
// fill the tile; the `maskable` pair sit the same mark inside the central
// 80% safe zone so Android's circle/squircle masks never clip it.
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
