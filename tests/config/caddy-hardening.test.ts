import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const caddyfile = readFileSync(join(process.cwd(), ".build", "Caddyfile"), "utf8");
const index = readFileSync(join(process.cwd(), "index.html"), "utf8");

describe("production origin hardening", () => {
  it("redirects trusted forwarded HTTP and emits staged security headers", () => {
    expect(caddyfile).toMatch(/header X-Forwarded-Proto http/);
    expect(caddyfile).toMatch(/redir @forwarded_http https:\/\/.+ 308/);
    expect(caddyfile).toContain("Content-Security-Policy-Report-Only");
    expect(caddyfile).toContain('Strict-Transport-Security "max-age=86400"');
  });

  it("serves application-owned static assets with immutable caching", () => {
    expect(caddyfile).toContain("/fonts/*");
    expect(caddyfile).toContain("/netgraph-asset-pack/*");
    expect(caddyfile).toContain('Cache-Control "public, max-age=31536000, immutable"');
  });

  it("uses local fonts and links real crawler and install metadata", () => {
    expect(index).not.toContain("fonts.googleapis.com");
    expect(index).toContain('/manifest.webmanifest');
    expect(readFileSync(join(process.cwd(), "public", "robots.txt"), "utf8")).toContain("Sitemap:");
    expect(readFileSync(join(process.cwd(), "public", "sitemap.xml"), "utf8")).toContain("<urlset");
  });
});
