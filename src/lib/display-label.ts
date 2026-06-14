const EMOJI_SYMBOL_RE = /[\u2600-\u27BF\u{1F000}-\u{1FAFF}]/gu;
const WHITESPACE_RE = /\s+/g;

function stripControlOrBadText(value: string): string {
  let cleaned = "";
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code == null) continue;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0xfffd) continue;
    cleaned += char;
  }
  return cleaned;
}

// The NFKC normalize + 3 regex passes are a pure function of the raw string, but run per-node on
// every full FeatureCollection / coord-map rebuild (and node names repeat heavily across rebuilds).
// Cache the core transform keyed on the RAW input; the per-call `fallback` is applied OUTSIDE the
// cache so the same blank name with different fallbacks (publicKey slice vs nodeId slice vs "") can't
// collide.
const sanitizeCache = new Map<string, string>();
function sanitizeCore(value: string): string {
  let cleaned = sanitizeCache.get(value);
  if (cleaned === undefined) {
    cleaned = stripControlOrBadText(value.normalize("NFKC"))
      .replace(EMOJI_SYMBOL_RE, "")
      .replace(WHITESPACE_RE, " ")
      .trim();
    if (sanitizeCache.size > 5000) sanitizeCache.clear(); // bound; names repeat, so this rarely trips
    sanitizeCache.set(value, cleaned);
  }
  return cleaned;
}

export function sanitizeDisplayLabel(value: string | null | undefined, fallback = "unknown"): string {
  return sanitizeCore(value ?? "") || fallback;
}

export function nullableDisplayLabel(value: string | null | undefined): string | null {
  const cleaned = sanitizeCore(value ?? "");
  return cleaned === "" ? null : cleaned;
}
