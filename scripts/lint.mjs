import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const eslintBin = join(root, "node_modules", "eslint", "bin", "eslint.js");

// Windows local linting can crash inside one large ESLint/React Compiler process.
// Keep the same coverage, but run stable chunks sequentially.
const chunks = [
  ["eslint.config.js", "vite.config.ts"],
  ["src/App.tsx", "src/main.tsx", "src/api", "src/hooks", "src/lib", "src/types"],
  ["src/components"],
  ["src/features/atlas", "src/features/channels", "src/features/observers"],
  ["src/features/live"],
  ["src/features/map"],
  ["src/features/nodes"],
  ["src/features/packets"],
  ["src/features/routes", "src/features/stats", "src/features/traces"],
  ["tests"],
];

let failed = false;
for (const chunk of chunks) {
  const result = spawnSync(process.execPath, [eslintBin, ...chunk], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    failed = true;
  }
  if (result.error) {
    console.error(result.error);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
