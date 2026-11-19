
import type { NextConfig } from "next";

const projectRoot = __dirname;

const nextConfig: NextConfig = {
  // Deployment and assets
  outputFileTracingRoot: projectRoot,

  assetPrefix: process.env.CDN_URL || undefined,

  outputFileTracingIncludes: {
    "/api/upload": [
      "./src/lib/chat/document-worker.mjs",
    ],
  },

  // Image optimization
  images: {
    formats: ["image/webp"],
  },

  // App Router caching and navigation
  cacheComponents: true,
  partialPrefetching: true,

  // Development UI
  devIndicators: false,

  // Build optimization
  experimental: {
    webpackBuildWorker: true,
  },

  // Preserve existing root redirect
  async redirects() {
    return [
      {
        source: "/",
        destination: "/chat",
        permanent: false,
      },
    ];
  },

  // Tailwind support when using Turbopack.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
