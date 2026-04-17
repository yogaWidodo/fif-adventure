import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image optimization — allow local public folder images
  images: {
    // No remote domains needed — all images are local in /public
    unoptimized: false,
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // unsafe-eval needed for Next.js dev
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://www.transparenttextures.com",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "media-src 'self' blob:",
              "worker-src blob:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // Disable x-powered-by header
  poweredByHeader: false,
};

export default nextConfig;
