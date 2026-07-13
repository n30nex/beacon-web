// Copyright 2026 Beacon Contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

const origin = (process.env.BEACON_PUBLIC_ORIGIN ?? "https://beacon.canadaverse.org").replace(/\/$/, "");
const attempts = Number(process.env.BEACON_SYNTHETIC_ATTEMPTS ?? "2");
const retryDelayMs = Number(process.env.BEACON_SYNTHETIC_RETRY_DELAY_MS ?? "60000");

const checks = [
  ["root", "/", "text/html"],
  ["health", "/healthz", "application/json"],
  ["home", "/api/v1/stats/home?range=24h", "application/json"],
  ["summary", "/api/v1/stats/summary?range=24h", "application/json"],
  ["regions", "/api/v1/stats/regions?range=24h", "application/json"],
  ["topology", "/api/v1/stats/topology?range=24h&limit=25", "application/json"],
];

async function checkHttp(name, path, expectedType) {
  const started = Date.now();
  const response = await fetch(`${origin}${path}`, {
    headers: { "user-agent": "beacon-public-synthetic/1" },
    signal: AbortSignal.timeout(8_000),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  if (!contentType.includes(expectedType)) throw new Error(`${name}: unexpected content-type ${contentType}`);
  await response.arrayBuffer();
  return { name, durationMs: Date.now() - started };
}

async function checkWebSocket() {
  const started = Date.now();
  const url = `${origin.replace(/^http/, "ws")}/ws`;
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("websocket: hello timeout"));
    }, 8_000);
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.type !== "hello") return;
        clearTimeout(timeout);
        socket.close();
        resolve({ name: "websocket", durationMs: Date.now() - started });
      } catch (error) {
        clearTimeout(timeout);
        socket.close();
        reject(error);
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("websocket: connection failed"));
    });
  });
}

async function run() {
  const outcomes = await Promise.allSettled([
    ...checks.map(([name, path, expectedType]) => checkHttp(name, path, expectedType)),
    checkWebSocket(),
  ]);
  const results = outcomes.filter((outcome) => outcome.status === "fulfilled").map((outcome) => outcome.value);
  const failures = outcomes.filter((outcome) => outcome.status === "rejected").map((outcome) => String(outcome.reason));
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), origin, results }, null, 2));
  if (failures.length > 0) throw new Error(failures.join("; "));
}

let lastError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await run();
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.error(`Beacon synthetic attempt ${attempt}/${attempts} failed:`, error);
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}

throw lastError;
