import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Security headers for the whole platform: personal data lives here, so embedding in iframes
// and type sniffing are closed and the sources resources can load from are restricted.
// 'unsafe-eval' is only needed by React's dev tooling, never in production.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

// The projection screen (/proyeccion) is the only one that embeds YouTube: only there is the
// CSP opened to its domains. It handles no personal data.
const projectionHeaders = securityHeaders.map((h) =>
  h.key !== "Content-Security-Policy"
    ? h
    : {
        key: h.key,
        value: h.value
          .replace("script-src 'self'", "script-src 'self' https://www.youtube.com https://s.ytimg.com")
          .replace("img-src 'self'", "img-src 'self' https://i.ytimg.com")
          .replace("default-src 'self'", "default-src 'self'; frame-src https://www.youtube.com https://www.youtube-nocookie.com"),
      }
);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  poweredByHeader: false,
  async headers() {
    return [
      // Everything except /proyeccion gets the strict CSP (two CSPs add up and would block YouTube).
      { source: "/:path((?!proyeccion$|proyeccion/).*)", headers: securityHeaders },
      { source: "/proyeccion", headers: projectionHeaders },
    ];
  },
};

export default nextConfig;
