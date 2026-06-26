# Beacon NetGraph Asset Pack — Style Sheet

Generated pack seed family: `872133`  
Runtime target: Web/WebGL/Canvas, desktop overlays, dashboards, maps, control panels, alerts, onboarding, and general sci-fi UI scenes.

## Visual language

- Hyper-detailed cosmic sci-fi and neural-network atmosphere.
- Lighting is consistent across the pack: cyan rim from upper-left/front, blue core emission from center, controlled magenta/lilac reactive light from rear/right.
- Assets are designed as emissive sprites with soft procedural glow rather than harsh outlines.
- Transparent runtime sprites use straight RGBA alpha. For WebGL pipelines, convert to premultiplied alpha or enable premultiplied blending at upload time.
- Opaque backgrounds are RGB PNGs.
- No runtime image contains text, logos, or watermarks. The `previews/` folder is non-runtime only.

## Palette

| Token | Hex |
|---|---:|
| `void` | `#030612` |
| `deep_indigo` | `#0C1230` |
| `indigo` | `#1C2362` |
| `cobalt` | `#194EB4` |
| `blue_core` | `#267EFF` |
| `cyan` | `#00DAFF` |
| `teal` | `#00FFCD` |
| `lilac` | `#AA8EFF` |
| `magenta` | `#FF30AA` |
| `hot_magenta` | `#FF1F70` |
| `amber` | `#FFB050` |
| `white_blue` | `#E0F5FF` |
| `glass` | `#1C3452` |

Recommended CSS variables:

```css
:root {
  --beacon-void: #030612;
  --beacon-deep-indigo: #0C1230;
  --beacon-indigo: #1C2362;
  --beacon-cobalt: #194EB4;
  --beacon-blue-core: #267EFF;
  --beacon-cyan: #00DAFF;
  --beacon-teal: #00FFCD;
  --beacon-lilac: #AA8EFF;
  --beacon-magenta: #FF30AA;
  --beacon-alert: #FF1F70;
  --beacon-amber: #FFB050;
}
```

## Glow / bloom ranges

Use additive or screen-like blend for packets, trails, edge beams, halos, focus pulses, star drift, and dust sheets.

| Variant | Suggested opacity | Suggested blend | Usage |
|---|---:|---|---|
| `default` | 0.72–0.92 | `screen` / additive | normal graph state |
| `soft` | 0.28–0.60 | `screen` | background ambience, low-priority overlays |
| `active` | 0.90–1.00 | additive | active packet motion, hover, live updates |
| `alert` | 0.82–1.00 | additive with clamp | warning/error/attention states |
| node `selected` | 0.95–1.00 | source-over + mild bloom | selected/focused node |
| node `warning` | 0.85–1.00 | additive magenta/amber accents | degraded/unknown/error states |

Bloom pass recommendations:

- Threshold: `0.55–0.72`
- Radius: `6–18 px` at 1080p
- Intensity: `0.18–0.42` for dashboards, `0.35–0.65` for cinematic scenes
- Clamp highlights before UI text is composited so overlays remain readable.

## Normal / light assumptions

These assets do not ship normal maps. They are painted as emissive, glassy, volumetric sprites.

- Key/rim light: cyan, upper-left/front, approximately 30° elevation.
- Fill: deep indigo/blue from lower center.
- Reactive/back light: lilac/magenta from upper-right/rear.
- Core emission: blue/cyan, centered, with soft radial falloff.
- Dust/lens streaks: horizontal or slightly diagonal, alpha-soft.

## Small-display readability

Node silhouettes use a strong central luminous core and distinct outer geometry so identity remains visible at 64px and survives at 32px. Suggested implementation:

- Use mipmaps for all node and packet sprites.
- Prefer nearest higher-resolution source when scaling below 64px.
- Draw selected/active halos outside the sprite bounds when possible, or use the supplied `halo_focus` / `focus_pulse` extras.
- Keep labels/text composited separately above node sprites; do not bake labels into the assets.

## Folder conventions

- `backgrounds/2560x1440/` and `backgrounds/1920x1080/`: opaque scene backdrops.
- `nodes/<variant>/`: 1024x1024 transparent node sprites. Variants are `default`, `selected`, `active`, `warning`.
- `packets_trails_comets/1024/<variant>/`: 1024x1024 transparent motion sprites. Variants are `default`, `soft`, `active`, `alert`.
- `packets_trails_comets/2048/default/`: optional 2048x2048 default desktop sprites.
- `ambient/<variant>/`: edge beams, overlays, grid, halo, pulse, star and dust layers.
- `live/stellar_gases/`, `live/route_trails/`, and `live/node_events/`: generated cinematic overlays for traffic heat, route afterglow, and RX/TX shockwaves. These are black-background emissive textures intended for additive blending.
- `ui/<variant>/`: reusable glass panel, buttons, badges, dividers, corner frames, microgrid texture.
- `previews/`: non-runtime visual contact/reference sheets.

## Consumption notes

- Use `source-over` for glass panels/buttons/badges.
- Use additive/screen blending for trails, packets, comets, beams, halos, dust, and star drift.
- Backgrounds are safe as full-screen covers. They are not seamless.
- `microgrid_tiling_texture` and `scan_grid_overlay` are power-of-two and tile-friendly.
- `ASSET_INDEX.json` is the canonical manifest for automated loading.
