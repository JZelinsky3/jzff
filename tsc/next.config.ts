import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Pin the file-tracing root to THIS project. There's a stray lockfile at
// /Users/jojo/package-lock.json — without this pin Next picks that as root
// and emits the "inferred your workspace root" warning on every start.
//
// LOCAL ONLY: on Vercel the repo root (jzff/) and the app root (tsc/)
// differ, and pinning the tracing root to the app dir makes the builder
// look for .next manifests at the wrong level — builds die with
// "ENOENT: lstat '/vercel/path0/.next/routes-manifest-deterministic.json'".
// Vercel's builder manages the tracing root itself, so skip the pin there.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  ...(process.env.VERCEL ? {} : { outputFileTracingRoot: projectRoot }),

  // Preserve trailing slashes on subdirectory index requests
  // (/demo/managers/ stays as-is rather than redirecting to /demo/managers).
  // Without this, browsers strip the trailing slash and then relative paths
  // like `../assets/css/main.css` in static demo HTML resolve one level too
  // high, breaking styles + data fetches on subfolder index pages.
  trailingSlash: true,

  // Baseline security headers applied to every response. CSP is intentionally
  // omitted — several pages use inline <style>/<script> via
  // dangerouslySetInnerHTML (JSON-LD, the hub theme bootstrap, pricing
  // feature labels) and a strict CSP would need a per-request nonce wired
  // through each one. The headers below are the no-regret subset.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          { key: 'X-DNS-Prefetch-Control',    value: 'on' },
        ],
      },
    ]
  },

  // Manager Hub chapter consolidation (Phase 7 of the Issues redesign).
  // Four old narrative chapters folded into the new Issues; their data lives
  // in II (Legacy), IV (Seasons), and V (Vault) now. Permanent so bookmarks
  // and shares carry forward without breaking.
  async redirects() {
    return [
      { source: '/manager/:slug/title-chase',          destination: '/manager/:slug/seasons', permanent: true },
      { source: '/manager/:slug/title-chase/:rest*',   destination: '/manager/:slug/seasons', permanent: true },
      { source: '/manager/:slug/draft-room',           destination: '/manager/:slug/dynasty', permanent: true },
      { source: '/manager/:slug/draft-room/:rest*',    destination: '/manager/:slug/dynasty', permanent: true },
      { source: '/manager/:slug/feuds',                destination: '/manager/:slug/legacy',  permanent: true },
      { source: '/manager/:slug/feuds/:rest*',         destination: '/manager/:slug/legacy',  permanent: true },
      { source: '/manager/:slug/ledger',               destination: '/manager/:slug/vault',   permanent: true },
      { source: '/manager/:slug/ledger/:rest*',        destination: '/manager/:slug/vault',   permanent: true },

      // Sunday Live promoted out of live-season/ to its own top-level chapter.
      { source: '/leagues/:slug/live-season/sunday-live',        destination: '/leagues/:slug/sunday-live', permanent: true },
      { source: '/leagues/:slug/live-season/sunday-live/:rest*', destination: '/leagues/:slug/sunday-live/:rest*', permanent: true },
    ]
  },
};

export default nextConfig;
