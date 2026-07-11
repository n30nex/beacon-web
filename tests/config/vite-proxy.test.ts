// Copyright 2026 Beacon Contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";

import { buildDevProxy } from "../../vite.proxy";

describe("Vite development proxy", () => {
  it("routes readiness through the same API origin as health", () => {
    const proxy = buildDevProxy("http://127.0.0.1:8080");

    expect(proxy["/readyz"]).toEqual(proxy["/healthz"]);
    expect(proxy["/readyz"]).toMatchObject({
      target: "http://127.0.0.1:8080",
      changeOrigin: true,
    });
  });
});
