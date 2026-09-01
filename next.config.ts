import type { NextConfig } from "next";
import path from "node:path";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "img-src 'self' data: blob: http: https:",
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https:",
      // 'unsafe-eval' is required by Next.js dev mode (source maps, HMR).
      // In production it is dropped — React and Three.js do not need eval.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
      // connect-src is intentionally broad: gateway URLs are user-configured
      // at runtime and cannot be enumerated at build time.
      // Restrict further when a fixed deployment target is known.
      // blob: is required by GLTFLoader — it resolves textures packed inside a
      // .glb through fetch() on an object URL the page itself minted, which
      // connect-src governs (img-src does not cover it). Without it every
      // custom agent avatar loads untextured.
      "connect-src 'self' blob: ws: wss: http: https:",
      "media-src 'self' blob: data: http: https:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      // upgrade-insecure-requests assumes TLS terminates in front of Studio.
      // On a plain-HTTP host (a LAN deployment reached by hostname, not
      // localhost) the browser rewrites every CSS/JS/font request to https://,
      // nothing answers, and the page renders unstyled and never hydrates —
      // with no console error. Browsers exempt localhost, so this only bites
      // once Studio is reached from another machine. STUDIO_PLAIN_HTTP=1 opts
      // out; it is read at BUILD time, so changing it requires a rebuild.
      ...(process.env.STUDIO_PLAIN_HTTP === "1"
        ? []
        : ["upgrade-insecure-requests"]),
    ].join("; "),
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), browsing-topics=()",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
];

// HSTS is skipped alongside upgrade-insecure-requests: sending it from a
// plain-HTTP deployment is pointless (browsers ignore it over http) and
// actively harmful if the host is ever reached over https once.
if (
  process.env.NODE_ENV === "production" &&
  process.env.STUDIO_PLAIN_HTTP !== "1"
) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  });
}

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
