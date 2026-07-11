# BEACON Web

[![CodeQL](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/codeql.yml/badge.svg)](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/codeql.yml)
[![CI](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/ci.yml/badge.svg)](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/ci.yml)
[![Docker](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/docker-publish.yml)

Real-time LoRa mesh packet analyzer. Desktop-first, dark-mode-primary, dense information display for radio hobbyists.

Built with React 19, TypeScript, Tailwind CSS 4, TanStack Query, and TanStack Virtual.

## Deployment

Production uses the image published by `.github/workflows/docker-publish.yml`.
The image compiles the Vite application and serves it with an unprivileged
Caddy process on port 8080; it does not run the Vite development server.

The production Compose stack must name the backend service `api`, keep its port
8080 private, publish web port 8080 as the origin HTTP port, and deploy the
`ghcr.io/n30nex/beacon-web@sha256:...` reference emitted by CI. Run the web
container with a read-only filesystem and a small `/tmp` tmpfs. Caddy serves SPA
history fallbacks and proxies `/api`, `/healthz`, `/readyz`, and `/ws` to the API;
Cloudflare remains the TLS edge.

Runtime `VITE_*` variables are intentionally unsupported because production
assets are immutable. Override `VITE_API_BASE`, `VITE_WS_URL`,
`VITE_MAP_CENTER`, or `VITE_MAP_ZOOM` only as Docker build arguments.

## Local Development

```bash
npm install
cp .env.example .env    # edit with your backend URLs
npm run dev             # starts Vite dev server at http://localhost:5173
```

### Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npx vitest run` | Run tests |
| `npx tsc --noEmit` | Type-check without emitting |

### Cross-stack smoke check

After the local Beacon stack is running, use the companion backend smoke script
to verify the UI, API, WebSocket, Postgres, Redis, and key operator endpoints:

```powershell
cd F:\Beacon\beacon-server
.\scripts\Test-BeaconLocal.ps1
```

See `docs/project-status.md` for the web-focused validation checklist.

## Project Structure

```
docker/
  docker-compose.yml      # legacy/local host-proxy deployment
.build/
  Dockerfile              # production multi-stage build (Node + Caddy)
  Caddyfile               # SPA static edge and private API proxy
src/
  api/
    client.ts             # typed REST client (fetch wrapper)
    ws-manager.ts         # WebSocket connection, reconnect, subscription management
  components/             # shared UI components
  features/               # feature modules (packets, nodes, channels, map, stats)
  hooks/                  # React hooks (region, theme, WebSocket)
  lib/                    # constants, formatters, theme utilities
  types/                  # TypeScript types and enums
  App.tsx                 # providers + routing + WS init
  main.tsx                # entry point
  index.css               # Tailwind setup, theme tokens, animations
```

## Architecture

- **Region-driven**: All data queries and WS subscriptions are scoped to an IATA region code. Changing region resets the cache and resubscribes.
- **Live + historical merge**: WebSocket pushes live packets into a `LivePacketStore` buffer (capped at 500). Historical data comes from cursor-paginated REST via `useInfiniteQuery` (max 20 pages). Both are merged and deduped at render time.
- **Client-side filtering**: Filters are not part of the query key. The cache holds all packets for the current region; filters are applied via `useMemo`. Toggling a filter is instant with no refetch.
- **Reconnect with jitter**: Exponential backoff with +/-25% random jitter prevents thundering herd on server bounce.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributors are welcome — please
also read the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security issue,
see [SECURITY.md](SECURITY.md).

## License

Licensed under the GNU Affero General Public License v3.0 or later
(AGPL-3.0-or-later). See [LICENSE](LICENSE) for the full text and
[CONTRIBUTORS.md](CONTRIBUTORS.md) for acknowledgements.
