import type { RadioPreset, TelemetryPoint } from "./types";

// Collapse radio presets (one row per preset+iata+sourceType) into one row per preset, summing
// counts, sorted by descending total. Junk presets (all-zero "0,0,0" from unconfigured radios) are
// dropped so they don't clutter the chart.
export function aggregatePresets(rows: RadioPreset[]): { preset: string; value: number }[] {
  const byPreset = new Map<string, number>();
  for (const r of rows) {
    if (isJunkPreset(r.preset)) continue;
    byPreset.set(r.preset, (byPreset.get(r.preset) ?? 0) + r.count);
  }
  return [...byPreset.entries()]
    .map(([preset, value]) => ({ preset, value }))
    .sort((a, b) => b.value - a.value);
}

function isJunkPreset(preset: string): boolean {
  return preset.split(",").every((n) => Number(n) === 0);
}

// "freqMhz,bwKhz,sf" -> "910.525 · 62.5k · SF7" (freq is MHz by convention); anything that isn't a
// freq,bw,sf triple is shown as-is.
export function formatPreset(preset: string): string {
  const parts = preset.split(",");
  if (parts.length !== 3 || parts.some((p) => p === "" || Number.isNaN(Number(p)))) return preset;
  const [freq, bw, sf] = parts;
  return `${freq} · ${bw}k · SF${sf}`;
}

// True if any point carries at least one meaningful (non-null, non-zero) metric. Bots / MQTT bridges
// report telemetry rows that are all zeros (no real radio hardware); those count as "no telemetry"
// so we show an empty state rather than a wall of flat-zero charts.
export function hasTelemetry(points: TelemetryPoint[]): boolean {
  const live = (v: number | null) => v != null && v !== 0;
  return points.some(
    (p) =>
      live(p.batteryMv) ||
      live(p.airtimeTxPct) ||
      live(p.airtimeRxPct) ||
      live(p.noiseFloorDb) ||
      live(p.uptimeSeconds) ||
      live(p.queueLength) ||
      live(p.receiveErrors),
  );
}
