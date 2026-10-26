import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Next injects inline scripts, so script-src needs 'unsafe-inline' until a nonce-based CSP is added
// (that needs dynamic rendering for every page, which conflicts with Cache Components).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'", // the browser only talks to this app; the API is called from the server
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// The original-file route is shown inside an iframe of our own pages (the PDF viewer), so it may be framed by the same origin only.
const fileCsp = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "object-src 'self'",
  "frame-ancestors 'self'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/api/chats/:id/materials/:materialId/file",
        headers: [
          { key: "Content-Security-Policy", value: fileCsp },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
