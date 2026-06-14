const EMOJI_SYMBOL_RE = /[\u2600-\u27BF\u{1F000}-\u{1FAFF}]/gu;
const WHITESPACE_RE = /\s+/g;

function stripControlAndReplacementChars(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0xfffd) continue;
    out += char;
  }
  return out;
}

export function sanitizeDisplayLabel(value: string | null | undefined, fallback = "unknown"): string {
  const cleaned = stripControlAndReplacementChars((value ?? "").normalize("NFKC"))
    .replace(EMOJI_SYMBOL_RE, "")
    .replace(WHITESPACE_RE, " ")
    .trim();
  return cleaned || fallback;
}

export function nullableDisplayLabel(value: string | null | undefined): string | null {
  const cleaned = sanitizeDisplayLabel(value, "");
  return cleaned === "" ? null : cleaned;
}
