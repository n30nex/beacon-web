// BEACON wordmark: beacon icon + "BEACON" text in the active CRT display face.
// `text-primary` on the wrapper drives both the icon (currentColor) and the
// text color, so the whole mark follows the active theme.

import { BeaconLogo } from "./BeaconLogo";

interface BeaconWordmarkProps {
  iconSize?: number;
  textClassName?: string;
  className?: string;
  pulse?: boolean;
}

export function BeaconWordmark({
  iconSize = 22,
  textClassName = "text-base",
  className,
  pulse = false,
}: BeaconWordmarkProps) {
  return (
    <span className={`inline-flex items-center gap-2 text-primary crt-icon whitespace-nowrap ${className ?? ""}`}>
      <BeaconLogo size={iconSize} pulse={pulse} />
      <span
        className={`beacon-wordmark-text font-medium tracking-[0.18em] uppercase leading-none crt-title crt-terminal-cursor ${textClassName}`}
      >
        BEACON
      </span>
    </span>
  );
}
