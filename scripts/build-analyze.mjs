// Copyright 2026 Beacon Contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const distDir = path.resolve("dist", "assets");

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function listAssets(dir) {
  const entries = await readdir(dir);
  const assets = [];
  for (const entry of entries) {
    const file = path.join(dir, entry);
    const info = await stat(file);
    if (info.isFile()) assets.push({ file: entry, bytes: info.size });
  }
  return assets.sort((a, b) => b.bytes - a.bytes);
}

try {
  const assets = await listAssets(distDir);
  console.log("Beacon build assets:");
  for (const asset of assets) {
    console.log(`${formatKB(asset.bytes).padStart(10)}  ${asset.file}`);
  }
} catch (error) {
  console.error(`Unable to analyze ${distDir}. Run npm run build first.`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
