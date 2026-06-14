const CONTROL_OR_BAD_TEXT_RE = /[\u0000-\u001F\u007F-\u009F\uFFFD]/g;
const EMOJI_SYMBOL_RE = /[\u2600-\u27BF\u{1F000}-\u{1FAFF}]/gu;
const WHITESPACE_RE = /\s+/g;

export function sanitizeDisplayLabel(value: string | null | undefined, fallback = "unknown"): string {
  const cleaned = (value ?? "")
    .normalize("NFKC")
    .replace(CONTROL_OR_BAD_TEXT_RE, "")
    .replace(EMOJI_SYMBOL_RE, "")
    .replace(WHITESPACE_RE, " ")
    .trim();
  return cleaned || fallback;
}

export function nullableDisplayLabel(value: string | null | undefined): string | null {
  const cleaned = sanitizeDisplayLabel(value, "");
  return cleaned === "" ? null : cleaned;
}
