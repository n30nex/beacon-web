// Observer "eye" glyph. It uses currentColor so the active CRT profile tints every small observer
// asset the same way as map observer pips.
export function ObserverIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true" className={`crt-icon ${className}`}>
      <path d="M2 12C5 6.5 19 6.5 22 12 19 17.5 5 17.5 2 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}
