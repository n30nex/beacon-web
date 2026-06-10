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

  return {
    plugins: [react(), tailwindcss()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    server: proxyTarget
      ? {
          proxy: {
            "/api": { target: proxyTarget, changeOrigin: true, secure: true },
            "/ws": {
              target: proxyTarget.replace(/^http/, "ws"),
              changeOrigin: true,
              secure: true,
              ws: true,
              headers: { Origin: proxyTarget },
            },
          },
        }
      : undefined,
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
    },
  };
});
