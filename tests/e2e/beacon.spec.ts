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
  version: "e2e",
  serverTime: now,
};
const readinessStatus = { status: "ok", ready: true, serverTime: now };
const brokerStatus = [{ name: "e2e-broker", connected: true, status: "connected" }];
const systemStatus = {
  status: "ok",
  serverTime: now,
  ingest: { status: "ok" },
  liveTraffic: { status: "ok" },
  analytics: { status: "ok" },
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

const statsSummary = {
  ...statsHome,
  health: {
    totalObservers: 2,
    staleObservers: 0,
    lowBattery: 0,
    highNoise: 0,
    highAirtime: 0,
    queueBacklog: 0,
    receiveErrors: 0,
    noTelemetry: 0,
  },
  nodeTypes: [{ nodeType: 1, nodeTypeName: "repeater", count: 1 }],
  payloadMix: liveSummary.payloadMix,
  radioPresets: [{ preset: "915.0,250,11", iata: "YVR", sourceType: "node", count: 4 }],
  routeMix: liveSummary.routeMix,
  scopes: [{ name: "#bc", packetCount: 24, observerCount: 1, nodeCount: 1 }],
};

const statsObservations = [
  { hour: now - 3_600_000, iata: "YVR", observationCount: 12, uniquePackets: 6, activeObservers: 1 },
  { hour: now, iata: "YVR", observationCount: 48, uniquePackets: 24, activeObservers: 2 },
];

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
      readonly isBeaconSocket: boolean;
      hasBeaconSubscription = false;
      readyState = FakeBeaconWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string, protocols?: string | string[]) {
        this.url = url;
        const protocolList = Array.isArray(protocols) ? protocols : protocols ? [protocols] : [];
        this.isBeaconSocket = !protocolList.includes("vite-hmr") && new URL(url, window.location.href).pathname === "/ws";
        if (this.isBeaconSocket) beaconSockets.push(this);
        window.setTimeout(() => {
          this.readyState = FakeBeaconWebSocket.OPEN;
          this.onopen?.(new Event("open"));
          if (this.isBeaconSocket) {
            this.emit({ v: 1, type: "hello", serverTime: Date.now(), connectionId: "e2e-connection" });
          }
        }, 0);
      }

      send(data: string) {
        const message = JSON.parse(data) as { type?: string; id?: string };
        if (message.type === "subscribe") {
          this.hasBeaconSubscription = true;
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

      emit(payload: unknown) {
        this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(payload) }));
      }
    }

    const beaconSockets: FakeBeaconWebSocket[] = [];
    const beaconWindow = window as typeof window & {
      __beaconE2E: {
        emitWebSocket: (payload: unknown) => void;
        webSocketInstanceCount: () => number;
      };
    };
    beaconWindow.__beaconE2E = {
      emitWebSocket(payload: unknown) {
        for (const socket of beaconSockets) {
          if (socket.hasBeaconSubscription && socket.readyState === FakeBeaconWebSocket.OPEN) socket.emit(payload);
        }
      },
      webSocketInstanceCount() {
        return beaconSockets.filter((socket) => socket.hasBeaconSubscription && socket.readyState !== FakeBeaconWebSocket.CLOSED).length;
      },
    };

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      value: FakeBeaconWebSocket,
    });
  });

  await page.route("**/healthz", (route) => route.fulfill({ json: healthStatus }));
  await page.route("**/readyz", (route) => route.fulfill({ json: readinessStatus }));
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
    if (path === "/system/status") {
      return route.fulfill({ json: systemStatus });
    }
    if (path === "/stats/summary") {
      return route.fulfill({ json: statsSummary });
    }
    if (path === "/stats/observations") {
      return route.fulfill({ json: statsObservations });
    }
    if (path === "/live/summary") {
      return route.fulfill({ json: liveSummary });
    }
    if (path === "/live/backfill") {
      return route.fulfill({ json: emptyPage });
    }
    if (path === "/brokers") {
      return route.fulfill({ json: brokerStatus });
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

function livePacketObservation(id: number, isFirstObservation = true) {
  return {
    v: 1,
    type: "event",
    event: "packetObservation",
    data: {
      packetHash: `e2e-packet-${id}`,
      packet: {
        payloadType: 1,
        payloadTypeName: "Position",
        routeType: 1,
        routeTypeName: "Direct",
        isFirstObservation,
        observationCount: 1,
      },
      observation: {
        id,
        observerId: "observer-alpha",
        observerName: "Observer Alpha",
        iata: "YVR",
        heardAt: Date.now(),
        rssi: -81,
        snr: 5.5,
        sourceBroker: "e2e-broker",
      },
    },
  };
}

async function emitBeaconWebSocket(page: Page, payload: unknown) {
  await page.evaluate((message) => {
    const beaconWindow = window as typeof window & {
      __beaconE2E: { emitWebSocket: (value: unknown) => void };
    };
    beaconWindow.__beaconE2E.emitWebSocket(message);
  }, payload);
}

async function beaconWebSocketInstanceCount(page: Page) {
  return page.evaluate(() => {
    const beaconWindow = window as typeof window & {
      __beaconE2E: { webSocketInstanceCount: () => number };
    };
    return beaconWindow.__beaconE2E.webSocketInstanceCount();
  });
}

async function primeLocalStorage(page: Page, values: Record<string, string>) {
  await page.addInitScript((entries: [string, string][]) => {
    for (const [key, value] of entries) {
      window.localStorage.setItem(key, value);
    }
  }, Object.entries(values));
}

async function openRouteForA11y(page: Page, route: (typeof routes)[number], context: string) {
  await test.step(`${context}: open ${route.label}`, async () => {
    await page.goto(route.url, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main"), `${context}: app main should be visible`).toBeVisible();
    await route.ready(page);
  });
}

async function expectNoBlockingAxeViolations(page: Page, context: string) {
  const results = await test.step(`${context}: run axe`, () => new AxeBuilder({ page }).withTags(axeTags).analyze());
  const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  const summary = blocking.map((violation) => ({
    help: violation.help,
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
  }));
  expect(summary, `${context}: serious or critical axe violations`).toEqual([]);
}

const routes = [
  { label: "Home", url: "/?tab=Home&boot=0", ready: (page: Page) => expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 15_000 }) },
  { label: "Live", url: "/?tab=Live&boot=0", ready: (page: Page) => expect(page.getByLabel("Node loading progress")).toBeVisible({ timeout: 15_000 }) },
  { label: "Map", url: "/?tab=Map&boot=0", ready: (page: Page) => expect(page.getByRole("button", { name: "Map Settings" })).toBeVisible({ timeout: 15_000 }) },
  { label: "Analytics", url: "/?tab=Analytics&boot=0", ready: (page: Page) => expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible({ timeout: 15_000 }) },
  { label: "Observers", url: "/?tab=Observers&boot=0", ready: (page: Page) => expect(page.getByRole("toolbar", { name: "Observer filters" })).toBeVisible({ timeout: 15_000 }) },
  { label: "Netgraph", url: "/?tab=Netgraph&boot=0", ready: (page: Page) => expect(page.getByRole("region", { name: "Animated 3D netgraph topology" })).toBeVisible({ timeout: 15_000 }) },
] as const;

const routeA11yRoutes = routes.filter((route) => route.label !== "Netgraph");

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

for (const route of routeA11yRoutes) {
  test(`${route.label} route has no serious or critical axe violations @a11y @a11y-route`, async ({ page }) => {
    await openRouteForA11y(page, route, `${route.label} route a11y`);
    await expectNoBlockingAxeViolations(page, `${route.label} route`);
  });
}

for (const style of modernStyles) {
  test(`modern style ${style.name} has no serious or critical axe violations @a11y @a11y-style`, async ({ page }) => {
    await primeLocalStorage(page, {
      "beacon-design-mode": "modern",
      "beacon-modern-style": style.id,
    });
    await page.goto("/?tab=Home&boot=0", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: new RegExp(`Appearance ${style.name}`) })).toBeVisible();
    await expectNoBlockingAxeViolations(page, `modern style ${style.name}`);
  });
}

test("keyboard can reach primary navigation and search", async ({ page }) => {
  await page.goto("/?tab=Home&boot=0", { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.getByRole("button", { name: "Search", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("mobile Home keeps KPI density and rankings ordered without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?tab=Home&boot=0", { waitUntil: "domcontentloaded" });

  const kpis = page.getByRole("region", { name: "Home KPIs" });
  const activity = page.getByRole("region", { name: "Activity now" });
  const myNodes = page.getByRole("region", { name: "My Nodes" });
  const rankings = page.getByRole("region", { name: "Mobile rankings" });
  await expect(kpis).toBeVisible();
  await expect(activity).toBeVisible();
  await expect(myNodes).toBeVisible();
  await expect(rankings).toBeVisible();

  const kpiBoxes = await kpis.locator(":scope > *").evaluateAll((items) => items.slice(0, 4).map((item) => item.getBoundingClientRect()));
  expect(kpiBoxes).toHaveLength(4);
  expect(Math.abs(kpiBoxes[0].top - kpiBoxes[1].top)).toBeLessThan(2);
  expect(kpiBoxes[2].top).toBeGreaterThan(kpiBoxes[0].top);

  const [activityBox, nodesBox, rankingBox] = await Promise.all([activity.boundingBox(), myNodes.boundingBox(), rankings.boundingBox()]);
  expect(activityBox!.y).toBeLessThan(rankingBox!.y);
  expect(nodesBox!.y).toBeLessThan(rankingBox!.y);
  await expect(rankings.getByRole("button", { name: "nodes" })).toHaveAttribute("aria-pressed", "true");
  await rankings.getByRole("button", { name: "observers" }).click();
  await expect(rankings.getByText("Observer Alpha")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});

test("Home live counters update from one WebSocket without refetching the Home snapshot", async ({ page }) => {
  let homeRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/api/v1/stats/home")) homeRequests += 1;
  });

  await page.goto("/?tab=Home&boot=0", { waitUntil: "domcontentloaded" });

  const packets = page.locator("[data-live-metric='packets']");
  const observations = page.locator("[data-live-metric='observations']");
  const live = page.locator("[data-live-metric='live']");
  const routes = page.locator("[data-live-metric='routes']");
  const livePackets = page.locator("[data-live-metric='live-packets']");

  await expect(packets).toHaveText("128");
  await expect(observations).toHaveText("256");
  await expect(live).toHaveText("48");
  await expect(routes).toHaveText("18");
  await expect(livePackets).toHaveText("24");
  await expect.poll(() => beaconWebSocketInstanceCount(page)).toBe(1);
  await page.waitForTimeout(500);
  const authoritativeRequests = homeRequests;

  await emitBeaconWebSocket(page, livePacketObservation(43));

  await expect(packets).toHaveText("129");
  await expect(observations).toHaveText("257");
  await expect(live).toHaveText("49");
  await expect(routes).toHaveText("19");
  await expect(livePackets).toHaveText("25");
  await expect(packets).toHaveClass(/home-live-metric-value/);
  await expect(packets).toHaveAttribute("data-pulse-phase", /^(a|b)$/);
  await page.waitForTimeout(350);

  expect(homeRequests).toBe(authoritativeRequests);
  expect(await beaconWebSocketInstanceCount(page)).toBe(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});

test("mobile Home live pulse honors reduced motion and remains accessible @a11y", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "390px reduced-motion coverage runs in the mobile project");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?tab=Home&boot=0", { waitUntil: "domcontentloaded" });

  const packets = page.locator("[data-live-metric='packets']");
  await expect(packets).toHaveText("128");
  await expect.poll(() => beaconWebSocketInstanceCount(page)).toBe(1);
  await emitBeaconWebSocket(page, livePacketObservation(43));
  await expect(packets).toHaveText("129");
  await expect(packets).toHaveAttribute("data-pulse-phase", /^(a|b)$/);
  expect(await packets.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
  await expectNoBlockingAxeViolations(page, "mobile Home after a live update");
});

test("System leads with coarse degraded state and exposes no raw diagnostics", async ({ page }) => {
  await page.route("**/api/v1/system/status", (route) => route.fulfill({ json: {
    status: "degraded",
    serverTime: now,
    ingest: { status: "ok" },
    liveTraffic: { status: "ok" },
    analytics: { status: "degraded" },
  } }));
  await page.goto("/?tab=System&boot=0", { waitUntil: "domcontentloaded" });

  const panel = page.locator(".runtime-status-panel");
  await expect(page.getByRole("heading", { name: "System" })).toBeVisible();
  await expect(panel.getByText("DEGRADED", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText("Analytics")).toBeVisible();
  await expect(panel.getByText("Raw diagnostics")).toHaveCount(0);
  await expect(panel.getByText("Dependencies")).toHaveCount(0);
});

test("mobile Live exposes four primary controls and reduced-motion defaults", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?tab=Live&boot=0", { waitUntil: "domcontentloaded" });

  const dock = page.locator(".live-command-dock--compact");
  await expect(dock).toBeVisible({ timeout: 15_000 });
  await expect(dock.getByRole("button")).toHaveCount(4);
  for (const name of ["Pause", "Focus", "Console", "Settings"]) {
    const button = dock.getByRole("button", { name });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByLabel("Node loading progress")).toContainText("Nodes 1 / 1");

  await dock.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "View settings" });
  await expect(settings).toBeVisible();
  for (const name of ["Trails", "Pace", "Heat", "Color"]) {
    await expect(settings.getByRole("button", { name })).toBeVisible();
  }
  await expect(settings.getByRole("button", { name: "Trails" })).toHaveAttribute("aria-pressed", "false");
  await expect(settings.getByRole("button", { name: "Pace" })).toHaveAttribute("aria-pressed", "false");
});

test("saved investigation lifecycle survives export, import, and history navigation", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const source = "/?tab=Nodes&nodeId=node-alpha&q=alpha";
  await page.goto(`/?tab=Investigations&create=1&source=${encodeURIComponent(source)}&boot=0`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Investigation name").fill("Road test");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const rename = page.getByLabel("Rename Road test");
  await rename.fill("Road test renamed");
  await page.getByRole("heading", { name: "Investigations" }).click();
  await expect(page.getByLabel("Rename Road test renamed")).toBeVisible();

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("tab=Nodes");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const download = await downloadPromise;
  const exportPath = await download.path();
  expect(exportPath).toBeTruthy();

  await page.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/tab=Nodes/);
  await expect(page).toHaveURL(/nodeId=node-alpha/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Investigations" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(/No saved investigations/)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(exportPath!);
  await expect(page.getByLabel("Rename Road test renamed")).toBeVisible();
});

test("Netgraph has no serious or critical axe violations @a11y @a11y-netgraph", async ({ page }) => {
  await page.goto("/?tab=Netgraph&boot=0", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "Animated 3D netgraph topology" })).toBeVisible({ timeout: 15_000 });
  await expectNoBlockingAxeViolations(page, "Netgraph");
});

for (const profile of [
  { name: "dark auto", style: "dark", contrast: "auto", tint: "profile", glow: "normal", relief: "normal" },
  { name: "dark boosted", style: "dark", contrast: "high", tint: "theme", glow: "boosted", relief: "strong" },
  { name: "light high contrast", style: "positron", contrast: "high", tint: "neutral", glow: "normal", relief: "soft" },
] as const) {
  test(`map overlay mode ${profile.name} has no serious or critical axe violations @a11y @a11y-map`, async ({ page }) => {
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
    await expectNoBlockingAxeViolations(page, `map overlay mode ${profile.name}`);
  });
}

test("Netgraph node focus stays in the 3D topology workspace", async ({ page }) => {
  test.slow();
  await primeLocalStorage(page, { "beacon.netgraph.quality.v1": "low-power" });
  await page.addInitScript(() => sessionStorage.setItem("beacon.netgraph.intro-complete.v1", "1"));
  await page.goto("/?tab=Netgraph&boot=0&nodeId=node-alpha", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "Animated 3D netgraph topology" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("complementary", { name: "Selected node focus" })).toContainText("Alpha");
  await expect(page.getByText("Verified Reach")).toHaveCount(0);
  await page.getByRole("button", { name: "Focus selected netgraph item" }).click();
  await page.getByRole("button", { name: "Focus selected node neighborhood" }).click();
  await page.getByRole("button", { name: "Close selected node focus" }).click();
  await expect(page).not.toHaveURL(/nodeId=node-alpha/);
});

test("Netgraph search, Geo alternate, and immersive Escape stay in one workspace", async ({ page }) => {
  test.slow();
  await primeLocalStorage(page, { "beacon.netgraph.quality.v1": "low-power" });
  await page.addInitScript(() => sessionStorage.setItem("beacon.netgraph.intro-complete.v1", "1"));
  await page.goto("/?tab=Netgraph&boot=0", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "Animated 3D netgraph topology" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Open netgraph settings" }).click();
  await expect(page.getByRole("button", { name: /Galaxy/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close netgraph settings" }).click();

  await page.getByRole("combobox", { name: "Search Netgraph nodes" }).fill("Alpha");
  await page.getByRole("option", { name: /Alpha/ }).click();
  await expect(page).toHaveURL(/nodeId=node-alpha/);
  await expect(page.getByRole("complementary", { name: "Selected node focus" })).toContainText("Alpha");

  await page.getByRole("button", { name: "Open netgraph settings" }).click();
  const geoLayout = page.getByRole("button", { name: /Geo Constellation/ });
  await geoLayout.click();
  await expect(geoLayout).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close netgraph settings" }).click();

  await page.getByRole("button", { name: "Enter immersive Netgraph" }).click();
  await expect(page.locator(".app-shell-topbar")).toHaveCount(0);
  await expect(page.locator(".app-shell-tabs")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".app-shell-topbar")).toBeVisible();
});

test("Netgraph pointer-lock rejection falls back without console errors", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Pointer lock is a desktop-only control path");
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    sessionStorage.setItem("beacon.netgraph.intro-complete.v1", "1");
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException("test denial", "NotAllowedError"));
  });
  await page.goto("/?tab=Netgraph&boot=0", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "Animated 3D netgraph topology" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "More netgraph camera controls" }).click();
  await page.getByRole("menuitem", { name: "Free flight" }).click();
  await page.getByRole("button", { name: "Begin flight" }).click();
  await expect(page.getByText(/Pointer lock was unavailable/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("Netgraph mobile flight pads remain hidden until flight is activated", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch-flight controls run in the mobile project");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => sessionStorage.setItem("beacon.netgraph.intro-complete.v1", "1"));
  await page.goto("/?tab=Netgraph&boot=0", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "Animated 3D netgraph topology" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("application", { name: "Netgraph movement control" })).toHaveCount(0);
  await page.getByRole("button", { name: "More netgraph camera controls" }).click();
  await page.getByRole("menuitem", { name: "Free flight" }).click();
  await page.getByRole("button", { name: "Begin flight" }).click();
  await expect(page.getByRole("application", { name: "Netgraph movement control" })).toBeVisible();
  await expect(page.getByRole("application", { name: "Netgraph look control" })).toBeVisible();
  await page.getByRole("button", { name: "Exit flight" }).click();
  await expect(page.getByRole("application", { name: "Netgraph movement control" })).toHaveCount(0);
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const) {
  test(`Netgraph renders a nonblank 3D canvas without horizontal overflow on ${viewport.name}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== viewport.name, `Covered by the ${viewport.name} project`);
    test.slow();
    await primeLocalStorage(page, { "beacon.netgraph.quality.v1": "low-power" });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => {
      (window as Window & { __BEACON_NETGRAPH_TEST_CAPTURE?: boolean }).__BEACON_NETGRAPH_TEST_CAPTURE = true;
      sessionStorage.setItem("beacon.netgraph.intro-complete.v1", "1");
    });
    await page.goto("/?tab=Netgraph&boot=0", { waitUntil: "domcontentloaded" });
    if (viewport.name === "desktop") await expect(page.getByRole("heading", { name: "Netgraph" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("combobox", { name: "Search Netgraph nodes" }).fill("Alpha");
    await page.getByRole("option", { name: /Alpha/ }).click();
    const canvas = page.locator("canvas.netgraph-three-canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("region", { name: "Animated 3D netgraph topology" })).toBeVisible();
    await page.getByRole("button", { name: "Focus selected netgraph item" }).click();
    await page.getByRole("button", { name: "More netgraph camera controls" }).click();
    await page.getByRole("menuitem", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "More netgraph camera controls" }).click();
    await page.getByRole("menuitem", { name: "Zoom out" }).click();
    await page.getByRole("button", { name: "More netgraph camera controls" }).click();
    await page.getByRole("menuitem", { name: "Top view" }).click();
    await page.getByRole("button", { name: /netgraph orbit/ }).click();
    await page.getByRole("button", { name: /netgraph orbit/ }).click();
    await page.getByRole("button", { name: "Show netgraph overview" }).click();
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
