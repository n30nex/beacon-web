// Copyright 2026 Beacon Contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const assetsDir = path.resolve("dist", "assets");
const budgets = {
  entryJs: 650 * 1024,
  // 2026-06-24: after lazy netgraph CSS splitting, the modern shell baseline is 118.2 KB.
  // Keep narrow headroom so new entry CSS growth still fails quickly.
  entryCss: 122 * 1024,
  routeChunks: [
    // Route budgets use the 2026-06-24 production build as a baseline with
    // narrow headroom. They catch accidental eager imports or large feature growth.
    { label: "netgraph route JS", pattern: /^NetgraphView-.*\.js$/, max: 725 * 1024 },
    { label: "map route JS", pattern: /^MapView-.*\.js$/, max: 40 * 1024 },
    { label: "maplibre vendor JS", pattern: /^maplibre-.*\.js$/, max: 1150 * 1024 },
    { label: "stats route JS", pattern: /^StatsOverview-.*\.js$/, max: 130 * 1024 },
    { label: "stats cards JS", pattern: /^cards-.*\.js$/, max: 650 * 1024 },
    { label: "live route JS", pattern: /^LiveView-.*\.js$/, max: 90 * 1024 },
    { label: "home route JS", pattern: /^HomeView-.*\.js$/, max: 25 * 1024 },
  ],
};

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function asset(namePattern) {
  const files = await readdir(assetsDir);
  const file = files.find((entry) => namePattern.test(entry));
  if (!file) throw new Error(`Missing asset matching ${namePattern}`);
  const fullPath = path.join(assetsDir, file);
  const info = await stat(fullPath);
  return { file, fullPath, bytes: info.size };
}

const failures = [];

try {
  const entryJs = await asset(/^index-.*\.js$/);
  const entryCss = await asset(/^index-.*\.css$/);

  if (entryJs.bytes > budgets.entryJs) {
    failures.push(`entry JS ${entryJs.file} is ${formatKB(entryJs.bytes)} > ${formatKB(budgets.entryJs)}`);
  }
  if (entryCss.bytes > budgets.entryCss) {
    failures.push(`entry CSS ${entryCss.file} is ${formatKB(entryCss.bytes)} > ${formatKB(budgets.entryCss)}`);
  }
  const chunkSummaries = [];
  for (const budget of budgets.routeChunks) {
    const chunk = await asset(budget.pattern);
    chunkSummaries.push(`${budget.label} ${formatKB(chunk.bytes)}`);
    if (chunk.bytes > budget.max) {
      failures.push(`${budget.label} ${chunk.file} is ${formatKB(chunk.bytes)} > ${formatKB(budget.max)}`);
    }
  }

  const entrySource = await readFile(entryJs.fullPath, "utf8");
  if (entrySource.includes("maplibre-gl") || entrySource.includes("maplibregl")) {
    failures.push("entry JS appears to include MapLibre; map code must stay route-lazy");
  }
  if (entrySource.includes("echarts")) {
    failures.push("entry JS appears to include ECharts; analytics charts must stay route-lazy");
  }

  if (failures.length > 0) {
    console.error("Beacon performance budget failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`Beacon performance budget passed: entry JS ${formatKB(entryJs.bytes)}, CSS ${formatKB(entryCss.bytes)}; ${chunkSummaries.join(", ")}`);
} catch (error) {
  console.error("Beacon performance budget could not run. Run npm run build first.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
