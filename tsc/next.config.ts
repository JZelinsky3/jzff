import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve trailing slashes on subdirectory index requests
  // (/demo/managers/ stays as-is rather than redirecting to /demo/managers).
  // Without this, browsers strip the trailing slash and then relative paths
  // like `../assets/css/main.css` in static demo HTML resolve one level too
  // high, breaking styles + data fetches on subfolder index pages.
  trailingSlash: true,

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
    ]
  },
};

export default nextConfig;
