// Copyright 2026 Beacon Contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

interface ModernStyleFixture {
  id: string;
  name: string;
}

const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const modernStyles = JSON.parse(
  readFileSync(new URL("../../public/modern-designs.json", import.meta.url), "utf8"),
) as ModernStyleFixture[];
const now = Date.now();
const emptyPage = { items: [], nextCursor: null, hasMore: false };
const healthStatus = {
  status: "ok",
  ready: true,
  version: "e2e",
  serverTime: now,
  mode: "playwright",
  dependencies: {
    database: { status: "ok" },
    cache: { status: "ok" },
    websocket: { status: "ok" },
  },
  brokers: [{ name: "e2e-broker", connected: true, status: "connected" }],
  rateLimits: {
    publicRest: { requestsPerMinute: 600, burst: 60, activeBuckets: 1, allowed: 12, rejected: 0 },
  },
  cacheMetrics: {
    stats: { hits: 2, misses: 1, invalidations: 0, ttlSeconds: 3600 },
  },
  backgroundTasks: {
    view_refresh: {
      runs: 1,
      successes: 1,
      failures: 0,
      lastStatus: "success",
      lastFinishedAt: now,
      lastDurationMs: 12,
    },
  },
};

const liveSummary = {
  serverTime: now,
  since: now - 15 * 60_000,
  until: now,
  latestObservationId: 42,
  packetCount: 24,
  observationCount: 48,
  activeObservers: 2,
  payloadMix: [{ payloadType: 1, payloadTypeName: "Position", count: 12 }],
  routeMix: [{ routeType: 1, routeTypeName: "Direct", count: 18 }],
  topIatas: [{ iata: "YVR", count: 48 }],
  topObservers: [{ observerId: "observer-alpha", displayName: "Observer Alpha", observerType: "station", iata: "YVR", observationCount: 48 }],
};

const statsHome = {
  serverTime: now,
  window: { since: now - 24 * 60 * 60_000, until: now, bucket: "1h" },
  overview: {
    totalPackets: 128,
    totalObservations: 256,
    activeObservers: 2,
    activeIatas: 1,
    windowHours: 24,
  },
  live: liveSummary,
  topIatas: [{ iata: "YVR", count: 256 }],
  topObservers: liveSummary.topObservers,
  topNodes: [
    {
      nodeId: "node-alpha",
      nodeName: "Alpha",
      nodeType: 1,
      nodeTypeName: "Repeater",
      iata: "YVR",
      observationCount: 128,
      lastHeard: now,
    },
  ],
};

const nodePage = {
  items: [
    {
      id: "node-alpha",
      publicKey: "aaaabbbb",
      nodeType: 1,
      nodeTypeName: "Repeater",
      name: "Alpha",
      lat: 49.2,
      lng: -123.1,
      radio: "915.0,250,11",
      iatas: [{ iata: "YVR", lastHeard: now }],
      isObserver: false,
    },
  ],
  nextCursor: null,
  hasMore: false,
};

const observerPage = {
  items: [
    {
      id: "observer-alpha",
      displayName: "Observer Alpha",
      observerType: "station",
      iata: "YVR",
      status: "online",
      radio: "915.0,250,11",
      scopes: ["#bc"],
      lastStatusAt: now,
    },
  ],
  nextCursor: null,
  hasMore: false,
};

const netgraphSnapshot = {
  serverTime: Date.now(),
  stats: {
    sourceRouteCount: 1,
    mappedRouteCount: 1,
    nodeCount: 3,
    edgeCount: 2,
    observationCount: 36,
    activeIatas: 1,
    truncatedRoutes: false,
    truncatedNodes: false,
    truncatedEdges: false,
  },
  limits: {
    routeLimit: 2500,
    nodeLimit: 2600,
    edgeLimit: 4200,
  },
  nodes: [
    {
      id: "node-alpha",
      name: "Alpha",
      publicKey: "aaaabbbb",
      nodeType: 1,
      nodeTypeName: "Repeater",
      lat: 49.2,
      lng: -123.1,
      isObserver: false,
      iatas: ["YVR"],
      routeIds: [42],
      routeCount: 1,
      observationCount: 36,
      firstSeen: Date.now() - 60_000,
      lastSeen: Date.now(),
    },
    {
      id: "node-bravo",
      name: "Bravo",
      publicKey: "bbbbcccc",
      nodeType: 2,
      nodeTypeName: "Room",
      lat: 50.1,
      lng: -122.3,
      isObserver: false,
      iatas: ["YVR"],
      routeIds: [42],
      routeCount: 1,
      observationCount: 36,
      firstSeen: Date.now() - 60_000,
      lastSeen: Date.now(),
    },
    {
      id: "node-charlie",
      name: "Charlie",
      publicKey: "ccccdddd",
      nodeType: 3,
      nodeTypeName: "Companion",
      lat: 51.1,
      lng: -121.5,
      isObserver: false,
      iatas: ["YVR"],
      routeIds: [42],
      routeCount: 1,
      observationCount: 36,
      firstSeen: Date.now() - 60_000,
      lastSeen: Date.now(),
    },
  ],
  edges: [
    {
      id: "node-alpha>node-bravo",
      fromNodeId: "node-alpha",
      toNodeId: "node-bravo",
      iatas: ["YVR"],
      routeIds: [42],
      routeCount: 1,
      observationCount: 20,
      firstSeen: Date.now() - 60_000,
      lastSeen: Date.now(),
    },
    {
      id: "node-bravo>node-charlie",
      fromNodeId: "node-bravo",
      toNodeId: "node-charlie",
      iatas: ["YVR"],
      routeIds: [42],
      routeCount: 1,
      observationCount: 16,
      firstSeen: Date.now() - 60_000,
      lastSeen: Date.now(),
    },
  ],
};

async function mockBeaconRuntime(page: Page) {
  await page.addInitScript(() => {
    class FakeBeaconWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      readonly url: string;
      readyState = FakeBeaconWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        window.setTimeout(() => {
          this.readyState = FakeBeaconWebSocket.OPEN;
          this.onopen?.(new Event("open"));
          this.emit({ v: 1, type: "hello", serverTime: Date.now() });
        }, 0);
      }

      send(data: string) {
        const message = JSON.parse(data) as { type?: string; id?: string };
        if (message.type === "subscribe") {
          window.setTimeout(() => {
            this.emit({ v: 1, type: "subscribed", id: message.id, subscriptionId: "e2e-subscription" });
          }, 0);
        }
        if (message.type === "ping") {
          window.setTimeout(() => {
            this.emit({ v: 1, type: "pong", id: message.id });
          }, 0);
        }
      }

      close() {
        this.readyState = FakeBeaconWebSocket.CLOSED;
        this.onclose?.(new CloseEvent("close"));
      }

      private emit(payload: unknown) {
        this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(payload) }));
      }
    }

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      value: FakeBeaconWebSocket,
    });
  });

  await page.route("**/healthz", (route) => route.fulfill({ json: healthStatus }));
  await page.route("**/readyz", (route) => route.fulfill({ json: healthStatus }));
  await page.route("**/api/v1/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/v1/, "");

    if (path === "/iatas") {
      return route.fulfill({ json: [{ iata: "YVR", displayName: "Vancouver", lat: 49.1947, lon: -123.1792 }] });
    }
    if (path === "/regions") {
      return route.fulfill({ json: [] });
    }
    if (path === "/stats/home") {
      return route.fulfill({ json: statsHome });
    }
    if (path === "/live/summary") {
      return route.fulfill({ json: liveSummary });
    }
    if (path === "/live/backfill") {
      return route.fulfill({ json: emptyPage });
    }
    if (path === "/brokers") {
      return route.fulfill({ json: healthStatus.brokers });
    }
    if (path === "/nodes") {
      return route.fulfill({ json: nodePage });
    }
    if (path === "/observers") {
      return route.fulfill({ json: observerPage });
    }
    if (path === "/netgraph") {
      return route.fulfill({ json: netgraphSnapshot });
    }
    if (path === "/packets" || path === "/channels") {
      return route.fulfill({ json: emptyPage });
    }
    if (path === "/routes" || path === "/traces" || path === "/scopes") {
      return route.fulfill({ json: [] });
    }

    return route.fulfill({ json: emptyPage });
  });
}

async function primeLocalStorage(page: Page, values: Record<string, string>) {
  await page.addInitScript((entries: [string, string][]) => {
    for (const [key, value] of entries) {
      window.localStorage.setItem(key, value);
    }
  }, Object.entries(values));
}

async function expectNoBlockingAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(blocking).toEqual([]);
}

const routes = [
  { label: "Home", url: "/?tab=Home&boot=0", ready: (page: Page) => expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 15_000 }) },
  { label: "Live", url: "/?tab=Live&boot=0", ready: (page: Page) => expect(page.getByText("Packet Inspector")).toBeVisible({ timeout: 15_000 }) },
  { label: "Map", url: "/?tab=Map&boot=0", ready: (page: Page) => expect(page.getByRole("button", { name: "Map Settings" })).toBeVisible({ timeout: 15_000 }) },
  { label: "Observers", url: "/?tab=Observers&boot=0", ready: (page: Page) => expect(page.getByRole("toolbar", { name: "Observer filters" })).toBeVisible({ timeout: 15_000 }) },
  { label: "Netgraph", url: "/?tab=Netgraph&boot=0", ready: (page: Page) => expect(page.getByRole("heading", { name: "Netgraph" })).toBeVisible({ timeout: 15_000 }) },
] as const;

test.beforeEach(async ({ page }) => {
  await mockBeaconRuntime(page);
});

for (const route of routes) {
  test(`${route.label} loads without console errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(route.url, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main")).toBeVisible();
    await route.ready(page);
    expect(consoleErrors).toEqual([]);
  });
}

test("core routes have no serious or critical axe violations @a11y", async ({ page }) => {
  await page.goto("/?tab=Home&boot=0", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 15_000 });
  await expectNoBlockingAxeViolations(page);
});

for (const style of modernStyles) {
  test(`modern style ${style.name} has no serious or critical axe violations @a11y`, async ({ page }) => {
    await primeLocalStorage(page, {
      "beacon-design-mode": "modern",
      "beacon-modern-style": style.id,
    });
    await page.goto("/?tab=Home&boot=0", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: new RegExp(`Appearance ${style.name}`) })).toBeVisible();
    await expectNoBlockingAxeViolations(page);
  });
}

test("keyboard can reach primary navigation and search", async ({ page }) => {
  await page.goto("/?tab=Home&boot=0", { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.getByRole("button", { name: "Search" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("Netgraph has no serious or critical axe violations @a11y", async ({ page }) => {
  await page.goto("/?tab=Netgraph&boot=0", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Netgraph" })).toBeVisible({ timeout: 15_000 });
  await expectNoBlockingAxeViolations(page);
});

for (const profile of [
  { name: "dark auto", style: "dark", contrast: "auto", tint: "profile", glow: "normal", relief: "normal" },
  { name: "dark boosted", style: "dark", contrast: "high", tint: "theme", glow: "boosted", relief: "strong" },
  { name: "light high contrast", style: "positron", contrast: "high", tint: "neutral", glow: "normal", relief: "soft" },
] as const) {
  test(`map overlay mode ${profile.name} has no serious or critical axe violations @a11y`, async ({ page }) => {
    await primeLocalStorage(page, {
      "beacon-map-style": profile.style,
      "beacon-map-contrast": profile.contrast,
      "beacon-map-tint": profile.tint,
      "beacon-map-glow": profile.glow,
      "beacon-map-relief": profile.relief,
    });
    await page.goto("/?tab=Map&boot=0", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Map Settings" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".map-profile-scope")).toHaveAttribute("data-map-contrast", profile.contrast === "auto" && profile.style === "dark" ? "normal" : profile.contrast);
    await expectNoBlockingAxeViolations(page);
  });
}

test("Netgraph node focus stays in the 3D topology workspace", async ({ page }) => {
  await page.goto("/?tab=Netgraph&boot=0&nodeId=node-alpha", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Netgraph" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "Animated 3D netgraph topology" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("complementary", { name: "Selected node focus" })).toContainText("Alpha");
  await expect(page.getByText("Verified Reach")).toHaveCount(0);
  await page.getByRole("button", { name: "Focus selected netgraph item" }).click();
  await page.getByRole("button", { name: "Focus selected node neighborhood" }).click();
  await page.getByRole("button", { name: "Switch to top netgraph view" }).click();
  await page.getByRole("button", { name: "Pause netgraph orbit" }).click();
  await page.getByRole("button", { name: "Close selected node focus" }).click();
  await expect(page).not.toHaveURL(/nodeId=node-alpha/);
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const) {
  test(`Netgraph renders a nonblank 3D canvas without horizontal overflow on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => {
      (window as Window & { __BEACON_NETGRAPH_TEST_CAPTURE?: boolean }).__BEACON_NETGRAPH_TEST_CAPTURE = true;
    });
    await page.goto("/?tab=Netgraph&boot=0", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Netgraph" })).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder("Search nodes").fill("Alpha");
    const canvas = page.locator("canvas.netgraph-three-canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("region", { name: "Animated 3D netgraph topology" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zoom into netgraph" })).toBeVisible();
    await page.getByRole("button", { name: "Zoom into netgraph" }).click();
    await page.getByRole("button", { name: "Zoom out of netgraph" }).click();
    await page.getByRole("button", { name: "Focus selected netgraph item" }).click();
    await page.getByRole("button", { name: "Switch to top netgraph view" }).click();
    await page.getByRole("button", { name: "Pause netgraph orbit" }).click();
    await page.getByRole("button", { name: "Resume netgraph orbit" }).click();
    await page.getByRole("button", { name: "Reset netgraph camera" }).click();
    await page.waitForTimeout(500);

    const nonblank = await canvas.evaluate((item) => {
      const canvasElement = item as HTMLCanvasElement;
      const gl = canvasElement.getContext("webgl2") ?? canvasElement.getContext("webgl");
      if (!gl) return false;
      const x = Math.max(0, Math.floor(canvasElement.width / 2));
      const y = Math.max(0, Math.floor(canvasElement.height / 2));
      const pixels = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return Array.from(pixels).some((value) => value !== 0);
    });
    expect(nonblank).toBe(true);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);

    const layout = await page.evaluate(() => {
      const rectFor = (rect: DOMRect) => ({
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      });
      const section = document.querySelector('section[aria-label="Netgraph"]');
      const mobileNav = document.querySelector('nav[aria-label="Mobile navigation"]');
      const footer = document.querySelector("footer");
      return {
        footerDisplay: footer ? getComputedStyle(footer).display : null,
        mobileNav: mobileNav ? rectFor(mobileNav.getBoundingClientRect()) : null,
        section: section ? rectFor(section.getBoundingClientRect()) : null,
        viewport: { height: window.innerHeight, width: window.innerWidth },
      };
    });
    expect(layout.section).not.toBeNull();
    expect(layout.section!.left).toBeGreaterThanOrEqual(-1);
    expect(layout.section!.right).toBeLessThanOrEqual(layout.viewport.width + 1);
    expect(layout.section!.height).toBeGreaterThan(240);
    if (viewport.name === "mobile") {
      expect(layout.footerDisplay).toBe("none");
      expect(layout.mobileNav).not.toBeNull();
      expect(layout.section!.bottom).toBeLessThanOrEqual(layout.mobileNav!.top + 1);
    }
  });
}
