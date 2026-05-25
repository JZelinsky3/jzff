import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve trailing slashes on subdirectory index requests
  // (/demo/managers/ stays as-is rather than redirecting to /demo/managers).
  // Without this, browsers strip the trailing slash and then relative paths
  // like `../assets/css/main.css` in static demo HTML resolve one level too
  // high, breaking styles + data fetches on subfolder index pages.
  trailingSlash: true,
};

export default nextConfig;
