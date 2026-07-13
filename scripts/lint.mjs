import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const eslintBin = join(root, "node_modules", "eslint", "bin", "eslint.js");

// Windows can terminate a large ESLint/React Compiler process before ESLint can
// report an error. Enumerate the same repository inputs and lint bounded file
// groups sequentially so local validation remains deterministic under pressure.
const lintExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx"]);
function collectFiles(relativePath) {
  const absolutePath = join(root, relativePath);
  if (!statSync(absolutePath).isDirectory()) return [relativePath];
  return readdirSync(absolutePath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const child = join(relativePath, entry.name);
      if (entry.isDirectory()) return collectFiles(child);
      const extension = entry.name.slice(entry.name.lastIndexOf("."));
      return lintExtensions.has(extension) ? [child] : [];
    });
}

const lintFiles = ["eslint.config.js", "vite.config.ts", ...collectFiles("src"), ...collectFiles("tests")];
const chunkSize = process.platform === "win32" ? 8 : 64;
const chunks = Array.from({ length: Math.ceil(lintFiles.length / chunkSize) }, (_, index) =>
  lintFiles.slice(index * chunkSize, (index + 1) * chunkSize),
);

let failed = false;
for (const chunk of chunks) {
  let result = spawnSync(process.execPath, [eslintBin, ...chunk], {
    cwd: root,
    stdio: "inherit",
  });
  const crashed = () => result.status == null || result.status < 0 || result.status === 3221225477 || result.status === 3221225501;
  if (crashed()) {
    console.warn(`[lint] ESLint crashed while checking ${chunk.join(" ")}; retrying once.`);
    result = spawnSync(process.execPath, [eslintBin, ...chunk], {
      cwd: root,
      stdio: "inherit",
    });
  }
  if (result.status !== 0) {
    console.error(`[lint] ESLint failed for ${chunk.join(" ")} with status ${result.status ?? "null"}${result.signal ? ` signal ${result.signal}` : ""}.`);
    failed = true;
  }
  if (result.error) {
    console.error(result.error);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
