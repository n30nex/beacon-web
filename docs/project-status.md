# Beacon Web Project Status

Last updated: 2026-06-21

`beacon-web` is the active React/Vite/Tailwind operator console for Beacon. The companion backend is `F:\Beacon\beacon-server`; CoreScope is intentionally out of scope for current Beacon work.

## Local Runtime

| Surface | Default |
| --- | --- |
| Startup | `F:\Beacon\Start-BeaconLocal.ps1` |
| Web UI | `http://127.0.0.1:5174` from the launcher, or the active Vite port if started manually |
| API | `http://127.0.0.1:8080/api/v1` |
| WebSocket | `ws://127.0.0.1:8080/ws` |

## Validation

```powershell
cd F:\Beacon\beacon-web
npm run lint
npm test
npm run build

cd F:\Beacon\beacon-server
.\scripts\Test-BeaconLocal.ps1
```

The tracked cross-stack smoke script lives in `beacon-server\scripts\Test-BeaconLocal.ps1` because the workspace root is not a Git repository.

The web test suite also includes `tests/contracts/openapi-contract.test.ts`, which reads `..\beacon-server\docs\swagger.json` and verifies the REST endpoints and response fields that the operator UI depends on. Regenerate backend Swagger before changing API shapes.

## UI Improvement Tracks

- Complete the modern glass design mode as a first-class skin while preserving the retro CRT themes.
- Keep shared primitives consistent: shell, tabs, bottom nav, tables, filter bars, dropdowns, panels, modals, drawers, loading states, empty states, search, and stat cards.
- Browser-QA every major surface at desktop and phone widths: Atlas, Live, Map, Packets, Stats, Nodes, Observers, Routes, Traces, and Channels.
- Keep keyboard and drilldown flows consistent: global search, escape-to-close overlays, selected row state, packet/node/observer/route links, and copyable identifiers.
