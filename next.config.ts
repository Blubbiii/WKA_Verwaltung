import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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
