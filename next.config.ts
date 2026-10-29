import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Security headers for the whole platform: personal data lives here, so embedding in iframes
// and type sniffing are closed. The pages' Content-Security-Policy is set per request with a
// nonce in src/proxy.ts; API routes only answer JSON, so they get a policy that allows nothing.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const apiHeaders = [
  { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" },
  // Responses with personal data must not stay in browser or proxy caches (e.g. after logout).
  { key: "Cache-Control", value: "no-store" },
];

const nextConfig: NextConfig = {
  // Self-contained server (only the files the app uses) for a small production image.
  output: "standalone",
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: apiHeaders },
    ];
  },
};

export default nextConfig;
