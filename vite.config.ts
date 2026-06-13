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
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
    },
  };
});
