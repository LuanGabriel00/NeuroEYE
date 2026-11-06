import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Lean, self-contained build for the Docker image (see Dockerfile).
  output: "standalone",
  // Cache Components / Partial Prefetching are off: this dashboard is
  // per-doctor and data-heavy (patients, sessions), so every route should
  // render fresh rather than ship a cached/instant shell.
  experimental: {
    agentFeedback: true,
  },
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
