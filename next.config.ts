import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Prevent Turbopack from bundling packages that use worker threads or native bindings
  serverExternalPackages: ["bullmq", "ioredis", "pino", "pino-pretty"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.sentry.io",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Turbopack resolve aliases (used instead of webpack config in turbo mode)
  turbopack: {
    resolveAlias: {
      canvas: "",
    },
  },
  webpack: (config, { isServer }) => {
    // Handle pdfjs-dist and react-pdf dependencies
    if (!config.resolve.alias) {
      config.resolve.alias = {};
    }
    config.resolve.alias.canvas = false;

    // Fix for react-pdf in Next.js 15
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
        fs: false,
        path: false,
      };
    }

    return config;
  },
};

// Apply next-intl plugin
const configWithIntl = withNextIntl(nextConfig);

// Only wrap with Sentry in production builds to avoid dev overhead
const isDev = process.env.NODE_ENV === "development";

export default isDev
  ? configWithIntl
  : withSentryConfig(configWithIntl, {
      // Suppresses source map uploading logs during build
      silent: true,

      // Upload source maps only in CI with auth token
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,

      // Only upload source maps when auth token is available
      authToken: process.env.SENTRY_AUTH_TOKEN,

      // Disable telemetry
      telemetry: false,

      // Hides source maps from generated client bundles
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },

      // Automatically tree-shake Sentry logger statements
      disableLogger: true,
    });
