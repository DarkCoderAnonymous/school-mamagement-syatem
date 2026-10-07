import type { NextConfig } from "next";

// Baseline security headers for every route. HSTS only in production so local
// http:// dev isn't pinned to https. No includeSubDomains/preload: the domain
// topology isn't known yet. No Content-Security-Policy yet (needs nonces for the
// next-themes inline script and the API origin in connect-src).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The app never uses next/image, so the /_next/image optimizer (the code
  // path behind the Next and sharp image-processing advisories) is switched
  // off rather than left reachable for nothing.
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
