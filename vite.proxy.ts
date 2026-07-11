// Copyright 2026 Beacon Contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

export function buildDevProxy(proxyTarget: string) {
  const httpProxy = { target: proxyTarget, changeOrigin: true, secure: true };
  return {
    "/api": httpProxy,
    "/healthz": httpProxy,
    "/readyz": httpProxy,
    "/ws": {
      target: proxyTarget.replace(/^http/, "ws"),
      changeOrigin: true,
      secure: true,
      ws: true,
      headers: { Origin: proxyTarget },
    },
  };
}
