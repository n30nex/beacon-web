/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // set VITE_DEV_PROXY to point at a running beacon-server instance
  const proxyTarget = env.VITE_DEV_PROXY;
  const allowedHosts = (env.VITE_ALLOWED_HOSTS || "beacon.canadaverse.org")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    plugins: [react(), tailwindcss()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    server: {
      allowedHosts,
      ...(proxyTarget
        ? {
            proxy: {
              "/api": { target: proxyTarget, changeOrigin: true, secure: true },
              "/healthz": { target: proxyTarget, changeOrigin: true, secure: true },
              "/ws": {
                target: proxyTarget.replace(/^http/, "ws"),
                changeOrigin: true,
                secure: true,
                ws: true,
                headers: { Origin: proxyTarget },
              },
            },
          }
        : {}),
    },
    build: {
      // Chunks are split intentionally below; the maplibre vendor chunk is legitimately large.
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          // Split heavy, rarely-changing vendor code into its own cacheable chunks so app-code
          // edits don't invalidate them, and so the WebGL engine streams in parallel with (and
          // only when reached by) the lazy map views rather than blocking first paint. Rolldown
          // (Vite 8) only accepts the function form of manualChunks.
          manualChunks: (id) => {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("maplibre-gl") || id.includes("map-gl-js-spiderfy")) return "maplibre";
            if (id.includes("@tanstack")) return "query-vendor";
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
              return "react-vendor";
            }
            return undefined;
          },
        },
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
    },
  };
});
