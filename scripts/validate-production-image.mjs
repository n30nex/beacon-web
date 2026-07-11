import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dockerfile = readFileSync(new URL("../.build/Dockerfile", import.meta.url), "utf8");
const caddyfile = readFileSync(new URL("../.build/Caddyfile", import.meta.url), "utf8");
const dockerignore = readFileSync(new URL("../.dockerignore", import.meta.url), "utf8");

const pinnedImages = [...dockerfile.matchAll(/^ARG\s+\w+_IMAGE=(\S+)$/gm)].map((match) => match[1]);
assert.equal(pinnedImages.length, 2, "the build and runtime base images must be explicit build arguments");
for (const image of pinnedImages) {
  assert.match(image, /@sha256:[a-f0-9]{64}$/, `base image is not digest pinned: ${image}`);
}

assert.match(dockerfile, /^USER\s+(?!0(?:\D|$))\d+:\d+$/m, "runtime must use a numeric non-root user");
assert.match(dockerfile, /^EXPOSE\s+8080$/m, "runtime must expose the unprivileged edge port");
assert.doesNotMatch(dockerfile, /docker-entrypoint\.sh|sed\s+-i/, "runtime assets must remain immutable");
assert.match(dockerfile, /org\.opencontainers\.image\.revision/, "image must carry source revision metadata");

assert.match(caddyfile, /^:8080\s*\{/m, "Caddy must listen on port 8080");
assert.match(caddyfile, /trusted_proxies\s+static/, "Cloudflare proxy trust must be explicit");
assert.match(caddyfile, /client_ip_headers\s+CF-Connecting-IP/, "Cloudflare client IP handling is missing");
assert.match(caddyfile, /@backend path \/api /, "API routes must be handled before the SPA fallback");
for (const route of ["/healthz", "/readyz", "/ws"]) {
  assert.ok(caddyfile.includes(route), `missing backend route: ${route}`);
}
assert.match(caddyfile, /reverse_proxy\s+api:8080/, "backend must use the private Compose service name");
assert.match(caddyfile, /try_files\s+\{path\}\s+\/index\.html/, "SPA history fallback is missing");

for (const ignored of ["**/.env.*", "**/config.yaml", "**/*.dump", "**/*.key"]) {
  assert.ok(dockerignore.includes(ignored), `sensitive build-context rule is missing: ${ignored}`);
}
assert.doesNotMatch(dockerignore, /^\*\.png$/m, "public PNG assets must remain in the image build context");
assert.match(dockerfile, /ARG VITE_MAP_CENTER=52\.5,-96\.8/, "production Canada map center is missing");
assert.match(dockerfile, /ARG VITE_MAP_ZOOM=3\.2/, "production Canada map zoom is missing");

console.log("Production image configuration is pinned, immutable, non-root, and edge-routed.");
