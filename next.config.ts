import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const internalHost = process.env.TAURI_DEV_HOST || "localhost";

/**
 * HybridDAW runs inside a Tauri webview, so Next.js is built as a fully
 * static SPA (no Node server at runtime). Output lands in `out/`, which
 * `src-tauri/tauri.conf.json` points at via `build.frontendDist`.
 */
const nextConfig: NextConfig = {
  output: "export",
  // next/image's optimizer needs a server; static export requires this.
  images: {
    unoptimized: true,
  },
  // In dev, serve assets from the dev server so the Tauri webview (or a
  // physical device via TAURI_DEV_HOST) resolves them correctly.
  assetPrefix: isProd ? undefined : `http://${internalHost}:3000`,
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
