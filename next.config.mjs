import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output produces a minimal self-contained server bundle so the
  // Docker runtime stage stays small and does not need the full node_modules.
  output: "standalone",
  // Pin the file-tracing root to this project. Without it, Next may infer a
  // parent directory (e.g. if an unrelated lockfile exists above) and trace the
  // wrong files into the standalone build.
  outputFileTracingRoot: projectRoot,
  reactStrictMode: true,
  poweredByHeader: false,
  // The scheduler/travel/db code is server-only. pg and pg-boss must never be
  // bundled for the browser. (Renamed from experimental in Next 15.)
  serverExternalPackages: ["pg", "pg-boss", "drizzle-orm"],
  webpack: (config) => {
    // Source uses explicit `.js` import specifiers (correct for the Node ESM
    // ops bundles run outside webpack). Teach webpack to resolve them to the
    // real `.ts`/`.tsx` sources so the same imports work in both worlds.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
